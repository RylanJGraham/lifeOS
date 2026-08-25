-- Migration: Create company RSUs table for tracking equity grants

CREATE TABLE company_rsus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    ticker VARCHAR(20) NOT NULL,
    grant_date DATE NOT NULL,
    initial_grant_value_usd NUMERIC NOT NULL,
    grant_price_usd NUMERIC, -- The price of the stock on the grant date
    total_shares_granted NUMERIC, -- Can be calculated as value/price if null
    vesting_years INTEGER NOT NULL DEFAULT 3,
    vest_percent_per_year NUMERIC NOT NULL DEFAULT 33.33,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE company_rsus ENABLE ROW LEVEL SECURITY;

-- Note: In LifeOS we use service role or public policies for simplicity, 
-- but ideally this should use auth.uid() in a full production setting.
CREATE POLICY "Allow public read access to rsus" ON company_rsus FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to rsus" ON company_rsus FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to rsus" ON company_rsus FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to rsus" ON company_rsus FOR DELETE USING (true);
