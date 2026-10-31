-- Migration 029: In-app notification history + delivery preferences.
-- Telegram is being retired; every worker now calls utils/notify.notify(),
-- which writes a row here (the Inbox history), then sends a push.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    kind TEXT NOT NULL,                 -- e.g. calendar, pacing, briefing, goals, system
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    deep_link TEXT,                     -- in-app route, e.g. /calendar or /inbox
    dedupe_key TEXT,                    -- same key within 24h is sent once
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    push_status TEXT,                   -- sent | skipped_prefs | skipped_quiet | no_devices | failed
    pushed_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
ON notifications (user_id, dedupe_key, created_at DESC)
WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id UUID PRIMARY KEY,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- {"calendar": true, "pacing": false, ...}; missing kinds default to enabled.
    kinds JSONB NOT NULL DEFAULT '{}'::jsonb,
    quiet_start TIME,                   -- local time, e.g. 22:00
    quiet_end TIME,                     -- local time, e.g. 07:00
    timezone TEXT NOT NULL DEFAULT 'UTC',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- device_push_tokens: remember when Expo reported a token as dead.
ALTER TABLE device_push_tokens ADD COLUMN IF NOT EXISTS invalid_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "own notifications" ON notifications
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "own notification prefs" ON notification_prefs
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
