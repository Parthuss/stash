-- One-off notifications queued for later (e.g. 9am in the user's timezone); the 30-min cron sends them.
CREATE TABLE IF NOT EXISTS scheduled_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  send_at TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  url TEXT,
  sent_at TEXT
);
