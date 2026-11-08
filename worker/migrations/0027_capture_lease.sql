-- Each claim gets a fresh lease id. /complete and /note carry it back, so a processor that lost its
-- claim (stale, reclaimed by another runner) can't overwrite newer work. Older processors that send
-- no lease still work; they just aren't fenced.
ALTER TABLE capture ADD COLUMN lease TEXT;
