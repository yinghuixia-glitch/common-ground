// Reply email is optional. Only the verified server-side account address is
// stored after consent; no question, answer, profile name or private message is
// included in the email. Provider errors never affect publication of a reply.
export const REPLY_NOTIFICATIONS_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS reply_notification_settings (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,email TEXT,enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','zh')),updated INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS reply_notification_outbox (id TEXT PRIMARY KEY NOT NULL,event_key TEXT NOT NULL,event_kind TEXT NOT NULL CHECK(event_kind IN ('answer','reply')),post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,answer_id TEXT NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,reply_id INTEGER REFERENCES question_answer_replies(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,actor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,created INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','suppressed')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,locked_at INTEGER,last_error TEXT,sent_at INTEGER)",
 'CREATE UNIQUE INDEX IF NOT EXISTS reply_notification_event_key ON reply_notification_outbox(event_key)',
 'CREATE INDEX IF NOT EXISTS reply_notification_pending ON reply_notification_outbox(state,next_attempt,created)',
 'CREATE INDEX IF NOT EXISTS reply_notification_recipient_post ON reply_notification_outbox(recipient_id,post_id,created)',
 'CREATE TABLE IF NOT EXISTS reply_notification_budget (day TEXT PRIMARY KEY NOT NULL,used INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS reply_notification_send_windows (recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,last_sent INTEGER,reserved_at INTEGER,reserved_until INTEGER NOT NULL DEFAULT 0,reservation_id TEXT,PRIMARY KEY(recipient_id,post_id))',
 'CREATE TABLE IF NOT EXISTS reply_notification_unsubscribe (token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS reply_notification_unsubscribe_user ON reply_notification_unsubscribe(user_id,created)'
];
const readyDatabases=new WeakMap();
export async function ensureReplyNotificationsSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){ready=(async()=>{for(const sql of REPLY_NOTIFICATIONS_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});readyDatabases.set(db,ready);}
 await ready;
}
const query=(db,sql,...values)=>db.prepare(sql).bind(...values);
const one=(db,sql,...values)=>query(db,sql,...values).first();
const HOUR=3600000,DAY=86400000,TOKEN_LIFETIME=90*DAY;
const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export function replyEmailConfigured(env){return env?.NOTIFICATION_ENABLED==='1'&&typeof env.BREVO_API_KEY==='string'&&env.BREVO_API_KEY.trim().length>0&&validEmail(env.NOTIFICATION_FROM_EMAIL);}
const language=value=>value==='zh'?'zh':'en';
const configView=(env,settings,profile)=>({configured:replyEmailConfigured(env),enabled:!!settings?.enabled,language:language(settings?.language??profile?.language),delivery:replyEmailConfigured(env)?'brevo':'unconfigured'});
async function disable(db,userId,now){
 await db.batch([
  query(db,'UPDATE reply_notification_settings SET enabled=0,email=NULL,updated=? WHERE user_id=?',now,userId),
  query(db,'DELETE FROM reply_notification_unsubscribe WHERE user_id=?',userId),
  query(db,"UPDATE reply_notification_outbox SET state='suppressed',last_error='optedOut' WHERE recipient_id=? AND state IN ('pending','sending')",userId)
 ]);
}
// Call only after normal authentication and the complete-profile check.
export async function handleNotificationSettings(request,url,user,profile,ctx){
 const {env,db,body,fail,json}=ctx;await ensureReplyNotificationsSchema(db);
 if(!user?.id)fail(401,'signIn');
 if(url.pathname!=='/api/notification-settings')fail(404,'notFound');
 const existing=await one(db,'SELECT * FROM reply_notification_settings WHERE user_id=?',user.id);
 if(request.method==='GET'){
  // A changed account address must be verified by the existing auth service.
  if(existing?.enabled&&validEmail(user.email)&&existing.email!==user.email){await query(db,'UPDATE reply_notification_settings SET email=?,updated=? WHERE user_id=? AND enabled=1',user.email,Date.now(),user.id).run();}
  return json(configView(env,existing,profile));
 }
 if(request.method!=='PUT')fail(405,'notAllowed');
 const input=await body(request);
 if(Object.keys(input).some(key=>!['enabled','language'].includes(key))||typeof input.enabled!=='boolean'||input.language!==undefined&&!['en','zh'].includes(input.language))fail(400,'invalidInput');
 if(input.enabled&&!replyEmailConfigured(env))fail(503,'notificationsUnconfigured');
 if(input.enabled&&!validEmail(user.email))fail(403,'notificationEmailUnavailable');
 const now=Date.now(),lang=language(input.language??profile?.language);
 await query(db,'INSERT INTO reply_notification_settings(user_id,email,enabled,language,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,enabled=excluded.enabled,language=excluded.language,updated=excluded.updated',user.id,input.enabled?user.email:null,Number(input.enabled),lang,now).run();
 if(!input.enabled)await disable(db,user.id,now);
 return json(configView(env,{enabled:input.enabled,language:lang},profile));
}
async function isBlocked(db,a,b){return !!await one(db,'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',a,b,b,a);}
async function eventDetails(db,event){
 if(event.eventKind==='answer')return one(db,'SELECT a.id AS answer_id,a.post_id,a.author_id AS actor_id,a.author_id AS answer_author_id,p.author_id AS recipient_id FROM question_answers a JOIN posts p ON p.id=a.post_id WHERE a.id=? AND a.post_id=? AND a.author_id=?',String(event.eventId),event.postId,event.actorId);
 if(event.eventKind==='reply'&&Number.isSafeInteger(Number(event.eventId))&&Number(event.eventId)>0)return one(db,'SELECT a.id AS answer_id,a.post_id,r.author_id AS actor_id,a.author_id AS answer_author_id,p.author_id AS recipient_id,r.id AS reply_id FROM question_answer_replies r JOIN question_answers a ON a.id=r.answer_id JOIN posts p ON p.id=a.post_id WHERE r.id=? AND a.id=? AND a.post_id=? AND r.author_id=?',Number(event.eventId),event.answerId,event.postId,event.actorId);
 return null;
}
// This function intentionally does not throw; successful publication must not
// become an error because the email provider or notification database failed.
export async function queueReplyNotification(env,event,{now=Date.now()}={}){
 try{
  if(!replyEmailConfigured(env)||!env.DB)return {queued:false};
  const db=env.DB;await ensureReplyNotificationsSchema(db);
  const item=await eventDetails(db,event);
  if(!item||item.actor_id===item.recipient_id||await isBlocked(db,item.recipient_id,item.actor_id)||await isBlocked(db,item.recipient_id,item.answer_author_id))return {queued:false};
  const settings=await one(db,'SELECT enabled,email FROM reply_notification_settings WHERE user_id=?',item.recipient_id);
  if(!settings?.enabled||!validEmail(settings.email))return {queued:false};
  const id=crypto.randomUUID(),eventKey=event.eventKind+':'+String(event.eventId);
  // Coalesce activity to at most one email for a question in a rolling hour.
  // The conditional insert also protects against concurrent reply requests.
  const result=await query(db,"INSERT INTO reply_notification_outbox(id,event_key,event_kind,post_id,answer_id,reply_id,recipient_id,actor_id,created,next_attempt) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reply_notification_settings WHERE user_id=? AND enabled=1 AND email IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM reply_notification_outbox WHERE recipient_id=? AND post_id=? AND created>?) AND (SELECT COUNT(*) FROM reply_notification_outbox WHERE state='pending')<2000 AND (SELECT COUNT(*) FROM reply_notification_outbox WHERE recipient_id=? AND state='pending')<100 ON CONFLICT(event_key) DO NOTHING",id,eventKey,event.eventKind,item.post_id,item.answer_id,item.reply_id??null,item.recipient_id,item.actor_id,now,now,item.recipient_id,item.recipient_id,item.post_id,now-HOUR,item.recipient_id).run();
  return result.meta.changes?{queued:true,id}:{queued:false};
 }catch{return {queued:false};}
}
function siteOrigin(env){
 if(!env.NOTIFICATION_SITE_ORIGIN)return 'https://drfrog.pages.dev';
 try{const url=new URL(env.NOTIFICATION_SITE_ORIGIN);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin;}catch{}
 return 'https://drfrog.pages.dev';
}
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');}
function message(env,item,settings,optOutToken){
 const origin=siteOrigin(env),discussion=origin+'/#question='+encodeURIComponent(item.post_id)+'&answer='+encodeURIComponent(item.answer_id),unsubscribe=origin+'/api/notification-unsubscribe?token='+optOutToken;
 const zh=settings.language==='zh';
 return {sender:{name:'DrFrog · 共识之地',email:env.NOTIFICATION_FROM_EMAIL},to:[{email:settings.email}],subject:zh?'共识之地：你的问题有新回复':'DrFrog: a new reply to your question',textContent:zh?`你在共识之地发布的问题有新回复。\n\n登录后查看：${discussion}\n\n邮件仅提醒你查看，不包含问题或回复内容。每个问题每小时最多发送一次提醒。\n\n关闭回复邮件提醒：${unsubscribe}\n你也可以在网站的邮件提醒设置中关闭。`:`There is a new reply to your question on DrFrog.\n\nSign in to read it: ${discussion}\n\nThis email does not contain the question or reply text. At most one reminder per question per hour is sent.\n\nTurn off reply emails: ${unsubscribe}\nYou can also turn them off in the website's email settings.`};
}
async function eligible(db,item){
 const details=await eventDetails(db,{eventKind:item.event_kind,eventId:item.event_kind==='answer'?item.answer_id:item.reply_id,answerId:item.answer_id,postId:item.post_id,actorId:item.actor_id});
 if(!details||details.recipient_id!==item.recipient_id||details.actor_id===item.recipient_id||await isBlocked(db,item.recipient_id,item.actor_id)||await isBlocked(db,item.recipient_id,details.answer_author_id))return null;
 const settings=await one(db,'SELECT * FROM reply_notification_settings WHERE user_id=? AND enabled=1',item.recipient_id);
 return settings&&validEmail(settings.email)?settings:null;
}
async function releaseWindow(db,item,sentAt=null){
 await query(db,`UPDATE reply_notification_send_windows SET reserved_at=NULL,reserved_until=0,reservation_id=NULL${sentAt===null?'':',last_sent=MAX(COALESCE(last_sent,0),?)'} WHERE recipient_id=? AND post_id=? AND reservation_id=?`,...(sentAt===null?[]:[sentAt]),item.recipient_id,item.post_id,item.id).run();
}
async function process(db,env,item,fetcher,now){
 const claim=await query(db,"UPDATE reply_notification_outbox SET state='sending',locked_at=? WHERE id=? AND state='pending' AND next_attempt<=? AND attempts<3",now,item.id,now).run();if(!claim.meta.changes)return;
 const settings=await eligible(db,item);
 if(!settings){await query(db,"UPDATE reply_notification_outbox SET state='suppressed',last_error='unavailable' WHERE id=? AND state='sending'",item.id).run();return;}
 // A durable owner/question guard survives deletion of an answer or follow-up.
 // The short reservation serializes concurrent workers before contacting Brevo.
 const window=await query(db,'INSERT INTO reply_notification_send_windows(recipient_id,post_id,last_sent,reserved_at,reserved_until,reservation_id) VALUES(?,?,NULL,?,?,?) ON CONFLICT(recipient_id,post_id) DO UPDATE SET reserved_at=excluded.reserved_at,reserved_until=excluded.reserved_until,reservation_id=excluded.reservation_id WHERE reply_notification_send_windows.reserved_until<=? AND (reply_notification_send_windows.last_sent IS NULL OR reply_notification_send_windows.last_sent<=?)',item.recipient_id,item.post_id,now,now+2*60000,item.id,now,now-HOUR).run();
 if(!window.meta.changes){
  const guard=await one(db,'SELECT last_sent,reserved_until FROM reply_notification_send_windows WHERE recipient_id=? AND post_id=?',item.recipient_id,item.post_id);
  const ready=Math.max(now+1000,(guard?.last_sent??0)+HOUR,guard?.reserved_until??0);
  await query(db,"UPDATE reply_notification_outbox SET state='pending',locked_at=NULL,next_attempt=?,last_error='hourlyLimit' WHERE id=? AND state='sending'",ready,item.id).run();return;
 }
 const dailyCap=Math.min(200,Math.max(1,Number.parseInt(env.NOTIFICATION_DAILY_LIMIT,10)||200)),day=new Date(now).toISOString().slice(0,10);
 const budget=await query(db,'INSERT INTO reply_notification_budget(day,used) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET used=reply_notification_budget.used+1 WHERE reply_notification_budget.used<?',day,dailyCap).run();
 if(!budget.meta.changes){await query(db,"UPDATE reply_notification_outbox SET state='pending',next_attempt=?,locked_at=NULL,last_error='dailyLimit' WHERE id=? AND state='sending'",Math.floor(now/DAY)*DAY+DAY,item.id).run();await releaseWindow(db,item);return;}
 const optOutToken=token();await query(db,'INSERT INTO reply_notification_unsubscribe(token_hash,user_id,created) VALUES(?,?,?)',await hash(optOutToken),item.recipient_id,now).run();
 const currentSettings=await one(db,"SELECT s.enabled,s.email FROM reply_notification_settings s JOIN reply_notification_outbox o ON o.recipient_id=s.user_id WHERE s.user_id=? AND o.id=? AND o.state='sending'",item.recipient_id,item.id);
 if(!currentSettings?.enabled||currentSettings.email!==settings.email){await query(db,"UPDATE reply_notification_outbox SET state='suppressed',last_error='optedOut' WHERE id=? AND state='sending'",item.id).run();await releaseWindow(db,item);return;}
 const attempt=await query(db,"UPDATE reply_notification_outbox SET attempts=attempts+1 WHERE id=? AND state='sending'",item.id).run();if(!attempt.meta.changes){await releaseWindow(db,item);return;}
 try{
  // Keep the provider URL fixed. No request-origin or user-supplied destination.
  const response=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','api-key':env.BREVO_API_KEY},body:JSON.stringify(message(env,item,settings,optOutToken)),signal:AbortSignal.timeout(8000)});
  if(response.ok){await query(db,"UPDATE reply_notification_outbox SET state='sent',sent_at=?,last_error=NULL WHERE id=? AND state='sending'",now,item.id).run();await releaseWindow(db,item,now);return;}
  // A 429 explicitly rejects the send and can be retried. Transport failures
  // and other server errors may have accepted it, so avoid duplicate mail.
  const retry=response.status===429&&item.attempts+1<3;
  await query(db,"UPDATE reply_notification_outbox SET state=?,next_attempt=?,last_error=?,locked_at=NULL WHERE id=? AND state='sending'",retry?'pending':'failed',now+10*60000,retry?'rateLimited':'providerRejected',item.id).run();
  await releaseWindow(db,item,response.status>=500?now:null);
 }catch{
  await query(db,"UPDATE reply_notification_outbox SET state='failed',last_error='deliveryUnknown',locked_at=NULL WHERE id=? AND state='sending'",item.id).run();
  await releaseWindow(db,item,now);
 }
}
// Run with ctx.waitUntil after a published reply, or on authenticated activity.
// No cron job or paid queue is needed. Explicit rate-limit rejections retry on
// later activity. Ambiguous transport failures are not retried automatically.
export async function flushReplyNotifications(env,{recipientId,limit=3,fetcher=fetch,now=Date.now()}={}){
 try{
  if(!replyEmailConfigured(env)||!env.DB)return {processed:0};const db=env.DB;await ensureReplyNotificationsSchema(db);
  // A terminated worker's sending state is ambiguous; never resend it.
  await query(db,'UPDATE reply_notification_send_windows SET last_sent=MAX(COALESCE(last_sent,0),reserved_at),reserved_at=NULL,reserved_until=0,reservation_id=NULL WHERE reservation_id IS NOT NULL AND reserved_until<=?',now).run();
  await query(db,"UPDATE reply_notification_outbox SET state='failed',last_error='deliveryUnknown',locked_at=NULL WHERE state='sending' AND locked_at<?",now-2*60000).run();
  await query(db,"UPDATE reply_notification_outbox SET state='suppressed',last_error='expired' WHERE state='pending' AND created<?",now-7*DAY).run();
  const count=Math.min(5,Math.max(1,Number.isSafeInteger(limit)?limit:3));
  const rows=(await query(db,`SELECT * FROM reply_notification_outbox WHERE state='pending' AND next_attempt<=? AND attempts<3${recipientId?' AND recipient_id=?':''} ORDER BY created,id LIMIT ?`,now,...(recipientId?[recipientId]:[]),count).all()).results;
  for(const item of rows){try{await process(db,env,item,fetcher,now);}catch{}}
  // Retain recent delivery state for deduplication; remove expired tokens and
  // terminal event references so the notification store has bounded retention.
  await db.batch([query(db,"DELETE FROM reply_notification_outbox WHERE state IN ('sent','failed','suppressed') AND created<?",now-30*DAY),query(db,'DELETE FROM reply_notification_unsubscribe WHERE created<?',now-TOKEN_LIFETIME),query(db,'DELETE FROM reply_notification_budget WHERE day<?',new Date(now-30*DAY).toISOString().slice(0,10))]);
  return {processed:rows.length};
 }catch{return {processed:0};}
}
const html=(title,content,status=200)=>new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · DrFrog</title><style>body{font-family:system-ui,sans-serif;background:#e9e0d0;color:#30332c;max-width:38rem;margin:10vh auto;padding:1.5rem;line-height:1.7}main{background:#fffaf1;border:2px solid #6f8097;border-radius:1.5rem;padding:2rem}button,a{font:inherit}button{padding:.7rem 1rem;border:2px solid #30332c;border-radius:1rem;background:#c88972;color:#25271f;cursor:pointer}a{color:#334d69}</style><main>${content}</main></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
// Root API must dispatch this exact route before authentication/JSON parsing.
// GET is confirmation only (email link scanners must not change preferences).
// POST requires the random 256-bit capability token; no account ID is in URLs.
export async function handleNotificationUnsubscribe(request,url,env){
 if(url.pathname!=='/api/notification-unsubscribe')return null;
 if(!env.DB)return html('Unavailable','<h1>Please try again later / 请稍后再试</h1>',503);
 if(!['GET','POST'].includes(request.method))return html('Not allowed','<h1>Method not allowed / 请求方式不支持</h1>',405);
 try{
  await ensureReplyNotificationsSchema(env.DB);let value;
  if(request.method==='GET')value=url.searchParams.get('token');
  else{
   if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')||Number(request.headers.get('content-length')||0)>2048)return html('Invalid link','<h1>Invalid request / 请求无效</h1>',400);
   const reader=request.body?.getReader();if(!reader)return html('Invalid link','<h1>Invalid request / 请求无效</h1>',400);
   const chunks=[];let size=0;
   for(;;){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>2048){await reader.cancel();return html('Invalid link','<h1>Invalid request / 请求无效</h1>',400);}chunks.push(chunk);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   value=new URLSearchParams(new TextDecoder().decode(bytes)).get('token');
  }
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return html('Invalid link','<h1>This link is unavailable / 此链接不可用</h1><p>You can change email preferences after signing in. 登录后可修改邮件提醒设置。</p><a href="/">Open DrFrog / 打开共识之地</a>',400);
  const row=await one(env.DB,'SELECT t.user_id,s.enabled FROM reply_notification_unsubscribe t JOIN reply_notification_settings s ON s.user_id=t.user_id WHERE t.token_hash=? AND t.created>?',await hash(value),Date.now()-TOKEN_LIFETIME);
  if(!row?.enabled)return html('Link unavailable','<h1>This link is unavailable / 此链接不可用</h1><p>Reply emails may already be off. 回复邮件提醒可能已经关闭。</p><a href="/">Open DrFrog / 打开共识之地</a>',400);
  if(request.method==='GET')return html('Turn off reply emails',`<h1>Turn off reply emails?<br>关闭回复邮件提醒？</h1><p>This will turn off reminders for all your DrFrog questions. Your account and posts will stay available.<br>这会关闭你所有问题的回复邮件提醒。你的账号和帖子仍可正常使用。</p><form method="post" action="/api/notification-unsubscribe"><input type="hidden" name="token" value="${value}"><button type="submit">Turn off reply emails / 关闭回复邮件</button></form><p><a href="/">Return to DrFrog / 返回共识之地</a></p>`);
  await disable(env.DB,row.user_id,Date.now());return html('Reply emails turned off','<h1>Reply emails are off.<br>回复邮件提醒已关闭。</h1><p>You can enable them again in your account’s email settings.<br>你可以在账号的邮件提醒设置中重新开启。</p><a href="/">Return to DrFrog / 返回共识之地</a>');
 }catch{return html('Unavailable','<h1>Please try again later / 请稍后再试</h1>',503);}
}
