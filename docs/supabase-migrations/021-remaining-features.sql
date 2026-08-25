-- Migration 021: Remaining overhaul features
-- - planned meals flag
-- - options metadata on advisor_positions
-- - onboarding progress on user_profiles
-- - supplement policy confirmed (already present as TEXT/JSONB)

-- Planned meals
ALTER TABLE meals ADD COLUMN IF NOT EXISTS planned BOOLEAN DEFAULT FALSE;

-- Options / derivatives metadata for advisor_positions
ALTER TABLE advisor_positions ADD COLUMN IF NOT EXISTS options JSONB DEFAULT NULL;

-- Onboarding checklist progress
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding JSONB DEFAULT NULL;

-- Ensure RLS policies exist (idempotent)
DO $$
BEGIN
    CREATE POLICY "authenticated full access" ON meals FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "authenticated full access" ON advisor_positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "authenticated full access" ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
