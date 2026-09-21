-- Instrumentation for the pilot's go/no-go: are people saving, and do they come
-- back? `opens` counts reads of a note's full text (app or Claude), `used_at`
-- (already there) counts acts of use, `mcp_calls` says who connected Claude.
ALTER TABLE note ADD COLUMN opens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN mcp_calls INTEGER NOT NULL DEFAULT 0;
