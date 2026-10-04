CREATE TABLE IF NOT EXISTS question_likes (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 created INTEGER NOT NULL,
 PRIMARY KEY(post_id,user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS question_likes_user ON question_likes(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS answer_likes (
 answer_id TEXT NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 created INTEGER NOT NULL,
 PRIMARY KEY(answer_id,user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS answer_likes_user ON answer_likes(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reaction_write_limits (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 window_start INTEGER NOT NULL,
 total INTEGER NOT NULL
);
