-- 010: Revert the sleep/cardiovascular split — merge back into health_metrics.
-- sleep_metrics and cardiovascular_metrics will be dropped after the merge.
-- health_metrics has no unique constraint on (user_id, recorded_at), so we do a
-- manual lookup + UPDATE-or-INSERT in PL/pgSQL.

-- Preserve the light-sleep stage that the dedicated table captured.
ALTER TABLE health_metrics ADD COLUMN IF NOT EXISTS sleep_light_minutes integer;

CREATE OR REPLACE FUNCTION pg_temp.merge_health_notes(existing text, new_notes text)
RETURNS text AS $$
DECLARE
    header text := 'Health screenshot import:';
    prev_lines text[];
    new_lines text[];
    combined text[];
BEGIN
    IF new_notes IS NULL OR new_notes = '' THEN
        RETURN existing;
    END IF;
    prev_lines := array(
        SELECT l
        FROM unnest(string_to_array(coalesce(existing, ''), E'\n')) AS l
        WHERE l <> '' AND l <> header
    );
    new_lines := array(
        SELECT l
        FROM unnest(string_to_array(new_notes, E'\n')) AS l
        WHERE l <> '' AND l <> header
    );
    combined := new_lines || (
        SELECT array_agg(l) FROM unnest(prev_lines) AS l
        WHERE NOT (l = ANY(new_lines))
    );
    IF array_length(combined, 1) IS NULL THEN
        RETURN existing;
    END IF;
    RETURN header || E'\n' || array_to_string(combined, E'\n');
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    rec record;
    hm_id uuid;
    hm_notes text;
BEGIN
    -- Merge sleep_metrics -> health_metrics
    FOR rec IN
        SELECT *
        FROM sleep_metrics
    LOOP
        SELECT id, notes
        INTO hm_id, hm_notes
        FROM health_metrics
        WHERE user_id = rec.user_id
          AND recorded_at::date = rec.recorded_at
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            UPDATE health_metrics SET
                sleep_duration_minutes = COALESCE(rec.duration_minutes, sleep_duration_minutes),
                sleep_deep_minutes     = COALESCE(rec.deep_minutes, sleep_deep_minutes),
                sleep_light_minutes    = COALESCE(rec.light_minutes, sleep_light_minutes),
                sleep_rem_minutes      = COALESCE(rec.rem_minutes, sleep_rem_minutes),
                sleep_bed_time         = COALESCE(rec.bed_time, sleep_bed_time),
                sleep_wake_time        = COALESCE(rec.wake_time, sleep_wake_time),
                sleeping_heart_rate    = COALESCE(rec.sleeping_heart_rate, sleeping_heart_rate),
                notes                  = pg_temp.merge_health_notes(hm_notes, rec.notes)
            WHERE id = hm_id;
        ELSE
            INSERT INTO health_metrics (
                user_id,
                recorded_at,
                sleep_duration_minutes,
                sleep_deep_minutes,
                sleep_light_minutes,
                sleep_rem_minutes,
                sleep_bed_time,
                sleep_wake_time,
                sleeping_heart_rate,
                notes
            ) VALUES (
                rec.user_id,
                rec.recorded_at,
                rec.duration_minutes,
                rec.deep_minutes,
                rec.light_minutes,
                rec.rem_minutes,
                rec.bed_time,
                rec.wake_time,
                rec.sleeping_heart_rate,
                rec.notes
            );
        END IF;
    END LOOP;

    -- Merge cardiovascular_metrics -> health_metrics
    FOR rec IN
        SELECT *
        FROM cardiovascular_metrics
    LOOP
        SELECT id, notes
        INTO hm_id, hm_notes
        FROM health_metrics
        WHERE user_id = rec.user_id
          AND recorded_at::date = rec.recorded_at
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            UPDATE health_metrics SET
                resting_heart_rate  = COALESCE(rec.resting_heart_rate, resting_heart_rate),
                average_heart_rate  = COALESCE(rec.average_heart_rate, average_heart_rate),
                min_heart_rate      = COALESCE(rec.min_heart_rate, min_heart_rate),
                max_heart_rate      = COALESCE(rec.max_heart_rate, max_heart_rate),
                hrv                 = COALESCE(rec.hrv, hrv),
                vo2_max             = COALESCE(rec.vo2_max, vo2_max),
                heart_rate_zones    = COALESCE(rec.heart_rate_zones, heart_rate_zones),
                notes               = pg_temp.merge_health_notes(hm_notes, rec.notes)
            WHERE id = hm_id;
        ELSE
            INSERT INTO health_metrics (
                user_id,
                recorded_at,
                resting_heart_rate,
                average_heart_rate,
                min_heart_rate,
                max_heart_rate,
                hrv,
                vo2_max,
                heart_rate_zones,
                notes
            ) VALUES (
                rec.user_id,
                rec.recorded_at,
                rec.resting_heart_rate,
                rec.average_heart_rate,
                rec.min_heart_rate,
                rec.max_heart_rate,
                rec.hrv,
                rec.vo2_max,
                rec.heart_rate_zones,
                rec.notes
            );
        END IF;
    END LOOP;
END $$;

DROP TABLE IF EXISTS sleep_metrics;
DROP TABLE IF EXISTS cardiovascular_metrics;
DROP FUNCTION IF EXISTS pg_temp.merge_health_notes(text, text);
