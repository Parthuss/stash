-- Card cover images. Served at /t/<id> without auth so an <img> tag can load
-- it (img can't send a bearer token); the id is 128 random bits, so it's a
-- capability URL, not a guessable one. Thumbs are of public posts.
CREATE TABLE IF NOT EXISTS thumb (
  id      TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  data    TEXT NOT NULL          -- base64 JPEG, capped at ~150KB raw
);
ALTER TABLE note ADD COLUMN thumb_id TEXT;

-- Lists: which books/movies/places a person has marked done (read, watched,
-- visited). owner_key is user_id, or '' for the owner, so the PK stays unique
-- (SQLite treats NULLs in a primary key as distinct).
CREATE TABLE IF NOT EXISTS mention_done (
  owner_key TEXT NOT NULL,
  mkey      TEXT NOT NULL,     -- "<type>:<lowercased name>"
  at        TEXT NOT NULL,
  PRIMARY KEY (owner_key, mkey)
);
