-- Migration 032: Secret tokens for the subscribable iCal feed.
-- Calendar apps cannot send an Authorization header, so the feed URL itself
-- carries a random token (/calendar/feed/<token>.ics). Rotating the token
-- (POST /api/calendar/feed/rotate) revokes the old URL.

CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
    user_id UUID PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RLS on with no policy: only the backend (service role) reads/writes tokens.
ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
