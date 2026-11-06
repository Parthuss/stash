-- The library polls /v1/captures per user; without this it scanned all of that user's captures.
CREATE INDEX IF NOT EXISTS capture_user_status ON capture(user_id, source, status);
