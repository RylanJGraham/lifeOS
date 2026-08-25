-- Migration 019: Dividend tracking, goal impact links, and investment asset classes
-- Adds tables/columns needed for the next LifeOS upgrade batch.

-- 1. Dividend records from IBKR cash transactions (and manual entries).
CREATE TABLE IF NOT EXISTS advisor_dividends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    dividend_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    source VARCHAR(20) DEFAULT 'ibkr' CHECK (source IN ('ibkr','manual')),
    raw_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, symbol, dividend_date, amount, source)
);

CREATE INDEX IF NOT EXISTS idx_advisor_dividends_user_symbol
ON advisor_dividends (user_id, symbol, dividend_date DESC);

ALTER TABLE advisor_dividends ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON advisor_dividends FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Cross-goal impact links (e.g., habit "no impulse buys" -> savings-rate goal).
CREATE TABLE IF NOT EXISTS goal_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    source_goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    target_goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    link_type VARCHAR(30) NOT NULL DEFAULT 'influences' CHECK (link_type IN ('influences','supports','conflicts')),
    weight NUMERIC DEFAULT 1.0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, source_goal_id, target_goal_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_links_user_source
ON goal_links (user_id, source_goal_id);

ALTER TABLE goal_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON goal_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Asset class column on positions for options / crypto handling.
ALTER TABLE advisor_positions
ADD COLUMN IF NOT EXISTS asset_class VARCHAR(30) DEFAULT 'equity'
    CHECK (asset_class IN ('equity','option','crypto','etf','bond','cash','other'));

-- 4. Telegram webhook health snapshot.
CREATE TABLE IF NOT EXISTS telegram_webhook_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    webhook_url TEXT,
    last_update_at TIMESTAMP WITH TIME ZONE,
    last_update_id BIGINT,
    pending_update_count INTEGER,
    status VARCHAR(20) DEFAULT 'unknown',
    error TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE telegram_webhook_health ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON telegram_webhook_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. PDF statement uploads for drag-and-drop ingestion.
CREATE TABLE IF NOT EXISTS statement_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    file_name TEXT,
    file_size_bytes INTEGER,
    mime_type VARCHAR(50),
    storage_path TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
    error TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE statement_uploads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON statement_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
