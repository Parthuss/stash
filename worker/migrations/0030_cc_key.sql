-- One Claude Code key per person: lets the Skwirl plugin search their saves (connector + recall hook)
-- and nothing else. Separate from the sign-in token so it can be revoked on its own.
CREATE TABLE cc_key (
  user_key   TEXT PRIMARY KEY,
  key_hash   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
