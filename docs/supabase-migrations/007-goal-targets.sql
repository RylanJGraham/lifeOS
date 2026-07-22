-- 007: goal-driven nutrition targets on user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sex TEXT;                  -- 'male' | 'female'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS goal TEXT;                 -- 'cut' | 'lean_bulk' | 'bulk' | 'maintain'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS activity_level TEXT;       -- 'sedentary' | 'light' | 'moderate' | 'athlete'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS estimated_weight_kg NUMERIC; -- AI-estimated when unknown
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS protein_target_g INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS carbs_target_g INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fat_target_g INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS targets_computed_at TIMESTAMP WITH TIME ZONE;
