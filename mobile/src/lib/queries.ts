// Shared data hooks — pulls the repeated "fetch + loading + refetch" pattern
// out of every screen. Each screen composes these instead of hand-rolling
// its own Supabase calls, so the monitoring/recommendation data model is
// defined once and every screen reads it the same way.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import {
  getBackendStatus,
  getPipelines,
  fetchNotifications,
  fetchCalendarEvents,
} from "./api";
import { liveBankBalance, type Transaction } from "./finance";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): {
  data: T | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Keep a ref to the latest fetcher so the stable `run` callback always
  // invokes the current closure without needing `fetcher` in its own deps.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const run = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      // Supabase's PostgrestError has a .message but isn't `instanceof Error`,
      // so check for the property directly rather than assuming one shape.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "check your connection.";
      setError(message);
    } finally {
      if (isRefresh) setRefreshing(false);
      else {
        loaded.current = true;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loaded.current = false;
    // Defer the fetch one tick so the state updates it triggers are not
    // considered synchronous setState calls inside the effect body.
    const timer = setTimeout(() => run(false), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);

  const refetch = useCallback(() => run(true), [run]);
  return useMemo(
    () => ({ data, loading, refreshing, error, refetch }),
    [data, loading, refreshing, error, refetch],
  );
}

// ─── Insights / recommendations — the "what should I act on" layer ────────
export interface Insight {
  id: string;
  domain: string;
  insight_text: string;
  action_item: string | null;
  generated_at: string;
  resolved_at: string | null;
  metadata: Record<string, any> | null;
}

export function useInsights(domains: string[], limit = 100) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("ai_insights")
      .select("id, domain, insight_text, action_item, generated_at, resolved_at, metadata")
      .in("domain", domains)
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Insight[]) ?? [];
  }, [domains.join(",")]);
}

// Dedup to the latest insight per domain — the pattern every screen that
// shows insights needs (Nexus, Health, Finance, Goals all do this).
export function dedupeLatestPerDomain(insights: Insight[], excludeDomains: string[] = []): Insight[] {
  const seen = new Set<string>();
  const out: Insight[] = [];
  for (const row of insights) {
    if (excludeDomains.includes(row.domain)) continue;
    if (seen.has(row.domain)) continue;
    seen.add(row.domain);
    out.push(row);
  }
  return out;
}

// ─── Health monitoring ──────────────────────────────────────────────────
export interface HealthMetric {
  recorded_at: string;
  sleep_duration_minutes: number | null;
  resting_heart_rate: number | null;
  hrv: number | null;
  body_weight_kg: number | null;
}

export function useHealthMetrics(sinceDays: number) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("health_metrics")
      .select("recorded_at, sleep_duration_minutes, resting_heart_rate, hrv, body_weight_kg")
      .gte("recorded_at", daysAgo(sinceDays))
      .order("recorded_at", { ascending: false });
    if (error) throw error;
    return (data as HealthMetric[]) ?? [];
  }, [sinceDays]);
}

export interface Workout {
  workout_date: string;
  activity_type: string | null;
  exercise_name: string;
  weight: number | null;
  duration_minutes: number | null;
}

export function useWorkouts(sinceDays: number) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("workouts")
      .select("workout_date, activity_type, exercise_name, weight, duration_minutes")
      .gte("workout_date", daysAgo(sinceDays))
      .order("workout_date", { ascending: false });
    if (error) throw error;
    return (data as Workout[]) ?? [];
  }, [sinceDays]);
}

export interface Meal {
  meal_time: string;
  description: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  micronutrients: Record<string, number> | null;
}

export function useMeals(sinceDays: number, limit = 20) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("meals")
      .select("meal_time, description, calories, protein, carbs, fat, micronutrients")
      .gte("meal_time", daysAgo(sinceDays))
      .order("meal_time", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Meal[]) ?? [];
  }, [sinceDays, limit]);
}

// Today-only, for live pacing — different shape from useMeals (summed, not
// listed), and a tighter query than "last N days" would give.
export interface TodayMeal {
  meal_time: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  micronutrients: Record<string, number> | null;
}

export function useTodayMeals() {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("meals")
      .select("meal_time, calories, protein, carbs, fat, micronutrients")
      .gte("meal_time", startOfToday());
    if (error) throw error;
    return (data as TodayMeal[]) ?? [];
  }, []);
}

// ─── Profile — single shared fetch, full field set used app-wide ──────────
export interface Profile {
  id?: string;
  user_id?: string;
  height_cm: number | null;
  age: number | null;
  sex: string | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  daily_caloric_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  base_salary: number | null;
  bank_balance: number | null;
  bank_balance_updated_at: string | null;
  target_savings_rate: number | null;
  supplements: unknown | null;
}

export function useProfile() {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "id, user_id, height_cm, age, sex, current_weight_kg, target_weight_kg, daily_caloric_target, protein_target_g, carbs_target_g, fat_target_g, base_salary, bank_balance, bank_balance_updated_at, target_savings_rate",
      )
      .limit(1);
    if (error) throw error;
    return (data?.[0] as Profile) ?? null;
  }, []);
}

export interface FullTransaction extends Transaction {
  merchant_name: string | null;
  category: string | null;
}

export function useTransactions(limit = 500) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("transaction_date, amount, merchant_name, category")
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as FullTransaction[]) ?? [];
  }, [limit]);
}

// Every screen that needs the live balance also needs other `Profile` fields
// (nutrition targets, savings rate, ...), so this is a plain helper over
// `useProfile()` + `useTransactions()` rather than its own hook — avoids a
// second, narrower `user_profiles` fetch alongside the one screens already make.
export { liveBankBalance };

// ─── Investments monitoring ─────────────────────────────────────────────
export interface Position {
  symbol: string;
  currency: string;
  quantity: number;
  average_cost: number;
  current_price: number | null;
  position_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number | null;
  source: string | null;
  sector: string | null;
  asset_class: string | null;
}

export function usePositions() {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_positions")
      .select("symbol, currency, quantity, average_cost, current_price, position_value, unrealized_pnl, unrealized_pnl_pct, source, sector, asset_class")
      .eq("status", "open")
      .order("position_value", { ascending: false });
    if (error) throw error;
    return (data as Position[]) ?? [];
  }, []);
}

export interface Snapshot {
  record_date: string;
  total_value: number;
  cash: number | null;
  unrealized_pnl: number | null;
  exposure_sector: Record<string, number> | null;
  exposure_geo: Record<string, number> | null;
  exposure_currency: Record<string, number> | null;
  risk_flags: string[] | null;
}

export function usePortfolioSnapshots(sinceDays: number) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_portfolio_snapshots")
      .select("record_date, total_value, cash, unrealized_pnl")
      .gte("record_date", daysAgo(sinceDays).slice(0, 10))
      .order("record_date", { ascending: true });
    if (error) throw error;
    return (data as Snapshot[]) ?? [];
  }, [sinceDays]);
}

export function useLatestSnapshot() {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_portfolio_snapshots")
      .select("record_date, total_value, cash, unrealized_pnl, exposure_sector, exposure_geo, exposure_currency, risk_flags")
      .order("record_date", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return data as Snapshot;
  }, []);
}

export type OrderStatus = "proposed" | "approved" | "rejected" | "sent" | "filled" | "cancelled" | "expired";
export type OrderAction = "BUY" | "ADD" | "SELL" | "TRIM";

export interface Order {
  id: string;
  symbol: string;
  action: OrderAction;
  order_type: string;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  trailing_pct: number | null;
  tif: string | null;
  status: OrderStatus;
  currency: string | null;
  rationale: string | null;
  confidence: number | null;
  generated_at: string;
}

export function useOrders(limit = 150) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_orders")
      .select("id, symbol, action, order_type, quantity, limit_price, stop_price, trailing_pct, tif, status, currency, rationale, confidence, generated_at")
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Order[]) ?? [];
  }, [limit]);
}

// ─── Advisor intelligence ───────────────────────────────────────────────
export interface DailyReport {
  id: string;
  report_date: string;
  title: string | null;
  market_regime: string | null;
  vix_level: number | null;
  portfolio_value: number | null;
  json_content: Record<string, unknown> | null;
  html_content: string | null;
  generated_at: string;
}

export function useDailyReports(limit = 7) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_daily_reports")
      .select("id, report_date, title, market_regime, vix_level, portfolio_value, json_content, html_content, generated_at")
      .order("report_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as DailyReport[]) ?? [];
  }, [limit]);
}

export interface Signal {
  id: string;
  symbol: string;
  action: string | null;
  signal_type: string | null;
  confidence: number | null;
  price_target: number | null;
  stop_loss: number | null;
  reasoning: string | null;
  outcome: string | null;
  executed: boolean | null;
  generated_at: string;
}

export function useSignals(limit = 50) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_signals")
      .select("id, symbol, action, signal_type, confidence, price_target, stop_loss, reasoning, outcome, executed, generated_at")
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Signal[]) ?? [];
  }, [limit]);
}

export interface SignalPerformance {
  symbol: string;
  action: string | null;
  total_signals: number | null;
  wins: number | null;
  losses: number | null;
  win_rate: number | null;
}

export function useSignalPerformance() {
  return useAsync(async () => {
    const { data, error } = await supabase.from("advisor_signal_performance").select("symbol, action, total_signals, wins, losses, win_rate");
    if (error) throw error;
    return (data as SignalPerformance[]) ?? [];
  }, []);
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  category: string | null;
  conviction_score: number | null;
  interest_state: string | null;
  in_portfolio: boolean | null;
  last_signal_action: string | null;
  last_signal_confidence: number | null;
  last_signal_type: string | null;
  signal_count: number | null;
  thesis: string | null;
  tracking_since: string;
  updated_at: string;
}

export function useWatchlist() {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("advisor_watchlist")
      .select(
        "id, symbol, category, conviction_score, interest_state, in_portfolio, last_signal_action, last_signal_confidence, last_signal_type, signal_count, thesis, tracking_since, updated_at",
      )
      .order("conviction_score", { ascending: false });
    if (error) throw error;
    return (data as WatchlistItem[]) ?? [];
  }, []);
}

// ─── Transaction anomalies (persisted as finance_anomaly ai_insights) ─────
export interface AnomalyFinding {
  type: "duplicate_charge" | "subscription_change" | "unusual_amount";
  merchant?: string;
  amount?: number;
  dates?: string[];
  latest_amount?: number;
  previous_amount?: number;
  change_pct?: number;
  z_score?: number;
  avg_amount?: number;
  date?: string;
  severity: "medium" | "high";
}

export interface AnomalyInsight {
  id: string;
  insight_text: string;
  action_item: string | null;
  generated_at: string;
}

export function useTransactionAnomalies(limit = 20) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("ai_insights")
      .select("id, insight_text, action_item, generated_at")
      .eq("domain", "finance_anomaly")
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as AnomalyInsight[]) ?? [];
  }, [limit]);
}

export function parseAnomaly(actionItem: string | null): AnomalyFinding | null {
  if (!actionItem) return null;
  try {
    const parsed = JSON.parse(actionItem) as AnomalyFinding;
    return parsed.type ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Goals + check-ins ────────────────────────────────────────────────────
export interface Goal {
  id: string;
  title: string;
  category: "financial" | "habit" | "personal";
  status: "active" | "achieved" | "abandoned";
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  deadline: string | null;
  checkin_cadence: string | null;
  created_at: string;
  updated_at: string | null;
}

export function useGoals() {
  return useAsync(async () => {
    const { data, error } = await supabase.from("goals").select("*").neq("status", "abandoned");
    if (error) throw error;
    const sorted = [...(data ?? [])].sort((a: Goal, b: Goal) => (a.status !== b.status ? (a.status === "active" ? -1 : 1) : 0));
    return sorted as Goal[];
  }, []);
}

export interface GoalCheckin {
  id: string;
  goal_id: string | null;
  value: number | null;
  note: string | null;
  created_at: string;
}

export function useGoalCheckins(goalIds: string[], limit = 50) {
  return useAsync(async () => {
    if (goalIds.length === 0) return [];
    const { data, error } = await supabase
      .from("goal_checkins")
      .select("id, goal_id, value, note, created_at")
      .in("goal_id", goalIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as GoalCheckin[]) ?? [];
  }, [goalIds.join(",")]);
}

// ─── Exercise muscle mapping ──────────────────────────────────────────────
export interface ExerciseMuscle {
  id: string;
  exercise_name: string;
  muscle_group: string;
}

export interface SystemLog {
  timestamp: string;
  level: string;
  service: string;
  message: string;
}

export function useSystemLogs(limit = 10) {
  return useAsync(async () => {
    const { data, error } = await supabase
      .from("system_logs")
      .select("timestamp, level, service, message")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as SystemLog[]) ?? [];
  }, [limit]);
}

export function useExerciseMuscles() {
  return useAsync(async () => {
    const { data, error } = await supabase.from("exercise_muscles").select("id, exercise_name, muscle_group");
    if (error) throw error;
    return (data as ExerciseMuscle[]) ?? [];
  }, []);
}

export function usePipelines() {
  return useAsync(async () => {
    const data = await getPipelines();
    return data;
  }, []);
}

export function useBackendStatus() {
  return useAsync(async () => {
    const data = await getBackendStatus();
    return data;
  }, []);
}

export function periodStart(cadence: string): Date {
  const now = new Date();
  if (cadence === "weekly") {
    const monday = new Date(now.getTime() - now.getDay() * 86400000);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
  now.setHours(0, 0, 0, 0);
  return now;
}

export function isCheckinPending(goal: Goal, checkins: GoalCheckin[]): boolean {
  if (goal.status !== "active" || !goal.checkin_cadence) return false;
  const start = periodStart(goal.checkin_cadence);
  return !checkins.some((c) => c.goal_id === goal.id && new Date(c.created_at).getTime() >= start.getTime());
}

export async function logGoalCheckin(goalId: string, answer: "yes" | "no", currentValue?: number): Promise<void> {
  const { error } = await supabase.from("goal_checkins").insert({
    goal_id: goalId,
    note: `mobile:${answer}`,
    value: currentValue ?? null,
  });
  if (error) throw error;
}

export async function resolveInsight(insightId: string, resolution?: string): Promise<void> {
  const { error } = await supabase
    .from("ai_insights")
    .update({ resolved_at: new Date().toISOString(), resolution: resolution ?? "Resolved from mobile" })
    .eq("id", insightId);
  if (error) throw error;
}

export async function updateGoalCurrentValue(goalId: string, value: number): Promise<void> {
  const { error } = await supabase.from("goals").update({ current_value: value, updated_at: new Date().toISOString() }).eq("id", goalId);
  if (error) throw error;
}

// ─── Aggregation helpers (pure functions, no fetching) ─────────────────
export function byCurrency(positions: Position[]): Record<string, { value: number; pnl: number }> {
  return positions.reduce<Record<string, { value: number; pnl: number }>>((acc, p) => {
    const cur = acc[p.currency] ?? { value: 0, pnl: 0 };
    cur.value += p.position_value ?? 0;
    cur.pnl += p.unrealized_pnl ?? 0;
    acc[p.currency] = cur;
    return acc;
  }, {});
}

export function byField(
  positions: Position[],
  field: "asset_class" | "sector",
): Record<string, { value: number; pnl: number }> {
  return positions.reduce<Record<string, { value: number; pnl: number }>>((acc, p) => {
    const key = p[field] ?? "Unknown";
    const existing = acc[key] ?? { value: 0, pnl: 0 };
    existing.value += p.position_value ?? 0;
    existing.pnl += p.unrealized_pnl ?? 0;
    acc[key] = existing;
    return acc;
  }, {});
}

export function topMovers(positions: Position[], count = 5) {
  const withPct = positions
    .filter((p) => p.unrealized_pnl_pct != null)
    .map((p) => ({ ...p, pct: p.unrealized_pnl_pct ?? 0 }));
  const gainers = [...withPct].sort((a, b) => b.pct - a.pct).slice(0, count);
  const losers = [...withPct].sort((a, b) => a.pct - b.pct).slice(0, count);
  return { gainers, losers };
}

export function monthSpend(transactions: FullTransaction[]) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTx = transactions.filter((t) => t.transaction_date?.startsWith(thisMonth));
  const income = monthTx.reduce((a, t) => a + (typeof t.amount === "number" ? Math.max(t.amount, 0) : 0), 0);
  const expenses = monthTx.reduce((a, t) => a + (typeof t.amount === "number" ? Math.min(t.amount, 0) : 0), 0);
  return { income, expenses, net: income + expenses, monthTx };
}

// ─── Notifications & calendar (served by the backend API) ─────────────────
export function useNotifications(limit = 50) {
  return useAsync(async () => {
    const res = await fetchNotifications(limit);
    return { items: res.data, unread: res.unread };
  }, [limit]);
}

export function useCalendarEvents(start: Date, end: Date) {
  return useAsync(async () => {
    const res = await fetchCalendarEvents(start.toISOString(), end.toISOString());
    return res.data;
  }, [start.getTime(), end.getTime()]);
}
