import {createRemoteJWKSet,jwtVerify} from 'jose';
const firebaseKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export class AuthError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export function authConfig(env){
 const provider=env.AUTH_PROVIDER??'chatgpt';
 if(provider==='chatgpt')return {provider};
 if(provider!=='firebase'||!env.FIREBASE_PROJECT_ID||!env.FIREBASE_API_KEY||!env.FIREBASE_APP_ID)throw new AuthError(503,'authUnavailable');
 return {provider,firebase:{projectId:env.FIREBASE_PROJECT_ID,apiKey:env.FIREBASE_API_KEY,appId:env.FIREBASE_APP_ID,authDomain:env.FIREBASE_PROJECT_ID+'.firebaseapp.com'}};
}
export async function verifyFirebaseToken(token,projectId,keys=firebaseKeys){
 const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:'https://securetoken.google.com/'+projectId,audience:projectId,requiredClaims:['exp','iat','auth_time','sub','aud','iss']});
 const now=Math.floor(Date.now()/1000);
 if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||typeof payload.iat!=='number'||payload.iat>now||typeof payload.auth_time!=='number'||payload.auth_time>now||typeof payload.email!=='string'||!payload.email)throw new AuthError(401,'signIn');
 if(payload.email_verified!==true)throw new AuthError(403,'verifyEmail');
 return {id:'firebase:'+payload.sub,email:payload.email};
}
export async function authenticatedUser(request,env){
 const config=authConfig(env);
 if(config.provider==='chatgpt'){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return id&&email?{id,email}:null;}
 // On the independent host, OpenAI headers are never a source of identity.
 const authorization=request.headers.get('authorization');if(!authorization)return null;
 if(!authorization.startsWith('Bearer ')||authorization.length>12000)throw new AuthError(401,'signIn');
 try{return await verifyFirebaseToken(authorization.slice(7),config.firebase.projectId);}
 catch(error){if(error instanceof AuthError)throw error;if(error?.code?.startsWith('ERR_JWT')||error?.code?.startsWith('ERR_JWS')||error?.code?.startsWith('ERR_JOSE'))throw new AuthError(401,'signIn');throw new AuthError(503,'authUnavailable');}
}
