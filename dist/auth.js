import {t,language} from './i18n.js?v=d9b6390f753f';
let provider='chatgpt',user=null,expiresAt=0,pendingSession=null,changed=()=>{},firebaseDomain='',firebaseApiKey='';
const $=id=>document.getElementById(id);
function notice(key){$('auth-notice').textContent=t(key);$('auth-notice').dataset.key=key;}
async function task(button,action){button.disabled=true;try{await action();}catch(e){notice(e.message||'authUnavailable');}finally{button.disabled=false;}}
async function account(action,data={}){
 let res,value;
 try{res=await fetch('/api/auth/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Common-Ground':'1'},body:JSON.stringify({...data,language}),signal:AbortSignal.timeout(20000)});value=await res.json();}
 catch{throw Error('authUnavailable');}
 if(!res.ok){if(value.error==='signIn'){user=null;expiresAt=0;updateVerification();}throw Error(value.error||'authUnavailable');}
 if(Object.hasOwn(value,'user')){user=value.user;expiresAt=Date.now()+Math.max(60,(value.expiresIn??3600)-300)*1000;updateVerification();}
 return value;
}
function updateVerification(){const unverified=!!user&&!user.emailVerified;$('auth-verify').hidden=!unverified;$('auth-form').hidden=unverified;$('auth-reset').hidden=unverified;if(unverified)notice('verifyEmail');}
async function restore(){
 if(pendingSession)return pendingSession;
 pendingSession=account('session').catch(e=>{if(e.message==='signIn'){user=null;expiresAt=0;updateVerification();return;}throw e;}).finally(()=>pendingSession=null);
 return pendingSession;
}
export function authProvider(){return provider;}
export async function authHeaders(){if(provider==='firebase'&&user&&Date.now()>=expiresAt)await restore();return {};}
function emailAction(value){
 let mode=$('email-action-mode').value,code=value.trim();
 if(code.startsWith('https://')){
  let url;try{url=new URL(code);}catch{throw Error('emailLinkInvalid');}
  if(![firebaseDomain,location.host].includes(url.host)||url.username||url.password)throw Error('emailLinkInvalid');
  const apiKey=url.searchParams.get('apiKey');if(apiKey&&apiKey!==firebaseApiKey)throw Error('emailLinkInvalid');
  mode=url.searchParams.get('mode');code=url.searchParams.get('oobCode')??'';
 }
 if(!['verifyEmail','resetPassword'].includes(mode)||!/^[-A-Za-z0-9_]{8,2048}$/.test(code))throw Error('emailLinkInvalid');
 return {mode,code};
}
function actionMode(){
 try{$('email-action-mode').value=emailAction($('email-action-link').value).mode;}catch{}
 const reset=$('email-action-mode').value==='resetPassword';$('email-action-password-wrap').hidden=!reset;$('email-action-password').required=reset;
}
export async function initAuth(onChange){
 changed=onChange;const response=await fetch('/api/auth-config',{cache:'no-store'});if(!response.ok)throw Error('authUnavailable');const config=await response.json();provider=config.provider;
 if(provider!=='firebase')return;
 firebaseDomain=config.firebase.authDomain;firebaseApiKey=config.firebase.apiKey;
 // Credentials stay in Secure, HttpOnly cookies. Browsers contact only DrFrog;
 // Cloudflare performs the fixed Firebase REST operations.
 $('auth-form').onsubmit=e=>{e.preventDefault();task($('email-signin'),async()=>{await account('sign-in',{email:$('auth-email').value.trim(),password:$('auth-password').value});$('auth-password').value='';if(user.emailVerified)$('auth-dialog').close();await changed();});};
 $('email-signup').onclick=()=>{if(!$('auth-form').reportValidity())return;task($('email-signup'),async()=>{await account('sign-up',{email:$('auth-email').value.trim(),password:$('auth-password').value});$('auth-password').value='';await account('send-verification');notice('verificationSent');});};
 $('auth-reset').onclick=()=>{const email=$('auth-email');if(!email.value||!email.reportValidity())return;task($('auth-reset'),async()=>{await account('send-reset',{email:email.value.trim()});notice('resetSent');});};
 $('resend-verification').onclick=()=>task($('resend-verification'),async()=>{await account('send-verification');notice('verificationSent');});
 $('check-verification').onclick=()=>task($('check-verification'),async()=>{await restore();if(!user){notice('signIn');return;}if(!user.emailVerified){notice('verifyEmail');return;}$('auth-dialog').close();await changed();});
 $('verification-signout').onclick=()=>task($('verification-signout'),async()=>{await account('sign-out');notice('emailAuthIntro');await changed();});
 document.querySelectorAll('.sign-in').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();openAuth();}));
 $('sign-out').addEventListener('click',e=>{e.preventDefault();task($('sign-out'),async()=>{await account('sign-out');await changed();});});
 $('email-action-mode').onchange=()=>{const reset=$('email-action-mode').value==='resetPassword';$('email-action-password-wrap').hidden=!reset;$('email-action-password').required=reset;};
 $('email-action-link').addEventListener('input',actionMode);
 $('email-action-form').onsubmit=e=>{e.preventDefault();task($('apply-email-link'),async()=>{
  const {mode,code}=emailAction($('email-action-link').value);
  if(mode==='resetPassword'){
   await account('reset-password',{code,password:$('email-action-password').value});$('email-action-password').value='';user=null;updateVerification();notice('passwordResetDone');await changed();
  }else{
   await account('verify-email',{code});await restore();notice(user?.emailVerified?'emailVerifiedDone':'emailVerifiedSignin');if(user?.emailVerified){$('auth-dialog').close();await changed();}
  }
  $('email-action-link').value='';$('email-link-help').open=false;
 });};
 document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',refreshAuthLabels));
 refreshAuthLabels();
 const url=new URL(location.href),mode=url.searchParams.get('mode');
 if(['verifyEmail','resetPassword'].includes(mode)&&url.searchParams.has('oobCode')){
  $('email-action-link').value=url.href;$('email-action-mode').value=mode;$('email-link-help').open=true;actionMode();
  history.replaceState(null,'',location.pathname);openAuth();notice('emailLinkReady');
 }
 await restore();
}
export function refreshAuthLabels(){if(provider!=='firebase')return;document.querySelectorAll('.sign-in').forEach(link=>{link.textContent=t('emailSignin');link.href='#signin';link.removeAttribute('target');});$('sign-out').href='#signout';$('sign-out').removeAttribute('target');const welcome=document.querySelector('[data-i18n="welcomeText"]');if(welcome)welcome.textContent=t('emailWelcome');if($('auth-notice').dataset.key)$('auth-notice').textContent=t($('auth-notice').dataset.key);}
export function openAuth(){if(provider!=='firebase')return;updateVerification();if(!user)notice('emailAuthIntro');if(!$('auth-dialog').open)$('auth-dialog').showModal();}
