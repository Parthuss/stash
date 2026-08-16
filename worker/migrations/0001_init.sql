-- The capture contract. Every ingest adapter — share-sheet shortcut, Instagram
-- DM webhook, data-export backfill — writes rows of exactly this shape, which is
-- what lets a new capture route be added without the pipeline downstream
-- knowing anything changed.
--
-- Mirrors the `capture` table in stash/db.py. Keep the two in step.

CREATE TABLE IF NOT EXISTS capture (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,                    -- shortcut | ig_dm | backfill | cli
  permalink    TEXT,                             -- NULL is legal: DM shares often omit it
  permalink_ok INTEGER NOT NULL DEFAULT 1,       -- 0 when derived from a media id
  media_url    TEXT,                             -- expiring CDN URL
  media_key    TEXT,                             -- R2 key once stashed
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | done | failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  captured_at  TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS capture_status ON capture(status, captured_at);

-- Re-sharing something already saved is a normal accident, so the write path
-- treats a repeat permalink as a no-op rather than an error.
CREATE UNIQUE INDEX IF NOT EXISTS capture_permalink
  ON capture(permalink) WHERE permalink IS NOT NULL;
