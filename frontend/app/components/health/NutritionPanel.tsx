"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ComposedChart, Line
} from "recharts";
import { C, rangeLabel, fmtDay, dayKeyOf, EmptyState, NeedMoreNote } from "./shared";

const TREND_METRICS = [
  { key: "hrv", label: "HRV", unit: "ms" },
  { key: "resting_heart_rate", label: "Resting HR", unit: "bpm" },
  { key: "sleeping_heart_rate", label: "Sleeping HR", unit: "bpm" },
  { key: "average_heart_rate", label: "Avg HR", unit: "bpm" },
  { key: "min_heart_rate", label: "Min HR", unit: "bpm" },
  { key: "max_heart_rate", label: "Max HR", unit: "bpm" },
  { key: "sleep_duration_minutes", label: "Sleep", unit: "min" },
  { key: "sleep_deep_minutes", label: "Deep Sleep", unit: "min" },
  { key: "sleep_rem_minutes", label: "REM", unit: "min" },
  { key: "steps", label: "Steps", unit: "" },
  { key: "active_calories", label: "Active kcal", unit: "kcal" },
  { key: "body_weight_kg", label: "Weight", unit: "kg" },
  { key: "vo2_max", label: "VO₂ Max", unit: "" },
];

interface NutritionPanelProps {
  metricsHistory: any[];
  dbMeals?: any[];
  timeFilter: string;
}

export default function NutritionPanel({ metricsHistory, dbMeals, timeFilter }: NutritionPanelProps) {
  const rows = metricsHistory || [];
  const [primary, setPrimary] = useState("resting_heart_rate");
  const [compare, setCompare] = useState<string | null>(null);
  const [weekdayMetric, setWeekdayMetric] = useState("sleep_duration_minutes");

  const pointsFor = (key: string) => rows.filter(r => r[key] != null);
  const available = TREND_METRICS.filter(m => pointsFor(m.key).length >= 3);

  if (available.length === 0 && (dbMeals || []).length === 0) {
    return <EmptyState icon={Activity} message={`Not enough history to explore trends in the ${rangeLabel(timeFilter)} — at least 3 recorded days are needed. Data arrives via Chat screenshots.`} />;
  }

  const activePrimary = available.find(m => m.key === primary) ? primary : available[0]?.key;
  const activeCompare = compare && available.find(m => m.key === compare) && compare !== activePrimary ? compare : null;
  const primaryMeta = TREND_METRICS.find(m => m.key === activePrimary) || TREND_METRICS[0];
  const compareMeta = activeCompare ? TREND_METRICS.find(m => m.key === activeCompare)! : null;

  const explorerData = rows.map(r => ({
    date: fmtDay(r.recorded_at),
    v1: activePrimary ? r[activePrimary] ?? null : null,
    v2: activeCompare ? r[activeCompare] ?? null : null,
  }));

  const vals = activePrimary ? pointsFor(activePrimary).map(r => r[activePrimary] as number) : [];
  const stats = vals.length ? {
    min: Math.min(...vals),
    max: Math.max(...vals),
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
    delta: Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10,
    n: vals.length,
  } : null;

  const WEEKDAY_METRICS = [
    { key: "sleep_duration_minutes", label: "Sleep", unit: "min" },
    { key: "steps", label: "Steps", unit: "" },
    { key: "active_calories", label: "Active kcal", unit: "kcal" },
  ].filter(m => pointsFor(m.key).length >= 3);
  const activeWeekday = WEEKDAY_METRICS.find(m => m.key === weekdayMetric) ? weekdayMetric : WEEKDAY_METRICS[0]?.key;
  const weekdayMeta = TREND_METRICS.find(m => m.key === activeWeekday);
  const weekdayData = (() => {
    if (!activeWeekday) return [];
    const sums: Record<number, { sum: number; n: number }> = {};
    pointsFor(activeWeekday).forEach(r => {
      const wd = (new Date(r.recorded_at).getDay() + 6) % 7;
      if (!sums[wd]) sums[wd] = { sum: 0, n: 0 };
      sums[wd].sum += r[activeWeekday];
      sums[wd].n += 1;
    });
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
      day: label,
      avg: sums[i] ? Math.round(sums[i].sum / sums[i].n) : null,
      n: sums[i]?.n || 0,
    }));
  })();

  const mealDays: Record<string, { cal: number; p: number }> = {};
  (dbMeals || []).forEach(m => {
    const dk = dayKeyOf(m.meal_time);
    if (!mealDays[dk]) mealDays[dk] = { cal: 0, p: 0 };
    mealDays[dk].cal += m.calories || 0;
    mealDays[dk].p += m.protein || 0;
  });
  const nutritionData = Object.keys(mealDays).sort().map(dk => ({
    date: fmtDay(dk + "T00:00:00"),
    cal: mealDays[dk].cal,
    protein: mealDays[dk].p,
  }));

  const chip = (label: string, active: boolean, onClick: () => void, color: string) => (
    <button key={label} onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
      style={{
        background: active ? `${color}15` : "var(--surface-tertiary)",
        color: active ? color : "var(--text-tertiary)",
        border: `1px solid ${active ? color + "40" : "var(--border-subtle)"}`,
      }}>
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Metric Explorer · {rangeLabel(timeFilter)}
          </div>
          {stats && (
            <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>n = {stats.n} days</div>
          )}
        </div>

        {available.length === 0 ? (
          <NeedMoreNote message={`Need at least 3 recorded days of any metric in the ${rangeLabel(timeFilter)}.`} />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {available.map(m => chip(m.label, m.key === activePrimary, () => setPrimary(m.key), C.trends))}
            </div>

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Min", val: stats.min },
                  { label: "Avg", val: stats.avg },
                  { label: "Max", val: stats.max },
                  { label: "Δ first→last", val: `${stats.delta > 0 ? "+" : ""}${stats.delta}` },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
                    <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: C.trends, lineHeight: 1 }}>
                      {s.val}<span className="text-[10px] font-bold ml-0.5" style={{ color: "var(--text-tertiary)" }}>{primaryMeta.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto -mx-2 px-2">
              <div className="min-w-[600px] h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={explorerData} margin={{ top: 8, right: activeCompare ? 0 : 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="explorerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.trends} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.trends} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" domain={["dataMin", "dataMax"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                    {activeCompare && (
                      <YAxis yAxisId="right" orientation="right" domain={["dataMin", "dataMax"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                    )}
                    <Tooltip contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
                    <Area yAxisId="left" type="monotone" dataKey="v1" name={`${primaryMeta.label}${primaryMeta.unit ? ` (${primaryMeta.unit})` : ""}`}
                      stroke={C.trends} strokeWidth={2.5} fill="url(#explorerGrad)" dot={{ r: 3, fill: C.trends }} connectNulls />
                    {activeCompare && compareMeta && (
                      <Line yAxisId="right" type="monotone" dataKey="v2" name={`${compareMeta.label}${compareMeta.unit ? ` (${compareMeta.unit})` : ""}`}
                        stroke={C.cv} strokeWidth={2} dot={{ r: 3, fill: C.cv }} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-1.5 mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: "var(--text-tertiary)" }}>Compare:</span>
              {chip("None", !activeCompare, () => setCompare(null), C.cv)}
              {available.filter(m => m.key !== activePrimary).map(m => chip(m.label, m.key === activeCompare, () => setCompare(m.key === compare ? null : m.key), C.cv))}
            </div>
          </>
        )}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Weekday Patterns · {rangeLabel(timeFilter)}
          </div>
        </div>
        {WEEKDAY_METRICS.length === 0 ? (
          <NeedMoreNote message={`Need at least 3 recorded days of sleep, steps or active calories in the ${rangeLabel(timeFilter)}.`} />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {WEEKDAY_METRICS.map(m => chip(m.label, m.key === activeWeekday, () => setWeekdayMetric(m.key), C.kinematic))}
            </div>
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: number) => [`${v}${weekdayMeta?.unit ? ` ${weekdayMeta.unit}` : ""} avg`, weekdayMeta?.label || ""]}
                    contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Bar dataKey="avg" fill={C.kinematic} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] italic mt-2" style={{ color: "var(--text-tertiary)" }}>
              Averages over few days so far — one entry per weekday at most until more history accumulates.
            </div>
          </>
        )}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Nutrition Trends · {rangeLabel(timeFilter)}
        </div>
        {nutritionData.length >= 3 ? (
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[600px] h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={nutritionData} margin={{ top: 8, right: 0, left: -10, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="cal" name="Calories (kcal)" stroke={C.nutrition} strokeWidth={2.5} dot={{ r: 3, fill: C.nutrition }} />
                  <Line yAxisId="right" type="monotone" dataKey="protein" name="Protein (g)" stroke={C.cv} strokeWidth={2} dot={{ r: 3, fill: C.cv }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 3 days of logged meals in the ${rangeLabel(timeFilter)} — ${nutritionData.length} available.`} />
        )}
      </div>
    </div>
  );
}
