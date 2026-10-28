-- Fix worker_heartbeats table: add created_at column required by pipeline_service.py upsert logic.
ALTER TABLE IF EXISTS worker_heartbeats ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

-- Ensure advisor views are SECURITY INVOKER (not SECURITY DEFINER) so they respect RLS and stop the security warnings.
ALTER VIEW IF EXISTS public.advisor_latest_portfolio SET (security_invoker = on);
ALTER VIEW IF EXISTS public.advisor_position_performance SET (security_invoker = on);
ALTER VIEW IF EXISTS public.advisor_positions_with_signals SET (security_invoker = on);
ALTER VIEW IF EXISTS public.advisor_purchase_history SET (security_invoker = on);
ALTER VIEW IF EXISTS public.advisor_signal_performance SET (security_invoker = on);
