// Likes are small acknowledgements. They do not expose a member roster and
// never influence feed ordering or access to questions and answers.
export const REACTIONS_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS question_likes (post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,created INTEGER NOT NULL,PRIMARY KEY(post_id,user_id))',
 'CREATE INDEX IF NOT EXISTS question_likes_user ON question_likes(user_id)',
 'CREATE TABLE IF NOT EXISTS answer_likes (answer_id TEXT NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,created INTEGER NOT NULL,PRIMARY KEY(answer_id,user_id))',
 'CREATE INDEX IF NOT EXISTS answer_likes_user ON answer_likes(user_id)',
 'CREATE TABLE IF NOT EXISTS reaction_write_limits (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,window_start INTEGER NOT NULL,total INTEGER NOT NULL)'
];
const readyDatabases=new WeakMap();
export async function ensureReactionsSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){ready=(async()=>{for(const sql of REACTIONS_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});readyDatabases.set(db,ready);}
 await ready;
}
const TARGETS={question:{table:'question_likes',column:'post_id'},answer:{table:'answer_likes',column:'answer_id'}};
// One bounded query per returned page, rather than one query per card. The
// block filter applies to aggregate acknowledgement counts as well as content.
export async function reactionCounts(db,kind,targetIds,id){
 const target=TARGETS[kind];if(!target)throw Error('Unknown reaction target');
 const ids=[...new Set(targetIds)];if(!ids.length)return new Map();if(ids.length>50)throw Error('Unbounded reaction page');
 const rows=(await db.prepare(`SELECT l.${target.column} AS targetId,COUNT(*) AS likeCount,MAX(CASE WHEN l.user_id=? THEN 1 ELSE 0 END) AS liked FROM ${target.table} l WHERE l.${target.column} IN (${ids.map(()=>'?').join(',')}) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=l.user_id) OR (b.blocker_id=l.user_id AND b.blocked_id=?)) GROUP BY l.${target.column}`).bind(id,...ids,id,id).all()).results;
 return new Map(rows.map(row=>[row.targetId,{likeCount:row.likeCount,liked:!!row.liked}]));
}
export function reactionState(counts,id){return counts.get(id)??{likeCount:0,liked:false};}
export async function handleReaction(request,kind,targetId,id,ctx){
 const {db,body,text,fail,json,query,visibleQuestion,visibleAnswer}=ctx;
 if(!['POST','DELETE'].includes(request.method))fail(405,'notAllowed');
 const target=TARGETS[kind];if(!target)fail(400,'invalidInput');targetId=text(targetId,1,200);
 if(request.body){const input=await body(request);if(Object.keys(input).length)fail(400,'invalidInput');}
 const accessible=()=>kind==='question'?visibleQuestion(db,targetId,id):visibleAnswer(db,targetId,id);
 await accessible();
 const window=Math.floor(Date.now()/60000),allowed=await query(db,'INSERT INTO reaction_write_limits(user_id,window_start,total) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,total=CASE WHEN reaction_write_limits.window_start=excluded.window_start THEN reaction_write_limits.total+1 ELSE 1 END WHERE reaction_write_limits.window_start!=excluded.window_start OR reaction_write_limits.total<120',id,window).run();
 if(!allowed.meta.changes)fail(429,'tooFast');
 if(request.method==='DELETE')await query(db,`DELETE FROM ${target.table} WHERE ${target.column}=? AND user_id=?`,targetId,id).run();
 else if(kind==='question')await query(db,'INSERT INTO question_likes(post_id,user_id,created) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?))) ON CONFLICT(post_id,user_id) DO NOTHING',targetId,id,Date.now(),targetId,id,id).run();
 else await query(db,'INSERT INTO answer_likes(answer_id,user_id,created) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM question_answers a JOIN posts p ON p.id=a.post_id WHERE a.id=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id IN (a.author_id,p.author_id)) OR (b.blocked_id=? AND b.blocker_id IN (a.author_id,p.author_id)))) ON CONFLICT(answer_id,user_id) DO NOTHING',targetId,id,Date.now(),targetId,id,id).run();
 // A concurrent block or deletion must not turn a successful write into an
 // opportunity to read counts for a now-inaccessible question or answer.
 await accessible();return json(reactionState(await reactionCounts(db,kind,[targetId],id),targetId));
}
