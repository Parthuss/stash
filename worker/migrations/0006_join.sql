-- Failed /join attempts, so an invite code can't be brute-forced.
CREATE TABLE IF NOT EXISTS join_attempt (ip TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS join_attempt_ip ON join_attempt(ip, at);
ALTER TABLE user ADD COLUMN joined_via TEXT;   -- 'invite' | 'admin' (informational)
