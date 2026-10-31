import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions, ActivityIndicator, Pressable, TextInput, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { LineChart, BarChart } from "react-native-gifted-charts";
import * as Haptics from "expo-haptics";
import {
  Moon, HeartPulse, Activity, Scale, Flame, Dumbbell, Utensils, Trophy,
  TrendingUp, TrendingDown, Zap, Target, Calendar, Pill, Plus, X, Trash2,
} from "lucide-react-native";
import { useHealthMetrics, useWorkouts, useMeals, useProfile, useExerciseMuscles } from "@/lib/queries";
import { nutritionStatus, sleepStatus, detectPRs, dayFractionNow, isCurrentDay, daysOld } from "@/lib/pacing";
import { colors, colors as lightColors, spacing, radius, fonts, withAlpha } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";
import {
  SectionLabel,
  ListRow,
  SegmentedControl,
  LoadingState,
  ErrorBanner,
  ScreenHeader,
  Surface,
  AccentCard,
  PacingBar,
  MetaRow,
  Ring,
  Dot,
  PrimaryButton,
  HEADER_BAR_HEIGHT,
} from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { addDays, filterByRange, formatRange, inclusiveDays, localDay, startOfDay } from "@/lib/dateRange";
import { lookupSupplement, listSupplements, addSupplement, removeSupplement, type SupplementItem } from "@/lib/api";

const CHART_WIDTH = Dimensions.get("window").width - spacing.lg * 2 - 32; // account for card padding
type RangeKey = "today" | "7" | "month" | "ytd" | "custom";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7", label: "7D" },
  { key: "month", label: "Month" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Pick" },
];

// Full list of vitamins and minerals for the supplement preview.
// Keys match the backend micronutrient keys (without _dv_pct suffix).
const VITAMINS = [
  "vitamin_a", "vitamin_c", "vitamin_d", "vitamin_e", "vitamin_k",
  "vitamin_b1", "vitamin_b2", "vitamin_b3", "vitamin_b6", "vitamin_b12",
  "biotin", "folate", "pantothenic_acid", "choline",
];
const MINERALS = [
  "calcium", "iron", "magnesium", "zinc", "selenium",
  "iodine", "copper", "manganese", "phosphorus", "potassium", "omega_3",
];
const ALL_MICRO_KEYS = [...VITAMINS, ...MINERALS];

function formatMicroKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeSuppTotals(item: SupplementItem, servings: number) {
  const micros = item.micronutrients ?? {};
  const allMicros: { key: string; label: string; value: number }[] = ALL_MICRO_KEYS.map((k) => {
    const raw = micros[`${k}_dv_pct`] ?? 0;
    return { key: k, label: formatMicroKey(k), value: Math.round(raw * servings * 10) / 10 };
  });
  return {
    calories: item.calories * servings,
    protein: item.protein * servings,
    carbs: item.carbs * servings,
    fat: item.fat * servings,
    micros: allMicros,
  };
}

// Fetch window for the screen (covers "pick a specific day" back ~13 months).
// Presets and custom ranges are all filtered client-side from this one fetch.
const FETCH_DAYS = 400;

/** The [from, to] local days a range key selects. Custom comes from the pickers. */
function resolveRange(key: RangeKey, customFrom: Date, customTo: Date): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  if (key === "today") return { from: today, to: today };
  if (key === "7") return { from: addDays(today, -6), to: today };
  if (key === "month") return { from: addDays(today, -29), to: today };
  if (key === "ytd") return { from: new Date(today.getFullYear(), 0, 1), to: today };
  return { from: startOfDay(customFrom), to: startOfDay(customTo) };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, v) => a + v, 0) / values.length;
}

function trend(values: number[]): "up" | "down" | "flat" | null {
  if (values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const firstAvg = mean(values.slice(0, half)) ?? 0;
  const secondAvg = mean(values.slice(half)) ?? 0;
  const diff = secondAvg - firstAvg;
  const threshold = Math.abs(firstAvg) * 0.05 || 0.5;
  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "flat";
}

const PRIORITY_NUTRIENTS: { key: string; label: string }[] = [
  { key: "vitamin_d_dv_pct", label: "Vitamin D" },
  { key: "magnesium_dv_pct", label: "Magnesium" },
  { key: "zinc_dv_pct", label: "Zinc" },
  { key: "omega_3_dv_pct", label: "Omega-3" },
  { key: "calcium_dv_pct", label: "Calcium" },
  { key: "iron_dv_pct", label: "Iron" },
];

function coverageColor(pct: number) {
  return pct >= 80 ? colors.good : pct >= 40 ? colors.kinematic : colors.bad;
}

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [range, setRange] = useState<RangeKey>("7");
  const [customFrom, setCustomFrom] = useState(() => addDays(startOfDay(new Date()), -6));
  const [customTo, setCustomTo] = useState(() => startOfDay(new Date()));
  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => resolveRange(range, customFrom, customTo),
    [range, customFrom, customTo],
  );
  const fromStr = localDay(rangeFrom);
  const toStr = localDay(rangeTo);
  const rangeDays = inclusiveDays(rangeFrom, rangeTo);
  const isToday = range === "today";
  // Labels shared by the section headers below.
  const rangeShort =
    range === "today" ? "1d" : range === "7" ? "7d" : range === "month" ? "30d" : range === "ytd" ? "YTD" : formatRange(rangeFrom, rangeTo);
  const rangeLong =
    range === "7" ? "7 days" : range === "month" ? "30 days" : range === "ytd" ? "year to date" : `${rangeDays} day${rangeDays > 1 ? "s" : ""}`;
  const rangeHyphen =
    range === "7" ? "7-day" : range === "month" ? "30-day" : range === "ytd" ? "YTD" : `${rangeDays}-day`;

  // Fetch ~13 months once; filter client-side by selected range.
  // This makes range switches instant — no new network request, no spinner flash.
  const metrics = useHealthMetrics(FETCH_DAYS);
  const workouts = useWorkouts(FETCH_DAYS);
  const meals = useMeals(FETCH_DAYS, 5000);
  const profile = useProfile();
  const exerciseMuscles = useExerciseMuscles();

  const filteredMetrics = useMemo(() => filterByRange(metrics.data, fromStr, toStr, "recorded_at"), [metrics.data, fromStr, toStr]);
  const filteredWorkouts = useMemo(() => filterByRange(workouts.data, fromStr, toStr, "workout_date"), [workouts.data, fromStr, toStr]);
  const filteredMeals = useMemo(() => filterByRange(meals.data, fromStr, toStr, "meal_time"), [meals.data, fromStr, toStr]);

  // Raw full-YTD datasets (used only where the UI should ignore the range filter)
  const allMetrics = metrics.data;
  const allWorkouts = workouts.data;
  const allMeals = meals.data;

  // Only block the whole screen on the very first load. Range switches use
  // the already-fetched YTD data and filter client-side.
  const loading =
    (metrics.loading && !metrics.data) ||
    (workouts.loading && !workouts.data) ||
    (meals.loading && !meals.data) ||
    (profile.loading && !profile.data) ||
    (exerciseMuscles.loading && !exerciseMuscles.data);
  const refreshing = metrics.refreshing || workouts.refreshing || meals.refreshing || exerciseMuscles.refreshing;
  const isUpdating = false; // YTD data is fetched once; range switches are client-side only
  const firstError = metrics.error || workouts.error || meals.error || profile.error || exerciseMuscles.error;

  const onRefresh = useCallback(() => {
    metrics.refetch();
    workouts.refetch();
    meals.refetch();
    profile.refetch();
    exerciseMuscles.refetch();
  }, [metrics, workouts, meals, profile, exerciseMuscles]);

  const refetchAll = useRef(onRefresh);
  useEffect(() => {
    refetchAll.current = onRefresh;
  }, [onRefresh]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetchAll.current();
    }, []),
  );

  // ─── All useMemo hooks MUST be before the early return ───

  const calendarStrip = useMemo(() => {
    const now = new Date();
    const days: { date: string; dayLabel: string; hasSleep: boolean; hasMeals: boolean; hasWorkout: boolean }[] = [];
    const sleepDates = new Set((allMetrics ?? []).map((m) => m.recorded_at?.slice(0, 10)).filter(Boolean));
    const mealDates = new Set((allMeals ?? []).map((m) => m.meal_time?.slice(0, 10)).filter(Boolean));
    const workoutDates = new Set((allWorkouts ?? []).map((w) => w.workout_date?.slice(0, 10)).filter(Boolean));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        date: dateStr,
        dayLabel: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        hasSleep: sleepDates.has(dateStr),
        hasMeals: mealDates.has(dateStr),
        hasWorkout: workoutDates.has(dateStr),
      });
    }
    return days;
  }, [allMetrics, allMeals, allWorkouts]);

  // Workout sessions per day (across the selected range)
  const workoutVolumeByDay = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    for (const w of filteredWorkouts ?? []) {
      const day = (w.workout_date ?? "").slice(0, 10);
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    const days = Math.min(rangeDays, 14);
    return Array.from({ length: days }, (_, i) => {
      const d = localDay(addDays(rangeTo, -(days - 1 - i)));
      return { value: map.get(d) ?? 0, label: new Date(d).toLocaleDateString(undefined, days <= 7 ? { weekday: "narrow" } : { day: "numeric" }) };
    });
  }, [filteredWorkouts, rangeDays, rangeTo]);

  // Exercise frequency by type
  const exerciseFrequency = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of filteredWorkouts ?? []) {
      const type = w.activity_type ?? w.exercise_name ?? "Other";
      map.set(type, (map.get(type) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredWorkouts]);

  // Per-exercise max weight progression
  const exerciseMaxWeights = useMemo(() => {
    const map = new Map<string, { max: number; count: number; lastDate: string }>();
    for (const w of filteredWorkouts ?? []) {
      if (!w.weight) continue;
      const name = w.exercise_name;
      const existing = map.get(name);
      if (!existing || w.weight > existing.max) {
        map.set(name, { max: w.weight, count: (existing?.count ?? 0) + 1, lastDate: w.workout_date });
      } else {
        map.set(name, { ...existing, count: existing.count + 1 });
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].max - a[1].max);
  }, [filteredWorkouts]);

  // Muscle-group volume: count sets per muscle group from exercise_muscles mapping
  const muscleVolume = useMemo(() => {
    const muscleMap = new Map<string, number>();
    const muscleExercises = new Map<string, Set<string>>();
    for (const em of exerciseMuscles.data ?? []) {
      muscleMap.set(em.muscle_group, 0);
      const set = muscleExercises.get(em.muscle_group) ?? new Set<string>();
      set.add(em.exercise_name.trim().toLowerCase());
      muscleExercises.set(em.muscle_group, set);
    }
    for (const w of filteredWorkouts ?? []) {
      const name = w.exercise_name?.trim().toLowerCase();
      if (!name) continue;
      for (const [muscle, exercises] of muscleExercises) {
        if (exercises.has(name)) {
          muscleMap.set(muscle, (muscleMap.get(muscle) ?? 0) + 1);
        }
      }
    }
    return Array.from(muscleMap.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredWorkouts, exerciseMuscles.data]);

  // Workout streak: consecutive days with a logged workout, ending today/yesterday
  const workoutStreak = useMemo(() => {
    const days = new Set((allWorkouts ?? []).map((w) => (w.workout_date ?? "").slice(0, 10)).filter(Boolean));
    let streak = 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().slice(0, 10);
    let cursor = days.has(today) || days.has(yesterday) ? (days.has(today) ? today : yesterday) : "";
    while (cursor) {
      if (days.has(cursor)) {
        streak++;
        cursor = new Date(new Date(cursor).getTime() - 86400000).toISOString().slice(0, 10);
      } else {
        break;
      }
    }
    return streak;
  }, [allWorkouts]);

  // Daily nutrition history (calories + macros per day, across the selected range)
  const nutritionHistory = useMemo(() => {
    const map = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
    for (const m of filteredMeals ?? []) {
      const day = (m.meal_time ?? "").slice(0, 10);
      if (!day) continue;
      const existing = map.get(day) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      map.set(day, {
        calories: existing.calories + (m.calories ?? 0),
        protein: existing.protein + (m.protein ?? 0),
        carbs: existing.carbs + (m.carbs ?? 0),
        fat: existing.fat + (m.fat ?? 0),
      });
    }
    const now = new Date();
    const days = Math.min(rangeDays, 14); // cap bars at 14 for readability
    return Array.from({ length: days }, (_, i) => {
      const d = localDay(addDays(rangeTo, -(days - 1 - i)));
      const vals = map.get(d) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      return {
        label: new Date(d).toLocaleDateString(undefined, days <= 7 ? { weekday: "narrow" } : { day: "numeric" }),
        calories: Math.round(vals.calories),
        protein: Math.round(vals.protein),
        carbs: Math.round(vals.carbs),
        fat: Math.round(vals.fat),
      };
    });
  }, [filteredMeals, rangeDays, rangeTo]);

  // Recovery score: composite of sleep + HRV + RHR (0-100)
  // (must be before the early return — hooks can't be conditional)
  const recoveryScore = useMemo(() => {
    const data = metrics.data ?? [];
    const latestMetric = isCurrentDay(data[0]?.recorded_at) ? data[0] : undefined; // stale data must not count as today's
    const sleepHours = latestMetric?.sleep_duration_minutes ? latestMetric.sleep_duration_minutes / 60 : null;
    const sleepPctVal = sleepHours != null ? Math.min(100, (sleepHours / 8) * 100) : null;
    let score = 0;
    let components = 0;
    if (sleepPctVal != null) { score += sleepPctVal * 0.4; components++; }
    if (latestMetric?.hrv != null) { score += Math.min(100, (latestMetric.hrv / 60) * 100) * 0.35; components++; }
    if (latestMetric?.resting_heart_rate != null) { score += Math.max(0, 100 - (latestMetric.resting_heart_rate - 50) * 2) * 0.25; components++; }
    return components > 0 ? Math.round(score / components) : null;
  }, [metrics.data]);

  // ─── Supplement manager state (must be before early return) ───
  const [suppItems, setSuppItems] = useState<SupplementItem[]>([]);
  const [suppLoading, setSuppLoading] = useState(false);
  const [showAddSupp, setShowAddSupp] = useState(false);
  const [suppBrand, setSuppBrand] = useState("");
  const [suppName, setSuppName] = useState("");
  const [suppTime, setSuppTime] = useState<"morning" | "evening" | "anytime">("morning");
  const [suppHour, setSuppHour] = useState("8");
  const [suppLookup, setSuppLookup] = useState<SupplementItem | null>(null);
  const [suppLooking, setSuppLooking] = useState(false);
  const [suppSaving, setSuppSaving] = useState(false);
  const [suppError, setSuppError] = useState("");
  const [suppServings, setSuppServings] = useState(1); // capsule/serving count

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSuppLoading(true);
      try {
        const policy = await listSupplements();
        if (!cancelled) setSuppItems(policy.items ?? []);
      } catch {
        if (!cancelled) setSuppItems([]);
      } finally {
        if (!cancelled) setSuppLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Health recommendations (computed from latest metrics) ───
  // Simple rule-based cards: sleep debt, low HRV, high RHR, missed meals,
  // workout streak at risk. Each has a title, detail, and severity color.
  const recommendations = useMemo(() => {
    const data = metrics.data ?? [];
    const latestMetric = isCurrentDay(data[0]?.recorded_at) ? data[0] : undefined;
    const recs: { id: string; title: string; detail: string; color: string; severity: "warn" | "bad" | "good" }[] = [];
    if (!latestMetric) return recs;

    // Sleep debt: compare last sleep to 8h target
    const sleepHours = latestMetric.sleep_duration_minutes ? latestMetric.sleep_duration_minutes / 60 : null;
    if (sleepHours != null && sleepHours < 7) {
      const debt = (8 - sleepHours).toFixed(1);
      recs.push({
        id: "sleep_debt",
        title: `Sleep debt: ${debt}h short`,
        detail: sleepHours < 6 ? "Severe — prioritize an earlier bedtime tonight." : "Mild — aim to be in bed 30 min earlier tonight.",
        color: sleepHours < 6 ? colors.bad : colors.kinematic,
        severity: sleepHours < 6 ? "bad" : "warn",
      });
    }

    // Low HRV (below 30ms suggests poor recovery)
    if (latestMetric.hrv != null && latestMetric.hrv < 30) {
      recs.push({
        id: "low_hrv",
        title: `Low HRV: ${latestMetric.hrv}ms`,
        detail: "Recovery is compromised — cap caffeine after 2pm and avoid high-intensity training today.",
        color: colors.kinematic,
        severity: "warn",
      });
    }

    // High RHR (above 65 bpm at rest suggests stress/illness)
    if (latestMetric.resting_heart_rate != null && latestMetric.resting_heart_rate > 65) {
      recs.push({
        id: "high_rhr",
        title: `Elevated RHR: ${latestMetric.resting_heart_rate} bpm`,
        detail: "Could signal illness or overtraining — monitor and consider a rest day.",
        color: colors.bad,
        severity: "bad",
      });
    }

    // Positive reinforcement when recovery is good
    if (recoveryScore != null && recoveryScore >= 80) {
      recs.push({
        id: "good_recovery",
        title: `Recovery score ${recoveryScore}/100`,
        detail: "You're well-recovered — a good day for higher-intensity training.",
        color: colors.good,
        severity: "good",
      });
    }

    return recs;
  }, [metrics.data, recoveryScore, colors.bad, colors.good, colors.kinematic]);

  if (loading) return <LoadingState label="Loading Health…" />;

  // ─── Computed values (after early return — no hooks here) ───

  const latestAny = allMetrics?.[0];
  // Hero rings show today's record only. An older one is NOT presented as current; we say how old it is instead.
  const latest = isCurrentDay(latestAny?.recorded_at) ? latestAny : undefined;
  const staleSleepNote = latestAny && !latest
    ? `No sleep logged today · last data ${new Date(latestAny.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} (${daysOld(latestAny.recorded_at)}d ago)`
    : !latestAny ? "No sleep data yet" : null;
  const chronological = [...(filteredMetrics ?? [])].reverse();

  const sleepChartData = chronological
    .filter((m) => m.sleep_duration_minutes != null)
    .map((m) => ({ value: Number((m.sleep_duration_minutes! / 60).toFixed(1)) }));
  const avgSleepHrs = mean(sleepChartData.map((d) => d.value));
  const sleepTrend = trend(sleepChartData.map((d) => d.value));

  const hrChartData = chronological
    .filter((m) => m.resting_heart_rate != null)
    .map((m) => ({ value: m.resting_heart_rate! }));
  const hrValues = chronological.map((m) => m.resting_heart_rate).filter((v): v is number => v != null);
  const hrRange = hrValues.length > 1 ? `${Math.min(...hrValues)}–${Math.max(...hrValues)}` : undefined;
  const avgHr = mean(hrValues);
  const hrTrend = trend(hrValues);

  const hrvChartData = chronological
    .filter((m) => m.hrv != null)
    .map((m) => ({ value: m.hrv! }));
  const hrvValues = chronological.map((m) => m.hrv).filter((v): v is number => v != null);
  const hrvRange = hrvValues.length > 1 ? `${Math.min(...hrvValues)}–${Math.max(...hrvValues)}` : undefined;
  const avgHrv = mean(hrvValues);
  const hrvTrend = trend(hrvValues);

  const weightChartData = chronological
    .filter((m) => m.body_weight_kg != null)
    .map((m) => ({ value: m.body_weight_kg! }));
  const weightValues = chronological.map((m) => m.body_weight_kg).filter((v): v is number => v != null);
  const avgWeight = mean(weightValues);
  const weightTrend = trend(weightValues);

  const targetWeight = profile.data?.target_weight_kg;
  const weightDelta =
    latest?.body_weight_kg != null && targetWeight != null ? latest.body_weight_kg - targetWeight : undefined;

  // ─── Supplement manager handlers (state is above early return) ───
  const doLookup = async () => {
    if (!suppBrand.trim() || !suppName.trim()) return;
    setSuppLooking(true);
    setSuppError("");
    setSuppLookup(null);
    try {
      const result = await lookupSupplement(suppBrand.trim(), suppName.trim());
      setSuppLookup(result);
    } catch (e: any) {
      setSuppError(e?.message ?? "Lookup failed");
    } finally {
      setSuppLooking(false);
    }
  };

  const confirmAddSupp = async () => {
    if (!suppLookup) return;
    setSuppSaving(true);
    setSuppError("");
    try {
      const hour = parseInt(suppHour, 10) || (suppTime === "morning" ? 8 : suppTime === "evening" ? 21 : 12);
      // Multiply per-serving values by the capsule/serving count
      const scaled: SupplementItem = {
        ...suppLookup,
        servings_per_dose: suppServings,
        calories: suppLookup.calories * suppServings,
        protein: suppLookup.protein * suppServings,
        carbs: suppLookup.carbs * suppServings,
        fat: suppLookup.fat * suppServings,
        micronutrients: Object.fromEntries(
          Object.entries(suppLookup.micronutrients).map(([k, v]) => [k, v * suppServings]),
        ),
      };
      const added = await addSupplement(scaled, suppTime, hour);
      setSuppItems((prev) => [...prev, added]);
      setShowAddSupp(false);
      setSuppBrand("");
      setSuppName("");
      setSuppLookup(null);
      setSuppTime("morning");
      setSuppHour("8");
      setSuppServings(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setSuppError(e?.message ?? "Failed to add");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSuppSaving(false);
    }
  };

  const doRemoveSupp = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await removeSupplement(id);
      setSuppItems((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  };

  const cancelAddSupp = () => {
    setShowAddSupp(false);
    setSuppBrand("");
    setSuppName("");
    setSuppLookup(null);
    setSuppError("");
    setSuppTime("morning");
    setSuppHour("8");
    setSuppServings(1);
  };

  const startWeight = weightValues.length > 0 ? weightValues[0] : null;
  const totalWeightChange = latest?.body_weight_kg != null && startWeight != null
    ? latest.body_weight_kg - startWeight
    : undefined;

  const weightEntries = chronological
    .map((m) => ({ date: m.recorded_at, weight: m.body_weight_kg }))
    .filter((e): e is { date: string; weight: number } => typeof e.weight === "number" && e.weight > 0);
  const latestWeightEntry = weightEntries[weightEntries.length - 1];
  const weight7dAgo = weightEntries.find((e) => {
    const days = (new Date(latestWeightEntry?.date ?? 0).getTime() - new Date(e.date).getTime()) / 86400000;
    return days >= 6 && days <= 8;
  });
  const weight30dAgo = weightEntries.find((e) => {
    const days = (new Date(latestWeightEntry?.date ?? 0).getTime() - new Date(e.date).getTime()) / 86400000;
    return days >= 25 && days <= 35;
  });
  const change7d = latestWeightEntry && weight7dAgo ? latestWeightEntry.weight - weight7dAgo.weight : undefined;
  const change30d = latestWeightEntry && weight30dAgo ? latestWeightEntry.weight - weight30dAgo.weight : undefined;

  // Fuel data: cumulative totals across the selected range
  const allMealsData = filteredMeals;
  const fuelCalories = allMealsData.reduce((a, m) => a + (m.calories ?? 0), 0);
  const fuelProtein = allMealsData.reduce((a, m) => a + (m.protein ?? 0), 0);
  const fuelCarbs = allMealsData.reduce((a, m) => a + (m.carbs ?? 0), 0);
  const fuelFat = allMealsData.reduce((a, m) => a + (m.fat ?? 0), 0);

  // Scale targets by the number of days in the range
  const fuelDays = isToday ? 1 : rangeDays;
  const targetCalories = profile.data?.daily_caloric_target ? profile.data.daily_caloric_target * fuelDays : null;
  const targetProtein = profile.data?.protein_target_g ? profile.data.protein_target_g * fuelDays : null;
  const targetCarbs = profile.data?.carbs_target_g ? profile.data.carbs_target_g * fuelDays : null;
  const targetFat = profile.data?.fat_target_g ? profile.data.fat_target_g * fuelDays : null;

  // For display: show cumulative for non-today, actual for today
  const displayCalories = fuelCalories;
  const displayProtein = fuelProtein;
  const displayCarbs = fuelCarbs;
  const displayFat = fuelFat;

  const nStatus = nutritionStatus(filteredMeals, profile.data ?? undefined);
  const sStatus = sleepStatus(latest);

  const hasTargets = !!(profile.data?.daily_caloric_target || profile.data?.protein_target_g);
  const hasFuelData = allMealsData.length > 0;

  // Micronutrient coverage from the range-filtered meals (cumulative %DV)
  const microCoverage = PRIORITY_NUTRIENTS.map(({ key, label }) => {
    const values = allMealsData
      .map((m) => m.micronutrients?.[key])
      .filter((v): v is number => typeof v === "number");
    if (values.length === 0) return null;
    const totalPct = values.reduce((a, v) => a + v, 0);
    // For non-today, show average daily coverage
    const pct = isToday ? Math.min(100, totalPct) : Math.min(100, totalPct / Math.max(1, new Set(allMealsData.map((m) => (m.meal_time ?? "").slice(0, 10))).size));
    return { label, pct };
  }).filter((x): x is { label: string; pct: number } => x != null);

  const prItems = detectPRs(workouts.data ?? []);
  const worstSeverity = [nStatus?.severity, sStatus?.severity].includes("bad") ? "bad" : [nStatus?.severity, sStatus?.severity].includes("warn") ? "warn" : "good";
  const statusColor = worstSeverity === "bad" ? colors.bad : worstSeverity === "warn" ? colors.kinematic : colors.good;
  const statusLabel = worstSeverity === "bad" ? "ATTENTION" : worstSeverity === "warn" ? "WATCH" : "NOMINAL";

  // Ring progress values (cumulative vs scaled targets)
  const sleepHours = latest?.sleep_duration_minutes ? latest.sleep_duration_minutes / 60 : null;
  const sleepPct = sleepHours != null ? Math.min(100, (sleepHours / 8) * 100) : null;
  const calPct = targetCalories ? Math.min(100, (displayCalories / targetCalories) * 100) : null;
  const proteinPct = targetProtein ? Math.min(100, (displayProtein / targetProtein) * 100) : null;
  const carbsPct = targetCarbs ? Math.min(100, (displayCarbs / targetCarbs) * 100) : null;
  const fatPct = targetFat ? Math.min(100, (displayFat / targetFat) * 100) : null;

  // Macro breakdown percentages
  const macroTotal = displayProtein + displayCarbs + displayFat;
  const proteinMacroPct = macroTotal > 0 ? (displayProtein / macroTotal) * 100 : 0;
  const carbsMacroPct = macroTotal > 0 ? (displayCarbs / macroTotal) * 100 : 0;
  const fatMacroPct = macroTotal > 0 ? (displayFat / macroTotal) * 100 : 0;

  // Data completeness: how many of the last N days have data
  const dataCompleteness = Math.round((chronological.length / rangeDays) * 100);

  // Workout / meal counts used in the UI
  const totalWorkouts = filteredWorkouts.length ?? 0;
  const totalMeals = filteredMeals.length ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
      {firstError ? <ErrorBanner message={firstError} /> : null}

      {/* ═══════════════════════════════════════════════════
          ╗ HERO: Vital Signs + Recovery Score + Calendar Strip
          ═══════════════════════════════════════════════════ */}
      <View style={[styles.heroCard, { backgroundColor: colors.focus }]}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroEyebrow}>VITAL SIGNS</Text>
            <Text style={styles.heroTitle}>Bio Status</Text>
          </View>
          {recoveryScore != null ? (
            <View style={styles.recoveryBadge}>
              <Text style={styles.recoveryScore}>{recoveryScore}</Text>
              <Text style={styles.recoveryLabel}>RECOVERY</Text>
            </View>
          ) : (
            <View style={styles.heroStatusPill}>
              <Text style={styles.heroStatusPillText}>{statusLabel}</Text>
            </View>
          )}
        </View>

        {/* 7-day calendar strip */}
        <View style={styles.calendarStrip}>
          {calendarStrip.map((day) => {
            const hasAny = day.hasSleep || day.hasMeals || day.hasWorkout;
            const count = [day.hasSleep, day.hasMeals, day.hasWorkout].filter(Boolean).length;
            return (
              <View key={day.date} style={styles.calendarDay}>
                <Text style={styles.calendarDayLabel}>{day.dayLabel}</Text>
                <View style={[styles.calendarDot, hasAny ? styles.calendarDotActive : null, count === 3 ? styles.calendarDotFull : null]}>
                  {day.hasSleep ? <View style={[styles.calendarDotInner, { backgroundColor: withAlpha("#FFFFFF", 0.9) }]} /> : null}
                  {day.hasMeals ? <View style={[styles.calendarDotInner, { backgroundColor: withAlpha("#FFFFFF", 0.6) }]} /> : null}
                  {day.hasWorkout ? <View style={[styles.calendarDotInner, { backgroundColor: withAlpha("#FFFFFF", 0.4) }]} /> : null}
                </View>
              </View>
            );
          })}
        </View>

        {staleSleepNote ? <Text style={styles.heroStale}>{staleSleepNote}</Text> : null}
        {/* 4 vital rings */}
        <View style={styles.heroRingsRow}>
          <View style={styles.heroRingItem}>
            <Ring progress={sleepPct ?? 0} size={64} strokeWidth={6} color={withAlpha("#FFFFFF", 0.9)} track={withAlpha("#FFFFFF", 0.2)}>
              <View style={styles.heroRingInner}>
                <Moon size={14} color={withAlpha("#FFFFFF", 0.7)} />
                <Text style={styles.heroRingValue}>{sleepHours != null ? sleepHours.toFixed(1) : "—"}</Text>
                <Text style={styles.heroRingUnit}>h</Text>
              </View>
            </Ring>
            <Text style={styles.heroRingLabel}>SLEEP</Text>
            {sleepTrend ? <TrendArrow trend={sleepTrend} /> : null}
          </View>

          <View style={styles.heroRingItem}>
            <Ring progress={latest?.resting_heart_rate ? Math.min(100, (latest.resting_heart_rate / 100) * 100) : 0} size={64} strokeWidth={6} color={withAlpha("#FFFFFF", 0.9)} track={withAlpha("#FFFFFF", 0.2)}>
              <View style={styles.heroRingInner}>
                <HeartPulse size={14} color={withAlpha("#FFFFFF", 0.7)} />
                <Text style={styles.heroRingValue}>{latest?.resting_heart_rate ?? "—"}</Text>
                <Text style={styles.heroRingUnit}>bpm</Text>
              </View>
            </Ring>
            <Text style={styles.heroRingLabel}>RHR</Text>
            {hrTrend ? <TrendArrow trend={hrTrend} invert /> : null}
          </View>

          <View style={styles.heroRingItem}>
            <Ring progress={latest?.hrv ? Math.min(100, (latest.hrv / 100) * 100) : 0} size={64} strokeWidth={6} color={withAlpha("#FFFFFF", 0.9)} track={withAlpha("#FFFFFF", 0.2)}>
              <View style={styles.heroRingInner}>
                <Activity size={14} color={withAlpha("#FFFFFF", 0.7)} />
                <Text style={styles.heroRingValue}>{latest?.hrv ?? "—"}</Text>
                <Text style={styles.heroRingUnit}>ms</Text>
              </View>
            </Ring>
            <Text style={styles.heroRingLabel}>HRV</Text>
            {hrvTrend ? <TrendArrow trend={hrvTrend} /> : null}
          </View>

          <View style={styles.heroRingItem}>
            <Ring progress={weightDelta != null ? Math.min(100, Math.abs(weightDelta) * 10) : 0} size={64} strokeWidth={6} color={withAlpha("#FFFFFF", 0.9)} track={withAlpha("#FFFFFF", 0.2)}>
              <View style={styles.heroRingInner}>
                <Scale size={14} color={withAlpha("#FFFFFF", 0.7)} />
                <Text style={styles.heroRingValue}>{latest?.body_weight_kg ?? "—"}</Text>
                <Text style={styles.heroRingUnit}>kg</Text>
              </View>
            </Ring>
            <Text style={styles.heroRingLabel}>WEIGHT</Text>
            {weightTrend ? <TrendArrow trend={weightTrend} /> : null}
          </View>
        </View>

        {/* Avg stats row */}
        {(avgSleepHrs != null || avgHr != null || avgHrv != null) ? (
          <View style={styles.heroStatsRow}>
            {avgSleepHrs != null ? (
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>AVG SLEEP</Text>
                <Text style={styles.heroStatValue}>{avgSleepHrs.toFixed(1)}h</Text>
              </View>
            ) : null}
            {avgHr != null ? (
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>AVG RHR</Text>
                <Text style={styles.heroStatValue}>{avgHr.toFixed(0)} bpm</Text>
              </View>
            ) : null}
            {avgHrv != null ? (
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>AVG HRV</Text>
                <Text style={styles.heroStatValue}>{avgHrv.toFixed(0)} ms</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ═══════════════════════════════════════════════════
          ║ RECOMMENDATIONS + WORKOUT STREAK
          ═══════════════════════════════════════════════════ */}
      {recommendations.length > 0 ? (
        <>
          <SectionLabel title="Recommendations" subtitle={`${recommendations.length} insight${recommendations.length === 1 ? "" : "s"}`} />
          {recommendations.map((r) => (
            <AccentCard
              key={r.id}
              tier={r.severity === "bad" ? "critical" : "standard"}
              color={r.color}
              badgeLabel={r.severity === "good" ? "READY" : r.severity === "warn" ? "WATCH" : "ATTENTION"}
              title={r.title}
              detail={r.detail}
            />
          ))}
        </>
      ) : null}

      {workoutStreak > 0 ? (
        <AccentCard
          tier="standard"
          color={colors.nutrition}
          badgeLabel="STREAK"
          metaRight={`${workoutStreak} day${workoutStreak === 1 ? "" : "s"}`}
          title={`Workout streak: ${workoutStreak} day${workoutStreak === 1 ? "" : "s"}`}
          detail={workoutStreak >= 3 ? "Momentum is building — keep it going today." : "Log a workout today to start a streak."}
        />
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ TREND CHARTS (range-selectable)
          ═══════════════════════════════════════════════════ */}
      <View style={styles.rangeRow}>
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
        {range === "custom" ? (
          <DateRangePicker
            from={customFrom}
            to={customTo}
            onChange={(f, t) => {
              setCustomFrom(f);
              setCustomTo(t);
            }}
          />
        ) : null}
        {isUpdating ? (
          <View style={styles.updatingPill}>
            <ActivityIndicator size="small" color={colors.focus} />
            <Text style={styles.updatingText}>Updating…</Text>
          </View>
        ) : null}
      </View>

      {/* Sleep chart with sparkline + trend */}
      {sleepChartData.length >= 2 ? (
        <Surface style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Moon size={14} color={colors.focus} />
            <Text style={styles.chartTitle}>Sleep duration</Text>
            {sleepTrend ? (
              <View style={[styles.trendPill, { backgroundColor: withAlpha(sleepTrend === "up" ? colors.good : colors.bad, 0.1) }]}>
                {sleepTrend === "up" ? <TrendingUp size={10} color={colors.good} /> : <TrendingDown size={10} color={colors.bad} />}
                <Text style={[styles.trendPillText, { color: sleepTrend === "up" ? colors.good : colors.bad }]}>
                  {sleepTrend === "up" ? "Improving" : "Declining"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.chartRange}>{rangeShort}</Text>
          </View>
          <LineChart
            data={sleepChartData}
            width={CHART_WIDTH}
            height={120}
            color={colors.focus}
            thickness={2}
            areaChart
            startFillColor={colors.focus}
            startOpacity={0.2}
            endOpacity={0}
            hideYAxisText
            hideRules
            xAxisColor="transparent"
            yAxisColor="transparent"
            initialSpacing={0}
            dataPointsColor={colors.focus}
          />
          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterLabel}>Target: 8h</Text>
            {avgSleepHrs != null ? <Text style={styles.chartFooterValue}>Avg {avgSleepHrs.toFixed(1)}h</Text> : null}
          </View>
        </Surface>
      ) : null}

      {/* HR chart */}
      {hrChartData.length >= 2 ? (
        <Surface style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <HeartPulse size={14} color={colors.cardio} />
            <Text style={styles.chartTitle}>Resting heart rate</Text>
            {hrTrend ? (
              <View style={[styles.trendPill, { backgroundColor: withAlpha(hrTrend === "down" ? colors.good : colors.bad, 0.1) }]}>
                {hrTrend === "down" ? <TrendingDown size={10} color={colors.good} /> : <TrendingUp size={10} color={colors.bad} />}
                <Text style={[styles.trendPillText, { color: hrTrend === "down" ? colors.good : colors.bad }]}>
                  {hrTrend === "down" ? "Improving" : "Rising"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.chartRange}>{rangeShort}</Text>
          </View>
          <LineChart
            data={hrChartData}
            width={CHART_WIDTH}
            height={120}
            color={colors.cardio}
            thickness={2}
            hideYAxisText
            hideRules
            xAxisColor="transparent"
            yAxisColor="transparent"
            initialSpacing={0}
            dataPointsColor={colors.cardio}
          />
          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterLabel}>Optimal: 50-70 bpm</Text>
            {hrRange ? <Text style={styles.chartFooterValue}>Range {hrRange}</Text> : null}
          </View>
        </Surface>
      ) : null}

      {/* HRV chart */}
      {hrvChartData.length >= 2 ? (
        <Surface style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Activity size={14} color={colors.nutrition} />
            <Text style={styles.chartTitle}>Heart rate variability</Text>
            {hrvTrend ? (
              <View style={[styles.trendPill, { backgroundColor: withAlpha(hrvTrend === "up" ? colors.good : colors.bad, 0.1) }]}>
                {hrvTrend === "up" ? <TrendingUp size={10} color={colors.good} /> : <TrendingDown size={10} color={colors.bad} />}
                <Text style={[styles.trendPillText, { color: hrvTrend === "up" ? colors.good : colors.bad }]}>
                  {hrvTrend === "up" ? "Improving" : "Declining"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.chartRange}>{rangeShort}</Text>
          </View>
          <LineChart
            data={hrvChartData}
            width={CHART_WIDTH}
            height={120}
            color={colors.nutrition}
            thickness={2}
            areaChart
            startFillColor={colors.nutrition}
            startOpacity={0.15}
            endOpacity={0}
            hideYAxisText
            hideRules
            xAxisColor="transparent"
            yAxisColor="transparent"
            initialSpacing={0}
            dataPointsColor={colors.nutrition}
          />
          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterLabel}>Higher = better recovery</Text>
            {hrvRange ? <Text style={styles.chartFooterValue}>Range {hrvRange} ms</Text> : null}
          </View>
        </Surface>
      ) : null}

      {/* Weight chart */}
      {weightChartData.length >= 2 ? (
        <Surface style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Scale size={14} color={colors.kinematic} />
            <Text style={styles.chartTitle}>Body weight</Text>
            {targetWeight ? (
              <View style={styles.targetPill}>
                <Target size={10} color={colors.kinematic} />
                <Text style={styles.targetPillText}>{targetWeight}kg</Text>
              </View>
            ) : null}
            <Text style={styles.chartRange}>{rangeShort}</Text>
          </View>
          <LineChart
            data={weightChartData}
            width={CHART_WIDTH}
            height={120}
            color={colors.kinematic}
            thickness={2}
            areaChart
            startFillColor={colors.kinematic}
            startOpacity={0.15}
            endOpacity={0}
            hideYAxisText
            hideRules
            xAxisColor="transparent"
            yAxisColor="transparent"
            initialSpacing={0}
            dataPointsColor={colors.kinematic}
          />
          <View style={styles.chartFooter}>
            {avgWeight != null ? <Text style={styles.chartFooterLabel}>Avg {avgWeight.toFixed(1)}kg</Text> : null}
            {totalWeightChange != null ? (
              <Text style={[styles.chartFooterValue, { color: totalWeightChange <= 0 ? colors.good : colors.bad }]}>
                {totalWeightChange <= 0 ? "↓" : "↑"} {Math.abs(totalWeightChange).toFixed(1)}kg
              </Text>
            ) : null}
          </View>
        </Surface>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ FUEL PACING — Macros with rings + bars (range-aware)
          ═══════════════════════════════════════════════════ */}
      <SectionLabel title="Fuel pacing" subtitle={hasTargets ? (isToday ? `${(dayFractionNow() * 100).toFixed(0)}% of day elapsed` : `Daily avg over ${rangeLong}`) : undefined} />
      {!hasTargets ? (
        <Surface style={styles.emptyCard}>
          <Flame size={24} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No targets set</Text>
          <Text style={styles.emptyBody}>Set daily caloric and macro targets in Settings to see pacing here.</Text>
          <PrimaryButton label="Set targets" onPress={() => router.push("/settings/targets")} />
        </Surface>
      ) : !hasFuelData ? (
        <Surface style={styles.emptyCard}>
          <Utensils size={24} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No meals in this range</Text>
          <Text style={styles.emptyBody}>Log a meal in Ingest to see macro pacing and breakdown.</Text>
          <PrimaryButton label="Log a meal" onPress={() => router.push("/chat")} />
        </Surface>
      ) : (
        <>
          {/* 4 macro ring pods */}
          <View style={styles.macroRings}>
            <View style={styles.macroRingPod}>
              <View style={styles.macroRingHeader}>
                <Flame size={12} color={colors.kinematic} />
                <Text style={styles.macroRingLabel}>CALORIES</Text>
              </View>
              <Ring progress={calPct ?? 0} size={56} strokeWidth={5} color={colors.kinematic}>
                <Text style={styles.macroRingValue}>{Math.round(displayCalories)}</Text>
                <Text style={styles.macroRingUnit}>kcal</Text>
              </Ring>
              <Text style={styles.macroRingCaption}>{targetCalories ? `${Math.round(displayCalories)}/${Math.round(targetCalories)}` : "—"}</Text>
            </View>
            <View style={styles.macroRingPod}>
              <View style={styles.macroRingHeader}>
                <Activity size={12} color={colors.nutrition} />
                <Text style={styles.macroRingLabel}>PROTEIN</Text>
              </View>
              <Ring progress={proteinPct ?? 0} size={56} strokeWidth={5} color={colors.nutrition}>
                <Text style={styles.macroRingValue}>{Math.round(displayProtein)}</Text>
                <Text style={styles.macroRingUnit}>g</Text>
              </Ring>
              <Text style={styles.macroRingCaption}>{targetProtein ? `${Math.round(displayProtein)}/${Math.round(targetProtein)}g` : "—"}</Text>
            </View>
            <View style={styles.macroRingPod}>
              <View style={styles.macroRingHeader}>
                <Zap size={12} color={colors.trends} />
                <Text style={styles.macroRingLabel}>CARBS</Text>
              </View>
              <Ring progress={carbsPct ?? 0} size={56} strokeWidth={5} color={colors.trends}>
                <Text style={styles.macroRingValue}>{Math.round(displayCarbs)}</Text>
                <Text style={styles.macroRingUnit}>g</Text>
              </Ring>
              <Text style={styles.macroRingCaption}>{targetCarbs ? `${Math.round(displayCarbs)}/${Math.round(targetCarbs)}g` : "—"}</Text>
            </View>
            <View style={styles.macroRingPod}>
              <View style={styles.macroRingHeader}>
                <DropletIcon color={colors.cardio} />
                <Text style={styles.macroRingLabel}>FAT</Text>
              </View>
              <Ring progress={fatPct ?? 0} size={56} strokeWidth={5} color={colors.cardio}>
                <Text style={styles.macroRingValue}>{Math.round(displayFat)}</Text>
                <Text style={styles.macroRingUnit}>g</Text>
              </Ring>
              <Text style={styles.macroRingCaption}>{targetFat ? `${Math.round(displayFat)}/${Math.round(targetFat)}g` : "—"}</Text>
            </View>
          </View>

          {/* Macro split bar */}
          {macroTotal > 0 ? (
            <Surface style={styles.macroSplitCard}>
              <Text style={styles.macroSplitTitle}>MACRO SPLIT</Text>
              <PacingBar
                height={10}
                segments={[
                  { value: proteinMacroPct, color: colors.nutrition },
                  { value: carbsMacroPct, color: colors.trends },
                  { value: fatMacroPct, color: colors.cardio },
                ]}
              />
              <View style={styles.macroSplitLegend}>
                <View style={styles.macroSplitLegendItem}>
                  <Dot color={colors.nutrition} size={7} />
                  <Text style={styles.macroSplitLegendText}>Protein {Math.round(proteinMacroPct)}%</Text>
                </View>
                <View style={styles.macroSplitLegendItem}>
                  <Dot color={colors.trends} size={7} />
                  <Text style={styles.macroSplitLegendText}>Carbs {Math.round(carbsMacroPct)}%</Text>
                </View>
                <View style={styles.macroSplitLegendItem}>
                  <Dot color={colors.cardio} size={7} />
                  <Text style={styles.macroSplitLegendText}>Fat {Math.round(fatMacroPct)}%</Text>
                </View>
              </View>
            </Surface>
          ) : null}

          {/* Pacing detail card */}
          <AccentCard
            tier={nStatus?.severity === "bad" ? "critical" : "standard"}
            color={nStatus ? (nStatus.severity === "bad" ? colors.bad : colors.warn) : colors.good}
            badgeLabel={nStatus ? nStatus.severity.toUpperCase() : "ON PACE"}
            title={nStatus ? nStatus.title : isToday ? "On pace for today's targets" : `Cumulative vs ${fuelDays}x daily targets`}
            detail={nStatus ? nStatus.detail : `${Math.round(displayCalories)} kcal · ${Math.round(displayProtein)}g protein ${isToday ? "today" : `over ${fuelDays} days`}`}
            footer={
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {isToday ? (
                  <>
                    <MetaRow label="Day elapsed" value={`${(dayFractionNow() * 100).toFixed(0)}%`} />
                    <PacingBar segments={[{ value: dayFractionNow() * 100, color: colors.kinematic }]} />
                  </>
                ) : (
                  <MetaRow label="Period" value={`${fuelDays} days · targets scaled`} />
                )}
                {targetCalories ? (
                  <View style={{ marginTop: spacing.xs }}>
                    <MetaRow label="Calories" value={`${Math.round(displayCalories)} / ${Math.round(targetCalories)}kcal`} />
                    <PacingBar segments={[{ value: (displayCalories / targetCalories) * 100, color: colors.trends }]} />
                  </View>
                ) : null}
                {targetProtein ? (
                  <View style={{ marginTop: spacing.xs }}>
                    <MetaRow label="Protein" value={`${Math.round(displayProtein)} / ${Math.round(targetProtein)}g`} />
                    <PacingBar segments={[{ value: (displayProtein / targetProtein) * 100, color: colors.cardio }]} />
                  </View>
                ) : null}
                {targetCarbs ? (
                  <View style={{ marginTop: spacing.xs }}>
                    <MetaRow label="Carbs" value={`${Math.round(displayCarbs)} / ${Math.round(targetCarbs)}g`} />
                    <PacingBar segments={[{ value: (displayCarbs / targetCarbs) * 100, color: colors.kinematic }]} />
                  </View>
                ) : null}
                {targetFat ? (
                  <View style={{ marginTop: spacing.xs }}>
                    <MetaRow label="Fat" value={`${Math.round(displayFat)} / ${Math.round(targetFat)}g`} />
                    <PacingBar segments={[{ value: (displayFat / targetFat) * 100, color: colors.nutrition }]} />
                  </View>
                ) : null}
              </View>
            }
          />
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          ║ CALORIE HISTORY (7-day bar chart)
          ═══════════════════════════════════════════════════ */}
      {nutritionHistory.some((d) => d.calories > 0 || d.protein > 0) ? (
        <>
          <SectionLabel title="Nutrition history" subtitle={`Daily breakdown (${rangeShort})`} />
          <Surface style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Flame size={14} color={colors.kinematic} />
              <Text style={styles.chartTitle}>Calories & macros</Text>
              {profile.data?.daily_caloric_target ? (
                <Text style={styles.chartRange}>TGT {profile.data.daily_caloric_target}</Text>
              ) : null}
            </View>
            {/* Calories bar chart with macro line overlays */}
            <BarChart
              data={nutritionHistory.map((d) => ({
                value: d.calories,
                label: d.label,
                frontColor: withAlpha(colors.kinematic, 0.7),
                topLabelComponent: () => <Text style={styles.barTopLabel}>{d.calories > 0 ? d.calories : ""}</Text>,
              }))}
              width={CHART_WIDTH}
              height={140}
              barWidth={Math.max(8, Math.min(24, CHART_WIDTH / nutritionHistory.length - 6))}
              spacing={Math.max(4, Math.min(12, CHART_WIDTH / nutritionHistory.length - 8))}
              frontColor={colors.kinematic}
              hideYAxisText
              hideRules
              xAxisColor="transparent"
              yAxisColor="transparent"
              initialSpacing={0}
              showLine
              lineData={nutritionHistory.map((d) => ({ value: d.protein }))}
              lineConfig={{ curved: true, color: colors.nutrition, thickness: 2, dataPointsColor: colors.nutrition, dataPointsRadius: 2 }}
              lineData2={nutritionHistory.map((d) => ({ value: d.carbs }))}
              lineConfig2={{ curved: true, color: colors.trends, thickness: 1.5, dataPointsColor: colors.trends, dataPointsRadius: 2 }}
            />
            <View style={styles.nutritionLegend}>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendBar, { backgroundColor: colors.kinematic }]} />
                <Text style={styles.nutritionLegendText}>Calories</Text>
              </View>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendLine, { backgroundColor: colors.nutrition }]} />
                <Text style={styles.nutritionLegendText}>Protein (g)</Text>
              </View>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendLine, { backgroundColor: colors.trends }]} />
                <Text style={styles.nutritionLegendText}>Carbs (g)</Text>
              </View>
            </View>
          </Surface>

          {/* Macro breakdown bars (grams per day) */}
          <Surface style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Activity size={14} color={colors.nutrition} />
              <Text style={styles.chartTitle}>Macro breakdown (g)</Text>
              <Text style={styles.chartRange}>{rangeShort}</Text>
            </View>
            <BarChart
              data={nutritionHistory.map((d) => ({
                value: d.protein,
                label: d.label,
                frontColor: withAlpha(colors.nutrition, 0.7),
              }))}
              width={CHART_WIDTH}
              height={120}
              barWidth={Math.max(8, Math.min(24, CHART_WIDTH / nutritionHistory.length - 6))}
              spacing={Math.max(4, Math.min(12, CHART_WIDTH / nutritionHistory.length - 8))}
              frontColor={colors.nutrition}
              hideYAxisText
              hideRules
              xAxisColor="transparent"
              yAxisColor="transparent"
              initialSpacing={0}
              showLine
              lineData={nutritionHistory.map((d) => ({ value: d.carbs }))}
              lineConfig={{ curved: true, color: colors.trends, thickness: 2, dataPointsColor: colors.trends, dataPointsRadius: 2 }}
              lineData2={nutritionHistory.map((d) => ({ value: d.fat }))}
              lineConfig2={{ curved: true, color: colors.cardio, thickness: 1.5, dataPointsColor: colors.cardio, dataPointsRadius: 2 }}
            />
            <View style={styles.nutritionLegend}>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendBar, { backgroundColor: colors.nutrition }]} />
                <Text style={styles.nutritionLegendText}>Protein (g)</Text>
              </View>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendLine, { backgroundColor: colors.trends }]} />
                <Text style={styles.nutritionLegendText}>Carbs (g)</Text>
              </View>
              <View style={styles.nutritionLegendItem}>
                <View style={[styles.nutritionLegendLine, { backgroundColor: colors.cardio }]} />
                <Text style={styles.nutritionLegendText}>Fat (g)</Text>
              </View>
            </View>
          </Surface>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ MICRONUTRIENT COVERAGE
          ═══════════════════════════════════════════════════ */}
      {microCoverage.length > 0 ? (
        <>
          <SectionLabel title="Micronutrient coverage" subtitle={isToday ? "Today, priority nutrients" : `${rangeHyphen} avg, priority nutrients`} />
          <Surface style={styles.microCard}>
            {microCoverage.map((m) => (
              <View key={m.label} style={styles.microRow}>
                <View style={styles.microRowHeader}>
                  <Text style={styles.microLabel}>{m.label}</Text>
                  <Text style={[styles.microPct, { color: coverageColor(m.pct) }]}>{Math.round(m.pct)}%</Text>
                </View>
                <PacingBar segments={[{ value: m.pct, color: coverageColor(m.pct) }]} />
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ STRENGTH TELEMETRY — PRs + max weights + volume
          ═══════════════════════════════════════════════════ */}
      {prItems.length > 0 ? (
        <>
          <SectionLabel title="Strength telemetry" subtitle="PR cycle active" />
          <View style={styles.prBanner}>
            <View style={styles.prBannerLeft}>
              <Trophy size={16} color={colors.good} />
              <Text style={styles.prBannerText}>NEW PR</Text>
            </View>
            <Text style={styles.prDetail} numberOfLines={1}>{prItems[0].detail}</Text>
            {prItems.length > 1 ? (
              <View style={styles.prCount}>
                <Text style={styles.prCountText}>+{prItems.length - 1}</Text>
              </View>
            ) : null}
          </View>
          {prItems.slice(1).map((pr) => (
            <AccentCard key={pr.key} tier="standard" color={colors.good} badgeLabel="PR" title={pr.title} detail={pr.detail} />
          ))}
        </>
      ) : null}

      {/* Exercise max weights */}
      {exerciseMaxWeights.length > 0 ? (
        <>
          <SectionLabel title="Lift ledger" subtitle={`Max weight per exercise (${rangeShort})`} />
          <Surface style={{ paddingVertical: 0 }}>
            {exerciseMaxWeights.map(([name, info], i) => (
              <View key={name}>
                <ListRow
                  icon={<Dumbbell size={14} color={colors.kinematic} />}
                  title={name}
                  subtitle={`${info.count} sets · ${fmtShortDate(info.lastDate)}`}
                  trailing={`${info.max}kg`}
                  trailingColor={colors.kinematic}
                />
                {i < exerciseMaxWeights.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      {/* Training insights: streak + muscle volume */}
      {(workoutStreak > 0 || muscleVolume.length > 0) ? (
        <>
          <SectionLabel title="Training insights" />
          <View style={styles.trainingInsightRow}>
            {workoutStreak > 0 ? (
              <Surface style={styles.trainingInsightCard}>
                <Text style={styles.trainingInsightValue}>{workoutStreak}</Text>
                <Text style={styles.trainingInsightLabel}>DAY STREAK</Text>
                <Text style={styles.trainingInsightSub}>{workoutStreak === 1 ? "Keep the chain going" : "Consecutive days with a workout"}</Text>
              </Surface>
            ) : null}
            {muscleVolume.length > 0 ? (
              <Surface style={[styles.trainingInsightCard, { flex: 1.4 }]}>
                <Text style={styles.trainingInsightLabel}>MUSCLE VOLUME</Text>
                <View style={styles.muscleVolumeRow}>
                  {muscleVolume.slice(0, 4).map(([muscle, sets], i) => (
                    <View key={muscle} style={styles.muscleVolumeItem}>
                      <Text style={styles.muscleVolumeSets}>{sets}</Text>
                      <Text style={styles.muscleVolumeMuscle} numberOfLines={1}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              </Surface>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Workout frequency bar chart */}
      {workoutVolumeByDay.some((d) => d.value > 0) ? (
        <>
          <SectionLabel title="Training frequency" subtitle={`Sessions per day (${rangeShort})`} />
          <Surface style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Calendar size={14} color={colors.nutrition} />
              <Text style={styles.chartTitle}>Weekly volume</Text>
              <Text style={styles.chartRange}>{totalWorkouts} total</Text>
            </View>
            <BarChart
              data={workoutVolumeByDay}
              width={CHART_WIDTH}
              height={100}
              barWidth={20}
              spacing={14}
              frontColor={colors.nutrition}
              hideYAxisText
              hideRules
              xAxisColor="transparent"
              yAxisColor="transparent"
              initialSpacing={0}
            />
          </Surface>
        </>
      ) : null}

      {/* Exercise type breakdown */}
      {exerciseFrequency.length > 0 ? (
        <>
          <SectionLabel title="Exercise breakdown" subtitle={`By activity type (${rangeShort})`} />
          <Surface style={{ paddingVertical: 0 }}>
            {exerciseFrequency.map(([type, count], i) => {
              const pct = totalWorkouts > 0 ? (count / totalWorkouts) * 100 : 0;
              return (
                <View key={type}>
                  <View style={styles.exerciseTypeRow}>
                    <Text style={styles.exerciseTypeLabel}>{type}</Text>
                    <View style={styles.exerciseTypeBar}>
                      <PacingBar height={6} segments={[{ value: pct, color: ALLOC_COLORS[i % ALLOC_COLORS.length] }]} />
                    </View>
                    <Text style={styles.exerciseTypeCount}>{count}</Text>
                  </View>
                  {i < exerciseFrequency.length - 1 ? <View style={styles.rowDividerFull} /> : null}
                </View>
              );
            })}
          </Surface>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ WORKOUTS LOG
          ═══════════════════════════════════════════════════ */}
      <SectionLabel title={`Workouts (${rangeShort})`} subtitle={`${totalWorkouts} logged`} />
      {totalWorkouts === 0 ? (
        <Surface style={styles.emptyCard}>
          <Dumbbell size={24} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No workouts this week</Text>
          <Text style={styles.emptyBody}>Log a workout via Ingest to track your training.</Text>
        </Surface>
      ) : (
        <Surface style={{ paddingVertical: 0 }}>
          {filteredWorkouts.slice(0, 10).map((w, i) => (
            <View key={i}>
              <ListRow
                icon={<Dumbbell size={14} color={colors.kinematic} />}
                title={w.exercise_name}
                subtitle={fmtDate(w.workout_date)}
                trailing={w.weight ? `${w.weight}kg` : w.duration_minutes ? `${w.duration_minutes} min` : undefined}
                trailingSubtitle={w.activity_type ?? undefined}
              />
              {i < Math.min(totalWorkouts, 10) - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))}
        </Surface>
      )}

      {/* ═══════════════════════════════════════════════════
          ║ MEAL LOG
          ═══════════════════════════════════════════════════ */}
      <SectionLabel title="Recent meals" subtitle={`${totalMeals} logged`} />
      {totalMeals === 0 ? (
        <Surface style={styles.emptyCard}>
          <Utensils size={24} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No meals this week</Text>
          <Text style={styles.emptyBody}>Log a meal via Ingest to track your nutrition.</Text>
        </Surface>
      ) : (
        <Surface style={{ paddingVertical: 0 }}>
          {filteredMeals.map((m, i) => (
            <View key={i}>
              <ListRow
                icon={<Utensils size={14} color={colors.trends} />}
                title={m.description}
                subtitle={fmtDate(m.meal_time)}
                trailing={m.calories ? `${m.calories} kcal` : undefined}
                trailingSubtitle={m.protein ? `${m.protein}g protein` : undefined}
              />
              {i < totalMeals - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))}
        </Surface>
      )}

      {/* ═══════════════════════════════════════════════════
          ║ BODY COMPOSITION TREND
          ═══════════════════════════════════════════════════ */}
      {weightEntries.length >= 2 ? (
        <>
          <SectionLabel title="Body composition" subtitle="Weight trend" />
          <Surface style={styles.trendCard}>
            <View style={styles.trendRow}>
              <View style={styles.trendItem}>
                <Text style={styles.trendValue}>{latestWeightEntry?.weight.toFixed(1)}kg</Text>
                <Text style={styles.trendLabel}>CURRENT</Text>
              </View>
              <View style={styles.trendDivider} />
              <View style={styles.trendItem}>
                <Text style={[styles.trendValue, { color: change7d != null ? (change7d <= 0 ? colors.good : colors.bad) : colors.textPrimary }]}>
                  {change7d != null ? `${change7d > 0 ? "+" : ""}${change7d.toFixed(1)}kg` : "—"}
                </Text>
                <Text style={styles.trendLabel}>7D CHANGE</Text>
              </View>
              <View style={styles.trendDivider} />
              <View style={styles.trendItem}>
                <Text style={[styles.trendValue, { color: change30d != null ? (change30d <= 0 ? colors.good : colors.bad) : colors.textPrimary }]}>
                  {change30d != null ? `${change30d > 0 ? "+" : ""}${change30d.toFixed(1)}kg` : "—"}
                </Text>
                <Text style={styles.trendLabel}>30D CHANGE</Text>
              </View>
            </View>
            {weightDelta != null ? (
              <View style={styles.trendFooter}>
                <Text style={styles.trendFooterText}>
                  {weightDelta <= 0 ? `${Math.abs(weightDelta).toFixed(1)}kg below target` : `${weightDelta.toFixed(1)}kg above target`} ({targetWeight}kg target)
                </Text>
              </View>
            ) : null}
          </Surface>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ BODY COMPOSITION SUMMARY
          ═══════════════════════════════════════════════════ */}
      {profile.data?.height_cm || profile.data?.current_weight_kg ? (
        <>
          <SectionLabel title="Body profile" subtitle="From settings" />
          <Surface style={styles.bodyProfileCard}>
            <View style={styles.bodyProfileRow}>
              {profile.data?.height_cm ? (
                <View style={styles.bodyProfileItem}>
                  <Text style={styles.bodyProfileLabel}>HEIGHT</Text>
                  <Text style={styles.bodyProfileValue}>{profile.data.height_cm}cm</Text>
                </View>
              ) : null}
              {profile.data?.age ? (
                <View style={styles.bodyProfileItem}>
                  <Text style={styles.bodyProfileLabel}>AGE</Text>
                  <Text style={styles.bodyProfileValue}>{profile.data.age}</Text>
                </View>
              ) : null}
              {profile.data?.sex ? (
                <View style={styles.bodyProfileItem}>
                  <Text style={styles.bodyProfileLabel}>SEX</Text>
                  <Text style={styles.bodyProfileValue}>{profile.data.sex.toUpperCase()}</Text>
                </View>
              ) : null}
              {profile.data?.current_weight_kg ? (
                <View style={styles.bodyProfileItem}>
                  <Text style={styles.bodyProfileLabel}>CURRENT</Text>
                  <Text style={styles.bodyProfileValue}>{profile.data.current_weight_kg}kg</Text>
                </View>
              ) : null}
              {targetWeight ? (
                <View style={styles.bodyProfileItem}>
                  <Text style={styles.bodyProfileLabel}>TARGET</Text>
                  <Text style={styles.bodyProfileValue}>{targetWeight}kg</Text>
                </View>
              ) : null}
            </View>
            {weightDelta != null ? (
              <View style={styles.bodyProfileDeltaRow}>
                <Text style={styles.bodyProfileDeltaLabel}>Distance to target</Text>
                <Text style={[styles.bodyProfileDeltaValue, { color: weightDelta <= 0 ? colors.good : colors.bad }]}>
                  {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)}kg
                </Text>
              </View>
            ) : null}
          </Surface>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          ║ SUPPLEMENTS
          ═══════════════════════════════════════════════════ */}
      <SectionLabel title="Supplements" subtitle={suppItems.length > 0 ? `${suppItems.length} scheduled` : "Not configured"} />
      <Surface style={styles.supplementCard}>
        {suppLoading ? (
          <ActivityIndicator color={colors.focus} style={{ paddingVertical: spacing.md }} />
        ) : suppItems.length === 0 ? (
          <View style={styles.suppEmpty}>
            <Pill size={28} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No supplements yet</Text>
            <Text style={styles.emptyBody}>Add a supplement — we look it up, then auto-log it every day.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {suppItems.map((s) => (
              <View key={s.id ?? s.description} style={styles.suppRow}>
                <View style={[styles.suppIcon, { backgroundColor: withAlpha(s.time_of_day === "evening" ? colors.focus : colors.nutrition, 0.12) }]}>
                  <Pill size={14} color={s.time_of_day === "evening" ? colors.focus : colors.nutrition} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suppDesc}>{s.description}</Text>
                  <Text style={styles.suppMeta}>
                    {s.brand ? `${s.brand} · ` : ""}{s.time_of_day} · {s.hour}:00{s.servings_per_dose && s.servings_per_dose > 1 ? ` · ${s.servings_per_dose} servings` : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => doRemoveSupp(s.id ?? "")}
                  hitSlop={12}
                  style={({ pressed }) => [styles.suppRemoveBtn, pressed && { opacity: 0.5 }]}
                >
                  <Trash2 size={15} color={colors.bad} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setShowAddSupp(true);
          }}
          style={({ pressed }) => [styles.suppAddBtn, pressed && { opacity: 0.7 }]}
        >
          <Plus size={16} color={colors.focus} />
          <Text style={styles.suppAddText}>Add supplement</Text>
        </Pressable>
      </Surface>

      {/* Add-supplement modal */}
      <Modal visible={showAddSupp} transparent animationType="slide" onRequestClose={cancelAddSupp}>
        <View style={styles.suppModalOverlay}>
          <View style={styles.suppModalSheet}>
            <View style={styles.suppModalHeader}>
              <Text style={styles.suppModalTitle}>Add supplement</Text>
              <Pressable onPress={cancelAddSupp} hitSlop={12}>
                <X size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            <ScrollView style={styles.suppModalScroll} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
            {!suppLookup ? (
              <View style={{ gap: spacing.md }}>
                <View>
                  <Text style={styles.suppFieldLabel}>BRAND</Text>
                  <TextInput
                    style={styles.suppInput}
                    value={suppBrand}
                    onChangeText={setSuppBrand}
                    placeholder="e.g. Supradyn"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
                <View>
                  <Text style={styles.suppFieldLabel}>SUPPLEMENT</Text>
                  <TextInput
                    style={styles.suppInput}
                    value={suppName}
                    onChangeText={setSuppName}
                    placeholder="e.g. Men Multivitamin"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
                <View>
                  <Text style={styles.suppFieldLabel}>TIME OF DAY</Text>
                  <SegmentedControl
                    options={[
                      { key: "morning", label: "Morning" },
                      { key: "evening", label: "Evening" },
                      { key: "anytime", label: "Anytime" },
                    ]}
                    value={suppTime}
                    onChange={(v) => {
                      Haptics.selectionAsync().catch(() => {});
                      setSuppTime(v);
                      if (v === "morning" && suppHour === "21") setSuppHour("8");
                      if (v === "evening" && suppHour === "8") setSuppHour("21");
                      if (v === "anytime") setSuppHour("12");
                    }}
                  />
                </View>
                <View>
                  <Text style={styles.suppFieldLabel}>HOUR (0-23)</Text>
                  <TextInput
                    style={styles.suppInput}
                    value={suppHour}
                    onChangeText={setSuppHour}
                    keyboardType="numeric"
                    placeholder="8"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                {suppError ? <Text style={styles.suppErrorText}>{suppError}</Text> : null}
                <PrimaryButton
                  label={suppLooking ? "Looking up…" : "Look up supplement"}
                  onPress={doLookup}
                  loading={suppLooking}
                  disabled={suppLooking || !suppBrand.trim() || !suppName.trim()}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                <View style={styles.suppLookupCard}>
                  <Text style={styles.suppLookupBrand}>{suppLookup.brand}</Text>
                  <Text style={styles.suppLookupName}>{suppLookup.product_name}</Text>
                  <Text style={styles.suppLookupDesc}>{suppLookup.description}</Text>

                  {/* Servings / capsule stepper */}
                  <View style={styles.suppServingsRow}>
                    <Text style={styles.suppServingsLabel}>SERVINGS PER DOSE</Text>
                    <View style={styles.suppStepper}>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSuppServings((s) => Math.max(1, s - 1));
                        }}
                        style={({ pressed }) => [styles.suppStepBtn, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.suppStepBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.suppStepValue}>{suppServings}</Text>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSuppServings((s) => Math.min(10, s + 1));
                        }}
                        style={({ pressed }) => [styles.suppStepBtn, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.suppStepBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Macros (scaled by servings) */}
                  <View style={styles.suppLookupGrid}>
                    <View style={styles.suppLookupStat}>
                      <Text style={styles.suppLookupStatLabel}>SERVING</Text>
                      <Text style={styles.suppLookupStatValue}>{suppLookup.serving_size}</Text>
                    </View>
                    <View style={styles.suppLookupStat}>
                      <Text style={styles.suppLookupStatLabel}>CAL</Text>
                      <Text style={styles.suppLookupStatValue}>{suppLookup.calories * suppServings}</Text>
                    </View>
                    <View style={styles.suppLookupStat}>
                      <Text style={styles.suppLookupStatLabel}>PROTEIN</Text>
                      <Text style={styles.suppLookupStatValue}>{suppLookup.protein * suppServings}g</Text>
                    </View>
                    <View style={styles.suppLookupStat}>
                      <Text style={styles.suppLookupStatLabel}>CARBS</Text>
                      <Text style={styles.suppLookupStatValue}>{suppLookup.carbs * suppServings}g</Text>
                    </View>
                    <View style={styles.suppLookupStat}>
                      <Text style={styles.suppLookupStatLabel}>FAT</Text>
                      <Text style={styles.suppLookupStatValue}>{suppLookup.fat * suppServings}g</Text>
                    </View>
                  </View>

                  {/* Vitamins (all, scaled) */}
                  {(() => {
                    const totals = computeSuppTotals(suppLookup, suppServings);
                    const vitamins = totals.micros.filter((m) => VITAMINS.includes(m.key));
                    const minerals = totals.micros.filter((m) => MINERALS.includes(m.key));
                    return (
                      <>
                        <View style={styles.suppMicroList}>
                          <Text style={styles.suppMicroSectionLabel}>VITAMINS (% DV)</Text>
                          {vitamins.map((m) => (
                            <View key={m.key} style={styles.suppMicroRow}>
                              <Text style={styles.suppMicroKey}>{m.label}</Text>
                              <View style={styles.suppMicroBarWrap}>
                                <View style={[styles.suppMicroBar, { width: `${Math.min(100, m.value)}%`, backgroundColor: m.value > 0 ? colors.nutrition : colors.hairline }]} />
                              </View>
                              <Text style={[styles.suppMicroVal, m.value === 0 && { color: colors.textTertiary }]}>{m.value}%</Text>
                            </View>
                          ))}
                        </View>
                        <View style={styles.suppMicroList}>
                          <Text style={styles.suppMicroSectionLabel}>MINERALS (% DV)</Text>
                          {minerals.map((m) => (
                            <View key={m.key} style={styles.suppMicroRow}>
                              <Text style={styles.suppMicroKey}>{m.label}</Text>
                              <View style={styles.suppMicroBarWrap}>
                                <View style={[styles.suppMicroBar, { width: `${Math.min(100, m.value)}%`, backgroundColor: m.value > 0 ? colors.focus : colors.hairline }]} />
                              </View>
                              <Text style={[styles.suppMicroVal, m.value === 0 && { color: colors.textTertiary }]}>{m.value}%</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    );
                  })()}
                  {suppLookup.notes ? (
                    <Text style={styles.suppLookupNotes}>{suppLookup.notes}</Text>
                  ) : null}
                </View>
                <View style={styles.suppConfirmRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSuppLookup(null);
                      setSuppError("");
                      setSuppServings(1);
                    }}
                    style={({ pressed }) => [styles.suppSecondaryBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.suppSecondaryBtnText}>Back</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      label={suppSaving ? "Saving…" : "Confirm & add"}
                      onPress={confirmAddSupp}
                      loading={suppSaving}
                      disabled={suppSaving}
                    />
                  </View>
                </View>
              </View>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════
          ║ DATA COMPLETENESS
          ═══════════════════════════════════════════════════ */}
      <SectionLabel title="Data completeness" subtitle={`${rangeShort} window`} />
      <Surface style={styles.completenessCard}>
        <View style={styles.completenessRow}>
          <View style={styles.completenessItem}>
            <Ring progress={dataCompleteness} size={48} strokeWidth={5} color={colors.focus}>
              <Text style={styles.completenessRingValue}>{dataCompleteness}%</Text>
            </Ring>
            <Text style={styles.completenessLabel}>VITALS</Text>
          </View>
          <View style={styles.completenessItem}>
            <Ring progress={Math.min(100, (totalWorkouts / 7) * 100)} size={48} strokeWidth={5} color={colors.nutrition}>
              <Text style={styles.completenessRingValue}>{totalWorkouts}</Text>
            </Ring>
            <Text style={styles.completenessLabel}>WORKOUTS</Text>
          </View>
          <View style={styles.completenessItem}>
            <Ring progress={Math.min(100, (totalMeals / 10) * 100)} size={48} strokeWidth={5} color={colors.trends}>
              <Text style={styles.completenessRingValue}>{totalMeals}</Text>
            </Ring>
            <Text style={styles.completenessLabel}>MEALS</Text>
          </View>
        </View>
        <Text style={styles.completenessHint}>
          Log data daily via Ingest to improve trend accuracy and pacing insights.
        </Text>
      </Surface>
      </ScrollView>
      <ScreenHeader title="Bio" subtitle="Vitality, fuel, and training" statusLabel={statusLabel} statusColor={statusColor} />
    </View>
  );
}

// ─── Helper components ───

function TrendArrow({ trend, invert }: { trend: "up" | "down" | "flat"; invert?: boolean }) {
  if (trend === "flat") return null;
  const isGood = invert ? trend === "down" : trend === "up";
  const color = isGood ? withAlpha("#FFFFFF", 0.7) : withAlpha("#FFFFFF", 0.5);
  return trend === "up" ? (
    <TrendingUp size={10} color={color} />
  ) : (
    <TrendingDown size={10} color={color} />
  );
}

function DropletIcon({ color }: { color: string }) {
  return <Activity size={12} color={color} />;
}

const ALLOC_COLORS = [colors.kinematic, colors.focus, colors.trends, colors.nutrition, colors.cardio];

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },

  // ─── Hero card ───
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  heroEyebrow: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 1,
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 20,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  heroStatusPill: {
    backgroundColor: withAlpha("#FFFFFF", 0.15),
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroStatusPillText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  recoveryBadge: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFFFF", 0.15),
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  recoveryScore: {
    fontFamily: fonts.monoBold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  recoveryLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 8,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.8,
  },

  // ─── Calendar strip ───
  calendarStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha("#FFFFFF", 0.15),
  },
  calendarDay: { alignItems: "center", gap: 4 },
  calendarDayLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: withAlpha("#FFFFFF", 0.5),
    letterSpacing: 0.3,
  },
  calendarDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: withAlpha("#FFFFFF", 0.2),
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 2, flexWrap: "wrap",
  },
  calendarDotActive: {
    borderColor: withAlpha("#FFFFFF", 0.4),
    backgroundColor: withAlpha("#FFFFFF", 0.08),
  },
  calendarDotFull: {
    borderColor: withAlpha("#FFFFFF", 0.6),
  },
  calendarDotInner: { width: 5, height: 5, borderRadius: 2.5 },

  // ─── Hero rings ───
  heroStale: { color: "rgba(255,255,255,0.75)", fontFamily: fonts.geistRegular, fontSize: 12, textAlign: "center", marginTop: spacing.xs },
  heroRingsRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.sm },
  heroRingItem: { alignItems: "center", gap: 4 },
  heroRingInner: { alignItems: "center", justifyContent: "center" },
  heroRingValue: {
    fontFamily: fonts.monoBold, fontSize: 14, color: "#FFFFFF",
    letterSpacing: -0.3, marginTop: 2,
  },
  heroRingUnit: { fontFamily: fonts.monoMedium, fontSize: 8, color: withAlpha("#FFFFFF", 0.5) },
  heroRingLabel: {
    fontFamily: fonts.monoSemiBold, fontSize: 9,
    color: withAlpha("#FFFFFF", 0.5), letterSpacing: 0.8,
  },
  heroStatsRow: {
    flexDirection: "row", justifyContent: "space-around",
    paddingTop: spacing.md, marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha("#FFFFFF", 0.15),
  },
  heroStatItem: { alignItems: "center" },
  heroStatLabel: {
    fontFamily: fonts.monoMedium, fontSize: 9,
    color: withAlpha("#FFFFFF", 0.5), letterSpacing: 0.6, marginBottom: 3,
  },
  heroStatValue: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: "#FFFFFF" },

  // ─── Range selector ───
  rangeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  updatingPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface1, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.hairline },
  updatingText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textSecondary },

  // ─── Chart cards ───
  chartCard: { marginBottom: spacing.sm, ...cardShadow },
  chartHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  chartTitle: { fontFamily: fonts.geistMedium, fontSize: 13, color: colors.textPrimary, flex: 1 },
  chartRange: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5 },
  chartFooter: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  chartFooterLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary },
  chartFooterValue: { fontFamily: fonts.monoSemiBold, fontSize: 11, color: colors.textSecondary },

  // ─── Trend pills ───
  trendPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  trendPillText: { fontFamily: fonts.monoSemiBold, fontSize: 9, letterSpacing: 0.3 },
  targetPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: withAlpha(colors.kinematic, 0.1),
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  targetPillText: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.kinematic },

  // ─── Macro rings ───
  macroRings: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  macroRingPod: {
    flex: 1, backgroundColor: colors.surface1,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline,
    padding: spacing.sm, alignItems: "center", ...cardShadow,
  },
  macroRingHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  macroRingLabel: { fontFamily: fonts.monoSemiBold, fontSize: 8.5, color: colors.textTertiary, letterSpacing: 0.6 },
  macroRingValue: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary, letterSpacing: -0.3, textAlign: "center" },
  macroRingUnit: { fontFamily: fonts.monoMedium, fontSize: 8, color: colors.textTertiary, textAlign: "center", marginTop: 1 },
  macroRingCaption: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, marginTop: 4, textAlign: "center" },

  // ─── Macro split ───
  macroSplitCard: { marginBottom: spacing.sm, gap: spacing.sm, ...cardShadow },
  macroSplitTitle: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },
  macroSplitLegend: { flexDirection: "row", justifyContent: "space-around" },
  macroSplitLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  macroSplitLegendText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary },

  // ─── Micro card ───
  microCard: { gap: spacing.md, ...cardShadow },
  microRow: { gap: 6 },
  microRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  microLabel: { fontFamily: fonts.geistMedium, fontSize: 12.5, color: colors.textPrimary },
  microPct: { fontFamily: fonts.monoSemiBold, fontSize: 12 },

  // ─── PR banner ───
  prBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: withAlpha(colors.good, 0.06), borderWidth: 1,
    borderColor: withAlpha(colors.good, 0.25), borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  prBannerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  prBannerText: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.good, letterSpacing: 0.8 },
  prDetail: { flex: 1, fontFamily: fonts.geistMedium, fontSize: 13, color: colors.textPrimary },
  prCount: {
    backgroundColor: withAlpha(colors.good, 0.15), borderRadius: radius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  prCountText: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.good },

  // ─── Exercise type breakdown ───
  exerciseTypeRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
  },
  exerciseTypeLabel: { fontFamily: fonts.geistMedium, fontSize: 13, color: colors.textPrimary, width: 100 },
  exerciseTypeBar: { flex: 1 },
  exerciseTypeCount: { fontFamily: fonts.monoSemiBold, fontSize: 13, color: colors.textSecondary },

  // ─── Training insights ───
  trainingInsightRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  trainingInsightCard: { flex: 1, padding: spacing.md },
  trainingInsightValue: { fontFamily: fonts.monoBold, fontSize: 32, color: colors.textPrimary, letterSpacing: -1 },
  trainingInsightLabel: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6, marginTop: 2 },
  trainingInsightSub: { fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  muscleVolumeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  muscleVolumeItem: { flex: 1, alignItems: "center" },
  muscleVolumeSets: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.textPrimary },
  muscleVolumeMuscle: { fontFamily: fonts.geistRegular, fontSize: 10, color: colors.textTertiary, marginTop: 2 },

  // ─── Empty states ───
  emptyCard: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.geistMedium, fontSize: 15, color: colors.textPrimary },
  emptyBody: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },

  // ─── Row dividers ───
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: spacing.lg + 32 + spacing.md },
  rowDividerFull: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },

  // ─── Supplements ───
  supplementCard: { gap: spacing.md, ...cardShadow },
  suppEmpty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  suppRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  suppIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  suppDesc: { fontFamily: fonts.geistMedium, fontSize: 14, color: colors.textPrimary },
  suppMeta: { fontFamily: fonts.geistRegular, fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  suppRemoveBtn: { padding: spacing.xs },
  suppAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.focus, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(colors.focus, 0.2),
  },
  suppAddText: { fontFamily: fonts.monoSemiBold, fontSize: 12, color: colors.focus },

  // ─── Supplement modal ───
  suppModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  suppModalSheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: "90%",
  },
  suppModalScroll: { flexShrink: 1 },
  suppModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  suppModalTitle: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 18, color: colors.textPrimary },
  suppFieldLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6, marginBottom: spacing.xs },
  suppInput: {
    fontFamily: fonts.geistRegular,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  suppErrorText: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.bad },
  suppLookupCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  suppLookupBrand: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6, textTransform: "uppercase" },
  suppLookupName: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 16, color: colors.textPrimary },
  suppLookupDesc: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textSecondary },
  suppLookupGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  suppLookupStat: { flex: 1, alignItems: "center", gap: 2 },
  suppLookupStatLabel: { fontFamily: fonts.monoMedium, fontSize: 8, color: colors.textTertiary, letterSpacing: 0.5 },
  suppLookupStatValue: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: colors.textPrimary },
  suppMicroList: { marginTop: spacing.sm, gap: spacing.xs },
  suppMicroSectionLabel: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6, marginBottom: 2 },
  suppMicroRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  suppMicroKey: { fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textSecondary, textTransform: "capitalize", width: 90 },
  suppMicroBarWrap: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  suppMicroBar: { height: 6, borderRadius: 3 },
  suppMicroVal: { fontFamily: fonts.monoSemiBold, fontSize: 12, color: colors.nutrition, width: 36, textAlign: "right" },
  suppServingsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  suppServingsLabel: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6 },
  suppStepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  suppStepBtn: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  suppStepBtnText: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.textPrimary },
  suppStepValue: { fontFamily: fonts.monoSemiBold, fontSize: 18, color: colors.textPrimary, minWidth: 24, textAlign: "center" },
  suppLookupNotes: { fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textTertiary, fontStyle: "italic", marginTop: spacing.xs },
  suppConfirmRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  suppSecondaryBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline },
  suppSecondaryBtnText: { fontFamily: fonts.monoSemiBold, fontSize: 12, color: colors.textSecondary },

  // ─── Body composition trend ───
  trendCard: { gap: spacing.md, ...cardShadow },
  trendRow: { flexDirection: "row", alignItems: "center" },
  trendItem: { flex: 1, alignItems: "center", gap: 2 },
  trendValue: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.textPrimary, letterSpacing: -0.4 },
  trendLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6 },
  trendDivider: { width: 1, height: 28, backgroundColor: colors.hairline },
  trendFooter: { paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  trendFooterText: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textSecondary, textAlign: "center" },

  // ─── Body profile ───
  bodyProfileCard: { gap: spacing.md, ...cardShadow },
  bodyProfileRow: { flexDirection: "row", justifyContent: "space-around", flexWrap: "wrap", gap: spacing.md },
  bodyProfileItem: { alignItems: "center", gap: 3 },
  bodyProfileLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6 },
  bodyProfileValue: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.textPrimary },
  bodyProfileDeltaRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  bodyProfileDeltaLabel: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textSecondary },
  bodyProfileDeltaValue: { fontFamily: fonts.monoSemiBold, fontSize: 14 },

  // ─── Data completeness ───
  completenessCard: { gap: spacing.md, ...cardShadow },
  completenessRow: { flexDirection: "row", justifyContent: "space-around" },
  completenessItem: { alignItems: "center", gap: 6 },
  completenessRingValue: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary },
  completenessLabel: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6 },
  completenessHint: {
    fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textTertiary,
    textAlign: "center", lineHeight: 16,
  },

  // ─── Nutrition history legend ───
  nutritionLegend: {
    flexDirection: "row", justifyContent: "center", gap: spacing.md,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  nutritionLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  nutritionLegendBar: { width: 10, height: 10, borderRadius: 2 },
  nutritionLegendLine: { width: 12, height: 3, borderRadius: 1.5 },
  nutritionLegendText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary },
  barTopLabel: { fontFamily: fonts.monoMedium, fontSize: 8, color: colors.textTertiary },
});
}
