import {AuthError, authConfig, cookie, ID_COOKIE, REFRESH_COOKIE} from './auth.mjs';

const actions=new Set(['sign-in','sign-up','session','sign-out','send-verification','send-reset','verify-email','reset-password']);
const invalidSession=new Set(['INVALID_ID_TOKEN','TOKEN_EXPIRED','USER_DISABLED','USER_NOT_FOUND','INVALID_REFRESH_TOKEN']);
const errorKeys={INVALID_LOGIN_CREDENTIALS:'invalidCredentials',INVALID_PASSWORD:'invalidCredentials',EMAIL_NOT_FOUND:'invalidCredentials',EMAIL_EXISTS:'emailInUse',INVALID_EMAIL:'invalidInput',WEAK_PASSWORD:'weakPassword',TOO_MANY_ATTEMPTS_TRY_LATER:'tooFast',INVALID_OOB_CODE:'emailLinkInvalid',EXPIRED_OOB_CODE:'emailLinkInvalid'};
const readyDatabases=new WeakMap();
async function ensureRateTable(db){
 let ready=readyDatabases.get(db);
 if(!ready){
  // Additive, fixed schema bootstrap through the app's existing D1 binding.
  // Also works when the hosting account's management API cannot apply DDL.
  ready=(async()=>{
   await db.prepare('CREATE TABLE IF NOT EXISTS auth_limits (bucket TEXT PRIMARY KEY NOT NULL,hits INTEGER NOT NULL DEFAULT 1,expires INTEGER NOT NULL)').run();
   await db.prepare('CREATE INDEX IF NOT EXISTS auth_limits_expires ON auth_limits(expires)').run();
  })().catch(error=>{readyDatabases.delete(db);throw error;});
  readyDatabases.set(db,ready);
 }
 await ready;
}

function field(value,min,max){if(typeof value!=='string'||value.length<min||value.length>max)throw new AuthError(400,'invalidInput');return value;}
function email(value){const s=field(value,3,254).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new AuthError(400,'invalidInput');return s;}
function cookieHeader(name,value,maxAge){return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;}
function response(data,status=200,tokens=null,clear=false){
 const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 if(tokens){
  headers.append('Set-Cookie',cookieHeader(ID_COOKIE,tokens.idToken,Math.min(Number(tokens.expiresIn)||3600,3600)));
  headers.append('Set-Cookie',cookieHeader(REFRESH_COOKIE,tokens.refreshToken,30*24*60*60));
 }
 if(clear){headers.append('Set-Cookie',cookieHeader(ID_COOKIE,'',0));headers.append('Set-Cookie',cookieHeader(REFRESH_COOKIE,'',0));}
 return Response.json(data,{status,headers});
}

// Only these fixed Firebase operations are reachable. No client-supplied URL,
// arbitrary provider payload, password storage, or credential logging.
async function firebase(env,operation,payload,locale='en',fetcher=fetch){
 const refresh=operation==='token';
 const url=refresh?'https://securetoken.googleapis.com/v1/token':'https://identitytoolkit.googleapis.com/v1/accounts:'+operation;
 let res;
 try{res=await fetcher(url+'?key='+encodeURIComponent(env.FIREBASE_API_KEY),{method:'POST',headers:{'Content-Type':refresh?'application/x-www-form-urlencoded':'application/json','X-Firebase-Locale':locale==='zh'?'zh-CN':'en'},body:refresh?new URLSearchParams(payload).toString():JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});}
 catch{throw new AuthError(503,'authUnavailable');}
 let data;try{data=await res.json();}catch{throw new AuthError(503,'authUnavailable');}
 if(!res.ok){
  const code=String(data.error?.message??'').split(/[ :]/)[0];
  const error=new AuthError(invalidSession.has(code)?401:res.status===429?429:400,errorKeys[code]??(invalidSession.has(code)?'signIn':'authUnavailable'));
  error.firebaseCode=code;throw error;
 }
 return data;
}
async function userForToken(env,idToken,fetcher){
 const result=await firebase(env,'lookup',{idToken},'en',fetcher),user=result.users?.[0];
 if(!user?.localId||!user.email||user.disabled)throw new AuthError(401,'signIn');
 return {id:'firebase:'+user.localId,email:user.email,emailVerified:user.emailVerified===true};
}
async function refreshed(env,refreshToken,fetcher){
 const result=await firebase(env,'token',{grant_type:'refresh_token',refresh_token:refreshToken},'en',fetcher);
 if(!result.id_token||!result.refresh_token)throw new AuthError(503,'authUnavailable');
 return {idToken:result.id_token,refreshToken:result.refresh_token,expiresIn:result.expires_in};
}
async function rateLimit(request,env,action){
 await ensureRateTable(env.DB);
 const now=Date.now(),window=15*60*1000,start=Math.floor(now/window)*window;
 // CF-Connecting-IP is supplied by Cloudflare, never taken from the request body.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.FIREBASE_PROJECT_ID+':'+start+':'+(request.headers.get('CF-Connecting-IP')??'local')));
 const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const session=action==='session',bucket=(session?'session:':'account:')+key;
 await env.DB.prepare('DELETE FROM auth_limits WHERE expires<?').bind(now).run();
 const row=await env.DB.prepare('INSERT INTO auth_limits(bucket,hits,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=auth_limits.hits+1 RETURNING hits').bind(bucket,start+window).first();
 if(row.hits>(session?120:30))throw new AuthError(429,'authTooFast');
}

export async function handleAuth(request,env,input,fetcher=fetch){
 const action=new URL(request.url).pathname.slice('/api/auth/'.length);
 if(!actions.has(action))throw new AuthError(404,'notFound');
 if(authConfig(env).provider!=='firebase')throw new AuthError(404,'notFound');
 if(action==='sign-out')return response({user:null},200,null,true);
 const refreshToken=cookie(request,REFRESH_COOKIE);
 if(action==='session'&&!refreshToken)return response({user:null});
 await rateLimit(request,env,action);
 try{
  if(action==='sign-in'||action==='sign-up'){
   const tokens=await firebase(env,action==='sign-in'?'signInWithPassword':'signUp',{email:email(input.email),password:field(input.password,action==='sign-up'?8:1,128),returnSecureToken:true},input.language,fetcher);
   if(!tokens.idToken||!tokens.refreshToken)throw new AuthError(503,'authUnavailable');
   const user=await userForToken(env,tokens.idToken,fetcher);
   return response({user,expiresIn:Number(tokens.expiresIn)||3600},200,tokens);
  }
  if(action==='session'){
   const tokens=await refreshed(env,refreshToken,fetcher),user=await userForToken(env,tokens.idToken,fetcher);
   return response({user,expiresIn:Number(tokens.expiresIn)||3600},200,tokens);
  }
  if(action==='send-verification'){
   if(!refreshToken)throw new AuthError(401,'signIn');
   const tokens=await refreshed(env,refreshToken,fetcher);
   await firebase(env,'sendOobCode',{requestType:'VERIFY_EMAIL',idToken:tokens.idToken},input.language,fetcher);
   return response({ok:true},200,tokens);
  }
  if(action==='send-reset'){
   try{await firebase(env,'sendOobCode',{requestType:'PASSWORD_RESET',email:email(input.email)},input.language,fetcher);}
   catch(e){if(e.firebaseCode!=='EMAIL_NOT_FOUND')throw e;}
   return response({ok:true});
  }
  const oobCode=field(input.code,8,2048);
  if(!/^[A-Za-z0-9_-]+$/.test(oobCode))throw new AuthError(400,'emailLinkInvalid');
  if(action==='reset-password'){
   await firebase(env,'resetPassword',{oobCode,newPassword:field(input.password,8,128)},input.language,fetcher);
   return response({ok:true},200,null,true);
  }
  const result=await firebase(env,'update',{oobCode},input.language,fetcher);
  if(result.emailVerified!==true)throw new AuthError(400,'emailLinkInvalid');
  // Refresh this browser's own session; applying another user's link never
  // signs that user in or changes the current browser's account identity.
  return response({ok:true});
 }catch(error){
  if(error instanceof AuthError&&invalidSession.has(error.firebaseCode))return response({error:'signIn'},401,null,true);
  throw error;
 }
}
