-- Migration 035: Lock every data table to the owner's login.
--
-- Before: 35 tables had "authenticated full access" (USING true), so ANY user who signed up
-- to the project could read/write everything, and company_rsus / chat_modes had policies for
-- the `public` role, i.e. no login at all. This replaces them with one owner-only policy.
--
-- The owner is this project's single Supabase Auth user. The Python backend uses the service
-- key, which bypasses RLS, so it is unaffected. If you ever add a second user, add them here.
-- NEW TABLES: use this same policy (or a user_id = auth.uid() policy) — never `USING (true)`.

DO $$
DECLARE
    owner_uid CONSTANT uuid := '05e6b4ff-eb88-44ac-a43f-463db3ffde08';
    t TEXT;
BEGIN
    FOR t IN
        SELECT DISTINCT tablename FROM pg_policies
        WHERE schemaname = 'public'
          AND (policyname = 'authenticated full access' OR roles::text LIKE '%public%')
    LOOP
        -- Drop every policy that grants wide access (named above or open to `public`).
        EXECUTE (
            SELECT COALESCE(string_agg(format('DROP POLICY %I ON public.%I;', policyname, tablename), ' '), '')
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND (policyname = 'authenticated full access' OR roles::text LIKE '%public%')
        );
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "owner only" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "owner only" ON public.%I FOR ALL TO authenticated '
            'USING (auth.uid() = %L::uuid) WITH CHECK (auth.uid() = %L::uuid)',
            t, owner_uid, owner_uid
        );
    END LOOP;
END $$;
