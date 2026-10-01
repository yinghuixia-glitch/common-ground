CREATE TABLE IF NOT EXISTS `auth_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_limits_expires` ON `auth_limits` (`expires`);
