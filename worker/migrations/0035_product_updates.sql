-- Product-update emails (src/broadcast.ts). Opt-in only: every existing account starts NOT opted in.
ALTER TABLE user ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;   -- 1 = ticked "Product updates"
ALTER TABLE user ADD COLUMN marketing_opt_in_at TEXT;                      -- when the current answer was given
ALTER TABLE user ADD COLUMN marketing_opt_in_source TEXT;                  -- signup | signup_google | profile | unsubscribe_link | one_click | unsubscribe_undo
-- Every change of answer, for proof of consent. Deleted with the account.
CREATE TABLE IF NOT EXISTS email_consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  opt_in INTEGER NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_consent_log_user ON email_consent_log(user_id);
-- The owner's drafts. sent_at is set (atomically) when a broadcast starts; sent drafts can't change.
CREATE TABLE IF NOT EXISTS email_draft (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  hero TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  button_text TEXT NOT NULL DEFAULT '',
  button_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);
-- One row per broadcast: who sent it, when, to how many.
CREATE TABLE IF NOT EXISTS email_broadcast (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  audience INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
-- One row per email (broadcast recipients and owner tests), with the provider's message id.
-- No addresses stored; user_id is cleared when an account is deleted.
CREATE TABLE IF NOT EXISTS email_send (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- 'broadcast' | 'test'
  broadcast_id TEXT,
  user_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL,            -- 'sent' | 'failed'
  error TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_send_at ON email_send(at);
CREATE INDEX IF NOT EXISTS email_send_broadcast ON email_send(broadcast_id);
-- Small owner settings: 'postal' = the sender/contact line every update carries.
CREATE TABLE IF NOT EXISTS email_setting (k TEXT PRIMARY KEY, v TEXT NOT NULL);

-- The first draft, unsent.
INSERT OR IGNORE INTO email_draft (id, subject, hero, body, button_text, button_url, created_at, updated_at) VALUES (
  'plus-live',
  'Skwirl Plus is live (free stays free)',
  'Skwirl Plus is live',
  'Hi {name},

Quick one: Skwirl now has a paid plan, Skwirl Plus. You don''t need it. The free plan stays, and your saves and notes don''t change.

Here''s the honest difference:

- **Free:** 10 new saves a month, plus your 25 latest Instagram saves brought in.
- **Plus:** up to 250 saves a month, read first in line, up to 2,000 Instagram saves brought in, and your own categories.

Plus is $4.99 a month or $39 a year, with prices shown in your currency. Cancel any time.

Joined before 11 November? Your account keeps the free setup it started with.

If free covers what you save, stay on free. If you save more than 10 reels a month, Plus is there when you want it.

Thanks for using Skwirl. Questions or ideas? Use Contact us in your Skwirl profile. I read every message.

Parth',
  'See what''s in Plus',
  'https://skwirl.app/#pricing',
  '2026-11-13T00:00:00.000Z',
  '2026-11-13T00:00:00.000Z'
);
