import {authenticatedUser,authConfig,AuthError} from './auth.mjs';
import {handleAuth} from './auth-routes.mjs';
import {ensureCommunitySchema,validatePreferences,readPreferences,PREFERENCE_COLUMNS,SUPPORT_KINDS,QUESTION_STATUSES} from './community-features.mjs';
import {ensurePublicAnswersSchema,PUBLIC_ANSWER_CONSENT} from './public-answers.mjs';
import {ensureWorkspaceSchema,handleWorkspace} from './workspace.mjs';
import {ensureCampusSpacesSchema,handleCampusSpaces} from './campus-spaces.mjs';
import {ensureReactionsSchema,handleReaction,reactionCounts,reactionState} from './reactions.mjs';
import {handleNotificationSettings,handleNotificationUnsubscribe,queueReplyNotification,flushReplyNotifications,replyEmailConfigured} from './reply-notifications.mjs';
export const TOPICS=['Communication','Studying','Campus life','Adjustments'];
export const GUIDE_IDS=['communication','studying','sensory','adjustments','preferences'];
class HttpError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const fail=(status,code)=>{throw new HttpError(status,code);};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const query=(db,sql,...values)=>db.prepare(sql).bind(...values);
const one=(db,sql,...values)=>query(db,sql,...values).first();
const many=async(db,sql,...values)=>(await query(db,sql,...values).all()).results;
function text(value,min,max){if(typeof value!=='string')fail(400,'invalidInput');const s=value.trim();if(s.length<min||s.length>max)fail(400,'invalidInput');return s;}
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'invalidInput');
 if(Number(request.headers.get('content-length')||0)>16384)fail(413,'tooLarge');
 const reader=request.body?.getReader();if(!reader)fail(400,'invalidInput');const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();fail(413,'tooLarge');}chunks.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.length;}
 try{const parsed=JSON.parse(new TextDecoder().decode(data));if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')fail(400,'invalidInput');return parsed;}catch(e){if(e instanceof HttpError)throw e;fail(400,'invalidInput');}
}
function moderator(user,env){return !!user&&((!!env.MODERATOR_USER_ID&&user.id===env.MODERATOR_USER_ID)||(!!env.MODERATOR_EMAIL&&user.email.toLowerCase()===env.MODERATOR_EMAIL.toLowerCase()));}
async function profile(db,id){const p=await one(db,`SELECT p.id,p.name,p.group_name AS "group",p.role,p.university,p.language,p.created,${PREFERENCE_COLUMNS} FROM profiles p LEFT JOIN profile_preferences pp ON pp.user_id=p.id WHERE p.id=?`,id);if(!p)fail(403,'finishOnboarding');const {pref_tags,pref_language,pref_visible,...member}=p;return {...member,preferences:readPreferences(p,true)};}
async function blocked(db,a,b){return !!await one(db,'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',a,b,b,a);}
async function conversation(db,id,user){const c=await one(db,'SELECT * FROM conversations WHERE id=? AND (author_id=? OR helper_id=?)',id,user,user);if(!c)fail(404,'notFound');if(await blocked(db,c.author_id,c.helper_id))fail(403,'blocked');return c;}
async function limit(db,table,field,id,max){const allowed={posts:'author_id',offers:'helper_id',messages:'author_id',reports:'reporter_id',takeaways:'author_id',question_answers:'author_id',question_answer_replies:'author_id',campus_spaces:'author_id'};if(allowed[table]!==field)throw new Error('Invalid rate limit');const row=await one(db,`SELECT COUNT(*) AS total FROM ${table} WHERE ${field}=? AND created>?`,id,Date.now()-60000);if(row.total>=max)fail(429,'tooFast');}
function cursor(value){if(value==null)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail(400,'invalidInput');return n;}
function publicQuestion(p,id){return {id:p.id,title:p.title,body:p.body,topic:p.topic,supportKind:p.supportKind,status:p.questionStatus,authorId:p.author_id,name:p.name,role:p.role,university:p.university,preferences:readPreferences(p),created:p.created,mine:p.author_id===id,answerCount:p.answerCount??0,likeCount:p.likeCount??0,liked:p.liked??false,offers:[]};}
function publicAnswer(a,id){return {id:a.id,postId:a.post_id,body:a.body,authorId:a.author_id,name:a.name,role:a.role,university:a.university,preferences:readPreferences(a),created:a.created,mine:a.author_id===id,replyCount:a.replyCount??0,likeCount:a.likeCount??0,liked:a.liked??false};}
async function visibleQuestion(db,postId,id){const p=await one(db,"SELECT p.*,COALESCE(qf.status,'open') AS questionStatus FROM posts p LEFT JOIN question_features qf ON qf.post_id=p.id WHERE p.id=?",postId);if(!p||await blocked(db,id,p.author_id))fail(404,'notFound');return p;}
async function visibleAnswer(db,answerId,id){const a=await one(db,'SELECT a.*,p.author_id AS question_author_id,p.title AS question_title,p.body AS question_body FROM question_answers a JOIN posts p ON p.id=a.post_id WHERE a.id=?',answerId);if(!a||await blocked(db,id,a.question_author_id)||await blocked(db,id,a.author_id))fail(404,'notFound');return a;}
async function visibleReply(db,replyId,id){const r=await one(db,'SELECT * FROM question_answer_replies WHERE id=?',replyId);if(!r||await blocked(db,id,r.author_id))fail(404,'notFound');const answer=await visibleAnswer(db,r.answer_id,id);return {...r,answer};}
function publicText(input){if(input.visibilityConsent!==true)fail(400,'consentRequired');if(Object.keys(input).some(key=>!['body','visibilityConsent'].includes(key)))fail(400,'invalidInput');return text(input.body,1,2000);}

function background(ctx,task){if(ctx?.waitUntil)ctx.waitUntil(task.catch(()=>{}));else task.catch(()=>{});}
async function replyEmail(env,event){if(replyEmailConfigured(env))await queueReplyNotification(env,event);}
export async function handleApi(request,env,ctx){
 try{
  const url=new URL(request.url), path=url.pathname, method=request.method;
  if(path==='/api/auth-config'&&method==='GET')return json(authConfig(env));
  if(path==='/api/health'&&method==='GET')return json({ok:true,storage:env.DB?'configured':'unavailable',version:'1.0.0'});
  if(!env.DB)fail(503,'unavailable');const db=env.DB;
  if(path==='/api/notification-unsubscribe')return await handleNotificationUnsubscribe(request,url,env);
  if(method!=='GET'){
   if(!['POST','PUT','DELETE'].includes(method))fail(405,'notAllowed');
   if(request.headers.get('origin')!==url.origin||request.headers.get('x-common-ground')!=='1')fail(403,'badOrigin');
  }
  if(path.startsWith('/api/auth/')){
   if(method!=='POST')fail(405,'notAllowed');
   return await handleAuth(request,env,await body(request));
  }
  const user=await authenticatedUser(request,env),id=user?.id??null;
  if(id){await ensureCommunitySchema(db);await ensurePublicAnswersSchema(db);}
  if(path==='/api/me'&&method==='GET'){
   const exists=id?await one(db,'SELECT id FROM profiles WHERE id=?',id):null;
   const p=exists?await profile(db,id):null;
   if(p&&replyEmailConfigured(env))background(ctx,flushReplyNotifications(env,{recipientId:id,limit:1}));
   return json({signedIn:!!id,profile:p,moderator:moderator(user,env)});
  }
  if(!id)fail(401,'signIn');
  if(path==='/api/profile'&&method==='PUT'){
   const input=await body(request);const previous=await one(db,'SELECT * FROM profiles WHERE id=?',id);
   if(!previous&&input.consent!==true)fail(400,'consentRequired');
   const name=text(input.name,1,40), group=input.group,role=input.role,language=input.language;
   if(!['neurodivergent','neurotypical'].includes(group)||!['Student','Staff member'].includes(role)||!['en','zh'].includes(language))fail(400,'invalidInput');
   const university=text(input.university??'',0,80);
   const preferences=input.preferences===undefined?null:validatePreferences(input.preferences,fail),updated=Date.now();
   const statements=[query(db,'INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name,role=excluded.role,university=excluded.university,language=excluded.language',id,name,group,role,university,language,'2026-09-30-v1',updated)];
   if(preferences)statements.push(query(db,'INSERT INTO profile_preferences(user_id,tags_json,preferred_language,visible,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET tags_json=excluded.tags_json,preferred_language=excluded.preferred_language,visible=excluded.visible,updated=excluded.updated',id,JSON.stringify(preferences.tags),preferences.preferredLanguage,Number(preferences.visible),updated));
   await db.batch(statements);
   return json({profile:await profile(db,id)});
  }
  const me=await profile(db,id);
  if(path==='/api/notification-settings')return await handleNotificationSettings(request,url,user,me,{env,db,body,fail,json});
  if(path==='/api/notification-dispatch'&&method==='POST'){if(Object.keys(await body(request)).length)fail(400,'invalidInput');if(replyEmailConfigured(env))background(ctx,flushReplyNotifications(env,{limit:1}));return json({ok:true});}
  const reactionMatch=path.match(/^\/api\/(questions|answers)\/([^/]+)\/likes$/);
  if(reactionMatch){await ensureReactionsSchema(db);return await handleReaction(request,reactionMatch[1]==='questions'?'question':'answer',reactionMatch[2],id,{db,body,text,fail,json,query,visibleQuestion,visibleAnswer});}
  if(method==='GET'&&(path==='/api/questions'||/^\/api\/questions\/[^/]+(?:\/answers)?$/.test(path)||/^\/api\/answers\/[^/]+$/.test(path)))await ensureReactionsSchema(db);
  if(path==='/api/workspace'||path.startsWith('/api/workspace/')){await ensureWorkspaceSchema(db);return await handleWorkspace(request,url,id,{db,body,text,fail,json,one,many,query,blocked,TOPICS,SUPPORT_KINDS});}
  if(path==='/api/campus-spaces'||path.startsWith('/api/campus-spaces/')){await ensureCampusSpacesSchema(db);return await handleCampusSpaces(request,url,id,{db,body,text,fail,json,one,many,query,blocked,cursor,limit});}
  if(path==='/api/reports'||path.startsWith('/api/reports/'))await ensureCampusSpacesSchema(db);
  if(path==='/api/questions'&&method==='GET'){
   const before=cursor(url.searchParams.get('before'))??Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')??'';
   const status=url.searchParams.get('status'),awaiting=url.searchParams.get('awaiting'),topic=url.searchParams.get('topic');if(status!==null&&!QUESTION_STATUSES.includes(status)||awaiting!==null&&awaiting!=='1'||topic!==null&&!TOPICS.includes(topic))fail(400,'invalidInput');
   const values=[id,id,before,before,beforeId,id,id];let filters='';
   if(status){filters+=' AND COALESCE(qf.status,\'open\')=?';values.push(status);}
   if(topic){filters+=' AND p.topic=?';values.push(topic);}
   if(awaiting==='1'){
    filters+=` AND NOT EXISTS(SELECT 1 FROM question_answers waiting_answer WHERE waiting_answer.post_id=p.id
     AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=waiting_answer.author_id) OR (b.blocker_id=waiting_answer.author_id AND b.blocked_id=?)))`;
    values.push(id,id);
    filters+=` AND COALESCE(qf.status,'open')='open' AND NOT EXISTS(SELECT 1 FROM offers waiting WHERE waiting.post_id=p.id AND waiting.status!='declined'
     AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=p.author_id AND b.blocked_id=waiting.helper_id) OR (b.blocker_id=waiting.helper_id AND b.blocked_id=p.author_id))
     AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=waiting.helper_id) OR (b.blocker_id=waiting.helper_id AND b.blocked_id=?)))`;
    values.push(id,id);
   }
   const posts=await many(db,`SELECT p.*,u.name,u.role,u.university,COALESCE(qf.support_kind,'') AS supportKind,COALESCE(qf.status,'open') AS questionStatus,${PREFERENCE_COLUMNS},
    (SELECT COUNT(*) FROM question_answers a WHERE a.post_id=p.id AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=a.author_id) OR (b.blocker_id=a.author_id AND b.blocked_id=?))) AS answerCount
    FROM posts p JOIN profiles u ON u.id=p.author_id LEFT JOIN question_features qf ON qf.post_id=p.id LEFT JOIN profile_preferences pp ON pp.user_id=p.author_id
    WHERE (p.created<? OR (p.created=? AND p.id<?)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?))${filters} ORDER BY p.created DESC,p.id DESC LIMIT 51`,...values);
   const selected=posts.slice(0,50);const offers=await many(db,`SELECT o.*,u.name,${PREFERENCE_COLUMNS},(SELECT c.id FROM conversations c WHERE c.offer_id=o.id) AS conversationId FROM offers o JOIN profiles u ON u.id=o.helper_id JOIN posts p ON p.id=o.post_id LEFT JOIN profile_preferences pp ON pp.user_id=o.helper_id
    WHERE (p.author_id=? OR o.helper_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=p.author_id AND b.blocked_id=o.helper_id) OR (b.blocker_id=o.helper_id AND b.blocked_id=p.author_id)) ORDER BY o.created DESC LIMIT 500`,id,id);
   const counts=await reactionCounts(db,'question',selected.map(p=>p.id),id);
   return json({questions:selected.map(p=>({...publicQuestion(p,id),...reactionState(counts,p.id),offers:offers.filter(o=>o.post_id===p.id).map(o=>({id:o.id,name:o.name,helperId:o.helper_id,text:o.body,status:o.status,conversationId:o.conversationId,preferences:readPreferences(o),mine:o.helper_id===id}))})),hasMore:posts.length>50});
  }
  if(path==='/api/questions'&&method==='POST'){
   await limit(db,'posts','author_id',id,10);
   const input=await body(request), title=text(input.title,1,140),details=text(input.body,1,2000);if(!TOPICS.includes(input.topic))fail(400,'invalidInput');
   const supportKind=input.supportKind??'';if(supportKind!==''&&!SUPPORT_KINDS.includes(supportKind))fail(400,'invalidInput');
   const postId=crypto.randomUUID(),created=Date.now();await db.batch([
    query(db,'INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)',postId,id,title,details,input.topic,created),
    query(db,'INSERT INTO question_features(post_id,support_kind,status,updated) VALUES(?,?,?,?)',postId,supportKind,'open',created)
   ]);return json({id:postId},201);
  }
  if(path==='/api/helpers'&&method==='GET'){
   const helpers=await many(db,`SELECT p.id,p.name,p.role,p.university,${PREFERENCE_COLUMNS} FROM profiles p LEFT JOIN profile_preferences pp ON pp.user_id=p.id WHERE p.id!=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=?)) ORDER BY p.created DESC LIMIT 30`,id,id,id);
   return json({helpers:helpers.map(p=>({id:p.id,name:p.name,role:p.role,university:p.university,preferences:readPreferences(p)}))});
  }
  let match=path.match(/^\/api\/questions\/([^/]+)$/);
  if(match&&method==='GET'){
   const p=await one(db,`SELECT p.*,u.name,u.role,u.university,COALESCE(qf.support_kind,'') AS supportKind,COALESCE(qf.status,'open') AS questionStatus,${PREFERENCE_COLUMNS},
    (SELECT COUNT(*) FROM question_answers a WHERE a.post_id=p.id AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=a.author_id) OR (b.blocker_id=a.author_id AND b.blocked_id=?))) AS answerCount
    FROM posts p JOIN profiles u ON u.id=p.author_id LEFT JOIN question_features qf ON qf.post_id=p.id LEFT JOIN profile_preferences pp ON pp.user_id=p.author_id
    WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?))`,id,id,match[1],id,id);
   if(!p)fail(404,'notFound');return json({question:{...publicQuestion(p,id),...reactionState(await reactionCounts(db,'question',[p.id],id),p.id)}});
  }
  if(match&&method==='DELETE'){const result=await query(db,'DELETE FROM posts WHERE id=? AND author_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  match=path.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if(match){
   const post=await visibleQuestion(db,match[1],id);
   if(method==='GET'){
    const before=cursor(url.searchParams.get('before'))??Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')??'';
    const rows=await many(db,`SELECT a.*,u.name,u.role,u.university,${PREFERENCE_COLUMNS},
     (SELECT COUNT(*) FROM question_answer_replies r WHERE r.answer_id=a.id AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.author_id) OR (b.blocker_id=r.author_id AND b.blocked_id=?))) AS replyCount
     FROM question_answers a JOIN profiles u ON u.id=a.author_id LEFT JOIN profile_preferences pp ON pp.user_id=a.author_id
     WHERE a.post_id=? AND (a.created<? OR (a.created=? AND a.id<?))
     AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=a.author_id) OR (b.blocker_id=a.author_id AND b.blocked_id=?)) ORDER BY a.created DESC,a.id DESC LIMIT 21`,id,id,post.id,before,before,beforeId,id,id);
    const own=await one(db,'SELECT id FROM question_answers WHERE post_id=? AND author_id=?',post.id,id);
    const selected=rows.slice(0,20),counts=await reactionCounts(db,'answer',selected.map(a=>a.id),id);
    return json({answers:selected.map(a=>({...publicAnswer(a,id),...reactionState(counts,a.id)})),hasMore:rows.length>20,ownAnswerId:own?.id??null});
   }
   if(method==='POST'){
    if(post.author_id===id)fail(400,'invalidInput');if(post.questionStatus==='resolved')fail(409,'questionResolved');await limit(db,'question_answers','author_id',id,10);
    const input=await body(request),message=publicText(input),answerId=crypto.randomUUID();
    if(await one(db,'SELECT id FROM question_answers WHERE post_id=? AND author_id=?',post.id,id))fail(409,'alreadyAnswered');
    const result=await query(db,"INSERT INTO question_answers(id,post_id,author_id,body,visibility_consent_version,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts p LEFT JOIN question_features qf ON qf.post_id=p.id WHERE p.id=? AND COALESCE(qf.status,'open')='open') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)) ON CONFLICT(post_id,author_id) DO NOTHING",answerId,post.id,id,message,PUBLIC_ANSWER_CONSENT,Date.now(),post.id,id,post.author_id,post.author_id,id).run();
    if(!result.meta.changes){if(await one(db,'SELECT id FROM question_answers WHERE post_id=? AND author_id=?',post.id,id))fail(409,'alreadyAnswered');const fresh=await visibleQuestion(db,post.id,id);if(fresh.questionStatus==='resolved')fail(409,'questionResolved');fail(409,'alreadyAnswered');}
    await replyEmail(env,{eventKind:'answer',eventId:answerId,postId:post.id,actorId:id});
    return json({id:answerId},201);
   }
  }
  match=path.match(/^\/api\/answers\/([^/]+)$/);
  if(match&&method==='GET'){
   const answer=await visibleAnswer(db,match[1],id);
   const row=await one(db,`SELECT a.*,u.name,u.role,u.university,${PREFERENCE_COLUMNS},
    (SELECT COUNT(*) FROM question_answer_replies r WHERE r.answer_id=a.id AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.author_id) OR (b.blocker_id=r.author_id AND b.blocked_id=?))) AS replyCount
    FROM question_answers a JOIN profiles u ON u.id=a.author_id LEFT JOIN profile_preferences pp ON pp.user_id=a.author_id WHERE a.id=?`,id,id,answer.id);
   if(!row)fail(404,'notFound');return json({answer:{...publicAnswer(row,id),...reactionState(await reactionCounts(db,'answer',[row.id],id),row.id)}});
  }
  if(match&&method==='DELETE'){const result=await query(db,'DELETE FROM question_answers WHERE id=? AND author_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  match=path.match(/^\/api\/answers\/([^/]+)\/replies$/);
  if(match){
   const answer=await visibleAnswer(db,match[1],id);
   if(method==='GET'){
    const after=cursor(url.searchParams.get('after')),before=cursor(url.searchParams.get('before'));if(after!==null&&before!==null)fail(400,'invalidInput');
    const rows=await many(db,`SELECT r.id,r.answer_id,r.author_id,r.body,r.created,u.name,u.role,u.university,${PREFERENCE_COLUMNS}
     FROM question_answer_replies r JOIN profiles u ON u.id=r.author_id LEFT JOIN profile_preferences pp ON pp.user_id=r.author_id
     WHERE r.answer_id=? AND r.id${after!==null?'>':'<'}? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.author_id) OR (b.blocker_id=r.author_id AND b.blocked_id=?))
     ORDER BY r.id ${after!==null?'ASC':'DESC'} LIMIT 51`,answer.id,after??before??Number.MAX_SAFE_INTEGER,id,id);
    const selected=rows.slice(0,50);if(after===null)selected.reverse();
    return json({replies:selected.map(r=>({id:r.id,answerId:r.answer_id,body:r.body,authorId:r.author_id,name:r.name,role:r.role,university:r.university,preferences:readPreferences(r),created:r.created,mine:r.author_id===id})),hasMore:rows.length>50});
   }
   if(method==='POST'){
    await limit(db,'question_answer_replies','author_id',id,30);const input=await body(request),message=publicText(input);
    const result=await query(db,'INSERT INTO question_answer_replies(answer_id,author_id,body,visibility_consent_version,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM question_answers WHERE id=?) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))',answer.id,id,message,PUBLIC_ANSWER_CONSENT,Date.now(),answer.id,id,answer.question_author_id,answer.question_author_id,id,id,answer.author_id,answer.author_id,id).run();
    if(!result.meta.changes)fail(404,'notFound');await replyEmail(env,{eventKind:'reply',eventId:result.meta.last_row_id,answerId:answer.id,postId:answer.post_id,actorId:id});return json({id:result.meta.last_row_id},201);
   }
  }
  match=path.match(/^\/api\/replies\/([^/]+)$/);
  if(match&&method==='DELETE'){const replyId=cursor(match[1]);const result=await query(db,'DELETE FROM question_answer_replies WHERE id=? AND author_id=?',replyId,id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  match=path.match(/^\/api\/questions\/([^/]+)\/status$/);
  if(match&&method==='POST'){
   const input=await body(request);if(!QUESTION_STATUSES.includes(input.status))fail(400,'invalidInput');
   const post=await one(db,'SELECT id FROM posts WHERE id=? AND author_id=?',match[1],id);if(!post)fail(404,'notFound');
   await query(db,"INSERT INTO question_features(post_id,support_kind,status,updated) VALUES(?,'',?,?) ON CONFLICT(post_id) DO UPDATE SET status=excluded.status,updated=excluded.updated",post.id,input.status,Date.now()).run();
   return json({ok:true,status:input.status});
  }
  match=path.match(/^\/api\/questions\/([^/]+)\/offers$/);
  if(match&&method==='POST'){
   await limit(db,'offers','helper_id',id,10);
   const post=await one(db,"SELECT p.*,COALESCE(qf.status,'open') AS questionStatus FROM posts p LEFT JOIN question_features qf ON qf.post_id=p.id WHERE p.id=?",match[1]);if(!post)fail(404,'notFound');if(post.author_id===id)fail(400,'invalidInput');if(await blocked(db,id,post.author_id))fail(403,'blocked');if(post.questionStatus==='resolved')fail(409,'questionResolved');
   const input=await body(request),message=text(input.message,1,1000),offerId=crypto.randomUUID();
   if(await one(db,'SELECT id FROM offers WHERE post_id=? AND helper_id=?',post.id,id))fail(409,'alreadyOffered');
   const result=await query(db,"INSERT INTO offers(id,post_id,helper_id,body,status,created) SELECT ?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM posts p LEFT JOIN question_features qf ON qf.post_id=p.id WHERE p.id=? AND COALESCE(qf.status,'open')='open') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))",offerId,post.id,id,message,Date.now(),post.id,id,post.author_id,post.author_id,id).run();if(!result.meta.changes)fail(409,'questionResolved');return json({id:offerId},201);
  }
  match=path.match(/^\/api\/offers\/([^/]+)\/(accept|decline)$/);
  if(match&&method==='POST'){
   const o=await one(db,'SELECT o.*,p.author_id FROM offers o JOIN posts p ON p.id=o.post_id WHERE o.id=? AND p.author_id=?',match[1],id);if(!o)fail(404,'notFound');if(await blocked(db,id,o.helper_id))fail(403,'blocked');
   if(match[2]==='decline'){await query(db,"UPDATE offers SET status='declined' WHERE id=? AND status='pending'",o.id).run();return json({ok:true});}
   if(o.status==='declined')fail(409,'offerClosed');const cid=crypto.randomUUID();
   await db.batch([
    query(db,"UPDATE offers SET status='accepted' WHERE id=? AND status='pending'",o.id),
    query(db,"INSERT INTO conversations(id,offer_id,post_id,author_id,helper_id,ended,created) SELECT ?,o.id,o.post_id,?,o.helper_id,0,? FROM offers o WHERE o.id=? AND o.status='accepted' ON CONFLICT(offer_id) DO NOTHING",cid,id,Date.now(),o.id)
   ]);
   const c=await one(db,'SELECT id FROM conversations WHERE offer_id=?',o.id);if(!c)fail(409,'offerClosed');return json({conversationId:c.id});
  }
  if(path==='/api/conversations'&&method==='GET'){
   const conversations=await many(db,`SELECT c.id,c.ended,c.created,p.title AS context,
   CASE WHEN c.author_id=? THEN c.helper_id ELSE c.author_id END AS partnerId,
   CASE WHEN c.author_id=? THEN helper.name ELSE author.name END AS name,
   CASE WHEN c.author_id=? THEN helper_pp.tags_json ELSE author_pp.tags_json END AS pref_tags,
   CASE WHEN c.author_id=? THEN helper_pp.preferred_language ELSE author_pp.preferred_language END AS pref_language,
   CASE WHEN c.author_id=? THEN helper_pp.visible ELSE author_pp.visible END AS pref_visible,
   (SELECT MAX(id) FROM messages WHERE conversation_id=c.id) AS lastMessageId
   FROM conversations c JOIN profiles author ON author.id=c.author_id JOIN profiles helper ON helper.id=c.helper_id JOIN posts p ON p.id=c.post_id
   LEFT JOIN profile_preferences author_pp ON author_pp.user_id=c.author_id LEFT JOIN profile_preferences helper_pp ON helper_pp.user_id=c.helper_id
   WHERE (c.author_id=? OR c.helper_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=c.author_id AND b.blocked_id=c.helper_id) OR (b.blocker_id=c.helper_id AND b.blocked_id=c.author_id)) ORDER BY c.created DESC LIMIT 100`,id,id,id,id,id,id,id);
   return json({conversations:conversations.map(p=>{const {pref_tags,pref_language,pref_visible,...connection}=p;return {...connection,partnerPreferences:readPreferences(p)};})});
  }
  match=path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if(match){
   const c=await conversation(db,match[1],id);
   if(method==='GET'){
    const after=cursor(url.searchParams.get('after')),before=cursor(url.searchParams.get('before'));
    let rows;
    if(after!==null)rows=await many(db,'SELECT id,author_id AS authorId,body,guide_id AS guideId,created FROM messages WHERE conversation_id=? AND id>? ORDER BY id ASC LIMIT 101',c.id,after);
    else rows=await many(db,'SELECT id,author_id AS authorId,body,guide_id AS guideId,created FROM messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT 101',c.id,before??Number.MAX_SAFE_INTEGER);
    const selected=rows.slice(0,100);return json({messages:after===null?selected.reverse():selected,hasMore:rows.length>100,ended:!!c.ended});
   }
   if(method==='POST'){
    if(c.ended)fail(409,'connectionEnded');await limit(db,'messages','author_id',id,30);const input=await body(request),message=text(input.body,1,2000);
    if(input.guideId!=null&&!GUIDE_IDS.includes(input.guideId))fail(400,'invalidInput');
    const result=await query(db,'INSERT INTO messages(conversation_id,author_id,body,guide_id,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM conversations WHERE id=? AND ended=0) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))',c.id,id,message,input.guideId??null,Date.now(),c.id,c.author_id,c.helper_id,c.helper_id,c.author_id).run();
    if(!result.meta.changes)fail(409,'connectionEnded');return json({id:result.meta.last_row_id},201);
   }
  }
  match=path.match(/^\/api\/conversations\/([^/]+)\/end$/);
  if(match&&method==='POST'){await conversation(db,match[1],id);await query(db,'UPDATE conversations SET ended=1 WHERE id=?',match[1]).run();return json({ok:true});}
  if(path==='/api/blocks'&&method==='GET')return json({blocks:await many(db,'SELECT b.blocked_id AS id,p.name FROM blocks b JOIN profiles p ON p.id=b.blocked_id WHERE blocker_id=? ORDER BY b.created DESC LIMIT 100',id)});
  if(path==='/api/blocks'&&method==='POST'){
   const input=await body(request),target=text(input.userId,1,200);if(target===id||!await one(db,'SELECT id FROM profiles WHERE id=?',target))fail(400,'invalidInput');
   await query(db,'INSERT INTO blocks(blocker_id,blocked_id,created) VALUES(?,?,?) ON CONFLICT(blocker_id,blocked_id) DO NOTHING',id,target,Date.now()).run();return json({ok:true});
  }
  match=path.match(/^\/api\/blocks\/([^/]+)$/);
  if(match&&method==='DELETE'){await query(db,'DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?',id,match[1]).run();return json({ok:true});}
  if(path==='/api/takeaways'&&method==='GET'){
   const before=cursor(url.searchParams.get('before'))??Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')??'',topic=url.searchParams.get('topic');if(topic!==null&&!TOPICS.includes(topic))fail(400,'invalidInput');
   const values=[before,before,beforeId,id,id];if(topic)values.push(topic);
   const rows=await many(db,`SELECT t.id,t.author_id,t.body,t.topic,t.created FROM takeaways t WHERE (t.created<? OR (t.created=? AND t.id<?))
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=t.author_id) OR (b.blocker_id=t.author_id AND b.blocked_id=?))${topic?' AND t.topic=?':''} ORDER BY t.created DESC,t.id DESC LIMIT 51`,...values);
   return json({takeaways:rows.slice(0,50).map(t=>({id:t.id,body:t.body,topic:t.topic,created:t.created,mine:t.author_id===id})),hasMore:rows.length>50});
  }
  if(path==='/api/takeaways'&&method==='POST'){
   await limit(db,'takeaways','author_id',id,5);const input=await body(request);if(input.publishConsent!==true)fail(400,'consentRequired');
   // This endpoint accepts a new contribution, never a private-message or
   // conversation reference, a peer identifier, or an imported transcript.
   if(Object.keys(input).some(key=>!['body','topic','publishConsent'].includes(key)))fail(400,'invalidInput');
   const content=text(input.body,1,1500);if(!TOPICS.includes(input.topic))fail(400,'invalidInput');const takeawayId=crypto.randomUUID();
   await query(db,'INSERT INTO takeaways(id,author_id,body,topic,consent_version,created) VALUES(?,?,?,?,?,?)',takeawayId,id,content,input.topic,'2026-10-01-takeaway-v1',Date.now()).run();return json({id:takeawayId},201);
  }
  match=path.match(/^\/api\/takeaways\/([^/]+)$/);
  if(match&&method==='DELETE'){const result=await query(db,'DELETE FROM takeaways WHERE id=? AND author_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  match=path.match(/^\/api\/takeaways\/([^/]+)\/reports$/);
  if(match&&method==='POST'){
   await limit(db,'reports','reporter_id',id,5);const input=await body(request),reason=text(input.reason,1,1000);
   const target=await one(db,'SELECT id,author_id,body,topic FROM takeaways WHERE id=?',match[1]);if(!target||await blocked(db,id,target.author_id))fail(404,'notFound');const reportId=crypto.randomUUID();
   // A bounded anonymous snapshot keeps a report reviewable if its author
   // subsequently deletes the contribution. No chat content is copied.
   await db.batch([
    query(db,'INSERT INTO reports(id,reporter_id,post_id,conversation_id,reason,created) VALUES(?,?,NULL,NULL,?,?)',reportId,id,reason,Date.now()),
    query(db,'INSERT INTO takeaway_report_links(report_id,takeaway_id,body_snapshot,topic_snapshot) VALUES(?,?,?,?)',reportId,target.id,target.body,target.topic)
   ]);return json({id:reportId},201);
  }
  if(path==='/api/reports'&&method==='POST'){
   await limit(db,'reports','reporter_id',id,5);const input=await body(request),reason=text(input.reason,1,1000);let postId=null,conversationId=null;
   if(input.answerId!==undefined||input.replyId!==undefined){
    if(input.answerId!==undefined&&input.replyId!==undefined||input.postId!==undefined||input.conversationId!==undefined)fail(400,'invalidInput');
    let answer,reply=null;if(input.answerId!==undefined)answer=await visibleAnswer(db,text(input.answerId,1,200),id);else{if(!Number.isSafeInteger(input.replyId)||input.replyId<=0)fail(400,'invalidInput');reply=await visibleReply(db,input.replyId,id);answer=reply.answer;}
    const reportId=crypto.randomUUID();await db.batch([
     query(db,'INSERT INTO reports(id,reporter_id,post_id,conversation_id,reason,created) VALUES(?,?,?,NULL,?,?)',reportId,id,answer.post_id,reason,Date.now()),
     query(db,'INSERT INTO public_answer_report_links(report_id,target_kind,answer_id,reply_id,answer_body_snapshot,reply_body_snapshot,question_title_snapshot,question_body_snapshot) VALUES(?,?,?,?,?,?,?,?)',reportId,reply?'reply':'answer',answer.id,reply?.id??null,answer.body,reply?.body??null,answer.question_title,answer.question_body)
    ]);return json({id:reportId},201);
   }
   if(input.postId){const p=await one(db,'SELECT id,author_id FROM posts WHERE id=?',text(input.postId,1,200));if(!p||await blocked(db,id,p.author_id))fail(404,'notFound');postId=p.id;}
   if(input.conversationId){await conversation(db,text(input.conversationId,1,200),id);conversationId=input.conversationId;}
   if(!postId&&!conversationId)fail(400,'invalidInput');const reportId=crypto.randomUUID();await query(db,'INSERT INTO reports(id,reporter_id,post_id,conversation_id,reason,created) VALUES(?,?,?,?,?,?)',reportId,id,postId,conversationId,reason,Date.now()).run();return json({id:reportId},201);
  }
  if(path==='/api/reports'&&method==='GET'){if(!moderator(user,env))fail(403,'notAllowed');return json({reports:await many(db,"SELECT r.*,p.title,p.body,tl.takeaway_id AS takeawayId,tl.body_snapshot AS takeawayBody,tl.topic_snapshot AS takeawayTopic,al.target_kind AS answerTarget,al.answer_id AS answerId,al.reply_id AS replyId,al.answer_body_snapshot AS answerBody,al.reply_body_snapshot AS replyBody,al.question_title_snapshot AS questionTitle,al.question_body_snapshot AS questionBody,cl.campus_space_id AS campusSpaceId,cl.place_snapshot AS campusSpacePlace,cl.university_snapshot AS campusSpaceUniversity,cl.description_snapshot AS campusSpaceDescription FROM reports r LEFT JOIN posts p ON p.id=r.post_id LEFT JOIN takeaway_report_links tl ON tl.report_id=r.id LEFT JOIN public_answer_report_links al ON al.report_id=r.id LEFT JOIN campus_space_report_links cl ON cl.report_id=r.id WHERE r.status='open' ORDER BY r.created DESC LIMIT 100")});}
  match=path.match(/^\/api\/reports\/([^/]+)$/);
  if(match&&method==='GET'){if(!moderator(user,env))fail(403,'notAllowed');const report=await one(db,'SELECT r.*,tl.takeaway_id AS takeawayId,tl.body_snapshot AS takeawayBody,tl.topic_snapshot AS takeawayTopic,al.target_kind AS answerTarget,al.answer_id AS answerId,al.reply_id AS replyId,al.answer_body_snapshot AS answerBody,al.reply_body_snapshot AS replyBody,al.question_title_snapshot AS questionTitle,al.question_body_snapshot AS questionBody,cl.campus_space_id AS campusSpaceId,cl.place_snapshot AS campusSpacePlace,cl.university_snapshot AS campusSpaceUniversity,cl.description_snapshot AS campusSpaceDescription FROM reports r LEFT JOIN takeaway_report_links tl ON tl.report_id=r.id LEFT JOIN public_answer_report_links al ON al.report_id=r.id LEFT JOIN campus_space_report_links cl ON cl.report_id=r.id WHERE r.id=?',match[1]);if(!report)fail(404,'notFound');const messages=report.conversation_id?await many(db,'SELECT m.body,m.guide_id AS guideId,m.created,p.name FROM messages m JOIN profiles p ON p.id=m.author_id WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 100',report.conversation_id):[];return json({report,messages:messages.reverse()});}
  match=path.match(/^\/api\/reports\/([^/]+)\/resolve$/);
  if(match&&method==='POST'){
   if(!moderator(user,env))fail(403,'notAllowed');const report=await one(db,'SELECT r.id,tl.report_id AS takeawayReport,tl.takeaway_id AS takeawayId,al.target_kind AS answerTarget,al.answer_id AS answerId,al.reply_id AS replyId,cl.report_id AS campusSpaceReport,cl.campus_space_id AS campusSpaceId FROM reports r LEFT JOIN takeaway_report_links tl ON tl.report_id=r.id LEFT JOIN public_answer_report_links al ON al.report_id=r.id LEFT JOIN campus_space_report_links cl ON cl.report_id=r.id WHERE r.id=?',match[1]);if(!report)fail(404,'notFound');
   const input=request.headers.get('content-type')?.startsWith('application/json')?await body(request):{},removalKeys=['removeTakeaway','removeAnswer','removeReply','removeCampusSpace'];for(const key of removalKeys)if(input[key]!==undefined&&typeof input[key]!=='boolean')fail(400,'invalidInput');
   if(removalKeys.filter(key=>input[key]).length>1||input.removeAnswer&&report.answerTarget!=='answer'||input.removeReply&&report.answerTarget!=='reply'||input.removeTakeaway&&!report.takeawayReport||input.removeCampusSpace&&!report.campusSpaceReport)fail(400,'invalidInput');
   const statements=[query(db,"UPDATE reports SET status='resolved' WHERE id=?",report.id)];if(input.removeTakeaway&&report.takeawayId)statements.unshift(query(db,'DELETE FROM takeaways WHERE id=?',report.takeawayId));if(input.removeAnswer&&report.answerId)statements.unshift(query(db,'DELETE FROM question_answers WHERE id=?',report.answerId));if(input.removeReply&&report.replyId)statements.unshift(query(db,'DELETE FROM question_answer_replies WHERE id=?',report.replyId));if(input.removeCampusSpace&&report.campusSpaceId)statements.unshift(query(db,'DELETE FROM campus_spaces WHERE id=?',report.campusSpaceId));await db.batch(statements);return json({ok:true});
  }
  fail(404,'notFound');
 }catch(error){if(error instanceof HttpError||error instanceof AuthError)return json({error:error.code,...(error.code==='authUnavailable'&&error.diagnostic?{diagnostic:error.diagnostic}:{})},error.status);console.error('Common Ground API unavailable',error?.name);return json({error:'unavailable'},503);}
}
