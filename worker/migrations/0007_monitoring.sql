-- Monitoring: when did each person last do anything, and don't spam alerts.
ALTER TABLE user ADD COLUMN last_seen TEXT;
CREATE TABLE IF NOT EXISTS alert_state (key TEXT PRIMARY KEY, at TEXT NOT NULL);
