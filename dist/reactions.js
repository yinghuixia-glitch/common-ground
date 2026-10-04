import {t as translate} from './i18n.js?v=ba15c37127c1';

// A server count is shared between every visible instance of the same item.
// Mutations update only these controls and leave question/reply editors intact.
export function initReactions({state,api,run,t=translate}){
 let account=state.profile?.id||null,generation=0;
 const records=new Map();
 const validCount=value=>Number.isSafeInteger(value)&&value>=0;
 function reset(){generation++;account=state.profile?.id||null;for(const record of records.values())for(const control of record.controls.keys()){control.disabled=true;control.removeAttribute('aria-busy');}records.clear();}
 function ensureAccount(){if(account!==(state.profile?.id||null))reset();}
 function paint(record){
  const key=record.liked?'reactionLiked':'reactionLike',action=record.kind==='question'?(record.liked?'reactionUnlikeQuestion':'reactionLikeQuestion'):(record.liked?'reactionUnlikeAnswer':'reactionLikeAnswer');
  for(const [control,target] of record.controls){target.likeCount=record.likeCount;target.liked=record.liked;control.firstChild.textContent=record.liked?'♥':'♡';control.lastChild.textContent=t(key)+' · '+record.likeCount;control.setAttribute('aria-pressed',String(record.liked));control.setAttribute('aria-label',t(action)+' · '+record.likeCount+' '+t('reactionCount'));control.disabled=!state.profile||record.pending;if(record.pending)control.setAttribute('aria-busy','true');else control.removeAttribute('aria-busy');}
 }
 function render(){ensureAccount();for(const record of records.values()){for(const control of record.controls.keys())if(!control.isConnected)record.controls.delete(control);paint(record);}}
 function button(kind,target){
  ensureAccount();if(!['question','answer'].includes(kind)||!target||typeof target.id!=='string')throw Error('invalidInput');
  const key=kind+':'+target.id;let record=records.get(key);
  if(!record){record={kind,id:target.id,likeCount:validCount(target.likeCount)?target.likeCount:0,liked:target.liked===true,pending:false,controls:new Map()};records.set(key,record);}
  else{for(const control of record.controls.keys())if(!control.isConnected)record.controls.delete(control);if(!record.pending&&validCount(target.likeCount)&&typeof target.liked==='boolean'){record.likeCount=target.likeCount;record.liked=target.liked;}}
  const control=document.createElement('button'),heart=document.createElement('span'),label=document.createElement('span');control.type='button';control.className='reaction-button secondary';control.dataset.reactionKind=kind;control.dataset.reactionTarget=target.id;heart.className='reaction-heart';heart.setAttribute('aria-hidden','true');label.className='reaction-label';control.append(heart,label);record.controls.set(control,target);paint(record);
  control.addEventListener('click',()=>{
   if(record.pending||!state.profile||records.get(key)!==record)return;
   run(control,async()=>{ensureAccount();if(records.get(key)!==record||!state.profile)return;const member=state.profile.id,version=generation,unlike=record.liked;record.pending=true;paint(record);
    try{const result=await api('/'+(kind==='question'?'questions':'answers')+'/'+encodeURIComponent(record.id)+'/likes',unlike?'DELETE':'POST',unlike?undefined:{});if(version!==generation||state.profile?.id!==member||records.get(key)!==record)return;if(!validCount(result.likeCount)||typeof result.liked!=='boolean')throw Error('unavailable');record.likeCount=result.likeCount;record.liked=result.liked;paint(record);}
    finally{if(version===generation&&state.profile?.id===member&&records.get(key)===record){record.pending=false;paint(record);}}
   });
  });
  return control;
 }
 return {button,reset,render};
}
