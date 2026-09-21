-- Who called what, when. kind='groq' rows are paid AI calls (attributed to the
-- person whose save caused them, with which key), kind='api' rows are actions a
-- person took in the app or through Claude. Small and append-only.
CREATE TABLE IF NOT EXISTS usage_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT,                -- NULL = owner
  kind TEXT NOT NULL,          -- groq | api
  action TEXT NOT NULL,        -- groq: chat|whisper   api: ingest|search|open|mcp:<tool>|join|...
  model TEXT,
  key_type TEXT,               -- shared | own (groq only)
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  seconds REAL NOT NULL DEFAULT 0,
  capture_id TEXT
);
CREATE INDEX IF NOT EXISTS usage_at ON usage_event(at);
CREATE INDEX IF NOT EXISTS usage_user ON usage_event(user_id, at);
