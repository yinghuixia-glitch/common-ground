// Optional community features live in extension tables. Existing member,
// question and conversation records are kept intact when this version starts.
export const PREFERENCE_TAGS=['shortReplies','directExplanations','slowReplies'];
export const SUPPORT_KINDS=['listening','suggestions','perspective','experience'];
export const QUESTION_STATUSES=['open','resolved'];
export const DEFAULT_PREFERENCES={tags:[],preferredLanguage:'either',visible:false};

export const COMMUNITY_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS profile_preferences (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,tags_json TEXT NOT NULL DEFAULT \'[]\',preferred_language TEXT NOT NULL DEFAULT \'either\',visible INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS question_features (post_id TEXT PRIMARY KEY NOT NULL REFERENCES posts(id) ON DELETE CASCADE,support_kind TEXT NOT NULL DEFAULT \'\',status TEXT NOT NULL DEFAULT \'open\',updated INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS takeaways (id TEXT PRIMARY KEY NOT NULL,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,body TEXT NOT NULL,topic TEXT NOT NULL,consent_version TEXT NOT NULL,created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS takeaways_created ON takeaways(created,id)',
 'CREATE INDEX IF NOT EXISTS takeaways_author_created ON takeaways(author_id,created)',
 'CREATE INDEX IF NOT EXISTS takeaways_topic_created ON takeaways(topic,created,id)',
 'CREATE TABLE IF NOT EXISTS takeaway_report_links (report_id TEXT PRIMARY KEY NOT NULL REFERENCES reports(id) ON DELETE CASCADE,takeaway_id TEXT REFERENCES takeaways(id) ON DELETE SET NULL,body_snapshot TEXT NOT NULL,topic_snapshot TEXT NOT NULL)'
];
const readyDatabases=new WeakMap();
export async function ensureCommunitySchema(db){
 let ready=readyDatabases.get(db);
 if(!ready){
  ready=(async()=>{for(const sql of COMMUNITY_SCHEMA)await db.prepare(sql).run();})().catch(error=>{readyDatabases.delete(db);throw error;});
  readyDatabases.set(db,ready);
 }
 await ready;
}

export function validatePreferences(value,fail){
 if(!value||Array.isArray(value)||typeof value!=='object'||!Array.isArray(value.tags)||value.tags.length>PREFERENCE_TAGS.length||value.tags.some(tag=>!PREFERENCE_TAGS.includes(tag))||new Set(value.tags).size!==value.tags.length||!['en','zh','either'].includes(value.preferredLanguage)||typeof value.visible!=='boolean')fail(400,'invalidInput');
 return {tags:[...value.tags],preferredLanguage:value.preferredLanguage,visible:value.visible};
}
// SQL callers provide only these three fields. Public callers receive nothing
// for hidden preferences, including hidden preferred-language choices.
export function readPreferences(row,own=false){
 const visible=row?.pref_visible===1||row?.pref_visible===true;
 if(!own&&!visible)return null;
 let tags=[];
 try{const parsed=JSON.parse(row?.pref_tags??'[]');if(Array.isArray(parsed))tags=[...new Set(parsed.filter(tag=>PREFERENCE_TAGS.includes(tag)))];}catch{}
 return {tags,preferredLanguage:['en','zh','either'].includes(row?.pref_language)?row.pref_language:'either',visible};
}
export const PREFERENCE_COLUMNS='pp.tags_json AS pref_tags,pp.preferred_language AS pref_language,pp.visible AS pref_visible';
