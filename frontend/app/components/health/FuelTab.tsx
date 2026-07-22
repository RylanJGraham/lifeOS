"use client";

import { useState, useEffect, useMemo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Flame, Zap, Target, Clock, Brain, CheckCircle,
  ChevronDown, ChevronUp, ArrowRight, TrendingUp,
  Activity, Dumbbell, X, Trash2, Pencil, Plus, Check
} from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { THEME } from "../../../utils/theme";

// ─── Color palette ────────────────────────────────────────────────
const C = {
  ...THEME,
  protein:   "#E03535",
  carbs:     "#00A878",
  fat:       "#D97706",
  fiber:     "#0EA5E9",
  calories:  "#5B42E8",
  text:      "#0F172A",
  textSec:   "#475569",
  textTer:   "#94A3B8",
};

// ─── Helpers ─────────────────────────────────────────────────────
function pct(val: number, goal: number) { return goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0; }

function rangeLabel(timeFilter: string): string {
  switch (timeFilter) {
    case "day": return "today";
    case "week": return "last 7 days";
    case "month": return "last 30 days";
    case "quarter": return "last 90 days";
    case "year": return "last 365 days";
    default: return "selected range";
  }
}

// Local-calendar day keys for the day drill-down lens
function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayKeyOf(iso: string): string { return toDayKey(new Date(iso)); }
function fmtDayLong(dk: string): string {
  return new Date(dk + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function parseMicros(raw: any): Record<string, number> {
  if (!raw) return {};
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, number> = {};
      Object.entries(obj).forEach(([k, v]) => { if (typeof v === "number" && v > 0) out[k] = v; });
      return out;
    }
  } catch (e) {
    console.error("Failed to parse micronutrients:", e);
  }
  return {};
}

// Real nutrition targets from user_profiles (null fields when not configured)
interface NutritionTargets {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

function useNutritionTargets(): NutritionTargets {
  const [targets, setTargets] = useState<NutritionTargets>({ calories: null, protein: null, carbs: null, fat: null });
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("daily_caloric_target, protein_target_g, carbs_target_g, fat_target_g")
        .limit(1);
      if (!error && data?.[0]) {
        const p = data[0];
        setTargets({
          calories: p.daily_caloric_target ?? null,
          protein:  p.protein_target_g ?? null,
          carbs:    p.carbs_target_g ?? null,
          fat:      p.fat_target_g ?? null,
        });
      }
    })();
  }, []);
  return targets;
}

function StatusBadge({ status }: { status: "optimal" | "warning" | "critical" | "low" }) {
  const map = {
    optimal: { label: "Optimal", bg: "rgba(5,150,105,0.12)", color: C.optimal, border: "rgba(5,150,105,0.3)" },
    warning: { label: "Low",     bg: "rgba(217,119,6,0.12)", color: C.warning,  border: "rgba(217,119,6,0.3)"  },
    critical:{ label: "Deficit", bg: "rgba(220,38,38,0.12)", color: C.critical, border: "rgba(220,38,38,0.3)"  },
    low:     { label: "Low",     bg: "rgba(217,119,6,0.12)", color: C.warning,  border: "rgba(217,119,6,0.3)"  },
  };
  const s = map[status];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

// ─── Zone 1: Intake Overview HUD ─────────────────────────────────
// All figures are sums over the meals in the selected range.
function IntakeHUD({ totalCal, totalP, totalC, totalFat, loggedDays, calTarget, pTarget, cTarget, fTarget, timeFilter }: {
  totalCal: number; totalP: number; totalC: number; totalFat: number;
  loggedDays: number; calTarget: number | null;
  pTarget: number | null; cTarget: number | null; fTarget: number | null;
  timeFilter: string;
}) {
  const days = Math.max(1, loggedDays);
  const avgCal = Math.round(totalCal / days);
  const avgP = Math.round(totalP / days);
  const avgC = Math.round(totalC / days);
  const avgF = Math.round(totalFat / days);
  const macroKcal = totalP * 4 + totalC * 4 + totalFat * 9;

  const chips = [
    {
      id: "cal",
      label: `Calories · ${rangeLabel(timeFilter)}`,
      value: totalCal,
      unit: "kcal",
      sublabel: calTarget
        ? `~${avgCal}/day vs ${calTarget} target`
        : `~${avgCal}/day avg (no target set)`,
      color: C.calories,
      // Ring only has meaning against a real target
      pct: calTarget ? pct(avgCal, calTarget) : null,
      icon: Flame,
    },
    {
      id: "protein",
      label: "Protein",
      value: totalP,
      unit: "g",
      sublabel: pTarget
        ? `~${avgP}g/day vs ${pTarget}g target`
        : `~${avgP}g/day avg`,
      color: C.protein,
      pct: pTarget ? pct(avgP, pTarget) : (macroKcal > 0 ? Math.round((totalP * 4 / macroKcal) * 100) : null),
      icon: Target,
    },
    {
      id: "carbs",
      label: "Carbs",
      value: totalC,
      unit: "g",
      sublabel: cTarget
        ? `~${avgC}g/day vs ${cTarget}g target`
        : `~${avgC}g/day avg`,
      color: C.carbs,
      pct: cTarget ? pct(avgC, cTarget) : (macroKcal > 0 ? Math.round((totalC * 4 / macroKcal) * 100) : null),
      icon: Zap,
    },
    {
      id: "fat",
      label: "Fat",
      value: totalFat,
      unit: "g",
      sublabel: fTarget
        ? `~${avgF}g/day vs ${fTarget}g target`
        : `~${avgF}g/day avg`,
      color: C.fat,
      pct: fTarget ? pct(avgF, fTarget) : (macroKcal > 0 ? Math.round((totalFat * 9 / macroKcal) * 100) : null),
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {chips.map((chip, i) => {
        const r = 26, circ = 2 * Math.PI * r;
        const ringPct = chip.pct ?? 0;
        return (
          <motion.div
            key={chip.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="card-surface p-4 flex items-center gap-4"
            style={{ borderRadius: "var(--radius-lg)" }}
          >
            {/* Radial progress mini-ring (neutral when no target exists) */}
            <div className="relative shrink-0" style={{ width: 58, height: 58 }}>
              <svg width={58} height={58} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={29} cy={29} r={r} fill="none" stroke={C.border} strokeWidth={5} />
                <motion.circle
                  cx={29} cy={29} r={r} fill="none"
                  stroke={chip.pct === null ? C.textTer : chip.color} strokeWidth={5} strokeLinecap="round"
                  initial={{ strokeDasharray: `0 ${circ}` }}
                  animate={{ strokeDasharray: `${circ * (ringPct / 100)} ${circ * (1 - ringPct / 100)}` }}
                  transition={{ duration: 1.1, ease: [0, 0, 0.2, 1], delay: i * 0.07 + 0.2 }}
                  style={{ filter: chip.pct === null ? undefined : `drop-shadow(0 0 6px ${chip.color}60)` }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <chip.icon size={14} style={{ color: chip.color }} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>
                {chip.label}
              </div>
              <div className="text-xl font-black leading-none mb-0.5" style={{ fontFamily: "var(--font-mono)", color: chip.color }}>
                {chip.value}<span className="text-sm font-bold ml-0.5" style={{ color: C.textTer }}>{chip.unit}</span>
              </div>
              <div className="text-[10px] truncate" style={{ color: C.textSec }}>{chip.sublabel}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Zone 2: Intake Timeline ──────────────────────────────────────
// Day filter: hourly cumulative intake for today.
// Other filters: daily totals across the range.
function IntakeTimeline({ dbMeals, calTarget, timeFilter, onDaySelect }: {
  dbMeals: any[]; calTarget: number | null; timeFilter: string;
  onDaySelect?: (dk: string) => void;
}) {
  const isDay = timeFilter === "day";

  // Hourly cumulative (day mode)
  const hourlyData = useMemo(() => {
    if (!isDay) return [];
    const buckets: Record<number, number> = {};
    for (let h = 6; h <= 23; h++) buckets[h] = 0;
    dbMeals.forEach(m => {
      const h = new Date(m.meal_time).getHours();
      if (h >= 6 && h <= 23) buckets[h] = (buckets[h] || 0) + (m.calories || 0);
    });
    let running = 0;
    return Object.keys(buckets).map(h => {
      running += buckets[Number(h)];
      const goalPace = calTarget ? Math.round((Number(h) - 6) / 17 * calTarget) : null;
      return { hour: `${h}:00`, cumulative: running, goalPace };
    });
  }, [dbMeals, calTarget, isDay]);

  // Daily totals (range mode)
  const dailyData = useMemo(() => {
    if (isDay) return [];
    const byDay: Record<string, number> = {};
    dbMeals.forEach(m => {
      const dk = dayKeyOf(m.meal_time);
      byDay[dk] = (byDay[dk] || 0) + (m.calories || 0);
    });
    return Object.keys(byDay).sort().map(dk => ({
      dk,
      date: new Date(dk + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }),
      calories: byDay[dk],
    }));
  }, [dbMeals, isDay]);

  const mealChips = useMemo(() => {
    return dbMeals.map(m => ({
      when: isDay
        ? `${new Date(m.meal_time).getHours()}:00`
        : new Date(m.meal_time).toLocaleDateString([], { month: "short", day: "numeric" }),
      name: m.description || "Meal",
      cal: m.calories || 0,
    }));
  }, [dbMeals, isDay]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card-surface px-3 py-2 text-xs shadow-lg" style={{ borderRadius: "var(--radius-md)", minWidth: 140 }}>
        <div className="font-bold mb-1" style={{ color: C.text }}>{label}</div>
        <div className="flex items-center gap-2" style={{ color: C.calories }}>
          <span>{isDay ? "Consumed (cum.):" : "Consumed:"}</span>
          <span className="font-bold font-mono">{payload[0]?.value} kcal</span>
        </div>
        {isDay && calTarget && payload[1] && (
          <div className="flex items-center gap-2" style={{ color: C.textTer }}>
            <span>Goal pace:</span>
            <span className="font-mono">{payload[1]?.value} kcal</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Caloric Timeline · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            {isDay ? "Hourly cumulative intake" : "Daily intake · click a bar to open that day"} {calTarget ? `vs ${calTarget} kcal target` : "· no caloric target configured"}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: C.textTer }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded" style={{ background: C.calories }} /> Consumed
          </span>
          {calTarget && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-0.5 rounded border-dashed border border-gray-400" /> Target
            </span>
          )}
        </div>
      </div>

      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          {isDay ? (
            <AreaChart data={hourlyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fuelCalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.calories} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.calories} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }}
                interval={2}
              />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }}
                width={40}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              {calTarget && (
                <ReferenceLine y={calTarget} stroke={C.optimal} strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: "Target", position: "right", fontSize: 10, fill: C.optimal }} />
              )}
              <Area type="monotone" dataKey="cumulative" stroke={C.calories} strokeWidth={2.5}
                fill="url(#fuelCalGrad)" dot={false} activeDot={{ r: 5, fill: C.calories }}
              />
              {calTarget && (
                <Area type="monotone" dataKey="goalPace" stroke="#CBD5E1" strokeWidth={1.5}
                  strokeDasharray="5 4" fill="none" dot={false}
                />
              )}
            </AreaChart>
          ) : (
            <BarChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }}
              />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }}
                width={40}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              {calTarget && (
                <ReferenceLine y={calTarget} stroke={C.optimal} strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: "Target", position: "right", fontSize: 10, fill: C.optimal }} />
              )}
              <Bar dataKey="calories" fill={C.calories} radius={[4, 4, 0, 0]} cursor={onDaySelect ? "pointer" : undefined}
                onClick={(d: any) => d?.dk && onDaySelect?.(d.dk)} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Meal chips below chart */}
      {mealChips.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {mealChips.map((m, i) => (
            <div key={i}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: C.calories }} />
              <span className="text-[10px] font-bold" style={{ color: C.text }}>{m.when}</span>
              <span className="text-[10px]" style={{ color: C.textSec }}>{m.name.split(" ").slice(0, 2).join(" ")}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: C.calories }}>{m.cal}kcal</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zone 2b: Macros per Day (stacked grams) ─────────────────────
function DailyMacroChart({ dbMeals, timeFilter, onDaySelect }: {
  dbMeals: any[]; timeFilter: string; onDaySelect?: (dk: string) => void;
}) {
  const dailyData = useMemo(() => {
    const byDay: Record<string, { p: number; c: number; f: number }> = {};
    dbMeals.forEach(m => {
      const dk = dayKeyOf(m.meal_time);
      if (!byDay[dk]) byDay[dk] = { p: 0, c: 0, f: 0 };
      byDay[dk].p += m.protein || 0;
      byDay[dk].c += m.carbs || 0;
      byDay[dk].f += m.fat || 0;
    });
    return Object.keys(byDay).sort().map(dk => ({
      dk,
      date: new Date(dk + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }),
      protein: byDay[dk].p,
      carbs: byDay[dk].c,
      fat: byDay[dk].f,
    }));
  }, [dbMeals]);

  if (dailyData.length === 0) return null;

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Macros per Day · {rangeLabel(timeFilter)} (grams)
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>Stacked protein / carbs / fat · click a bar to open that day</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: C.textTer }}>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: C.protein }} /> P</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: C.carbs }} /> C</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: C.fat }} /> F</span>
        </div>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" axisLine={false} tickLine={false}
              tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }} />
            <YAxis axisLine={false} tickLine={false}
              tick={{ fontSize: 10, fill: C.textTer, fontFamily: "var(--font-mono)" }} width={36} />
            <RechartsTooltip
              formatter={(v: number, name: string) => [`${v}g`, name]}
              contentStyle={{ borderRadius: "8px", border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", background: "#fff", fontSize: 11 }}
            />
            <Bar dataKey="protein" stackId="m" fill={C.protein} cursor={onDaySelect ? "pointer" : undefined}
              onClick={(d: any) => d?.dk && onDaySelect?.(d.dk)} />
            <Bar dataKey="carbs" stackId="m" fill={C.carbs} cursor={onDaySelect ? "pointer" : undefined}
              onClick={(d: any) => d?.dk && onDaySelect?.(d.dk)} />
            <Bar dataKey="fat" stackId="m" fill={C.fat} radius={[4, 4, 0, 0]} cursor={onDaySelect ? "pointer" : undefined}
              onClick={(d: any) => d?.dk && onDaySelect?.(d.dk)} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Zone 3: Macro Split + Workout Sync ──────────────────────────
function MacroSplitPanel({ totalP, totalC, totalFat, totalFib }: {
  totalP: number; totalC: number; totalFat: number; totalFib: number;
}) {
  const macroKcal = totalP * 4 + totalC * 4 + totalFat * 9;
  const macros = [
    { label: "Protein", val: totalP,   kcal: totalP * 4,   color: C.protein, key: "protein" },
    { label: "Carbs",   val: totalC,   kcal: totalC * 4,   color: C.carbs,   key: "carbs"   },
    { label: "Fat",     val: totalFat, kcal: totalFat * 9, color: C.fat,     key: "fat"     },
  ];

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>
        Macro Split
      </div>
      <div className="text-[11px] mb-5" style={{ color: C.textSec }}>
        Share of macro calories from logged meals
      </div>
      <div className="grid grid-cols-3 gap-4">
        {macros.map((m, i) => {
          const share = macroKcal > 0 ? Math.round((m.kcal / macroKcal) * 100) : 0;
          const r = 36, circ = 2 * Math.PI * r;
          return (
            <motion.div key={m.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 + 0.2, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="relative" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={40} cy={40} r={r} fill="none" stroke={C.border} strokeWidth={7} />
                  <motion.circle
                    cx={40} cy={40} r={r} fill="none"
                    stroke={m.color} strokeWidth={7} strokeLinecap="round"
                    initial={{ strokeDasharray: `0 ${circ}` }}
                    animate={{ strokeDasharray: `${circ * (share / 100)} ${circ * (1 - share / 100)}` }}
                    transition={{ duration: 1.2, ease: [0, 0, 0.2, 1], delay: i * 0.1 + 0.3 }}
                    style={{ filter: `drop-shadow(0 0 8px ${m.color}50)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black leading-none" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{share}%</span>
                  <span className="text-[9px] font-bold" style={{ color: C.textTer }}>of kcal</span>
                </div>
              </div>

              <div className="text-center w-full">
                <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textSec }}>{m.label}</div>
                <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: C.text, lineHeight: 1 }}>
                  {m.val}<span className="text-xs font-bold" style={{ color: C.textTer }}>g</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {totalFib > 0 && (
        <div className="mt-4 flex items-center justify-between text-[11px] px-3 py-2 rounded-lg"
          style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <span className="font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Fiber (from micronutrients)</span>
          <span className="font-black font-mono" style={{ color: C.fiber }}>{totalFib}g</span>
        </div>
      )}
    </div>
  );
}

function MacroWorkoutCorrelation({ dbWorkouts, totalP, totalC, loggedDays, timeFilter }: {
  dbWorkouts: any[]; totalP: number; totalC: number; loggedDays: number; timeFilter: string;
}) {
  const days = Math.max(1, loggedDays);
  const avgP = Math.round(totalP / days);
  const avgC = Math.round(totalC / days);
  const sessionDays = new Set(dbWorkouts.map(w => (w.workout_date || "").split("T")[0])).size;
  const burn = dbWorkouts.reduce((a, w) => a + (w.calories || 0), 0);

  const preCarbAdequacy   = avgC >= 100 ? "optimal" : avgC >= 60 ? "warning" : "critical";
  const postProteinTiming = avgP >= 120 ? "optimal" : avgP >= 80 ? "warning" : "critical";
  const energyAvail       = (avgC + avgP) >= 200 ? "optimal" : "warning";

  const rows = [
    {
      label: "Pre-workout carb priming",
      detail: `${avgC}g carbs/day avg (target: 80–120g pre-session)`,
      status: preCarbAdequacy as "optimal" | "warning" | "critical",
      tip: preCarbAdequacy !== "optimal" ? "Eat 30–50g fast carbs 45 min before training" : "Carb load is adequate for performance",
    },
    {
      label: "Post-workout protein",
      detail: `${avgP}g protein/day avg across logged days`,
      status: postProteinTiming as "optimal" | "warning" | "critical",
      tip: postProteinTiming !== "optimal" ? "Add a protein serving after training sessions" : "Protein intake supports recovery",
    },
    {
      label: "Energy availability",
      detail: `${avgC * 4 + avgP * 4} kcal/day from protein + carbs`,
      status: energyAvail as "optimal" | "warning",
      tip: energyAvail !== "optimal" ? "Increase carb intake to sustain performance" : "Energy availability is sufficient",
    },
  ];

  return (
    <div className="card-surface p-5 flex flex-col gap-4" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Macro–Workout Sync · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            {sessionDays > 0
              ? `${sessionDays} training day${sessionDays !== 1 ? "s" : ""}${burn > 0 ? ` · ${burn} kcal burned` : ""}`
              : "No training logged in range"}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full`}
          style={{
            background: sessionDays > 0 ? "rgba(5,150,105,0.1)" : "rgba(148,163,184,0.1)",
            color: sessionDays > 0 ? C.optimal : C.textTer,
            border: `1px solid ${sessionDays > 0 ? "rgba(5,150,105,0.25)" : "rgba(148,163,184,0.25)"}`
          }}>
          <Dumbbell size={10} />
          {sessionDays > 0 ? "Training" : "No Sessions"}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 + 0.3 }}
            className="p-3 rounded-xl"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="text-xs font-bold" style={{ color: C.text }}>{row.label}</div>
              <StatusBadge status={row.status} />
            </div>
            <div className="text-[11px] mb-1" style={{ color: C.textSec, fontFamily: "var(--font-mono)" }}>{row.detail}</div>
            <div className="text-[11px] italic" style={{ color: row.status === "optimal" ? C.optimal : C.warning }}>
              → {row.tip}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Zone 4: Micronutrient Goals (from meals.micronutrients jsonb) ────
// Values are normalized per logged day, then compared against daily goals —
// raw range sums are meaningless for %-of-daily-value nutrients.
const MICRO_GROUP_VIT = "Vitamins";
const MICRO_GROUP_MIN = "Minerals & Electrolytes";
const MICRO_GROUP_FS  = "Fiber & Sugar";

const NUTRIENT_META: Record<string, {
  name: string; group: string; unit: "%DV" | "mg" | "g"; goal: number; kind: "goal" | "limit";
}> = {
  vitamin_a_dv_pct:   { name: "Vitamin A",   group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  vitamin_c_dv_pct:   { name: "Vitamin C",   group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  vitamin_d_dv_pct:   { name: "Vitamin D",   group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  vitamin_e_dv_pct:   { name: "Vitamin E",   group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  vitamin_k_dv_pct:   { name: "Vitamin K",   group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  b6_dv_pct:          { name: "B6",          group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  b12_dv_pct:         { name: "B12",         group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  biotin_dv_pct:      { name: "Biotin",      group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  folic_acid_dv_pct:  { name: "Folic Acid",  group: MICRO_GROUP_VIT, unit: "%DV", goal: 100, kind: "goal" },
  magnesium_dv_pct:   { name: "Magnesium",   group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  zinc_dv_pct:        { name: "Zinc",        group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  iron_dv_pct:        { name: "Iron",        group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  calcium_dv_pct:     { name: "Calcium",     group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  selenium_dv_pct:    { name: "Selenium",    group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  iodine_dv_pct:      { name: "Iodine",      group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  copper_dv_pct:      { name: "Copper",      group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  manganese_dv_pct:   { name: "Manganese",   group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  phosphorus_dv_pct:  { name: "Phosphorus",  group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  omega_3_dv_pct:     { name: "Omega-3",     group: MICRO_GROUP_MIN, unit: "%DV", goal: 100, kind: "goal" },
  sodium_mg:          { name: "Sodium",      group: MICRO_GROUP_MIN, unit: "mg",  goal: 2300, kind: "limit" },
  potassium_mg:       { name: "Potassium",   group: MICRO_GROUP_MIN, unit: "mg",  goal: 3500, kind: "goal" },
  fiber:              { name: "Fiber",       group: MICRO_GROUP_FS,  unit: "g",   goal: 30,  kind: "goal" },
  sugar:              { name: "Sugar",       group: MICRO_GROUP_FS,  unit: "g",   goal: 50,  kind: "limit" },
};

const MICRO_GROUP_ORDER = [MICRO_GROUP_VIT, MICRO_GROUP_MIN, MICRO_GROUP_FS];

// Strip junk keys and merge legacy non-suffixed duplicates (e.g. vitamin_d,
// omega_3) into their *_dv_pct equivalents — the suffixed key wins when both exist.
function normalizeMicros(micros: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const isDirect = (k: string) => k.endsWith("_dv_pct") || k in NUTRIENT_META;
  Object.entries(micros).forEach(([k, v]) => {
    if (k === "ai_analysis") return;
    if (isDirect(k)) out[k] = v;
  });
  Object.entries(micros).forEach(([k, v]) => {
    if (k === "ai_analysis" || isDirect(k)) return;
    const suffixed = `${k}_dv_pct`;
    // Only alias known legacy duplicates; skip anything unrecognized
    if (suffixed in NUTRIENT_META && !(suffixed in out)) out[suffixed] = v;
  });
  return out;
}

type MicroStatus = "low" | "ok" | "covered" | "over";

interface MicroRow {
  key: string;
  name: string;
  group: string;
  avg: number;
  barPct: number;
  valueLabel: string;
  status: MicroStatus;
}

const MICRO_STATUS_COLOR: Record<MicroStatus, string> = {
  low: C.critical, ok: C.warning, covered: C.optimal, over: C.critical,
};

function buildMicroRow(key: string, avg: number): MicroRow {
  const meta = NUTRIENT_META[key] || {
    name: key.replace(/_dv_pct$/, "").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()),
    group: MICRO_GROUP_VIT, unit: "%DV" as const, goal: 100, kind: "goal" as const,
  };
  const status: MicroStatus = meta.kind === "limit"
    ? (avg > meta.goal ? "over" : "covered")
    : (avg >= 90 ? "covered" : avg >= 50 ? "ok" : "low");
  const barPct = Math.min(150, (avg / meta.goal) * 100);
  const valueLabel = meta.unit === "%DV"
    ? `${Math.round(avg)}% DV`
    : meta.unit === "mg"
    ? `${Math.round(avg).toLocaleString()} mg`
    : `${Math.round(avg * 10) / 10} g`;
  return { key, name: meta.name, group: meta.group, avg, barPct, valueLabel, status };
}

function MicroPanel({ dbMeals, timeFilter, dayLabel }: { dbMeals: any[]; timeFilter: string; dayLabel?: string }) {
  const rows = useMemo<MicroRow[]>(() => {
    // Sum each nutrient per local day, then average over logged days only —
    // days without logged food don't dilute the average.
    const byDay: Record<string, Record<string, number>> = {};
    dbMeals.forEach(m => {
      const dk = dayKeyOf(m.meal_time);
      const norm = normalizeMicros(parseMicros(m.micronutrients));
      const day = byDay[dk] || (byDay[dk] = {});
      Object.entries(norm).forEach(([k, v]) => { day[k] = (day[k] || 0) + v; });
    });
    const days = Object.keys(byDay).length;
    if (days === 0) return [];
    const avg: Record<string, number> = {};
    Object.values(byDay).forEach(day => {
      Object.entries(day).forEach(([k, v]) => { avg[k] = (avg[k] || 0) + v / days; });
    });
    // Attention sort: low/over first, then ok, then covered; alphabetical within
    const rank: Record<MicroStatus, number> = { low: 0, over: 0, ok: 1, covered: 2 };
    return Object.entries(avg)
      .map(([k, v]) => buildMicroRow(k, v))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
  }, [dbMeals]);

  const covered = rows.filter(r => r.status === "covered").length;
  const low     = rows.filter(r => r.status === "low").length;
  const over    = rows.filter(r => r.status === "over").length;

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Micronutrient Goals · {dayLabel || `avg/day, ${rangeLabel(timeFilter)}`}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            Progress toward daily goals from logged meals
          </div>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-1.5">
            {[
              { n: covered, label: "covered", color: C.optimal },
              { n: low,     label: "low",     color: C.warning },
              { n: over,    label: "over",    color: C.critical },
            ].map(s => (
              <span key={s.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: s.color, background: `${s.color}10`, border: `1px solid ${s.color}30`, fontFamily: "var(--font-mono)" }}>
                {s.n} {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl"
          style={{ background: "var(--surface-tertiary)", border: "1px dashed var(--border-subtle)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
            style={{ background: "var(--surface-quaternary)", border: "1px solid var(--border-subtle)" }}>
            <Brain size={16} style={{ color: C.textTer }} />
          </div>
          <div className="text-xs font-bold mb-1" style={{ color: C.textSec }}>No micronutrient data yet</div>
          <div className="text-[11px] max-w-sm" style={{ color: C.textTer, lineHeight: 1.6 }}>
            Log meals in Chat (/chat) — when entries include micronutrient estimates they will aggregate here.
          </div>
        </div>
      ) : (
        <>
          {MICRO_GROUP_ORDER.map(group => {
            const groupRows = rows.filter(r => r.group === group);
            if (groupRows.length === 0) return null;
            return (
              <div key={group} className="mb-4 last:mb-0">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.textTer }}>
                  {group}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  {groupRows.map((r, i) => {
                    const col = MICRO_STATUS_COLOR[r.status];
                    return (
                      <motion.div key={r.key}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3"
                        title={`${r.name}: ${r.status}`}
                      >
                        <div className="w-28 text-[11px] font-bold truncate" style={{ color: C.textSec }}>{r.name}</div>
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: C.border }}>
                          <motion.div className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, r.barPct)}%` }}
                            transition={{ duration: 0.9, ease: [0, 0, 0.2, 1], delay: i * 0.04 + 0.2 }}
                            style={{ background: col }}
                          />
                        </div>
                        <div className="w-20 text-right text-[11px] font-black font-mono" style={{ color: col }}>
                          {r.valueLabel}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="text-[10px] mt-4 pt-3" style={{ color: C.textTer, borderTop: "1px solid var(--border-subtle)", lineHeight: 1.6 }}>
            Estimates from logged meals — supplements with label values included. Days without logged food aren't counted.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Saved Items (known_items) ───────────────────────────────────
// Source: known_items — supplements/habits the chat agent auto-learns.
// The agent matches by name/alias and uses these exact macros on future logs.
function relTime(iso?: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function MacroChip({ label, val, color }: { label: string; val: number | null; color: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${color}12`, color, border: `1px solid ${color}25`, fontFamily: "var(--font-mono)" }}>
      {label} {val ?? "–"}
    </span>
  );
}

const EMPTY_ITEM_FORM = { name: "", aliases: "", calories: "", protein: "", carbs: "", fat: "" };

function SavedItemsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_ITEM_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ calories: "", protein: "", carbs: "", fat: "" });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("known_items")
      .select("*")
      .order("use_count", { ascending: false })
      .order("created_at", { ascending: false });
    if (!error && data) setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) { setLoading(false); return; }
    fetchItems();
  }, []);

  const getUserId = async () => {
    const { data: profile } = await supabase.from("user_profiles").select("user_id").limit(1);
    return profile?.[0]?.user_id || "00000000-0000-0000-0000-000000000000";
  };

  const numOrNull = (v: string) => v.trim() === "" ? null : Math.round(Number(v));

  const addItem = async () => {
    if (!form.name.trim()) return;
    const userId = await getUserId();
    const { error } = await supabase.from("known_items").insert({
      user_id: userId,
      name: form.name.trim(),
      aliases: form.aliases.split(",").map(a => a.trim()).filter(Boolean),
      calories: numOrNull(form.calories),
      protein: numOrNull(form.protein),
      carbs: numOrNull(form.carbs),
      fat: numOrNull(form.fat),
    });
    if (error) { alert("Failed to save item: " + error.message); return; }
    setForm({ ...EMPTY_ITEM_FORM });
    setAdding(false);
    fetchItems();
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      calories: item.calories ?? "",
      protein: item.protein ?? "",
      carbs: item.carbs ?? "",
      fat: item.fat ?? "",
    });
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("known_items").update({
      calories: numOrNull(editForm.calories),
      protein: numOrNull(editForm.protein),
      carbs: numOrNull(editForm.carbs),
      fat: numOrNull(editForm.fat),
    }).eq("id", id);
    if (error) { alert("Failed to update item: " + error.message); return; }
    setEditingId(null);
    fetchItems();
  };

  const removeItem = async (id: string) => {
    await supabase.from("known_items").delete().eq("id", id);
    fetchItems();
  };

  const inputCls = "p-2 rounded-lg text-xs font-mono outline-none";
  const inputStyle = { background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: C.text };

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
          Saved Items · Habits
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: C.textSec }}>
            <Plus size={11} /> Add
          </button>
        )}
      </div>
      <div className="text-[11px] mb-4" style={{ color: C.textSec }}>
        Log these in Chat by name — the agent uses these exact macros.
      </div>

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-xl mb-4 space-y-2" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex gap-2 flex-wrap">
                <input placeholder="Name (e.g. Fish Oil)" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={`flex-1 min-w-[160px] ${inputCls}`} style={inputStyle} />
                <input placeholder="Aliases, comma separated" value={form.aliases}
                  onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
                  className={`flex-1 min-w-[160px] ${inputCls}`} style={inputStyle} />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {(["calories", "protein", "carbs", "fat"] as const).map(k => (
                  <input key={k} type="number" placeholder={k === "calories" ? "kcal" : `${k} (g)`} value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className={`w-20 ${inputCls}`} style={inputStyle} />
                ))}
                <div className="flex-1" />
                <button onClick={() => { setAdding(false); setForm({ ...EMPTY_ITEM_FORM }); }}
                  className="text-xs font-bold px-3 py-1.5" style={{ color: C.textTer }}>Cancel</button>
                <button onClick={addItem}
                  className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{ background: C.optimal, color: "#fff" }}>
                  <Check size={12} /> Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List / empty state */}
      {loading ? (
        <div className="text-center text-xs py-6" style={{ color: C.textTer }}>Loading saved items…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl"
          style={{ background: "var(--surface-tertiary)", border: "1px dashed var(--border-subtle)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
            style={{ background: "var(--surface-quaternary)", border: "1px solid var(--border-subtle)" }}>
            <Target size={16} style={{ color: C.textTer }} />
          </div>
          <div className="text-xs font-bold mb-1" style={{ color: C.textSec }}>No saved items yet</div>
          <div className="text-[11px] max-w-sm" style={{ color: C.textTer, lineHeight: 1.6 }}>
            Items you log repeatedly in Chat (/chat) — supplements, shakes, habits — are learned automatically, or add them manually above.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div key={item.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="p-3 rounded-xl"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold" style={{ color: C.text }}>{item.name}</span>
                    <MacroChip label="kcal" val={item.calories} color={C.calories} />
                    <MacroChip label="P" val={item.protein} color={C.protein} />
                    <MacroChip label="C" val={item.carbs} color={C.carbs} />
                    <MacroChip label="F" val={item.fat} color={C.fat} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {(item.aliases || []).map((a: string) => (
                      <span key={a} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--surface-quaternary)", color: C.textTer, border: "1px solid var(--border-subtle)" }}>
                        {a}
                      </span>
                    ))}
                    <span className="text-[10px] font-mono" style={{ color: C.textTer }}>
                      used {item.use_count ?? 0}x · last {relTime(item.last_used_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5" style={{ color: C.textTer }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => removeItem(item.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5" style={{ color: C.critical }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Inline macro edit */}
              <AnimatePresence>
                {editingId === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 flex-wrap items-center mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      {(["calories", "protein", "carbs", "fat"] as const).map(k => (
                        <input key={k} type="number" placeholder={k === "calories" ? "kcal" : `${k} (g)`} value={editForm[k]}
                          onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                          className={`w-20 ${inputCls}`} style={inputStyle} />
                      ))}
                      <button onClick={() => saveEdit(item.id)}
                        className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                        style={{ background: C.optimal, color: "#fff" }}>
                        <Check size={11} /> Save
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zone 5: Meal Stream (Rich Cards) ────────────────────────────
function MealStreamCard({ meal, index }: { meal: any; index: number }) {
  const [open, setOpen] = useState(false);
  const cal = meal.calories || 0;
  const p   = meal.protein  || 0;
  const c   = meal.carbs    || 0;
  const f   = meal.fat      || 0;

  const totalMacroG = p + c + f || 1;
  const macroWidths = {
    protein: (p / totalMacroG) * 100,
    carbs:   (c / totalMacroG) * 100,
    fat:     (f / totalMacroG) * 100,
  };
  const micros = parseMicros(meal.micronutrients);
  const microKeys = Object.keys(micros);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.07 + 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="card-surface overflow-hidden"
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(91,66,232,0.1)", border: "1px solid rgba(91,66,232,0.2)" }}>
              <Flame size={15} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: C.text }}>{meal.description || "Unclassified Meal"}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Clock size={10} style={{ color: C.textTer }} />
                <span className="text-[10px] font-bold font-mono" style={{ color: C.textTer }}>
                  {new Date(meal.meal_time).toLocaleDateString([], { month: "short", day: "numeric" })}
                  {" · "}
                  {new Date(meal.meal_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: C.calories, lineHeight: 1 }}>{cal}</div>
            <div className="text-[10px] font-bold" style={{ color: C.textTer }}>kcal</div>
          </div>
        </div>

        {/* Macro stacked bar */}
        <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-2">
          <div className="rounded-l-full" style={{ width: `${macroWidths.protein}%`, background: C.protein }} />
          <div style={{ width: `${macroWidths.carbs}%`, background: C.carbs }} />
          <div className="rounded-r-full" style={{ width: `${macroWidths.fat}%`, background: C.fat }} />
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold" style={{ fontFamily: "var(--font-mono)" }}>
          <span style={{ color: C.protein }}>P {p}g</span>
          <span style={{ color: C.carbs }}>C {c}g</span>
          <span style={{ color: C.fat }}>F {f}g</span>
        </div>

        {/* AI insight — only when the meal row actually carries one */}
        {meal.ai_insight && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg mt-3"
            style={{ background: "rgba(91,66,232,0.04)", border: "1px solid rgba(91,66,232,0.12)" }}>
            <Brain size={12} style={{ color: "var(--accent-sleep)", marginTop: 2, flexShrink: 0 }} />
            <span className="text-[11px] leading-relaxed" style={{ color: C.textSec }}>{meal.ai_insight}</span>
          </div>
        )}
      </div>

      {/* Expandable macro detail */}
      <button
        onClick={() => setOpen(x => !x)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-slate-50"
        style={{ color: C.textTer, borderTop: `1px solid ${C.border}` }}
      >
        {open ? <><ChevronUp size={11} /> Hide Detail</> : <><ChevronDown size={11} /> Full Breakdown</>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 grid grid-cols-4 gap-2" style={{ background: "var(--surface-tertiary)", borderTop: `1px solid ${C.border}` }}>
              {[
                { label: "Calories", val: cal, unit: "kcal", color: C.calories },
                { label: "Protein",  val: p,   unit: "g",    color: C.protein  },
                { label: "Carbs",    val: c,   unit: "g",    color: C.carbs    },
                { label: "Fat",      val: f,   unit: "g",    color: C.fat      },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>{s.label}</div>
                  <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: s.color }}>{s.val}<span className="text-[10px]" style={{ color: C.textTer }}>{s.unit}</span></div>
                </div>
              ))}
              {microKeys.length > 0 && (
                <div className="col-span-4 flex flex-wrap gap-1.5 mt-1 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  {microKeys.map(k => (
                    <span key={k} className="text-[9px] font-bold px-1.5 py-0.5 rounded capitalize"
                      style={{ background: `${C.fiber}12`, color: C.fiber, border: `1px solid ${C.fiber}25`, fontFamily: "var(--font-mono)" }}>
                      {k} {Math.round(micros[k] * 10) / 10}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Meal Gallery: sideways snap-scroll of day cards ─────────────
function MealGallery({ dbMeals, timeFilter, onOpenDay }: {
  dbMeals: any[]; timeFilter: string; onOpenDay?: (dk: string) => void;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDay: Record<string, any[]> = {};
    dbMeals.forEach(m => {
      const dk = dayKeyOf(m.meal_time);
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push(m);
    });
    return Object.keys(byDay).sort((a, b) => b.localeCompare(a)).map(dk => {
      const meals = byDay[dk].sort((a, b) => new Date(a.meal_time).getTime() - new Date(b.meal_time).getTime());
      return {
        dk,
        meals,
        cal: meals.reduce((a, m) => a + (m.calories || 0), 0),
        p: meals.reduce((a, m) => a + (m.protein || 0), 0),
        c: meals.reduce((a, m) => a + (m.carbs || 0), 0),
        f: meals.reduce((a, m) => a + (m.fat || 0), 0),
      };
    });
  }, [dbMeals]);

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.textTer }}>
        Meal Log · {rangeLabel(timeFilter)} · {days.length} day{days.length !== 1 ? "s" : ""}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {days.map(d => {
          const macroTotal = d.p + d.c + d.f || 1;
          const expanded = expandedDay === d.dk;
          const shown = expanded
            ? d.meals
            : [...d.meals].sort((a, b) => (b.calories || 0) - (a.calories || 0)).slice(0, 3);
          return (
            <div key={d.dk} className="card-surface p-4 shrink-0 flex flex-col gap-2.5"
              style={{ borderRadius: "var(--radius-lg)", minWidth: 230, maxWidth: 260, scrollSnapAlign: "start" }}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => onOpenDay?.(d.dk)} className="text-xs font-bold hover:underline text-left" style={{ color: C.text }}>
                  {fmtDayLong(d.dk)}
                </button>
                <div className="text-sm font-black shrink-0" style={{ fontFamily: "var(--font-mono)", color: C.calories }}>
                  {d.cal}<span className="text-[9px] ml-0.5" style={{ color: C.textTer }}>kcal</span>
                </div>
              </div>
              {/* macro mini stacked bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                <div style={{ width: `${(d.p / macroTotal) * 100}%`, background: C.protein }} />
                <div style={{ width: `${(d.c / macroTotal) * 100}%`, background: C.carbs }} />
                <div style={{ width: `${(d.f / macroTotal) * 100}%`, background: C.fat }} />
              </div>
              <div className="flex items-center gap-3 text-[9px] font-bold" style={{ fontFamily: "var(--font-mono)" }}>
                <span style={{ color: C.protein }}>P {d.p}g</span>
                <span style={{ color: C.carbs }}>C {d.c}g</span>
                <span style={{ color: C.fat }}>F {d.f}g</span>
              </div>
              <div className="space-y-1.5">
                {shown.map((m, i) => (
                  <div key={m.id || i} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="truncate" style={{ color: C.textSec }}>{m.description || "Meal"}</span>
                    <span className="font-mono font-bold shrink-0" style={{ color: C.calories }}>{m.calories || 0}</span>
                  </div>
                ))}
              </div>
              {d.meals.length > 3 && (
                <button onClick={() => setExpandedDay(x => x === d.dk ? null : d.dk)}
                  className="text-[10px] font-bold text-left transition-colors hover:underline" style={{ color: C.textTer }}>
                  {expanded ? "Show less ▲" : `+${d.meals.length - 3} more ▼`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day Timeline: clock-ordered meals with running totals ───────
function DayTimeline({ meals }: { meals: any[] }) {
  const sorted = [...meals].sort((a, b) => new Date(a.meal_time).getTime() - new Date(b.meal_time).getTime());
  let running = 0;

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.textTer }}>
        Meal Timeline
      </div>
      <div>
        {sorted.map((m, i) => {
          running += m.calories || 0;
          const run = running;
          return (
            <div key={m.id || i} className="flex gap-3">
              {/* rail: time + dot + connector */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 56 }}>
                <span className="text-[10px] font-bold font-mono" style={{ color: C.textSec }}>
                  {new Date(m.meal_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="w-2 h-2 rounded-full my-1 shrink-0" style={{ background: C.calories }} />
                {i < sorted.length - 1 && <div className="w-px flex-1" style={{ background: "var(--border-subtle)" }} />}
              </div>
              <div className="flex-1 pb-4 min-w-0">
                <div className="text-[10px] font-mono mb-1" style={{ color: C.textTer }}>running {run} kcal</div>
                <MealStreamCard meal={m} index={i} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Zone 6: Action Items (derived from real intake only) ─────────
function ActionItems({ totalCal, totalP, totalC, loggedDays, calTarget, dbWorkouts, timeFilter }: {
  totalCal: number; totalP: number; totalC: number; loggedDays: number;
  calTarget: number | null; dbWorkouts: any[]; timeFilter: string;
}) {
  const [dismissed, setDismissed] = useState<number[]>([]);

  const days = Math.max(1, loggedDays);
  const avgCal = Math.round(totalCal / days);
  const avgP = Math.round(totalP / days);
  const avgC = Math.round(totalC / days);
  const hasWorkout = dbWorkouts.length > 0;

  const allActions = [
    calTarget !== null && avgCal < calTarget * 0.7 && {
      priority: "warning" as const,
      title: `Intake below target — ~${avgCal} vs ${calTarget} kcal/day`,
      reason: `Average intake across ${days} logged day${days !== 1 ? "s" : ""} in the ${rangeLabel(timeFilter)} is ${calTarget - avgCal} kcal under your configured daily target.`,
      action: "Log Meal",
      icon: Flame,
    },
    calTarget !== null && avgCal > calTarget * 1.15 && {
      priority: "warning" as const,
      title: `Intake above target — ~${avgCal} vs ${calTarget} kcal/day`,
      reason: `Average intake across ${days} logged day${days !== 1 ? "s" : ""} exceeds your configured daily target by ${avgCal - calTarget} kcal.`,
      action: "Review Meals",
      icon: TrendingUp,
    },
    hasWorkout && avgC < 150 && {
      priority: "critical" as const,
      title: "Carb intake low for a training period",
      reason: `Only ~${avgC}g carbs/day on average while ${new Set(dbWorkouts.map(w => (w.workout_date || "").split("T")[0])).size} training day(s) are logged in this range. Glycogen replenishment typically requires considerably more.`,
      action: "View Carb Sources",
      icon: Zap,
    },
    {
      priority: "optimal" as const,
      title: `${days} day${days !== 1 ? "s" : ""} logged in the ${rangeLabel(timeFilter)}`,
      reason: `Averages per logged day: ${avgCal} kcal · ${avgP}g protein · ${avgC}g carbs. Log meals in Chat (/chat) to keep the record complete.`,
      action: "Open Chat",
      icon: CheckCircle,
    },
  ].filter(Boolean) as Array<{
    priority: "critical" | "warning" | "optimal";
    title: string; reason: string; action: string; icon: any;
  }>;

  const visible = allActions.filter((_, i) => !dismissed.includes(i));

  const priorityConfig = {
    critical: { bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.25)", color: C.critical,  dot: "🔴", label: "Action Required" },
    warning:  { bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.25)",  color: C.warning,  dot: "🟡", label: "Attention"       },
    optimal:  { bg: "rgba(5,150,105,0.06)", border: "rgba(5,150,105,0.25)", color: C.optimal,   dot: "🟢", label: "Insight"         },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
          Action Items
        </div>
        <div className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(91,66,232,0.1)", color: "var(--accent-sleep)", border: "1px solid rgba(91,66,232,0.25)" }}>
          {visible.length} active
        </div>
      </div>

      <div className="space-y-3">
        {visible.slice(0, 5).map((a, i) => {
          const cfg = priorityConfig[a.priority];
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="p-4 rounded-xl"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}30` }}>
                  <a.icon size={14} style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest mr-2" style={{ color: cfg.color }}>
                        {cfg.dot} {cfg.label}
                      </span>
                      <div className="text-sm font-bold mt-0.5" style={{ color: C.text }}>{a.title}</div>
                    </div>
                    <button onClick={() => setDismissed(d => [...d, allActions.indexOf(a)])}
                      className="p-1 rounded hover:bg-black/5 transition-colors shrink-0"
                      style={{ color: C.textTer }}>
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed mb-3" style={{ color: C.textSec }}>{a.reason}</p>
                  <button className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{ background: cfg.color, color: "#fff" }}>
                    {a.action} <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {visible.length === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl"
            style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)" }}>
            <CheckCircle size={20} style={{ color: C.optimal }} />
            <div>
              <div className="text-sm font-bold" style={{ color: C.optimal }}>All caught up</div>
              <div className="text-xs" style={{ color: C.textSec }}>No nutritional action items for this range.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main FuelTab Component ───────────────────────────────────────
interface FuelTabProps {
  dbMeals?: any[];
  dbWorkouts?: any[];
  timeFilter?: string;
  viewMode?: "range" | "day";
  selectedDay?: string;
  onJumpToDay?: (dk: string) => void;
  dayLens?: ReactNode;
}

export default function FuelTab({
  dbMeals = [], dbWorkouts = [], timeFilter = "month",
  viewMode = "range", selectedDay, onJumpToDay, dayLens,
}: FuelTabProps) {
  const targets = useNutritionTargets();
  const calTarget = targets.calories;

  // Range aggregates (also used for the day-vs-average comparison chip)
  let totalCal = 0, totalP = 0, totalC = 0, totalFat = 0, totalFib = 0;
  dbMeals.forEach(m => {
    totalCal += m.calories || 0;
    totalP   += m.protein  || 0;
    totalC   += m.carbs    || 0;
    totalFat += m.fat      || 0;
    totalFib += parseMicros(m.micronutrients).fiber || 0;
  });
  const loggedDays = new Set(dbMeals.map(m => dayKeyOf(m.meal_time))).size;

  // Day lens: narrow to the picked day
  const isDay = viewMode === "day" && !!selectedDay;
  const dayMeals = isDay ? dbMeals.filter(m => dayKeyOf(m.meal_time) === selectedDay) : dbMeals;
  let dCal = 0, dP = 0, dC = 0, dF = 0;
  dayMeals.forEach(m => {
    dCal += m.calories || 0;
    dP   += m.protein  || 0;
    dC   += m.carbs    || 0;
    dF   += m.fat      || 0;
  });

  // No data in the active lens — honest empty state, not stale all-time data
  if (dayMeals.length === 0) {
    return (
      <div className="space-y-5">
        {dayLens}
        <div className="flex flex-col items-center justify-center p-16 text-center"
          style={{ minHeight: 400 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "rgba(0,168,120,0.1)", border: "1px solid rgba(0,168,120,0.2)" }}>
            <Flame size={28} style={{ color: "var(--accent-nutrition)" }} />
          </div>
          <div className="text-base font-bold mb-2" style={{ color: C.text }}>
            {isDay ? `No meals logged on ${fmtDayLong(selectedDay!)}` : `No meals logged · ${rangeLabel(timeFilter)}`}
          </div>
          <div className="text-sm max-w-xs" style={{ color: C.textSec, lineHeight: 1.6 }}>
            Log meals in Chat (/chat) — text or a photo — and the Fuel dashboard will populate with intake, macros and micronutrients.
          </div>
        </div>
      </div>
    );
  }

  // ── Day mode: one day in detail ──
  if (isDay) {
    const avgCal = loggedDays > 0 ? Math.round(totalCal / loggedDays) : 0;
    const delta = dCal - avgCal;
    const macroKcal = dP * 4 + dC * 4 + dF * 9;
    const dayMacros = [
      { label: "Protein", g: dP, kcal: dP * 4, color: C.protein },
      { label: "Carbs", g: dC, kcal: dC * 4, color: C.carbs },
      { label: "Fat", g: dF, kcal: dF * 9, color: C.fat },
    ];
    return (
      <div className="space-y-6 pb-4">
        {dayLens}

        {/* Day summary */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
              Fuel · {fmtDayLong(selectedDay!)}
            </div>
            <div className="text-[10px] font-bold px-2 py-1 rounded-lg font-mono"
              style={{
                background: delta > 0 ? "rgba(217,119,6,0.08)" : "rgba(5,150,105,0.08)",
                color: delta > 0 ? C.warning : C.optimal,
                border: `1px solid ${delta > 0 ? "rgba(217,119,6,0.2)" : "rgba(5,150,105,0.2)"}`,
              }}>
              {delta > 0 ? "+" : ""}{delta} kcal vs {rangeLabel(timeFilter)} daily avg ({avgCal})
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Calories", val: dCal, unit: "kcal", color: C.calories, target: targets.calories },
              { label: "Protein", val: dP, unit: "g", color: C.protein, target: targets.protein },
              { label: "Carbs", val: dC, unit: "g", color: C.carbs, target: targets.carbs },
              { label: "Fat", val: dF, unit: "g", color: C.fat, target: targets.fat },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>{s.label}</div>
                <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: s.color, lineHeight: 1 }}>
                  {s.val}<span className="text-[10px] ml-0.5" style={{ color: C.textTer }}>{s.unit}</span>
                </div>
                {s.target != null && (
                  <div className="text-[10px] font-semibold mt-1" style={{ color: C.textTer, fontFamily: "var(--font-mono)" }}>
                    / {s.target}{s.unit} target
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Day macro split — 100% stacked bar */}
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.textTer }}>Macro Split (share of macro kcal)</div>
          <div className="flex h-6 rounded-lg overflow-hidden" style={{ background: "var(--border-subtle)" }}>
            {dayMacros.map(m => {
              const share = macroKcal > 0 ? Math.round((m.kcal / macroKcal) * 100) : 0;
              return (
                <motion.div key={m.label}
                  initial={{ width: 0 }} animate={{ width: `${share}%` }}
                  transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
                  className="flex items-center justify-center"
                  style={{ background: m.color }}>
                  {share >= 10 && <span className="text-[10px] font-bold text-white">{m.label} {share}%</span>}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Hourly intake curve for the day */}
        <IntakeTimeline dbMeals={dayMeals} calTarget={calTarget} timeFilter="day" />

        {/* Micronutrient goals for this day */}
        <MicroPanel dbMeals={dayMeals} timeFilter="day" dayLabel={fmtDayLong(selectedDay!)} />

        {/* Clock-ordered meal timeline */}
        <DayTimeline meals={dayMeals} />

        <SavedItemsPanel />
      </div>
    );
  }

  // ── Range mode ──
  return (
    <div className="space-y-6 pb-4">
      {dayLens}

      {/* Zone 1 — Intake Overview HUD */}
      <IntakeHUD
        totalCal={totalCal} totalP={totalP} totalC={totalC} totalFat={totalFat}
        loggedDays={loggedDays} calTarget={calTarget}
        pTarget={targets.protein} cTarget={targets.carbs} fTarget={targets.fat}
        timeFilter={timeFilter}
      />

      {/* Zone 2 — Intake Timeline (clickable) */}
      <IntakeTimeline dbMeals={dbMeals} calTarget={calTarget} timeFilter={timeFilter} onDaySelect={onJumpToDay} />

      {/* Zone 2b — Macros per Day (stacked grams, clickable) */}
      <DailyMacroChart dbMeals={dbMeals} timeFilter={timeFilter} onDaySelect={onJumpToDay} />

      {/* Zone 3 — Macro Split + Workout Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MacroSplitPanel totalP={totalP} totalC={totalC} totalFat={totalFat} totalFib={totalFib} />
        <MacroWorkoutCorrelation dbWorkouts={dbWorkouts} totalP={totalP} totalC={totalC} loggedDays={loggedDays} timeFilter={timeFilter} />
      </div>

      {/* Zone 4 — Micronutrients */}
      <MicroPanel dbMeals={dbMeals} timeFilter={timeFilter} />

      {/* Saved Items (known_items) */}
      <SavedItemsPanel />

      {/* Zone 5 + 6 — Meal Gallery & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MealGallery dbMeals={dbMeals} timeFilter={timeFilter} onOpenDay={onJumpToDay} />
        <ActionItems
          totalCal={totalCal} totalP={totalP} totalC={totalC}
          loggedDays={loggedDays} calTarget={calTarget} dbWorkouts={dbWorkouts} timeFilter={timeFilter}
        />
      </div>

    </div>
  );
}
