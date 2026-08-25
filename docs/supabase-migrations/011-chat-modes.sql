-- 008: Chat mode state for Telegram catch-up flows.
-- Allows the bot to remember it is in a catch-up session (sleep or cardio)
-- and which date the next screenshot should be assigned to.
CREATE TABLE IF NOT EXISTS chat_modes (
    chat_id BIGINT PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'default', -- 'default' | 'catchup_sleep' | 'catchup_cardio'
    target_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_modes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Service can manage chat_modes'
    ) THEN
        CREATE POLICY "Service can manage chat_modes"
            ON chat_modes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;
