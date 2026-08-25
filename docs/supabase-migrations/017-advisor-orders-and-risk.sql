-- Migration: Advisor orders, fills, and risk policy
-- Enables an in-dashboard order workflow without broker integration.

-- 1. Order recommendations from Jarvis / manual user input.
CREATE TABLE IF NOT EXISTS advisor_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('BUY','SELL','ADD','TRIM')),
    order_type VARCHAR(20) NOT NULL DEFAULT 'LIMIT' CHECK (order_type IN ('MARKET','LIMIT','STOP','STOP_LIMIT','TRAILING_STOP')),
    quantity NUMERIC NOT NULL,
    limit_price NUMERIC,
    stop_price NUMERIC,
    trailing_pct NUMERIC,
    tif VARCHAR(10) DEFAULT 'DAY' CHECK (tif IN ('DAY','GTC','IOC','FOK')),
    currency VARCHAR(3) DEFAULT 'USD',
    rationale TEXT,
    confidence NUMERIC,
    source VARCHAR(20) DEFAULT 'jarvis' CHECK (source IN ('jarvis','manual')),
    status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','sent','filled','cancelled','expired')),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    cycle_id VARCHAR(50),
    linked_signal_id UUID REFERENCES advisor_signals(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_orders_user_status
ON advisor_orders (user_id, status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_advisor_orders_user_symbol
ON advisor_orders (user_id, symbol);

-- 2. Broker fills (manual entry or IBKR Flex Query sync).
CREATE TABLE IF NOT EXISTS advisor_order_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES advisor_orders(id) ON DELETE CASCADE,
    fill_qty NUMERIC NOT NULL,
    fill_price NUMERIC NOT NULL,
    fees NUMERIC DEFAULT 0,
    filled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    broker_order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_order_fills_order
ON advisor_order_fills (order_id);

-- 3. Risk policy stored on user profile (JSONB for flexibility).
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS risk_policy JSONB DEFAULT '{
    "max_position_pct": 15,
    "max_sector_pct": 40,
    "min_cash_pct": 5,
    "daily_loss_guardrail_pct": 5,
    "approval_threshold_usd": 1000
}'::jsonb;

-- 4. RLS policies for authenticated access.
ALTER TABLE advisor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_order_fills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON advisor_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON advisor_order_fills FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
