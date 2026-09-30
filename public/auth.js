import {t,language} from './i18n.js';
let provider='chatgpt',auth,sdk,changed=()=>{};
const $=id=>document.getElementById(id);
const errors={'auth/invalid-credential':'invalidCredentials','auth/wrong-password':'invalidCredentials','auth/user-not-found':'invalidCredentials','auth/invalid-email':'invalidInput','auth/email-already-in-use':'emailInUse','auth/weak-password':'weakPassword','auth/too-many-requests':'tooFast','auth/network-request-failed':'authUnavailable'};
function notice(key){$('auth-notice').textContent=t(key);$('auth-notice').dataset.key=key;}
async function task(button,action){button.disabled=true;try{await action();}catch(e){notice(errors[e.code]||'authUnavailable');}finally{button.disabled=false;}}
function updateVerification(){const unverified=!!auth?.currentUser&&!auth.currentUser.emailVerified;$('auth-verify').hidden=!unverified;$('auth-form').hidden=unverified;$('auth-reset').hidden=unverified;if(unverified)notice('verifyEmail');}
export function authProvider(){return provider;}
export async function authHeaders(){if(provider!=='firebase'||!auth?.currentUser)return {};try{return {Authorization:'Bearer '+await auth.currentUser.getIdToken()};}catch{throw Error('signIn');}}
export async function initAuth(onChange){
 changed=onChange;const response=await fetch('/api/auth-config',{cache:'no-store'});if(!response.ok)throw Error('authUnavailable');const config=await response.json();provider=config.provider;
 if(provider!=='firebase')return;
 sdk=await import('./firebase-client.js');auth=sdk.initializeAuth(sdk.initializeApp(config.firebase),{persistence:sdk.browserLocalPersistence});
 auth.languageCode=language==='zh'?'zh-CN':'en';
 // Let the SDK restore its signed-in session before loading member data.
 await auth.authStateReady();
 let first=true;sdk.onAuthStateChanged(auth,()=>{updateVerification();if(first){first=false;return;}changed();});
 $('auth-form').onsubmit=e=>{e.preventDefault();task($('email-signin'),async()=>{await sdk.signInWithEmailAndPassword(auth,$('auth-email').value.trim(),$('auth-password').value);$('auth-password').value='';updateVerification();if(auth.currentUser.emailVerified)$('auth-dialog').close();});};
 $('email-signup').onclick=()=>{if(!$('auth-form').reportValidity())return;task($('email-signup'),async()=>{const result=await sdk.createUserWithEmailAndPassword(auth,$('auth-email').value.trim(),$('auth-password').value);$('auth-password').value='';updateVerification();await sdk.sendEmailVerification(result.user);notice('verificationSent');});};
 $('auth-reset').onclick=()=>{const email=$('auth-email');if(!email.value||!email.reportValidity())return;task($('auth-reset'),async()=>{await sdk.sendPasswordResetEmail(auth,email.value.trim());notice('resetSent');});};
 $('resend-verification').onclick=()=>task($('resend-verification'),async()=>{await sdk.sendEmailVerification(auth.currentUser);notice('verificationSent');});
 $('check-verification').onclick=()=>task($('check-verification'),async()=>{await sdk.reload(auth.currentUser);if(!auth.currentUser.emailVerified){notice('verifyEmail');return;}await auth.currentUser.getIdToken(true);$('auth-dialog').close();await changed();});
 $('verification-signout').onclick=()=>task($('verification-signout'),async()=>{await sdk.signOut(auth);updateVerification();notice('emailAuthIntro');});
 document.querySelectorAll('.sign-in').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();openAuth();}));
 $('sign-out').addEventListener('click',e=>{e.preventDefault();task($('sign-out'),async()=>sdk.signOut(auth));});
 document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>{auth.languageCode=language==='zh'?'zh-CN':'en';refreshAuthLabels();}));
 refreshAuthLabels();
}
export function refreshAuthLabels(){if(provider!=='firebase')return;document.querySelectorAll('.sign-in').forEach(link=>{link.textContent=t('emailSignin');link.href='#signin';link.removeAttribute('target');});$('sign-out').href='#signout';$('sign-out').removeAttribute('target');const welcome=document.querySelector('[data-i18n="welcomeText"]');if(welcome)welcome.textContent=t('emailWelcome');if($('auth-notice').dataset.key)$('auth-notice').textContent=t($('auth-notice').dataset.key);}
export function openAuth(){if(provider!=='firebase')return;updateVerification();if(!auth.currentUser)notice('emailAuthIntro');$('auth-dialog').showModal();}
