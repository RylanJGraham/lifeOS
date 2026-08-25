-- Migration: Sync manual trades with advisor positions
-- Ensures trades logged via Telegram/web chat flow into the dashboard
-- and can be picked up by Jarvis v3 when it sources positions from Supabase.

-- 1. Ensure advisor_purchases has every column the LifeOS chat handler needs.
ALTER TABLE advisor_purchases
ADD COLUMN IF NOT EXISTS user_id UUID,
ADD COLUMN IF NOT EXISTS symbol VARCHAR(20),
ADD COLUMN IF NOT EXISTS action VARCHAR(20),
ADD COLUMN IF NOT EXISTS quantity NUMERIC,
ADD COLUMN IF NOT EXISTS price NUMERIC,
ADD COLUMN IF NOT EXISTS total_cost NUMERIC,
ADD COLUMN IF NOT EXISTS direction VARCHAR(10),
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS fees NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Backfill executed_at for existing rows so the dashboard never shows nulls.
UPDATE advisor_purchases
SET executed_at = COALESCE(created_at, NOW())
WHERE executed_at IS NULL;

-- 3. Helpful indexes for the dashboard and trade processing.
CREATE INDEX IF NOT EXISTS idx_advisor_purchases_user_symbol
ON advisor_purchases (user_id, symbol, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_advisor_purchases_processed
ON advisor_purchases (processed)
WHERE processed = FALSE;

-- 4. Compatibility view: the frontend currently reads advisor_purchase_history.
--    Drop first because CREATE OR REPLACE VIEW cannot remove columns.
DROP VIEW IF EXISTS advisor_purchase_history;
CREATE VIEW advisor_purchase_history AS
SELECT
    id,
    user_id,
    symbol,
    action,
    quantity,
    price,
    total_cost,
    direction,
    reason,
    fees,
    currency,
    processed,
    executed_at,
    created_at
FROM advisor_purchases;

-- 5. Add a source column to advisor_positions so Jarvis v3 can distinguish
--    positions it wrote from manual positions written by LifeOS.
ALTER TABLE advisor_positions
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'jarvis';

-- 6. Add status index if missing (Jarvis dedup key is (user_id, symbol, status)).
CREATE INDEX IF NOT EXISTS idx_advisor_positions_user_symbol_status
ON advisor_positions (user_id, symbol, status);

-- 7. Add a manual trades flag to transactions for investment-related spend.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS linked_trade_id UUID REFERENCES advisor_purchases(id) ON DELETE SET NULL;

-- Note: run this in the Supabase SQL editor. The service role key bypasses RLS.
