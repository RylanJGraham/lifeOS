-- Migration 020: User identity mapping for Telegram chat IDs and web sessions.
-- Allows the agent to resolve a real Supabase user_id from any inbound channel.

CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL, -- 'telegram', 'web'
    external_id VARCHAR(255) NOT NULL, -- telegram chat_id or web session id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_lookup
ON user_identities (source, external_id);

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "authenticated full access" ON user_identities FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
