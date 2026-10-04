export const GROUP_AGREEMENTS_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS group_agreements (id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,sheet_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS group_agreement_members (group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,confirmed_revision INTEGER,joined INTEGER NOT NULL,PRIMARY KEY(group_id,user_id))',
 'CREATE INDEX IF NOT EXISTS agreement_members_user ON group_agreement_members(user_id)',
 'CREATE TABLE IF NOT EXISTS group_agreement_versions (group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,revision INTEGER NOT NULL,sheet_json TEXT NOT NULL,author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,created INTEGER NOT NULL,PRIMARY KEY(group_id,revision))',
 'CREATE TABLE IF NOT EXISTS group_agreement_invites (id TEXT PRIMARY KEY NOT NULL,group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)))',
 'CREATE UNIQUE INDEX IF NOT EXISTS group_agreement_invites_token_hash_unique ON group_agreement_invites(token_hash)',
 'CREATE INDEX IF NOT EXISTS agreement_invites_group ON group_agreement_invites(group_id,expires)',
 'CREATE TABLE IF NOT EXISTS group_agreement_write_limits (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,window_start INTEGER NOT NULL,total INTEGER NOT NULL)'
];
const ready=new WeakMap();
export async function ensureGroupAgreementsSchema(db){let promise=ready.get(db);if(!promise){promise=(async()=>{for(const sql of GROUP_AGREEMENTS_SCHEMA)await db.prepare(sql).run();})().catch(error=>{ready.delete(db);throw error;});ready.set(db,promise);}await promise;}
const q=(db,sql,...values)=>db.prepare(sql).bind(...values);
const one=(db,sql,...values)=>q(db,sql,...values).first();
const many=async(db,sql,...values)=>(await q(db,sql,...values).all()).results;
const DAY=86400000,FIELDS={title:120,roles:1000,meetingAgenda:1000,communication:600,responseTime:300,clarification:600,breaks:600};
const key=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const blockSQL=`EXISTS(SELECT 1 FROM group_agreement_members peer JOIN blocks b ON (b.blocker_id=? AND b.blocked_id=peer.user_id) OR (b.blocked_id=? AND b.blocker_id=peer.user_id) WHERE peer.group_id=g.id AND peer.user_id!=?)`;
function plain(value,max,fail,min=0){if(typeof value!=='string')fail(400,'invalidInput');const text=value.trim();if(text.length<min||text.length>max)fail(400,'invalidInput');return text;}
function revision(value,fail){if(!Number.isSafeInteger(value)||value<1||value>1000000)fail(400,'invalidInput');return value;}
function zone(value,fail){const s=plain(value??'UTC',80,fail,1);try{new Intl.DateTimeFormat('en',{timeZone:s}).format(0);}catch{fail(400,'agreementInvalidTimeZone');}return s;}
function sheet(input,memberIds,fail){
 if(Object.keys(input).some(k=>!Object.hasOwn(FIELDS,k)&&!['tasks','expectedRevision'].includes(k)))fail(400,'invalidInput');
 const result={};for(const [field,max] of Object.entries(FIELDS))result[field]=plain(input[field]??'',max,fail,field==='title'?1:0);
 if(!Array.isArray(input.tasks)||input.tasks.length>20)fail(400,'invalidInput');const ids=new Set();
 result.tasks=input.tasks.map(task=>{
  if(!task||typeof task!=='object'||Array.isArray(task)||Object.keys(task).some(k=>!['id','text','assigneeId','deadline','timeZone'].includes(k))||!key(task.id)||ids.has(task.id))fail(400,'invalidInput');ids.add(task.id);
  const assigneeId=task.assigneeId??null;if(assigneeId!==null&&(!memberIds.has(assigneeId)||typeof assigneeId!=='string'))fail(400,'agreementInvalidAssignee');
  const deadline=task.deadline??null;if(deadline!==null&&(!Number.isSafeInteger(deadline)||deadline<946684800000||deadline>4102444800000))fail(400,'agreementInvalidDeadline');
  return {id:task.id,text:plain(task.text,200,fail,1),assigneeId,deadline,timeZone:zone(task.timeZone,fail)};
 });return result;
}
const emptySheet=title=>({title,roles:'',meetingAgenda:'',communication:'',responseTime:'',clarification:'',breaks:'',tasks:[]});
async function limit(db,id,fail){const minute=Math.floor(Date.now()/60000);const r=await q(db,'INSERT INTO group_agreement_write_limits(user_id,window_start,total) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,total=CASE WHEN group_agreement_write_limits.window_start=excluded.window_start THEN group_agreement_write_limits.total+1 ELSE 1 END WHERE group_agreement_write_limits.window_start!=excluded.window_start OR group_agreement_write_limits.total<60',id,minute).run();if(!r.meta.changes)fail(429,'tooFast');}
async function member(db,groupId,id,fail,{allowBlocked=false,owner=false}={}){
 const row=await one(db,`SELECT g.*,m.confirmed_revision,${blockSQL} AS blocked FROM group_agreements g JOIN group_agreement_members m ON m.group_id=g.id AND m.user_id=? WHERE g.id=?`,id,id,id,id,groupId);
 if(!row||(!allowBlocked&&row.blocked))fail(404,'notFound');if(owner&&row.owner_id!==id)fail(403,'agreementOwnerOnly');return row;
}
async function view(db,row,id){
 const members=await many(db,'SELECT m.user_id AS id,p.name,m.confirmed_revision AS confirmedRevision FROM group_agreement_members m JOIN profiles p ON p.id=m.user_id WHERE m.group_id=? ORDER BY m.joined,m.user_id',row.id);
 const invitations=row.owner_id===id?await many(db,'SELECT id,expires FROM group_agreement_invites WHERE group_id=? AND revoked=0 AND expires>? ORDER BY created DESC LIMIT 5',row.id,Date.now()):[];
 return {...JSON.parse(row.sheet_json),id:row.id,ownerId:row.owner_id,revision:row.revision,created:row.created,updated:row.updated,members:members.map(m=>({...m,isOwner:m.id===row.owner_id})),invitations};
}
async function full(db,groupId,id,fail){return view(db,await member(db,groupId,id,fail),id);}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function save(db,row,id,input,fail){
 const expected=revision(input.expectedRevision,fail);if(expected!==row.revision)fail(409,'agreementConflict');
 const members=await many(db,'SELECT user_id FROM group_agreement_members WHERE group_id=?',row.id),data=sheet(input,new Set(members.map(m=>m.user_id)),fail),now=Date.now(),next=expected+1;
 if(next>1000000)fail(409,'agreementLimit');await limit(db,id,fail);
 const result=await db.batch([
  q(db,`UPDATE group_agreements AS g SET title=?,sheet_json=?,revision=?,updated=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM group_agreement_members m WHERE m.group_id=g.id AND m.user_id=?) AND NOT ${blockSQL} AND NOT EXISTS(SELECT 1 FROM json_each(?) task WHERE json_extract(task.value,'$.assigneeId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM group_agreement_members assignee WHERE assignee.group_id=g.id AND assignee.user_id=json_extract(task.value,'$.assigneeId')))`,data.title,JSON.stringify(data),next,now,row.id,expected,id,id,id,id,JSON.stringify(data.tasks)),
  q(db,'INSERT INTO group_agreement_versions(group_id,revision,sheet_json,author_id,created) SELECT id,revision,sheet_json,?,updated FROM group_agreements WHERE id=? AND revision=? AND updated=? ON CONFLICT(group_id,revision) DO NOTHING',id,row.id,next,now),
  q(db,'DELETE FROM group_agreement_versions WHERE group_id=? AND revision<(SELECT MAX(revision)-29 FROM group_agreement_versions WHERE group_id=?)',row.id,row.id)
 ]);
 if(!result[0].meta.changes){const latest=await member(db,row.id,id,fail);if(latest.revision===expected&&data.tasks.some(t=>t.assigneeId))fail(400,'agreementInvalidAssignee');fail(409,'agreementConflict');}return full(db,row.id,id,fail);
}
export async function handleGroupAgreements(request,url,id,ctx){
 const {db,body,fail,json}=ctx;if(!id)fail(401,'signIn');await ensureGroupAgreementsSchema(db);
 const path=url.pathname,method=request.method;
 if(path==='/api/group-agreements'&&method==='GET'){
  const rows=await many(db,`SELECT g.id,g.title,g.revision,g.updated,g.owner_id,(SELECT COUNT(*) FROM group_agreement_members x WHERE x.group_id=g.id) AS memberCount,${blockSQL} AS unavailable FROM group_agreements g JOIN group_agreement_members m ON m.group_id=g.id AND m.user_id=? ORDER BY g.updated DESC,g.id LIMIT 20`,id,id,id,id);
  return json({agreements:rows.map(r=>r.unavailable?{id:r.id,mine:r.owner_id===id,unavailable:true}:{id:r.id,title:r.title,revision:r.revision,updated:r.updated,mine:r.owner_id===id,memberCount:r.memberCount,unavailable:false})});
 }
 if(path==='/api/group-agreements'&&method==='POST'){
  const input=await body(request);if(Object.keys(input).some(k=>k!=='title'))fail(400,'invalidInput');const title=plain(input.title,120,fail,1),groupId=crypto.randomUUID(),now=Date.now(),data=JSON.stringify(emptySheet(title));await limit(db,id,fail);
  const result=await db.batch([
   q(db,'INSERT INTO group_agreements(id,owner_id,title,sheet_json,revision,created,updated) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM group_agreement_members WHERE user_id=?)<20',groupId,id,title,data,now,now,id),
   q(db,'INSERT INTO group_agreement_members(group_id,user_id,joined) SELECT id,?,? FROM group_agreements WHERE id=?',id,now,groupId),
   q(db,'INSERT INTO group_agreement_versions(group_id,revision,sheet_json,author_id,created) SELECT id,1,sheet_json,?,? FROM group_agreements WHERE id=?',id,now,groupId)
  ]);if(!result[0].meta.changes)fail(409,'agreementLimit');return json({agreement:await full(db,groupId,id,fail)},201);
 }
 if(path==='/api/group-agreements/join'&&method==='POST'){
  const input=await body(request);if(Object.keys(input).some(k=>k!=='code')||typeof input.code!=='string'||!/^[a-f0-9]{64}$/.test(input.code.trim()))fail(400,'agreementInvalidInvite');
  await limit(db,id,fail);const digest=await hash(input.code.trim()),now=Date.now();
  const invite=await one(db,'SELECT i.id,i.group_id FROM group_agreement_invites i JOIN group_agreements g ON g.id=i.group_id WHERE i.token_hash=? AND i.revoked=0 AND i.expires>?',digest,now);if(!invite)fail(404,'agreementInvalidInvite');
  const result=await q(db,`INSERT INTO group_agreement_members(group_id,user_id,joined) SELECT g.id,?,? FROM group_agreements g JOIN group_agreement_invites i ON i.group_id=g.id WHERE g.id=? AND i.id=? AND i.revoked=0 AND i.expires>? AND (SELECT COUNT(*) FROM group_agreement_members WHERE group_id=g.id)<12 AND (SELECT COUNT(*) FROM group_agreement_members WHERE user_id=?)<20 AND NOT ${blockSQL} ON CONFLICT(group_id,user_id) DO NOTHING`,id,now,invite.group_id,invite.id,now,id,id,id,id).run();
  if(!result.meta.changes){const exists=await one(db,'SELECT 1 FROM group_agreement_members WHERE group_id=? AND user_id=?',invite.group_id,id);if(!exists){const g=await one(db,`SELECT ${blockSQL} AS blocked FROM group_agreements g WHERE g.id=?`,id,id,id,invite.group_id);if(!g||g.blocked)fail(404,'agreementInvalidInvite');const counts=await one(db,'SELECT (SELECT COUNT(*) FROM group_agreement_members WHERE group_id=?) AS members,(SELECT COUNT(*) FROM group_agreement_members WHERE user_id=?) AS groups',invite.group_id,id);if(counts.members>=12||counts.groups>=20)fail(409,'agreementLimit');fail(404,'agreementInvalidInvite');}}
  return json({agreement:await full(db,invite.group_id,id,fail)});
 }
 const match=path.match(/^\/api\/group-agreements\/([A-Za-z0-9_-]{1,100})(?:\/(.*))?$/);if(!match)fail(404,'notFound');const [,groupId,action]=match;
 if(!action&&method==='DELETE'){await member(db,groupId,id,fail,{allowBlocked:true,owner:true});await limit(db,id,fail);await q(db,'DELETE FROM group_agreements WHERE id=? AND owner_id=?',groupId,id).run();return json({ok:true});}
 const membership=action?.match(/^members\/(.+)$/);
 if(membership&&method==='DELETE'){
  const row=await member(db,groupId,id,fail,{allowBlocked:true});let target;try{target=decodeURIComponent(membership[1]);}catch{fail(400,'invalidInput');}if(!target||target.length>200)fail(400,'invalidInput');if(target===row.owner_id)fail(400,'agreementOwnerCannotLeave');if(id!==target&&id!==row.owner_id)fail(403,'agreementOwnerOnly');await limit(db,id,fail);
  await q(db,'DELETE FROM group_agreement_members WHERE group_id=? AND user_id=? AND (user_id=? OR EXISTS(SELECT 1 FROM group_agreements WHERE id=? AND owner_id=?))',groupId,target,id,groupId,id).run();return json({ok:true});
 }
 if(action==='remove-blocked'&&method==='POST'){
  await member(db,groupId,id,fail,{allowBlocked:true,owner:true});if(Object.keys(await body(request)).length)fail(400,'invalidInput');await limit(db,id,fail);
  await q(db,'DELETE FROM group_agreement_members WHERE group_id=? AND user_id!=? AND EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=user_id) OR (b.blocked_id=? AND b.blocker_id=user_id))',groupId,id,id,id).run();return json({agreement:await full(db,groupId,id,fail)});
 }
 const row=await member(db,groupId,id,fail);
 if(!action&&method==='GET')return json({agreement:await view(db,row,id)});
 if(!action&&method==='PUT')return json({agreement:await save(db,row,id,await body(request),fail)});
 if(action==='confirm'&&method==='POST'){
  const input=await body(request);if(Object.keys(input).some(k=>k!=='revision'))fail(400,'invalidInput');const expected=revision(input.revision,fail);await limit(db,id,fail);
  const r=await q(db,`UPDATE group_agreement_members SET confirmed_revision=? WHERE group_id=? AND user_id=? AND EXISTS(SELECT 1 FROM group_agreements g WHERE g.id=? AND revision=? AND NOT ${blockSQL})`,expected,groupId,id,groupId,expected,id,id,id).run();if(!r.meta.changes){await member(db,groupId,id,fail);fail(409,'agreementConflict');}return json({agreement:await full(db,groupId,id,fail)});
 }
 if(action==='invites'&&method==='POST'){
  if(row.owner_id!==id)fail(403,'agreementOwnerOnly');if(Object.keys(await body(request)).length)fail(400,'invalidInput');await limit(db,id,fail);const code=token(),inviteId=crypto.randomUUID(),now=Date.now(),expires=now+7*DAY;
  const r=await q(db,`INSERT INTO group_agreement_invites(id,group_id,token_hash,created,expires) SELECT ?,g.id,?,?,? FROM group_agreements g WHERE g.id=? AND owner_id=? AND (SELECT COUNT(*) FROM group_agreement_invites WHERE group_id=g.id AND revoked=0 AND expires>?)<5 AND NOT ${blockSQL}`,inviteId,await hash(code),now,expires,groupId,id,now,id,id,id).run();if(!r.meta.changes)fail(409,'agreementInviteLimit');await q(db,'DELETE FROM group_agreement_invites WHERE group_id=? AND (revoked=1 OR expires<?)',groupId,now).run();return json({invite:{id:inviteId,code,expires},agreement:await full(db,groupId,id,fail)},201);
 }
 const inviteAction=action?.match(/^invites\/([A-Za-z0-9_-]{1,100})$/);
 if(inviteAction&&method==='DELETE'){if(row.owner_id!==id)fail(403,'agreementOwnerOnly');await limit(db,id,fail);await q(db,'UPDATE group_agreement_invites SET revoked=1 WHERE id=? AND group_id=?',inviteAction[1],groupId).run();return json({agreement:await full(db,groupId,id,fail)});}
 if(action==='versions'&&method==='GET'){
  const versions=await many(db,'SELECT v.revision,v.created,p.name AS authorName FROM group_agreement_versions v LEFT JOIN profiles p ON p.id=v.author_id WHERE group_id=? ORDER BY revision DESC LIMIT 30',groupId);return json({versions});
 }
 const versionAction=action?.match(/^versions\/(\d+)(\/restore)?$/);
 if(versionAction){
  const number=revision(Number(versionAction[1]),fail),v=await one(db,'SELECT revision,sheet_json,created FROM group_agreement_versions WHERE group_id=? AND revision=?',groupId,number);if(!v)fail(404,'notFound');
  if(!versionAction[2]&&method==='GET')return json({version:{...JSON.parse(v.sheet_json),revision:v.revision,created:v.created}});
  if(versionAction[2]&&method==='POST'){const input=await body(request);if(Object.keys(input).some(k=>k!=='expectedRevision'))fail(400,'invalidInput');const data=JSON.parse(v.sheet_json),members=await many(db,'SELECT user_id FROM group_agreement_members WHERE group_id=?',groupId),memberIds=new Set(members.map(m=>m.user_id));data.tasks=data.tasks.map(t=>({...t,assigneeId:memberIds.has(t.assigneeId)?t.assigneeId:null}));return json({agreement:await save(db,row,id,{...data,expectedRevision:input.expectedRevision},fail)});}
 }
 fail(405,'notAllowed');
}
