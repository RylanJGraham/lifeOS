-- Migration 024: Device push tokens for the native iOS app
-- Lets the mobile app register an Expo push token so workers can send
-- notifications (pipeline failures, daily reports, goal check-ins) instead of
-- only Telegram. One row per installed device (a user may have several).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS device_push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    expo_push_token TEXT NOT NULL,
    platform TEXT DEFAULT 'ios',
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_push_tokens_token
ON device_push_tokens (expo_push_token);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "authenticated full access"
    ON device_push_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
