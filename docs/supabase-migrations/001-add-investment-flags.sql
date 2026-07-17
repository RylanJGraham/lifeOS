-- Migration: Add investment flags and notification marker to transactions
-- Run in Supabase SQL editor or psql connected to your DB

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_investment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ticker VARCHAR(20),
ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_transactions_notified ON transactions(notified);
CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);

-- Optional: backfill heuristic for past rows (uncomment to run)
-- UPDATE transactions
-- SET is_investment = TRUE
-- WHERE category ILIKE '%investment%'
--    OR merchant_name ILIKE '%vanguard%'
--    OR merchant_name ILIKE '%robinhood%'
--    OR notes ILIKE '%VOO%'
--    OR notes ILIKE '%buy%';
