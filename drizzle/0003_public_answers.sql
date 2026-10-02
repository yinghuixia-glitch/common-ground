CREATE TABLE IF NOT EXISTS `public_answer_report_links` (
	`report_id` text PRIMARY KEY NOT NULL,
	`target_kind` text NOT NULL,
	`answer_id` text,
	`reply_id` integer,
	`answer_body_snapshot` text NOT NULL,
	`reply_body_snapshot` text,
	`question_title_snapshot` text NOT NULL,
	`question_body_snapshot` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`answer_id`) REFERENCES `question_answers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reply_id`) REFERENCES `question_answer_replies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_answer_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`answer_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`visibility_consent_version` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`answer_id`) REFERENCES `question_answers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `answer_replies_answer_id` ON `question_answer_replies` (`answer_id`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `answer_replies_author_created` ON `question_answer_replies` (`author_id`,`created`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`visibility_consent_version` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `answers_post_author` ON `question_answers` (`post_id`,`author_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `answers_post_created` ON `question_answers` (`post_id`,`created`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `answers_author_created` ON `question_answers` (`author_id`,`created`);