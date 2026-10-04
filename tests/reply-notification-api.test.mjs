import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://drfrog.pages.dev';
const configured={NOTIFICATION_ENABLED:'1',BREVO_API_KEY:'test-key-never-sent-externally',NOTIFICATION_FROM_EMAIL:'sender@example.test'};
const profile={group:'neurodivergent',role:'Student',university:'Example university',language:'zh',consent:true};
function harness(t,{provider=true}={}){
 const DB=localDatabase(),env={DB,...(provider?configured:{})},sent=[],pending=[];
 const priorFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');sent.push(JSON.parse(options.body));return new Response('{}',{status:201});};
 t.after(()=>{globalThis.fetch=priorFetch;DB.close();});
 const ctx={waitUntil:task=>pending.push(task)};
 async function settle(){while(pending.length)await Promise.all(pending.splice(0));}
 async function call(user,path,method='GET',data,extra={}){
  const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
  if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);
  const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env,ctx);
  const result={status:response.status,data:await response.json()};await settle();return result;
 }
 async function join(user){const result=await call(user,'/profile','PUT',{...profile,name:user});assert.equal(result.status,200);}
 async function post(user){const result=await call(user,'/questions','POST',{title:'Private-to-community question title',body:'Sensitive university details in the question.',topic:'Communication'});assert.equal(result.status,201);return result.data.id;}
 async function dispatch(user){const result=await call(user,'/notification-dispatch','POST',{});assert.equal(result.status,200);}
 async function answer(user,postId,{deliver=true}={}){const result=await call(user,'/questions/'+postId+'/answers','POST',{body:'Sensitive personal answer contents.',visibilityConsent:true});assert.equal(result.status,201);if(deliver)await dispatch(user);return result.data.id;}
 async function reply(user,answerId,{deliver=true}={}){const result=await call(user,'/answers/'+answerId+'/replies','POST',{body:'Sensitive public follow-up contents.',visibilityConsent:true});assert.equal(result.status,201);if(deliver)await dispatch(user);return result.data.id;}
 async function optIn(user='alice'){const result=await call(user,'/notification-settings','PUT',{enabled:true,language:'en'});assert.equal(result.status,200);}
 return {DB,env,sent,ctx,call,join,post,answer,reply,optIn,settle,dispatch};
}

test('notification settings integration requires a completed authenticated member and same-origin explicit consent',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 assert.equal((await h.call(null,'/notification-settings')).status,401);assert.equal((await h.call('unfinished','/notification-settings')).status,403);
 assert.equal((await h.call('alice','/notification-settings','PUT',{enabled:true},{Origin:'https://other.example'})).status,403);
 assert.equal((await h.call('alice','/notification-settings','PUT',{enabled:true},{'X-Common-Ground':'0'})).status,403);
 assert.equal((await h.call('alice','/notification-settings','PUT',{enabled:true,email:'someone-else@example.test'})).status,400);
 const initial=await h.call('alice','/notification-settings');assert.equal(initial.status,200);assert.equal(initial.data.enabled,false);assert.equal(initial.data.configured,true);assert.doesNotMatch(JSON.stringify(initial.data),/test-key|alice@|bob@/);
 await h.optIn();assert.equal((await h.call('alice','/notification-settings')).data.enabled,true);assert.equal((await h.call('bob','/notification-settings')).data.enabled,false);assert.equal(h.sent.length,0);
});

test('publishing an opted-in question reply schedules generic owner email without copying community text',async t=>{
 const h=harness(t);for(const user of ['alice','bob','eve'])await h.join(user);await h.optIn();const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].to[0].email,'alice@example.test');assert.match(h.sent[0].textContent,new RegExp('question='+postId+'&answer='+answerId));assert.doesNotMatch(JSON.stringify(h.sent[0]),/Sensitive|Private-to-community|personal answer/);
 await h.reply('eve',answerId);await h.reply('alice',answerId);assert.equal(h.sent.length,1);
 const answer=(await h.call('alice','/answers/'+answerId)).data.answer;assert.equal(answer.body,'Sensitive personal answer contents.');
});

test('default-off recipients and unconfigured deployments do not send email or make reply publication fail',async t=>{
 const h=harness(t,{provider:false});await h.join('alice');await h.join('bob');assert.equal((await h.call('alice','/notification-settings','PUT',{enabled:true})).status,503);
 const postId=await h.post('alice');await h.answer('bob',postId);assert.equal(h.sent.length,0);
 Object.assign(h.env,configured);const secondPost=await h.post('alice');await h.answer('bob',secondPost);assert.equal(h.sent.length,0);assert.equal((await h.call('alice','/notification-settings')).data.enabled,false);
});

test('private offers, messages and likes never produce reply email notifications',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.optIn();const postId=await h.post('alice');
 const offered=await h.call('bob','/questions/'+postId+'/offers','POST',{message:'Sensitive private offer'});assert.equal(offered.status,201);const accepted=await h.call('alice','/offers/'+offered.data.id+'/accept','POST',{});assert.equal(accepted.status,200);
 assert.equal((await h.call('bob','/conversations/'+accepted.data.conversationId+'/messages','POST',{body:'Sensitive private message'})).status,201);assert.equal((await h.call('bob','/questions/'+postId+'/likes','POST')).status,200);
 assert.equal(h.sent.length,0);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM reply_notification_outbox').first()).n,0);
});

test('unsubscribe integration works without session or JSON/CSRF headers and GET does not change settings',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.optIn();const postId=await h.post('alice');await h.answer('bob',postId);
 const unsubscribe=h.sent[0].textContent.match(/https:\/\/drfrog.pages.dev\/api\/notification-unsubscribe\?token=([a-f0-9]{64})/);assert.ok(unsubscribe);
 const get=await handleApi(new Request(unsubscribe[0]),h.env,h.ctx);assert.equal(get.status,200);assert.match(get.headers.get('content-type'),/text\/html/);assert.equal((await h.call('alice','/notification-settings')).data.enabled,true);
 const post=await handleApi(new Request(origin+'/api/notification-unsubscribe',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:unsubscribe[1]})}),h.env,h.ctx);assert.equal(post.status,200);assert.equal((await h.call('alice','/notification-settings')).data.enabled,false);
 const secondPost=await h.post('alice');await h.answer('bob',secondPost);assert.equal(h.sent.length,1);
});

test('notification dispatch is a separate authenticated same-origin action and cannot accept destinations',async t=>{
 const h=harness(t);await h.join('alice');
 assert.equal((await h.call(null,'/notification-dispatch','POST',{})).status,401);assert.equal((await h.call('unfinished','/notification-dispatch','POST',{})).status,403);
 assert.equal((await h.call('alice','/notification-dispatch','POST',{},{Origin:'https://other.example'})).status,403);assert.equal((await h.call('alice','/notification-dispatch','POST',{},{'X-Common-Ground':'0'})).status,403);
 assert.equal((await h.call('alice','/notification-dispatch','POST',{email:'someone@example.test'})).status,400);assert.equal((await h.call('alice','/notification-dispatch','POST',{recipientId:'other'})).status,400);
 await h.dispatch('alice');assert.equal(h.sent.length,0);
});

test('cold configured publication, separate dispatch and account activity each stay within the free D1 query budget',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.join('eve');await h.optIn();const firstPost=await h.post('alice');
 let statements=0;
 const cold=()=>({...h.DB,prepare(sql){statements++;return h.DB.prepare(sql);}});
 h.env.DB=cold();const answerId=await h.answer('bob',firstPost,{deliver:false});assert.equal(h.sent.length,0);const answerStatements=statements;t.diagnostic('Cold answer publication and queue: '+answerStatements+' D1 statements');assert.ok(answerStatements<=50);
 statements=0;h.env.DB=cold();await h.dispatch('bob');assert.equal(h.sent.length,1);t.diagnostic('Cold answer dispatch and delivery: '+statements+' D1 statements');assert.ok(statements<=50);
 const secondPost=await h.post('alice');Object.assign(h.env,{NOTIFICATION_ENABLED:'0'});const secondAnswer=await h.answer('bob',secondPost);h.env.NOTIFICATION_ENABLED='1';
 statements=0;h.env.DB=cold();await h.reply('eve',secondAnswer,{deliver:false});assert.equal(h.sent.length,1);const followupStatements=statements;t.diagnostic('Cold follow-up publication and queue: '+followupStatements+' D1 statements');assert.ok(followupStatements<=50);
 statements=0;h.env.DB=cold();await h.dispatch('eve');assert.equal(h.sent.length,2);t.diagnostic('Cold follow-up dispatch and delivery: '+statements+' D1 statements');assert.ok(statements<=50);
 const thirdPost=await h.post('alice');await h.answer('bob',thirdPost,{deliver:false});statements=0;h.env.DB=cold();assert.equal((await h.call('alice','/me')).status,200);assert.equal(h.sent.length,3);t.diagnostic('Cold account check plus recipient delivery: '+statements+' D1 statements');assert.ok(statements<=50);
 assert.equal((await h.call('alice','/answers/'+answerId)).status,200);
});
