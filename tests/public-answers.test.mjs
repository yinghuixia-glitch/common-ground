import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://community.example';
const profileInput={group:'neurodivergent',role:'Student',university:'Example university',language:'zh',consent:true};
function harness(t,DB=localDatabase()){
 t.after(()=>DB.close());const env={DB,MODERATOR_EMAIL:'moderator@example.test'};
 async function call(user,path,method='GET',data,extra={}){
  const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
  if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);
  const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
  return {status:response.status,data:await response.json()};
 }
 async function join(user,extra={}){const r=await call(user,'/profile','PUT',{...profileInput,name:user,...extra});assert.equal(r.status,200);return r.data.profile;}
 async function post(user){const r=await call(user,'/questions','POST',{title:'How can our group understand each other?',body:'Different perspectives would help.',topic:'Communication'});assert.equal(r.status,201);return r.data.id;}
 async function answer(user,postId,body='A written agenda could help everyone prepare.'){const r=await call(user,'/questions/'+postId+'/answers','POST',{body,visibilityConsent:true});assert.equal(r.status,201);return r.data.id;}
 async function reply(user,answerId,body='Could you share an example?'){const r=await call(user,'/answers/'+answerId+'/replies','POST',{body,visibilityConsent:true});assert.equal(r.status,201);return r.data.id;}
 async function members(){for(const user of ['alice','bob','charlie','eve','moderator'])await join(user,{group:user==='bob'?'neurotypical':'neurodivergent'});}
 return {DB,env,call,join,post,answer,reply,members};
}

function preAnswersDatabase(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_lethal_polaris.sql','0001_auth_limits.sql','0002_community_features.sql'])sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const result=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}};}
 }
 return {prepare:sql=>new Statement(sql),exec:sql=>sqlite.exec(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},close:()=>sqlite.close()};
}

test('different members publish parallel answers and follow up without offers or acceptance',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice');
 const bobAnswer=await h.answer('bob',questionId,'Bob’s perspective'),charlieAnswer=await h.answer('charlie',questionId,'Charlie’s perspective');
 const listed=await h.call('eve','/questions/'+questionId+'/answers');assert.equal(listed.status,200);assert.equal(listed.data.answers.length,2);
 assert.equal(listed.data.answers.find(a=>a.id===bobAnswer).body,'Bob’s perspective');assert.equal(listed.data.answers.find(a=>a.id===charlieAnswer).body,'Charlie’s perspective');
 assert.equal(listed.data.answers.find(a=>a.id===bobAnswer).authorId,'bob');assert.equal(listed.data.answers.find(a=>a.id===bobAnswer).name,'bob');
 const first=await h.reply('alice',bobAnswer,'Could we try that in our next meeting?'),second=await h.reply('eve',bobAnswer,'Here is another example.'),third=await h.reply('charlie',bobAnswer,'I can contribute too.');
 const replies=(await h.call('bob','/answers/'+bobAnswer+'/replies')).data.replies;
 assert.deepEqual(replies.map(r=>r.id),[first,second,third]);assert.deepEqual(replies.map(r=>r.authorId),['alice','eve','charlie']);
 assert.equal((await h.call('eve','/questions/'+questionId+'/answers')).data.answers.find(a=>a.id===bobAnswer).replyCount,3);
 assert.equal((await h.call('alice','/questions/'+questionId)).data.question.answerCount,2);
 assert.equal((await h.call('alice','/questions')).data.questions.find(q=>q.id===questionId).answerCount,2);
 assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM offers').first()).n,0);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM conversations').first()).n,0);
 assert.equal((await h.call('alice','/questions/'+questionId+'/answers','POST',{body:'My own answer',visibilityConsent:true})).status,400);
 assert.equal((await h.call('bob','/questions/'+questionId+'/answers','POST',{body:'Second root by Bob',visibilityConsent:true})).status,409);
});

test('answer and reply preferences respect the author’s explicit sharing choice',async t=>{
 const h=harness(t),shared={tags:['shortReplies'],preferredLanguage:'either',visible:true},hidden={tags:['directExplanations','slowReplies'],preferredLanguage:'zh',visible:false};
 await h.join('alice');await h.join('bob',{group:'neurotypical',preferences:hidden});await h.join('charlie',{preferences:shared});await h.join('eve');
 const questionId=await h.post('alice'),bobAnswer=await h.answer('bob',questionId),charlieAnswer=await h.answer('charlie',questionId);
 const rows=(await h.call('eve','/questions/'+questionId+'/answers')).data.answers;
 assert.equal(rows.find(a=>a.id===bobAnswer).preferences,null);assert.deepEqual(rows.find(a=>a.id===charlieAnswer).preferences,shared);
 const bobReply=await h.reply('bob',charlieAnswer),charlieReply=await h.reply('charlie',bobAnswer);
 assert.equal((await h.call('eve','/answers/'+charlieAnswer+'/replies')).data.replies.find(r=>r.id===bobReply).preferences,null);
 assert.deepEqual((await h.call('eve','/answers/'+bobAnswer+'/replies')).data.replies.find(r=>r.id===charlieReply).preferences,shared);
 await h.join('charlie',{preferences:{...shared,visible:false}});
 assert.equal((await h.call('eve','/questions/'+questionId+'/answers')).data.answers.find(a=>a.id===charlieAnswer).preferences,null);
 assert.equal((await h.call('eve','/answers/'+bobAnswer+'/replies')).data.replies.find(r=>r.id===charlieReply).preferences,null);
 assert.deepEqual((await h.call('bob','/me')).data.profile.preferences,hidden);
});

test('public discussions preserve the privacy and acceptance requirements of existing private chats',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice');
 const offer=await h.call('bob','/questions/'+questionId+'/offers','POST',{message:'PRIVATE offer text'});assert.equal(offer.status,201);
 assert.equal((await h.call('eve','/questions')).data.questions.find(q=>q.id===questionId).offers.length,0);
 assert.equal((await h.call('eve','/offers/'+offer.data.id+'/accept','POST',{})).status,404);
 const connection=await h.call('alice','/offers/'+offer.data.id+'/accept','POST',{});assert.equal(connection.status,200);const conversationId=connection.data.conversationId;
 await h.call('bob','/conversations/'+conversationId+'/messages','POST',{body:'PRIVATE existing conversation message'});
 const answerId=await h.answer('charlie',questionId);await h.reply('eve',answerId);
 const publicData=JSON.stringify((await h.call('eve','/questions/'+questionId+'/answers')).data)+JSON.stringify((await h.call('eve','/answers/'+answerId+'/replies')).data);
 assert.doesNotMatch(publicData,/PRIVATE/);assert.equal((await h.call('eve','/conversations')).data.conversations.length,0);
 assert.equal((await h.call('eve','/conversations/'+conversationId+'/messages')).status,404);
 assert.equal((await h.call('eve','/conversations/'+conversationId+'/messages','POST',{body:'A forbidden private reply'})).status,404);
 assert.equal((await h.call('alice','/conversations/'+conversationId+'/messages')).data.messages[0].body,'PRIVATE existing conversation message');
});

test('discussion reads and writes require authenticated complete profiles, same-origin writes and publication consent',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId),payload={body:'Public contribution',visibilityConsent:true};
 for(const [path,method] of [['/questions/'+questionId+'/answers','GET'],['/questions/'+questionId+'/answers','POST'],['/answers/'+answerId+'/replies','GET'],['/answers/'+answerId+'/replies','POST']]){
  assert.equal((await h.call(null,path,method,method==='POST'?payload:undefined)).status,401);
  assert.equal((await h.call('unfinished-profile',path,method,method==='POST'?payload:undefined)).status,403);
 }
 for(const path of ['/questions/'+questionId+'/answers','/answers/'+answerId+'/replies']){
  for(const consent of [undefined,false,'true'])assert.equal((await h.call('charlie',path,'POST',{body:'Unapproved publication',...(consent===undefined?{}:{visibilityConsent:consent})})).status,400);
  assert.equal((await h.call('charlie',path,'POST',payload,{Origin:'https://attacker.example'})).status,403);
  assert.equal((await h.call('charlie',path,'POST',payload,{'X-Common-Ground':''})).status,403);
  assert.equal((await h.call('charlie',path,'POST',{body:' ',visibilityConsent:true})).status,400);
  assert.equal((await h.call('charlie',path,'POST',{body:'x'.repeat(2001),visibilityConsent:true})).status,400);
 }
 assert.equal((await h.call('alice','/questions/'+questionId+'/answers')).data.answers.length,1);
 assert.equal((await h.call('alice','/answers/'+answerId+'/replies')).data.replies.length,0);
 Object.assign(h.env,{AUTH_PROVIDER:'firebase',FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-key',FIREBASE_APP_ID:'test-app'});
 assert.equal((await h.call('alice','/questions/'+questionId+'/answers')).status,401);
 assert.equal((await h.call('alice','/answers/'+answerId+'/replies','POST',payload)).status,401);
});

test('blocks hide the question, answer lane or individual comment belonging to the relevant person',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),bobAnswer=await h.answer('bob',questionId),charlieAnswer=await h.answer('charlie',questionId);
 const eveReply=await h.reply('eve',charlieAnswer,'Eve’s comment'),bobReply=await h.reply('bob',charlieAnswer,'Bob’s comment');
 await h.call('eve','/blocks','POST',{userId:'bob'});
 const eveRoots=(await h.call('eve','/questions/'+questionId+'/answers')).data.answers;assert.deepEqual(eveRoots.map(a=>a.id),[charlieAnswer]);
 assert.equal((await h.call('eve','/questions/'+questionId)).data.question.answerCount,1);
 assert.equal((await h.call('eve','/answers/'+bobAnswer+'/replies')).status,404);
 assert.equal((await h.call('eve','/answers/'+bobAnswer+'/replies','POST',{body:'Blocked lane',visibilityConsent:true})).status,404);
 assert.deepEqual((await h.call('eve','/answers/'+charlieAnswer+'/replies')).data.replies.map(r=>r.id),[eveReply]);
 // Two other people blocking each other must not hide their authored public comments from Alice.
 assert.deepEqual((await h.call('alice','/answers/'+charlieAnswer+'/replies')).data.replies.map(r=>r.id),[eveReply,bobReply]);
 await h.call('alice','/blocks','POST',{userId:'eve'});
 assert.equal((await h.call('eve','/questions/'+questionId)).status,404);assert.equal((await h.call('eve','/questions/'+questionId+'/answers')).status,404);
 assert.equal((await h.call('eve','/questions/'+questionId+'/answers','POST',{body:'Blocked question',visibilityConsent:true})).status,404);
 assert.equal((await h.call('eve','/answers/'+charlieAnswer+'/replies','POST',{body:'Blocked question follow-up',visibilityConsent:true})).status,404);
 assert.ok(!(await h.call('eve','/questions')).data.questions.some(q=>q.id===questionId));
 assert.deepEqual((await h.call('alice','/answers/'+charlieAnswer+'/replies')).data.replies.map(r=>r.id),[bobReply]);
 await h.call('alice','/blocks/eve','DELETE');await h.call('charlie','/blocks','POST',{userId:'eve'});
 assert.equal((await h.call('eve','/answers/'+charlieAnswer+'/replies')).status,404);
 assert.equal((await h.call('alice','/questions/'+questionId)).data.question.answerCount,2);
 await h.call('bob','/blocks','POST',{userId:'alice'});
 assert.equal((await h.call('bob','/questions/'+questionId+'/answers')).status,404);
 assert.ok((await h.call('charlie','/questions/'+questionId+'/answers')).data.answers.some(a=>a.id===bobAnswer));
});

test('public roots count as responses and resolution stops new lanes while existing follow-ups continue',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice');
 assert.ok((await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id===questionId));
 const answerId=await h.answer('bob',questionId);
 assert.ok(!(await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id===questionId));
 await h.call('charlie','/blocks','POST',{userId:'bob'});
 assert.equal((await h.call('charlie','/questions/'+questionId)).data.question.answerCount,0);
 assert.ok((await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id===questionId));
 assert.equal((await h.call('alice','/questions/'+questionId+'/status','POST',{status:'resolved'})).status,200);
 const denied=await h.call('eve','/questions/'+questionId+'/answers','POST',{body:'A new lane after resolution',visibilityConsent:true});assert.equal(denied.status,409);assert.equal(denied.data.error,'questionResolved');
 const followup=await h.reply('eve',answerId,'We can still discuss the existing suggestion.');
 assert.ok((await h.call('alice','/answers/'+answerId+'/replies')).data.replies.some(r=>r.id===followup));
 assert.ok(!(await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id===questionId));
 await h.call('alice','/questions/'+questionId+'/status','POST',{status:'open'});
 assert.equal((await h.call('eve','/questions/'+questionId+'/answers','POST',{body:'A new lane after reopening',visibilityConsent:true})).status,201);
});

test('only the content author can delete an answer or comment and root deletion removes its discussion',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId),eveReply=await h.reply('eve',answerId),aliceReply=await h.reply('alice',answerId);
 assert.equal((await h.call('bob','/replies/'+eveReply,'DELETE')).status,404);
 assert.equal((await h.call('alice','/replies/'+eveReply,'DELETE')).status,404);
 assert.equal((await h.call('eve','/replies/'+eveReply,'DELETE')).status,200);
 assert.deepEqual((await h.call('charlie','/answers/'+answerId+'/replies')).data.replies.map(r=>r.id),[aliceReply]);
 assert.equal((await h.call('alice','/answers/'+answerId,'DELETE')).status,404);
 assert.equal((await h.call('charlie','/answers/'+answerId,'DELETE')).status,404);
 assert.equal((await h.call('bob','/answers/'+answerId,'DELETE')).status,200);
 assert.equal((await h.call('charlie','/questions/'+questionId+'/answers')).data.answers.length,0);
 assert.equal((await h.call('charlie','/answers/'+answerId+'/replies')).status,404);
 assert.equal((await h.call('alice','/replies/'+aliceReply,'DELETE')).status,404);
 assert.equal((await h.call('charlie','/questions/'+questionId)).data.question.answerCount,0);
});

test('answer reports are moderator-only and retain their public context when the author deletes the answer',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId,'A reported root contribution');
 const report=await h.call('eve','/reports','POST',{answerId,reason:'Please review this answer.'});assert.equal(report.status,201);
 assert.equal((await h.call('bob','/reports')).status,403);assert.equal((await h.call('bob','/reports/'+report.data.id)).status,403);
 assert.equal((await h.call('bob','/reports/'+report.data.id+'/resolve','POST',{removeAnswer:true})).status,403);
 const item=(await h.call('moderator','/reports')).data.reports.find(r=>r.id===report.data.id);
 assert.equal(item.answerTarget,'answer');assert.equal(item.answerId,answerId);assert.equal(item.replyId,null);assert.equal(item.answerBody,'A reported root contribution');assert.equal(item.replyBody,null);
 assert.equal(item.questionTitle,'How can our group understand each other?');assert.equal(item.questionBody,'Different perspectives would help.');
 await h.call('bob','/answers/'+answerId,'DELETE');
 const detail=(await h.call('moderator','/reports/'+report.data.id)).data;assert.equal(detail.report.answerId,null);assert.equal(detail.report.answerTarget,'answer');assert.equal(detail.report.answerBody,'A reported root contribution');assert.deepEqual(detail.messages,[]);
 assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',{})).status,200);
 const secondAnswer=await h.answer('charlie',questionId,'A second reviewed contribution'),secondReport=await h.call('eve','/reports','POST',{answerId:secondAnswer,reason:'A second concern.'});assert.equal(secondReport.status,201);
 assert.equal((await h.call('moderator','/reports/'+secondReport.data.id+'/resolve','POST',{removeReply:true})).status,400);
 assert.equal((await h.call('moderator','/reports/'+secondReport.data.id+'/resolve','POST',{removeAnswer:true})).status,200);
 assert.equal((await h.call('alice','/questions/'+questionId+'/answers')).data.answers.length,0);
 assert.equal((await h.call('moderator','/reports/'+secondReport.data.id)).data.report.answerBody,'A second reviewed contribution');
 assert.equal((await h.call('moderator','/reports')).data.reports.length,0);
});

test('reply moderation removes only the reported comment and preserves snapshots after further deletion',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId,'Original root'),replyId=await h.reply('eve',answerId,'Reported follow-up'),otherReply=await h.reply('alice',answerId,'A different follow-up');
 assert.equal((await h.call('charlie','/reports','POST',{answerId,replyId,reason:'Mixed targets'})).status,400);
 assert.equal((await h.call('charlie','/reports','POST',{replyId,postId:questionId,reason:'Mixed targets'})).status,400);
 const report=await h.call('charlie','/reports','POST',{replyId,reason:'Please review this follow-up.'});assert.equal(report.status,201);
 const before=(await h.call('moderator','/reports/'+report.data.id)).data;assert.equal(before.report.answerTarget,'reply');assert.equal(before.report.answerId,answerId);assert.equal(before.report.replyId,replyId);assert.equal(before.report.answerBody,'Original root');assert.equal(before.report.replyBody,'Reported follow-up');assert.deepEqual(before.messages,[]);
 assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',{removeAnswer:true})).status,400);
 assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',{removeReply:true})).status,200);
 assert.deepEqual((await h.call('alice','/answers/'+answerId+'/replies')).data.replies.map(r=>r.id),[otherReply]);
 const after=(await h.call('moderator','/reports/'+report.data.id)).data.report;assert.equal(after.replyId,null);assert.equal(after.answerId,answerId);assert.equal(after.replyBody,'Reported follow-up');
 await h.call('bob','/answers/'+answerId,'DELETE');
 const deleted=(await h.call('moderator','/reports/'+report.data.id)).data.report;assert.equal(deleted.answerId,null);assert.equal(deleted.replyId,null);assert.equal(deleted.answerTarget,'reply');assert.equal(deleted.answerBody,'Original root');assert.equal(deleted.replyBody,'Reported follow-up');assert.equal(deleted.questionBody,'Different perspectives would help.');
});

test('reporting cannot reveal a blocked question, root author or commenter',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId),replyId=await h.reply('eve',answerId);
 await h.call('charlie','/blocks','POST',{userId:'eve'});
 assert.equal((await h.call('charlie','/reports','POST',{replyId,reason:'A blocked comment'})).status,404);
 await h.call('charlie','/blocks','POST',{userId:'bob'});
 assert.equal((await h.call('charlie','/reports','POST',{answerId,reason:'A blocked root'})).status,404);
 assert.equal((await h.call('charlie','/reports','POST',{replyId,reason:'A blocked lane'})).status,404);
 await h.call('charlie','/blocks/bob','DELETE');await h.call('charlie','/blocks/eve','DELETE');await h.call('alice','/blocks','POST',{userId:'charlie'});
 assert.equal((await h.call('charlie','/reports','POST',{answerId,reason:'A blocked question'})).status,404);
 assert.equal((await h.call('charlie','/reports','POST',{replyId,reason:'A blocked question comment'})).status,404);
 assert.equal((await h.call('moderator','/reports')).data.reports.length,0);
});

test('answer pagination preserves equal timestamps, filters blocks first and locates an author’s lane on later pages',async t=>{
 const h=harness(t);await h.join('alice');await h.join('eve');const questionId=await h.post('alice');
 for(let i=0;i<25;i++){
  const suffix=String(i).padStart(3,'0');await h.join('helper-'+suffix);
  await h.DB.prepare('INSERT INTO question_answers(id,post_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?,?)').bind('root-'+suffix,questionId,'helper-'+suffix,'Perspective '+i,'test-publication',100).run();
 }
 const first=(await h.call('eve','/questions/'+questionId+'/answers')).data,last=first.answers.at(-1);
 const second=(await h.call('eve','/questions/'+questionId+'/answers?before='+last.created+'&beforeId='+last.id)).data;
 assert.equal(first.answers.length,20);assert.equal(first.hasMore,true);assert.equal(second.answers.length,5);assert.equal(second.hasMore,false);assert.equal(new Set([...first.answers,...second.answers].map(a=>a.id)).size,25);
 const owner=(await h.call('helper-000','/questions/'+questionId+'/answers')).data;assert.equal(owner.ownAnswerId,'root-000');assert.ok(!owner.answers.some(a=>a.mine));
 const ownDetail=await h.call('helper-000','/answers/root-000');assert.equal(ownDetail.status,200);assert.equal(ownDetail.data.answer.mine,true);assert.equal(ownDetail.data.answer.body,'Perspective 0');
 for(let i=20;i<25;i++)await h.call('eve','/blocks','POST',{userId:'helper-'+String(i).padStart(3,'0')});
 const visible=(await h.call('eve','/questions/'+questionId+'/answers')).data;assert.equal(visible.answers.length,20);assert.equal(visible.hasMore,false);assert.ok(visible.answers.every(a=>Number(a.id.slice(-3))<20));
 assert.equal((await h.call('eve','/questions/'+questionId)).data.question.answerCount,20);
 assert.equal((await h.call('eve','/answers/root-024')).status,404);
 assert.equal((await h.call('eve','/questions/'+questionId+'/answers?before=-1')).status,400);
});

test('follow-up history pages chronologically before and after cursors without including blocked commenters',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice'),answerId=await h.answer('bob',questionId);
 for(let i=1;i<=70;i++)await h.DB.prepare('INSERT INTO question_answer_replies(answer_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?)').bind(answerId,i<=60?'bob':'eve','Follow-up '+i,'test-publication',100).run();
 await h.call('charlie','/blocks','POST',{userId:'eve'});
 const latest=(await h.call('charlie','/answers/'+answerId+'/replies')).data;assert.equal(latest.replies.length,50);assert.equal(latest.hasMore,true);assert.equal(latest.replies[0].id,11);assert.equal(latest.replies.at(-1).id,60);assert.ok(latest.replies.every(r=>r.authorId==='bob'));
 const earlier=(await h.call('charlie','/answers/'+answerId+'/replies?before='+latest.replies[0].id)).data;assert.equal(earlier.replies.length,10);assert.equal(earlier.hasMore,false);assert.deepEqual(earlier.replies.map(r=>r.id),Array.from({length:10},(_,i)=>i+1));
 const afterStart=(await h.call('charlie','/answers/'+answerId+'/replies?after=0')).data;assert.equal(afterStart.replies.length,50);assert.equal(afterStart.hasMore,true);assert.equal(afterStart.replies[0].id,1);assert.equal(afterStart.replies.at(-1).id,50);
 const newer=(await h.call('charlie','/answers/'+answerId+'/replies?after=50')).data;assert.deepEqual(newer.replies.map(r=>r.id),Array.from({length:10},(_,i)=>i+51));assert.equal(newer.hasMore,false);
 assert.equal((await h.call('charlie','/answers/'+answerId)).data.answer.replyCount,60);
 assert.equal((await h.call('alice','/answers/'+answerId)).data.answer.replyCount,70);
 assert.equal((await h.call('charlie','/answers/'+answerId+'/replies?after=1.5')).status,400);
});

test('new discussion bootstrap and migration preserve existing private chats, preferences and takeaways',async t=>{
 const DB=preAnswersDatabase(),h=harness(t,DB);
 for(const user of ['alice','bob'])await DB.prepare('INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?)').bind(user,'Existing '+user,'neurotypical','Student','Existing university','zh','old-consent',10).run();
 await DB.prepare('INSERT INTO profile_preferences(user_id,tags_json,preferred_language,visible,updated) VALUES(?,?,?,?,?)').bind('alice','["slowReplies"]','zh',1,10).run();
 await DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('existing-post','alice','Original question','Original context','Studying',20).run();
 await DB.prepare('INSERT INTO question_features(post_id,support_kind,status,updated) VALUES(?,?,?,?)').bind('existing-post','perspective','open',20).run();
 await DB.prepare('INSERT INTO offers(id,post_id,helper_id,body,status,created) VALUES(?,?,?,?,?,?)').bind('existing-offer','existing-post','bob','PRIVATE old offer','accepted',30).run();
 await DB.prepare('INSERT INTO conversations(id,offer_id,post_id,author_id,helper_id,ended,created) VALUES(?,?,?,?,?,?,?)').bind('existing-conversation','existing-offer','existing-post','alice','bob',0,40).run();
 await DB.prepare('INSERT INTO messages(conversation_id,author_id,body,guide_id,created) VALUES(?,?,?,?,?)').bind('existing-conversation','bob','PRIVATE old message','communication',50).run();
 await DB.prepare('INSERT INTO takeaways(id,author_id,body,topic,consent_version,created) VALUES(?,?,?,?,?,?)').bind('existing-takeaway','alice','Original authored takeaway','Studying','old-publication',60).run();
 const first=await h.call('alice','/me');assert.equal(first.status,200);assert.deepEqual(first.data.profile.preferences,{tags:['slowReplies'],preferredLanguage:'zh',visible:true});assert.equal(first.data.profile.created,10);
 assert.equal((await h.call('bob','/questions/existing-post')).data.question.answerCount,0);
 const answerId=await h.answer('bob','existing-post','A new public answer');await h.reply('alice',answerId,'A new public follow-up');
 const migrations=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!['0000_lethal_polaris.sql','0001_auth_limits.sql','0002_community_features.sql'].includes(f)).sort();assert.ok(migrations.length>0);
 for(const file of migrations){const sql=fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8');DB.exec(sql);DB.exec(sql);}
 assert.equal((await h.call('bob','/questions/existing-post')).data.question.supportKind,'perspective');assert.equal((await h.call('bob','/questions/existing-post')).data.question.body,'Original context');
 assert.equal((await h.call('alice','/conversations/existing-conversation/messages')).data.messages[0].body,'PRIVATE old message');
 assert.equal((await h.call('alice','/questions')).data.questions[0].offers[0].text,'PRIVATE old offer');
 assert.equal((await h.call('bob','/takeaways')).data.takeaways[0].body,'Original authored takeaway');
 assert.equal((await h.call('bob','/questions/existing-post/answers')).data.answers.length,1);assert.equal((await h.call('bob','/answers/'+answerId+'/replies')).data.replies.length,1);
 assert.equal((await DB.prepare('SELECT consent_version FROM profiles WHERE id=?').bind('alice').first()).consent_version,'old-consent');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM offers').first()).n,1);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM messages').first()).n,1);
});

test('simultaneous submissions still create exactly one answer lane for each member',async t=>{
 const h=harness(t);await h.members();const questionId=await h.post('alice');
 const results=await Promise.all(['First attempt','Second attempt'].map(body=>h.call('bob','/questions/'+questionId+'/answers','POST',{body,visibilityConsent:true})));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(results.find(r=>r.status===409).data.error,'alreadyAnswered');
 assert.equal((await h.call('charlie','/questions/'+questionId+'/answers')).data.answers.length,1);
});

test('public answer and reply bursts are bounded across questions and threads',async t=>{
 const h=harness(t);await h.members();
 // Separate existing questions avoid conflating the per-member burst limit with
 // the one-answer-per-question rule or the existing question-posting limit.
 for(let i=0;i<11;i++)await h.DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('burst-'+i,'alice','Question '+i,'Context','Studying',100).run();
 const answers=[];for(let i=0;i<10;i++)answers.push(await h.answer('bob','burst-'+i));
 assert.equal((await h.call('bob','/questions/burst-10/answers','POST',{body:'Over the root limit',visibilityConsent:true})).status,429);
 for(let i=0;i<30;i++)await h.reply('eve',answers[i%answers.length],'Follow-up '+i);
 assert.equal((await h.call('eve','/answers/'+answers[0]+'/replies','POST',{body:'Over the reply limit',visibilityConsent:true})).status,429);
 assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM question_answers').first()).n,10);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM question_answer_replies').first()).n,30);
});
