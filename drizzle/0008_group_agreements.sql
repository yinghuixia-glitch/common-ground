CREATE TABLE IF NOT EXISTS group_agreements (id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,sheet_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS group_agreement_members (group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,confirmed_revision INTEGER,joined INTEGER NOT NULL,PRIMARY KEY(group_id,user_id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_members_user ON group_agreement_members(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS group_agreement_versions (group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,revision INTEGER NOT NULL,sheet_json TEXT NOT NULL,author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,created INTEGER NOT NULL,PRIMARY KEY(group_id,revision));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS group_agreement_invites (id TEXT PRIMARY KEY NOT NULL,group_id TEXT NOT NULL REFERENCES group_agreements(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_agreement_invites_token_hash_unique ON group_agreement_invites(token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agreement_invites_group ON group_agreement_invites(group_id,expires);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS group_agreement_write_limits (user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,window_start INTEGER NOT NULL,total INTEGER NOT NULL);
