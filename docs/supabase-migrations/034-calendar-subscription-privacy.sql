-- Migration 034: Per-subscription privacy for imported calendars.
--   'full'  = store title/location/notes as published
--   'busy'  = store only that you are busy (title becomes "Busy"; location/notes dropped)
-- The subscription URL column now holds an encrypted value ("enc:v1:...") written by the
-- backend (see src/utils/secrets.py); the key never leaves the server.

ALTER TABLE calendar_subscriptions ADD COLUMN IF NOT EXISTS privacy TEXT NOT NULL DEFAULT 'full';

DO $$
BEGIN
    ALTER TABLE calendar_subscriptions
        ADD CONSTRAINT calendar_subscriptions_privacy_check CHECK (privacy IN ('full', 'busy'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
