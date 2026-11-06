-- /claim counts today's claims; without this it scanned every capture per poll.
CREATE INDEX IF NOT EXISTS capture_claimed ON capture(claimed_at);
