-- Migration: Workout deduplication + budget envelopes
-- Adds external_id to workouts and a budgets table for category spending limits.

-- 1. Workout external_id for cross-source deduplication
ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_user_external_id
ON workouts (user_id, external_id)
WHERE external_id IS NOT NULL;

-- 1b. Supplements config in user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS supplements JSONB;

-- 2. Budget envelopes
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    monthly_limit NUMERIC NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, category)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Chat threads for persistent conversation memory
CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL, -- 'telegram', 'web'
    external_id VARCHAR(255),    -- telegram chat_id, web session id, etc.
    messages JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, source, external_id)
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON chat_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Pipeline run log for reliability/observability
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id VARCHAR(100) NOT NULL,
    user_id UUID,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline_started
ON pipeline_runs (pipeline_id, started_at DESC);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON pipeline_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Worker heartbeat table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id VARCHAR(100) NOT NULL,
    user_id UUID,
    status VARCHAR(20) NOT NULL, -- 'ok', 'late', 'failed'
    last_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_expected_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    metadata JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (worker_id, user_id)
);

ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON worker_heartbeats FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
