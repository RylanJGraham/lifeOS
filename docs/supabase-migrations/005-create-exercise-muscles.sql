-- 005: exercise_muscles — learned exercise → muscle-group dictionary.
-- The agent resolves unknown exercises once (heuristics/LLM) and caches them
-- here; the frontend muscle map joins workouts against this table too.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS exercise_muscles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    exercise_name TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    source TEXT DEFAULT 'llm',           -- 'template' | 'heuristic' | 'llm' | 'manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, exercise_name)
);

ALTER TABLE exercise_muscles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON exercise_muscles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public insert access" ON exercise_muscles FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public update access" ON exercise_muscles FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed from the (now corrected) template exercise groups
INSERT INTO exercise_muscles (user_id, exercise_name, muscle_group, source)
SELECT t.user_id, e.exercise_name, e.muscle_group, 'template'
FROM workout_template_exercises e
JOIN workout_templates t ON t.id = e.template_id
WHERE e.muscle_group IS NOT NULL
ON CONFLICT (user_id, exercise_name) DO NOTHING;
