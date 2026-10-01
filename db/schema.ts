import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
export const authLimits = sqliteTable('auth_limits', {
 bucket:text('bucket').primaryKey(), hits:integer('hits').notNull().default(1), expires:integer('expires').notNull()
},t=>[index('auth_limits_expires').on(t.expires)]);
export const profiles = sqliteTable('profiles', {
 id:text('id').primaryKey(), name:text('name').notNull(), group:text('group_name').notNull(),
 role:text('role').notNull(), university:text('university').notNull().default(''),
 language:text('language').notNull().default('en'), consentVersion:text('consent_version').notNull(), created:integer('created').notNull()
});
export const posts = sqliteTable('posts', {
 id:text('id').primaryKey(), authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 title:text('title').notNull(), body:text('body').notNull(), topic:text('topic').notNull(), created:integer('created').notNull()
},t=>[index('posts_created').on(t.created),index('posts_author_created').on(t.authorId,t.created)]);
export const offers = sqliteTable('offers', {
 id:text('id').primaryKey(), postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 helperId:text('helper_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}), body:text('body').notNull(),
 status:text('status').notNull().default('pending'), created:integer('created').notNull()
},t=>[uniqueIndex('offers_post_helper').on(t.postId,t.helperId),index('offers_helper_created').on(t.helperId,t.created)]);
export const conversations = sqliteTable('conversations', {
 id:text('id').primaryKey(), offerId:text('offer_id').notNull().references(()=>offers.id,{onDelete:'cascade'}),
 postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 helperId:text('helper_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 ended:integer('ended').notNull().default(0), created:integer('created').notNull()
},t=>[uniqueIndex('conversations_offer').on(t.offerId),index('conversations_author_created').on(t.authorId,t.created),index('conversations_helper_created').on(t.helperId,t.created)]);
export const messages = sqliteTable('messages', {
 id:integer('id').primaryKey({autoIncrement:true}), conversationId:text('conversation_id').notNull().references(()=>conversations.id,{onDelete:'cascade'}),
 authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 body:text('body').notNull(), guideId:text('guide_id'), created:integer('created').notNull()
},t=>[index('messages_conversation_id').on(t.conversationId,t.id),index('messages_author_created').on(t.authorId,t.created)]);
export const blocks = sqliteTable('blocks', {
 blockerId:text('blocker_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 blockedId:text('blocked_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}), created:integer('created').notNull()
},t=>[primaryKey({columns:[t.blockerId,t.blockedId]}),index('blocks_blocked').on(t.blockedId)]);
export const reports = sqliteTable('reports', {
 id:text('id').primaryKey(), reporterId:text('reporter_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 postId:text('post_id').references(()=>posts.id,{onDelete:'set null'}),
 conversationId:text('conversation_id').references(()=>conversations.id,{onDelete:'set null'}),
 reason:text('reason').notNull(), status:text('status').notNull().default('open'),created:integer('created').notNull()
},t=>[index('reports_status_created').on(t.status,t.created),index('reports_reporter_created').on(t.reporterId,t.created)]);
// Additive extensions preserve the original community and its conversations.
export const profilePreferences = sqliteTable('profile_preferences', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),
 tagsJson:text('tags_json').notNull().default('[]'),preferredLanguage:text('preferred_language').notNull().default('either'),
 visible:integer('visible').notNull().default(0),updated:integer('updated').notNull()
});
export const questionFeatures = sqliteTable('question_features', {
 postId:text('post_id').primaryKey().references(()=>posts.id,{onDelete:'cascade'}),
 supportKind:text('support_kind').notNull().default(''),status:text('status').notNull().default('open'),updated:integer('updated').notNull()
});
export const takeaways = sqliteTable('takeaways', {
 id:text('id').primaryKey(),authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 body:text('body').notNull(),topic:text('topic').notNull(),consentVersion:text('consent_version').notNull(),created:integer('created').notNull()
},t=>[index('takeaways_created').on(t.created,t.id),index('takeaways_author_created').on(t.authorId,t.created),index('takeaways_topic_created').on(t.topic,t.created,t.id)]);
export const takeawayReportLinks = sqliteTable('takeaway_report_links', {
 reportId:text('report_id').primaryKey().references(()=>reports.id,{onDelete:'cascade'}),
 takeawayId:text('takeaway_id').references(()=>takeaways.id,{onDelete:'set null'}),
 bodySnapshot:text('body_snapshot').notNull(),topicSnapshot:text('topic_snapshot').notNull()
});
