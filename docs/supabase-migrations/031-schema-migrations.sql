-- Migration 031: Track which migrations have been applied.
-- Maintained by scripts/migrate.py. Migrations 001-028 are recorded by
-- `python scripts/migrate.py --baseline 28` on a database that already has them.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,           -- e.g. '029-notifications'
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
