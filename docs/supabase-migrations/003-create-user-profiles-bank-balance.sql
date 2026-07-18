-- 003: create the missing user_profiles table + bank balance tracking
-- The table was documented in supabase-schema.sql but never created in the live DB.
-- Run in the Supabase SQL editor or via psycopg2. Safe to re-run.

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    height_cm NUMERIC,
    current_weight_kg NUMERIC,
    target_weight_kg NUMERIC,
    daily_caloric_target INTEGER,
    base_salary NUMERIC,
    target_savings_rate NUMERIC,
    expected_yield NUMERIC,
    strict_macros BOOLEAN DEFAULT false,
    dynamic_budget BOOLEAN DEFAULT false,
    bank_balance NUMERIC,                        -- last known bank balance
    bank_balance_updated_at TIMESTAMP WITH TIME ZONE, -- when bank_balance was set
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON user_profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public insert access" ON user_profiles FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public update access" ON user_profiles FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the single-user row (zero UUID is the app's default user)
INSERT INTO user_profiles (user_id, bank_balance, bank_balance_updated_at)
SELECT '00000000-0000-0000-0000-000000000000', 2068, NOW()
WHERE NOT EXISTS (SELECT 1 FROM user_profiles LIMIT 1);
