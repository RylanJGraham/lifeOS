-- 007: Split sleep and cardiovascular data out of health_metrics into dedicated tables.
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- Existing health_metrics rows with sleep data are migrated into sleep_metrics.
-- Existing health_metrics rows with CV data are migrated into cardiovascular_metrics.

-------------------------------------------------------------------------------
-- 1. Sleep metrics table
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sleep_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    recorded_at DATE NOT NULL,
    duration_minutes INTEGER,
    deep_minutes INTEGER,
    light_minutes INTEGER,
    rem_minutes INTEGER,
    bed_time TEXT,
    wake_time TEXT,
    sleeping_heart_rate INTEGER,
    source TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_sleep_metrics_user_date ON sleep_metrics(user_id, recorded_at);

-------------------------------------------------------------------------------
-- 2. Cardiovascular metrics table
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cardiovascular_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    recorded_at DATE NOT NULL,
    resting_heart_rate INTEGER,
    average_heart_rate INTEGER,
    min_heart_rate INTEGER,
    max_heart_rate INTEGER,
    hrv INTEGER,
    vo2_max NUMERIC,
    heart_rate_zones JSONB,
    source TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_cv_metrics_user_date ON cardiovascular_metrics(user_id, recorded_at);

-------------------------------------------------------------------------------
-- 3. Row Level Security
-------------------------------------------------------------------------------
ALTER TABLE sleep_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiovascular_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see their own sleep metrics'
    ) THEN
        CREATE POLICY "Users can only see their own sleep metrics"
            ON sleep_metrics FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see their own cardiovascular metrics'
    ) THEN
        CREATE POLICY "Users can only see their own cardiovascular metrics"
            ON cardiovascular_metrics FOR ALL USING (auth.uid() = user_id);
    END IF;
END
$$;

-------------------------------------------------------------------------------
-- 4. Realtime
-------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE sleep_metrics;
        ALTER PUBLICATION supabase_realtime ADD TABLE cardiovascular_metrics;
    END IF;
END
$$;

-------------------------------------------------------------------------------
-- 5. Data migration from health_metrics
-------------------------------------------------------------------------------
-- Migrate sleep rows. Use ON CONFLICT so the script is idempotent.
INSERT INTO sleep_metrics (
    user_id,
    recorded_at,
    duration_minutes,
    deep_minutes,
    light_minutes,
    rem_minutes,
    bed_time,
    wake_time,
    sleeping_heart_rate,
    source,
    notes
)
SELECT
    user_id,
    recorded_at::date,
    sleep_duration_minutes,
    sleep_deep_minutes,
    GREATEST(0, sleep_duration_minutes - COALESCE(sleep_deep_minutes, 0) - COALESCE(sleep_rem_minutes, 0)) AS sleep_light_minutes,
    sleep_rem_minutes,
    sleep_bed_time,
    sleep_wake_time,
    sleeping_heart_rate,
    'health_metrics_migration',
    notes
FROM health_metrics
WHERE sleep_duration_minutes IS NOT NULL
ON CONFLICT (user_id, recorded_at)
DO UPDATE SET
    duration_minutes = EXCLUDED.duration_minutes,
    deep_minutes = EXCLUDED.deep_minutes,
    light_minutes = EXCLUDED.light_minutes,
    rem_minutes = EXCLUDED.rem_minutes,
    bed_time = EXCLUDED.bed_time,
    wake_time = EXCLUDED.wake_time,
    sleeping_heart_rate = EXCLUDED.sleeping_heart_rate,
    source = 'health_metrics_migration',
    notes = EXCLUDED.notes;

-- Migrate cardiovascular rows.
INSERT INTO cardiovascular_metrics (
    user_id,
    recorded_at,
    resting_heart_rate,
    average_heart_rate,
    min_heart_rate,
    max_heart_rate,
    hrv,
    vo2_max,
    heart_rate_zones,
    source,
    notes
)
SELECT
    user_id,
    recorded_at::date,
    resting_heart_rate,
    average_heart_rate,
    min_heart_rate,
    max_heart_rate,
    hrv,
    vo2_max,
    heart_rate_zones,
    'health_metrics_migration',
    notes
FROM health_metrics
WHERE resting_heart_rate IS NOT NULL
   OR average_heart_rate IS NOT NULL
   OR min_heart_rate IS NOT NULL
   OR max_heart_rate IS NOT NULL
   OR hrv IS NOT NULL
   OR vo2_max IS NOT NULL
ON CONFLICT (user_id, recorded_at)
DO UPDATE SET
    resting_heart_rate = EXCLUDED.resting_heart_rate,
    average_heart_rate = EXCLUDED.average_heart_rate,
    min_heart_rate = EXCLUDED.min_heart_rate,
    max_heart_rate = EXCLUDED.max_heart_rate,
    hrv = EXCLUDED.hrv,
    vo2_max = EXCLUDED.vo2_max,
    heart_rate_zones = EXCLUDED.heart_rate_zones,
    source = 'health_metrics_migration',
    notes = EXCLUDED.notes;
