import {language,t} from './i18n.js?v=4eda247d0747';

const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const today=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

export function initCampusSpaces({state,api,run,button,toast,requireMember,confirm,openReport}){
 let entries=[],hasMore=false,loaded=false,loading=false,publishing=false,needsApply=false,errorKey=null,memberEpoch=0,loadRequest=0,knownMember=state.profile?.id??null;
 const filterIds=['space-filter-university','space-filter-noise','space-filter-lighting','space-filter-crowding'];
 const fingerprint=()=>JSON.stringify(filterIds.map(id=>$(id).value.trim()));
 const active=()=>state.view==='resources'&&!$('spaces-pane').hidden;
 const valid=(member,epoch,request,filters)=>state.profile?.id===member&&memberEpoch===epoch&&loadRequest===request&&fingerprint()===filters;
 function resetForm(){
  $('space-form').reset();
  $('space-observed').value=today();$('space-observed').max=today();
  $('space-university').value=state.profile?.university||'';
 }
 function renderMembership(){
  const member=!!state.profile;
  $('space-share-shortcut').hidden=!member;
  $('space-observed').max=today();
  $('space-fields').disabled=!member||publishing;
  $('space-filter-fields').disabled=!member;
  $('space-join').hidden=member;$('space-join-button').hidden=member;
  $('space-join').textContent=t(state.signedIn?'finishOnboarding':'spaceJoin');
  $('space-apply').disabled=!member||loading;
  $('space-refresh').disabled=!member||loading;
  $('space-more').disabled=!member||loading;
  $('space-more').hidden=!member||!hasMore||needsApply;
 }
 function formatObserved(value){
  const date=new Date(value+'T12:00:00');
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en',{dateStyle:'medium'}).format(date);
 }
 function detail(list,label,value){const item=make('div','space-detail');item.append(make('dt','',t(label)),make('dd','',t(value)));list.append(item);}
 function renderEntries(){
  const box=$('space-feed');box.replaceChildren();
  if(!state.profile){box.append(make('p','empty',t('spaceJoin')));return;}
  if(!entries.length){box.append(make('p','empty',t(loading?'loading':needsApply?'spaceApplyFilters':'spaceEmpty')));return;}
  for(const entry of entries){
   const card=make('article','space-card panel'),heading=make('div','space-card-heading');
   heading.append(make('span','chip',entry.university),make('h3','',entry.place));
   const observation=make('p','small space-observation'),time=make('time','',formatObserved(entry.observedOn));time.dateTime=entry.observedOn;
   observation.append(document.createTextNode(t('spaceObserved')+' '),time,document.createTextNode(' · '+t('spaceTime_'+entry.timeOfDay)));
   const facts=make('dl','space-facts');
   detail(facts,'spaceNoise','spaceNoise_'+entry.noise);detail(facts,'spaceLighting','spaceLighting_'+entry.lighting);
   detail(facts,'spaceCrowding','spaceCrowding_'+entry.crowding);detail(facts,'spaceSeating','spaceSeating_'+entry.seating);
   detail(facts,'spaceBreak',entry.breakSpace?'spaceBreak_yes':'spaceBreak_no');
   const actions=make('div','resource-actions space-card-actions');
   if(entry.mine){const member=state.profile.id;actions.append(button('spaceDelete',()=>confirm('spaceDeleteConfirm',async()=>{if(state.profile?.id!==member)return;await api('/campus-spaces/'+entry.id,'DELETE');if(state.profile?.id!==member)return;toast('spaceDeleted');await load();}),'text-button'));}
   else actions.append(button('report',()=>openReport({campusSpaceId:entry.id}),'text-button'));
   card.append(heading,observation,make('p','space-body',entry.description),facts,make('p','small space-author',t('spaceBy')+' '+entry.name),actions);box.append(card);
  }
 }
 function render(){renderMembership();renderEntries();$('space-error').hidden=!errorKey;if(errorKey)$('space-error').textContent=t(errorKey);}
 async function load(more=false){
  if(!state.profile)return;
  const member=state.profile.id,epoch=memberEpoch,request=++loadRequest,filters=fingerprint();
  const params=new URLSearchParams();
  for(const [index,key] of ['university','noise','lighting','crowding'].entries()){const value=$(filterIds[index]).value.trim();if(value)params.set(key,value);}
  if(more&&entries.length){const last=entries.at(-1);params.set('before',String(last.created));params.set('beforeId',String(last.id));}
  if(!more){entries=[];hasMore=false;}needsApply=false;loading=true;errorKey=null;render();
  try{
   const result=await api('/campus-spaces'+(params.size?'?'+params:''));
   if(!valid(member,epoch,request,filters))return;
   const merged=more?[...entries,...result.spaces]:result.spaces;
   entries=[...new Map(merged.map(entry=>[entry.id,entry])).values()];hasMore=result.hasMore;loaded=true;
  }catch(error){
   if(!valid(member,epoch,request,filters))return;
   errorKey=error.message;
   throw error;
  }finally{if(valid(member,epoch,request,filters)){loading=false;render();}}
 }
 function resetMembers(){
  knownMember=state.profile?.id??null;memberEpoch++;loadRequest++;entries=[];hasMore=false;loaded=false;loading=false;publishing=false;needsApply=false;errorKey=null;
  $('space-filters').reset();resetForm();render();
 }
 function memberChanged(){
  const member=state.profile?.id??null;if(member!==knownMember)resetMembers();
  render();if(active()&&state.profile&&!loaded&&!loading&&!needsApply)run($('space-refresh'),()=>load());
 }
 function invalidate(){loadRequest++;entries=[];hasMore=false;loaded=false;loading=false;errorKey=null;render();memberChanged();}
 function changeFilters(){loadRequest++;loading=false;entries=[];hasMore=false;loaded=false;needsApply=true;errorKey=null;render();}
 for(const id of filterIds)$(id).addEventListener(id==='space-filter-university'?'input':'change',changeFilters);
 $('space-filters').onsubmit=event=>{event.preventDefault();run($('space-apply'),()=>load());};
 $('space-refresh').onclick=()=>run($('space-refresh'),()=>load());
 $('space-more').onclick=()=>run($('space-more'),()=>load(true));
 $('space-join-button').onclick=()=>requireMember();
 $('space-share-shortcut').onclick=()=>{$('space-share-title').scrollIntoView({block:'start',behavior:'instant'});$('space-share-title').focus({preventScroll:true});};
 $('space-form').onsubmit=event=>{
  event.preventDefault();run($('space-publish'),async()=>{
   if(!requireMember())return;
   const member=state.profile.id,epoch=memberEpoch;
   if($('space-observed').value>today())throw Error('spaceFutureDate');
   const data={university:$('space-university').value.trim(),place:$('space-place').value.trim(),description:$('space-description').value.trim(),noise:$('space-noise').value,lighting:$('space-lighting').value,crowding:$('space-crowding').value,seating:$('space-seating').value,breakSpace:$('space-break').checked,observedOn:$('space-observed').value,timeOfDay:$('space-time').value,publishConsent:$('space-consent').checked};
   publishing=true;renderMembership();
   try{await api('/campus-spaces','POST',data);if(state.profile?.id!==member||memberEpoch!==epoch)return;resetForm();toast('spacePublished');await load();}
   finally{if(state.profile?.id===member&&memberEpoch===epoch){publishing=false;renderMembership();}}
  });
 };
 resetForm();render();
 return {render,memberChanged,resetMembers,invalidate,load};
}
