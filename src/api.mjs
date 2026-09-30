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
function identity(request){const id=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email');return id&&email?id:null;}
function moderator(request,env){const email=request.headers.get('oai-authenticated-user-email');return !!identity(request)&&((!!env.MODERATOR_USER_ID&&identity(request)===env.MODERATOR_USER_ID)||(!!env.MODERATOR_EMAIL&&email?.toLowerCase()===env.MODERATOR_EMAIL.toLowerCase()));}
async function profile(db,id){const p=await one(db,'SELECT id,name,group_name AS "group",role,university,language,created FROM profiles WHERE id=?',id);if(!p)fail(403,'finishOnboarding');return p;}
async function blocked(db,a,b){return !!await one(db,'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',a,b,b,a);}
async function conversation(db,id,user){const c=await one(db,'SELECT * FROM conversations WHERE id=? AND (author_id=? OR helper_id=?)',id,user,user);if(!c)fail(404,'notFound');if(await blocked(db,c.author_id,c.helper_id))fail(403,'blocked');return c;}
async function limit(db,table,field,id,max){const allowed={posts:'author_id',offers:'helper_id',messages:'author_id',reports:'reporter_id'};if(allowed[table]!==field)throw new Error('Invalid rate limit');const row=await one(db,`SELECT COUNT(*) AS total FROM ${table} WHERE ${field}=? AND created>?`,id,Date.now()-60000);if(row.total>=max)fail(429,'tooFast');}
function cursor(value){if(value==null)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail(400,'invalidInput');return n;}

export async function handleApi(request,env){
 try{
  const url=new URL(request.url), path=url.pathname, method=request.method;
  if(path==='/api/health'&&method==='GET')return json({ok:true,storage:env.DB?'configured':'unavailable',version:'1.0.0'});
  if(!env.DB)fail(503,'unavailable');const db=env.DB,id=identity(request);
  if(method!=='GET'){
   if(!['POST','PUT','DELETE'].includes(method))fail(405,'notAllowed');
   if(request.headers.get('origin')!==url.origin||request.headers.get('x-common-ground')!=='1')fail(403,'badOrigin');
  }
  if(path==='/api/me'&&method==='GET'){
   const p=id?await one(db,'SELECT id,name,group_name AS "group",role,university,language,created FROM profiles WHERE id=?',id):null;
   return json({signedIn:!!id,profile:p,moderator:moderator(request,env)});
  }
  if(!id)fail(401,'signIn');
  if(path==='/api/profile'&&method==='PUT'){
   const input=await body(request);const previous=await one(db,'SELECT * FROM profiles WHERE id=?',id);
   if(!previous&&input.consent!==true)fail(400,'consentRequired');
   const name=text(input.name,1,40), group=input.group,role=input.role,language=input.language;
   if(!['neurodivergent','neurotypical'].includes(group)||!['Student','Staff member'].includes(role)||!['en','zh'].includes(language))fail(400,'invalidInput');
   const university=text(input.university??'',0,80);
   await query(db,'INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name,role=excluded.role,university=excluded.university,language=excluded.language',id,name,group,role,university,language,'2026-09-30-v1',Date.now()).run();
   return json({profile:await profile(db,id)});
  }
  const me=await profile(db,id);
  if(path==='/api/questions'&&method==='GET'){
   const before=cursor(url.searchParams.get('before'))??Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')??'';
   const posts=await many(db,`SELECT p.*,u.name,u.role,u.university FROM posts p JOIN profiles u ON u.id=p.author_id
    WHERE (p.created<? OR (p.created=? AND p.id<?)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?)) ORDER BY p.created DESC,p.id DESC LIMIT 51`,before,before,beforeId,id,id);
   const selected=posts.slice(0,50);const offers=await many(db,`SELECT o.*,u.name,(SELECT c.id FROM conversations c WHERE c.offer_id=o.id) AS conversationId FROM offers o JOIN profiles u ON u.id=o.helper_id JOIN posts p ON p.id=o.post_id
    WHERE (p.author_id=? OR o.helper_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=p.author_id AND b.blocked_id=o.helper_id) OR (b.blocker_id=o.helper_id AND b.blocked_id=p.author_id)) ORDER BY o.created DESC LIMIT 500`,id,id);
   return json({questions:selected.map(p=>({id:p.id,title:p.title,body:p.body,topic:p.topic,authorId:p.author_id,name:p.name,role:p.role,university:p.university,created:p.created,mine:p.author_id===id,offers:offers.filter(o=>o.post_id===p.id).map(o=>({id:o.id,name:o.name,helperId:o.helper_id,text:o.body,status:o.status,conversationId:o.conversationId,mine:o.helper_id===id}))})),hasMore:posts.length>50});
  }
  if(path==='/api/questions'&&method==='POST'){
   if(me.group!=='neurodivergent')fail(403,'askGroup');await limit(db,'posts','author_id',id,10);
   const input=await body(request), title=text(input.title,1,140),details=text(input.body,1,2000);if(!TOPICS.includes(input.topic))fail(400,'invalidInput');
   const postId=crypto.randomUUID();await query(db,'INSERT INTO posts(id,author_id,title,body,topic,created) VALUES(?,?,?,?,?,?)',postId,id,title,details,input.topic,Date.now()).run();return json({id:postId},201);
  }
  if(path==='/api/helpers'&&method==='GET')return json({helpers:await many(db,`SELECT id,name,role,university FROM profiles p WHERE group_name='neurotypical' AND id!=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=?)) ORDER BY created DESC LIMIT 30`,id,id,id)});
  let match=path.match(/^\/api\/questions\/([^/]+)$/);
  if(match&&method==='DELETE'){const result=await query(db,'DELETE FROM posts WHERE id=? AND author_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
  match=path.match(/^\/api\/questions\/([^/]+)\/offers$/);
  if(match&&method==='POST'){
   if(me.group!=='neurotypical')fail(403,'helpGroup');await limit(db,'offers','helper_id',id,10);
   const post=await one(db,'SELECT * FROM posts WHERE id=?',match[1]);if(!post)fail(404,'notFound');if(post.author_id===id)fail(400,'invalidInput');if(await blocked(db,id,post.author_id))fail(403,'blocked');
   const input=await body(request),message=text(input.message,1,1000),offerId=crypto.randomUUID();
   if(await one(db,'SELECT id FROM offers WHERE post_id=? AND helper_id=?',post.id,id))fail(409,'alreadyOffered');
   await query(db,'INSERT INTO offers(id,post_id,helper_id,body,status,created) VALUES(?,?,?,?,?,?)',offerId,post.id,id,message,'pending',Date.now()).run();return json({id:offerId},201);
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
  if(path==='/api/conversations'&&method==='GET')return json({conversations:await many(db,`SELECT c.id,c.ended,c.created,p.title AS context,
   CASE WHEN c.author_id=? THEN c.helper_id ELSE c.author_id END AS partnerId,
   CASE WHEN c.author_id=? THEN helper.name ELSE author.name END AS name,
   (SELECT MAX(id) FROM messages WHERE conversation_id=c.id) AS lastMessageId
   FROM conversations c JOIN profiles author ON author.id=c.author_id JOIN profiles helper ON helper.id=c.helper_id JOIN posts p ON p.id=c.post_id
   WHERE (c.author_id=? OR c.helper_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=c.author_id AND b.blocked_id=c.helper_id) OR (b.blocker_id=c.helper_id AND b.blocked_id=c.author_id)) ORDER BY c.created DESC LIMIT 100`,id,id,id,id)});
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
  if(path==='/api/reports'&&method==='POST'){
   await limit(db,'reports','reporter_id',id,5);const input=await body(request),reason=text(input.reason,1,1000);let postId=null,conversationId=null;
   if(input.postId){const p=await one(db,'SELECT id,author_id FROM posts WHERE id=?',text(input.postId,1,200));if(!p||await blocked(db,id,p.author_id))fail(404,'notFound');postId=p.id;}
   if(input.conversationId){await conversation(db,text(input.conversationId,1,200),id);conversationId=input.conversationId;}
   if(!postId&&!conversationId)fail(400,'invalidInput');const reportId=crypto.randomUUID();await query(db,'INSERT INTO reports(id,reporter_id,post_id,conversation_id,reason,created) VALUES(?,?,?,?,?,?)',reportId,id,postId,conversationId,reason,Date.now()).run();return json({id:reportId},201);
  }
  if(path==='/api/reports'&&method==='GET'){if(!moderator(request,env))fail(403,'notAllowed');return json({reports:await many(db,"SELECT r.*,p.title,p.body FROM reports r LEFT JOIN posts p ON p.id=r.post_id WHERE r.status='open' ORDER BY r.created DESC LIMIT 100")});}
  match=path.match(/^\/api\/reports\/([^/]+)$/);
  if(match&&method==='GET'){if(!moderator(request,env))fail(403,'notAllowed');const report=await one(db,'SELECT * FROM reports WHERE id=?',match[1]);if(!report)fail(404,'notFound');const messages=report.conversation_id?await many(db,'SELECT m.body,m.guide_id AS guideId,m.created,p.name FROM messages m JOIN profiles p ON p.id=m.author_id WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 100',report.conversation_id):[];return json({report,messages:messages.reverse()});}
  match=path.match(/^\/api\/reports\/([^/]+)\/resolve$/);
  if(match&&method==='POST'){if(!moderator(request,env))fail(403,'notAllowed');await query(db,"UPDATE reports SET status='resolved' WHERE id=?",match[1]).run();return json({ok:true});}
  fail(404,'notFound');
 }catch(error){if(error instanceof HttpError)return json({error:error.code},error.status);console.error('Common Ground API unavailable',error?.name);return json({error:'unavailable'},503);}
}
