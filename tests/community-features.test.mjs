import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://community.example';
const profileInput={name:'Alice',group:'neurodivergent',role:'Student',university:'Test university',language:'zh',consent:true};
function harness(t,DB=localDatabase()){
 t.after(()=>DB.close());
 const env={DB,MODERATOR_EMAIL:'moderator@example.test'};
 async function call(user,path,method='GET',data){
  const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
  if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});
  const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
  return {status:response.status,data:await response.json()};
 }
 async function join(user,extra={}){const r=await call(user,'/profile','PUT',{...profileInput,name:user,...extra});assert.equal(r.status,200);return r.data.profile;}
 async function post(user,extra={}){const r=await call(user,'/questions','POST',{title:'How can our group plan together?',body:'I would like a clear schedule.',topic:'Studying',...extra});assert.equal(r.status,201);return r.data.id;}
 async function offer(user,postId){const r=await call(user,'/questions/'+postId+'/offers','POST',{message:'We could make a plan together.'});assert.equal(r.status,201);return r.data.id;}
 async function connect(author,helper,postId){const offerId=await offer(helper,postId);const r=await call(author,'/offers/'+offerId+'/accept','POST',{});assert.equal(r.status,200);return {offerId,conversationId:r.data.conversationId};}
 return {DB,env,call,join,post,offer,connect};
}

// Seed the pre-feature schema directly so bootstrap is tested independently of
// the normal localDatabase helper, which already applies every migration.
function legacyDatabase(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_lethal_polaris.sql','0001_auth_limits.sql'])sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const r=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}
 }
 return {prepare:sql=>new Statement(sql),exec:sql=>sqlite.exec(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}

test('communication preferences remain private unless shared and update across every peer surface',async t=>{
 const h=harness(t),shared={tags:['shortReplies','directExplanations'],preferredLanguage:'zh',visible:true},privatePrefs={tags:['slowReplies'],preferredLanguage:'en',visible:false};
 const own=await h.join('alice',{preferences:shared});assert.deepEqual(own.preferences,shared);
 await h.join('bob',{group:'neurotypical',preferences:privatePrefs});await h.join('eve');
 assert.deepEqual((await h.call('bob','/me')).data.profile.preferences,privatePrefs);
 const alicePost=await h.post('alice'),bobPost=await h.post('bob');
 const questions=(await h.call('eve','/questions')).data.questions;
 assert.deepEqual(questions.find(q=>q.id===alicePost).preferences,shared);
 assert.equal(questions.find(q=>q.id===bobPost).preferences,null);
 assert.deepEqual((await h.call('bob','/helpers')).data.helpers.find(p=>p.id==='alice').preferences,shared);
 assert.equal((await h.call('alice','/helpers')).data.helpers.find(p=>p.id==='bob').preferences,null);
 const connection=await h.connect('alice','bob',alicePost),aliceOffer=await h.offer('alice',bobPost);
 const aliceQuestions=(await h.call('alice','/questions')).data.questions;
 assert.equal(aliceQuestions.find(q=>q.id===alicePost).offers[0].preferences,null);
 assert.deepEqual((await h.call('bob','/questions')).data.questions.find(q=>q.id===bobPost).offers.find(o=>o.id===aliceOffer).preferences,shared);
 assert.equal((await h.call('eve','/questions')).data.questions.find(q=>q.id===bobPost).offers.length,0);
 assert.equal((await h.call('alice','/conversations')).data.conversations.find(c=>c.id===connection.conversationId).partnerPreferences,null);
 assert.deepEqual((await h.call('bob','/conversations')).data.conversations[0].partnerPreferences,shared);
 const hidden={...shared,visible:false};await h.join('alice',{preferences:hidden});
 assert.deepEqual((await h.call('alice','/me')).data.profile.preferences,hidden);
 assert.equal((await h.call('eve','/questions')).data.questions.find(q=>q.id===alicePost).preferences,null);
 assert.equal((await h.call('bob','/helpers')).data.helpers.find(p=>p.id==='alice').preferences,null);
 assert.equal((await h.call('bob','/questions')).data.questions.find(q=>q.id===bobPost).offers[0].preferences,null);
 assert.equal((await h.call('bob','/conversations')).data.conversations[0].partnerPreferences,null);
});

test('preference validation rejects unknown values and ordinary profile edits preserve the choices',async t=>{
 const h=harness(t),preferences={tags:['slowReplies'],preferredLanguage:'either',visible:true};
 await h.join('alice',{preferences});
 const invalid=[{...preferences,tags:['admin']},{...preferences,tags:'slowReplies'},{...preferences,preferredLanguage:'fr'},{...preferences,visible:'yes'}];
 for(const input of invalid)assert.equal((await h.call('alice','/profile','PUT',{...profileInput,preferences:input})).status,400);
 assert.deepEqual((await h.call('alice','/me')).data.profile.preferences,preferences);
 const edit=await h.call('alice','/profile','PUT',{...profileInput,name:'New name',university:'Another university'});
 assert.equal(edit.status,200);assert.equal(edit.data.profile.name,'New name');assert.deepEqual(edit.data.profile.preferences,preferences);
 assert.deepEqual((await h.join('bob')).preferences,{tags:[],preferredLanguage:'either',visible:false});
});

test('support kinds are optional and bounded; only the author can resolve and reopen a question',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob',{group:'neurotypical'});await h.join('eve');
 for(const supportKind of ['','listening','suggestions','perspective','experience']){
  const id=await h.post('alice',{supportKind});assert.equal((await h.call('bob','/questions')).data.questions.find(q=>q.id===id).supportKind,supportKind);
 }
 assert.equal((await h.call('alice','/questions','POST',{title:'Test',body:'Context',topic:'Studying',supportKind:'diagnose'})).status,400);
 const id=await h.post('bob');assert.equal((await h.call('alice','/questions')).data.questions.find(q=>q.id===id).supportKind,'');
 const connection=await h.connect('bob','alice',id);
 assert.equal((await h.call('alice','/questions/'+id+'/status','POST',{status:'resolved'})).status,404);
 assert.equal((await h.call('bob','/questions/'+id+'/status','POST',{status:'deleted'})).status,400);
 assert.equal((await h.call('bob','/questions/'+id+'/status','POST',{status:'resolved'})).status,200);
 assert.equal((await h.call('alice','/questions?status=resolved')).data.questions.find(q=>q.id===id).status,'resolved');
 assert.equal((await h.call('eve','/questions/'+id+'/offers','POST',{message:'A new offer'})).status,409);
 assert.equal((await h.call('alice','/conversations/'+connection.conversationId+'/messages','POST',{body:'Our existing conversation can continue.'})).status,201);
 assert.equal((await h.call('bob','/conversations/'+connection.conversationId+'/messages')).data.messages[0].body,'Our existing conversation can continue.');
 assert.equal((await h.call('bob','/questions/'+id+'/status','POST',{status:'open'})).status,200);
 assert.equal((await h.call('eve','/questions/'+id+'/offers','POST',{message:'An offer after reopening'})).status,201);
 assert.equal((await h.call('bob','/questions?status=bogus')).status,400);
});

test('awaiting questions are filtered before pagination and ignore declined or blocked offers',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.join('eve');await h.join('charlie');
 // More than a page of newer resolved questions must not conceal older waiting ones.
 for(let i=0;i<60;i++)await h.DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('resolved-'+String(i).padStart(3,'0'),'alice','Resolved','Context','Studying',200).run();
 for(let i=0;i<60;i++)assert.equal((await h.call('alice','/questions/resolved-'+String(i).padStart(3,'0')+'/status','POST',{status:'resolved'})).status,200);
 for(let i=0;i<55;i++)await h.DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('waiting-'+String(i).padStart(3,'0'),'alice','Waiting','Context','Studying',100).run();
 const pending=await h.offer('bob','waiting-054'),declined=await h.offer('bob','waiting-053'),blockedOffer=await h.offer('eve','waiting-052');
 assert.ok(pending&&blockedOffer);await h.call('alice','/offers/'+declined+'/decline','POST',{});
 await h.call('alice','/blocks','POST',{userId:'eve'});
 const first=(await h.call('alice','/questions?awaiting=1')).data,last=first.questions.at(-1);
 assert.equal(first.questions.length,50);assert.equal(first.hasMore,true);
 assert.ok(first.questions.every(q=>q.status==='open'));assert.ok(!first.questions.some(q=>q.id==='waiting-054'));
 assert.ok(first.questions.some(q=>q.id==='waiting-053'));assert.ok(first.questions.some(q=>q.id==='waiting-052'));
 const second=(await h.call('alice','/questions?awaiting=1&before='+last.created+'&beforeId='+last.id)).data;
 assert.equal(second.questions.length,4);assert.equal(second.hasMore,false);assert.equal(new Set([...first.questions,...second.questions].map(q=>q.id)).size,54);
 assert.equal((await h.call('eve','/questions?awaiting=1')).data.questions.length,0);
 const outsider=(await h.call('charlie','/questions?status=open')).data.questions.find(q=>q.id==='waiting-054');assert.equal(outsider.offers.length,0);
 assert.ok(!(await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id==='waiting-054'));
 await h.call('charlie','/blocks','POST',{userId:'bob'});
 assert.ok((await h.call('charlie','/questions?awaiting=1')).data.questions.some(q=>q.id==='waiting-054'));
});

test('takeaways require separate publication consent and disclose only the submitted text and topic',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 const postId=await h.post('alice'),connection=await h.connect('alice','bob',postId),privateText='PRIVATE conversation detail that must never be imported';
 await h.call('alice','/conversations/'+connection.conversationId+'/messages','POST',{body:privateText});
 const input={body:'Writing down the next steps helped our group.',topic:'Studying'};
 assert.equal((await h.call('alice','/takeaways','POST',input)).status,400);
 assert.equal((await h.call('alice','/takeaways','POST',{...input,publishConsent:false})).status,400);
 assert.equal((await h.call('alice','/takeaways','POST',{...input,publishConsent:'true'})).status,400);
 assert.equal((await h.call('alice','/takeaways')).data.takeaways.length,0);
 assert.equal((await h.call('alice','/takeaways','POST',{...input,publishConsent:true,conversationId:connection.conversationId,authorId:'bob',name:'Fake credit',university:'Private university'})).status,400);
 const published=await h.call('alice','/takeaways','POST',{...input,publishConsent:true});assert.equal(published.status,201);
 const own=(await h.call('alice','/takeaways')).data.takeaways[0],other=(await h.call('bob','/takeaways')).data.takeaways[0];
 assert.equal(own.id,published.data.id);assert.equal(own.mine,true);assert.equal(other.mine,false);assert.equal(other.body,input.body);assert.equal(other.topic,input.topic);
 assert.deepEqual(Object.keys(other).sort(),['body','created','id','mine','topic']);
 assert.doesNotMatch(JSON.stringify(other),new RegExp(privateText));assert.equal((await h.call('bob','/takeaways?topic=Communication')).data.takeaways.length,0);
 assert.equal((await h.call(null,'/takeaways')).status,401);assert.equal((await h.call('not-onboarded','/takeaways')).status,403);
 assert.equal((await h.call(null,'/takeaways','POST',{...input,publishConsent:true})).status,401);
 assert.equal((await h.call('not-onboarded','/takeaways','POST',{...input,publishConsent:true})).status,403);
 assert.equal((await h.call('bob','/takeaways/'+published.data.id,'DELETE')).status,404);
 assert.equal((await h.call('alice','/takeaways/'+published.data.id,'DELETE')).status,200);assert.equal((await h.call('bob','/takeaways')).data.takeaways.length,0);
 assert.equal((await h.call('bob','/conversations/'+connection.conversationId+'/messages')).data.messages[0].body,privateText);
});

test('takeaway moderation is restricted, keeps an anonymous report snapshot and respects blocks',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.join('moderator',{role:'Staff member'});
 const input={body:'A clear agenda helped us.',topic:'Communication',publishConsent:true};
 const published=await h.call('alice','/takeaways','POST',input);assert.equal(published.status,201);
 const report=await h.call('bob','/takeaways/'+published.data.id+'/reports','POST',{reason:'Please check this contribution.'});assert.equal(report.status,201);
 assert.equal((await h.call('bob','/reports')).status,403);assert.equal((await h.call('bob','/reports/'+report.data.id)).status,403);
 assert.equal((await h.call('bob','/reports/'+report.data.id+'/resolve','POST',{removeTakeaway:true})).status,403);
 const queue=(await h.call('moderator','/reports')).data.reports.find(r=>r.id===report.data.id);
 assert.equal(queue.takeawayId,published.data.id);assert.equal(queue.takeawayBody,input.body);assert.equal(queue.takeawayTopic,input.topic);
 assert.equal(queue.authorId,undefined);assert.equal(queue.author_id,undefined);assert.equal(queue.name,undefined);assert.equal(queue.university,undefined);
 await h.call('alice','/blocks','POST',{userId:'bob'});
 assert.equal((await h.call('bob','/takeaways')).data.takeaways.length,0);
 assert.equal((await h.call('bob','/takeaways/'+published.data.id+'/reports','POST',{reason:'Blocked lookup'})).status,404);
 assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',{removeTakeaway:true})).status,200);
 assert.equal((await h.call('alice','/takeaways')).data.takeaways.length,0);
 const resolved=(await h.call('moderator','/reports/'+report.data.id)).data;
 assert.equal(resolved.report.takeawayId,null);assert.equal(resolved.report.takeawayBody,input.body);assert.deepEqual(resolved.messages,[]);
 assert.equal((await h.call('moderator','/reports')).data.reports.length,0);
});

test('takeaway feeds validate topic and paginate all records with identical timestamps',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 for(const input of [{body:'',topic:'Studying',publishConsent:true},{body:'x'.repeat(1501),topic:'Studying',publishConsent:true},{body:'Helpful',topic:'Diagnosis',publishConsent:true}])assert.equal((await h.call('alice','/takeaways','POST',input)).status,400);
 assert.equal((await h.call('bob','/takeaways?topic=Diagnosis')).status,400);
 // Populate independent authored entries directly to isolate paging from rate limits.
 for(let i=0;i<60;i++)await h.DB.prepare('INSERT INTO takeaways(id,author_id,body,topic,consent_version,created) VALUES(?,?,?,?,?,?)').bind(String(i).padStart(3,'0'),'alice','Separate contribution '+i,'Studying','test-consent',100).run();
 const first=(await h.call('bob','/takeaways?topic=Studying')).data,last=first.takeaways.at(-1);
 const second=(await h.call('bob','/takeaways?topic=Studying&before='+last.created+'&beforeId='+last.id)).data;
 assert.equal(first.takeaways.length,50);assert.equal(first.hasMore,true);assert.equal(second.takeaways.length,10);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.takeaways,...second.takeaways].map(x=>x.id)).size,60);
});

test('additive bootstrap and migrations preserve pre-existing profiles, posts and private messages',async t=>{
 const DB=legacyDatabase(),h=harness(t,DB);
 for(const user of ['alice','bob'])await DB.prepare('INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?)').bind(user,'Existing '+user,'neurotypical','Student','Existing university','zh','original-consent',10).run();
 await DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('existing-post','alice','Original question','Original question detail','Studying',20).run();
 await DB.prepare('INSERT INTO offers(id,post_id,helper_id,body,status,created) VALUES(?,?,?,?,?,?)').bind('existing-offer','existing-post','bob','Original offer','accepted',30).run();
 await DB.prepare('INSERT INTO conversations(id,offer_id,post_id,author_id,helper_id,ended,created) VALUES(?,?,?,?,?,?,?)').bind('existing-conversation','existing-offer','existing-post','alice','bob',0,40).run();
 await DB.prepare('INSERT INTO messages(conversation_id,author_id,body,guide_id,created) VALUES(?,?,?,?,?)').bind('existing-conversation','bob','Original private message','communication',50).run();
 const me=await h.call('alice','/me');assert.equal(me.status,200);assert.equal(me.data.profile.name,'Existing alice');assert.equal(me.data.profile.created,10);
 assert.deepEqual(me.data.profile.preferences,{tags:[],preferredLanguage:'either',visible:false});
 let questions=(await h.call('bob','/questions')).data.questions;
 assert.equal(questions[0].title,'Original question');assert.equal(questions[0].body,'Original question detail');assert.equal(questions[0].status,'open');assert.equal(questions[0].supportKind,'');
 assert.equal((await h.call('alice','/conversations/existing-conversation/messages')).data.messages[0].body,'Original private message');
 assert.equal((await h.call('alice','/takeaways')).data.takeaways.length,0);
 const migrations=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!['0000_lethal_polaris.sql','0001_auth_limits.sql'].includes(f)).sort();assert.ok(migrations.length>0);
 for(const file of migrations)DB.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 assert.equal((await h.call('alice','/me')).data.profile.name,'Existing alice');questions=(await h.call('bob','/questions')).data.questions;assert.equal(questions.length,1);assert.equal(questions[0].id,'existing-post');
 assert.equal((await h.call('bob','/conversations/existing-conversation/messages')).data.messages.length,1);
 assert.equal((await DB.prepare('SELECT consent_version FROM profiles WHERE id=?').bind('alice').first()).consent_version,'original-consent');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM offers').first()).total,1);
});
