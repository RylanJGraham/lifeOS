-- Migration 028: Add metadata column to ai_insights for actionable UI payloads.
-- Enables yes/no check-ins, deep links, and other structured actions from the Inbox.

ALTER TABLE ai_insights
ADD COLUMN IF NOT EXISTS metadata JSONB;
