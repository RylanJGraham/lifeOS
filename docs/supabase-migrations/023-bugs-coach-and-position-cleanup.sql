-- Migration 023: Position cleanup, sector fallback, goals metric basis, rent
-- Fixes visible investment/health/goal bugs and adds the fields needed for the
-- budget-coach chat.

-- 1. User profile: monthly rent (used by budget coach + savings math).
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC DEFAULT NULL;

-- 2. Goals: optional metric basis JSONB (e.g. {"baseline_value": 250.21}).
ALTER TABLE goals
    ADD COLUMN IF NOT EXISTS metric_basis JSONB DEFAULT NULL;

-- 3. Recreate the positions view with a sector fallback from tags and correct
--    signal column aliases. Also exposes tags/asset_class/options so the UI can
--    merge broker + Jarvis rows intelligently.
DROP VIEW IF EXISTS advisor_positions_with_signals;

CREATE OR REPLACE VIEW advisor_positions_with_signals AS
SELECT
    p.id,
    p.user_id,
    p.symbol,
    p.status,
    p.quantity,
    p.average_cost,
    p.current_price,
    p.position_value,
    p.unrealized_pnl,
    p.unrealized_pnl_pct,
    p.realized_pnl,
    p.currency,
    COALESCE(p.sector, p.tags ->> 1, 'Unknown') AS sector,
    p.side,
    p.source,
    p.tags,
    p.notes,
    p.opened_at,
    p.updated_at,
    p.asset_class,
    p.options,
    s.action AS latest_signal_action,
    s.confidence AS latest_signal_confidence,
    s.price_target AS latest_signal_price_target
FROM advisor_positions p
LEFT JOIN LATERAL (
    SELECT action, confidence, price_target
    FROM advisor_signals
    WHERE advisor_signals.position_id = p.id
    ORDER BY advisor_signals.generated_at DESC
    LIMIT 1
) s ON true;

-- 4. Repair financial goals that have no linked metric.
UPDATE goals
SET linked_metric = 'bank_balance'
WHERE category = 'financial'
  AND linked_metric IS NULL;

-- 5. Convert the portfolio-% goal to a percentage metric and record the
--    earliest snapshot as its baseline.
DO $$
DECLARE
    baseline NUMERIC;
    gid UUID;
BEGIN
    SELECT total_value INTO baseline
    FROM advisor_portfolio_snapshots
    ORDER BY record_date ASC
    LIMIT 1;

    SELECT id INTO gid
    FROM goals
    WHERE title = 'Increase Portfolio by 15%';

    IF gid IS NOT NULL THEN
        UPDATE goals
        SET target_value = 15,
            unit = '%',
            linked_metric = 'portfolio_value',
            metric_basis = jsonb_build_object('baseline_value', baseline, 'linked_metric', 'portfolio_value')
        WHERE id = gid;
    END IF;
END $$;

-- 6. Clean up zero-UUID Jarvis rows that duplicate real broker positions.
--    Then move their signals over to the surviving broker rows so AI badges
--    are not lost.
DO $$
BEGIN
    -- Delete zero-UUID positions when the same symbol already exists for the
    -- real user. This removes the duplicate rows the dashboard was rendering.
    DELETE FROM advisor_positions AS zero
    WHERE zero.user_id = '00000000-0000-0000-0000-000000000000'
      AND EXISTS (
          SELECT 1 FROM advisor_positions broker
          WHERE broker.user_id = '63d7792f-65b1-4c5e-85f7-91c3377c7922'
            AND broker.symbol = zero.symbol
            AND broker.status = zero.status
      );

    -- Reassign any signals that used to point at deleted zero-UUID positions
    -- to the matching real broker row so the latest signal still shows.
    UPDATE advisor_signals s
    SET position_id = broker.id
    FROM advisor_positions broker
    WHERE s.position_id IS NOT NULL
      AND broker.user_id = '63d7792f-65b1-4c5e-85f7-91c3377c7922'
      AND broker.symbol = s.symbol;
END $$;
