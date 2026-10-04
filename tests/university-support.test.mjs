import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi} from '../src/api.mjs';
import {ensureUniversitySupportSchema,UNIVERSITY_SUPPORT_SCHEMA} from '../src/university-support.mjs';
import {UNIVERSITY_SUPPORT_SEED} from '../src/university-support-seed.mjs';
import {universitySupportCopy} from '../public/university-support-copy.js';

const origin='https://community.example';
const complete={name:'Member',group:'neurodivergent',role:'Student',university:'Example university',language:'en',consent:true};
function database({baseOnly=false}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 const files=baseOnly?['0000_lethal_polaris.sql']:fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();for(const file of files)sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const calls=[];
 function adapter(){
  class Statement{constructor(sql,values=[]){this.sql=sql;this.values=values;}bind(...values){return new Statement(this.sql,values);}record(){assert.ok(this.values.length<=100,'D1 binding limit');calls.push({sql:this.sql,bindings:this.values.length});}async first(){this.record();return sqlite.prepare(this.sql).get(...this.values)??null;}async all(){this.record();return {results:sqlite.prepare(this.sql).all(...this.values)};}async run(){this.record();const r=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}}
  return {prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},close:()=>sqlite.close()};
 }
 return {DB:adapter(),adapter,calls,sqlite};
}
function harness(t,options={}){
 const store=database(options);t.after(()=>store.DB.close());const env={DB:store.DB,MODERATOR_EMAIL:'mod@example.test'};
 async function call(user,path='',method='GET',input,headers={}){const h=user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};if(method!=='GET')Object.assign(h,{'Content-Type':'application/json','Origin':origin,'X-Common-Ground':'1'});Object.assign(h,headers);const r=await handleApi(new Request(origin+'/api/university-support'+path,{method,headers:h,body:input===undefined?undefined:JSON.stringify(input)}),env);return {status:r.status,data:await r.json()};}
 async function join(user){const r=await handleApi(new Request(origin+'/api/profile',{method:'PUT',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test','Content-Type':'application/json',Origin:origin,'X-Common-Ground':'1'},body:JSON.stringify({...complete,name:user})}),env);assert.equal(r.status,200);}
 return {...store,env,call,join};
}
const entry=overrides=>({...structuredClone(UNIVERSITY_SUPPORT_SEED[0]),sourceChecked:true,...overrides});
const suggestion=overrides=>({university:'Example university',sourceUrl:'https://www.example.edu/support',note:'Please check this official page for a student service.',...overrides});

test('official directory is public, bilingual and independent of broken authentication configuration',async t=>{
 const h=harness(t);Object.assign(h.env,{AUTH_PROVIDER:'firebase'});const r=await h.call(null);assert.equal(r.status,200);assert.equal(r.data.services.length,8);assert.equal(r.data.hasMore,false);
 for(const s of r.data.services){assert.equal(s.checkedDate,'2026-10-04');assert.match(s.sourceUrl,/^https:\/\//);for(const lang of ['en','zh'])for(const key of ['title','office','summary','request','expect','template'])assert.equal(typeof s[lang][key],'string');assert.equal(s.authorId,undefined);}
 assert.equal(h.calls.some(c=>/FROM profiles|FROM profile_preferences|(?:FROM|INTO) university_support_limits|INSERT.*suggestions/.test(c.sql)),false);
 assert.equal((await h.call(null,'/suggestions')).status,503); // Auth remains unavailable only for member routes.
});
test('directory searches university names, category, audience and keyword with bounded pagination',async t=>{
 const h=harness(t);
 const chinese=await h.call(null,'?university='+encodeURIComponent('兰卡斯特'));assert.equal(chinese.data.services.length,3);
 const staff=await h.call(null,'?university=Lancaster&audience=staff');assert.equal(staff.data.services.length,1);assert.equal(staff.data.services[0].audience,'staff');
 assert.equal((await h.call(null,'?university=Lancaster&category=accessibility')).data.services.length,1);
 assert.equal((await h.call(null,'?q='+encodeURIComponent('monPortail'))).data.services.length,2);
 assert.equal((await h.call(null,'?university=%25')).data.services.length,0);assert.equal((await h.call(null,'?q=_')).data.services.length,0);
 const first=await h.call(null,'?limit=3'),second=await h.call(null,'?limit=3&offset=3');assert.equal(first.data.hasMore,true);assert.equal(second.data.hasMore,true);assert.equal(new Set([...first.data.services,...second.data.services].map(s=>s.id)).size,6);
 assert.equal((await h.call(null,'?university=NeverListedUniversity')).data.services.length,0);
 for(const suffix of ['?limit=51','?offset=2001','?limit=-1','?limit=2.5','?audience=anyone','?category=unknown','?q='+('a'.repeat(121))])assert.equal((await h.call(null,suffix)).status,400,suffix);
});
test('only completed authenticated moderators can manage entries or see the private review queue',async t=>{
 const h=harness(t);await h.join('alice');await h.join('mod');
 for(const [who,expected]of [[null,401],['unfinished',403],['alice',403]]){assert.equal((await h.call(who,'/admin')).status,expected);assert.equal((await h.call(who,'/admin','POST',entry())).status,expected);assert.equal((await h.call(who,'/suggestions?review=1')).status,expected);}
 assert.equal((await h.call('mod','/admin')).status,200);
 assert.equal((await h.call('mod','/admin','POST',entry(),{Origin:'https://other.example'})).status,403);assert.equal((await h.call('alice','/suggestions','POST',suggestion(),{'X-Common-Ground':'0'})).status,403);
});
test('moderator create, edit, archive and restore survive a fresh-isolate seed bootstrap',async t=>{
 const h=harness(t);await h.join('mod');const created=await h.call('mod','/admin','POST',entry({university:{en:'New official university',zh:'新增学校'},audience:'both',category:'study'}));assert.equal(created.status,201);const id=created.data.id;
 const edited=entry({en:{...UNIVERSITY_SUPPORT_SEED[0].en,title:'Updated official route'}});assert.equal((await h.call('mod','/admin/'+id,'PUT',edited)).status,200);
 assert.equal((await h.call(null,'?q=Updated')).data.services[0].id,id);
 assert.equal((await h.call('mod','/admin/lancaster-disability','PUT',edited)).status,200);assert.equal((await h.call('mod','/admin/lancaster-disability','DELETE')).status,200);
 h.env.DB=h.adapter();await ensureUniversitySupportSchema(h.env.DB);
 assert.equal((await h.call(null,'?q=Updated')).data.services.length,1);const archived=(await h.call('mod','/admin?archived=1')).data.services.find(s=>s.id==='lancaster-disability');assert.equal(archived.archived,true);assert.equal(archived.en.title,'Updated official route');
 assert.equal((await h.call('mod','/admin/lancaster-disability','PUT',{...edited,archived:false})).status,200);assert.equal((await h.call(null,'?q=Updated')).data.services.length,2);
 assert.equal((await h.call('alice','/admin/'+id,'DELETE')).status,403);assert.equal((await h.call('mod','/admin/nonexistent','DELETE')).status,404);
});
test('manager requires an explicit checked-source confirmation, real nonfuture date and safe source URL',async t=>{
 const h=harness(t);await h.join('mod');
 for(const value of [entry({sourceChecked:false}),entry({checkedDate:'2026-02-30'}),entry({checkedDate:'2999-01-01'}),entry({checkedDate:'2026-2-01'}),entry({audience:'everyone'}),entry({category:'diagnosis'}),entry({email:'not-an-email'}),entry({university:{en:'a'.repeat(121),zh:'学校'}}),entry({zh:{...UNIVERSITY_SUPPORT_SEED[0].zh,title:''}}),entry({en:{...UNIVERSITY_SUPPORT_SEED[0].en,template:'a'.repeat(2001)}})])assert.equal((await h.call('mod','/admin','POST',value)).status,400);
 for(const sourceUrl of ['javascript:alert(1)','data:text/html,x','file:///tmp/source','ftp://example.edu/service','https://user:pass@example.edu/service','https://127.0.0.1/service','https://localhost/service','https://example.edu:123/service','https://'+'a'.repeat(2048)+'.edu'])assert.equal((await h.call('mod','/admin','POST',entry({sourceUrl}))).status,400,sourceUrl);
 assert.equal((await h.call('mod','/admin','POST',entry({sourceUrl:'https://example.edu/support?language=zh',email:''}))).status,201);
});
test('full-size bilingual fields fit the explicit bounded manager request size',async t=>{
 const h=harness(t);await h.join('mod');const value=entry();for(const lang of ['en','zh'])for(const [key,max]of Object.entries({title:120,office:180,summary:800,request:1000,expect:800,template:2000}))value[lang][key]='中'.repeat(max);assert.ok(new TextEncoder().encode(JSON.stringify(value)).length>16384);assert.equal((await h.call('mod','/admin','POST',value)).status,201);
});
test('suggestions stay visible only to their author and moderators, and review never auto publishes',async t=>{
 const h=harness(t);for(const who of ['alice','bob','mod'])await h.join(who);
 const a=await h.call('alice','/suggestions','POST',suggestion({serviceId:'lancaster-disability',authorId:'bob',status:'reviewed'}));assert.equal(a.status,201);assert.equal(a.data.status,'pending');
 const b=await h.call('bob','/suggestions','POST',suggestion({note:'Second member note'}));assert.equal(b.status,201);
 const own=(await h.call('alice','/suggestions')).data.suggestions;assert.equal(own.length,1);assert.equal(own[0].id,a.data.id);assert.equal(own[0].authorId,undefined);assert.equal(own[0].status,'pending');assert.equal((await h.call('bob','/suggestions')).data.suggestions[0].id,b.data.id);assert.equal((await h.call(null,'/suggestions')).status,401);
 assert.equal((await h.call('bob','/suggestions/'+a.data.id,'PUT',{status:'reviewed'})).status,403);assert.equal((await h.call('bob','/suggestions?review=1')).status,403);
 const review=(await h.call('mod','/suggestions?review=1')).data.suggestions;assert.equal(review.length,2);assert.equal(review.find(s=>s.id===a.data.id).authorId,'alice');
 assert.equal((await h.call('mod','/suggestions/'+a.data.id,'PUT',{status:'reviewed',moderatorNote:'Verified the link; separately updating the directory.'})).status,200);
 assert.equal((await h.call('alice','/suggestions')).data.suggestions[0].status,'reviewed');assert.equal((await h.call('mod','/suggestions?review=1')).data.suggestions.length,1);assert.equal((await h.call(null)).data.services.length,8);assert.doesNotMatch(JSON.stringify((await h.call(null)).data),/Second member note|Verified the link/);
 assert.equal((await h.call('mod','/suggestions/'+b.data.id,'PUT',{status:'rejected',moderatorNote:'Please provide a university-owned source.'})).status,200);assert.equal((await h.call('bob','/suggestions')).data.suggestions[0].moderatorNote,'Please provide a university-owned source.');
});
test('suggestion validation and five-per-day caps do not publish or consume quota for invalid input',async t=>{
 const h=harness(t);await h.join('alice');await h.join('bob');
 for(const input of [suggestion({sourceUrl:'javascript:alert(1)'}),suggestion({note:' '}),suggestion({university:'u'.repeat(121)}),suggestion({note:'a'.repeat(1501)}),suggestion({serviceId:'missing-service'})])assert.ok([400,404].includes((await h.call('alice','/suggestions','POST',input)).status));
 for(let i=0;i<5;i++)assert.equal((await h.call('alice','/suggestions','POST',suggestion())).status,201);assert.equal((await h.call('alice','/suggestions','POST',suggestion())).status,429);assert.equal((await h.call('bob','/suggestions','POST',suggestion())).status,201);
 const page=await h.call('alice','/suggestions?limit=2');assert.equal(page.data.hasMore,true);assert.equal(page.data.suggestions.length,2);assert.equal((await h.call('alice','/suggestions?limit=2&offset=4')).data.suggestions.length,1);
 await h.DB.prepare("UPDATE university_support_limits SET expires=0 WHERE bucket LIKE 'alice|suggestion|%'").run();assert.equal((await h.call('alice','/suggestions','POST',suggestion())).status,201);
});
test('moderator write cap applies across add, edit, archive and review operations',async t=>{
 const h=harness(t);await h.join('mod');for(let i=0;i<30;i++)assert.equal((await h.call('mod','/admin/lancaster-disability','DELETE')).status,200);assert.equal((await h.call('mod','/admin','POST',entry())).status,429);assert.equal((await h.call('mod','/admin/lancaster-disability','PUT',entry())).status,429);
 assert.equal((await h.call('mod','/admin')).status,200);assert.equal((await h.call(null)).status,200);
});
test('first cold support read and authenticated write bootstrap remain below free D1 statement quota',async t=>{
 const h=harness(t,{baseOnly:true});h.calls.length=0;assert.equal((await h.call(null)).status,200);assert.equal(h.calls.length,9);assert.equal(h.calls.filter(c=>/^INSERT OR IGNORE/.test(c.sql)).length,1);assert.equal(h.calls.find(c=>/^INSERT OR IGNORE/.test(c.sql)).bindings,96);
 h.calls.length=0;assert.equal((await h.call(null)).status,200);assert.equal(h.calls.length,1);
 h.sqlite.prepare('INSERT INTO profiles(id,name,group_name,role,university,language,consent_version,created) VALUES(?,?,?,?,?,?,?,?)').run('mod','mod','neurodivergent','Student','Example','en','test',Date.now());h.env.DB=h.adapter();h.calls.length=0;assert.equal((await h.call('mod','/admin','POST',entry())).status,201);assert.ok(h.calls.length<50,`cold request used ${h.calls.length} statements`);assert.equal(h.calls.filter(c=>/^INSERT OR IGNORE/.test(c.sql)).length,1);
 const count=await h.env.DB.prepare('SELECT COUNT(*) AS n FROM university_support_services').first();assert.equal(count.n,9);assert.equal(UNIVERSITY_SUPPORT_SCHEMA.length,7);
});
test('seeds and source disclaimer have bilingual copy and use only the verified university domains',()=>{
 const domains=new Set(['www.lancaster.ac.uk','www.ulaval.ca','www.uliege.be','www.student.uliege.be','stl.pku.edu.cn']);assert.equal(new Set(UNIVERSITY_SUPPORT_SEED.map(s=>s.id)).size,8);for(const s of UNIVERSITY_SUPPORT_SEED)assert.ok(domains.has(new URL(s.sourceUrl).hostname));for(const [key,value]of Object.entries(universitySupportCopy)){assert.equal(value.length,2,key);assert.ok(value.every(x=>typeof x==='string'&&x.length>0),key);}assert.match(universitySupportCopy.supportSuggestIntro[0],/operator/);assert.match(universitySupportCopy.supportDisclaimer[0],/not endorsed/);
});
