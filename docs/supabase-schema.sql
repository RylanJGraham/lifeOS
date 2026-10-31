-- Live Supabase schema generated from PostgREST introspection.
-- This file is the ground-truth reference for the LifeOS database.
-- Regenerate it after every schema change by running:
--   python introspect_db.py
-- or by querying the Supabase REST root with an openapi accept header.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: advisor_daily_reports
CREATE TABLE IF NOT EXISTS advisor_daily_reports (
    generated_at TIMESTAMP WITH TIME ZONE,
    html_content TEXT,
    id UUID NOT NULL,
    json_content JSONB,
    market_regime VARCHAR(255),
    portfolio_value NUMERIC,
    report_date DATE NOT NULL,
    report_type VARCHAR(255),
    status VARCHAR(255),
    title VARCHAR(255),
    user_id UUID NOT NULL,
    vix_level NUMERIC
);

-- Table: advisor_dividends
CREATE TABLE IF NOT EXISTS advisor_dividends (
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(255),
    dividend_date DATE NOT NULL,
    ex_date DATE,
    id UUID NOT NULL,
    raw_description TEXT,
    record_date DATE,
    source VARCHAR(255),
    symbol VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL
);

-- Table: advisor_latest_portfolio
CREATE TABLE IF NOT EXISTS advisor_latest_portfolio (
    beta_estimate NUMERIC,
    cash NUMERIC,
    daily_pnl NUMERIC,
    exposure_currency JSONB,
    exposure_geo JSONB,
    exposure_sector JSONB,
    id UUID,
    open_positions INTEGER,
    record_date DATE,
    recorded_at TIMESTAMP WITH TIME ZONE,
    risk_flags TEXT[],
    total_return_pct NUMERIC,
    total_value NUMERIC,
    unrealized_pnl NUMERIC,
    user_id UUID
);

-- Table: advisor_order_fills
CREATE TABLE IF NOT EXISTS advisor_order_fills (
    broker_order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    fees NUMERIC,
    fill_price NUMERIC NOT NULL,
    fill_qty NUMERIC NOT NULL,
    filled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    id UUID NOT NULL,
    order_id UUID NOT NULL
);

-- Table: advisor_orders
CREATE TABLE IF NOT EXISTS advisor_orders (
    action VARCHAR(255) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    confidence NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(255),
    cycle_id VARCHAR(255),
    executed_at TIMESTAMP WITH TIME ZONE,
    generated_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    limit_price NUMERIC,
    linked_signal_id UUID,
    order_type VARCHAR(255) NOT NULL,
    quantity NUMERIC NOT NULL,
    rationale TEXT,
    source VARCHAR(255),
    status VARCHAR(255),
    stop_price NUMERIC,
    symbol VARCHAR(255) NOT NULL,
    tif VARCHAR(255),
    trailing_pct NUMERIC,
    user_id UUID NOT NULL
);

-- Table: advisor_portfolio_snapshots
CREATE TABLE IF NOT EXISTS advisor_portfolio_snapshots (
    beta_estimate NUMERIC,
    cash NUMERIC,
    daily_pnl NUMERIC,
    exposure_currency JSONB,
    exposure_geo JSONB,
    exposure_sector JSONB,
    id UUID NOT NULL,
    open_positions INTEGER,
    record_date DATE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE,
    risk_flags TEXT[],
    total_return_pct NUMERIC NOT NULL,
    total_value NUMERIC NOT NULL,
    unrealized_pnl NUMERIC,
    user_id UUID NOT NULL
);

-- Table: advisor_position_history
CREATE TABLE IF NOT EXISTS advisor_position_history (
    id UUID NOT NULL,
    portfolio_weight NUMERIC,
    position_value NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    record_date DATE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE,
    signal_id UUID,
    symbol VARCHAR(255) NOT NULL,
    unrealized_pnl NUMERIC NOT NULL,
    unrealized_pnl_pct NUMERIC NOT NULL,
    user_id UUID NOT NULL
);

-- Table: advisor_position_performance
CREATE TABLE IF NOT EXISTS advisor_position_performance (
    id UUID,
    portfolio_weight NUMERIC,
    position_value NUMERIC,
    price NUMERIC,
    quantity NUMERIC,
    record_date DATE,
    recorded_at TIMESTAMP WITH TIME ZONE,
    signal_id UUID,
    symbol VARCHAR(255),
    unrealized_pnl NUMERIC,
    unrealized_pnl_pct NUMERIC,
    user_id UUID
);

-- Table: advisor_positions
CREATE TABLE IF NOT EXISTS advisor_positions (
    asset_class VARCHAR(255),
    average_cost NUMERIC,
    currency VARCHAR(255),
    current_price NUMERIC,
    id UUID NOT NULL,
    notes TEXT,
    opened_at TIMESTAMP WITH TIME ZONE,
    options JSONB,
    position_value NUMERIC,
    quantity NUMERIC,
    realized_pnl NUMERIC,
    sector VARCHAR(255),
    side VARCHAR(255),
    source VARCHAR(255),
    status VARCHAR(255),
    symbol VARCHAR(255) NOT NULL,
    tags JSONB,
    unrealized_pnl NUMERIC,
    unrealized_pnl_pct NUMERIC,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: advisor_positions_with_signals
CREATE TABLE IF NOT EXISTS advisor_positions_with_signals (
    asset_class VARCHAR(255),
    average_cost NUMERIC,
    currency VARCHAR(255),
    current_price NUMERIC,
    id UUID,
    latest_signal_action VARCHAR(255),
    latest_signal_confidence NUMERIC,
    latest_signal_price_target NUMERIC,
    notes TEXT,
    opened_at TIMESTAMP WITH TIME ZONE,
    options JSONB,
    position_value NUMERIC,
    quantity NUMERIC,
    realized_pnl NUMERIC,
    sector VARCHAR(255),
    side VARCHAR(255),
    source VARCHAR(255),
    status VARCHAR(255),
    symbol VARCHAR(255),
    tags JSONB,
    unrealized_pnl NUMERIC,
    unrealized_pnl_pct NUMERIC,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID
);

-- Table: advisor_purchase_history
CREATE TABLE IF NOT EXISTS advisor_purchase_history (
    action VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(255),
    direction VARCHAR(255),
    executed_at TIMESTAMP WITH TIME ZONE,
    fees NUMERIC,
    id UUID,
    price NUMERIC,
    processed BOOLEAN,
    quantity NUMERIC,
    reason TEXT,
    symbol VARCHAR(255),
    total_cost NUMERIC,
    user_id UUID
);

-- Table: advisor_purchases
CREATE TABLE IF NOT EXISTS advisor_purchases (
    action VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(255),
    direction VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    fees NUMERIC,
    id UUID NOT NULL,
    price NUMERIC NOT NULL,
    processed BOOLEAN,
    processed_at TIMESTAMP WITH TIME ZONE,
    quantity NUMERIC NOT NULL,
    reason TEXT,
    signal_id UUID,
    symbol VARCHAR(255) NOT NULL,
    total_cost NUMERIC NOT NULL,
    user_id UUID NOT NULL
);

-- Table: advisor_signal_performance
CREATE TABLE IF NOT EXISTS advisor_signal_performance (
    action VARCHAR(255),
    losses INTEGER,
    symbol VARCHAR(255),
    total_signals INTEGER,
    win_rate NUMERIC,
    wins INTEGER
);

-- Table: advisor_signals
CREATE TABLE IF NOT EXISTS advisor_signals (
    action VARCHAR(255),
    confidence NUMERIC,
    cycle_id VARCHAR(255),
    executed BOOLEAN,
    generated_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    outcome VARCHAR(255),
    outcome_price NUMERIC,
    outcome_time TIMESTAMP WITH TIME ZONE,
    position_id UUID,
    price_target NUMERIC,
    reasoning TEXT,
    signal_type VARCHAR(255),
    stop_loss NUMERIC,
    swarm_agents TEXT[],
    swarm_confidence NUMERIC,
    symbol VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL
);

-- Table: advisor_watchlist
CREATE TABLE IF NOT EXISTS advisor_watchlist (
    category VARCHAR(255),
    conviction_history JSONB,
    conviction_score NUMERIC,
    id UUID NOT NULL,
    in_portfolio BOOLEAN,
    interest_state TEXT,
    last_signal_action VARCHAR(255),
    last_signal_confidence NUMERIC,
    last_signal_type VARCHAR(255),
    signal_count INTEGER,
    symbol VARCHAR(255) NOT NULL,
    thesis TEXT,
    tracking_since TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: ai_insights
CREATE TABLE IF NOT EXISTS ai_insights (
    action_item TEXT,
    domain VARCHAR(255) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    insight_text TEXT NOT NULL,
    resolution TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: automations
CREATE TABLE IF NOT EXISTS automations (
    action_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    description TEXT,
    id UUID NOT NULL,
    is_active BOOLEAN,
    name VARCHAR(255) NOT NULL,
    trigger_condition JSONB NOT NULL,
    user_id UUID NOT NULL
);

-- Table: budgets
CREATE TABLE IF NOT EXISTS budgets (
    category VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(255),
    id UUID NOT NULL,
    monthly_limit NUMERIC NOT NULL,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: chat_modes
CREATE TABLE IF NOT EXISTS chat_modes (
    chat_id INTEGER NOT NULL,
    mode TEXT NOT NULL,
    target_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Table: chat_threads
CREATE TABLE IF NOT EXISTS chat_threads (
    created_at TIMESTAMP WITH TIME ZONE,
    external_id VARCHAR(255),
    id UUID NOT NULL,
    messages JSONB NOT NULL,
    source VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: company_rsus
CREATE TABLE IF NOT EXISTS company_rsus (
    created_at TIMESTAMP WITH TIME ZONE,
    grant_date DATE NOT NULL,
    grant_price_usd NUMERIC,
    id UUID NOT NULL,
    initial_grant_value_usd NUMERIC NOT NULL,
    ticker VARCHAR(255) NOT NULL,
    total_shares_granted NUMERIC,
    user_id UUID NOT NULL,
    vest_percent_per_year NUMERIC NOT NULL,
    vesting_years INTEGER NOT NULL
);

-- Table: device_push_tokens
CREATE TABLE IF NOT EXISTS device_push_tokens (
    created_at TIMESTAMP WITH TIME ZONE,
    expo_push_token TEXT NOT NULL,
    id UUID NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    invalid_at TIMESTAMP WITH TIME ZONE,
    platform TEXT,
    user_id UUID NOT NULL
);

-- Table: exercise_muscles
CREATE TABLE IF NOT EXISTS exercise_muscles (
    created_at TIMESTAMP WITH TIME ZONE,
    exercise_name TEXT NOT NULL,
    id UUID NOT NULL,
    muscle_group TEXT NOT NULL,
    source TEXT,
    user_id UUID NOT NULL
);

-- Table: goal_checkins
CREATE TABLE IF NOT EXISTS goal_checkins (
    created_at TIMESTAMP WITH TIME ZONE,
    goal_id UUID,
    id UUID NOT NULL,
    note TEXT,
    user_id UUID,
    value NUMERIC
);

-- Table: goal_links
CREATE TABLE IF NOT EXISTS goal_links (
    created_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    link_type VARCHAR(255) NOT NULL,
    notes TEXT,
    source_goal_id UUID NOT NULL,
    target_goal_id UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL,
    weight NUMERIC
);

-- Table: goals
CREATE TABLE IF NOT EXISTS goals (
    category TEXT,
    checkin_cadence TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    currency TEXT,
    current_value NUMERIC,
    deadline DATE,
    description TEXT,
    id UUID NOT NULL,
    linked_metric TEXT,
    metric_basis JSONB,
    plan JSONB,
    priority INTEGER NOT NULL,
    status TEXT,
    target_value NUMERIC,
    title TEXT NOT NULL,
    unit TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID
);

-- Table: health_metrics
CREATE TABLE IF NOT EXISTS health_metrics (
    active_calories INTEGER,
    average_heart_rate INTEGER,
    body_weight_kg NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE,
    embedding VECTOR(768),
    heart_rate_zones JSONB,
    hrv INTEGER,
    id UUID NOT NULL,
    max_heart_rate INTEGER,
    min_heart_rate INTEGER,
    notes TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    respiratory_rate NUMERIC,
    resting_heart_rate INTEGER,
    sleep_bed_time TEXT,
    sleep_deep_minutes INTEGER,
    sleep_duration_minutes INTEGER,
    sleep_light_minutes INTEGER,
    sleep_rem_minutes INTEGER,
    sleep_wake_time TEXT,
    sleeping_heart_rate INTEGER,
    steps INTEGER,
    symptom_name VARCHAR(255),
    symptom_severity INTEGER,
    user_id UUID NOT NULL,
    vo2_max NUMERIC
);

-- Table: known_items
CREATE TABLE IF NOT EXISTS known_items (
    aliases TEXT[],
    calories INTEGER,
    carbs INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    fat INTEGER,
    id UUID NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    micronutrients JSONB,
    name TEXT NOT NULL,
    protein INTEGER,
    use_count INTEGER,
    user_id UUID NOT NULL
);

-- Table: meals
CREATE TABLE IF NOT EXISTS meals (
    caffeine_mg INTEGER,
    calories INTEGER,
    carbs INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    description TEXT,
    embedding VECTOR(768),
    fat INTEGER,
    id UUID NOT NULL,
    meal_time TIMESTAMP WITH TIME ZONE NOT NULL,
    meal_type TEXT,
    micronutrients JSONB,
    planned BOOLEAN,
    protein INTEGER,
    user_id UUID NOT NULL
);

-- Table: memories
CREATE TABLE IF NOT EXISTS memories (
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    domain VARCHAR(255) NOT NULL,
    embedding VECTOR(768),
    id UUID NOT NULL,
    metadata JSONB,
    user_id UUID NOT NULL
);

-- Table: pipeline_runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
    created_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error TEXT,
    finished_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    metadata JSONB,
    pipeline_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(255) NOT NULL,
    user_id UUID
);

-- Table: portfolio_holdings
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    asset_class VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    ticker VARCHAR(255),
    user_id UUID NOT NULL,
    value_usd NUMERIC NOT NULL
);

-- Table: statement_uploads
CREATE TABLE IF NOT EXISTS statement_uploads (
    created_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    file_name TEXT,
    file_size_bytes INTEGER,
    id UUID NOT NULL,
    mime_type VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(255),
    storage_path TEXT,
    user_id UUID NOT NULL
);

-- Table: system_logs
CREATE TABLE IF NOT EXISTS system_logs (
    details JSONB,
    id UUID NOT NULL,
    level TEXT,
    message TEXT,
    service TEXT,
    timestamp TIMESTAMP WITH TIME ZONE
);

-- Table: telegram_webhook_health
CREATE TABLE IF NOT EXISTS telegram_webhook_health (
    error TEXT,
    id UUID NOT NULL,
    last_update_at TIMESTAMP WITH TIME ZONE,
    last_update_id INTEGER,
    pending_update_count INTEGER,
    status VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID,
    webhook_url TEXT
);

-- Table: transactions
CREATE TABLE IF NOT EXISTS transactions (
    amount NUMERIC NOT NULL,
    category VARCHAR(255),
    confidence_score NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    is_investment BOOLEAN,
    linked_trade_id UUID,
    merchant_name VARCHAR(255) NOT NULL,
    notes TEXT,
    notified BOOLEAN,
    ticker VARCHAR(255),
    transaction_date DATE NOT NULL,
    user_id UUID NOT NULL
);

-- Table: user_identities
CREATE TABLE IF NOT EXISTS user_identities (
    created_at TIMESTAMP WITH TIME ZONE,
    external_id VARCHAR(255) NOT NULL,
    id UUID NOT NULL,
    source VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    activity_level TEXT,
    age INTEGER,
    bank_balance NUMERIC,
    bank_balance_updated_at TIMESTAMP WITH TIME ZONE,
    base_salary NUMERIC,
    carbs_target_g INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    current_weight_kg NUMERIC,
    daily_caloric_target INTEGER,
    dynamic_budget BOOLEAN,
    estimated_weight_kg NUMERIC,
    expected_yield NUMERIC,
    fat_target_g INTEGER,
    goal TEXT,
    height_cm NUMERIC,
    id UUID NOT NULL,
    monthly_rent NUMERIC,
    onboarding JSONB,
    protein_target_g INTEGER,
    risk_policy JSONB,
    sex TEXT,
    strict_macros BOOLEAN,
    supplements JSONB,
    target_savings_rate NUMERIC,
    target_weight_kg NUMERIC,
    targets_computed_at TIMESTAMP WITH TIME ZONE,
    user_id UUID NOT NULL
);

-- Table: worker_heartbeats
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    created_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    id UUID NOT NULL,
    last_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    next_expected_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    user_id UUID,
    worker_id VARCHAR(255) NOT NULL
);

-- Table: workout_template_exercises
CREATE TABLE IF NOT EXISTS workout_template_exercises (
    exercise_name VARCHAR(255) NOT NULL,
    id UUID NOT NULL,
    muscle_group VARCHAR(255),
    reps INTEGER,
    sets INTEGER,
    sort_order INTEGER,
    template_id UUID,
    weight NUMERIC
);

-- Table: workout_templates
CREATE TABLE IF NOT EXISTS workout_templates (
    created_at TIMESTAMP WITH TIME ZONE,
    description TEXT,
    id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL
);

-- Table: workouts
CREATE TABLE IF NOT EXISTS workouts (
    activity_type VARCHAR(255),
    average_cadence NUMERIC,
    average_heartrate INTEGER,
    average_speed NUMERIC,
    average_watts NUMERIC,
    calories INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    distance_km NUMERIC,
    duration_minutes NUMERIC,
    exercise_name VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    id UUID NOT NULL,
    max_heartrate INTEGER,
    max_speed NUMERIC,
    max_watts NUMERIC,
    pr_count INTEGER,
    reps INTEGER,
    rpe INTEGER,
    sets INTEGER,
    strava_id VARCHAR(255),
    streams JSONB,
    suffer_score INTEGER,
    total_elevation_gain NUMERIC,
    user_id UUID NOT NULL,
    weight NUMERIC,
    workout_date TIMESTAMP WITH TIME ZONE NOT NULL
);

-- NOTE: the tables below were appended by hand from migrations 029-031.
-- Re-run `python scripts/introspect_supabase_schema.py` after applying them to replace this block.

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    data JSONB NOT NULL,
    dedupe_key TEXT,
    deep_link TEXT,
    id UUID NOT NULL,
    kind TEXT NOT NULL,
    push_status TEXT,
    pushed_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    title TEXT NOT NULL,
    user_id UUID NOT NULL
);

-- Table: notification_prefs
CREATE TABLE IF NOT EXISTS notification_prefs (
    kinds JSONB NOT NULL,
    push_enabled BOOLEAN NOT NULL,
    quiet_end TIME,
    quiet_start TIME,
    timezone TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID NOT NULL
);

-- Table: calendar_events
CREATE TABLE IF NOT EXISTS calendar_events (
    all_day BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    id UUID NOT NULL,
    kind TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    recurrence TEXT NOT NULL,
    recurrence_until DATE,
    reminder_offsets INTEGER[] NOT NULL,
    source TEXT NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    title TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID NOT NULL
);

-- Table: schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version TEXT NOT NULL
);

-- Table: calendar_feed_tokens (migration 032)
CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    token TEXT NOT NULL,
    user_id UUID NOT NULL
);
