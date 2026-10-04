import { sqliteTable, text, integer, index, uniqueIndex, unique, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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
// Member-visible discussion lanes never reuse private conversation records.
export const questionAnswers = sqliteTable('question_answers', {
 id:text('id').primaryKey(),postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),body:text('body').notNull(),
 visibilityConsentVersion:text('visibility_consent_version').notNull(),created:integer('created').notNull()
},t=>[uniqueIndex('answers_post_author').on(t.postId,t.authorId),index('answers_post_created').on(t.postId,t.created,t.id),index('answers_author_created').on(t.authorId,t.created)]);
export const questionAnswerReplies = sqliteTable('question_answer_replies', {
 id:integer('id').primaryKey({autoIncrement:true}),answerId:text('answer_id').notNull().references(()=>questionAnswers.id,{onDelete:'cascade'}),
 authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),body:text('body').notNull(),
 visibilityConsentVersion:text('visibility_consent_version').notNull(),created:integer('created').notNull()
},t=>[index('answer_replies_answer_id').on(t.answerId,t.id),index('answer_replies_author_created').on(t.authorId,t.created)]);
export const publicAnswerReportLinks = sqliteTable('public_answer_report_links', {
 reportId:text('report_id').primaryKey().references(()=>reports.id,{onDelete:'cascade'}),targetKind:text('target_kind').notNull(),
 answerId:text('answer_id').references(()=>questionAnswers.id,{onDelete:'set null'}),replyId:integer('reply_id').references(()=>questionAnswerReplies.id,{onDelete:'set null'}),
 answerBodySnapshot:text('answer_body_snapshot').notNull(),replyBodySnapshot:text('reply_body_snapshot'),
 questionTitleSnapshot:text('question_title_snapshot').notNull(),questionBodySnapshot:text('question_body_snapshot').notNull()
});
// Account-private records store community bookmarks as live references only.
export const workspaceDrafts = sqliteTable('workspace_drafts', {
 userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 draftKey:text('draft_key').notNull(),kind:text('kind').notNull(),
 title:text('title').notNull().default(''),body:text('body').notNull().default(''),
 topic:text('topic').notNull().default(''),supportKind:text('support_kind').notNull().default(''),
 templateId:text('template_id'),language:text('language'),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.userId,t.draftKey]})]);
export const workspaceBookmarks = sqliteTable('workspace_bookmarks', {
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 kind:text('kind').notNull(),targetId:text('target_id').notNull(),created:integer('created').notNull()
},t=>[unique().on(t.userId,t.kind,t.targetId),index('workspace_bookmarks_owner').on(t.userId,t.created,t.id)]);
export const workspacePlans = sqliteTable('workspace_plans', {
 id:text('id').notNull(),userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 title:text('title').notNull(),stepsJson:text('steps_json').notNull(),remindAt:integer('remind_at'),
 remindMinutes:integer('remind_minutes').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.userId,t.id]}),index('workspace_plans_owner').on(t.userId,t.updated,t.id)]);
export const workspaceWriteLimits = sqliteTable('workspace_write_limits', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),
 windowStart:integer('window_start').notNull(),total:integer('total').notNull()
});
// Campus-space observations remain separate from private plans and messages.
export const campusSpaces = sqliteTable('campus_spaces', {
 id:text('id').primaryKey(),authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 university:text('university').notNull(),place:text('place').notNull(),description:text('description').notNull(),
 noise:text('noise').notNull(),lighting:text('lighting').notNull(),crowding:text('crowding').notNull(),
 seating:text('seating').notNull(),breakSpace:integer('break_space').notNull(),observedOn:text('observed_on').notNull(),
 timeOfDay:text('time_of_day').notNull(),consentVersion:text('consent_version').notNull(),created:integer('created').notNull()
},t=>[index('campus_spaces_created').on(t.created,t.id),index('campus_spaces_author_created').on(t.authorId,t.created),index('campus_spaces_university_created').on(t.university,t.created,t.id)]);
export const campusSpacePublishLimits = sqliteTable('campus_space_publish_limits', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),
 windowStart:integer('window_start').notNull(),total:integer('total').notNull()
});
export const campusSpaceReportLinks = sqliteTable('campus_space_report_links', {
 reportId:text('report_id').primaryKey().references(()=>reports.id,{onDelete:'cascade'}),
 campusSpaceId:text('campus_space_id').references(()=>campusSpaces.id,{onDelete:'set null'}),
 placeSnapshot:text('place_snapshot').notNull(),universitySnapshot:text('university_snapshot').notNull(),descriptionSnapshot:text('description_snapshot').notNull()
});
// Aggregate acknowledgements have no public member roster or ranking.
export const questionLikes = sqliteTable('question_likes', {
 postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.postId,t.userId]}),index('question_likes_user').on(t.userId)]);
export const answerLikes = sqliteTable('answer_likes', {
 answerId:text('answer_id').notNull().references(()=>questionAnswers.id,{onDelete:'cascade'}),
 userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.answerId,t.userId]}),index('answer_likes_user').on(t.userId)]);
export const reactionWriteLimits = sqliteTable('reaction_write_limits', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),
 windowStart:integer('window_start').notNull(),total:integer('total').notNull()
});
// Verified email is retained only for a member's explicit reply-email opt-in.
export const replyNotificationSettings = sqliteTable('reply_notification_settings', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),
 email:text('email'),enabled:integer('enabled').notNull().default(0),
 language:text('language').notNull().default('en'),updated:integer('updated').notNull()
},t=>[check('reply_notification_settings_enabled',sql`${t.enabled} IN (0,1)`),check('reply_notification_settings_language',sql`${t.language} IN ('en','zh')`)]);
export const replyNotificationOutbox = sqliteTable('reply_notification_outbox', {
 id:text('id').primaryKey(),eventKey:text('event_key').notNull(),eventKind:text('event_kind').notNull(),
 postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 answerId:text('answer_id').notNull().references(()=>questionAnswers.id,{onDelete:'cascade'}),
 replyId:integer('reply_id').references(()=>questionAnswerReplies.id,{onDelete:'cascade'}),
 recipientId:text('recipient_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 actorId:text('actor_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 created:integer('created').notNull(),state:text('state').notNull().default('pending'),
 attempts:integer('attempts').notNull().default(0),nextAttempt:integer('next_attempt').notNull(),
 lockedAt:integer('locked_at'),lastError:text('last_error'),sentAt:integer('sent_at')
},t=>[uniqueIndex('reply_notification_event_key').on(t.eventKey),index('reply_notification_pending').on(t.state,t.nextAttempt,t.created),index('reply_notification_recipient_post').on(t.recipientId,t.postId,t.created),check('reply_notification_event_kind',sql`${t.eventKind} IN ('answer','reply')`),check('reply_notification_state',sql`${t.state} IN ('pending','sending','sent','failed','suppressed')`)]);
export const replyNotificationBudget = sqliteTable('reply_notification_budget', {
 day:text('day').primaryKey(),used:integer('used').notNull().default(0)
});
export const replyNotificationSendWindows = sqliteTable('reply_notification_send_windows', {
 recipientId:text('recipient_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 lastSent:integer('last_sent'),reservedAt:integer('reserved_at'),reservedUntil:integer('reserved_until').notNull().default(0),reservationId:text('reservation_id')
},t=>[primaryKey({columns:[t.recipientId,t.postId]})]);
export const replyNotificationUnsubscribe = sqliteTable('reply_notification_unsubscribe', {
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),created:integer('created').notNull()
},t=>[index('reply_notification_unsubscribe_user').on(t.userId,t.created)]);
