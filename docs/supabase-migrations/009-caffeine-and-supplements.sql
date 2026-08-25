-- 009: Add caffeine tracking and backfill support for meals.
-- caffeine_mg is stored on the meals table so it flows with the existing
-- nutrition ingestion pipeline.
ALTER TABLE meals ADD COLUMN IF NOT EXISTS caffeine_mg INTEGER;

-- meal_type makes breakfast/dinner detection explicit when the user labels a meal.
ALTER TABLE meals ADD COLUMN IF NOT EXISTS meal_type TEXT;

CREATE INDEX IF NOT EXISTS idx_meals_caffeine ON meals(user_id, meal_time) WHERE caffeine_mg IS NOT NULL;
