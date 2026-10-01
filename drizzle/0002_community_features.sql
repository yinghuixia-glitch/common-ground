CREATE TABLE IF NOT EXISTS `profile_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`preferred_language` text DEFAULT 'either' NOT NULL,
	`visible` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_features` (
	`post_id` text PRIMARY KEY NOT NULL,
	`support_kind` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `takeaway_report_links` (
	`report_id` text PRIMARY KEY NOT NULL,
	`takeaway_id` text,
	`body_snapshot` text NOT NULL,
	`topic_snapshot` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`takeaway_id`) REFERENCES `takeaways`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `takeaways` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`topic` text NOT NULL,
	`consent_version` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `takeaways_created` ON `takeaways` (`created`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `takeaways_author_created` ON `takeaways` (`author_id`,`created`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `takeaways_topic_created` ON `takeaways` (`topic`,`created`,`id`);