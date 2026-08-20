-- Migration: Conviction tracking on advisor_watchlist
-- Adds multi-week conviction scoring so the research bot can compound or
-- descale interest in watchlist candidates over time (see docs/research-bot-command.md).
-- Run in Supabase SQL editor or psql connected to your DB.
-- No new RLS needed: columns inherit the table's existing policies
-- (006-rls-authenticated-lockdown.sql).

ALTER TABLE advisor_watchlist
ADD COLUMN IF NOT EXISTS conviction_score numeric(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS conviction_history jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS tracking_since timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS interest_state text DEFAULT 'scouting',
ADD COLUMN IF NOT EXISTS thesis text;

CREATE INDEX IF NOT EXISTS idx_advisor_watchlist_user_conviction
ON advisor_watchlist (user_id, conviction_score DESC);
