-- Migration 025: Fix advisor_watchlist duplicates, allow market_advisor as an order source
--
-- Jarvis Advisor v3's select-then-update watchlist logic was silently failing
-- and inserting duplicate (user_id, symbol) rows instead of updating them
-- (e.g. ORCL/Fraport/SOXX each appeared 3x with conviction_score=0). This
-- cleans up existing duplicates and adds a real uniqueness constraint so the
-- in-house src/workers/market_advisor.py (and anything else) can't repeat it.
--
-- Also widens advisor_orders.source to accept 'market_advisor', the new
-- in-house advisor's proposed orders (existing CHECK only allowed
-- 'jarvis'/'manual').

-- 1. Dedupe advisor_watchlist: keep the highest-conviction row per
--    (user_id, symbol), tie-broken by most recent updated_at.
DELETE FROM advisor_watchlist w
WHERE w.id NOT IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY user_id, symbol
                   ORDER BY conviction_score DESC NULLS LAST, updated_at DESC NULLS LAST
               ) AS rn
        FROM advisor_watchlist
    ) ranked
    WHERE ranked.rn = 1
);

ALTER TABLE advisor_watchlist
ADD CONSTRAINT advisor_watchlist_user_symbol_unique UNIQUE (user_id, symbol);

-- 2. Allow the in-house advisor to be a recognized order source.
ALTER TABLE advisor_orders
DROP CONSTRAINT IF EXISTS advisor_orders_source_check;

ALTER TABLE advisor_orders
ADD CONSTRAINT advisor_orders_source_check
CHECK (source IN ('jarvis', 'manual', 'market_advisor'));
