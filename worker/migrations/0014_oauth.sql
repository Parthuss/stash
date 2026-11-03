-- OAuth 2.1 for the MCP connector, so any AI app (ChatGPT, Claude, ...) can connect with
-- "sign in, tap Allow" instead of a secret URL. Only hashes of codes and tokens are stored.
-- user_key is a user id, or '__owner__' for the STASH_SECRET holder (never NULL, so a
-- missing value can't quietly mean "owner").
CREATE TABLE IF NOT EXISTS oauth_client (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  redirect_uris TEXT NOT NULL,          -- JSON array
  secret_hash   TEXT,                   -- NULL for public (PKCE-only) clients
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_code (
  code_hash    TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  user_key     TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge    TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_token (
  token_hash TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,             -- access | refresh
  client_id  TEXT NOT NULL,
  user_key   TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_token_user ON oauth_token(user_key);
