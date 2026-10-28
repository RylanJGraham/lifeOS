-- Add priority to goals so the app can tier free-fund allocation.
ALTER TABLE IF EXISTS goals ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN goals.priority IS 'Higher number = higher priority (1-5). Used to rank financial goals for free-fund allocation.';
