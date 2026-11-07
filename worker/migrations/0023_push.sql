-- Web Push subscriptions: one row per device that turned notifications on.
CREATE TABLE IF NOT EXISTS push_sub (
  endpoint     TEXT PRIMARY KEY,
  user_id      TEXT,              -- NULL = the owner
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS push_sub_user ON push_sub(user_id);
