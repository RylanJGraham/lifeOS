// ─── Goals domain types ──────────────────────────────────────────
// Mirrors the `goals` / `goal_checkins` tables (migration 009 — may
// not be applied yet; everything reading these must tolerate absence).
// Numeric columns arrive from PostgREST as number or numeric-string
// depending on the column type — coerce with num()/numOrNull() from
// ../investments/shared.

export type GoalCategory = "financial" | "habit" | "personal";
export type GoalStatus = "active" | "achieved" | "abandoned";
export type LinkedMetric = "net_worth" | "bank_balance" | "portfolio_value";
export type CheckinCadence = "daily" | "weekly";

export interface Milestone {
  label: string;
  value?: number | string | null;
  date?: string | null;
  done?: boolean | null;
}

export interface Goal {
  id: string;
  user_id: string | null;
  title: string;
  category: GoalCategory | string | null;
  status: GoalStatus | string | null;
  description: string | null;
  target_value: number | string | null;
  current_value: number | string | null;
  unit: string | null;
  currency: string | null;
  deadline: string | null; // date (YYYY-MM-DD)
  linked_metric: LinkedMetric | string | null;
  // jsonb — PostgREST returns it parsed, but a legacy row could hold a
  // string; normalize with parseMilestones() in GoalCard.
  plan: Milestone[] | string | null;
  checkin_cadence: CheckinCadence | string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GoalCheckin {
  id: string;
  goal_id: string;
  user_id: string | null;
  note: string | null;
  value: number | string | null;
  created_at: string | null;
}
