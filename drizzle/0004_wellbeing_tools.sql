CREATE TABLE IF NOT EXISTS workspace_drafts (
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 draft_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 body TEXT NOT NULL DEFAULT '',
 topic TEXT NOT NULL DEFAULT '',
 support_kind TEXT NOT NULL DEFAULT '',
 template_id TEXT,
 language TEXT,
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 PRIMARY KEY(user_id,draft_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_bookmarks (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 created INTEGER NOT NULL,
 UNIQUE(user_id,kind,target_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workspace_bookmarks_owner ON workspace_bookmarks(user_id,created,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_plans (
 id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 steps_json TEXT NOT NULL,
 remind_at INTEGER,
 remind_minutes INTEGER NOT NULL DEFAULT 0,
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 PRIMARY KEY(user_id,id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workspace_plans_owner ON workspace_plans(user_id,updated,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_write_limits (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 window_start INTEGER NOT NULL,
 total INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS campus_spaces (
 id TEXT PRIMARY KEY NOT NULL,
 author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 university TEXT NOT NULL,
 place TEXT NOT NULL,
 description TEXT NOT NULL,
 noise TEXT NOT NULL,
 lighting TEXT NOT NULL,
 crowding TEXT NOT NULL,
 seating TEXT NOT NULL,
 break_space INTEGER NOT NULL,
 observed_on TEXT NOT NULL,
 time_of_day TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS campus_spaces_created ON campus_spaces(created,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS campus_spaces_author_created ON campus_spaces(author_id,created);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS campus_spaces_university_created ON campus_spaces(university,created,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS campus_space_publish_limits (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 window_start INTEGER NOT NULL,
 total INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS campus_space_report_links (
 report_id TEXT PRIMARY KEY NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 campus_space_id TEXT REFERENCES campus_spaces(id) ON DELETE SET NULL,
 place_snapshot TEXT NOT NULL,
 university_snapshot TEXT NOT NULL,
 description_snapshot TEXT NOT NULL
);
