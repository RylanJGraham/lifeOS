-- 009: goals + goal_checkins tables for the AI Goals feature
-- The Goals chat theorycrafts goals with the user and creates/updates/deletes/
-- checks-in goals from the conversation. Run in the Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS / duplicate_object guards everywhere).

CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'personal',          -- financial | habit | personal
    status TEXT DEFAULT 'active',              -- active | achieved | abandoned
    description TEXT,
    target_value NUMERIC,
    current_value NUMERIC DEFAULT 0,
    unit TEXT,
    currency TEXT,
    deadline DATE,
    linked_metric TEXT,                        -- null | net_worth | bank_balance | portfolio_value
    plan JSONB DEFAULT '[]'::jsonb,            -- milestones: [{label, value?, date?, done}]
    checkin_cadence TEXT,                      -- null | daily | weekly
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    user_id UUID,
    note TEXT,
    value NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS goals_user_status_idx ON goals (user_id, status);
CREATE INDEX IF NOT EXISTS goal_checkins_goal_created_idx ON goal_checkins (goal_id, created_at DESC);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_checkins ENABLE ROW LEVEL SECURITY;

-- Single-user app: same policy shape as migration 006 — the authenticated
-- frontend client gets full access; the backend uses the service key anyway.
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON goals
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON goal_checkins
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
