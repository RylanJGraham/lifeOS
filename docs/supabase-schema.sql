-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------------------------------
-- 1. Health Metrics Table
-------------------------------------------------------------------------------
CREATE TABLE health_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Specific metrics
    hrv INTEGER,
    resting_heart_rate INTEGER,
    sleep_duration_minutes INTEGER,
    sleep_deep_minutes INTEGER,
    sleep_rem_minutes INTEGER,
    respiratory_rate NUMERIC,
    
    -- Symptoms and notes
    symptom_name VARCHAR(255),
    symptom_severity INTEGER CHECK (symptom_severity >= 1 AND symptom_severity <= 10),
    notes TEXT,
    
    -- For pgvector hybrid search
    embedding vector(768),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for health_metrics
CREATE INDEX idx_health_metrics_user_time ON health_metrics(user_id, recorded_at);
CREATE INDEX idx_health_metrics_symptom ON health_metrics(symptom_name) WHERE symptom_name IS NOT NULL;
CREATE INDEX idx_health_embedding ON health_metrics USING hnsw (embedding vector_cosine_ops);

-------------------------------------------------------------------------------
-- 2. Transactions Table
-------------------------------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    category VARCHAR(100),
    confidence_score NUMERIC(3, 2),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category);

-------------------------------------------------------------------------------
-- 3. Workouts Table
-------------------------------------------------------------------------------
CREATE TABLE workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    workout_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    exercise_name VARCHAR(255) NOT NULL,
    weight NUMERIC(6, 2),
    reps INTEGER,
    sets INTEGER,
    rpe INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_workouts_user_date ON workouts(user_id, workout_date);
CREATE INDEX idx_workouts_exercise ON workouts(exercise_name);

-------------------------------------------------------------------------------
-- 4. Meals Table
-------------------------------------------------------------------------------
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    meal_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    description TEXT,
    calories INTEGER,
    protein INTEGER,
    carbs INTEGER,
    fat INTEGER,
    
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_meals_user_time ON meals(user_id, meal_time);

-------------------------------------------------------------------------------
-- 5. Automations Table
-------------------------------------------------------------------------------
CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_condition JSONB NOT NULL,
    action_payload JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 6. Memories Table (Episodic memory)
-------------------------------------------------------------------------------
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    domain VARCHAR(50) NOT NULL, -- e.g., 'health', 'finance', 'general'
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(768),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_memories_domain ON memories(domain);

-------------------------------------------------------------------------------
-- Row Level Security (RLS)
-------------------------------------------------------------------------------
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Note: We assume the backend service uses the SUPABASE_SERVICE_KEY which bypasses RLS.
-- If users authenticate via the dashboard, these policies ensure they only see their data:

CREATE POLICY "Users can only see their own health metrics" ON health_metrics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own workouts" ON workouts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own meals" ON meals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own automations" ON automations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own memories" ON memories FOR ALL USING (auth.uid() = user_id);

-- SYSTEM LOGS TABLE
CREATE TABLE system_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    level TEXT CHECK (level IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    service TEXT,
    message TEXT,
    details JSONB
);

-- Enable Realtime for system_logs
ALTER PUBLICATION supabase_realtime ADD TABLE system_logs;



-------------------------------------------------------------------------------
-- 7. AI Insights Table
-------------------------------------------------------------------------------
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    domain VARCHAR(50) NOT NULL,
    insight_text TEXT NOT NULL,
    action_item TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON ai_insights FOR SELECT USING (true);


-------------------------------------------------------------------------------
-- 8. Human Engine OS Updates
-------------------------------------------------------------------------------
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    height_cm NUMERIC,
    current_weight_kg NUMERIC,
    target_weight_kg NUMERIC,
    daily_caloric_target INTEGER,
    base_salary NUMERIC,
    target_savings_rate NUMERIC,
    expected_yield NUMERIC,
    strict_macros BOOLEAN DEFAULT false,
    dynamic_budget BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON user_profiles FOR UPDATE USING (true);

CREATE TABLE system_health_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    score NUMERIC(5,2),
    recovery_index NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE system_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON system_health_scores FOR SELECT USING (true);

CREATE TABLE portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    ticker VARCHAR(20),
    value_usd NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON portfolio_holdings FOR SELECT USING (true);

ALTER TABLE meals ADD COLUMN micronutrients JSONB;
ALTER TABLE workouts ADD COLUMN muscle_group VARCHAR(100);
ALTER TABLE transactions ADD COLUMN is_anomaly BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN anomaly_reason TEXT;
