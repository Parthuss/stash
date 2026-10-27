-- Public share links for a note: /n/<share_id>. NULL = not shared. 128 random
-- bits, so a share link is a capability URL; unsharing sets it back to NULL.
ALTER TABLE note ADD COLUMN share_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS note_share ON note(share_id) WHERE share_id IS NOT NULL;
