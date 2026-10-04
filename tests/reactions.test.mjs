import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://community.example';
const profile={group:'neurodivergent',role:'Student',university:'Example university',language:'en',consent:true};
function harness(t,DB=localDatabase()){
 t.after(()=>DB.close());const env={DB};
 async function call(user,path,method='GET',data,extra={}){
  const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
  if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);
  const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
  return {status:response.status,data:await response.json()};
 }
 async function join(user){assert.equal((await call(user,'/profile','PUT',{...profile,name:user})).status,200);}
 async function post(user){const r=await call(user,'/questions','POST',{title:'A shared question',body:'Question context.',topic:'Studying'});assert.equal(r.status,201);return r.data.id;}
 async function answer(user,postId){const r=await call(user,'/questions/'+postId+'/answers','POST',{body:'A useful answer.',visibilityConsent:true});assert.equal(r.status,201);return r.data.id;}
 async function like(user,kind,id,method='POST'){const r=await call(user,'/'+(kind==='question'?'questions':'answers')+'/'+id+'/likes',method);assert.equal(r.status,200);assert.deepEqual(Object.keys(r.data).sort(),['likeCount','liked']);return r.data;}
 return {DB,env,call,join,post,answer,like};
}
function preReactionsDatabase(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0005')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const result=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}};}
 }
 return {prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}

test('each member can like questions and answers once, including their own, and unlike only their acknowledgement',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 assert.deepEqual(await h.like('alice','question',postId),{likeCount:1,liked:true});assert.deepEqual(await h.like('alice','question',postId),{likeCount:1,liked:true});assert.deepEqual(await h.like('bob','question',postId),{likeCount:2,liked:true});
 assert.deepEqual(await h.like('charlie','question',postId,'DELETE'),{likeCount:2,liked:false});assert.deepEqual(await h.like('alice','question',postId,'DELETE'),{likeCount:1,liked:false});assert.deepEqual(await h.like('alice','question',postId,'DELETE'),{likeCount:1,liked:false});
 assert.deepEqual(await h.like('bob','answer',answerId),{likeCount:1,liked:true});assert.deepEqual(await h.like('charlie','answer',answerId),{likeCount:2,liked:true});assert.deepEqual(await h.like('bob','answer',answerId,'DELETE'),{likeCount:1,liked:false});
 assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM question_likes').first()).n,1);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM answer_likes').first()).n,1);
});

test('feed and detail responses expose bounded counts and the current member state without a liker roster',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie','eve'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 await h.like('charlie','question',postId);await h.like('eve','question',postId);await h.like('eve','answer',answerId);
 for(const user of ['alice','charlie','eve']){
  const question=(await h.call(user,'/questions/'+postId)).data.question,listed=(await h.call(user,'/questions')).data.questions[0],answer=(await h.call(user,'/answers/'+answerId)).data.answer,lane=(await h.call(user,'/questions/'+postId+'/answers')).data.answers[0];
  for(const row of [question,listed]){assert.equal(row.likeCount,2);assert.equal(row.liked,user!=='alice');assert.equal(row.likers,undefined);assert.equal(row.likerIds,undefined);}
  for(const row of [answer,lane]){assert.equal(row.likeCount,1);assert.equal(row.liked,user==='eve');assert.equal(row.likers,undefined);assert.equal(row.likerIds,undefined);}
 }
 await h.like('eve','answer',answerId,'DELETE');assert.equal((await h.call('eve','/answers/'+answerId)).data.answer.likeCount,0);assert.equal((await h.call('eve','/answers/'+answerId)).data.answer.liked,false);
});

test('simultaneous repeated likes remain one row per member and independent members accumulate',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie','eve'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 const results=await Promise.all(Array.from({length:6},()=>h.call('charlie','/questions/'+postId+'/likes','POST')));assert.ok(results.every(r=>r.status===200&&r.data.likeCount===1&&r.data.liked));
 const answers=await Promise.all(['charlie','charlie','eve','eve'].map(user=>h.call(user,'/answers/'+answerId+'/likes','POST')));assert.ok(answers.every(r=>r.status===200));assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM answer_likes WHERE answer_id=?').bind(answerId).first()).n,2);
 assert.equal((await h.call('eve','/questions/'+postId+'/answers')).data.answers[0].likeCount,2);
});

test('blocking in either direction hides inaccessible targets and excludes blocked acknowledgements from visible counts',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie','eve'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 for(const user of ['bob','charlie','eve'])await h.like(user,'question',postId);for(const user of ['charlie','eve'])await h.like(user,'answer',answerId);
 await h.call('eve','/blocks','POST',{userId:'charlie'});assert.equal((await h.call('eve','/questions/'+postId)).data.question.likeCount,2);assert.equal((await h.call('eve','/answers/'+answerId)).data.answer.likeCount,1);
 await h.call('bob','/blocks','POST',{userId:'eve'});assert.equal((await h.call('eve','/questions/'+postId)).data.question.likeCount,1);assert.equal((await h.call('eve','/questions/'+postId+'/answers')).data.answers.length,0);
 for(const method of ['POST','DELETE'])assert.deepEqual(await h.call('eve','/answers/'+answerId+'/likes',method),{status:404,data:{error:'notFound'}});
 await h.call('alice','/blocks','POST',{userId:'eve'});for(const method of ['POST','DELETE'])assert.deepEqual(await h.call('eve','/questions/'+postId+'/likes',method),{status:404,data:{error:'notFound'}});assert.equal((await h.call('eve','/questions')).data.questions.length,0);
 await h.call('alice','/blocks/eve','DELETE');await h.call('bob','/blocks/eve','DELETE');await h.call('eve','/blocks/charlie','DELETE');assert.equal((await h.call('eve','/questions/'+postId)).data.question.likeCount,3);assert.equal((await h.call('eve','/answers/'+answerId)).data.answer.likeCount,2);
});

test('author deletion removes dependent likes and deleted target endpoints never return counts',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);await h.like('charlie','question',postId);await h.like('charlie','answer',answerId);
 await h.call('bob','/answers/'+answerId,'DELETE');assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM answer_likes').first()).n,0);for(const method of ['POST','DELETE'])assert.deepEqual(await h.call('charlie','/answers/'+answerId+'/likes',method),{status:404,data:{error:'notFound'}});
 const newAnswer=await h.answer('bob',postId);await h.like('charlie','answer',newAnswer);await h.call('alice','/questions/'+postId,'DELETE');assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM question_likes').first()).n,0);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM answer_likes').first()).n,0);
 for(const method of ['POST','DELETE'])assert.deepEqual(await h.call('charlie','/questions/'+postId+'/likes',method),{status:404,data:{error:'notFound'}});
});

test('deleted member records remove their reactions without changing another author’s question',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);await h.like('charlie','question',postId);await h.like('charlie','answer',answerId);
 await h.DB.prepare('DELETE FROM profiles WHERE id=?').bind('charlie').run();const question=(await h.call('alice','/questions/'+postId)).data.question,answer=(await h.call('alice','/answers/'+answerId)).data.answer;assert.equal(question.likeCount,0);assert.equal(answer.likeCount,0);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM reaction_write_limits WHERE user_id=?').bind('charlie').first()).n,0);
});

test('reaction writes require complete authenticated members, same-origin requests, and no identity-spoofing body',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 for(const path of ['/questions/'+postId+'/likes','/answers/'+answerId+'/likes'])for(const method of ['POST','DELETE']){
  assert.equal((await h.call(null,path,method)).status,401);assert.equal((await h.call('unfinished',path,method)).status,403);assert.equal((await h.call('alice',path,method,undefined,{Origin:'https://other.example'})).status,403);assert.equal((await h.call('alice',path,method,undefined,{'X-Common-Ground':'0'})).status,403);
  assert.equal((await h.call('alice',path,method,{userId:'bob'})).status,400);assert.equal((await h.call('alice',path,method,{likers:['bob']})).status,400);
 }
 assert.equal((await h.call('alice','/questions/'+postId+'/likes')).status,405);assert.equal((await h.call('alice','/questions/'+postId+'/likes','PUT',{})).status,405);assert.equal((await h.call('alice','/questions/'+postId+'/likes','POST',{body:'x'.repeat(17000)})).status,413);
 assert.equal((await h.call('alice','/questions/missing/likes','POST')).status,404);assert.equal((await h.call('alice','/answers/missing/likes','DELETE')).status,404);
 assert.deepEqual(await h.like('alice','question',postId),{likeCount:1,liked:true});
});

test('durable reaction rate limits survive unlikes, include idempotent writes, and enforce concurrent final allowance',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');const postId=await h.post('alice');await h.like('bob','question',postId);await h.like('bob','question',postId,'DELETE');assert.equal((await h.DB.prepare('SELECT total FROM reaction_write_limits WHERE user_id=?').bind('bob').first()).total,2);
 await h.DB.prepare('UPDATE reaction_write_limits SET window_start=?,total=119 WHERE user_id=?').bind(Math.floor(Date.now()/60000),'bob').run();const attempts=await Promise.all([h.call('bob','/questions/'+postId+'/likes','POST'),h.call('bob','/questions/'+postId+'/likes','POST')]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,429]);
 assert.equal((await h.call('bob','/questions/'+postId+'/likes','DELETE')).status,429);assert.equal((await h.call('bob','/questions/'+postId)).data.question.liked,true);assert.equal((await h.call('alice','/questions/'+postId+'/likes','POST')).status,200);
 await h.DB.prepare('UPDATE reaction_write_limits SET window_start=window_start-1 WHERE user_id=?').bind('bob').run();assert.deepEqual(await h.like('bob','question',postId,'DELETE'),{likeCount:1,liked:false});
});

test('likes preserve chronological question/answer pagination, enrich whole pages, and stay below the cold free D1 query budget',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.call('bob','/questions');const questionId=await h.post('alice');
 for(let i=0;i<55;i++){
  const postId='page-post-'+String(i).padStart(3,'0');await h.DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind(postId,'alice','Page question','Context','Studying',100).run();
  await h.DB.prepare('INSERT INTO question_likes(post_id,user_id,created) VALUES(?,?,?)').bind(postId,'bob',200).run();
 }
 for(let i=0;i<23;i++){
  const user='helper-'+i,answerId='page-answer-'+String(i).padStart(3,'0');await h.join(user);await h.DB.prepare('INSERT INTO question_answers(id,post_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?,?)').bind(answerId,questionId,user,'A page answer','test',100).run();await h.DB.prepare('INSERT INTO answer_likes(answer_id,user_id,created) VALUES(?,?,?)').bind(answerId,'bob',200).run();
 }
 let statements=0;const cold=()=>({...h.DB,prepare(sql){statements++;return h.DB.prepare(sql);}});h.env.DB=cold();
 const first=(await h.call('bob','/questions')).data;assert.equal(first.questions.length,50);assert.equal(first.hasMore,true);assert.ok(first.questions.filter(q=>q.id!==questionId).every(q=>q.likeCount===1&&q.liked));assert.ok(statements<50,'Question statements: '+statements);
 const last=first.questions.at(-1),second=(await h.call('bob','/questions?before='+last.created+'&beforeId='+last.id)).data;assert.equal(second.questions.length,6);assert.equal(new Set([...first.questions,...second.questions].map(q=>q.id)).size,56);
 statements=0;h.env.DB=cold();const lanes=(await h.call('bob','/questions/'+questionId+'/answers')).data;assert.equal(lanes.answers.length,20);assert.ok(lanes.answers.every(a=>a.likeCount===1&&a.liked));assert.ok(statements<50,'Answer statements: '+statements);const lastAnswer=lanes.answers.at(-1),older=(await h.call('bob','/questions/'+questionId+'/answers?before='+lastAnswer.created+'&beforeId='+lastAnswer.id)).data;assert.equal(older.answers.length,3);assert.equal(new Set([...lanes.answers,...older.answers].map(a=>a.id)).size,23);
});

test('reaction tables bootstrap additively on an existing deployment and preserve community content',async t=>{
 const h=harness(t,preReactionsDatabase());await h.join('alice');await h.join('bob');const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 const question=(await h.call('bob','/questions/'+postId)).data.question;assert.equal(question.likeCount,0);assert.equal(question.liked,false);assert.deepEqual(await h.like('bob','question',postId),{likeCount:1,liked:true});assert.deepEqual(await h.like('alice','answer',answerId),{likeCount:1,liked:true});
 assert.equal((await h.call('alice','/questions')).data.questions[0].title,'A shared question');assert.equal((await h.call('alice','/answers/'+answerId)).data.answer.body,'A useful answer.');assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n,2);
});
