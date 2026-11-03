-- Save by Telegram: a chat is linked to a Skwirl account through a one-time /start code.
-- user_key is a user id, or '__owner__' for the owner.
CREATE TABLE IF NOT EXISTS telegram_chat (
  chat_id  TEXT PRIMARY KEY,
  user_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_chat_user ON telegram_chat(user_key);
CREATE TABLE IF NOT EXISTS telegram_link (
  code_hash  TEXT PRIMARY KEY,
  user_key   TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
