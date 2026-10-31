-- Migration 033: Import external calendars (Outlook/Google/Apple "published" ICS links).
-- LifeOS polls each subscription and stores the events as read-only rows in
-- calendar_events (source = 'import', subscription_id set). Recurring events are
-- expanded into individual rows for a rolling window at sync time.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS calendar_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,                  -- secret: a published-calendar link grants read access
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_user ON calendar_subscriptions (user_id);

-- RLS on with no policies: only the backend (service role) can read the URLs.
ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS subscription_id UUID
    REFERENCES calendar_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_uid TEXT;

-- One row per (subscription, UID|start). NULLs (manual events) never collide.
DO $$
BEGIN
    ALTER TABLE calendar_events
        ADD CONSTRAINT calendar_events_subscription_uid_key UNIQUE (subscription_id, external_uid);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
