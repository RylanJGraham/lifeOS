-- 004: known_items — the agent's memory of the user's recurring foods/supplements.
-- When the user says "had my magnesium", the agent uses these exact macros
-- instead of re-estimating. New logged items are learned automatically.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS known_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    calories INTEGER,
    protein INTEGER,
    carbs INTEGER,
    fat INTEGER,
    micronutrients JSONB,
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE known_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON known_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public insert access" ON known_items FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow public update access" ON known_items FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed from the user's supplement history (logged July 11-12)
INSERT INTO known_items (user_id, name, aliases, calories, protein, carbs, fat)
SELECT '00000000-0000-0000-0000-000000000000', v.name, v.aliases, v.cal, v.p, v.c, v.f
FROM (VALUES
    ('Fish Oil Supplement with Vitamins D and K', ARRAY['fish oil', 'd3 k2', 'd3 k2 vitamin', 'morning vitamin', 'morning 03 d3 k2 vitamin', 'omega 3'], 20, 0, 0, 2),
    ('Magnesium Bisglycinate', ARRAY['magnesium', 'magnesium supplement', 'magnesium bisglycinate'], 0, 0, 0, 0),
    ('MyProtein Collagen Protein', ARRAY['collagen', 'collagen protein', 'myprotein collagen'], 92, 23, 0, 0)
) AS v(name, aliases, cal, p, c, f)
WHERE NOT EXISTS (SELECT 1 FROM known_items LIMIT 1);
