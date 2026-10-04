CREATE TABLE IF NOT EXISTS study_rooms (id TEXT PRIMARY KEY NOT NULL,host_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,language TEXT NOT NULL,duration_minutes INTEGER NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_rooms_created ON study_rooms(created,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS study_participants (room_id TEXT NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,goal TEXT NOT NULL DEFAULT '',share_goal INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',joined INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(room_id,user_id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_participants_user ON study_participants(user_id,room_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS study_messages (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,room_id TEXT NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,body TEXT NOT NULL,created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_messages_room ON study_messages(room_id,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS study_reports (id TEXT PRIMARY KEY NOT NULL,reporter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,room_id TEXT REFERENCES study_rooms(id) ON DELETE SET NULL,message_id INTEGER REFERENCES study_messages(id) ON DELETE SET NULL,target_kind TEXT NOT NULL,target_author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,room_title_snapshot TEXT NOT NULL,body_snapshot TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_reports_status ON study_reports(status,created,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS study_limits (user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,bucket TEXT NOT NULL,period_start INTEGER NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(user_id,bucket));
