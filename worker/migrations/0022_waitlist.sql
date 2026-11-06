-- "Skwirl Plus, coming soon": who'd pay, from where, at what price they were shown.
CREATE TABLE IF NOT EXISTS waitlist (
  at       TEXT NOT NULL,
  user_id  TEXT,
  visitor  TEXT,
  email    TEXT,
  country  TEXT,
  price    TEXT,
  place    TEXT          -- where they tapped: pricing | setup
);
CREATE INDEX IF NOT EXISTS waitlist_at ON waitlist(at);
