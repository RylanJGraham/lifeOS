-- 006: RLS lockdown — replaces all public/own-row policies with
-- authenticated-only access on every data table (applied 2026-07-18).
-- The frontend must now be signed in (Supabase Auth) to read/write anything.
-- Backend pipelines are unaffected (service key bypasses RLS).

-- Drop every existing policy in public:
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Recreate one authenticated policy per table:
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workouts','system_logs','meals','transactions','health_metrics','known_items',
    'exercise_muscles','user_profiles','workout_templates','workout_template_exercises',
    'memories','automations','portfolio_holdings','ai_insights',
    'advisor_daily_reports','advisor_portfolio_snapshots','advisor_position_history',
    'advisor_positions','advisor_purchases','advisor_signals','advisor_watchlist'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
