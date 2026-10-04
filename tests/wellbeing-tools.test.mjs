import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const origin='https://community.example';
const profile={group:'neurodivergent',role:'Student',university:'Example university',language:'en',consent:true};
const questionDraft={kind:'question',title:'Unfinished question',body:'',topic:'Studying',supportKind:'listening'};
const planInput={title:'Start my assignment',steps:[{text:'Open the brief',done:false},{text:'Write one question',done:false}],remindAt:Date.UTC(2030,0,1,10),remindMinutes:30};
const spaceInput={university:'Example university',place:'Library second floor',description:'Soft lamps in the rear corner; quieter in the morning.',noise:'quiet',lighting:'soft',crowding:'low',seating:'yes',breakSpace:true,observedOn:'2026-10-01',timeOfDay:'morning',publishConsent:true};
function harness(t,DB=localDatabase()){
 t.after(()=>DB.close());const env={DB,MODERATOR_EMAIL:'moderator@example.test'};
 async function call(user,path,method='GET',data,extra={}){
  const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
  if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);
  const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
  return {status:response.status,data:await response.json()};
 }
 async function join(user){const r=await call(user,'/profile','PUT',{...profile,name:user});assert.equal(r.status,200);}
 async function post(user){const r=await call(user,'/questions','POST',{title:'A shared question',body:'Original question context.',topic:'Studying'});assert.equal(r.status,201);return r.data.id;}
 async function answer(user,postId){const r=await call(user,'/questions/'+postId+'/answers','POST',{body:'A useful answer.',visibilityConsent:true});assert.equal(r.status,201);return r.data.id;}
 async function space(user,extra={}){const r=await call(user,'/campus-spaces','POST',{...spaceInput,...extra});assert.equal(r.status,201);return r.data.id;}
 return {DB,env,call,join,post,answer,space};
}
function preWellbeingDatabase(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0004')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const result=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}};}
 }
 return {prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}

test('private drafts and plans resume across requests without appearing for another member',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 const saved=await h.call('alice','/workspace/drafts/question','PUT',{...questionDraft,expectedUpdated:null});assert.equal(saved.status,200);assert.equal(saved.data.draft.body,'');assert.equal(saved.data.draft.key,'question');
 const template=await h.call('alice','/workspace/drafts/template%3Aclarify%3Azh','PUT',{kind:'template',templateId:'clarify',language:'zh',body:'请说明下一步。'});assert.equal(template.status,200);
 const planId=crypto.randomUUID();assert.equal((await h.call('alice','/workspace/plans/'+planId,'PUT',planInput)).status,200);
 const workspace=(await h.call('alice','/workspace')).data;assert.equal(workspace.drafts.length,2);assert.equal(workspace.plans[0].id,planId);assert.deepEqual(workspace.plans[0].steps,planInput.steps);assert.equal(workspace.plans[0].remindMinutes,30);
 assert.deepEqual((await h.call('bob','/workspace')).data,{drafts:[],bookmarks:[],plans:[]});
 assert.equal((await h.call('bob','/workspace/plans/'+planId,'DELETE')).status,404);assert.equal((await h.call('bob','/workspace/drafts/question','DELETE')).status,200);assert.equal((await h.call('alice','/workspace')).data.drafts.length,2);
 assert.equal((await h.call('alice','/workspace/drafts/question','DELETE')).status,200);assert.equal((await h.call('alice','/workspace/plans/'+planId,'DELETE')).status,200);assert.equal((await h.call('alice','/workspace')).data.plans.length,0);
 assert.equal((await h.call('bob','/questions')).data.questions.length,0);
});

test('expectedUpdated prevents a stale browser from overwriting newer drafts and plan steps',async t=>{
 const h=harness(t);await h.join('alice');
 const first=(await h.call('alice','/workspace/drafts/question','PUT',{...questionDraft,expectedUpdated:null})).data.draft;
 const second=await h.call('alice','/workspace/drafts/question','PUT',{...questionDraft,title:'Newer draft',expectedUpdated:first.updated});assert.equal(second.status,200);assert.ok(second.data.draft.updated>first.updated);
 for(const expectedUpdated of [null,first.updated]){const stale=await h.call('alice','/workspace/drafts/question','PUT',{...questionDraft,title:'Stale browser',expectedUpdated});assert.equal(stale.status,409);assert.equal(stale.data.error,'workspaceConflict');}
 assert.equal((await h.call('alice','/workspace')).data.drafts[0].title,'Newer draft');
 const staleDelete=await h.call('alice','/workspace/drafts/question','DELETE',{expectedUpdated:first.updated});assert.equal(staleDelete.status,409);assert.equal(staleDelete.data.error,'workspaceConflict');assert.equal((await h.call('alice','/workspace')).data.drafts[0].title,'Newer draft');
 assert.equal((await h.call('alice','/workspace/drafts/question','DELETE',{expectedUpdated:second.data.draft.updated})).status,200);assert.equal((await h.call('alice','/workspace')).data.drafts.length,0);
 const planId=crypto.randomUUID(),saved=(await h.call('alice','/workspace/plans/'+planId,'PUT',{...planInput,expectedUpdated:null})).data.plan;
 const update={...planInput,steps:[{text:'Open the brief',done:true}],expectedUpdated:saved.updated};assert.equal((await h.call('alice','/workspace/plans/'+planId,'PUT',update)).status,200);
 const conflict=await h.call('alice','/workspace/plans/'+planId,'PUT',update);assert.equal(conflict.status,409);assert.equal(conflict.data.error,'workspaceConflict');assert.equal((await h.call('alice','/workspace')).data.plans[0].steps[0].done,true);
});

test('saved questions and answers are references to live accessible text, respecting blocking and deletion',async t=>{
 const h=harness(t);for(const user of ['alice','bob','charlie'])await h.join(user);const postId=await h.post('alice'),answerId=await h.answer('bob',postId);
 const bookmark=(await h.call('charlie','/workspace/bookmarks','POST',{kind:'question',targetId:postId})).data.bookmark;assert.equal(bookmark.postId,postId);
 const answerBookmark=await h.call('charlie','/workspace/bookmarks','POST',{kind:'answer',targetId:answerId});assert.equal(answerBookmark.status,201);assert.equal(answerBookmark.data.bookmark.body,'A useful answer.');assert.equal(answerBookmark.data.bookmark.postId,postId);
 const again=await h.call('charlie','/workspace/bookmarks','POST',{kind:'question',targetId:postId});assert.equal(again.data.bookmark.id,bookmark.id);assert.equal((await h.call('charlie','/workspace')).data.bookmarks.length,2);
 assert.equal((await h.call('alice','/workspace')).data.bookmarks.length,0);assert.equal((await h.call('alice','/workspace/bookmarks/'+bookmark.id,'DELETE')).status,404);
 await h.DB.prepare('UPDATE posts SET title=?,body=? WHERE id=?').bind('Edited question','Updated question context.',postId).run();await h.DB.prepare('UPDATE question_answers SET body=? WHERE id=?').bind('Edited useful answer.',answerId).run();
 const current=(await h.call('charlie','/workspace')).data.bookmarks;assert.equal(current.find(b=>b.kind==='question').body,'Updated question context.');assert.equal(current.find(b=>b.kind==='answer').body,'Edited useful answer.');assert.ok(current.every(b=>b.title==='Edited question'));
 await h.call('charlie','/blocks','POST',{userId:'bob'});const blockedBookmarks=(await h.call('charlie','/workspace')).data.bookmarks;assert.equal(blockedBookmarks.filter(b=>b.available).length,1);assert.deepEqual(blockedBookmarks.find(b=>b.kind==='answer'),{id:answerBookmark.data.bookmark.id,kind:'answer',available:false});assert.equal((await h.call('charlie','/workspace/bookmarks','POST',{kind:'answer',targetId:answerId})).status,404);
 await h.call('charlie','/blocks/bob','DELETE');await h.call('alice','/blocks','POST',{userId:'charlie'});assert.equal((await h.call('charlie','/workspace')).data.bookmarks.filter(b=>b.available).length,0);
 await h.call('alice','/blocks/charlie','DELETE');await h.call('bob','/answers/'+answerId,'DELETE');assert.equal((await h.call('charlie','/workspace')).data.bookmarks.filter(b=>b.available).length,1);
 await h.call('alice','/questions/'+postId,'DELETE');const deleted=(await h.call('charlie','/workspace')).data.bookmarks;assert.equal(deleted.filter(b=>b.available).length,0);assert.ok(deleted.every(b=>Object.keys(b).sort().join(',')==='available,id,kind'));
 assert.equal((await h.call('charlie','/workspace/bookmarks/'+bookmark.id,'DELETE')).status,200);
});

test('workspace validation rejects oversized, mismatched, unknown and invalid reminder content',async t=>{
 const h=harness(t);await h.join('alice');
 for(const data of [{...questionDraft,title:'x'.repeat(141)},{...questionDraft,body:'x'.repeat(2001)},{...questionDraft,topic:'Clinical'},{...questionDraft,supportKind:'diagnosis'},{...questionDraft,ownerId:'bob'},{...questionDraft,expectedUpdated:'now'}])assert.equal((await h.call('alice','/workspace/drafts/question','PUT',data)).status,400);
 assert.equal((await h.call('alice','/workspace/drafts/template%3Aclarify%3Azh','PUT',{kind:'template',templateId:'clarify',language:'en',body:'Mismatch'})).status,400);
 assert.equal((await h.call('alice','/workspace/drafts/template%3Aclarify%3Azh','PUT',{kind:'template',templateId:'clarify',language:'zh',body:'x'.repeat(3001)})).status,400);
 assert.equal((await h.call('alice','/workspace/drafts/bad%2Fkey','PUT',questionDraft)).status,400);
 const planId=crypto.randomUUID();for(const data of [{...planInput,title:''},{...planInput,steps:[]},{...planInput,steps:Array(21).fill({text:'Step',done:false})},{...planInput,steps:[{text:'Step',done:'yes'}]},{...planInput,steps:[{text:'x'.repeat(201),done:false}]},{...planInput,remindAt:'tomorrow'},{...planInput,remindAt:-1},{...planInput,remindMinutes:7},{...planInput,steps:[{text:'Step',done:false,author:'bob'}]}])assert.equal((await h.call('alice','/workspace/plans/'+planId,'PUT',data)).status,400);
 assert.equal((await h.call('alice','/workspace/plans/not-a-uuid','PUT',planInput)).status,400);
 for(const data of [{kind:'private-message',targetId:'chat'},{kind:'question',targetId:'missing'},{kind:'question',targetId:'missing',body:'Copied content'}])assert.ok([400,404].includes((await h.call('alice','/workspace/bookmarks','POST',data)).status));
 assert.deepEqual((await h.call('alice','/workspace')).data,{drafts:[],bookmarks:[],plans:[]});
});

test('workspace caps and minute limits bound storage while permitting existing entries to be edited',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.call('alice','/workspace');
 for(let i=0;i<30;i++)await h.DB.prepare('INSERT INTO workspace_plans(id,user_id,title,steps_json,created,updated) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'alice','Existing plan','[{"text":"Step","done":false}]',i,i).run();
 assert.equal((await h.call('alice','/workspace/plans/'+crypto.randomUUID(),'PUT',planInput)).data.error,'workspaceFull');const existing=(await h.call('alice','/workspace')).data.plans[0];assert.equal((await h.call('alice','/workspace/plans/'+existing.id,'PUT',planInput)).status,200);
 for(let i=0;i<21;i++)await h.DB.prepare('INSERT INTO workspace_drafts(user_id,draft_key,kind,created,updated) VALUES(?,?,?,?,?)').bind('alice','template:old'+i+':en','template',i,i).run();
 assert.equal((await h.call('alice','/workspace/drafts/question','PUT',questionDraft)).data.error,'workspaceFull');assert.equal((await h.call('alice','/workspace/drafts/template:old0:en','PUT',{kind:'template',templateId:'old0',language:'en',body:'Edited'})).status,200);
 const postId=await h.post('bob');for(let i=0;i<100;i++)await h.DB.prepare('INSERT INTO workspace_bookmarks(id,user_id,kind,target_id,created) VALUES(?,?,?,?,?)').bind('old-'+i,'alice','question','missing-'+i,i).run();
 assert.equal((await h.call('alice','/workspace/bookmarks','POST',{kind:'question',targetId:postId})).data.error,'workspaceFull');await h.call('alice','/workspace/bookmarks/old-0','DELETE');assert.equal((await h.call('alice','/workspace/bookmarks','POST',{kind:'question',targetId:postId})).status,201);
 await h.DB.prepare('UPDATE workspace_write_limits SET window_start=?,total=60 WHERE user_id=?').bind(Math.floor(Date.now()/60000),'alice').run();assert.equal((await h.call('alice','/workspace/drafts/template:old0:en','DELETE')).status,429);
 await h.DB.prepare('UPDATE workspace_write_limits SET window_start=window_start-1 WHERE user_id=?').bind('alice').run();assert.equal((await h.call('alice','/workspace/drafts/template:old0:en','DELETE')).status,200);
});

test('campus space publication requires consent and exposes dated member observations with own deletion',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');assert.equal((await h.call('alice','/campus-spaces','POST',{...spaceInput,publishConsent:false})).status,400);
 const id=await h.space('alice'),own=(await h.call('alice','/campus-spaces')).data.spaces[0],other=(await h.call('bob','/campus-spaces')).data.spaces[0];
 assert.equal(own.id,id);assert.equal(own.mine,true);assert.equal(other.mine,false);assert.equal(other.authorId,'alice');assert.equal(other.name,'alice');assert.equal(other.observedOn,'2026-10-01');assert.equal(other.breakSpace,true);assert.equal(other.university,'Example university');assert.equal(other.profileUniversity,'Example university');assert.equal(other.consent_version,undefined);
 assert.equal((await h.call('bob','/campus-spaces/'+id,'DELETE')).status,404);assert.equal((await h.call('alice','/campus-spaces/'+id,'DELETE')).status,200);assert.equal((await h.call('bob','/campus-spaces')).data.spaces.length,0);
});

test('campus filters escape search wildcards and apply before stable pagination and blocking',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.join('charlie');await h.call('alice','/campus-spaces');
 for(let i=0;i<35;i++)await h.DB.prepare('INSERT INTO campus_spaces(id,author_id,university,place,description,noise,lighting,crowding,seating,break_space,observed_on,time_of_day,consent_version,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('space-'+String(i).padStart(3,'0'),'alice','Example university','Library','Description','quiet','soft','low','yes',1,'2026-10-01','morning','test',100).run();
 await h.space('charlie',{university:'Other university',noise:'loud'});
 const first=(await h.call('bob','/campus-spaces?university=Example&noise=quiet&lighting=soft&crowding=low')).data;assert.equal(first.spaces.length,30);assert.equal(first.hasMore,true);const last=first.spaces.at(-1),second=(await h.call('bob','/campus-spaces?university=Example&noise=quiet&before='+last.created+'&beforeId='+last.id)).data;assert.equal(second.spaces.length,5);assert.equal(second.hasMore,false);assert.equal(new Set([...first.spaces,...second.spaces].map(s=>s.id)).size,35);
 assert.equal((await h.call('bob','/campus-spaces?university=%25')).data.spaces.length,0);assert.equal((await h.call('bob','/campus-spaces?noise=bogus')).status,400);assert.equal((await h.call('bob','/campus-spaces?before=-1')).status,400);
 await h.call('alice','/blocks','POST',{userId:'bob'});const visible=(await h.call('bob','/campus-spaces')).data.spaces;assert.equal(visible.length,1);assert.equal(visible[0].name,'charlie');
 assert.equal((await h.call('bob','/campus-spaces/space-034/reports','POST',{reason:'Hidden'})).status,404);
});

test('campus reports preserve reviewable snapshots after author deletion and enforce moderator target boundaries',async t=>{
 const h=harness(t);for(const user of ['alice','bob','moderator'])await h.join(user);const spaceId=await h.space('alice'),report=await h.call('bob','/campus-spaces/'+spaceId+'/reports','POST',{reason:'The description needs review.'});assert.equal(report.status,201);
 assert.equal((await h.call('bob','/reports')).status,403);assert.equal((await h.call('bob','/reports/'+report.data.id)).status,403);assert.equal((await h.call('bob','/reports/'+report.data.id+'/resolve','POST',{removeCampusSpace:true})).status,403);
 for(const data of [{removeTakeaway:true},{removeAnswer:true},{removeReply:true},{removeCampusSpace:'yes'},{removeCampusSpace:true,removeReply:true}])assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',data)).status,400);
 const queue=(await h.call('moderator','/reports')).data.reports[0];assert.equal(queue.campusSpaceId,spaceId);assert.equal(queue.campusSpacePlace,spaceInput.place);assert.equal(queue.campusSpaceUniversity,spaceInput.university);assert.equal(queue.campusSpaceDescription,spaceInput.description);
 await h.call('alice','/campus-spaces/'+spaceId,'DELETE');const detail=(await h.call('moderator','/reports/'+report.data.id)).data;assert.equal(detail.report.campusSpaceId,null);assert.equal(detail.report.campusSpaceDescription,spaceInput.description);assert.deepEqual(detail.messages,[]);assert.equal((await h.call('moderator','/reports/'+report.data.id+'/resolve','POST',{removeCampusSpace:true})).status,200);
 const second=await h.space('alice'),secondReport=(await h.call('bob','/campus-spaces/'+second+'/reports','POST',{reason:'Remove this observation.'})).data.id;assert.equal((await h.call('moderator','/reports/'+secondReport+'/resolve','POST',{removeCampusSpace:true})).status,200);assert.equal((await h.call('bob','/campus-spaces')).data.spaces.length,0);
 const questionId=await h.post('alice'),questionReport=(await h.call('bob','/reports','POST',{postId:questionId,reason:'Question report'})).data.id;assert.equal((await h.call('moderator','/reports/'+questionReport+'/resolve','POST',{removeCampusSpace:true})).status,400);assert.equal((await h.call('moderator','/reports/'+questionReport+'/resolve','POST',{removeTakeaway:true})).status,400);
});

test('campus input validation prevents fabricated metadata and bounds publishing and report rates',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 const invalid=[{...spaceInput,university:''},{...spaceInput,university:'x'.repeat(121)},{...spaceInput,place:'x'.repeat(121)},{...spaceInput,description:'x'.repeat(1201)},{...spaceInput,noise:'silent'},{...spaceInput,lighting:'dark'},{...spaceInput,crowding:'empty'},{...spaceInput,seating:'plenty'},{...spaceInput,breakSpace:'true'},{...spaceInput,observedOn:'2026-02-30'},{...spaceInput,observedOn:'9999-12-31'},{...spaceInput,timeOfDay:'noon'},{...spaceInput,authorId:'bob'},{...spaceInput,latitude:10}];
 for(const data of invalid)assert.equal((await h.call('alice','/campus-spaces','POST',data)).status,400);
 const id=await h.space('alice');for(let i=1;i<5;i++)await h.space('alice');assert.equal((await h.call('alice','/campus-spaces','POST',spaceInput)).status,429);
 assert.equal((await h.call('bob','/campus-spaces/'+id+'/reports','POST',{reason:'Review',postId:'unrelated'})).status,400);for(let i=0;i<5;i++)assert.equal((await h.call('bob','/campus-spaces/'+id+'/reports','POST',{reason:'Review'})).status,201);assert.equal((await h.call('bob','/campus-spaces/'+id+'/reports','POST',{reason:'Review'})).status,429);
});

test('new tools require signed-in completed members and reject cross-origin or unbounded requests',async t=>{
 const h=harness(t);await h.join('alice');const planId=crypto.randomUUID();
 for(const [path,method,data] of [['/workspace','GET'],['/workspace/drafts/question','PUT',questionDraft],['/workspace/plans/'+planId,'PUT',planInput],['/campus-spaces','GET'],['/campus-spaces','POST',spaceInput]]){
  assert.equal((await h.call(null,path,method,data)).status,401);assert.equal((await h.call('unfinished',path,method,data)).status,403);
 }
 assert.equal((await h.call('alice','/workspace/drafts/question','PUT',questionDraft,{Origin:'https://other.example'})).status,403);assert.equal((await h.call('alice','/campus-spaces','POST',spaceInput,{'X-Common-Ground':'0'})).status,403);
 assert.equal((await h.call('alice','/workspace/drafts/question','PUT',{...questionDraft,body:'x'.repeat(17000)})).status,413);
 assert.equal((await h.call('alice','/workspace','POST',{})).status,404);
});

test('feature schemas bootstrap from the existing deployment schema without modifying legacy community records',async t=>{
 const h=harness(t,preWellbeingDatabase());await h.join('alice');const questionId=await h.post('alice');
 assert.deepEqual((await h.call('alice','/workspace')).data,{drafts:[],bookmarks:[],plans:[]});assert.equal((await h.call('alice','/workspace/drafts/question','PUT',questionDraft)).status,200);assert.equal((await h.call('alice','/workspace/plans/'+crypto.randomUUID(),'PUT',planInput)).status,200);await h.space('alice');
 assert.equal((await h.call('alice','/questions')).data.questions[0].id,questionId);assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n,1);
});

test('simultaneous private plan writes enforce capacity and allow exactly one matching revision update',async t=>{
 const h=harness(t);await h.join('alice');await h.call('alice','/workspace');
 for(let i=0;i<29;i++)await h.DB.prepare('INSERT INTO workspace_plans(id,user_id,title,steps_json,created,updated) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'alice','Existing plan','[{"text":"Step","done":false}]',i,i).run();
 const ids=[crypto.randomUUID(),crypto.randomUUID()],created=await Promise.all(ids.map(id=>h.call('alice','/workspace/plans/'+id,'PUT',{...planInput,expectedUpdated:null})));assert.deepEqual(created.map(r=>r.status).sort(),[200,409]);assert.equal((await h.call('alice','/workspace')).data.plans.length,30);
 const saved=created.find(r=>r.status===200).data.plan,updates=await Promise.all(['First edit','Second edit'].map(title=>h.call('alice','/workspace/plans/'+saved.id,'PUT',{...planInput,title,expectedUpdated:saved.updated})));assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);assert.equal(updates.find(r=>r.status===409).data.error,'workspaceConflict');
 const stored=(await h.call('alice','/workspace')).data.plans.find(p=>p.id===saved.id);assert.equal(stored.title,updates.find(r=>r.status===200).data.plan.title);
});

test('reading a full saved list stays below the free D1 per-request query allowance on a cold database handle',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');await h.call('alice','/workspace');
 for(let i=0;i<100;i++){
  await h.DB.prepare('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)').bind('saved-post-'+i,'bob','Saved question','Current text','Studying',i).run();
  await h.DB.prepare('INSERT INTO workspace_bookmarks(id,user_id,kind,target_id,created) VALUES(?,?,?,?,?)').bind('bookmark-'+i,'alice','question','saved-post-'+i,i).run();
 }
 let statements=0;h.env.DB={...h.DB,prepare(sql){statements++;return h.DB.prepare(sql);}};
 const saved=await h.call('alice','/workspace');assert.equal(saved.status,200);assert.equal(saved.data.bookmarks.length,100);assert.ok(saved.data.bookmarks.every(b=>b.available));assert.ok(statements<50,'Actual statements: '+statements);
});

test('campus publication allowance survives deletion, rejects simultaneous overflow, and resets in a later minute',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 for(let i=0;i<4;i++){const id=await h.space('alice');assert.equal((await h.call('alice','/campus-spaces/'+id,'DELETE')).status,200);}
 const attempts=await Promise.all([h.call('alice','/campus-spaces','POST',spaceInput),h.call('alice','/campus-spaces','POST',spaceInput)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[201,429]);
 const last=attempts.find(r=>r.status===201).data.id;assert.equal((await h.call('alice','/campus-spaces/'+last,'DELETE')).status,200);assert.equal((await h.call('alice','/campus-spaces','POST',spaceInput)).status,429);assert.equal((await h.call('alice','/campus-spaces')).data.spaces.length,0);
 assert.equal((await h.call('bob','/campus-spaces','POST',spaceInput)).status,201);
 await h.DB.prepare('UPDATE campus_space_publish_limits SET window_start=window_start-1 WHERE user_id=?').bind('alice').run();assert.equal((await h.call('alice','/campus-spaces','POST',spaceInput)).status,201);
});
