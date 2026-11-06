-- Getting back in without the sign-in link: one-time codes (emailed, or sent by the Telegram bot)
-- that mint an extra device token, so the original link and the phone Shortcut keep working.
CREATE TABLE IF NOT EXISTS login_code (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS device_token (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS device_token_user ON device_token(user_id);
-- Weekly "saves you haven't used" on Telegram; /digest off turns it off.
ALTER TABLE telegram_chat ADD COLUMN digest INTEGER NOT NULL DEFAULT 1;
