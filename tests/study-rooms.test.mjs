import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const origin='https://community.example';
const profile={group:'neurotypical',role:'Student',university:'Example university',language:'en',consent:true};
function harness(t){const DB=localDatabase();t.after(()=>DB.close());const env={DB,MODERATOR_EMAIL:'moderator@example.test'};
 async function call(user,path,method='GET',data,extra={}){const headers=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};if(method!=='GET')Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'});Object.assign(headers,extra);const response=await handleApi(new Request(origin+'/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:response.status,data:await response.json()};}
 async function member(user){assert.equal((await call(user,'/profile','PUT',{...profile,name:user})).status,200);}
 async function room(user,title='A quiet room'){const r=await call(user,'/study-rooms','POST',{title,language:'either',durationMinutes:25});assert.equal(r.status,201,JSON.stringify(r));return r.data;}
 async function join(user,id,data={goal:'',shareGoal:false}){const r=await call(user,'/study-rooms/'+id+'/join','POST',data);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
 async function message(user,id,body='A friendly check-in'){const r=await call(user,'/study-rooms/'+id+'/messages','POST',{body,publishConsent:true});assert.equal(r.status,201,JSON.stringify(r));return r.data.id;}
 return {DB,env,call,member,room,join,message};
}

test('study rooms require authenticated completed members and enforce origin, bounds and exact input fields',async t=>{
 const h=harness(t);await h.member('alice');const room=(await h.room('alice')).room.id;
 for(const path of ['/study-rooms','/study-rooms/'+room,'/study-rooms/'+room+'/messages']){assert.equal((await h.call(null,path)).status,401);assert.equal((await h.call('unfinished',path)).status,403);}
 assert.equal((await h.call(null,'/study-rooms','POST',{title:'Room',language:'en',durationMinutes:15})).status,401);
 for(const extra of [{Origin:'https://other.example'},{'X-Common-Ground':'0'}])assert.equal((await h.call('alice','/study-rooms','POST',{title:'Room',language:'en',durationMinutes:15},extra)).status,403);
 for(const data of [{title:'',language:'en',durationMinutes:15},{title:'x'.repeat(121),language:'en',durationMinutes:15},{title:'Room',language:'invalid',durationMinutes:15},{title:'Room',language:'en',durationMinutes:20},{title:'Room',language:'en',durationMinutes:15,hostId:'someone'}])assert.equal((await h.call('alice','/study-rooms','POST',data)).status,400);
 assert.equal((await h.call('alice','/study-rooms/'+room+'/messages','POST',{body:'x'.repeat(2001),publishConsent:true})).status,400);
 assert.equal((await h.call('alice','/study-rooms/'+room+'/messages','POST',{body:'x'.repeat(17000),publishConsent:true})).status,413);
 assert.equal((await h.call('alice','/study-rooms?language=unknown')).status,400);assert.equal((await h.call('alice','/study-rooms?before=NaN')).status,400);
});

test('private goals stay owner-only; optional sharing and chat require explicit consent and identity cannot be spoofed',async t=>{
 const h=harness(t);for(const user of ['alice','bob','eve'])await h.member(user);const id=(await h.room('alice')).room.id;
 await h.join('bob',id,{goal:'Private medical context'});const detail=(await h.call('alice','/study-rooms/'+id)).data;
 assert.equal(detail.participants.find(p=>p.userId==='bob').sharedGoal,null);assert.ok(!JSON.stringify(detail).includes('Private medical context'));assert.ok(!JSON.stringify((await h.call('eve','/study-rooms')).data).includes('Private medical context'));
 assert.equal((await h.call('eve','/study-rooms/'+id)).status,404);assert.equal((await h.call('eve','/study-rooms/'+id+'/messages')).status,404);
 assert.equal((await h.call('bob','/study-rooms/'+id)).data.me.goal,'Private medical context');
 assert.equal((await h.call('bob','/study-rooms/'+id+'/goal','PUT',{goal:'Shared step',shareGoal:true})).status,400);
 assert.equal((await h.call('bob','/study-rooms/'+id+'/goal','PUT',{goal:'Shared step',shareGoal:true,shareConsent:true})).status,200);assert.equal((await h.call('alice','/study-rooms/'+id)).data.participants.find(p=>p.userId==='bob').sharedGoal,'Shared step');
 assert.equal((await h.call('bob','/study-rooms/'+id+'/goal','PUT',{goal:'Private again',shareGoal:false})).status,200);assert.ok(!JSON.stringify((await h.call('alice','/study-rooms/'+id)).data).includes('Private again'));
 assert.equal((await h.call('bob','/study-rooms/'+id+'/messages','POST',{body:'Hello'})).status,400);assert.equal((await h.call('bob','/study-rooms/'+id+'/messages','POST',{body:'Hello',publishConsent:true,authorId:'alice'})).status,400);
 const messageId=await h.message('bob',id,'<script>alert(1)</script>');const shared=(await h.call('alice','/study-rooms/'+id+'/messages')).data.messages[0];assert.equal(shared.id,messageId);assert.equal(shared.authorId,'bob');assert.equal(shared.body,'<script>alert(1)</script>');assert.equal(shared.mine,false);assert.equal(shared.email,undefined);
 assert.equal((await h.call('bob','/study-rooms/'+id+'/check-in','POST',{done:true})).status,400);assert.equal((await h.call('bob','/study-rooms/'+id+'/check-in','POST',{done:true,publishConsent:true})).status,200);assert.equal((await h.call('alice','/study-rooms/'+id)).data.participants.find(p=>p.userId==='bob').done,true);
});

test('atomic concurrent joins enforce eight participants, deduplicate rejoining and do not overwrite a current goal',async t=>{
 const h=harness(t);for(const user of ['host',...Array.from({length:10},(_,i)=>'member'+i)])await h.member(user);const id=(await h.room('host')).room.id;
 const results=await Promise.all(Array.from({length:10},(_,i)=>h.call('member'+i,'/study-rooms/'+id+'/join','POST',{goal:'Goal '+i,shareGoal:false})));assert.equal(results.filter(r=>r.status===200).length,7);assert.equal(results.filter(r=>r.status===409).length,3);
 assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM study_participants WHERE room_id=? AND status='active'").bind(id).first()).n,8);
 const successful=results.findIndex(r=>r.status===200),user='member'+successful;await h.join(user,id,{goal:'Overwrite?',shareGoal:false});assert.equal((await h.call(user,'/study-rooms/'+id)).data.me.goal,'Goal '+successful);
 await h.call(user,'/study-rooms/'+id+'/leave','DELETE');await h.join(user,id,{goal:'A fresh rejoin goal',shareGoal:false});assert.equal((await h.call(user,'/study-rooms/'+id)).data.me.goal,'A fresh rejoin goal');assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM study_participants WHERE room_id=? AND user_id=?').bind(id,user).first()).n,1);
});

test('mutual blocks hide rooms, prevent join/read/chat and still allow leaving or a host to end a room',async t=>{
 const h=harness(t);for(const user of ['alice','bob','eve'])await h.member(user);const id=(await h.room('alice')).room.id;await h.join('bob',id);
 await h.call('bob','/blocks','POST',{userId:'eve'});assert.equal((await h.call('eve','/study-rooms')).data.rooms.length,0);assert.equal((await h.call('eve','/study-rooms/'+id+'/join','POST',{})).status,404);
 await h.call('bob','/blocks/eve','DELETE');await h.join('eve',id);await h.call('eve','/blocks','POST',{userId:'bob'});assert.equal((await h.call('eve','/study-rooms/'+id)).status,404);assert.equal((await h.call('bob','/study-rooms/'+id+'/messages')).status,404);assert.equal((await h.call('eve','/study-rooms/'+id+'/messages','POST',{body:'Hidden',publishConsent:true})).status,404);
 assert.equal((await h.call('eve','/study-rooms/'+id+'/leave','DELETE')).status,200);assert.equal((await h.call('bob','/study-rooms/'+id)).status,200);assert.equal((await h.call('bob','/study-rooms/'+id)).data.participants.length,2);
 await h.call('alice','/blocks','POST',{userId:'bob'});assert.equal((await h.call('alice','/study-rooms/'+id)).status,404);assert.equal((await h.call('alice','/study-rooms/'+id+'/end','POST',{})).status,200);assert.equal((await h.DB.prepare('SELECT state FROM study_rooms WHERE id=?').bind(id).first()).state,'closed');
});

test('hosts alone can remove participants or end rooms; removal cannot be bypassed by rejoining and own messages can be deleted after leaving',async t=>{
 const h=harness(t);for(const user of ['host','bob','eve'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id);await h.join('eve',id);const messageId=await h.message('bob',id);
 assert.equal((await h.call('eve','/study-rooms/'+id+'/end','POST',{})).status,404);assert.equal((await h.call('eve','/study-rooms/'+id+'/participants/bob','DELETE')).status,404);assert.equal((await h.call('host','/study-rooms/'+id+'/participants/host','DELETE')).status,400);assert.equal((await h.call('eve','/study-rooms/'+id+'/messages/'+messageId,'DELETE')).status,404);
 assert.equal((await h.call('host','/study-rooms/'+id+'/participants/bob','DELETE')).status,200);assert.equal((await h.call('bob','/study-rooms/'+id)).status,404);assert.equal((await h.call('bob','/study-rooms/'+id+'/join','POST',{})).status,403);assert.equal((await h.call('bob','/study-rooms/'+id+'/messages/'+messageId,'DELETE')).status,200);
 assert.equal((await h.call('host','/study-rooms/'+id+'/end','POST',{})).status,200);assert.equal((await h.call('eve','/study-rooms/'+id+'/messages','POST',{body:'Too late',publishConsent:true})).data.error,'studyEnded');assert.equal((await h.call('eve','/study-rooms/'+id+'/check-in','POST',{done:true,publishConsent:true})).status,200);
});

test('timers expire joins immediately and participant access after fifteen minutes; expired memberships do not occupy new-room allowances',async t=>{
 const h=harness(t);for(const user of ['host','bob','host2','host3'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id);
 await h.DB.prepare('UPDATE study_rooms SET ends_at=? WHERE id=?').bind(Date.now()-1000,id).run();assert.equal((await h.call('host','/study-rooms')).data.rooms.length,0);assert.equal((await h.call('host2','/study-rooms/'+id+'/join','POST',{})).status,410);assert.equal((await h.call('bob','/study-rooms/'+id)).data.room.state,'finished');assert.equal((await h.call('bob','/study-rooms/'+id+'/check-in','POST',{done:true,publishConsent:true})).status,200);await h.message('bob',id,'Optional wrap-up');
 await h.DB.prepare('UPDATE study_rooms SET ends_at=? WHERE id=?').bind(Date.now()-16*60000,id).run();for(const suffix of ['', '/messages'])assert.equal((await h.call('bob','/study-rooms/'+id+suffix)).status,410);assert.equal((await h.call('bob','/study-rooms/'+id+'/goal','PUT',{goal:'No',shareGoal:false})).status,410);
 const second=(await h.room('host2')).room.id,third=(await h.room('host3')).room.id;await h.join('bob',second);await h.join('bob',third);assert.equal((await h.call('bob','/study-rooms','POST',{title:'Third active room',language:'en',durationMinutes:15})).status,409);assert.equal((await h.call('bob','/study-rooms/'+id+'/leave','DELETE')).status,200);
});

test('room creation and publication limits are durable under deletion and atomic at the last allowance',async t=>{
 const h=harness(t);await h.member('host');for(let i=0;i<3;i++){const id=(await h.room('host')).room.id;await h.DB.prepare('DELETE FROM study_rooms WHERE id=?').bind(id).run();}assert.equal((await h.call('host','/study-rooms','POST',{title:'Another',language:'en',durationMinutes:15})).status,429);assert.equal((await h.DB.prepare("SELECT total FROM study_limits WHERE user_id='host' AND bucket='createHour'").first()).total,3);
 await h.DB.prepare("UPDATE study_limits SET period_start=period_start-1 WHERE user_id='host' AND bucket='createHour'").run();const id=(await h.room('host')).room.id;assert.equal((await h.call('host','/study-rooms','POST',{title:'Parallel host',language:'en',durationMinutes:15})).status,409);
 await h.DB.prepare("UPDATE study_limits SET period_start=?,total=29 WHERE user_id='host' AND bucket='write'").bind(Math.floor(Date.now()/60000)).run();const attempts=await Promise.all([h.call('host','/study-rooms/'+id+'/messages','POST',{body:'First',publishConsent:true}),h.call('host','/study-rooms/'+id+'/messages','POST',{body:'Second',publishConsent:true})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[201,429]);const sent=(await h.call('host','/study-rooms/'+id+'/messages')).data.messages[0].id;assert.equal((await h.call('host','/study-rooms/'+id+'/messages/'+sent,'DELETE')).status,429);
});

test('bounded chronological message pagination excludes mutually blocked former participants before page selection',async t=>{
 const h=harness(t);for(const user of ['host','bob','eve'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id);await h.join('eve',id);await h.call('bob','/study-rooms/'+id+'/leave','DELETE');await h.call('eve','/blocks','POST',{userId:'bob'});
 for(let i=0;i<65;i++)await h.DB.prepare('INSERT INTO study_messages(room_id,author_id,body,created) VALUES(?,?,?,?)').bind(id,i%3===0?'bob':'host','Message '+i,100+i).run();
 const page=(await h.call('eve','/study-rooms/'+id+'/messages')).data;assert.equal(page.messages.length,43);assert.ok(page.messages.every(m=>m.authorId==='host'));assert.equal(page.hasMore,false);assert.ok(page.messages.every((m,i,a)=>i===0||m.id>a[i-1].id));
 const all=(await h.call('host','/study-rooms/'+id+'/messages')).data;assert.equal(all.messages.length,50);assert.equal(all.hasMore,true);const earlier=(await h.call('host','/study-rooms/'+id+'/messages?before='+all.messages[0].id)).data;assert.equal(earlier.messages.length,15);assert.ok(earlier.messages.at(-1).id<all.messages[0].id);const after=(await h.call('host','/study-rooms/'+id+'/messages?after='+earlier.messages.at(-1).id)).data;assert.equal(after.messages.length,50);assert.equal((await h.call('host','/study-rooms/'+id+'/messages?after=1&before=2')).status,400);
});

test('moderator-only report snapshots survive target deletion and never include private goals or unrelated removal',async t=>{
 const h=harness(t);for(const user of ['host','bob','eve','moderator'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id,{goal:'Never copy this private goal'});await h.join('eve',id);const messageId=await h.message('bob',id,'Reported content');
 const reported=await h.call('eve','/study-rooms/'+id+'/messages/'+messageId+'/reports','POST',{reason:'Please review this'});assert.equal(reported.status,201);const roomReport=await h.call('eve','/study-rooms/'+id+'/reports','POST',{reason:'Room issue'});assert.equal(roomReport.status,201);
 assert.equal((await h.call('eve','/study-reports')).status,403);assert.equal((await h.call('eve','/study-reports/'+reported.data.id+'/resolve','POST',{})).status,403);
 const queue=(await h.call('moderator','/study-reports')).data;assert.equal(queue.reports.length,2);assert.ok(!JSON.stringify(queue).includes('Never copy'));assert.ok(queue.reports.some(r=>r.body==='Reported content'));assert.equal((await h.call('moderator','/study-reports/'+reported.data.id+'/resolve','POST',{endRoom:true})).status,400);assert.equal((await h.call('moderator','/study-reports/'+roomReport.data.id+'/resolve','POST',{removeMessage:true})).status,400);
 await h.call('bob','/study-rooms/'+id+'/messages/'+messageId,'DELETE');const retained=(await h.call('moderator','/study-reports')).data.reports.find(r=>r.id===reported.data.id);assert.equal(retained.body,'Reported content');assert.equal(retained.messageId,null);
 await h.DB.prepare('DELETE FROM study_rooms WHERE id=?').bind(id).run();const surviving=(await h.call('moderator','/study-reports')).data.reports;assert.equal(surviving.length,2);assert.ok(surviving.every(r=>r.roomId===null));assert.equal((await h.call('moderator','/study-reports/'+reported.data.id+'/resolve','POST',{removeMessage:true})).status,200);assert.equal((await h.call('moderator','/study-reports')).data.reports.length,1);
});

test('room browsing uses bounded stable tuple pagination and each cold request stays below free D1 query limits',async t=>{
 const h=harness(t);for(const user of ['host','bob','moderator'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id);for(let i=0;i<36;i++){const rid='page-'+String(i).padStart(2,'0');await h.DB.prepare('INSERT INTO study_rooms(id,host_id,title,language,duration_minutes,starts_at,ends_at,created) VALUES(?,?,?,?,?,?,?,?)').bind(rid,'host','Page room','en',15,100,Date.now()+60000,100).run();}
 const first=(await h.call('bob','/study-rooms?language=en')).data;assert.equal(first.rooms.length,30);assert.equal(first.hasMore,true);const last=first.rooms.at(-1),second=(await h.call('bob','/study-rooms?language=en&before='+last.created+'&beforeId='+last.id)).data;assert.equal(second.rooms.length,7);assert.equal(new Set([...first.rooms,...second.rooms].map(r=>r.id)).size,37);
 const budget=[];for(const [user,path,method,data] of [['bob','/study-rooms','GET'],['bob','/study-rooms/'+id,'GET'],['bob','/study-rooms/'+id+'/messages','GET'],['bob','/study-rooms/'+id+'/goal','PUT',{goal:'A step',shareGoal:false}],['bob','/study-rooms/'+id+'/messages','POST',{body:'Hello',publishConsent:true}],['bob','/study-rooms/'+id+'/reports','POST',{reason:'Check room'}],['moderator','/study-reports','GET']]){let queries=0;h.env.DB={...h.DB,prepare(sql){queries++;return h.DB.prepare(sql);}};const r=await h.call(user,path,method,data);assert.ok([200,201].includes(r.status),JSON.stringify(r));assert.ok(queries<=50,'cold '+path+' issued '+queries+' queries');budget.push([method,path,queries]);}t.diagnostic(JSON.stringify(budget));h.env.DB=h.DB;
});

test('moderators remove only the reported target, retain snapshots and close room chat without exposing private goals',async t=>{
 const h=harness(t);for(const user of ['host','bob','moderator'])await h.member(user);const id=(await h.room('host')).room.id;await h.join('bob',id);const first=await h.message('bob',id,'First message'),second=await h.message('bob',id,'Keep this message');
 const messageReport=(await h.call('host','/study-rooms/'+id+'/messages/'+first+'/reports','POST',{reason:'Review'})).data.id;assert.equal((await h.call('moderator','/study-reports/'+messageReport+'/resolve','POST',{removeMessage:true})).status,200);assert.deepEqual((await h.call('host','/study-rooms/'+id+'/messages')).data.messages.map(m=>m.id),[second]);assert.equal((await h.DB.prepare('SELECT body_snapshot FROM study_reports WHERE id=?').bind(messageReport).first()).body_snapshot,'First message');
 const roomReport=(await h.call('bob','/study-rooms/'+id+'/reports','POST',{reason:'Close the room'})).data.id;assert.equal((await h.call('moderator','/study-reports/'+roomReport+'/resolve','POST',{endRoom:true})).status,200);assert.equal((await h.call('host','/study-rooms/'+id+'/messages','POST',{body:'Closed',publishConsent:true})).data.error,'studyEnded');assert.equal((await h.call('bob','/study-rooms/'+id)).status,200);assert.equal((await h.call('moderator','/study-reports')).data.reports.length,0);
});
