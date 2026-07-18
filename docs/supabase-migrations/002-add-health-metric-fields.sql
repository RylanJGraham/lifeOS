-- 002: dedicated columns for sleep schedule + heart-rate metrics on health_metrics
-- Source: health-screenshot ingestion (src/graph.py health_image_node)
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS sleep_bed_time TEXT;        -- "23:41"
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS sleep_wake_time TEXT;       -- "07:05"
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS sleeping_heart_rate INTEGER; -- bpm
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS average_heart_rate INTEGER;  -- daily avg, bpm
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS min_heart_rate INTEGER;      -- daily min, bpm
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER;      -- daily max, bpm
