-- Migration 030: Calendar events.
-- Stores user-created events. Derived events (goal deadlines, RSU vests) are
-- NOT stored; calendar_service merges them in when listing.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    location TEXT,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    kind TEXT NOT NULL DEFAULT 'event'
        CHECK (kind IN ('event','appointment','bill','reminder','workout','other')),
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual','chat','import')),
    recurrence TEXT NOT NULL DEFAULT 'none'
        CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
    recurrence_until DATE,
    reminder_offsets INTEGER[] NOT NULL DEFAULT '{30}',   -- minutes before start
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
ON calendar_events (user_id, starts_at);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "own calendar events" ON calendar_events
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
