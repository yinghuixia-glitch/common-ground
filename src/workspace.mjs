// These records belong only to their signed-in owner. Bookmarks retain a
// reference rather than a copy of community text, so deletion/blocking applies.
export const WORKSPACE_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS workspace_drafts (user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,draft_key TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL DEFAULT \'\',body TEXT NOT NULL DEFAULT \'\',topic TEXT NOT NULL DEFAULT \'\',support_kind TEXT NOT NULL DEFAULT \'\',template_id TEXT,language TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,draft_key))',
 'CREATE TABLE IF NOT EXISTS workspace_bookmarks (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,kind TEXT NOT NULL,target_id TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(user_id,kind,target_id))',
 'CREATE INDEX IF NOT EXISTS workspace_bookmarks_owner ON workspace_bookmarks(user_id,created,id)',
 'CREATE TABLE IF NOT EXISTS workspace_plans (id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,steps_json TEXT NOT NULL,remind_at INTEGER,remind_minutes INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,id))',
 'CREATE INDEX IF NOT EXISTS workspace_plans_owner ON workspace_plans(user_id,updated,id)',
 'CREATE TABLE IF NOT EXISTS workspace_write_limits (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,window_start INTEGER NOT NULL,total INTEGER NOT NULL)'
];
const readyDatabases=new WeakMap();
export async function ensureWorkspaceSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){ready=(async()=>{for(const sql of WORKSPACE_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});readyDatabases.set(db,ready);}
 await ready;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function draft(row){return {key:row.draft_key,kind:row.kind,title:row.title,body:row.body,topic:row.topic,supportKind:row.support_kind,templateId:row.template_id,language:row.language,created:row.created,updated:row.updated};}
function plan(row){return {id:row.id,title:row.title,steps:JSON.parse(row.steps_json),remindAt:row.remind_at,remindMinutes:row.remind_minutes,created:row.created,updated:row.updated};}
export async function handleWorkspace(request,url,id,ctx){
 const {db,body,text,fail,json,one,many,query,blocked,TOPICS,SUPPORT_KINDS}=ctx;
 const path=url.pathname,method=request.method;
 const only=(input,keys)=>{if(Object.keys(input).some(k=>!keys.includes(k)))fail(400,'invalidInput');};
 async function writeLimit(){
  const window=Math.floor(Date.now()/60000),r=await query(db,'INSERT INTO workspace_write_limits(user_id,window_start,total) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,total=CASE WHEN workspace_write_limits.window_start=excluded.window_start THEN workspace_write_limits.total+1 ELSE 1 END WHERE workspace_write_limits.window_start!=excluded.window_start OR workspace_write_limits.total<60',id,window).run();
  if(!r.meta.changes)fail(429,'tooFast');
 }
 function expected(input){if(input.expectedUpdated!==undefined&&input.expectedUpdated!==null&&(!Number.isSafeInteger(input.expectedUpdated)||input.expectedUpdated<0))fail(400,'invalidInput');return input.expectedUpdated;}
 if(path==='/api/workspace'&&method==='GET'){
  const drafts=await many(db,'SELECT * FROM workspace_drafts WHERE user_id=? ORDER BY updated DESC,draft_key LIMIT 21',id);
  const plans=await many(db,'SELECT * FROM workspace_plans WHERE user_id=? ORDER BY updated DESC,id DESC LIMIT 30',id);
  const rows=await many(db,`SELECT b.id,b.kind,b.target_id AS targetId,b.created,COALESCE(p.id,ap.id) AS postId,COALESCE(p.title,ap.title) AS title,CASE WHEN b.kind='question' THEN p.body ELSE a.body END AS body,(p.id IS NOT NULL OR (a.id IS NOT NULL AND ap.id IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM blocks block WHERE (block.blocker_id=? AND block.blocked_id IN (p.author_id,ap.author_id,a.author_id)) OR (block.blocked_id=? AND block.blocker_id IN (p.author_id,ap.author_id,a.author_id))) AS available FROM workspace_bookmarks b LEFT JOIN posts p ON b.kind='question' AND p.id=b.target_id LEFT JOIN question_answers a ON b.kind='answer' AND a.id=b.target_id LEFT JOIN posts ap ON ap.id=a.post_id WHERE b.user_id=? ORDER BY b.created DESC,b.id DESC LIMIT 100`,id,id,id);
  const bookmarks=rows.map(row=>row.available?{...row,available:true}:{id:row.id,kind:row.kind,available:false});
  return json({drafts:drafts.map(draft),bookmarks,plans:plans.map(plan)});
 }
 let match=path.match(/^\/api\/workspace\/drafts\/([^/]+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
  let key;try{key=decodeURIComponent(match[1]);}catch{fail(400,'invalidInput');}
  if(key!=='question'&&!/^template:[a-zA-Z0-9_-]{1,60}:(en|zh)$/.test(key))fail(400,'invalidInput');
  if(method==='DELETE'){
   const input=request.body?await body(request):{};only(input,['expectedUpdated']);const compare=input.expectedUpdated;
   if(compare!==undefined&&(!Number.isSafeInteger(compare)||compare<0))fail(400,'invalidInput');await writeLimit();
   const result=await query(db,`DELETE FROM workspace_drafts WHERE user_id=? AND draft_key=?${compare===undefined?'':' AND updated=?'}`,id,key,...(compare===undefined?[]:[compare])).run();
   if(!result.meta.changes&&compare!==undefined&&await one(db,'SELECT 1 FROM workspace_drafts WHERE user_id=? AND draft_key=?',id,key))fail(409,'workspaceConflict');
   return json({ok:true});
  }
  const input=await body(request);let value;
  if(key==='question'){
   only(input,['kind','title','body','topic','supportKind','expectedUpdated']);if(input.kind!=='question')fail(400,'invalidInput');
   const topic=input.topic??'',supportKind=input.supportKind??'';if(topic!==''&&!TOPICS.includes(topic)||supportKind!==''&&!SUPPORT_KINDS.includes(supportKind))fail(400,'invalidInput');
   value={kind:'question',title:text(input.title??'',0,140),body:text(input.body??'',0,2000),topic,supportKind,templateId:null,language:null};
  }else{
   only(input,['kind','templateId','language','body','expectedUpdated']);const templateId=text(input.templateId,1,60);
   if(input.kind!=='template'||!['en','zh'].includes(input.language)||key!==`template:${templateId}:${input.language}`)fail(400,'invalidInput');
   value={kind:'template',title:'',body:text(input.body??'',0,3000),topic:'',supportKind:'',templateId,language:input.language};
  }
  const compare=expected(input);await writeLimit();
  const previous=await one(db,'SELECT updated FROM workspace_drafts WHERE user_id=? AND draft_key=?',id,key);
  if(compare!==undefined&&(compare===null?!!previous:previous?.updated!==compare))fail(409,'workspaceConflict');
  const now=Math.max(Date.now(),(previous?.updated??0)+1);
  const result=await query(db,`INSERT INTO workspace_drafts(user_id,draft_key,kind,title,body,topic,support_kind,template_id,language,created,updated) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_drafts WHERE user_id=? AND draft_key=?) OR (SELECT COUNT(*) FROM workspace_drafts WHERE user_id=?)<21 ON CONFLICT(user_id,draft_key) DO UPDATE SET kind=excluded.kind,title=excluded.title,body=excluded.body,topic=excluded.topic,support_kind=excluded.support_kind,template_id=excluded.template_id,language=excluded.language,updated=excluded.updated${compare===undefined?'':' WHERE workspace_drafts.updated=?'}`,id,key,value.kind,value.title,value.body,value.topic,value.supportKind,value.templateId,value.language,now,now,id,key,id,...(compare===undefined?[]:[compare])).run();
  if(!result.meta.changes)fail(409,compare!==undefined?'workspaceConflict':'workspaceFull');
  return json({draft:draft(await one(db,'SELECT * FROM workspace_drafts WHERE user_id=? AND draft_key=?',id,key))});
 }
 if(path==='/api/workspace/bookmarks'&&method==='POST'){
  const input=await body(request);only(input,['kind','targetId']);if(!['question','answer'].includes(input.kind))fail(400,'invalidInput');const targetId=text(input.targetId,1,200);
  let target;
  if(input.kind==='question'){target=await one(db,'SELECT id AS postId,title,body,author_id FROM posts WHERE id=?',targetId);if(!target||await blocked(db,id,target.author_id))fail(404,'notFound');}
  else{target=await one(db,'SELECT p.id AS postId,p.title,a.body,a.author_id,p.author_id AS questionOwner FROM question_answers a JOIN posts p ON p.id=a.post_id WHERE a.id=?',targetId);if(!target||await blocked(db,id,target.author_id)||await blocked(db,id,target.questionOwner))fail(404,'notFound');}
  await writeLimit();const bookmarkId=crypto.randomUUID(),now=Date.now();
  await query(db,'INSERT INTO workspace_bookmarks(id,user_id,kind,target_id,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_bookmarks WHERE user_id=? AND kind=? AND target_id=?) OR (SELECT COUNT(*) FROM workspace_bookmarks WHERE user_id=?)<100 ON CONFLICT(user_id,kind,target_id) DO NOTHING',bookmarkId,id,input.kind,targetId,now,id,input.kind,targetId,id).run();
  const row=await one(db,'SELECT id,kind,target_id AS targetId,created FROM workspace_bookmarks WHERE user_id=? AND kind=? AND target_id=?',id,input.kind,targetId);if(!row)fail(409,'workspaceFull');return json({bookmark:{...row,postId:target.postId,title:target.title,body:target.body,available:true}},201);
 }
 match=path.match(/^\/api\/workspace\/bookmarks\/([^/]+)$/);
 if(match&&method==='DELETE'){await writeLimit();const result=await query(db,'DELETE FROM workspace_bookmarks WHERE id=? AND user_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
 match=path.match(/^\/api\/workspace\/plans\/([^/]+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
  if(!UUID.test(match[1]))fail(400,'invalidInput');const planId=match[1];
  if(method==='DELETE'){await writeLimit();const result=await query(db,'DELETE FROM workspace_plans WHERE id=? AND user_id=?',planId,id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  const input=await body(request);only(input,['title','steps','remindAt','remindMinutes','expectedUpdated']);const title=text(input.title,1,120);
  if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>20)fail(400,'invalidInput');
  const steps=input.steps.map(step=>{if(!step||Array.isArray(step)||typeof step!=='object'||typeof step.done!=='boolean')fail(400,'invalidInput');only(step,['text','done']);return {text:text(step.text,1,200),done:step.done};});
  const remindAt=input.remindAt??null,remindMinutes=input.remindMinutes??0;
  if(remindAt!==null&&(!Number.isSafeInteger(remindAt)||remindAt<0||remindAt>8640000000000000)||![0,10,30,60,1440].includes(remindMinutes))fail(400,'invalidInput');
  const compare=expected(input);await writeLimit();const previous=await one(db,'SELECT updated FROM workspace_plans WHERE user_id=? AND id=?',id,planId);
  if(compare!==undefined&&(compare===null?!!previous:previous?.updated!==compare))fail(409,'workspaceConflict');
  const now=Math.max(Date.now(),(previous?.updated??0)+1);
  const result=await query(db,`INSERT INTO workspace_plans(id,user_id,title,steps_json,remind_at,remind_minutes,created,updated) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_plans WHERE user_id=? AND id=?) OR (SELECT COUNT(*) FROM workspace_plans WHERE user_id=?)<30 ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,steps_json=excluded.steps_json,remind_at=excluded.remind_at,remind_minutes=excluded.remind_minutes,updated=excluded.updated${compare===undefined?'':' WHERE workspace_plans.updated=?'}`,planId,id,title,JSON.stringify(steps),remindAt,remindMinutes,now,now,id,planId,id,...(compare===undefined?[]:[compare])).run();
  if(!result.meta.changes)fail(409,compare!==undefined?'workspaceConflict':'workspaceFull');return json({plan:plan(await one(db,'SELECT * FROM workspace_plans WHERE user_id=? AND id=?',id,planId))});
 }
 fail(404,'notFound');
}
