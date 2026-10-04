import {language,t} from './i18n.js?v=d15eb85b2d2d';
import {toolbox,scenarios} from './campus-content.js?v=d15eb85b2d2d';

const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
export const PREFERENCE_TAGS=['shortReplies','directExplanations','slowReplies'];
const defaults={large:false,plain:false,focus:false,refresh:30};
let comfort={...defaults};
try{const saved=JSON.parse(localStorage.getItem('drfrog-comfort')||'null');if(saved)comfort={large:saved.large===true,plain:saved.plain===true,focus:saved.focus===true,refresh:[0,30,60,120].includes(saved.refresh)?saved.refresh:30};}catch{}
function applyComfort(){const root=document.documentElement;root.dataset.largeText=String(comfort.large);root.dataset.plainFont=String(comfort.plain);root.dataset.focus=String(comfort.focus);root.dataset.focusArea=$('focus-area')?.value||'questions';}
applyComfort();
export const refreshSeconds=()=>comfort.refresh;

export function preferenceChips(preferences,preview=false){
 const box=make('div','preference-tags');
 if(!preferences||(!preview&&!preferences.visible))return box;
 const tags=PREFERENCE_TAGS.filter(tag=>preferences.tags?.includes(tag));
 if(!tags.length&&preferences.preferredLanguage==='either'&&!preferences.visible&&!preview)return box;
 box.setAttribute('role','list');box.setAttribute('aria-label',t('communicationPreferences'));
 for(const key of [...tags.map(tag=>'pref_'+tag),'pref_'+(preferences.preferredLanguage||'either')]){const chip=make('span','preference-chip',t(key));chip.setAttribute('role','listitem');box.append(chip);}
 return box;
}
export function profilePreferences(){return {tags:PREFERENCE_TAGS.filter(tag=>$('pref-'+tag).checked),preferredLanguage:$('preferred-language').value,visible:$('preferences-visible').checked};}
export function fillPreferences(preferences){const p=preferences||{tags:[],preferredLanguage:'either',visible:false};for(const tag of PREFERENCE_TAGS)$('pref-'+tag).checked=p.tags.includes(tag);$('preferred-language').value=p.preferredLanguage;$('preferences-visible').checked=p.visible;renderPreferencePreview();}
function renderPreferencePreview(){const preferences=profilePreferences();$('preference-visibility-note').textContent=t(preferences.visible?'preferencesPublicNote':'preferencesPrivateNote');$('preferences-preview').replaceChildren(preferenceChips(preferences,true));}

export function initFeatures({state,api,run,button,toast,requireMember,confirm,openReport,onPaneChange=()=>{},extraPanes={},onTemplateChange=()=>{}}){
 let pane='guide',selectedTemplate=toolbox[0]?.id,entries=[],hasMore=false,loading=false,loaded=false,memberEpoch=0,loadRequest=0;
 const drafts=new Map();
 const resourcePanes=['guide','toolbox','situations','takeaways',...Object.keys(extraPanes)];
 function resourcePane(value,focus=false,notify=true){pane=value;for(const key of resourcePanes){const active=key===pane;$(key+'-tab').setAttribute('aria-selected',String(active));$(key+'-tab').tabIndex=active?0:-1;$(key+'-pane').hidden=!active;}if(focus)$(pane+'-tab').focus();if(notify)onPaneChange(pane);extraPanes[pane]?.memberChanged();if(pane==='takeaways'&&state.profile&&!loaded)run($('refresh-takeaways'),()=>loadTakeaways());}
 function renderTemplate(){const selection=$('template-choice');selection.replaceChildren();for(const template of toolbox){const option=make('option','',template[language].title);option.value=template.id;selection.append(option);}selection.value=selectedTemplate;const template=toolbox.find(entry=>entry.id===selectedTemplate);if(!template)return;const copy=template[language];$('template-title').textContent=copy.title;$('template-topic').textContent=t(template.topic);$('template-description').textContent=copy.description;$('template-body').value=drafts.get(template.id+':'+language)??copy.body;onTemplateChange();}
 function renderScenarios(){const box=$('scenario-list');box.replaceChildren();for(const scenario of scenarios){const copy=scenario[language],card=make('article','scenario-card panel');card.append(make('span','chip',t(scenario.topic)),make('h3','',copy.title),make('p','',copy.situation));const details=make('details'),summary=make('summary','',t('lookAtPerspectives'));details.append(summary,make('h4','',t('possiblePerspectives')));const perspectives=make('ul');for(const text of copy.perspectives)perspectives.append(make('li','',text));details.append(perspectives,make('h4','',t('clarifyingQuestions')));const questions=make('ul');for(const text of copy.questions)questions.append(make('li','',text));details.append(questions);card.append(details);box.append(card);}}
 function renderTakeaways(){const member=!!state.profile;$('takeaway-fields').disabled=!member;$('refresh-takeaways').disabled=!member||loading;$('takeaway-filter').disabled=!member||loading;$('more-takeaways').disabled=loading;$('takeaway-join').hidden=member;$('takeaway-join').textContent=t(state.signedIn?'finishOnboarding':'joinTakeaways');const box=$('takeaway-feed');box.replaceChildren();$('more-takeaways').hidden=!member||!hasMore;
  if(!member){box.append(make('p','empty',t('joinTakeaways')));return;}
  if(!entries.length)box.append(make('p','empty',t('noTakeaways')));
  for(const entry of entries){const card=make('article','takeaway-card panel'),meta=make('div','question-meta');meta.append(make('span','chip',t(entry.topic)),make('span','small',t(entry.mine?'yourAnonymousTakeaway':'anonymousTakeaway')));const time=make('time','small',new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en',{dateStyle:'medium'}).format(new Date(entry.created)));time.dateTime=new Date(entry.created).toISOString();meta.append(time);card.append(meta,make('p','takeaway-body',entry.body));const actions=make('div','resource-actions');if(entry.mine)actions.append(button('deleteTakeaway',()=>confirm('deleteTakeawayConfirm',async()=>{await api('/takeaways/'+entry.id,'DELETE');await loadTakeaways();toast('takeawayDeleted');}),'text-button'));else actions.append(button('report',()=>openReport({takeawayId:entry.id}),'text-button'));card.append(actions);box.append(card);}
 }
 async function loadTakeaways(more=false){if(!state.profile||loading)return;const memberId=state.profile.id,epoch=memberEpoch,request=++loadRequest;loading=true;$('takeaway-filter').disabled=true;$('takeaway-error').hidden=true;try{const params=new URLSearchParams();if($('takeaway-filter').value)params.set('topic',$('takeaway-filter').value);if(more&&entries.length){const last=entries.at(-1);params.set('before',last.created);params.set('beforeId',last.id);}const result=await api('/takeaways'+(params.size?'?'+params:''));if(state.profile?.id!==memberId||epoch!==memberEpoch||request!==loadRequest)return;entries=more?[...entries,...result.takeaways]:result.takeaways;hasMore=result.hasMore;loaded=true;renderTakeaways();}catch(error){if(state.profile?.id!==memberId||epoch!==memberEpoch||request!==loadRequest)return;$('takeaway-error').textContent=t(error.message);$('takeaway-error').hidden=false;throw error;}finally{if(request===loadRequest){loading=false;$('takeaway-filter').disabled=!state.profile;$('refresh-takeaways').disabled=!state.profile;$('more-takeaways').disabled=false;}}}
 function render(){renderPreferencePreview();renderTemplate();renderScenarios();renderTakeaways();for(const extension of Object.values(extraPanes))extension.render();}
 function invalidateTakeaways(){for(const extension of Object.values(extraPanes))extension.invalidate?.();memberEpoch++;loadRequest++;loading=false;entries=[];hasMore=false;loaded=false;$('takeaway-error').hidden=true;renderTakeaways();memberChanged();}
 function resetMembers(){for(const extension of Object.values(extraPanes))extension.resetMembers();drafts.clear();renderTemplate();fillPreferences();memberEpoch++;loadRequest++;loading=false;entries=[];hasMore=false;loaded=false;$('takeaway-form').reset();$('takeaway-error').hidden=true;renderTakeaways();}
 function memberChanged(){for(const extension of Object.values(extraPanes))extension.memberChanged();renderTakeaways();if(state.view==='resources'&&pane==='takeaways'&&state.profile&&!loaded)run($('refresh-takeaways'),()=>loadTakeaways());}
 async function copyTemplate(){const value=$('template-body').value;try{await navigator.clipboard.writeText(value);toast('templateCopied');}catch{$('template-body').focus();$('template-body').select();toast('copyManually');}}
 for(const key of resourcePanes){$(key+'-tab').onclick=()=>resourcePane(key);$(key+'-tab').onkeydown=event=>{const order=resourcePanes;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?order[0]:event.key==='End'?order.at(-1):order[(order.indexOf(key)+(event.key==='ArrowRight'?1:order.length-1))%order.length];resourcePane(next,true);}};}
 $('template-choice').onchange=()=>{selectedTemplate=$('template-choice').value;renderTemplate();};
 $('template-body').oninput=()=>{drafts.set(selectedTemplate+':'+language,$('template-body').value);onTemplateChange();};
 $('copy-template').onclick=()=>run($('copy-template'),copyTemplate);
 $('reset-template').onclick=()=>{drafts.delete(selectedTemplate+':'+language);renderTemplate();toast('templateReset');};
 $('takeaway-filter').onchange=()=>run($('refresh-takeaways'),()=>loadTakeaways());
 $('refresh-takeaways').onclick=()=>run($('refresh-takeaways'),()=>loadTakeaways());
 $('more-takeaways').onclick=()=>run($('more-takeaways'),()=>loadTakeaways(true));
 $('takeaway-form').onsubmit=event=>{event.preventDefault();run($('takeaway-form').querySelector('button'),async()=>{if(!requireMember())return;await api('/takeaways','POST',{body:$('takeaway-body').value,topic:$('takeaway-topic').value,publishConsent:$('takeaway-consent').checked});$('takeaway-form').reset();await loadTakeaways();toast('takeawayPublished');});};
 for(const tag of PREFERENCE_TAGS)$('pref-'+tag).onchange=renderPreferencePreview;
 $('preferred-language').onchange=renderPreferencePreview;$('preferences-visible').onchange=renderPreferencePreview;
 $('comfort-button').onclick=()=>{$('comfort-large').checked=comfort.large;$('comfort-plain').checked=comfort.plain;$('comfort-focus').checked=comfort.focus;$('comfort-refresh').value=String(comfort.refresh);$('comfort-dialog').showModal();};
 function saveComfort(){try{localStorage.setItem('drfrog-comfort',JSON.stringify(comfort));}catch{}applyComfort();$('comfort-dialog').close();toast('comfortSaved');}
 $('comfort-form').onsubmit=event=>{event.preventDefault();comfort={large:$('comfort-large').checked,plain:$('comfort-plain').checked,focus:$('comfort-focus').checked,refresh:Number($('comfort-refresh').value)};saveComfort();};
 $('reset-comfort').onclick=()=>{comfort={...defaults};$('focus-area').value='questions';saveComfort();};
 $('focus-area').onchange=applyComfort;
 return {render,memberChanged,resetMembers,invalidateTakeaways,resourcePane,loadTakeaways,getTemplateDraftInput:()=>({templateId:selectedTemplate,language,body:$('template-body').value}),hasTemplateEdits:()=>drafts.has(selectedTemplate+':'+language),getTemplateEdits:(id,lang)=>drafts.get(id+':'+lang),restoreTemplateDraft:draft=>{if(!toolbox.some(item=>item.id===draft.templateId))return;selectedTemplate=draft.templateId;drafts.set(draft.templateId+':'+draft.language,draft.body);renderTemplate();resourcePane('toolbox');}};
}
