-- Multi-user. Existing rows have user_id NULL, which means "the owner" (the
-- holder of STASH_SECRET); new users get a row in `user` and a bearer token.
-- Only the SHA-256 of a token is stored, so a D1 leak does not leak sessions.
CREATE TABLE IF NOT EXISTS user (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

ALTER TABLE capture ADD COLUMN user_id TEXT;

-- Two people saving the same reel is normal, so uniqueness is per user.
DROP INDEX IF EXISTS capture_permalink;
CREATE UNIQUE INDEX IF NOT EXISTS capture_user_permalink
  ON capture(COALESCE(user_id, ''), permalink) WHERE permalink IS NOT NULL;

-- Notes live here too (not only in the owner's vault/) so the web library and
-- the Claude connector can read any user's notes without touching the Mac.
CREATE TABLE IF NOT EXISTS note (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,                               -- NULL = owner
  capture_id TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT,
  topic      TEXT,
  tools      TEXT,                               -- JSON array
  permalink  TEXT,
  status     TEXT NOT NULL DEFAULT 'unused',     -- unused | used
  markdown   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS note_user ON note(user_id, created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  title, summary, markdown, note_id UNINDEXED, user_id UNINDEXED
);
