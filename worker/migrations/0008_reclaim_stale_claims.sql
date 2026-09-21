-- A worker that dies mid-capture (Mac sleeps, runner times out) leaves the row
-- 'claimed' forever. Stamp claims so a stale one can be handed out again.
ALTER TABLE capture ADD COLUMN claimed_at TEXT;
