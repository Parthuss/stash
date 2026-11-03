-- Meaning-based search: one embedding per note (Workers AI bge-m3, multilingual), L2-normalised and
-- stored as int8 (1 KB a note). user_key matches note_fts: the user id, or '' for the owner.
CREATE TABLE IF NOT EXISTS note_vec (
  note_id  TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  vec      BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS note_vec_user ON note_vec(user_key);
