-- Migration 036: record how many transactions a statement upload produced, so the app can show
-- "50 imported, 1 duplicate skipped" once the (background) import finishes.
ALTER TABLE statement_uploads ADD COLUMN IF NOT EXISTS transactions_inserted INTEGER;
ALTER TABLE statement_uploads ADD COLUMN IF NOT EXISTS transactions_skipped INTEGER;
