// Member reports describe a place at a particular time; they are not a campus
// accessibility certification or a disclosure of anyone's live location.
export const CAMPUS_SPACE_CONSENT='2026-10-04-campus-space-v1';
export const CAMPUS_SPACES_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS campus_spaces (id TEXT PRIMARY KEY NOT NULL,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,university TEXT NOT NULL,place TEXT NOT NULL,description TEXT NOT NULL,noise TEXT NOT NULL,lighting TEXT NOT NULL,crowding TEXT NOT NULL,seating TEXT NOT NULL,break_space INTEGER NOT NULL,observed_on TEXT NOT NULL,time_of_day TEXT NOT NULL,consent_version TEXT NOT NULL,created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campus_spaces_created ON campus_spaces(created,id)',
 'CREATE INDEX IF NOT EXISTS campus_spaces_author_created ON campus_spaces(author_id,created)',
 'CREATE INDEX IF NOT EXISTS campus_spaces_university_created ON campus_spaces(university,created,id)',
 'CREATE TABLE IF NOT EXISTS campus_space_publish_limits (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,window_start INTEGER NOT NULL,total INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS campus_space_report_links (report_id TEXT PRIMARY KEY NOT NULL REFERENCES reports(id) ON DELETE CASCADE,campus_space_id TEXT REFERENCES campus_spaces(id) ON DELETE SET NULL,place_snapshot TEXT NOT NULL,university_snapshot TEXT NOT NULL,description_snapshot TEXT NOT NULL)'
];
const readyDatabases=new WeakMap();
export async function ensureCampusSpacesSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){ready=(async()=>{for(const sql of CAMPUS_SPACES_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});readyDatabases.set(db,ready);}
 await ready;
}
const OPTIONS={noise:['quiet','moderate','loud','varies'],lighting:['soft','bright','natural','varies'],crowding:['low','medium','high','varies'],seating:['yes','limited','no','unknown'],timeOfDay:['morning','afternoon','evening','varies']};
export async function handleCampusSpaces(request,url,id,ctx){
 const {db,body,text,fail,json,one,many,query,blocked,cursor,limit}=ctx,path=url.pathname,method=request.method;
 if(path==='/api/campus-spaces'&&method==='GET'){
  const before=cursor(url.searchParams.get('before'))??Number.MAX_SAFE_INTEGER,beforeId=url.searchParams.get('beforeId')??'',values=[before,before,beforeId,id,id];let filters='';
  for(const key of ['university','noise','lighting','crowding']){
   const filter=url.searchParams.get(key);if(filter===null||filter==='')continue;
   if(key==='university'){filters+=' AND instr(lower(s.university),lower(?))>0';values.push(text(filter,1,120));}
   else{if(!OPTIONS[key].includes(filter))fail(400,'invalidInput');filters+=` AND s.${key}=?`;values.push(filter);}
  }
  const rows=await many(db,`SELECT s.*,p.name,p.role,p.university AS profileUniversity FROM campus_spaces s JOIN profiles p ON p.id=s.author_id WHERE (s.created<? OR (s.created=? AND s.id<?)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=s.author_id) OR (b.blocker_id=s.author_id AND b.blocked_id=?))${filters} ORDER BY s.created DESC,s.id DESC LIMIT 31`,...values);
  return json({spaces:rows.slice(0,30).map(s=>({id:s.id,authorId:s.author_id,name:s.name,role:s.role,profileUniversity:s.profileUniversity,university:s.university,place:s.place,description:s.description,noise:s.noise,lighting:s.lighting,crowding:s.crowding,seating:s.seating,breakSpace:!!s.break_space,observedOn:s.observed_on,timeOfDay:s.time_of_day,created:s.created,mine:s.author_id===id})),hasMore:rows.length>30});
 }
 if(path==='/api/campus-spaces'&&method==='POST'){
  const input=await body(request);if(input.publishConsent!==true)fail(400,'consentRequired');
  if(Object.keys(input).some(k=>!['university','place','description','noise','lighting','crowding','seating','breakSpace','observedOn','timeOfDay','publishConsent'].includes(k)))fail(400,'invalidInput');
  const university=text(input.university,1,120),place=text(input.place,1,120),description=text(input.description,1,1200);
  for(const [key,values] of Object.entries(OPTIONS))if(!values.includes(input[key]))fail(400,'invalidInput');
  if(typeof input.breakSpace!=='boolean'||typeof input.observedOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn))fail(400,'invalidInput');
  const observed=Date.parse(input.observedOn+'T00:00:00Z');if(!Number.isFinite(observed)||new Date(observed).toISOString().slice(0,10)!==input.observedOn||input.observedOn>new Date(Date.now()+86400000).toISOString().slice(0,10))fail(400,'invalidInput');
  const spaceId=crypto.randomUUID(),created=Date.now(),window=Math.floor(created/60000);
  // Count validated publication attempts independently of retained posts. An
  // author deletion or moderator removal must not refund the minute allowance.
  const allowance=await query(db,'INSERT INTO campus_space_publish_limits(user_id,window_start,total) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,total=CASE WHEN campus_space_publish_limits.window_start=excluded.window_start THEN campus_space_publish_limits.total+1 ELSE 1 END WHERE campus_space_publish_limits.window_start!=excluded.window_start OR campus_space_publish_limits.total<5',id,window).run();
  if(!allowance.meta.changes)fail(429,'tooFast');
  await query(db,'INSERT INTO campus_spaces(id,author_id,university,place,description,noise,lighting,crowding,seating,break_space,observed_on,time_of_day,consent_version,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',spaceId,id,university,place,description,input.noise,input.lighting,input.crowding,input.seating,Number(input.breakSpace),input.observedOn,input.timeOfDay,CAMPUS_SPACE_CONSENT,created).run();return json({id:spaceId},201);
 }
 let match=path.match(/^\/api\/campus-spaces\/([^/]+)$/);
 if(match&&method==='DELETE'){const result=await query(db,'DELETE FROM campus_spaces WHERE id=? AND author_id=?',match[1],id).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});}
 match=path.match(/^\/api\/campus-spaces\/([^/]+)\/reports$/);
 if(match&&method==='POST'){
  await limit(db,'reports','reporter_id',id,5);const input=await body(request);if(Object.keys(input).some(k=>k!=='reason'))fail(400,'invalidInput');const reason=text(input.reason,1,1000);
  const target=await one(db,'SELECT id,author_id,place,university,description FROM campus_spaces WHERE id=?',match[1]);if(!target||await blocked(db,id,target.author_id))fail(404,'notFound');const reportId=crypto.randomUUID();
  await db.batch([query(db,'INSERT INTO reports(id,reporter_id,post_id,conversation_id,reason,created) VALUES(?,?,NULL,NULL,?,?)',reportId,id,reason,Date.now()),query(db,'INSERT INTO campus_space_report_links(report_id,campus_space_id,place_snapshot,university_snapshot,description_snapshot) VALUES(?,?,?,?,?)',reportId,target.id,target.place,target.university,target.description)]);return json({id:reportId},201);
 }
 fail(404,'notFound');
}
