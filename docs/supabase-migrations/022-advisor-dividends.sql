-- Migration 022: Dividend tracking refinements + option/derivatives metadata support
-- Adds ex_date/record_date to advisor_dividends, a deduplication index, and ensures
-- advisor_positions has an options JSONB column for option Greeks/metadata.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Dividend records (idempotent with migration 019 which already created the core table)
CREATE TABLE IF NOT EXISTS advisor_dividends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    symbol TEXT NOT NULL,
    dividend_date DATE,
    amount NUMERIC NOT NULL,
    currency TEXT,
    source TEXT DEFAULT 'ibkr',
    ex_date DATE,
    record_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backwards-compatible additive columns if the table already existed without them.
ALTER TABLE advisor_dividends
    ADD COLUMN IF NOT EXISTS ex_date DATE,
    ADD COLUMN IF NOT EXISTS record_date DATE;

-- Index used by the IBKR worker for fast duplicate checks.
CREATE INDEX IF NOT EXISTS idx_advisor_dividends_dedup
ON advisor_dividends (user_id, symbol, dividend_date, amount);

ALTER TABLE advisor_dividends ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "authenticated full access"
    ON advisor_dividends FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure positions can store option/derivatives metadata.
ALTER TABLE advisor_positions ADD COLUMN IF NOT EXISTS options JSONB;
