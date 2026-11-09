-- Your own categories (e.g. "Fine motor", "Handwriting"): the AI files every note into the ones that fit.
-- owner_key is the user id, or '' for the owner (same convention as mention_done).
CREATE TABLE IF NOT EXISTS category (owner_key TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (owner_key, name));
-- Bumped whenever someone changes their categories; a note whose cat_version differs gets re-sorted.
CREATE TABLE IF NOT EXISTS category_set (owner_key TEXT PRIMARY KEY, version INTEGER NOT NULL);
-- source 'ai' rows are replaced on every re-sort; 'manual' rows (the person ticked or unticked it
-- themselves, state 1/0) are never overwritten by the AI.
CREATE TABLE IF NOT EXISTS note_category (note_id TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL, state INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (note_id, name));
ALTER TABLE note ADD COLUMN cat_version INTEGER;
