import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-db.mjs';
import {ensureReplyNotificationsSchema,handleNotificationSettings,queueReplyNotification,flushReplyNotifications,handleNotificationUnsubscribe,replyEmailConfigured} from '../src/reply-notifications.mjs';

const origin='https://drfrog.pages.dev',HOUR=3600000;
const configured={NOTIFICATION_ENABLED:'1',BREVO_API_KEY:'server-only-test-key',NOTIFICATION_FROM_EMAIL:'sender@example.test'};
function harness(t,{provider=true}={}){
 const DB=localDatabase();t.after(()=>DB.close());const env={DB,...(provider?configured:{})};
 const q=(sql,...args)=>DB.prepare(sql).bind(...args);
 const context={env,db:DB,body:request=>request.json(),fail:(status,code)=>{const error=new Error(code);error.status=status;throw error;},json:data=>Response.json(data)};
 async function seed(){
  for(const id of ['alice','bob','eve'])await q('INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?)',id,id+' private display name','neurodivergent','Student','Example','zh','test',Date.now()).run();
  await q('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)','post-one','alice','Sensitive question title','Sensitive question body','Communication',Date.now()).run();
  for(const [id,actor] of [['answer-one','bob'],['answer-two','eve']])await q('INSERT INTO question_answers(id,post_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?,?)',id,'post-one',actor,'Sensitive answer body','test',Date.now()).run();
  await q('INSERT INTO question_answer_replies(answer_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?)','answer-one','eve','Sensitive follow-up','test',Date.now()).run();
  await q('INSERT INTO question_answer_replies(answer_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?)','answer-one','alice','My own follow-up','test',Date.now()).run();
 }
 async function settings(input,actor='alice',email=actor+'@example.test'){
  const method=input===undefined?'GET':'PUT',request=new Request(origin+'/api/notification-settings',{method,headers:method==='PUT'?{'Content-Type':'application/json'}:{},body:input===undefined?undefined:JSON.stringify(input)});
  const response=await handleNotificationSettings(request,new URL(request.url),{id:actor,email},{language:'zh'},context);return response.json();
 }
 const answer=(id='answer-one',actorId='bob')=>({eventKind:'answer',eventId:id,postId:'post-one',answerId:id,actorId});
 const reply=(id=1,actorId='eve')=>({eventKind:'reply',eventId:id,postId:'post-one',answerId:'answer-one',actorId});
 const sent=[];
 const fetcher=async(url,options)=>{sent.push({url,options,data:JSON.parse(options.body)});return new Response('{}',{status:201});};
 return {DB,env,q,seed,settings,answer,reply,sent,fetcher};
}

test('email is off by default, needs explicit provider activation and never accepts a client address',async t=>{
 const h=harness(t,{provider:false});await h.seed();
 assert.deepEqual(await h.settings(),{configured:false,enabled:false,language:'zh',delivery:'unconfigured'});
 assert.equal(replyEmailConfigured({...configured,NOTIFICATION_ENABLED:'0'}),false);
 assert.equal(replyEmailConfigured({...configured,NOTIFICATION_FROM_EMAIL:'spoof\r\n@example.test'}),false);
 await assert.rejects(h.settings({enabled:true}),error=>error.status===503&&error.message==='notificationsUnconfigured');
 assert.deepEqual(await queueReplyNotification(h.env,h.answer()),{queued:false});
 assert.equal((await h.q('SELECT COUNT(*) AS total FROM reply_notification_settings').first()).total,0);
 Object.assign(h.env,configured);
 await assert.rejects(h.settings({enabled:true,email:'someone-else@example.test'}),error=>error.status===400);
 await assert.rejects(h.settings({enabled:'true'}),error=>error.status===400);
 await assert.rejects(h.settings({enabled:true},'alice','not-an-email'),error=>error.status===403);
 const result=await h.settings({enabled:true,language:'en'});assert.equal(result.enabled,true);assert.equal(result.configured,true);assert.equal(result.language,'en');
 assert.doesNotMatch(JSON.stringify(result),/alice@|server-only|token/);
 const stored=await h.q('SELECT * FROM reply_notification_settings WHERE user_id=?','alice').first();assert.equal(stored.email,'alice@example.test');
 await h.settings(undefined,'alice','verified-new@example.test');assert.equal((await h.q('SELECT email FROM reply_notification_settings WHERE user_id=?','alice').first()).email,'verified-new@example.test');
 await h.settings({enabled:false});assert.equal((await h.q('SELECT email FROM reply_notification_settings WHERE user_id=?','alice').first()).email,null);
});

test('opt-in public answers and follow-ups notify the owner, coalescing repeated activity and excluding private content',async t=>{
 const h=harness(t);await h.seed();const now=Date.now();
 assert.equal((await queueReplyNotification(h.env,h.answer(),{now})).queued,false);
 await h.settings({enabled:true});
 const [first,parallel]=await Promise.all([queueReplyNotification(h.env,h.answer(),{now}),queueReplyNotification(h.env,h.answer('answer-two','eve'),{now})]);
 assert.equal(Number(first.queued)+Number(parallel.queued),1);
 assert.equal((await queueReplyNotification(h.env,h.answer(),{now:now+HOUR+1})).queued,parallel.queued); // Previously coalesced event can produce the next hourly notice.
 assert.equal((await queueReplyNotification(h.env,h.reply(2,'alice'),{now:now+2*HOUR})).queued,false);
 assert.equal((await queueReplyNotification(h.env,{...h.reply(),eventId:999},{now:now+3*HOUR})).queued,false);
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR+2});
 assert.ok(h.sent.length>=1);const mail=h.sent[0];
 assert.equal(mail.url,'https://api.brevo.com/v3/smtp/email');assert.equal(mail.options.headers['api-key'],'server-only-test-key');assert.equal(mail.data.to[0].email,'alice@example.test');
 assert.match(mail.data.subject,/共识之地/);assert.match(mail.data.textContent,/#question=post-one&answer=answer-/);
 assert.doesNotMatch(JSON.stringify(mail.data),/Sensitive|private display name|Sensitive follow-up/);
 assert.equal('htmlContent' in mail.data,false);
 assert.equal((await h.q("SELECT COUNT(*) AS total FROM reply_notification_outbox WHERE state='sent'").first()).total,h.sent.length);
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR+3});assert.equal(h.sent.length,(await h.q("SELECT COUNT(*) AS total FROM reply_notification_outbox WHERE state='sent'").first()).total);
});

test('blocks, opt-out and deleted events suppress delivery even after queueing',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 await h.q('INSERT INTO blocks(blocker_id,blocked_id,created) VALUES(?,?,?)','alice','bob',now).run();
 assert.equal((await queueReplyNotification(h.env,h.answer(),{now})).queued,false);
 // A third member following up on a blocked person's lane is also excluded.
 assert.equal((await queueReplyNotification(h.env,h.reply(),{now})).queued,false);
 await h.q('DELETE FROM blocks').run();const event=await queueReplyNotification(h.env,h.answer(),{now});assert.equal(event.queued,true);
 await h.q('INSERT INTO blocks(blocker_id,blocked_id,created) VALUES(?,?,?)','bob','alice',now).run();
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now});assert.equal(h.sent.length,0);assert.equal((await h.q('SELECT state FROM reply_notification_outbox WHERE id=?',event.id).first()).state,'suppressed');
 await h.q('DELETE FROM blocks').run();assert.equal((await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+HOUR+1})).queued,true);
 await h.settings({enabled:false});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR+2});assert.equal(h.sent.length,0);
 assert.equal((await h.q("SELECT COUNT(*) AS total FROM reply_notification_outbox WHERE state='pending'").first()).total,0);
 await h.settings({enabled:true});await h.q('DELETE FROM question_answers WHERE id=?','answer-two').run();
 assert.equal((await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+3*HOUR})).queued,false);
});

test('anonymous unsubscribe requires an opaque token and GET only confirms; POST clears address and pending mail',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 await queueReplyNotification(h.env,h.answer(),{now});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now});
 const match=h.sent[0].data.textContent.match(/https:\/\/drfrog.pages.dev\/api\/notification-unsubscribe\?token=([a-f0-9]{64})/);assert.ok(match);const value=match[1],url=new URL(match[0]);
 const tokens=(await h.q('SELECT * FROM reply_notification_unsubscribe').all()).results;assert.equal(tokens.length,1);assert.notEqual(tokens[0].token_hash,value);assert.equal(tokens[0].token_hash.length,64);
 const confirmation=await handleNotificationUnsubscribe(new Request(url),url,h.env);assert.equal(confirmation.status,200);assert.match(await confirmation.text(),/<form method="post"/);assert.equal((await h.settings()).enabled,true);
 const invalidUrl=new URL(origin+'/api/notification-unsubscribe?token=alice');assert.equal((await handleNotificationUnsubscribe(new Request(invalidUrl),invalidUrl,h.env)).status,400);assert.equal((await h.settings()).enabled,true);
 await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+HOUR+1});
 const postUrl=new URL(origin+'/api/notification-unsubscribe'),request=new Request(postUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:value})});
 const result=await handleNotificationUnsubscribe(request,postUrl,h.env);assert.equal(result.status,200);assert.equal((await h.settings()).enabled,false);
 assert.equal((await h.q('SELECT email FROM reply_notification_settings WHERE user_id=?','alice').first()).email,null);
 assert.equal((await h.q('SELECT COUNT(*) AS total FROM reply_notification_unsubscribe').first()).total,0);
 assert.equal((await h.q("SELECT COUNT(*) AS total FROM reply_notification_outbox WHERE state='pending'").first()).total,0);
});

test('daily budget counts provider attempts; a rejected rate limit retries later but ambiguous failure does not resend',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 const event=await queueReplyNotification(h.env,h.answer(),{now});let sends=0;
 await flushReplyNotifications(h.env,{now,fetcher:async()=>{sends++;return new Response('{}',{status:429});}});
 let row=await h.q('SELECT * FROM reply_notification_outbox WHERE id=?',event.id).first();assert.equal(row.state,'pending');assert.equal(row.attempts,1);
 await flushReplyNotifications(h.env,{now:now+5*60000,fetcher:async()=>{sends++;return new Response('{}',{status:201});}});assert.equal(sends,1);
 await flushReplyNotifications(h.env,{now:now+11*60000,fetcher:h.fetcher});assert.equal(h.sent.length,1);assert.equal((await h.q('SELECT state FROM reply_notification_outbox WHERE id=?',event.id).first()).state,'sent');
 const second=await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+HOUR+1});
 await flushReplyNotifications(h.env,{now:now+2*HOUR,fetcher:async()=>{throw new Error('network failed');}});
 row=await h.q('SELECT * FROM reply_notification_outbox WHERE id=?',second.id).first();assert.equal(row.state,'failed');assert.equal(row.last_error,'deliveryUnknown');
 await flushReplyNotifications(h.env,{now:now+3*HOUR,fetcher:h.fetcher});assert.equal(h.sent.length,1);
 assert.equal((await h.q('SELECT SUM(used) AS total FROM reply_notification_budget').first()).total,3);
});

test('global cap and concurrent flushes prevent exceeding the configured send budget',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});h.env.NOTIFICATION_DAILY_LIMIT='1';const now=Date.now();
 await h.q('INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)','post-two','alice','Another question','Another body','Communication',now).run();
 await h.q('INSERT INTO question_answers(id,post_id,author_id,body,visibility_consent_version,created) VALUES(?,?,?,?,?,?)','answer-three','post-two','bob','Another answer','test',now).run();
 await queueReplyNotification(h.env,h.answer(),{now});await queueReplyNotification(h.env,{...h.answer('answer-three'),postId:'post-two'},{now});
 await Promise.all([flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR+2}),flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR+2})]);
 assert.equal(h.sent.length,1);assert.equal((await h.q('SELECT SUM(used) AS total FROM reply_notification_budget').first()).total,1);
 const pending=await h.q("SELECT * FROM reply_notification_outbox WHERE state='pending'").first();assert.ok(pending);assert.equal(pending.last_error,'dailyLimit');assert.equal(pending.attempts,0);
});

test('delayed queued emails still respect a rolling hour between actual deliveries and old pending events expire',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 await queueReplyNotification(h.env,h.answer(),{now});await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+HOUR+1});
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+2*HOUR});assert.equal(h.sent.length,1);
 const pending=await h.q("SELECT * FROM reply_notification_outbox WHERE state='pending'").first();assert.equal(pending.last_error,'hourlyLimit');assert.equal(pending.next_attempt,now+3*HOUR);
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+3*HOUR});assert.equal(h.sent.length,2);
 await queueReplyNotification(h.env,h.reply(),{now:now+4*HOUR});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+8*86400000});assert.equal(h.sent.length,2);
 assert.equal((await h.q("SELECT last_error FROM reply_notification_outbox WHERE event_key='reply:1'").first()).last_error,'expired');
});

test('notification failures are contained and unconfigured deployment never performs provider requests',async t=>{
 const h=harness(t,{provider:false});await h.seed();let calls=0;
 assert.deepEqual(await flushReplyNotifications(h.env,{fetcher:async()=>{calls++;throw new Error('must not call');}}),{processed:0});assert.equal(calls,0);
 const broken={...configured,DB:{prepare:()=>{throw new Error('database failed');}}};
 assert.deepEqual(await queueReplyNotification(broken,h.answer()),{queued:false});
 assert.deepEqual(await flushReplyNotifications(broken,{fetcher:h.fetcher}),{processed:0});
 await ensureReplyNotificationsSchema(h.DB);await ensureReplyNotificationsSchema(h.DB);
});

test('deleting an answer cannot bypass the durable hourly send window',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 await queueReplyNotification(h.env,h.answer(),{now});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now});assert.equal(h.sent.length,1);
 await h.q('DELETE FROM question_answers WHERE id=?','answer-one').run();assert.equal((await h.q('SELECT COUNT(*) AS total FROM reply_notification_outbox').first()).total,0);
 assert.equal((await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+10*60000})).queued,true);
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+10*60000});assert.equal(h.sent.length,1);
 assert.equal((await h.q('SELECT last_sent FROM reply_notification_send_windows WHERE post_id=?','post-one').first()).last_sent,now);
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+HOUR});assert.equal(h.sent.length,2);
});

test('a terminated send retains a conservative cooldown even if its answer is deleted',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();
 const event=await queueReplyNotification(h.env,h.answer(),{now});
 await h.q("UPDATE reply_notification_outbox SET state='sending',locked_at=? WHERE id=?",now,event.id).run();
 await h.q('INSERT INTO reply_notification_send_windows(recipient_id,post_id,reserved_at,reserved_until,reservation_id) VALUES(?,?,?,?,?)','alice','post-one',now,now+2*60000,event.id).run();
 await h.q('DELETE FROM question_answers WHERE id=?','answer-one').run();
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+3*60000});assert.equal(h.sent.length,0);
 assert.equal((await h.q('SELECT last_sent FROM reply_notification_send_windows WHERE post_id=?','post-one').first()).last_sent,now);
 await queueReplyNotification(h.env,h.answer('answer-two','eve'),{now:now+4*60000});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now:now+4*60000});assert.equal(h.sent.length,0);
});

test('opting out during preparation suppresses a captured address before provider handoff',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();await queueReplyNotification(h.env,h.answer(),{now});
 const originalPrepare=h.DB.prepare;let interrupted=false;
 h.DB.prepare=sql=>{
  const statement=originalPrepare(sql);
  if(!sql.startsWith('INSERT INTO reply_notification_unsubscribe'))return statement;
  return {bind(...values){const bound=statement.bind(...values);return {async run(){const result=await bound.run();if(!interrupted){interrupted=true;await h.settings({enabled:false});}return result;}};}};
 };
 await flushReplyNotifications(h.env,{fetcher:h.fetcher,now});assert.equal(interrupted,true);assert.equal(h.sent.length,0);
 assert.equal((await h.q('SELECT state FROM reply_notification_outbox').first()).state,'suppressed');
 assert.equal((await h.q('SELECT reserved_until FROM reply_notification_send_windows').first()).reserved_until,0);
});

test('anonymous unsubscribe cancels oversized streamed form bodies without Content-Length before reading the whole body',async t=>{
 const h=harness(t);await h.seed();await h.settings({enabled:true});const now=Date.now();await queueReplyNotification(h.env,h.answer(),{now});await flushReplyNotifications(h.env,{fetcher:h.fetcher,now});
 const value=h.sent[0].data.textContent.match(/notification-unsubscribe\?token=([a-f0-9]{64})/)[1];let pulls=0,cancelled=false;
 const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new TextEncoder().encode(pulls===1?'token='+value+'&padding='+('x'.repeat(1400)):'x'.repeat(1400)));},cancel(){cancelled=true;}},{highWaterMark:0});
 const url=new URL(origin+'/api/notification-unsubscribe'),request=new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,duplex:'half'});
 assert.equal(request.headers.has('content-length'),false);
 const response=await handleNotificationUnsubscribe(request,url,h.env);assert.equal(response.status,400);assert.equal(cancelled,true);assert.equal(pulls,2);
 assert.equal((await h.settings()).enabled,true);assert.equal((await h.q('SELECT COUNT(*) AS total FROM reply_notification_unsubscribe').first()).total,1);
});
