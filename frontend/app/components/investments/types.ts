// ─── Investments domain types ────────────────────────────────────
// Mirrors the advisor_* tables/views written by the external trading bot.
// Numeric columns arrive from PostgREST as number or numeric-string
// depending on the column type — coerce with num() from ./shared.

export interface Position {
  id: string | null;
  symbol: string;
  quantity: number | string | null;
  average_cost: number | string | null;
  current_price: number | string | null;
  position_value: number | string | null;
  unrealized_pnl: number | string | null;
  unrealized_pnl_pct: number | string | null;
  currency: string | null;
  sector: string | null;
  side: string | null;
  status?: string | null;
  latest_signal_action: string | null;
  latest_signal_confidence: number | string | null;
  latest_signal_price_target: number | string | null;
}

export interface Signal {
  id: string | null;
  symbol: string;
  signal_type: string | null;
  action: string | null;
  price_target: number | string | null;
  stop_loss: number | string | null;
  confidence: number | string | null;
  reasoning: string | null;
  swarm_agents: string[] | null;
  swarm_confidence: number | string | null;
  cycle_id: string | null;
  executed: boolean | null;
  outcome: string | null;
  outcome_price: number | string | null;
  outcome_time: string | null;
  position_id: string | null;
  generated_at: string | null;
}

export interface Snapshot {
  id: string | null;
  record_date: string;
  total_value: number | string | null;
  total_return_pct: number | string | null;
  cash: number | string | null;
  daily_pnl: number | string | null;
  unrealized_pnl: number | string | null;
  open_positions: number | string | null;
  beta_estimate: number | string | null;
  exposure_sector: Record<string, number> | null;
  exposure_geo: Record<string, number> | null;
  exposure_currency: Record<string, number> | null;
  risk_flags: string[] | null;
}

export interface ConvictionPoint {
  date: string;
  score: number;
  note?: string | null;
}

export type InterestState =
  | "scouting"
  | "warming"
  | "convinced"
  | "cooling"
  | "dropped";

export interface WatchlistEntry {
  id: string | null;
  symbol: string;
  signal_count: number | string | null;
  last_signal_type: string | null;
  last_signal_action: string | null;
  last_signal_confidence: number | string | null;
  in_portfolio: boolean | null;
  category: string | null;
  updated_at: string | null;
  // New conviction columns (migration 008) — optional, the migration may
  // not be applied yet. Everything reading these must tolerate absence.
  conviction_score?: number | string | null;
  conviction_history?: ConvictionPoint[] | null;
  tracking_since?: string | null;
  interest_state?: InterestState | string | null;
  thesis?: string | null;
}

export interface DailyReport {
  id: string;
  report_date: string;
  title: string | null;
  status: string | null;
  report_type: string | null;
  market_regime: string | null;
  vix_level: number | string | null;
  portfolio_value: number | string | null;
  generated_at: string | null;
}

// advisor_signal_performance is a view (win-rate per symbol/action) whose
// exact column list isn't documented — known fields are optional and the
// index signature keeps extra columns accessible without `any`.
export interface SignalPerformance {
  symbol: string;
  action: string | null;
  total_signals?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  win_rate?: number | string | null;
  avg_pnl_pct?: number | string | null;
  [key: string]: unknown;
}

export interface Purchase {
  id: string | null;
  symbol: string;
  action: string | null;
  quantity: number | string | null;
  price: number | string | null;
  total_cost: number | string | null;
  fees: number | string | null;
  currency: string | null;
  direction: string | null;
  reason: string | null;
  executed_at: string | null;
}

export interface PositionHistoryRow {
  id: string | null;
  symbol: string;
  record_date: string;
  quantity: number | string | null;
  price: number | string | null;
  unrealized_pnl: number | string | null;
  unrealized_pnl_pct: number | string | null;
  position_value: number | string | null;
  portfolio_weight: number | string | null;
}

export interface CompanyRSU {
  id: string;
  ticker: string;
  grant_date: string;
  initial_grant_value_usd: number | string | null;
  grant_price_usd: number | string | null;
  total_shares_granted: number | string | null;
  vesting_years: number | string | null;
  vest_percent_per_year: number | string | null;
  created_at: string;
}
