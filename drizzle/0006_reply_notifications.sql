CREATE TABLE IF NOT EXISTS `reply_notification_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reply_notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`event_kind` text NOT NULL,
	`post_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`reply_id` integer,
	`recipient_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`created` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer NOT NULL,
	`locked_at` integer,
	`last_error` text,
	`sent_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`answer_id`) REFERENCES `question_answers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_id`) REFERENCES `question_answer_replies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reply_notification_event_kind" CHECK("reply_notification_outbox"."event_kind" IN ('answer','reply')),
	CONSTRAINT "reply_notification_state" CHECK("reply_notification_outbox"."state" IN ('pending','sending','sent','failed','suppressed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `reply_notification_event_key` ON `reply_notification_outbox` (`event_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reply_notification_pending` ON `reply_notification_outbox` (`state`,`next_attempt`,`created`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reply_notification_recipient_post` ON `reply_notification_outbox` (`recipient_id`,`post_id`,`created`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reply_notification_send_windows` (
	`recipient_id` text NOT NULL,
	`post_id` text NOT NULL,
	`last_sent` integer,
	`reserved_at` integer,
	`reserved_until` integer DEFAULT 0 NOT NULL,
	`reservation_id` text,
	PRIMARY KEY(`recipient_id`, `post_id`),
	FOREIGN KEY (`recipient_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reply_notification_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reply_notification_settings_enabled" CHECK("reply_notification_settings"."enabled" IN (0,1)),
	CONSTRAINT "reply_notification_settings_language" CHECK("reply_notification_settings"."language" IN ('en','zh'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reply_notification_unsubscribe` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reply_notification_unsubscribe_user` ON `reply_notification_unsubscribe` (`user_id`,`created`);
