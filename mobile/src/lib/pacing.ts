// Live, time-of-day-aware status computation — the "what needs attention
// right now" layer. Deliberately separate from `ai_insights` (LLM-generated,
// batch, slower-moving): this is instant arithmetic against today's actual
// data vs. profile targets, safe to recompute on every pull-to-refresh.
import type { HealthMetric } from "./queries";

export type Severity = "good" | "warn" | "bad";

export interface PaceResult {
  severity: Severity;
  expectedByNow: number;
  gap: number; // actual - expectedByNow; negative = behind
}

// Treat 7am-10pm as the "active day" window — pacing against a full 24h
// target is unfair at 6am and meaningless by 9pm.
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 22;

export function dayFractionNow(date = new Date()): number {
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const start = DAY_START_HOUR * 60;
  const end = DAY_END_HOUR * 60;
  if (minutesNow <= start) return 0;
  if (minutesNow >= end) return 1;
  return (minutesNow - start) / (end - start);
}

export function paceStatus(target: number, actual: number, fraction: number): PaceResult {
  const expectedByNow = target * fraction;
  const gap = actual - expectedByNow;
  if (fraction >= 0.999) {
    // Day's over — judge against the full target, not "pace".
    const ratio = target > 0 ? actual / target : 1;
    return { severity: ratio >= 0.85 ? "good" : ratio >= 0.6 ? "warn" : "bad", expectedByNow: target, gap: actual - target };
  }
  if (expectedByNow <= 0) return { severity: "good", expectedByNow, gap };
  const ratio = gap / expectedByNow; // negative = behind pace
  const severity: Severity = ratio >= -0.1 ? "good" : ratio >= -0.3 ? "warn" : "bad";
  return { severity, expectedByNow, gap };
}

export interface StatusItem {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  route: string;
}

export interface NutritionProfile {
  daily_caloric_target: number | null;
  protein_target_g: number | null;
}

export interface TodayMeal {
  calories: number | null;
  protein: number | null;
}

export function nutritionStatus(meals: TodayMeal[], profile: NutritionProfile | undefined): StatusItem | null {
  if (!profile?.protein_target_g && !profile?.daily_caloric_target) return null; // no targets set — nothing to pace against
  const fraction = dayFractionNow();
  const proteinSoFar = meals.reduce((a, m) => a + (m.protein ?? 0), 0);
  const caloriesSoFar = meals.reduce((a, m) => a + (m.calories ?? 0), 0);

  // Protein is usually the tighter constraint day-to-day — lead with it if set.
  if (profile.protein_target_g) {
    const pace = paceStatus(profile.protein_target_g, proteinSoFar, fraction);
    if (pace.severity !== "good") {
      return {
        key: "nutrition-protein",
        severity: pace.severity,
        title: "Protein behind pace",
        detail: `${Math.round(proteinSoFar)}g / ${profile.protein_target_g}g — ${Math.round(Math.abs(pace.gap))}g behind pace`,
        route: "/health",
      };
    }
  }
  if (profile.daily_caloric_target) {
    const pace = paceStatus(profile.daily_caloric_target, caloriesSoFar, fraction);
    if (pace.severity === "bad") {
      return {
        key: "nutrition-calories",
        severity: "bad",
        title: "Calories well behind pace",
        detail: `${Math.round(caloriesSoFar)} / ${profile.daily_caloric_target} kcal today`,
        route: "/health",
      };
    }
  }
  return null;
}

export function sleepStatus(latest: HealthMetric | undefined, targetHours = 8): StatusItem | null {
  if (!latest?.sleep_duration_minutes) return null;
  const hours = latest.sleep_duration_minutes / 60;
  if (hours >= targetHours * 0.9) return null; // close enough to target, not worth flagging
  const severity: Severity = hours >= targetHours * 0.75 ? "warn" : "bad";
  return {
    key: "sleep",
    severity,
    title: "Low sleep last night",
    detail: `${hours.toFixed(1)}h (target ${targetHours}h) — consider an earlier night`,
    route: "/health",
  };
}

export interface SpendProfile {
  base_salary: number | null;
}

export function spendStatus(
  monthExpenses: number,
  profile: SpendProfile | undefined,
): StatusItem | null {
  if (!profile?.base_salary) return null;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = now.getDate() / daysInMonth;
  // No explicit "monthly budget" field exists — use salary as the reference
  // ceiling (a reasonable proxy: spending shouldn't be pacing ahead of what
  // you earn in the same window).
  const budget = profile.base_salary;
  const pace = paceStatus(budget, Math.abs(monthExpenses), monthFraction);
  if (pace.severity === "good") return null;
  const pctOfBudget = budget > 0 ? Math.round((Math.abs(monthExpenses) / budget) * 100) : 0;
  const pctOfMonth = Math.round(monthFraction * 100);
  return {
    key: "spend",
    severity: pace.severity,
    title: "Spending ahead of pace",
    detail: `${pctOfBudget}% of monthly budget spent, ${pctOfMonth}% through the month`,
    route: "/capital",
  };
}

// ─── PR detection — pure comparison over already-fetched workout history ──
export interface WorkoutRow {
  workout_date: string;
  exercise_name: string;
  weight: number | null;
}

export function detectPRs(workouts: WorkoutRow[]): StatusItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const byExercise = new Map<string, WorkoutRow[]>();
  for (const w of workouts) {
    if (!w.exercise_name || w.weight == null) continue;
    const key = w.exercise_name.trim().toLowerCase();
    const list = byExercise.get(key) ?? [];
    list.push(w);
    byExercise.set(key, list);
  }

  const prs: StatusItem[] = [];
  for (const [key, rows] of byExercise) {
    const todays = rows.filter((r) => r.workout_date?.slice(0, 10) === today);
    if (todays.length === 0) continue;
    const todayMax = Math.max(...todays.map((r) => r.weight ?? 0));
    const priorMax = Math.max(0, ...rows.filter((r) => r.workout_date?.slice(0, 10) !== today).map((r) => r.weight ?? 0));
    if (priorMax > 0 && todayMax > priorMax) {
      prs.push({
        key: `pr-${key}`,
        severity: "good",
        title: "New PR",
        detail: `${todays[0].exercise_name} ${todayMax}kg (+${(todayMax - priorMax).toFixed(1)}kg)`,
        route: "/health",
      });
    }
  }
  return prs;
}
