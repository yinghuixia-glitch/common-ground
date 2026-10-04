import {UNIVERSITY_SUPPORT_SEED} from './university-support-seed.mjs';
export const SUPPORT_AUDIENCES=['students','staff','both'];
export const SUPPORT_CATEGORIES=['accessibility','wellbeing','study','staff'];
export const UNIVERSITY_SUPPORT_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS university_support_services (id TEXT PRIMARY KEY NOT NULL,university_en TEXT NOT NULL,university_zh TEXT NOT NULL,audience TEXT NOT NULL,category TEXT NOT NULL,source_url TEXT NOT NULL,checked_date TEXT NOT NULL,official_email TEXT NOT NULL DEFAULT \'\',en_json TEXT NOT NULL,zh_json TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS university_support_lookup ON university_support_services(archived,university_en,id)',
 'CREATE TABLE IF NOT EXISTS university_support_suggestions (id TEXT PRIMARY KEY NOT NULL,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,service_id TEXT REFERENCES university_support_services(id) ON DELETE SET NULL,university TEXT NOT NULL,source_url TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'pending\',moderator_note TEXT NOT NULL DEFAULT \'\',created INTEGER NOT NULL,updated INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS university_support_suggestions_author ON university_support_suggestions(author_id,created,id)',
 'CREATE INDEX IF NOT EXISTS university_support_suggestions_status ON university_support_suggestions(status,created,id)',
 'CREATE TABLE IF NOT EXISTS university_support_limits (bucket TEXT PRIMARY KEY NOT NULL,hits INTEGER NOT NULL,expires INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS university_support_limits_expires ON university_support_limits(expires)'
];
const readyDatabases=new WeakMap();
export async function ensureUniversitySupportSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){ready=(async()=>{
  for(const sql of UNIVERSITY_SUPPORT_SCHEMA)await db.prepare(sql).run();
  const now=Date.now(),values=[];
  for(const s of UNIVERSITY_SUPPORT_SEED)values.push(s.id,s.university.en,s.university.zh,s.audience,s.category,s.sourceUrl,s.checkedDate,s.email||'',JSON.stringify(s.en),JSON.stringify(s.zh),now,now);
  // Eight immutable keys, one insert, 96 bindings. Moderator edits/archives survive.
  await db.prepare('INSERT OR IGNORE INTO university_support_services(id,university_en,university_zh,audience,category,source_url,checked_date,official_email,en_json,zh_json,created,updated) VALUES '+UNIVERSITY_SUPPORT_SEED.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?)').join(',')).bind(...values).run();
 })().catch(error=>{readyDatabases.delete(db);throw error;});readyDatabases.set(db,ready);}
 await ready;
}
export function validSupportUrl(value,fail){
 if(typeof value!=='string'||value.length>2048)fail(400,'invalidInput');
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.')||/^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(u.hostname))fail(400,'invalidInput');return u.href;}catch{fail(400,'invalidInput');}
}
function service(row){return {id:row.id,university:{en:row.university_en,zh:row.university_zh},audience:row.audience,category:row.category,sourceUrl:row.source_url,checkedDate:row.checked_date,email:row.official_email,en:JSON.parse(row.en_json),zh:JSON.parse(row.zh_json),archived:!!row.archived,created:row.created,updated:row.updated};}
function validate(input,{text,fail}){
 if(!input||input.sourceChecked!==true)fail(400,'supportSourceRequired');
 if(!SUPPORT_AUDIENCES.includes(input.audience)||!SUPPORT_CATEGORIES.includes(input.category))fail(400,'invalidInput');
 const date=text(input.checkedDate,10,10),parsed=Date.parse(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10))fail(400,'invalidInput');
 const email=text(input.email??'',0,254);if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))fail(400,'invalidInput');
 const copy={};for(const lang of ['en','zh']){copy[lang]={};for(const [key,max]of Object.entries({title:120,office:180,summary:800,request:1000,expect:800,template:2000}))copy[lang][key]=text(input[lang]?.[key],1,max);}
 return {university:{en:text(input.university?.en,1,120),zh:text(input.university?.zh,1,120)},audience:input.audience,category:input.category,sourceUrl:validSupportUrl(input.sourceUrl,fail),checkedDate:date,email,...copy};
}
async function rate(ctx,id,kind,max,window){
 const now=Date.now(),bucket=id+'|'+kind+'|'+Math.floor(now/window),expires=(Math.floor(now/window)+1)*window;
 await ctx.query(ctx.db,'DELETE FROM university_support_limits WHERE expires<=?',now).run();
 const result=await ctx.one(ctx.db,'INSERT INTO university_support_limits(bucket,hits,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits',bucket,expires,max);
 if(!result)ctx.fail(429,'supportTooFast');
}
function page(url,fail){const number=(key,defaultValue,max)=>{const value=url.searchParams.get(key);if(value===null)return defaultValue;if(!/^\d+$/.test(value)||Number(value)>max)fail(400,'invalidInput');return Number(value);};return {limit:number('limit',20,50)||20,offset:number('offset',0,2000)};}
export async function handleUniversitySupport(request,url,id,ctx){
 const {db,body,text,fail,json,one,many,query}=ctx,path=url.pathname,method=request.method;
 if(method!=='GET'&&(request.headers.get('origin')!==url.origin||request.headers.get('x-common-ground')!=='1'))fail(403,'badOrigin');
 await ensureUniversitySupportSchema(db);
 const directory=path==='/api/university-support',admin=path==='/api/university-support/admin';
 if((directory||admin)&&method==='GET'){
  if(admin){if(!id)fail(401,'signIn');if(!ctx.moderator)fail(403,'notAllowed');if(!await one(db,'SELECT id FROM profiles WHERE id=?',id))fail(403,'finishOnboarding');}
  const {limit,offset}=page(url,fail),q=text(url.searchParams.get('q')??'',0,120),university=text(url.searchParams.get('university')??'',0,120),audience=url.searchParams.get('audience')||'',category=url.searchParams.get('category')||'';
  if(audience&&!SUPPORT_AUDIENCES.includes(audience)||category&&!SUPPORT_CATEGORIES.includes(category))fail(400,'invalidInput');
  const where=[],values=[];if(!admin||url.searchParams.get('archived')!=='1')where.push('archived=0');
  const like=value=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%';
  if(university){where.push("(university_en LIKE ? ESCAPE '\\' OR university_zh LIKE ? ESCAPE '\\')");values.push(like(university),like(university));}
  if(q){where.push("(university_en||' '||university_zh||' '||en_json||' '||zh_json) LIKE ? ESCAPE '\\'");values.push(like(q));}
  if(audience){where.push(audience==='both'?"audience='both'":"audience IN(?,'both')");if(audience!=='both')values.push(audience);}
  if(category){where.push('category=?');values.push(category);}
  const rows=await many(db,'SELECT * FROM university_support_services'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY university_en,id LIMIT ? OFFSET ?',...values,limit+1,offset);
  return json({services:rows.slice(0,limit).map(service),hasMore:rows.length>limit});
 }
 if(!id)fail(401,'signIn');
 // Production dispatch supplies a verified Firebase identity; also enforce a completed profile here.
 if(!await one(db,'SELECT id FROM profiles WHERE id=?',id))fail(403,'finishOnboarding');
 if(path==='/api/university-support/suggestions'&&method==='GET'){
  const {limit,offset}=page(url,fail),review=url.searchParams.get('review')==='1';if(review&&!ctx.moderator)fail(403,'notAllowed');
  const rows=await many(db,'SELECT id,service_id AS serviceId,university,source_url AS sourceUrl,note,status,moderator_note AS moderatorNote,created,updated'+(review?',author_id AS authorId':'')+' FROM university_support_suggestions WHERE '+(review?"status='pending'":'author_id=?')+' ORDER BY created DESC,id DESC LIMIT ? OFFSET ?',...(review?[]:[id]),limit+1,offset);
  return json({suggestions:rows.slice(0,limit),hasMore:rows.length>limit});
 }
 if(path==='/api/university-support/suggestions'&&method==='POST'){
  const input=await body(request),university=text(input.university,1,120),note=text(input.note,1,1500),sourceUrl=validSupportUrl(input.sourceUrl,fail),serviceId=input.serviceId?text(input.serviceId,1,100):null;
  if(serviceId&&!await one(db,'SELECT id FROM university_support_services WHERE id=?',serviceId))fail(404,'notFound');
  await rate(ctx,id,'suggestion',5,86400000);const suggestionId=crypto.randomUUID(),now=Date.now();
  await query(db,'INSERT INTO university_support_suggestions(id,author_id,service_id,university,source_url,note,created,updated) VALUES(?,?,?,?,?,?,?,?)',suggestionId,id,serviceId,university,sourceUrl,note,now,now).run();return json({id:suggestionId,status:'pending'},201);
 }
 const review=path.match(/^\/api\/university-support\/suggestions\/([^/]+)$/);
 if(review&&method==='PUT'){
  if(!ctx.moderator)fail(403,'notAllowed');const input=await body(request);if(!['reviewed','rejected'].includes(input.status))fail(400,'invalidInput');const note=text(input.moderatorNote??'',0,1000);
  const suggestionId=text(review[1],1,100);await rate(ctx,id,'admin',30,60000);const result=await query(db,'UPDATE university_support_suggestions SET status=?,moderator_note=?,updated=? WHERE id=?',input.status,note,Date.now(),suggestionId).run();if(!result.meta.changes)fail(404,'notFound');return json({ok:true});
 }
 const entry=path.match(/^\/api\/university-support\/admin\/([^/]+)$/);
 if(admin&&method==='POST'||entry&&['PUT','DELETE'].includes(method)){
  if(!ctx.moderator)fail(403,'notAllowed');
  const serviceId=entry?text(entry[1],1,100):crypto.randomUUID();if(entry&&!await one(db,'SELECT id FROM university_support_services WHERE id=?',serviceId))fail(404,'notFound');
  if(method==='DELETE'){await rate(ctx,id,'admin',30,60000);await query(db,'UPDATE university_support_services SET archived=1,updated=? WHERE id=?',Date.now(),serviceId).run();return json({ok:true});}
  const input=await body(request,49152),s=validate(input,ctx),now=Date.now();if(input.archived!==undefined&&typeof input.archived!=='boolean')fail(400,'invalidInput');
  await rate(ctx,id,'admin',30,60000);const values=[s.university.en,s.university.zh,s.audience,s.category,s.sourceUrl,s.checkedDate,s.email,JSON.stringify(s.en),JSON.stringify(s.zh),Number(input.archived===true),now];
  if(entry)await query(db,'UPDATE university_support_services SET university_en=?,university_zh=?,audience=?,category=?,source_url=?,checked_date=?,official_email=?,en_json=?,zh_json=?,archived=?,updated=? WHERE id=?',...values,serviceId).run();
  else await query(db,'INSERT INTO university_support_services(university_en,university_zh,audience,category,source_url,checked_date,official_email,en_json,zh_json,archived,updated,id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',...values,serviceId,now).run();
  return json({id:serviceId},entry?200:201);
 }
 fail(404,'notFound');
}
