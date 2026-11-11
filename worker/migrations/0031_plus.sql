-- Skwirl Plus (Dodo Payments). A user is on Plus while plan='plus' AND plan_until is in the future.
ALTER TABLE user ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE user ADD COLUMN plan_until TEXT;
ALTER TABLE user ADD COLUMN dodo_customer_id TEXT;
ALTER TABLE user ADD COLUMN dodo_subscription_id TEXT;
CREATE INDEX idx_user_plus ON user(plan_until) WHERE plan = 'plus';
CREATE TABLE webhook_seen (id TEXT PRIMARY KEY, at TEXT NOT NULL);
