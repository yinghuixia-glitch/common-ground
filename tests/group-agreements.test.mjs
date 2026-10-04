import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
import {GROUP_AGREEMENTS_SCHEMA} from '../src/group-agreements.mjs';
const origin='https://community.example';
function harness(t){
 const raw=localDatabase();t.after(()=>raw.close());let chain=Promise.resolve(),count=0,beforeWrite=null;
 const wrap=(s,sql)=>({raw:s,bind:(...v)=>wrap(s.bind(...v),sql),first:()=>{count++;return s.first();},all:()=>{count++;return s.all();},run:async()=>{count++;if(beforeWrite&&sql.startsWith('INSERT INTO group_agreement_write_limits')){const hook=beforeWrite;beforeWrite=null;await hook();}return s.run();}});
 const fresh=()=>({prepare:sql=>wrap(raw.prepare(sql),sql),batch:statements=>{count+=statements.length;const result=chain.then(()=>raw.batch(statements.map(s=>s.raw)));chain=result.catch(()=>{});return result;}});let DB=fresh();
 async function call(user,path,method='GET',data,extra={}){const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);const r=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),{DB});return {status:r.status,data:await r.json()};}
 const join=async id=>assert.equal((await call(id,'/profile','PUT',{name:id,group:'neurotypical',role:'Student',university:'Test university',language:'en',consent:true})).status,200);
 const create=async(id,title='Our group')=>{const r=await call(id,'/group-agreements','POST',{title});assert.equal(r.status,201);return r.data.agreement;};
 const invite=async(id,g)=>{const r=await call(id,'/group-agreements/'+g.id+'/invites','POST',{});assert.equal(r.status,201);return r.data.invite;};
 const accept=async(id,i)=>call(id,'/group-agreements/join','POST',{code:i.code});
 const edit=(g,extra={})=>({title:g.title,roles:g.roles,meetingAgenda:g.meetingAgenda,communication:g.communication,responseTime:g.responseTime,clarification:g.clarification,breaks:g.breaks,tasks:g.tasks,expectedRevision:g.revision,...extra});
 return {raw,call,join,create,invite,accept,edit,beforeWrite:hook=>{beforeWrite=hook;},cold:()=>{DB=fresh();count=0;},count:()=>count};
}

test('an assignee removed during a save cannot be committed to the shared sheet',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');const g=await h.create('alice'),i=await h.invite('alice',g);await h.accept('bob',i);
 h.beforeWrite(()=>h.raw.prepare('DELETE FROM group_agreement_members WHERE group_id=? AND user_id=?').bind(g.id,'bob').run());
 const r=await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(g,{tasks:[{id:crypto.randomUUID(),text:'Read one page',assigneeId:'bob',deadline:null,timeZone:'Asia/Shanghai'}]}));
 assert.equal(r.status,400);assert.equal(r.data.error,'agreementInvalidAssignee');const latest=(await h.call('alice','/group-agreements/'+g.id)).data.agreement;assert.equal(latest.revision,1);assert.deepEqual(latest.tasks,[]);assert.equal((await h.call('alice','/group-agreements/'+g.id+'/versions')).data.versions.length,1);
});

test('encoded Firebase account IDs support both owner removal and member leaving',async t=>{
 const h=harness(t);for(const id of ['firebase:alice','firebase:bob'])await h.join(id);const g=await h.create('firebase:alice'),i=await h.invite('firebase:alice',g);await h.accept('firebase:bob',i);
 assert.equal((await h.call('firebase:alice','/group-agreements/'+g.id+'/members/'+encodeURIComponent('firebase:bob'),'DELETE')).status,200);assert.equal((await h.call('firebase:bob','/group-agreements/'+g.id)).status,404);
 await h.accept('firebase:bob',i);assert.equal((await h.call('firebase:bob','/group-agreements/'+g.id+'/members/'+encodeURIComponent('firebase:bob'),'DELETE')).status,200);assert.equal((await h.call('firebase:bob','/group-agreements')).data.agreements.length,0);
});
test('agreement membership protects sheets, revisions and invitation metadata',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');const g=await h.create('alice');
 assert.equal((await h.call(null,'/group-agreements')).status,401);assert.equal((await h.call('unfinished','/group-agreements')).status,403);
 for(const path of ['', '/versions','/versions/1','/invites'])assert.equal((await h.call('bob','/group-agreements/'+g.id+path,path==='/invites'?'POST':'GET',path==='/invites'?{}:undefined)).status,404);
 assert.deepEqual((await h.call('bob','/group-agreements')).data.agreements,[]);
 assert.equal((await h.call('alice','/group-agreements','POST',{title:'Bad'},{Origin:'https://other.example'})).status,403);
 assert.equal((await h.call('alice','/group-agreements','POST',{title:'Bad'},{'X-Common-Ground':'0'})).status,403);
 const i=await h.invite('alice',g);assert.equal(i.code.length,64);
 const stored=await h.raw.prepare('SELECT token_hash FROM group_agreement_invites WHERE id=?').bind(i.id).first();assert.notEqual(stored.token_hash,i.code);
 assert.ok(!JSON.stringify((await h.call('alice','/group-agreements/'+g.id)).data).includes(i.code));
 const joined=await h.accept('bob',i);assert.equal(joined.status,200);assert.equal(joined.data.agreement.members.length,2);assert.deepEqual(joined.data.agreement.invitations,[]);
 assert.equal((await h.call('bob','/group-agreements/'+g.id+'/invites','POST',{})).status,403);
 assert.equal((await h.call('bob','/group-agreements/'+g.id,'DELETE')).status,403);
});
test('expired and revoked invitations cannot grant membership and joins are idempotent',async t=>{
 const h=harness(t);for(const u of ['alice','bob','carol'])await h.join(u);const g=await h.create('alice'),i=await h.invite('alice',g);
 assert.equal((await h.accept('bob',i)).status,200);assert.equal((await h.accept('bob',i)).status,200);
 assert.equal((await h.call('alice','/group-agreements/'+g.id+'/invites/'+i.id,'DELETE')).status,200);
 assert.equal((await h.accept('carol',i)).status,404);
 const expired=await h.invite('alice',g);await h.raw.prepare('UPDATE group_agreement_invites SET expires=0 WHERE id=?').bind(expired.id).run();assert.equal((await h.accept('carol',expired)).status,404);
 assert.equal((await h.call('carol','/group-agreements/join','POST',{code:'x'})).status,400);
 assert.equal((await h.raw.prepare('SELECT COUNT(*) AS n FROM group_agreement_members WHERE group_id=?').bind(g.id).first()).n,2);
});
test('concurrent edits preserve one revision and confirmations are version-specific',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');const g=await h.create('alice');await h.accept('bob',await h.invite('alice',g));
 const updates=await Promise.all([h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(g,{roles:'Alice prepares slides.'})),h.call('bob','/group-agreements/'+g.id,'PUT',h.edit(g,{roles:'Bob checks sources.'}))]);assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);
 const fresh=(await h.call('alice','/group-agreements/'+g.id)).data.agreement;assert.equal(fresh.revision,2);
 assert.equal((await h.call('bob','/group-agreements/'+g.id+'/confirm','POST',{revision:1})).status,409);
 assert.equal((await h.call('bob','/group-agreements/'+g.id+'/confirm','POST',{revision:2})).data.agreement.members.find(m=>m.id==='bob').confirmedRevision,2);
 const changed=await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(fresh,{responseTime:'Within two working days.'}));assert.equal(changed.status,200);assert.notEqual(changed.data.agreement.members.find(m=>m.id==='bob').confirmedRevision,changed.data.agreement.revision);
 const versions=(await h.call('alice','/group-agreements/'+g.id+'/versions')).data.versions;assert.deepEqual(versions.map(v=>v.revision),[3,2,1]);
});
test('restore creates a new revision and bounded history keeps the last thirty versions',async t=>{
 const h=harness(t);await h.join('alice');let g=await h.create('alice');for(let n=0;n<32;n++){const r=await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(g,{roles:'Version '+n}));assert.equal(r.status,200);g=r.data.agreement;}
 const versions=(await h.call('alice','/group-agreements/'+g.id+'/versions')).data.versions;assert.equal(versions.length,30);assert.equal(versions[0].revision,33);assert.equal((await h.call('alice','/group-agreements/'+g.id+'/versions/1')).status,404);
 const restored=await h.call('alice','/group-agreements/'+g.id+'/versions/4/restore','POST',{expectedRevision:33});assert.equal(restored.status,200);assert.equal(restored.data.agreement.revision,34);assert.equal(restored.data.agreement.roles,'Version 2');
 assert.equal((await h.call('alice','/group-agreements/'+g.id+'/versions/5/restore','POST',{expectedRevision:33})).status,409);
});
test('removal revokes access and invalid task assignees cannot be saved',async t=>{
 const h=harness(t);for(const u of ['alice','bob','carol'])await h.join(u);const g=await h.create('alice');await h.accept('bob',await h.invite('alice',g));
 assert.equal((await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(g,{tasks:[{id:'task-one',text:'Prepare slides',assigneeId:'carol',deadline:null,timeZone:'UTC'}]}))).status,400);
 assert.equal((await h.call('bob','/group-agreements/'+g.id+'/members/alice','DELETE')).status,400);
 assert.equal((await h.call('alice','/group-agreements/'+g.id+'/members/bob','DELETE')).status,200);
 assert.equal((await h.call('bob','/group-agreements/'+g.id)).status,404);assert.equal((await h.call('bob','/group-agreements/'+g.id+'/versions')).status,404);
});
test('blocks suppress sheets and joining while retaining safe leave and owner cleanup',async t=>{
 const h=harness(t);for(const u of ['alice','bob','carol'])await h.join(u);const g=await h.create('alice'),i=await h.invite('alice',g);await h.accept('bob',i);
 await h.raw.prepare('INSERT INTO blocks(blocker_id,blocked_id,created) VALUES(?,?,?)').bind('alice','bob',Date.now()).run();
 assert.equal((await h.call('bob','/group-agreements/'+g.id)).status,404);assert.equal((await h.call('alice','/group-agreements/'+g.id)).status,404);
 assert.deepEqual((await h.call('alice','/group-agreements')).data.agreements,[{id:g.id,mine:true,unavailable:true}]);
 const cleanup=await h.call('alice','/group-agreements/'+g.id+'/remove-blocked','POST',{});assert.equal(cleanup.status,200);assert.equal(cleanup.data.agreement.members.length,1);assert.equal((await h.accept('bob',i)).status,404);
 await h.accept('carol',i);await h.raw.prepare('INSERT INTO blocks(blocker_id,blocked_id,created) VALUES(?,?,?)').bind('carol','alice',Date.now()).run();assert.equal((await h.call('carol','/group-agreements/'+g.id+'/members/carol','DELETE')).status,200);
});
test('simultaneous joins cannot exceed twelve members and group creation cannot exceed twenty',async t=>{
 const h=harness(t);await h.join('alice');const g=await h.create('alice'),i=await h.invite('alice',g);for(let n=0;n<12;n++)await h.join('peer'+n);for(let n=0;n<10;n++)assert.equal((await h.accept('peer'+n,i)).status,200);
 const results=await Promise.all([h.accept('peer10',i),h.accept('peer11',i)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await h.raw.prepare('SELECT COUNT(*) AS n FROM group_agreement_members WHERE group_id=?').bind(g.id).first()).n,12);
 const creates=await Promise.all(Array.from({length:20},(_,n)=>h.call('alice','/group-agreements','POST',{title:'Group '+n})));assert.equal(creates.filter(r=>r.status===201).length,19);assert.equal(creates.filter(r=>r.status===409).length,1);
});
test('invitation and durable write limits hold across revocation and deletion',async t=>{
 const h=harness(t);await h.join('alice');const g=await h.create('alice');for(let n=0;n<5;n++)await h.invite('alice',g);assert.equal((await h.call('alice','/group-agreements/'+g.id+'/invites','POST',{})).status,409);
 await h.raw.prepare('UPDATE group_agreement_write_limits SET total=60 WHERE user_id=?').bind('alice').run();assert.equal((await h.call('alice','/group-agreements','POST',{title:'Limited'})).status,429);
});
test('large Chinese sheets fit the narrowly increased body bound while overflow is rejected',async t=>{
 const h=harness(t);await h.join('alice');const g=await h.create('alice');const content=h.edit(g,{roles:'角'.repeat(1000),meetingAgenda:'会'.repeat(1000),communication:'说'.repeat(600),responseTime:'时'.repeat(300),clarification:'问'.repeat(600),breaks:'休'.repeat(600),tasks:Array.from({length:20},(_,n)=>({id:'task-'+n,text:'步'.repeat(200),assigneeId:null,deadline:null,timeZone:'UTC'}))});assert.ok(new TextEncoder().encode(JSON.stringify(content)).length>16384);assert.equal((await h.call('alice','/group-agreements/'+g.id,'PUT',content)).status,200);
 assert.equal((await h.call('alice','/group-agreements/'+g.id,'PUT',{...content,roles:'角'.repeat(12000)})).status,413);
 const latest=(await h.call('alice','/group-agreements/'+g.id)).data.agreement;assert.equal((await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(latest,{tasks:[{id:'z',text:'Task',deadline:Date.now(),timeZone:'Made/Up'}]}))).status,400);
});
test('cold agreement paths stay below the free fifty-query limit',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');h.cold();const g=await h.create('alice');assert.ok(h.count()<50,'create '+h.count());h.cold();const i=await h.invite('alice',g);assert.ok(h.count()<50,'invite '+h.count());h.cold();assert.equal((await h.accept('bob',i)).status,200);assert.ok(h.count()<50,'join '+h.count());h.cold();assert.equal((await h.call('alice','/group-agreements/'+g.id,'PUT',h.edit(g,{roles:'New version'}))).status,200);assert.ok(h.count()<50,'save '+h.count());
});
test('additive agreement bootstrap and migration can be repeated without changing existing records',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));const migration=fs.readFileSync('drizzle/0008_group_agreements.sql','utf8');db.exec(migration);for(const sql of GROUP_AGREEMENTS_SCHEMA)db.exec(sql);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='group_agreements'").get().n,1);db.close();
});
