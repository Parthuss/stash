-- First-party product analytics (no third party). A visitor is a random id kept on the device;
-- a visit is one sitting (new after 30 min idle). Events are screens, clicks and actions: never
-- typed text, search words or note content. Pruned after 180 days.
CREATE TABLE IF NOT EXISTS visit (
  id         TEXT PRIMARY KEY,
  visitor    TEXT NOT NULL,
  user_id    TEXT,                 -- set once signed in
  owner      INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  last_at    TEXT NOT NULL,
  active_ms  INTEGER NOT NULL DEFAULT 0,
  events     INTEGER NOT NULL DEFAULT 0,
  country    TEXT, device TEXT, os TEXT, browser TEXT,
  referrer   TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  landing    TEXT, screen TEXT, lang TEXT, tz TEXT, installed INTEGER
);
CREATE INDEX IF NOT EXISTS visit_started ON visit(started_at);
CREATE INDEX IF NOT EXISTS visit_visitor ON visit(visitor);
CREATE INDEX IF NOT EXISTS visit_user ON visit(user_id);
CREATE TABLE IF NOT EXISTS ui_event (
  visit_id TEXT NOT NULL,
  at       TEXT NOT NULL,
  name     TEXT NOT NULL,
  detail   TEXT
);
CREATE INDEX IF NOT EXISTS ui_event_visit ON ui_event(visit_id, at);
CREATE INDEX IF NOT EXISTS ui_event_at ON ui_event(at);
