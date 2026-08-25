-- 011: Make action items resolvable and avoid stale duplicates.
-- Adds resolved_at/resolution so the frontend can show only pending items,
-- and workers can supersede old insights when a newer one is generated.

ALTER TABLE ai_insights
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolution text;

-- Default all existing rows to unresolved so the UI keeps showing them.
UPDATE ai_insights SET resolved_at = NULL, resolution = NULL WHERE resolved_at IS NULL;

-- Index for fast "pending insights by domain" lookups in workers + dashboard.
CREATE INDEX IF NOT EXISTS idx_ai_insights_domain_resolved
    ON ai_insights (domain, resolved_at, generated_at DESC);
