// Public answer lanes are separate from the existing private offers and chats.
// No migration or request republishes legacy private content.
export const PUBLIC_ANSWER_CONSENT='2026-10-02-member-visible-v1';
export const PUBLIC_ANSWERS_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS question_answers (id TEXT PRIMARY KEY NOT NULL,post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,body TEXT NOT NULL,visibility_consent_version TEXT NOT NULL,created INTEGER NOT NULL)',
 'CREATE UNIQUE INDEX IF NOT EXISTS answers_post_author ON question_answers(post_id,author_id)',
 'CREATE INDEX IF NOT EXISTS answers_post_created ON question_answers(post_id,created,id)',
 'CREATE INDEX IF NOT EXISTS answers_author_created ON question_answers(author_id,created)',
 'CREATE TABLE IF NOT EXISTS question_answer_replies (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,answer_id TEXT NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,body TEXT NOT NULL,visibility_consent_version TEXT NOT NULL,created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS answer_replies_answer_id ON question_answer_replies(answer_id,id)',
 'CREATE INDEX IF NOT EXISTS answer_replies_author_created ON question_answer_replies(author_id,created)',
 'CREATE TABLE IF NOT EXISTS public_answer_report_links (report_id TEXT PRIMARY KEY NOT NULL REFERENCES reports(id) ON DELETE CASCADE,target_kind TEXT NOT NULL,answer_id TEXT REFERENCES question_answers(id) ON DELETE SET NULL,reply_id INTEGER REFERENCES question_answer_replies(id) ON DELETE SET NULL,answer_body_snapshot TEXT NOT NULL,reply_body_snapshot TEXT,question_title_snapshot TEXT NOT NULL,question_body_snapshot TEXT NOT NULL)'
];
const readyDatabases=new WeakMap();
export async function ensurePublicAnswersSchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){
  ready=(async()=>{for(const sql of PUBLIC_ANSWERS_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});
  readyDatabases.set(db,ready);
 }
 await ready;
}
