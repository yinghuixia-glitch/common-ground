import {t as defaultTranslate} from './i18n.js?v=d15eb85b2d2d';
const $=id=>document.getElementById(id);

export function initNotifications({state,api,t=defaultTranslate,toast}){
 let member=state.profile?.id||null,epoch=0,request=0,settings=null,loaded=false,loading=false,saving=false,inFlight=null,statusKey=null,errorKey=null;
 const current=(id,generation,sequence)=>state.profile?.id===id&&member===id&&epoch===generation&&request===sequence;
 const normalize=value=>{if(!value||typeof value.configured!=='boolean'||typeof value.enabled!=='boolean'||!['en','zh'].includes(value.language))throw Error('unavailable');return {configured:value.configured,enabled:value.enabled,language:value.language};};
 function render(){
  const available=!!state.profile&&loaded&&!loading&&!saving,configured=settings?.configured===true,wasEnabled=settings?.enabled===true;
  $('notification-email-enabled').disabled=!available||(!configured&&!wasEnabled);
  $('notification-email-language').disabled=!available;
  $('notification-email-save').disabled=!available||(!configured&&$('notification-email-enabled').checked);
  $('notification-email-retry').hidden=!errorKey||loaded;
  $('notification-email-retry').disabled=!state.profile||loading||saving;
  $('notification-settings-form').setAttribute('aria-busy',String(loading||saving));
  const note=$('notification-email-unconfigured');note.hidden=!loaded||configured;note.textContent=t(wasEnabled?'notificationEmailPaused':'notificationEmailUnconfigured');
  const key=loading?'notificationEmailLoading':saving?'notificationEmailSaving':statusKey||(loaded?(configured&&wasEnabled?'notificationEmailOn':!configured&&wasEnabled?'notificationEmailPaused':'notificationEmailOff'):null);
  $('notification-email-status').textContent=key?t(key):'';
  $('notification-email-error').hidden=!errorKey;if(errorKey)$('notification-email-error').textContent=t(errorKey);
 }
 function reset(){epoch++;request++;member=state.profile?.id||null;settings=null;loaded=false;loading=false;saving=false;inFlight=null;statusKey=null;errorKey=null;$('notification-email-enabled').checked=false;$('notification-email-language').value=state.profile?.language==='zh'?'zh':'en';render();}
 const accountChanged=()=>{if(member!==(state.profile?.id||null))reset();};
 function fill(){ $('notification-email-enabled').checked=settings.enabled;$('notification-email-language').value=settings.language; }
 async function open(){
  accountChanged();if(!state.profile){reset();return;}if(saving){render();return;}if(inFlight)return inFlight;
  const id=state.profile.id,generation=epoch,sequence=++request;loading=true;errorKey=null;statusKey=null;render();
  const task=Promise.resolve().then(async()=>{try{const result=normalize(await api('/notification-settings'));if(!current(id,generation,sequence))return;settings=result;loaded=true;fill();render();}
   catch(error){if(!current(id,generation,sequence)||error.message==='requestCanceled')return;loaded=false;errorKey='notificationEmailLoadFailed';render();}
   finally{if(current(id,generation,sequence)){loading=false;inFlight=null;render();}}
  });inFlight=task;return task;
 }
 async function save(){
  accountChanged();if(!state.profile||!loaded||loading||saving)return;
  const enabled=$('notification-email-enabled').checked,language=$('notification-email-language').value;
  if(enabled&&!settings.configured){errorKey='notificationsUnconfigured';render();return;}
  if(!['en','zh'].includes(language))return;
  const id=state.profile.id,generation=epoch,sequence=++request;saving=true;errorKey=null;statusKey=null;render();
  try{const result=normalize(await api('/notification-settings','PUT',{enabled,language}));if(!current(id,generation,sequence))return;settings=result;loaded=true;fill();statusKey='notificationEmailSaved';toast?.('notificationEmailSaved');}
  catch(error){if(!current(id,generation,sequence)||error.message==='requestCanceled')return;errorKey=['notificationsUnconfigured','notificationEmailUnavailable'].includes(error.message)?error.message:'notificationEmailSaveFailed';}
  finally{if(current(id,generation,sequence)){saving=false;render();}}
 }
 $('notification-settings-form').addEventListener('submit',event=>{event.preventDefault();save();});
 $('notification-email-enabled').addEventListener('change',()=>{statusKey=null;errorKey=null;render();});
 $('notification-email-language').addEventListener('change',()=>{statusKey=null;errorKey=null;render();});
 $('notification-email-retry').addEventListener('click',open);
 render();
 return {open,reset,render};
}
