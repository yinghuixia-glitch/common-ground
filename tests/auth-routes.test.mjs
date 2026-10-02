import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuth} from '../src/auth-routes.mjs';
import {cookie,ID_COOKIE,REFRESH_COOKIE,authenticatedUser} from '../src/auth.mjs';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://drfrog.example';
const config={AUTH_PROVIDER:'firebase',FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-key',FIREBASE_APP_ID:'test-app'};
const req=(action,cookies='',extra={})=>new Request(origin+'/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1',Cookie:cookies,...extra},body:'{}'});
function harness(t){const DB=localDatabase();t.after(()=>DB.close());return {...config,DB};}
function upstream(verified=false){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,payload:options.headers['Content-Type']==='application/json'?JSON.parse(options.body):Object.fromEntries(new URLSearchParams(options.body))});
  assert.equal(new URL(url).searchParams.get('key'),'public-key');assert.equal(options.redirect,'manual');
  const path=new URL(url).pathname;
  if(path.endsWith(':signUp')||path.endsWith(':signInWithPassword'))return Response.json({idToken:'id-token',refreshToken:'refresh-token',expiresIn:'3600'});
  if(path==='/v1/token')return Response.json({id_token:'refreshed-token',refresh_token:'refresh-token',expires_in:'3600'});
  if(path.endsWith(':lookup'))return Response.json({users:[{localId:'member',email:'member@example.test',emailVerified:verified}]});
  if(path.endsWith(':update'))return Response.json({emailVerified:true});
  return Response.json({email:'member@example.test'});
 };
 return {fetcher,calls};
}
function sequencedUpstream(steps){
 const calls=[];
 const fetcher=async(url,options)=>{
  const payload=options.headers['Content-Type']==='application/json'?JSON.parse(options.body):Object.fromEntries(new URLSearchParams(options.body));
  const operation=new URL(url).pathname.split(':').at(-1),step=steps[calls.length];
  calls.push({operation,payload});assert.ok(step,'Unexpected provider call');assert.equal(operation,step.operation);
  if(step.payload)assert.deepEqual(payload,step.payload);
  return Response.json(step.data,{status:step.status??200});
 };
 return {fetcher,calls};
}
test('registration uses fixed Firebase endpoints and keeps tokens only in secure host-only cookies',async t=>{
 const env=harness(t),mock=upstream();const res=await handleAuth(req('sign-up'),env,{email:'member@example.test',password:'test-password-123',language:'zh',url:'https://attacker.invalid'},mock.fetcher);
 const data=await res.json();assert.equal(data.user.emailVerified,false);assert.equal(data.user.id,'firebase:member');assert.equal(data.idToken,undefined);assert.equal(data.refreshToken,undefined);
 for(const value of res.headers.getSetCookie()){assert.match(value,/^__Host-drfrog-/);assert.match(value,/HttpOnly; Secure; SameSite=Lax/);assert.match(value,/Path=\//);assert.doesNotMatch(value,/Domain=/);}
 assert.equal(res.headers.get('cache-control'),'no-store');assert.ok(mock.calls.every(c=>new URL(c.url).hostname==='identitytoolkit.googleapis.com'));assert.equal(mock.calls[0].payload.url,undefined);
 assert.equal(mock.calls[0].payload.password,'test-password-123');assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n,0);
});
test('the first account request can bootstrap only the new counter table without changing existing profiles',async t=>{
 const env=harness(t),mock=upstream();
 await env.DB.prepare('DROP TABLE auth_limits').run();
 await env.DB.prepare('INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?)').bind('existing','Existing test member','neurotypical','Student','','en','test',1).run();
 await handleAuth(req('verify-email'),env,{code:'test_code_123'},mock.fetcher);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_limits').first()).n,1);
 assert.equal((await env.DB.prepare('SELECT name FROM profiles WHERE id=?').bind('existing').first()).name,'Existing test member');
 await handleAuth(req('verify-email'),env,{code:'test_code_123'},mock.fetcher);
 assert.equal((await env.DB.prepare('SELECT hits FROM auth_limits').first()).hits,2);
});
test('cookie parsing rejects ambiguity and a forged cookie cannot authenticate',async()=>{
 assert.equal(cookie(req('session',ID_COOKIE+'=one; '+ID_COOKIE+'=two'),ID_COOKIE),null);assert.equal(cookie(req('session',ID_COOKIE+'=%zz'),ID_COOKIE),null);
 await assert.rejects(()=>authenticatedUser(req('session',ID_COOKIE+'=forged'),config),e=>e.status===401);
});
test('the default provider transport preserves the Worker native fetch receiver',async t=>{
 const env=harness(t),original=globalThis.fetch,mock=upstream();
 globalThis.fetch=async function(...args){assert.equal(this,globalThis);return mock.fetcher(...args);};
 try{const res=await handleAuth(req('sign-in'),env,{email:'member@example.test',password:'test-password-123'});assert.equal((await res.json()).user.id,'firebase:member');}
 finally{globalThis.fetch=original;}
});
test('a provider redirect fails closed without forwarding credentials to its target',async t=>{
 const env=harness(t);let calls=0;
 await assert.rejects(()=>handleAuth(req('sign-in'),env,{email:'member@example.test',password:'test-password-123'},async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');assert.equal(new URL(url).hostname,'identitytoolkit.googleapis.com');
  return new Response(null,{status:307,headers:{Location:'https://attacker.invalid'}});
 }),e=>e.status===503&&e.diagnostic.reason==='providerRedirectRejected');
 assert.equal(calls,1);
});
test('session refresh preserves the existing Firebase identity and clears revoked sessions',async t=>{
 const env=harness(t),mock=upstream(true);
 const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{},mock.fetcher);assert.equal((await res.json()).user.id,'firebase:member');assert.equal(mock.calls[0].payload.grant_type,'refresh_token');
 const invalid=await handleAuth(req('session',REFRESH_COOKIE+'=revoked'),env,{},async()=>Response.json({error:{message:'INVALID_REFRESH_TOKEN'}},{status:400}));assert.equal(invalid.status,401);assert.ok(invalid.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 const anonymous=await handleAuth(req('session'),env,{},mock.fetcher);assert.equal((await anonymous.json()).user,null);
});

test('verification check replaces a pre-verification token only after an authoritative verified lookup',async t=>{
 const env=harness(t),mock=sequencedUpstream([
  {operation:'/v1/token',payload:{grant_type:'refresh_token',refresh_token:'old-refresh'},data:{id_token:'minted-before-verification',refresh_token:'first-rotated-refresh',expires_in:'3600'}},
  // Verification is now visible to lookup, although the previously minted
  // token still carries its earlier unverified state.
  {operation:'lookup',payload:{idToken:'minted-before-verification'},data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
  {operation:'/v1/token',payload:{grant_type:'refresh_token',refresh_token:'first-rotated-refresh'},data:{id_token:'minted-after-verification',refresh_token:'confirmed-refresh',expires_in:'3599'}},
  {operation:'lookup',payload:{idToken:'minted-after-verification'},data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
 ]);
 const res=await handleAuth(req('session',REFRESH_COOKIE+'=old-refresh'),env,{verificationCheck:true},mock.fetcher),data=await res.json();
 assert.equal(res.status,200);assert.deepEqual(data,{user:{id:'firebase:member',email:'member@example.test',emailVerified:true},expiresIn:3599});
 assert.deepEqual(mock.calls.map(call=>call.operation),['/v1/token','lookup','/v1/token','lookup']);
 assert.match(res.headers.getSetCookie()[0],/minted-after-verification/);assert.match(res.headers.getSetCookie()[1],/confirmed-refresh/);
 assert.ok(res.headers.getSetCookie().every(value=>!value.includes('minted-before-verification')));assert.equal(data.idToken,undefined);
});

test('an unverified authoritative lookup cannot be overridden and does not trigger another refresh',async t=>{
 const env=harness(t),mock=upstream(false);
 const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck:true,emailVerified:true,user:{emailVerified:true}},mock.fetcher);
 assert.equal(res.status,200);assert.equal((await res.json()).user.emailVerified,false);assert.equal(mock.calls.length,2);
 assert.deepEqual(mock.calls[1].payload,{idToken:'refreshed-token'});
});

test('ordinary session refresh stays single-pass and verificationCheck only accepts booleans',async t=>{
 const env=harness(t);
 for(const input of [{},{verificationCheck:false}]){
  const mock=upstream(true),res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,input,mock.fetcher);
  assert.equal((await res.json()).user.emailVerified,true);assert.equal(mock.calls.length,2);
 }
 for(const verificationCheck of ['true',1,null,{},[]]){
  await assert.rejects(()=>handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck},()=>{throw Error('Must not fetch');}),e=>e.status===400&&e.code==='invalidInput');
 }
 const anonymous=await handleAuth(req('session'),env,{verificationCheck:true},()=>{throw Error('Must not fetch');});
 assert.deepEqual(await anonymous.json(),{user:null});assert.equal(anonymous.headers.getSetCookie().length,0);
});

test('verification confirmation fails closed if the refreshed account or email changes',async t=>{
 const env=harness(t);
 for(const changed of [{localId:'other-member',email:'member@example.test'},{localId:'member',email:'other@example.test'}]){
  const mock=sequencedUpstream([
   {operation:'/v1/token',data:{id_token:'first-token',refresh_token:'first-refresh',expires_in:'3600'}},
   {operation:'lookup',data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
   {operation:'/v1/token',data:{id_token:'changed-token',refresh_token:'changed-refresh',expires_in:'3600'}},
   {operation:'lookup',data:{users:[{...changed,emailVerified:true}]}},
  ]);
  const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck:true},mock.fetcher);
  assert.equal(res.status,401);assert.deepEqual(await res.json(),{error:'signIn'});assert.equal(mock.calls.length,4);
  assert.equal(res.headers.getSetCookie().length,2);assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
  assert.ok(res.headers.getSetCookie().every(value=>!value.includes('changed-token')&&!value.includes('changed-refresh')));
 }
});

test('verification confirmation fails closed if verification is withdrawn between lookup and fresh token',async t=>{
 const env=harness(t),mock=sequencedUpstream([
  {operation:'/v1/token',data:{id_token:'first-token',refresh_token:'first-refresh',expires_in:'3600'}},
  {operation:'lookup',data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
  {operation:'/v1/token',data:{id_token:'unverified-token',refresh_token:'latest-refresh',expires_in:'3600'}},
  {operation:'lookup',data:{users:[{localId:'member',email:'member@example.test',emailVerified:false}]}},
 ]);
 const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck:true},mock.fetcher);
 assert.equal(res.status,403);assert.deepEqual(await res.json(),{error:'verifyEmail'});assert.equal(mock.calls.length,4);
 assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
});

test('revocation during the additional verification refresh clears both cookies without publishing a verified user',async t=>{
 const env=harness(t),mock=sequencedUpstream([
  {operation:'/v1/token',data:{id_token:'first-token',refresh_token:'first-refresh',expires_in:'3600'}},
  {operation:'lookup',data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
  {operation:'/v1/token',data:{error:{message:'INVALID_REFRESH_TOKEN'}},status:400},
 ]);
 const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck:true},mock.fetcher);
 assert.equal(res.status,401);assert.deepEqual(await res.json(),{error:'signIn'});assert.equal(mock.calls.length,3);
 assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
});

test('disabled or removed accounts in the confirmation lookup cannot retain verified session cookies',async t=>{
 const env=harness(t);
 for(const users of [[],[{localId:'member',email:'member@example.test',emailVerified:true,disabled:true}]]){
  const mock=sequencedUpstream([
   {operation:'/v1/token',data:{id_token:'first-token',refresh_token:'first-refresh',expires_in:'3600'}},
   {operation:'lookup',data:{users:[{localId:'member',email:'member@example.test',emailVerified:true}]}},
   {operation:'/v1/token',data:{id_token:'second-token',refresh_token:'second-refresh',expires_in:'3600'}},
   {operation:'lookup',data:{users}},
  ]);
  const res=await handleAuth(req('session',REFRESH_COOKIE+'=refresh-token'),env,{verificationCheck:true},mock.fetcher);
  assert.equal(res.status,401);assert.deepEqual(await res.json(),{error:'signIn'});assert.equal(mock.calls.length,4);
  assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
 }
});

test('provider email delivery quotas are distinguished from sign-in throttling without exposing credentials',async t=>{
 const env=harness(t);
 for(const action of ['send-verification','send-reset'])for(const code of ['QUOTA_EXCEEDED','TOO_MANY_ATTEMPTS_TRY_LATER']){
  const mock=async(url)=>new URL(url).pathname==='/v1/token'?Response.json({id_token:'refreshed-token',refresh_token:'refresh-token',expires_in:'3600'}):Response.json({error:{message:code+' : delivery details'}},{status:400});
  await assert.rejects(()=>handleAuth(req(action,REFRESH_COOKIE+'=refresh-token'),env,{email:'member@example.test'},mock),e=>e.status===429&&e.code==='emailDeliveryLimited'&&e.message==='emailDeliveryLimited');
 }
 await assert.rejects(()=>handleAuth(req('sign-in'),env,{email:'member@example.test',password:'test-password-123'},async()=>Response.json({error:{message:'TOO_MANY_ATTEMPTS_TRY_LATER'}},{status:400})),e=>e.code==='tooFast');
});
test('verification sends email for the current session and applies pasted codes without signing another account in',async t=>{
 const env=harness(t),mock=upstream();
 await handleAuth(req('send-verification',REFRESH_COOKIE+'=refresh-token'),env,{language:'zh'},mock.fetcher);assert.equal(mock.calls.at(-1).payload.requestType,'VERIFY_EMAIL');
 const res=await handleAuth(req('verify-email'),env,{code:'valid_test_code_123',email:'attacker@example.test'},mock.fetcher);assert.equal((await res.json()).ok,true);assert.equal(res.headers.getSetCookie().length,0);assert.deepEqual(mock.calls.at(-1).payload,{oobCode:'valid_test_code_123'});
 await assert.rejects(()=>handleAuth(req('verify-email'),env,{code:'https://attacker.invalid'},mock.fetcher),e=>e.code==='emailLinkInvalid');
});
test('password recovery does not reveal missing accounts and requires a valid code plus strong password',async t=>{
 const env=harness(t);
 const missing=await handleAuth(req('send-reset'),env,{email:'unknown@example.test'},async()=>Response.json({error:{message:'EMAIL_NOT_FOUND'}},{status:400}));assert.equal((await missing.json()).ok,true);
 const mock=upstream();await assert.rejects(()=>handleAuth(req('reset-password'),env,{code:'test_code_123',password:'short'},mock.fetcher),e=>e.code==='invalidInput');
 const reset=await handleAuth(req('reset-password'),env,{code:'test_code_123',password:'new-password-123'},mock.fetcher);assert.equal((await reset.json()).ok,true);assert.ok(reset.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));assert.deepEqual(mock.calls.at(-1).payload,{oobCode:'test_code_123',newPassword:'new-password-123'});
});
test('account endpoints reject cross-origin writes, arbitrary methods, and oversized input before provider calls',async t=>{
 const env=harness(t);
 for(const extra of [{Origin:'https://attacker.example'},{'X-Common-Ground':''}])assert.equal((await handleApi(req('sign-in','',extra),env)).status,403);
 assert.equal((await handleApi(new Request(origin+'/api/auth/session'),env)).status,405);
 assert.equal((await handleApi(req('sign-in','',{'Content-Length':'20000'}),env)).status,413);
 await assert.rejects(()=>handleAuth(req('arbitrary-proxy'),env,{},()=>{throw Error('Must not fetch');}),e=>e.status===404);
});
test('persistent account limits stop bursts and upstream failures fail closed without echoing credentials',async t=>{
 const env=harness(t),mock=upstream();
 for(let i=0;i<30;i++)await handleAuth(req('verify-email'),env,{code:'test_code_123'},mock.fetcher);
 await assert.rejects(()=>handleAuth(req('verify-email'),env,{code:'test_code_123'},mock.fetcher),e=>e.status===429&&e.code==='authTooFast');
 const other=req('sign-in','',{'CF-Connecting-IP':'192.0.2.9'});
 await assert.rejects(()=>handleAuth(other,env,{email:'member@example.test',password:'a-valid-password'},async()=>{throw Error('network details and password');}),e=>e.status===503&&e.message==='authUnavailable');
});
