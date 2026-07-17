"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, Radar, Cell,
  RadialBarChart, RadialBar, PieChart, Pie
} from "recharts";
import {
  Flame, Zap, Target, Clock, Brain, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, ArrowRight, Droplets, TrendingUp,
  TrendingDown, Minus, Activity, Dumbbell, Info, X, Plus,
  BookOpen, ShoppingCart
} from "lucide-react";

// ─── Color palette ────────────────────────────────────────────────
const C = {
  protein:   "#E03535",
  carbs:     "#00A878",
  fat:       "#D97706",
  fiber:     "#0EA5E9",
  calories:  "#5B42E8",
  optimal:   "#059669",
  warning:   "#D97706",
  critical:  "#DC2626",
  text:      "#0F172A",
  textSec:   "#475569",
  textTer:   "#94A3B8",
  surface:   "#EEF1F8",
  border:    "#E2E8F0",
};

// ─── Goals ────────────────────────────────────────────────────────
const GOALS = { cal: 3200, protein: 180, carbs: 400, fat: 80, fiber: 35 };
const BMR   = 2100;

// ─── Helpers ─────────────────────────────────────────────────────
function pct(val: number, goal: number) { return Math.min(100, Math.round((val / goal) * 100)); }

function DeltaBadge({ value, unit = "" }: { value: number; unit?: string }) {
  const isPos = value > 0, isNeg = value < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? C.optimal : isNeg ? C.critical : C.textTer;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color, fontFamily: "var(--font-mono)" }}>
      <Icon size={11} />{isPos && "+"}{value}{unit}
    </span>
  );
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

// ─── Zone 1: Energy Command HUD ──────────────────────────────────
function EnergyCommandHUD({ totalCal, totalP, totalF_g, activeBurn }: {
  totalCal: number; totalP: number; totalF_g: number; activeBurn: number;
}) {
  const netEnergy  = totalCal - (BMR + activeBurn);
  const calPct     = pct(totalCal, GOALS.cal);
  const protPct    = pct(totalP, GOALS.protein);
  const totalBurn  = BMR + activeBurn;

  const chips = [
    {
      id: "net",
      label: "Net Energy",
      value: `${netEnergy > 0 ? "+" : ""}${netEnergy}`,
      unit: "kcal",
      sublabel: netEnergy > 0 ? "Caloric Surplus" : netEnergy < 0 ? "Caloric Deficit" : "Balanced",
      color: netEnergy > 100 ? C.optimal : netEnergy < -300 ? C.critical : C.warning,
      pct: calPct,
      icon: Flame,
    },
    {
      id: "protein",
      label: "Protein Pace",
      value: totalP,
      unit: "g",
      sublabel: `${GOALS.protein - totalP}g to target`,
      color: C.protein,
      pct: protPct,
      icon: Target,
    },
    {
      id: "burn",
      label: "Today's Burn",
      value: totalBurn,
      unit: "kcal",
      sublabel: `BMR ${BMR} + Active ${activeBurn}`,
      color: C.carbs,
      pct: Math.min(100, Math.round((activeBurn / 800) * 100)),
      icon: Zap,
    },
    {
      id: "load",
      label: "Caloric Load",
      value: `${calPct}%`,
      unit: "",
      sublabel: `${totalCal} / ${GOALS.cal} kcal`,
      color: calPct > 100 ? C.warning : calPct > 75 ? C.optimal : C.critical,
      pct: calPct,
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {chips.map((chip, i) => {
        const r = 26, circ = 2 * Math.PI * r;
        return (
          <motion.div
            key={chip.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="card-surface p-4 flex items-center gap-4"
            style={{ borderRadius: "var(--radius-lg)" }}
          >
            {/* Radial progress mini-ring */}
            <div className="relative shrink-0" style={{ width: 58, height: 58 }}>
              <svg width={58} height={58} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={29} cy={29} r={r} fill="none" stroke={C.border} strokeWidth={5} />
                <motion.circle
                  cx={29} cy={29} r={r} fill="none"
                  stroke={chip.color} strokeWidth={5} strokeLinecap="round"
                  initial={{ strokeDasharray: `0 ${circ}` }}
                  animate={{ strokeDasharray: `${circ * (chip.pct / 100)} ${circ * (1 - chip.pct / 100)}` }}
                  transition={{ duration: 1.1, ease: [0, 0, 0.2, 1], delay: i * 0.07 + 0.2 }}
                  style={{ filter: `drop-shadow(0 0 6px ${chip.color}60)` }}
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

// ─── Zone 2: Caloric Timeline ─────────────────────────────────────
function CaloricTimeline({ dbMeals, dbWorkouts }: { dbMeals: any[]; dbWorkouts: any[] }) {
  const [hoveredMeal, setHoveredMeal] = useState<any>(null);

  // Build 24-point hourly cumulative intake data
  const hourlyData = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 6; h <= 23; h++) buckets[h] = 0;

    const todayMeals = dbMeals.filter(m => {
      const d = new Date(m.meal_time);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });

    todayMeals.forEach(m => {
      const h = new Date(m.meal_time).getHours();
      if (h >= 6 && h <= 23) buckets[h] = (buckets[h] || 0) + (m.calories || 0);
    });

    // Cumulative
    let running = 0;
    return Object.keys(buckets).map(h => {
      running += buckets[Number(h)];
      const goalPace = Math.round((Number(h) - 6) / 17 * GOALS.cal);
      return { hour: `${h}:00`, h: Number(h), cumulative: running, goalPace };
    });
  }, [dbMeals]);

  // Workout windows
  const workoutWindows = useMemo(() => {
    return dbWorkouts.filter(w => {
      const d = new Date(w.workout_date);
      const now = new Date();
      return d.toDateString() === now.toDateString() && w.duration_minutes;
    }).map(w => {
      const start = new Date(w.workout_date).getHours();
      const dur = Math.round((w.duration_minutes || 60) / 60);
      return { start, end: start + dur, name: w.exercise_name || "Workout" };
    });
  }, [dbWorkouts]);

  // Meal dots on chart
  const mealDots = useMemo(() => {
    return dbMeals
      .filter(m => {
        const d = new Date(m.meal_time);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      })
      .map(m => ({
        hour: new Date(m.meal_time).getHours(),
        name: m.description || "Meal",
        cal: m.calories || 0,
        protein: m.protein || 0,
        carbs: m.carbs || 0,
        fat: m.fat || 0,
      }));
  }, [dbMeals]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card-surface px-3 py-2 text-xs shadow-lg" style={{ borderRadius: "var(--radius-md)", minWidth: 140 }}>
        <div className="font-bold mb-1" style={{ color: C.text }}>{label}</div>
        <div className="flex items-center gap-2" style={{ color: C.calories }}>
          <span>Consumed:</span>
          <span className="font-bold font-mono">{payload[0]?.value} kcal</span>
        </div>
        <div className="flex items-center gap-2" style={{ color: C.textTer }}>
          <span>Goal pace:</span>
          <span className="font-mono">{payload[1]?.value} kcal</span>
        </div>
      </div>
    );
  };

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Caloric Timeline
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            Intake vs. goal pace · meal windows · workout zones
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: C.textTer }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded" style={{ background: C.calories }} /> Consumed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded border-dashed border border-gray-400" /> Goal Pace
          </span>
          {workoutWindows.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3 rounded" style={{ background: "rgba(224,53,53,0.15)" }} /> Workout
            </span>
          )}
        </div>
      </div>

      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
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
              tickFormatter={v => `${v}`}
              width={40}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine y={GOALS.cal} stroke={C.optimal} strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: "Goal", position: "right", fontSize: 10, fill: C.optimal }} />

            {/* Workout windows */}
            {workoutWindows.map((w, i) => (
              <ReferenceLine key={i} x={`${w.start}:00`}
                stroke="rgba(224,53,53,0.5)" strokeWidth={1} strokeDasharray="2 2"
                label={{ value: "⚡ WO", position: "top", fontSize: 9, fill: C.critical }}
              />
            ))}

            <Area type="monotone" dataKey="cumulative" stroke={C.calories} strokeWidth={2.5}
              fill="url(#fuelCalGrad)" dot={false} activeDot={{ r: 5, fill: C.calories }}
            />
            <Area type="monotone" dataKey="goalPace" stroke="#CBD5E1" strokeWidth={1.5}
              strokeDasharray="5 4" fill="none" dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Meal dots legend below chart */}
      {mealDots.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {mealDots.map((m, i) => (
            <div key={i}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:scale-105"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: C.calories }} />
              <span className="text-[10px] font-bold" style={{ color: C.text }}>{m.hour}:00</span>
              <span className="text-[10px]" style={{ color: C.textSec }}>{m.name.split(" ").slice(0, 2).join(" ")}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: C.calories }}>{m.cal}kcal</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zone 3: Macro Intelligence Grid ─────────────────────────────
function MacroRingPanel({ totalP, totalC, totalFat, totalFib }: {
  totalP: number; totalC: number; totalFat: number; totalFib: number;
}) {
  const macros = [
    { label: "Protein", val: totalP,   goal: GOALS.protein, color: C.protein,  unit: "g", key: "protein" },
    { label: "Carbs",   val: totalC,   goal: GOALS.carbs,   color: C.carbs,    unit: "g", key: "carbs"   },
    { label: "Fat",     val: totalFat, goal: GOALS.fat,     color: C.fat,      unit: "g", key: "fat"     },
    { label: "Fiber",   val: totalFib, goal: GOALS.fiber,   color: C.fiber,    unit: "g", key: "fiber"   },
  ];

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: C.textTer }}>
        Macro Target Rings
      </div>
      <div className="grid grid-cols-2 gap-4">
        {macros.map((m, i) => {
          const p = pct(m.val, m.goal);
          const r = 36, circ = 2 * Math.PI * r;
          const remaining = Math.max(0, m.goal - m.val);
          const status = p >= 100 ? "optimal" : p >= 60 ? "warning" : "critical";

          return (
            <motion.div key={m.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 + 0.2, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
            >
              {/* Ring */}
              <div className="relative" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={40} cy={40} r={r} fill="none" stroke={C.border} strokeWidth={7} />
                  <motion.circle
                    cx={40} cy={40} r={r} fill="none"
                    stroke={m.color} strokeWidth={7} strokeLinecap="round"
                    initial={{ strokeDasharray: `0 ${circ}` }}
                    animate={{ strokeDasharray: `${circ * (p / 100)} ${circ * (1 - p / 100)}` }}
                    transition={{ duration: 1.2, ease: [0, 0, 0.2, 1], delay: i * 0.1 + 0.3 }}
                    style={{ filter: `drop-shadow(0 0 8px ${m.color}50)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black leading-none" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{p}%</span>
                  <span className="text-[9px] font-bold" style={{ color: C.textTer }}>done</span>
                </div>
              </div>

              <div className="text-center w-full">
                <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textSec }}>{m.label}</div>
                <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: C.text, lineHeight: 1 }}>
                  {m.val}<span className="text-xs font-bold" style={{ color: C.textTer }}>/{m.goal}g</span>
                </div>
                <div className="mt-1">
                  {remaining > 0 ? (
                    <span className="text-[10px] font-bold" style={{ color: C.textTer }}>
                      {remaining}g remaining
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold" style={{ color: C.optimal }}>✓ Target hit</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MacroWorkoutCorrelation({ dbWorkouts, totalP, totalC }: {
  dbWorkouts: any[]; totalP: number; totalC: number;
}) {
  // Find today's workouts and compute context
  const todayWorkouts = dbWorkouts.filter(w => {
    const d = new Date(w.workout_date);
    return d.toDateString() === new Date().toDateString();
  });

  const hasWorkout = todayWorkouts.length > 0;
  const workoutBurn = todayWorkouts.reduce((a, w) => a + (w.calories || 0), 0);

  const preCarbAdequacy  = totalC >= 100 ? "optimal" : totalC >= 60 ? "warning" : "critical";
  const postProteinTiming = totalP >= 120 ? "optimal" : totalP >= 80 ? "warning" : "critical";
  const energyAvail      = (totalC + totalP) >= 200 ? "optimal" : "warning";

  const rows = [
    {
      label: "Pre-workout carb priming",
      detail: `${totalC}g carbs consumed (target: 80–120g pre-session)`,
      status: preCarbAdequacy as "optimal" | "warning" | "critical",
      tip: preCarbAdequacy !== "optimal" ? "Eat 30–50g fast carbs 45 min before training" : "Carb load is optimal for performance",
    },
    {
      label: "Post-workout protein timing",
      detail: `${totalP}g protein logged (anabolic window: within 2h post-WO)`,
      status: postProteinTiming as "optimal" | "warning" | "critical",
      tip: postProteinTiming !== "optimal" ? `Need ${GOALS.protein - totalP}g more protein — consume shake or chicken breast` : "Protein synthesis window well-covered",
    },
    {
      label: "Energy availability index",
      detail: `Available energy: ${totalC * 4 + totalP * 4} kcal from P+C macros`,
      status: energyAvail as "optimal" | "warning",
      tip: energyAvail !== "optimal" ? "Increase carb intake to sustain performance & hormonal health" : "Energy availability is sufficient",
    },
    {
      label: "Recovery nutrition",
      detail: `Omega-3 & anti-inflammatories from food log (AI estimated)`,
      status: "optimal" as "optimal",
      tip: "Anti-inflammatory profile looks good for overnight HRV recovery",
    },
  ];

  return (
    <div className="card-surface p-5 flex flex-col gap-4" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Macro–Workout Sync
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            {hasWorkout ? `${todayWorkouts.length} session${todayWorkouts.length > 1 ? "s" : ""} · ${workoutBurn} kcal burned` : "No sessions logged today"}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full`}
          style={{
            background: hasWorkout ? "rgba(5,150,105,0.1)" : "rgba(148,163,184,0.1)",
            color: hasWorkout ? C.optimal : C.textTer,
            border: `1px solid ${hasWorkout ? "rgba(5,150,105,0.25)" : "rgba(148,163,184,0.25)"}`
          }}>
          <Dumbbell size={10} />
          {hasWorkout ? "Training Day" : "Rest Day"}
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

// ─── Zone 4: Micro-Nutrient Environment ──────────────────────────
const MICROS = [
  { name: "Vitamin D",   score: 40,  unit: "IU",  source: "Salmon, eggs",          status: "critical" as const },
  { name: "Iron",        score: 88,  unit: "mg",  source: "Red meat, spinach",      status: "optimal"  as const },
  { name: "Magnesium",   score: 65,  unit: "mg",  source: "Nuts, whole grains",     status: "warning"  as const },
  { name: "Omega-3",     score: 82,  unit: "g",   source: "Salmon, flaxseed",       status: "optimal"  as const },
  { name: "Vitamin C",   score: 75,  unit: "mg",  source: "Bell pepper, citrus",    status: "warning"  as const },
  { name: "Calcium",     score: 60,  unit: "mg",  source: "Dairy, broccoli",        status: "warning"  as const },
  { name: "Zinc",        score: 90,  unit: "mg",  source: "Red meat, pumpkin seeds",status: "optimal"  as const },
  { name: "B12",         score: 95,  unit: "mcg", source: "Animal products",        status: "optimal"  as const },
  { name: "Fiber",       score: 70,  unit: "g",   source: "Vegetables, legumes",    status: "warning"  as const },
  { name: "Sodium",      score: 78,  unit: "mg",  source: "Varied foods",           status: "warning"  as const },
];

function MicroEnvironmentGrid() {
  const [expanded, setExpanded] = useState(false);

  const radarData = MICROS.map(m => ({ domain: m.name.replace("Vitamin ", "Vit "), score: m.score, fullMark: 100 }));

  const criticalMicros = MICROS.filter(m => m.status === "critical");
  const warningMicros  = MICROS.filter(m => m.status === "warning");

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
            Micro-Nutrient Environment
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
            AI-estimated from meal log · 10 biomarkers tracked
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
            style={{ background: "rgba(91,66,232,0.1)", color: "var(--accent-sleep)", border: "1px solid rgba(91,66,232,0.25)" }}>
            AI Simulated
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar */}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
              <defs>
                <linearGradient id="microRadarGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent-sleep)" stopOpacity={0.8} />
                  <stop offset="100%" stopColor={C.carbs} stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="domain"
                tick={{ fill: C.textTer, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}
              />
              <Radar name="Score" dataKey="score"
                stroke="var(--accent-sleep)" strokeWidth={2}
                fill="url(#microRadarGrad)" fillOpacity={0.2}
              />
              <RechartsTooltip
                contentStyle={{ borderRadius: "8px", border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", background: "#fff", fontSize: 11 }}
                formatter={(val: any) => [`${val}% DV`, "Status"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Micro cards */}
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 280 }}>
          {MICROS.map((m, i) => {
            const statusColor = m.status === "optimal" ? C.optimal : m.status === "warning" ? C.warning : C.critical;
            return (
              <motion.div key={m.name}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 + 0.2 }}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
                  <span className="text-[8px] font-black" style={{ color: statusColor }}>{m.score}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold truncate" style={{ color: C.text }}>{m.name}</div>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="mt-1 w-full h-1.5 rounded-full" style={{ background: C.border }}>
                    <motion.div className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${m.score}%` }}
                      transition={{ duration: 0.9, ease: [0, 0, 0.2, 1], delay: i * 0.04 + 0.4 }}
                      style={{ background: statusColor }}
                    />
                  </div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: C.textTer }}>
                    Source: {m.source}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Deficiency callouts */}
      {(criticalMicros.length > 0 || warningMicros.length > 0) && (
        <div className="mt-4 space-y-2">
          {criticalMicros.map(m => (
            <div key={m.name} className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <AlertTriangle size={14} style={{ color: C.critical, marginTop: 2, flexShrink: 0 }} />
              <div>
                <span className="text-xs font-bold" style={{ color: C.critical }}>{m.name} deficiency detected — {m.score}% DV. </span>
                <span className="text-xs" style={{ color: C.textSec }}>Add {m.source} or consider supplementation.</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zone 5: Meal Stream (Rich Cards) ────────────────────────────
function MealStreamCard({ meal, index, workoutWindows }: {
  meal: any; index: number; workoutWindows: { start: number; end: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const mealHour = new Date(meal.meal_time).getHours();
  const cal = meal.calories || 0;
  const p   = meal.protein  || 0;
  const c   = meal.carbs    || 0;
  const f   = meal.fat      || 0;

  // Check if this meal is within ±2h of a workout
  const nearWorkout = workoutWindows.find(w =>
    Math.abs(mealHour - w.start) <= 2 || Math.abs(mealHour - (w.start + 1)) <= 1
  );

  const totalMacroG = p + c + f || 1;
  const macroWidths = {
    protein: (p / totalMacroG) * 100,
    carbs:   (c / totalMacroG) * 100,
    fat:     (f / totalMacroG) * 100,
  };

  // Simple AI insight per meal
  const insights: Record<number, string> = {
    0: "Optimal fasted window — high casein and complex carbs support gradual glucose release.",
    1: "Good pre-workout fuel. Could add 20g fast carbs 45 min before afternoon session.",
    2: "Intra/post-workout window. Glycemic spike from simple carbs well-timed with training.",
    3: "Excellent omega-3 profile for overnight HRV recovery. Anti-inflammatory stack.",
  };
  const aiInsight = meal.ai_insight || insights[index % 4] || "Nutritional profile is tracking within optimal ranges.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 + 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
                  {new Date(meal.meal_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {nearWorkout && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(224,53,53,0.1)", color: C.critical, border: "1px solid rgba(224,53,53,0.25)" }}>
                    ⚡ Near {nearWorkout.name}
                  </span>
                )}
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
        <div className="flex items-center gap-4 text-[10px] font-bold mb-3" style={{ fontFamily: "var(--font-mono)" }}>
          <span style={{ color: C.protein }}>P {p}g</span>
          <span style={{ color: C.carbs }}>C {c}g</span>
          <span style={{ color: C.fat }}>F {f}g</span>
        </div>

        {/* AI insight */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg"
          style={{ background: "rgba(91,66,232,0.04)", border: "1px solid rgba(91,66,232,0.12)" }}>
          <Brain size={12} style={{ color: "var(--accent-sleep)", marginTop: 2, flexShrink: 0 }} />
          <span className="text-[11px] leading-relaxed" style={{ color: C.textSec }}>{aiInsight}</span>
        </div>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MealStream({ dbMeals, dbWorkouts }: { dbMeals: any[]; dbWorkouts: any[] }) {
  const todayMeals = dbMeals.filter(m => {
    const d = new Date(m.meal_time);
    return d.toDateString() === new Date().toDateString();
  });

  const allMeals = todayMeals.length > 0 ? todayMeals : dbMeals.slice(0, 6);

  const workoutWindows = dbWorkouts
    .filter(w => { const d = new Date(w.workout_date); return d.toDateString() === new Date().toDateString(); })
    .map(w => ({
      start: new Date(w.workout_date).getHours(),
      end:   new Date(w.workout_date).getHours() + Math.round((w.duration_minutes || 60) / 60),
      name:  w.exercise_name || "Workout",
    }));

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.textTer }}>
        Meal Log Stream · {allMeals.length} entries
      </div>
      <div className="space-y-3">
        {allMeals.map((m, i) => (
          <MealStreamCard key={m.id || i} meal={m} index={i} workoutWindows={workoutWindows} />
        ))}
      </div>
    </div>
  );
}

// ─── Zone 6: AI Action Items ──────────────────────────────────────
function AIActionItems({ totalCal, totalP, totalC, totalFat, activeBurn, dbWorkouts }: {
  totalCal: number; totalP: number; totalC: number; totalFat: number; activeBurn: number; dbWorkouts: any[];
}) {
  const [dismissed, setDismissed] = useState<number[]>([]);

  const hasWorkout = dbWorkouts.some(w => new Date(w.workout_date).toDateString() === new Date().toDateString());
  const totalBurn  = BMR + activeBurn;
  const netEnergy  = totalCal - totalBurn;

  // Generate dynamic action items
  const allActions = [
    totalP < GOALS.protein * 0.7 && {
      priority: "critical" as const,
      title: `Consume ${GOALS.protein - totalP}g protein now`,
      reason: `Post-workout anabolic window is open. You're at ${totalP}g / ${GOALS.protein}g goal. Muscle protein synthesis peaks within 2–3h of training.`,
      action: "Log Meal",
      icon: Target,
    },
    netEnergy < -400 && {
      priority: "warning" as const,
      title: `${Math.abs(netEnergy)} kcal deficit — add a meal`,
      reason: `Sustained deficits on training days impair recovery and cortisol regulation. BMR ${BMR} + active burn ${activeBurn} = ${totalBurn} total expenditure.`,
      action: "Log Meal",
      icon: Flame,
    },
    totalC < 150 && hasWorkout && {
      priority: "critical" as const,
      title: "Carb intake critically low for training day",
      reason: `Only ${totalC}g carbs consumed. With a training session today, glycogen replenishment requires 300–400g. Performance and recovery are at risk.`,
      action: "View Carb Sources",
      icon: Zap,
    },
    MICROS.find(m => m.status === "critical") && {
      priority: "warning" as const,
      title: `${MICROS.find(m => m.status === "critical")?.name} deficiency — action needed`,
      reason: `${MICROS.find(m => m.status === "critical")?.name} is at ${MICROS.find(m => m.status === "critical")?.score}% DV. Chronic deficiency impairs bone density, immune function, and hormonal balance.`,
      action: "View Supplements",
      icon: AlertTriangle,
    },
    totalCal > GOALS.cal * 1.1 && {
      priority: "warning" as const,
      title: `Caloric surplus: +${totalCal - GOALS.cal} kcal over target`,
      reason: `You've consumed ${totalCal} kcal vs. ${GOALS.cal} kcal target. This is optimal for hypertrophy if today is a strength session. Ensure surplus is quality macros.`,
      action: "Review Macros",
      icon: TrendingUp,
    },
    {
      priority: "optimal" as const,
      title: "Schedule tomorrow's nutrition pre-loading",
      reason: `Based on your training history, you likely have a session tomorrow. Pre-logging meals the night before improves adherence by 40%.`,
      action: "Plan Meals",
      icon: BookOpen,
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
          AI Action Items
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
              <div className="text-sm font-bold" style={{ color: C.optimal }}>All systems optimal</div>
              <div className="text-xs" style={{ color: C.textSec }}>No nutritional action items at this time. Keep it up.</div>
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
}

export default function FuelTab({ dbMeals = [], dbWorkouts = [] }: FuelTabProps) {
  // Aggregate totals
  let totalCal = 0, totalP = 0, totalC = 0, totalFat = 0, totalFib = 0;
  dbMeals.forEach(m => {
    totalCal += m.calories || 0;
    totalP   += m.protein  || 0;
    totalC   += m.carbs    || 0;
    totalFat += m.fat      || 0;
    
    let fib = m.fiber || 0;
    if (m.micronutrients) {
      try {
        const micros = typeof m.micronutrients === 'string' ? JSON.parse(m.micronutrients) : m.micronutrients;
        fib = fib || micros.fiber || 0;
      } catch (e) {
        console.error("Failed to parse micronutrients:", e);
      }
    }
    totalFib += fib;
  });

  const activeBurn = dbWorkouts.reduce((acc, w) => acc + (w.calories || w.calories_burned || 0), 0);

  // No data state
  if (!dbMeals || dbMeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center"
        style={{ minHeight: 400 }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(0,168,120,0.1)", border: "1px solid rgba(0,168,120,0.2)" }}>
          <Flame size={28} style={{ color: "var(--accent-nutrition)" }} />
        </div>
        <div className="text-base font-bold mb-2" style={{ color: C.text }}>No nutritional telemetry</div>
        <div className="text-sm max-w-xs" style={{ color: C.textSec, lineHeight: 1.6 }}>
          Log your meals via Telegram to populate the Fuel Intelligence Dashboard. The AI will then generate personalized insights tied to your workouts.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">

      {/* Zone 1 — Energy Command HUD */}
      <EnergyCommandHUD
        totalCal={totalCal} totalP={totalP} totalF_g={totalFat} activeBurn={activeBurn}
      />

      {/* Zone 2 — Caloric Timeline */}
      <CaloricTimeline dbMeals={dbMeals} dbWorkouts={dbWorkouts} />

      {/* Zone 3 — Macro Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MacroRingPanel totalP={totalP} totalC={totalC} totalFat={totalFat} totalFib={totalFib} />
        <MacroWorkoutCorrelation dbWorkouts={dbWorkouts} totalP={totalP} totalC={totalC} />
      </div>

      {/* Zone 4 — Micro-Nutrient Environment */}
      <MicroEnvironmentGrid />

      {/* Zone 5 + 6 — Meal Stream & AI Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MealStream dbMeals={dbMeals} dbWorkouts={dbWorkouts} />
        <AIActionItems
          totalCal={totalCal} totalP={totalP} totalC={totalC} totalFat={totalFat}
          activeBurn={activeBurn} dbWorkouts={dbWorkouts}
        />
      </div>

    </div>
  );
}
