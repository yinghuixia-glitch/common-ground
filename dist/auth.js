import {t,language} from './i18n.js?v=d15eb85b2d2d';
let provider='chatgpt',user=null,expiresAt=0,pendingSession=null,changed=()=>{},firebaseDomain='',firebaseApiKey='',accountQueue=Promise.resolve(),busy=false,forcedVerification=false,nextVerificationSend=0,lastVerificationCheck=0;
const $=id=>document.getElementById(id);
function notice(key){$('auth-notice').textContent=t(key);$('auth-notice').dataset.key=key;}
function refreshSendButton(){const button=$('resend-verification'),remaining=Math.max(0,Math.ceil((nextVerificationSend-Date.now())/1000));button.disabled=busy||remaining>0;button.textContent=remaining?t('resendCountdown').replace('{seconds}',remaining):t('resendVerification');}
async function task(button,action){if(busy||button.disabled)return;busy=true;const controls=[...$('auth-dialog').querySelectorAll('button')],disabled=controls.map(control=>control.disabled);for(const control of controls)control.disabled=true;button.disabled=true;$('auth-dialog').setAttribute('aria-busy','true');try{await action();}catch(e){notice(e.message||'authUnavailable');}finally{busy=false;controls.forEach((control,index)=>control.disabled=disabled[index]);button.disabled=false;$('auth-dialog').removeAttribute('aria-busy');refreshSendButton();}}
function account(action,data={}){const result=accountQueue.then(()=>requestAccount(action,data));accountQueue=result.catch(()=>{});return result;}
async function requestAccount(action,data){
 let res,value;
 try{res=await fetch('/api/auth/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Common-Ground':'1'},body:JSON.stringify({...data,language}),signal:AbortSignal.timeout(action==='session'&&data.verificationCheck===true?65000:35000)});value=await res.json();}
 catch{throw Error('authUnavailable');}
 if(!res.ok){if(value.error==='signIn'||value.error==='verifyEmail'){user=null;expiresAt=0;forcedVerification=false;updateVerification();}throw Error(value.error||'authUnavailable');}
 if(Object.hasOwn(value,'user')){user=value.user;expiresAt=Date.now()+Math.max(60,(value.expiresIn??3600)-300)*1000;updateVerification();}
 return value;
}
function updateVerification(){const unverified=!!user&&(!user.emailVerified||forcedVerification);$('auth-verify').hidden=!unverified;$('auth-form').hidden=unverified;$('auth-reset').hidden=unverified;$('verification-email').textContent=user?.email??'';if(unverified)notice(forcedVerification&&user.emailVerified?'verificationNotSynced':'verifyEmail');refreshSendButton();}
function restore(verificationCheck=false){
 if(pendingSession){if(!verificationCheck||pendingSession.checking)return pendingSession.promise;return pendingSession.promise.then(()=>restore(true));}
 const session={checking:verificationCheck};session.promise=account('session',verificationCheck?{verificationCheck:true}:{}).catch(e=>{if(e.message==='signIn'){user=null;expiresAt=0;forcedVerification=false;updateVerification();return;}throw e;}).finally(()=>{if(pendingSession===session)pendingSession=null;});pendingSession=session;return session.promise;
}
export function authProvider(){return provider;}
export async function authHeaders(){if(provider==='firebase'&&user&&Date.now()>=expiresAt)await restore();return {};}
export async function recheckVerification(){if(provider!=='firebase')return false;lastVerificationCheck=Date.now();await restore(true);return user?.emailVerified===true;}
async function checkVerification(){notice('checkingVerification');if(!await recheckVerification()){notice(user?'verificationStillPending':'signIn');return;}forcedVerification=false;updateVerification();$('auth-dialog').close();await changed();}
async function sendVerification(){await account('send-verification');nextVerificationSend=Date.now()+60000;refreshSendButton();notice('verificationSent');}
function emailAction(value){
 let mode=$('email-action-mode').value,code=value.trim().replace(/&amp;/g,'&');
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
 changed=onChange;const actionUrl=new URL(location.href),incomingMode=actionUrl.searchParams.get('mode'),incomingAction=['verifyEmail','resetPassword'].includes(incomingMode)&&actionUrl.searchParams.has('oobCode');if(incomingAction)history.replaceState(null,'',location.pathname);const response=await fetch('/api/auth-config',{cache:'no-store'});if(!response.ok)throw Error('authUnavailable');const config=await response.json();provider=config.provider;
 if(provider!=='firebase')return;
 firebaseDomain=config.firebase.authDomain;firebaseApiKey=config.firebase.apiKey;
 // Credentials stay in Secure, HttpOnly cookies. Browsers contact only DrFrog;
 // Cloudflare performs the fixed Firebase REST operations.
 $('auth-form').onsubmit=e=>{e.preventDefault();task($('email-signin'),async()=>{forcedVerification=false;await account('sign-in',{email:$('auth-email').value.trim(),password:$('auth-password').value});$('auth-password').value='';if(user.emailVerified)$('auth-dialog').close();await changed();});};
 $('email-signup').onclick=()=>{if(!$('auth-form').reportValidity())return;task($('email-signup'),async()=>{forcedVerification=false;await account('sign-up',{email:$('auth-email').value.trim(),password:$('auth-password').value});$('auth-password').value='';await changed();await sendVerification();});};
 $('auth-reset').onclick=()=>{const email=$('auth-email');if(!email.value||!email.reportValidity())return;task($('auth-reset'),async()=>{await account('send-reset',{email:email.value.trim()});notice('resetSent');});};
 $('resend-verification').onclick=()=>task($('resend-verification'),sendVerification);
 $('check-verification').onclick=()=>task($('check-verification'),checkVerification);
 $('paste-verification-link').onclick=()=>{$('email-link-help').open=true;$('email-action-mode').value='verifyEmail';actionMode();$('email-action-link').focus();};
 $('verification-signout').onclick=()=>task($('verification-signout'),async()=>{await account('sign-out');forcedVerification=false;nextVerificationSend=0;$('auth-email').value='';$('auth-password').value='';await changed();openAuth();});
 document.querySelectorAll('.sign-in').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();openAuth();}));
 $('sign-out').addEventListener('click',e=>{e.preventDefault();task($('sign-out'),async()=>{await account('sign-out');await changed({signedOut:true});});});
 $('email-action-mode').onchange=()=>{const reset=$('email-action-mode').value==='resetPassword';$('email-action-password-wrap').hidden=!reset;$('email-action-password').required=reset;};
 $('email-action-link').addEventListener('input',actionMode);
 $('email-action-form').onsubmit=e=>{e.preventDefault();task($('apply-email-link'),async()=>{
  const {mode,code}=emailAction($('email-action-link').value);
  if(mode==='resetPassword'){
   await account('reset-password',{code,password:$('email-action-password').value});$('email-action-password').value='';user=null;updateVerification();notice('passwordResetDone');await changed();
  }else{
   try{await account('verify-email',{code});}catch(error){if(error.message!=='emailLinkInvalid')throw error;if(!await recheckVerification())throw error;notice('alreadyVerifiedCurrent');forcedVerification=false;updateVerification();$('email-action-link').value='';$('email-link-help').open=false;$('auth-dialog').close();await changed();return;}
   await restore(true);notice(!user?'emailVerifiedSignin':user.emailVerified?'emailVerifiedDone':'verificationOtherAccount');if(user?.emailVerified){forcedVerification=false;updateVerification();$('auth-dialog').close();await changed();}
  }
  $('email-action-link').value='';$('email-link-help').open=false;
 });};
 document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',refreshAuthLabels));
 refreshAuthLabels();
 await restore();
 if(incomingAction){$('email-action-link').value=actionUrl.href;$('email-action-mode').value=incomingMode;$('email-link-help').open=true;actionMode();openAuth();notice('emailLinkReady');}
 const checkOnReturn=()=>{if(document.visibilityState!=='visible'||busy||!user||user.emailVerified&&!forcedVerification||Date.now()-lastVerificationCheck<10000)return;task($('check-verification'),checkVerification);};
 window.addEventListener('focus',checkOnReturn);document.addEventListener('visibilitychange',checkOnReturn);setInterval(()=>{if(!busy&&!$('auth-verify').hidden)refreshSendButton();},1000);
}
export function refreshAuthLabels(){if(provider!=='firebase')return;document.querySelectorAll('.sign-in').forEach(link=>{link.textContent=t('emailSignin');link.href='#signin';link.removeAttribute('target');});$('sign-out').href='#signout';$('sign-out').removeAttribute('target');const welcome=document.querySelector('[data-i18n="welcomeText"]');if(welcome)welcome.textContent=t('emailWelcome');if($('auth-notice').dataset.key)$('auth-notice').textContent=t($('auth-notice').dataset.key);refreshSendButton();}
export function openAuth(needsVerification=false){if(provider!=='firebase')return;if(needsVerification)forcedVerification=true;updateVerification();if(!user)notice('emailAuthIntro');if(!$('auth-dialog').open)$('auth-dialog').showModal();}
