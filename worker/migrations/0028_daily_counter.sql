-- Daily counters for durable budgets (e.g. "analytics:2026-11-09" = rows analytics wrote today).
-- The in-memory per-IP throttle resets with every Worker isolate; this one doesn't.
CREATE TABLE IF NOT EXISTS daily_counter (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
