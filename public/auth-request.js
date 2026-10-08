const actions={'sign-up':'SU','sign-in':'SI','send-verification':'SV','send-reset':'SR','verify-email':'VE','reset-password':'RP',session:'SE','sign-out':'SO'};
const errors=new Set(['invalidCredentials','emailInUse','invalidInput','weakPassword','tooFast','authTooFast','emailLinkInvalid','emailDeliveryLimited','signIn','verifyEmail','notFound','badOrigin','tooLarge','authUnavailable','accountCreatedSignin']);
const reasons={clientNetwork:'NETWORK',clientTimeout:'TIMEOUT',clientResponse:'RESPONSE',browserUnsupported:'BROWSER',providerNetwork:'PROVIDER-NETWORK',providerRedirectRejected:'PROVIDER-REDIRECT',providerInvalidResponse:'PROVIDER-RESPONSE',providerRejected:'PROVIDER-REQUEST',signupSessionIncomplete:'SESSION'};
const referencePattern=/^CG-(SU|SI|SV|SR|VE|RP|SE|SO)-(NETWORK|TIMEOUT|RESPONSE|BROWSER|PROVIDER-NETWORK|PROVIDER-REDIRECT|PROVIDER-RESPONSE|PROVIDER-REQUEST|SESSION|SERVER)$/;
function failure(key,action,reason){const error=new Error(key);error.reference='CG-'+actions[action]+'-'+(typeof reason==='string'&&Object.prototype.hasOwnProperty.call(reasons,reason)?reasons[reason]:'SERVER');return error;}
export function safeAuthReference(value){return typeof value==='string'&&value===value.trim()&&referencePattern.test(value)?value:'';}
function validUser(value,action){
 if(!['sign-in','sign-up','session'].includes(action))return true;
 if(!Object.prototype.hasOwnProperty.call(value,'user'))return false;
 const user=value.user;
 return user===null?action==='session':!!user&&typeof user==='object'&&typeof user.id==='string'&&typeof user.email==='string'&&typeof user.emailVerified==='boolean';
}
// Use AbortController rather than the newer AbortSignal.timeout browser API.
// Keep one request per user action: a timed-out registration may have succeeded.
export async function authRequest(action,data,language,options={}){
 if(!Object.prototype.hasOwnProperty.call(actions,action))throw new Error('invalidInput');
 const Controller=Object.prototype.hasOwnProperty.call(options,'Controller')?options.Controller:globalThis.AbortController;
 let controller;try{controller=new Controller();}catch{throw failure('authBrowserUnsupported',action,'browserUnsupported');}
 const fetcher=options.fetcher??((url,init)=>globalThis.fetch(url,init)),setTimer=options.setTimer??globalThis.setTimeout,clearTimer=options.clearTimer??globalThis.clearTimeout;
 let res,value,timedOut=false,receiving=false;
 const timer=setTimer(()=>{timedOut=true;controller.abort();},action==='session'&&data.verificationCheck===true?65000:35000);
 try{
  res=await fetcher('/api/auth/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Common-Ground':'1'},body:JSON.stringify({...data,language}),signal:controller.signal});
  receiving=true;value=await res.json();
 }catch{
  throw failure(action==='sign-up'?'registrationUnconfirmed':receiving&&!timedOut?'authResponseProblem':'authConnectionProblem',action,timedOut?'clientTimeout':receiving?'clientResponse':'clientNetwork');
 }finally{clearTimer(timer);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure(action==='sign-up'?'registrationUnconfirmed':'authResponseProblem',action,'clientResponse');
 if(!res.ok){let key=errors.has(value.error)?value.error:'authUnavailable';const reason=value.diagnostic?.reason;if(action==='sign-up'&&key==='authUnavailable'&&['providerNetwork','providerInvalidResponse'].includes(reason))key='registrationUnconfirmed';throw failure(key,action,reason);}
 if(!validUser(value,action))throw failure(action==='sign-up'?'registrationUnconfirmed':'authResponseProblem',action,'clientResponse');
 return value;
}
export async function registrationVerification(send){
 try{return await send();}catch(cause){const error=new Error(cause?.message==='signIn'?'accountCreatedSignin':'accountCreatedVerificationProblem');error.reference=safeAuthReference(cause?.reference);throw error;}
}
