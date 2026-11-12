-- Traditional accounts: email + a 6-digit emailed code, or Google. Accounts stay keyed by id;
-- email is how you find yours again. Emails are stored trimmed and lowercased.
UPDATE user SET email = lower(trim(email)) WHERE email IS NOT NULL;
UPDATE user SET email = NULL WHERE email = '';
ALTER TABLE user ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;  -- 1 once a code or Google proved it
ALTER TABLE user ADD COLUMN google_sub TEXT;                            -- Google's stable account id
ALTER TABLE user ADD COLUMN email_skip_at TEXT;                         -- "Add your email" skipped once (then it's required)
CREATE INDEX IF NOT EXISTS user_email ON user(email);
-- One verified owner per address; unverified duplicates can exist (typed, never proven).
CREATE UNIQUE INDEX IF NOT EXISTS user_email_verified ON user(email) WHERE email_verified = 1;
CREATE UNIQUE INDEX IF NOT EXISTS user_google_sub ON user(google_sub) WHERE google_sub IS NOT NULL;

-- One live code per address (a new request replaces the old one). Keyed by a hash of the address,
-- the code itself is an HMAC (6 digits are too few for a plain hash). user_id is set when the code
-- verifies an address for a signed-in account ("Add your email"), NULL for sign-in / sign-up.
CREATE TABLE IF NOT EXISTS email_code (
  email_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,           -- 'signin' | 'add'
  user_id TEXT,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email_hash, purpose)
);
