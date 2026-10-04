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
// Group agreements are shared only with invited members; edits use revisions.
export const groupAgreements = sqliteTable('group_agreements', {
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 title:text('title').notNull(),sheetJson:text('sheet_json').notNull(),revision:integer('revision').notNull().default(1),
 created:integer('created').notNull(),updated:integer('updated').notNull()
});
export const groupAgreementMembers = sqliteTable('group_agreement_members', {
 groupId:text('group_id').notNull().references(()=>groupAgreements.id,{onDelete:'cascade'}),
 userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 confirmedRevision:integer('confirmed_revision'),joined:integer('joined').notNull()
},t=>[primaryKey({columns:[t.groupId,t.userId]}),index('agreement_members_user').on(t.userId)]);
export const groupAgreementVersions = sqliteTable('group_agreement_versions', {
 groupId:text('group_id').notNull().references(()=>groupAgreements.id,{onDelete:'cascade'}),revision:integer('revision').notNull(),
 sheetJson:text('sheet_json').notNull(),authorId:text('author_id').references(()=>profiles.id,{onDelete:'set null'}),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.groupId,t.revision]})]);
export const groupAgreementInvites = sqliteTable('group_agreement_invites', {
 id:text('id').primaryKey(),groupId:text('group_id').notNull().references(()=>groupAgreements.id,{onDelete:'cascade'}),
 tokenHash:text('token_hash').notNull().unique(),created:integer('created').notNull(),expires:integer('expires').notNull(),revoked:integer('revoked').notNull().default(0)
},t=>[index('agreement_invites_group').on(t.groupId,t.expires),check('group_agreement_invites_revoked',sql`${t.revoked} IN (0,1)`)]);
export const groupAgreementWriteLimits = sqliteTable('group_agreement_write_limits', {
 userId:text('user_id').primaryKey().references(()=>profiles.id,{onDelete:'cascade'}),windowStart:integer('window_start').notNull(),total:integer('total').notNull()
});

// Small study rooms keep private goals separate from participant chat.
export const studyRooms = sqliteTable('study_rooms', {
 id:text('id').primaryKey().notNull(), hostId:text('host_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 title:text('title').notNull(), language:text('language').notNull(), durationMinutes:integer('duration_minutes').notNull(),
 startsAt:integer('starts_at').notNull(), endsAt:integer('ends_at').notNull(), state:text('state').notNull().default('open'), created:integer('created').notNull()
},t=>[index('study_rooms_created').on(t.created,t.id)]);
export const studyParticipants = sqliteTable('study_participants', {
 roomId:text('room_id').notNull().references(()=>studyRooms.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 goal:text('goal').notNull().default(''),shareGoal:integer('share_goal').notNull().default(0),done:integer('done').notNull().default(0),status:text('status').notNull().default('active'),joined:integer('joined').notNull(),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.roomId,t.userId]}),index('study_participants_user').on(t.userId,t.roomId)]);
export const studyMessages = sqliteTable('study_messages', {
 id:integer('id').primaryKey({autoIncrement:true}).notNull(),roomId:text('room_id').notNull().references(()=>studyRooms.id,{onDelete:'cascade'}),authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),body:text('body').notNull(),created:integer('created').notNull()
},t=>[index('study_messages_room').on(t.roomId,t.id)]);
export const studyReports = sqliteTable('study_reports', {
 id:text('id').primaryKey().notNull(),reporterId:text('reporter_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),roomId:text('room_id').references(()=>studyRooms.id,{onDelete:'set null'}),messageId:integer('message_id').references(()=>studyMessages.id,{onDelete:'set null'}),
 targetKind:text('target_kind').notNull(),targetAuthorId:text('target_author_id').references(()=>profiles.id,{onDelete:'set null'}),roomTitleSnapshot:text('room_title_snapshot').notNull(),bodySnapshot:text('body_snapshot').notNull(),reason:text('reason').notNull(),status:text('status').notNull().default('open'),created:integer('created').notNull()
},t=>[index('study_reports_status').on(t.status,t.created,t.id)]);
export const studyLimits = sqliteTable('study_limits', {
 userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),bucket:text('bucket').notNull(),periodStart:integer('period_start').notNull(),total:integer('total').notNull()
},t=>[primaryKey({columns:[t.userId,t.bucket]})]);

// Public institutional directory; member suggestions require review.
// Append to db/schema.ts; its existing sqliteTable/text/integer/index/profiles imports are sufficient.
export const universitySupportServices = sqliteTable('university_support_services', {
 id:text('id').primaryKey().notNull(),universityEn:text('university_en').notNull(),universityZh:text('university_zh').notNull(),
 audience:text('audience').notNull(),category:text('category').notNull(),sourceUrl:text('source_url').notNull(),checkedDate:text('checked_date').notNull(),
 officialEmail:text('official_email').notNull().default(''),enJson:text('en_json').notNull(),zhJson:text('zh_json').notNull(),
 archived:integer('archived').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('university_support_lookup').on(t.archived,t.universityEn,t.id)]);
export const universitySupportSuggestions = sqliteTable('university_support_suggestions', {
 id:text('id').primaryKey().notNull(),authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
 serviceId:text('service_id').references(()=>universitySupportServices.id,{onDelete:'set null'}),university:text('university').notNull(),
 sourceUrl:text('source_url').notNull(),note:text('note').notNull(),status:text('status').notNull().default('pending'),
 moderatorNote:text('moderator_note').notNull().default(''),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('university_support_suggestions_author').on(t.authorId,t.created,t.id),index('university_support_suggestions_status').on(t.status,t.created,t.id)]);
export const universitySupportLimits = sqliteTable('university_support_limits', {
 bucket:text('bucket').primaryKey().notNull(),hits:integer('hits').notNull(),expires:integer('expires').notNull()
},t=>[index('university_support_limits_expires').on(t.expires)]);
