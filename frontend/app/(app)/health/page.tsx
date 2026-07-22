"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { TemplatesTab } from "./TemplatesTab";
import FuelTab from "../../components/health/FuelTab";
import { supabase } from "../../../utils/supabaseClient";
import { THEME } from "../../../utils/theme";
import { motion, AnimatePresence } from "framer-motion";
import Model from "react-body-highlighter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line, Scatter
} from "recharts";
import {
  Heart, Moon, Dumbbell, Activity, Brain, AlertTriangle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown, Minus,
  Send, FileText, Search, Target, Flame
} from "lucide-react";

// ─── Colour palette helpers — Light Mode ─────────────────────────
const C = {
  ...THEME,
  cv: "#E03535",
  sleep: "#5B42E8",
  nutrition: "#00A878",
  kinematic: "#E07020",
  trends: "#0EA5E9",
  inactive: "#9CA3AF",
};

// ─── Time-range helpers ──────────────────────────────────────────
// Every query and chart on this page respects the selected range.
// Day = today (local), Week = 7d, Month = 30d, Quarter = 90d, Year = 365d.
const RANGE_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };

function getCutoff(timeFilter: string): Date {
  const d = new Date();
  if (timeFilter === "day") {
    d.setHours(0, 0, 0, 0); // start of today (local)
  } else {
    d.setDate(d.getDate() - (RANGE_DAYS[timeFilter] ?? 30));
  }
  return d;
}

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

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// Local-calendar day key (YYYY-MM-DD) for the day drill-down lens
function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayKeyOf(iso: string): string { return toDayKey(new Date(iso)); }
function fmtDayLong(dk: string): string {
  return new Date(dk + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const CHAT_HINT = "Data arrives by sending screenshots in Chat (/chat).";

// ─── Subcomponents ───────────────────────────────────────────────

function StatusDot({ status }: { status: "optimal" | "warning" | "critical" | "inactive" }) {
  const colors = {
    optimal: C.optimal, warning: C.warning, critical: C.critical, inactive: C.inactive,
  };
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status !== "inactive" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
          style={{ background: colors[status] }} />
      )}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: colors[status] }} />
    </span>
  );
}

// ─── Empty State Component ───────────────────────────────────────
function EmptyState({ message, icon: Icon = Activity }: { message: string, icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 card-surface mt-4 mb-4" style={{ borderRadius: "var(--radius-xl)", minHeight: "200px" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
        <Icon size={20} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Awaiting Telemetry</div>
      <div className="text-sm text-center max-w-xs" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        {message}
      </div>
    </div>
  );
}

// ─── Subtle "need more history" note for charts lacking data ──────
function NeedMoreNote({ message }: { message: string }) {
  return (
    <div className="text-[11px] italic px-3 py-2.5 rounded-lg text-center"
      style={{ color: "var(--text-tertiary)", background: "var(--surface-tertiary)", border: "1px dashed var(--border-subtle)" }}>
      {message}
    </div>
  );
}

// ─── Day drill-down lens (Range ↔ Day) ───────────────────────────
function DayLens({ mode, onModeChange, day, onDayChange }: {
  mode: "range" | "day"; onModeChange: (m: "range" | "day") => void;
  day: string; onDayChange: (d: string) => void;
}) {
  const shift = (n: number) => {
    const d = new Date(day + "T00:00:00");
    d.setDate(d.getDate() + n);
    onDayChange(toDayKey(d));
  };
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
        {(["range", "day"] as const).map(m => (
          <button key={m} onClick={() => onModeChange(m)}
            className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{
              background: mode === m ? "var(--surface-quaternary)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
              border: mode === m ? "1px solid var(--border-active)" : "1px solid transparent",
            }}>
            {m === "range" ? "Range" : "Day"}
          </button>
        ))}
      </div>
      {mode === "day" && (
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <ChevronLeft size={13} />
          </button>
          <input type="date" value={day} onChange={e => e.target.value && onDayChange(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-mono outline-none"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Cardiovascular Hub ─────────────────────────────────────
// Source: health_metrics (recorded_at, hrv, resting_heart_rate, vo2_max,
// average_heart_rate, min/max_heart_rate, heart_rate_zones). Currently empty —
// rows appear as the user sends health screenshots in Chat.
function CardioTab({ metricsHistory, timeFilter }: { metricsHistory: any[]; timeFilter: string }) {
  const rows = metricsHistory || [];
  if (rows.length === 0) {
    return <EmptyState icon={Heart} message={`No cardiovascular metrics in the ${rangeLabel(timeFilter)}. ${CHAT_HINT} HRV, resting HR and VO₂ max are extracted automatically.`} />;
  }

  const latest = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;

  const kpis = [
    { label: "HRV", key: "hrv", unit: "ms", color: C.nutrition },
    { label: "Resting HR", key: "resting_heart_rate", unit: "bpm", color: C.trends },
    { label: "Sleeping HR", key: "sleeping_heart_rate", unit: "bpm", color: C.sleep },
    { label: "VO₂ Max", key: "vo2_max", unit: "", color: C.cv },
    { label: "Avg HR", key: "average_heart_rate", unit: "bpm", color: C.kinematic },
  ].filter(k => latest[k.key] != null).map(k => ({
    ...k,
    val: latest[k.key],
    delta: prev && prev[k.key] != null ? Math.round((latest[k.key] - prev[k.key]) * 10) / 10 : null,
  }));

  const chartData = rows.map(r => ({
    date: fmtDay(r.recorded_at),
    hrv: r.hrv ?? null,
    rhr: r.resting_heart_rate ?? null,
  }));
  const hasHrv = chartData.some(d => d.hrv != null);
  const hasRhr = chartData.some(d => d.rhr != null);

  // Daily HR range: min→max floating band with avg marker + resting/sleeping lines
  const hrRangeData = rows
    .filter(r => r.min_heart_rate != null && r.max_heart_rate != null)
    .map(r => ({
      date: fmtDay(r.recorded_at),
      base: r.min_heart_rate,
      span: Math.max(1, r.max_heart_rate - r.min_heart_rate),
      min: r.min_heart_rate,
      max: r.max_heart_rate,
      avg: r.average_heart_rate ?? null,
      rhr: r.resting_heart_rate ?? null,
      sleepHr: r.sleeping_heart_rate ?? null,
    }));

  const HRRangeTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="card-surface px-3 py-2 text-xs shadow-lg" style={{ borderRadius: "var(--radius-md)", minWidth: 150 }}>
        <div className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="font-mono" style={{ color: C.cv }}>Range: {d.min}–{d.max} bpm</div>
        {d.avg != null && <div className="font-mono" style={{ color: "var(--text-secondary)" }}>Avg: {d.avg} bpm</div>}
        {d.rhr != null && <div className="font-mono" style={{ color: C.trends }}>Resting: {d.rhr} bpm</div>}
        {d.sleepHr != null && <div className="font-mono" style={{ color: C.sleep }}>Sleeping: {d.sleepHr} bpm</div>}
      </div>
    );
  };

  // Per-day HR zone minutes from the jsonb column (only days with real totals)
  const ZONE_COLORS: Record<string, string> = {
    zone1: C.optimal, zone2: C.trends, zone3: C.warning, zone4: C.cv, zone5: "#9C27B0",
  };
  const zoneDays = rows.map(r => {
    const z = r.heart_rate_zones;
    if (!z || typeof z !== "object" || Array.isArray(z)) return null;
    const zones = ["zone1", "zone2", "zone3", "zone4", "zone5"]
      .map(k => ({ key: k, min: typeof (z as any)[k] === "number" ? (z as any)[k] : 0 }));
    const total = zones.reduce((a, zz) => a + zz.min, 0);
    return total > 0 ? { date: fmtDay(r.recorded_at), zones, total } : null;
  }).filter(Boolean) as Array<{ date: string; zones: { key: string; min: number }[]; total: number }>;

  return (
    <div className="space-y-5">
      {/* Readiness KPIs — latest day in range, delta vs previous day */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Cardiovascular Metrics · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {rows.length} day{rows.length !== 1 ? "s" : ""} recorded
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map(m => (
            <div key={m.label} className="p-4 rounded-xl flex flex-col justify-between" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</span>
                  <span className="text-xs pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.unit}</span>
                </div>
                {m.delta !== null && m.delta !== 0 && (
                  <span className="text-[10px] font-bold inline-flex items-center gap-0.5" style={{ color: m.delta > 0 ? C.optimal : C.critical, fontFamily: "var(--font-mono)" }}>
                    {m.delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                )}
                {m.delta === 0 && (
                  <span className="text-[10px] font-bold inline-flex items-center gap-0.5" style={{ color: "var(--text-tertiary)" }}>
                    <Minus size={10} /> 0
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* HRV / RHR trend over the selected range */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          HRV &amp; Resting HR Trend · {rangeLabel(timeFilter)}
        </div>
        {(hasHrv || hasRhr) && chartData.filter(d => d.hrv != null || d.rhr != null).length >= 2 ? (
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.nutrition} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.nutrition} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rhrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.trends} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.trends} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
                {hasHrv && <Area type="monotone" dataKey="hrv" name="HRV (ms)" stroke={C.nutrition} strokeWidth={2.5} fill="url(#hrvGrad)" dot={{ r: 3, fill: C.nutrition }} connectNulls />}
                {hasRhr && <Area type="monotone" dataKey="rhr" name="Resting HR (bpm)" stroke={C.trends} strokeWidth={2.5} fill="url(#rhrGrad)" dot={{ r: 3, fill: C.trends }} connectNulls />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 days with HRV or resting HR in the ${rangeLabel(timeFilter)}.`} />
        )}
      </div>

      {/* Daily HR range — min→max band, avg marker, resting & sleeping HR lines */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Daily Heart Rate Range · {rangeLabel(timeFilter)}
        </div>
        {hrRangeData.length >= 2 ? (
          <>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hrRangeData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<HRRangeTooltip />} />
                  <Bar dataKey="base" stackId="hr" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="span" stackId="hr" name="Min–Max" fill={C.cv} fillOpacity={0.22} radius={[4, 4, 4, 4]} />
                  <Scatter dataKey="avg" name="Avg" fill={C.cv} />
                  <Line type="monotone" dataKey="rhr" name="Resting" stroke={C.trends} strokeWidth={2} dot={{ r: 3, fill: C.trends }} connectNulls />
                  <Line type="monotone" dataKey="sleepHr" name="Sleeping" stroke={C.sleep} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: C.sleep }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: C.cv, opacity: 0.3 }} /> Min–Max</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{ background: C.cv }} /> Avg</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ background: C.trends }} /> Resting</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ background: C.sleep }} /> Sleeping</span>
            </div>
          </>
        ) : (
          <NeedMoreNote message={`Need at least 2 days with min/max HR in the ${rangeLabel(timeFilter)} — ${hrRangeData.length} available.`} />
        )}
      </div>

      {/* HR zones per day — stacked zone1..5 minutes from the jsonb column */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          HR Zones per Day · {rangeLabel(timeFilter)}
        </div>
        {zoneDays.length > 0 ? (
          <div className="space-y-3">
            {zoneDays.map(d => (
              <div key={d.date} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-[10px] font-bold font-mono" style={{ color: "var(--text-tertiary)" }}>{d.date}</div>
                <div className="flex-1 flex h-3 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                  {d.zones.filter(z => z.min > 0).map(z => (
                    <motion.div key={z.key}
                      initial={{ width: 0 }}
                      animate={{ width: `${(z.min / d.total) * 100}%` }}
                      transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
                      style={{ background: ZONE_COLORS[z.key] }}
                      title={`${z.key}: ${Math.round(z.min)} min`}
                    />
                  ))}
                </div>
                <div className="w-16 shrink-0 text-right text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{Math.round(d.total)} min</div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
              {["zone1", "zone2", "zone3", "zone4", "zone5"].map(k => (
                <span key={k} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: ZONE_COLORS[k] }} /> {k.replace("zone", "Z")}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <NeedMoreNote message="No HR zone minutes recorded in this range yet — zones appear when intraday HR data is extracted from screenshots." />
        )}
      </div>
    </div>
  );
}

// ─── Sleep schedule hero chart (hand-rolled Gantt) ───────────────
// Horizontal bed→wake floating bars on an 18:00→18:00 clock axis,
// each bar segmented by deep/REM/light proportions from real columns.
function SleepScheduleChart({ rows, label, onJumpToDay }: {
  rows: any[]; label: string; onJumpToDay?: (dk: string) => void;
}) {
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);

  const STAGE_SEGMENTS = [
    { key: "deep", label: "Deep", color: "#5B42E8" },
    { key: "rem", label: "REM", color: "#9B85F2" },
    { key: "light", label: "Light", color: "#D3CBF9" },
  ] as const;

  const parseHM = (s?: string | null): number | null => {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60;
  };
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  const clock = (h: number) => `${String(Math.round(h) % 24).padStart(2, "0")}:00`;
  const clockHM = (h: number) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  // Nights with real bed/wake times anchor the averages
  const timed = rows.map(r => {
    const bed = parseHM(r.sleep_bed_time);
    const wake = parseHM(r.sleep_wake_time);
    if (bed == null || wake == null) return null;
    return { start: bed >= 12 ? bed : bed + 24, end: wake >= 12 ? wake : wake + 24 };
  }).filter(Boolean) as Array<{ start: number; end: number }>;

  const avgBed = timed.length ? timed.reduce((a, t) => a + t.start, 0) / timed.length : 24;
  const avgWake = timed.length ? timed.reduce((a, t) => a + t.end, 0) / timed.length : null;
  const bedStdMin = timed.length > 1
    ? Math.round(Math.sqrt(timed.reduce((a, t) => a + Math.pow(t.start - avgBed, 2), 0) / timed.length) * 60)
    : null;

  const entries = rows.map(r => {
    const bed = parseHM(r.sleep_bed_time);
    const wake = parseHM(r.sleep_wake_time);
    const hasTimes = bed != null && wake != null;
    const start = hasTimes ? (bed! >= 12 ? bed! : bed! + 24) : avgBed;
    const deep = r.sleep_deep_minutes ?? 0;
    const rem = r.sleep_rem_minutes ?? 0;
    const light = Math.max(0, r.sleep_duration_minutes - deep - rem);
    const d = new Date(r.recorded_at);
    return {
      dk: dayKeyOf(r.recorded_at),
      label: d.toLocaleDateString([], { weekday: "short" }),
      dateNum: d.getDate(),
      start,
      durH: r.sleep_duration_minutes / 60,
      estimated: !hasTimes,
      bed: r.sleep_bed_time, wake: r.sleep_wake_time,
      deep, rem, light, total: r.sleep_duration_minutes,
      sleepHr: r.sleeping_heart_rate ?? null,
      quality: r.sleep_duration_minutes >= 420 ? C.optimal : r.sleep_duration_minutes >= 360 ? C.warning : C.critical,
    };
  });

  const avgDurMin = rows.length ? Math.round(rows.reduce((a, r) => a + r.sleep_duration_minutes, 0) / rows.length) : 0;
  const ROW_H = 32;
  const X = (h: number) => `${((h - 18) / 18) * 100}%`;
  const ticks = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
  const hoverEntry = hover != null ? entries[hover.i] : null;

  const stats = [
    { label: "Avg Duration", val: fmt(avgDurMin), color: C.sleep },
    { label: "Avg Bed", val: timed.length ? clockHM(avgBed) : "—", color: C.sleep },
    { label: "Avg Wake", val: avgWake != null ? clockHM(avgWake) : "—", color: C.warning },
    {
      label: "Consistency",
      val: bedStdMin != null ? `±${bedStdMin} min` : "—",
      color: bedStdMin == null ? C.textTertiary : bedStdMin <= 30 ? C.optimal : bedStdMin <= 60 ? C.warning : C.critical,
    },
  ];

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Bed &amp; Wake Schedule · {label}
        </div>
        <div className="text-[10px] italic" style={{ color: "var(--text-tertiary)" }}>click a night for its day view</div>
      </div>

      {/* Stats header — computed from nights that have real bed/wake times */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {stats.map(s => (
          <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: s.color, lineHeight: 1 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Clock tick header — every other tick hidden on small screens */}
      <div className="flex">
        <div className="w-10 sm:w-12 shrink-0" />
        <div className="relative flex-1 h-4 mb-1">
          {ticks.map((t, i) => (
            <span key={t} className={`absolute text-[9px] font-mono ${i % 2 === 1 ? "hidden sm:block" : ""}`}
              style={{ left: X(t), transform: "translateX(-50%)", color: "var(--text-tertiary)" }}>
              {clock(t)}
            </span>
          ))}
        </div>
        <div className="w-16 sm:w-20 shrink-0" />
      </div>

      <div className="flex">
        {/* Row labels: weekday + date */}
        <div className="w-10 sm:w-12 shrink-0 flex flex-col">
          {entries.map(e => (
            <div key={e.dk} style={{ height: ROW_H }} className="flex items-center text-[10px] font-mono font-bold" >
              <span style={{ color: "var(--text-tertiary)" }}>{e.label} <span style={{ color: "var(--text-secondary)" }}>{e.dateNum}</span></span>
            </div>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative flex-1" style={{ height: entries.length * ROW_H }}>
          {/* Target band 23:00 → 07:00 */}
          <div className="absolute top-0 bottom-0 rounded"
            style={{ left: X(23), width: `${((31 - 23) / 18) * 100}%`, background: "rgba(91,66,232,0.06)" }} />
          {/* Gridlines */}
          {ticks.map(t => (
            <div key={t} className="absolute top-0 bottom-0 w-px" style={{ left: X(t), background: "var(--border-subtle)" }} />
          ))}

          {/* Night bars — stage-segmented */}
          {entries.map((e, i) => (
            <div key={e.dk}
              className="absolute flex overflow-hidden cursor-pointer transition-transform hover:scale-y-110"
              style={{
                top: i * ROW_H + 5, height: ROW_H - 10,
                left: X(e.start), width: `${(e.durH / 18) * 100}%`,
                borderRadius: 6,
                border: e.estimated ? `1.5px dashed ${C.sleep}` : "none",
                opacity: e.estimated ? 0.55 : 1,
              }}
              onClick={() => onJumpToDay?.(e.dk)}
              onMouseEnter={() => setHover({ i, x: ((e.start - 18) / 18) * 100 })}
              onMouseLeave={() => setHover(null)}
            >
              <div style={{ width: `${(e.deep / e.total) * 100}%`, background: STAGE_SEGMENTS[0].color }} />
              <div style={{ width: `${(e.rem / e.total) * 100}%`, background: STAGE_SEGMENTS[1].color }} />
              <div style={{ width: `${(e.light / e.total) * 100}%`, background: STAGE_SEGMENTS[2].color }} />
            </div>
          ))}

          {/* Average bed / wake reference lines */}
          {timed.length > 0 && (
            <div className="absolute top-0 bottom-0" style={{ left: X(avgBed), borderLeft: `2px dashed ${C.sleep}` }}>
              <span className="absolute top-0 left-1 text-[8px] font-bold whitespace-nowrap" style={{ color: C.sleep }}>avg bed</span>
            </div>
          )}
          {avgWake != null && timed.length > 1 && (
            <div className="absolute top-0 bottom-0" style={{ left: X(avgWake), borderLeft: `2px dashed ${C.warning}` }}>
              <span className="absolute top-0 left-1 text-[8px] font-bold whitespace-nowrap" style={{ color: C.warning }}>avg wake</span>
            </div>
          )}

          {/* Rich hover tooltip */}
          {hoverEntry && hover != null && (
            <div className="absolute z-10 card-surface px-3 py-2 text-xs shadow-lg pointer-events-none"
              style={{
                left: `${Math.min(Math.max(hover.x, 10), 55)}%`,
                top: hover.i * ROW_H - 4,
                transform: "translateY(-100%)",
                borderRadius: "var(--radius-md)", minWidth: 150, maxWidth: 200,
              }}>
              <div className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{hoverEntry.label} {hoverEntry.dateNum}</div>
              <div className="font-mono" style={{ color: C.sleep }}>
                {hoverEntry.estimated
                  ? `~${clockHM(hoverEntry.start)} → ~${clockHM(hoverEntry.start + hoverEntry.durH)} (est.)`
                  : `${hoverEntry.bed} → ${hoverEntry.wake}`}
              </div>
              <div className="font-mono" style={{ color: "var(--text-secondary)" }}>Duration: {fmt(hoverEntry.total)}</div>
              <div className="font-mono" style={{ color: STAGE_SEGMENTS[0].color }}>Deep: {fmt(hoverEntry.deep)}</div>
              <div className="font-mono" style={{ color: STAGE_SEGMENTS[1].color }}>REM: {fmt(hoverEntry.rem)}</div>
              <div className="font-mono" style={{ color: "#A79DEC" }}>Light: {fmt(hoverEntry.light)}</div>
              {hoverEntry.sleepHr != null && (
                <div className="font-mono" style={{ color: C.cv }}>Sleeping HR: {hoverEntry.sleepHr} bpm</div>
              )}
              {hoverEntry.estimated && (
                <div className="text-[9px] italic mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  bed/wake not recorded — start estimated from average
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right labels: duration + quality dot */}
        <div className="w-16 sm:w-20 shrink-0 flex flex-col">
          {entries.map(e => (
            <div key={e.dk} style={{ height: ROW_H }} className="flex items-center justify-end gap-1.5 pr-1">
              <span className="text-[10px] font-mono font-bold" style={{ color: "var(--text-secondary)" }}>{fmt(e.total)}</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.quality }}
                title="green ≥7h · amber 6–7h · red <6h" />
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-3 mt-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
        {STAGE_SEGMENTS.map(s => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "rgba(91,66,232,0.12)" }} /> 23:00–07:00 target
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ border: `1.5px dashed ${C.sleep}`, opacity: 0.6 }} /> estimated time
        </span>
      </div>
    </div>
  );
}

// ─── Tab: Sleep Architecture ─────────────────────────────────────
// Source: health_metrics sleep columns. Range mode: hero bed→wake chart,
// per-night stage strips, sleeping HR, cumulative balance. Day mode: one night in detail.
function SleepTab({ metricsHistory, timeFilter, viewMode, onViewModeChange, selectedDay, onDayChange, onJumpToDay }: {
  metricsHistory: any[]; timeFilter: string;
  viewMode: "range" | "day"; onViewModeChange: (m: "range" | "day") => void;
  selectedDay: string; onDayChange: (d: string) => void; onJumpToDay: (dk: string) => void;
}) {
  const rows = (metricsHistory || []).filter(r => r.sleep_duration_minutes != null);
  const lens = <DayLens mode={viewMode} onModeChange={onViewModeChange} day={selectedDay} onDayChange={onDayChange} />;

  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  const STAGE_COLORS = { deep: "#5B42E8", light: "#3b82f6", rem: "#E03535" };

  const stageParts = (r: any) => {
    const deep = r.sleep_deep_minutes ?? 0;
    const rem = r.sleep_rem_minutes ?? 0;
    const light = Math.max(0, r.sleep_duration_minutes - deep - rem);
    return { deep, light, rem, total: r.sleep_duration_minutes };
  };

  // ── Day mode: a single night in detail ──
  if (viewMode === "day") {
    const row = rows.find(r => dayKeyOf(r.recorded_at) === selectedDay);
    if (!row) {
      return (
        <div className="space-y-5">
          {lens}
          <EmptyState icon={Moon} message={`No sleep recorded for ${fmtDayLong(selectedDay)}. ${CHAT_HINT}`} />
        </div>
      );
    }
    const p = stageParts(row);
    const balanceMin = 480 - p.total;
    const kpis = [
      { label: "Total Sleep", val: fmt(p.total), color: C.sleep },
      { label: "Deep", val: `${fmt(p.deep)} · ${Math.round(p.deep / p.total * 100)}%`, color: STAGE_COLORS.deep },
      { label: "REM", val: `${fmt(p.rem)} · ${Math.round(p.rem / p.total * 100)}%`, color: STAGE_COLORS.rem },
      { label: "Light", val: `${fmt(p.light)} · ${Math.round(p.light / p.total * 100)}%`, color: STAGE_COLORS.light },
      { label: "Bed → Wake", val: `${row.sleep_bed_time ?? "—"} → ${row.sleep_wake_time ?? "—"}`, color: C.trends },
      ...(row.sleeping_heart_rate != null ? [{ label: "Sleeping HR", val: `${row.sleeping_heart_rate} bpm`, color: C.cv }] : []),
    ];
    return (
      <div className="space-y-5">
        {lens}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Night of {fmtDayLong(selectedDay)}
            </div>
            <div className="text-[10px] px-2 py-1 rounded-lg font-bold"
              style={balanceMin > 0
                ? { background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }
                : { background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>
              {balanceMin > 0 ? `${fmt(balanceMin)} under 8h` : `${fmt(-balanceMin)} over 8h`}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            {kpis.map(m => (
              <div key={m.label} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
                <div className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
              </div>
            ))}
          </div>
          {/* Large stage strip */}
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Stage Mix</div>
          <div className="flex h-8 rounded-xl overflow-hidden" style={{ background: "var(--border-subtle)" }}>
            {([
              { key: "deep", label: "Deep" }, { key: "light", label: "Light" }, { key: "rem", label: "REM" },
            ] as const).map(s => {
              const pctVal = Math.round((p[s.key] / p.total) * 100);
              return (
                <motion.div key={s.key}
                  initial={{ width: 0 }} animate={{ width: `${pctVal}%` }}
                  transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
                  className="flex items-center justify-center"
                  style={{ background: STAGE_COLORS[s.key] }}>
                  {pctVal >= 8 && <span className="text-[10px] font-bold text-white">{s.label} {pctVal}%</span>}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Single-night schedule bar on the clock axis */}
        <SleepScheduleChart rows={[row]} label={fmtDayLong(selectedDay)} onJumpToDay={onJumpToDay} />
      </div>
    );
  }

  // ── Range mode ──
  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        {lens}
        <EmptyState icon={Moon} message={`No sleep data in the ${rangeLabel(timeFilter)}. ${CHAT_HINT} Sleep duration and stages are extracted automatically.`} />
      </div>
    );
  }

  const latest = rows[rows.length - 1];
  const lp = stageParts(latest);
  const avgMin = Math.round(rows.reduce((a, r) => a + r.sleep_duration_minutes, 0) / rows.length);

  // Sleeping heart rate per night (when present)
  const sleepHrData = rows
    .filter(r => r.sleeping_heart_rate != null)
    .map(r => ({ date: fmtDay(r.recorded_at), hr: r.sleeping_heart_rate }));

  // Cumulative sleep balance vs 8h/night (positive = debt)
  let cum = 0;
  const balanceData = rows.map(r => {
    cum += (480 - r.sleep_duration_minutes) / 60;
    return { date: fmtDay(r.recorded_at), debt: Math.round(cum * 10) / 10 };
  });
  const finalDebt = balanceData.length ? balanceData[balanceData.length - 1].debt : 0;
  const isDebt = finalDebt > 0;

  return (
    <div className="space-y-5">
      {lens}

      {/* Header metrics */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Sleep Architecture · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {rows.length} night{rows.length !== 1 ? "s" : ""} recorded
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Last Night", val: fmt(lp.total), color: C.sleep },
            { label: `Avg (${rangeLabel(timeFilter)})`, val: fmt(avgMin), color: C.trends },
            { label: "Deep Sleep", val: fmt(lp.deep), color: STAGE_COLORS.deep },
            { label: "REM Sleep", val: fmt(lp.rem), color: STAGE_COLORS.rem },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HERO: Bed & wake schedule — hand-rolled stage-segmented Gantt */}
      {rows.length >= 2 ? (
        <SleepScheduleChart rows={rows} label={rangeLabel(timeFilter)} onJumpToDay={onJumpToDay} />
      ) : (
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Bed &amp; Wake Schedule · {rangeLabel(timeFilter)}
          </div>
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        </div>
      )}

      {/* Stage strips — one 100% stacked bar per night */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Stage Mix per Night · {rangeLabel(timeFilter)}
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
            {([["Deep", STAGE_COLORS.deep], ["Light", STAGE_COLORS.light], ["REM", STAGE_COLORS.rem]] as const).map(([l, c]) => (
              <span key={l} className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: c }} /> {l}</span>
            ))}
          </div>
        </div>
        {rows.length >= 2 ? (
          <div className="space-y-2.5">
            {rows.map(r => {
              const p = stageParts(r);
              return (
                <div key={r.recorded_at} className="flex items-center gap-3 cursor-pointer group" onClick={() => onJumpToDay(dayKeyOf(r.recorded_at))}>
                  <div className="w-14 shrink-0 text-[10px] font-bold font-mono group-hover:underline" style={{ color: "var(--text-tertiary)" }}>{fmtDay(r.recorded_at)}</div>
                  <div className="flex-1 flex h-3.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                    {([
                      { key: "deep" }, { key: "light" }, { key: "rem" },
                    ] as const).map(s => (
                      <motion.div key={s.key}
                        initial={{ width: 0 }} animate={{ width: `${(p[s.key] / p.total) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
                        style={{ background: STAGE_COLORS[s.key] }}
                        title={`${s.key}: ${fmt(p[s.key])}`}
                      />
                    ))}
                  </div>
                  <div className="w-16 shrink-0 text-right text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{fmt(p.total)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        )}
      </div>

      {/* Sleeping heart rate per night */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Sleeping Heart Rate · {rangeLabel(timeFilter)}
        </div>
        {sleepHrData.length >= 2 ? (
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sleepHrData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sleepHrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.sleep} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.sleep} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={["dataMin - 3", "dataMax + 3"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} bpm`, "Sleeping HR"]}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="hr" stroke={C.sleep} strokeWidth={2.5} fill="url(#sleepHrGrad)" dot={{ r: 3, fill: C.sleep }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 nights with sleeping HR in the ${rangeLabel(timeFilter)} — ${sleepHrData.length} available.`} />
        )}
      </div>

      {/* Sleep balance — cumulative line vs 8h/night target */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Sleep Balance · {rangeLabel(timeFilter)}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Running cumulative {isDebt ? "deficit" : "surplus"} vs 8h/night across {rows.length} recorded night{rows.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-lg font-bold"
            style={isDebt
              ? { background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }
              : { background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>
            {isDebt ? `⚠ ${Math.abs(finalDebt)}h DEBT` : `+${Math.abs(finalDebt)}h SURPLUS`}
          </div>
        </div>
        {balanceData.length >= 2 ? (
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isDebt ? C.warning : C.optimal} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isDebt ? C.warning : C.optimal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v}h`} />
                <Tooltip
                  formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}h`, "Cumulative balance"]}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="debt" stroke={isDebt ? C.warning : C.optimal} strokeWidth={2.5}
                  fill="url(#balanceGrad)" dot={{ r: 3, fill: isDebt ? C.warning : C.optimal }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Trends ─────────────────────────────────────────────────
// Metric explorer + compare + weekday patterns + nutrition trends.
// Everything derived from real rows; small n is stated, nothing invented.
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

function TrendsTab({ metricsHistory, dbMeals, timeFilter }: {
  metricsHistory: any[]; dbMeals?: any[]; timeFilter: string;
}) {
  const rows = metricsHistory || [];
  const [primary, setPrimary] = useState("resting_heart_rate");
  const [compare, setCompare] = useState<string | null>(null);
  const [weekdayMetric, setWeekdayMetric] = useState("sleep_duration_minutes");

  const pointsFor = (key: string) => rows.filter(r => r[key] != null);
  const available = TREND_METRICS.filter(m => pointsFor(m.key).length >= 3);

  if (available.length === 0 && (dbMeals || []).length === 0) {
    return <EmptyState icon={Activity} message={`Not enough history to explore trends in the ${rangeLabel(timeFilter)} — at least 3 recorded days are needed. ${CHAT_HINT}`} />;
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

  // Weekday patterns (Mon..Sun) for a selectable metric
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
      const wd = (new Date(r.recorded_at).getDay() + 6) % 7; // Mon=0
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

  // Nutrition trends from meals (daily calories + protein)
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
      {/* Metric explorer */}
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

            <div className="h-[220px] w-full">
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

            {/* Compare mode */}
            <div className="flex items-center flex-wrap gap-1.5 mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: "var(--text-tertiary)" }}>Compare:</span>
              {chip("None", !activeCompare, () => setCompare(null), C.cv)}
              {available.filter(m => m.key !== activePrimary).map(m => chip(m.label, m.key === activeCompare, () => setCompare(m.key === compare ? null : m.key), C.cv))}
            </div>
          </>
        )}
      </div>

      {/* Weekday patterns */}
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

      {/* Nutrition trends */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Nutrition Trends · {rangeLabel(timeFilter)}
        </div>
        {nutritionData.length >= 3 ? (
          <div className="h-[180px] w-full">
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
        ) : (
          <NeedMoreNote message={`Need at least 3 days of logged meals in the ${rangeLabel(timeFilter)} — ${nutritionData.length} available.`} />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Fuel (Nutrition) ───────────────────────────────────────
// Legacy FuelTab removed and abstracted to components/health/FuelTab.tsx

// ─── Muscle Coverage (body map) ──────────────────────────────────
// DB muscle_group strings → react-body-highlighter muscle slugs
const MUSCLE_MAP: Record<string, string[]> = {
  "Chest": ["chest"],
  "Back": ["upper-back", "lower-back"],
  "Front Delts": ["front-deltoids"],
  "Rear Delts": ["back-deltoids"],
  "Biceps": ["biceps"],
  "Triceps": ["triceps"],
  "Abs": ["abs"],
  "Quads": ["quadriceps"],
  "Hamstrings": ["hamstring"],
  "Glutes": ["gluteal"],
  "Calves": ["calves"],
};
// Intensity scale (frequency 1–3) using the kinematic accent
const MUSCLE_HIGHLIGHTS = ["#F2A468", "#EA8838", "#E07020"];

function MuscleCoveragePanel({ dbWorkouts, templateExercises, timeFilter, label }: {
  dbWorkouts?: any[]; templateExercises: any[]; timeFilter: string; label?: string;
}) {
  const lensLabel = label ?? rangeLabel(timeFilter);
  // Join workouts → template exercises client-side
  const exToGroup: Record<string, string> = {};
  templateExercises.forEach(t => { if (t.exercise_name && t.muscle_group) exToGroup[t.exercise_name] = t.muscle_group; });

  const groupSets: Record<string, number> = {};
  Object.keys(MUSCLE_MAP).forEach(g => { groupSets[g] = 0; });
  let unmatched = 0;
  (dbWorkouts || []).forEach(w => {
    // only lifting set rows count; session-stat duplicates add nothing (sets counted once per row)
    if (!(w.sets > 0 || w.reps > 0 || w.weight > 0)) return;
    const g = exToGroup[w.exercise_name];
    if (!g || !(g in groupSets)) { unmatched++; return; }
    groupSets[g] += w.sets || 0;
  });

  const totalSets = Object.values(groupSets).reduce((a, b) => a + b, 0);
  const maxSets = Math.max(1, ...Object.values(groupSets));
  const legend = Object.entries(groupSets).sort((a, b) => b[1] - a[1]);

  // Model data: one entry per worked group, frequency = 1–3 relative to max
  const modelData = Object.entries(groupSets)
    .filter(([, sets]) => sets > 0)
    .map(([group, sets]) => ({
      name: group,
      muscles: MUSCLE_MAP[group] as any,
      frequency: Math.max(1, Math.ceil((sets / maxSets) * 3)),
    }));

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Muscle Coverage · {lensLabel}
        </div>
        <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
          {totalSets} working sets
        </div>
      </div>

      {totalSets === 0 ? (
        <NeedMoreNote message={`No template-matched lifting sets in the ${lensLabel} — log a session from a template to see muscle coverage.`} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 flex flex-col items-center sm:flex-row sm:justify-center gap-2">
              <div className="text-center">
                <Model
                  type="anterior"
                  data={modelData}
                  bodyColor="#E2E6F0"
                  highlightedColors={MUSCLE_HIGHLIGHTS}
                  style={{ width: "9rem" }}
                />
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "var(--text-tertiary)" }}>Front</div>
              </div>
              <div className="text-center">
                <Model
                  type="posterior"
                  data={modelData}
                  bodyColor="#E2E6F0"
                  highlightedColors={MUSCLE_HIGHLIGHTS}
                  style={{ width: "9rem" }}
                />
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "var(--text-tertiary)" }}>Back</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Sets per Muscle Group</div>
              <div className="space-y-1.5">
                {legend.map(([group, sets]) => {
                  const neglected = sets === 0;
                  return (
                    <div key={group} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg"
                      style={neglected
                        ? { background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)" }
                        : { background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                      <span className="font-semibold truncate" style={{ color: neglected ? C.critical : "var(--text-secondary)" }}>
                        {group}{neglected ? " · neglected" : ""}
                      </span>
                      <span className="font-black font-mono shrink-0 ml-2" style={{ color: neglected ? C.critical : C.kinematic }}>
                        {sets}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {unmatched > 0 && (
            <div className="text-[10px] italic mt-3" style={{ color: "var(--text-tertiary)" }}>
              {unmatched} unmatched exercise row{unmatched !== 1 ? "s" : ""} not shown (no template muscle mapping)
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Kinematic Load & Cardio ──────────────────────────────────
// Source: workouts (one row per exercise set-group; cardio fields are
// mostly null until outdoor activities are synced).

// Expandable session card — stats always visible, exercises + HR stream on tap
function SessionCard({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
      <button className="w-full text-left p-4 flex flex-col gap-3 transition-colors hover:bg-black/[0.02]" onClick={() => setOpen(x => !x)}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{s.title}</span>
            {s.exercises.length > 0 && (
              <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{s.exercises.length} exercise{s.exercises.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span className="text-xs font-mono">{new Date(s.date).toLocaleDateString()}</span>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {/* Session stats — collapsed header, shown once per session */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono">
          {s.stats.distance_km != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Dist</div>
              <div className="font-bold" style={{ color: C.kinematic }}>{s.stats.distance_km} km</div>
            </div>
          )}
          {s.stats.duration_minutes != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Time</div>
              <div className="font-bold" style={{ color: C.optimal }}>{Math.round(s.stats.duration_minutes)} m</div>
            </div>
          )}
          {s.stats.average_heartrate != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Avg HR</div>
              <div className="font-bold" style={{ color: C.cv }}>{s.stats.average_heartrate} bpm</div>
            </div>
          )}
          {s.stats.max_heartrate != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Max HR</div>
              <div className="font-bold" style={{ color: C.cv }}>{s.stats.max_heartrate} bpm</div>
            </div>
          )}
          {s.stats.calories != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Cals</div>
              <div className="font-bold" style={{ color: C.nutrition }}>{s.stats.calories}</div>
            </div>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* Exercises within the session (original row order) */}
              {s.exercises.length > 0 && (
                <div className="space-y-1.5 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {s.exercises.map((ex: any) => (
                    <div key={ex.id} className="flex items-center justify-between gap-4 text-xs pt-1.5">
                      <span className="font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{ex.exercise_name}</span>
                      <span className="font-black font-mono shrink-0" style={{ color: C.optimal, whiteSpace: "nowrap" }}>
                        {ex.sets > 0 ? `${ex.sets} sets` : ""}{ex.reps > 0 ? ` × ${ex.reps} reps` : ""}{ex.weight > 0 ? ` @ ${ex.weight} kg` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {s.hrData.length > 0 && (
                <div style={{ height: "60px", width: "100%", marginTop: "8px" }}>
                  <ResponsiveContainer>
                    <AreaChart data={s.hrData}>
                      <defs>
                        <linearGradient id={`grad-hr-${s.key.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.cv} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={C.cv} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="hr" stroke={C.cv} strokeWidth={1.5} fill={`url(#grad-hr-${s.key.replace(/[^a-zA-Z0-9]/g, "")})`} dot={false} isAnimationActive={false} />
                      <Tooltip contentStyle={{ background: "#000", border: "none", color: "#fff", borderRadius: "8px", fontSize: "10px", padding: "2px 6px" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KinematicTab({ dbWorkouts, templateExercises, timeFilter, viewMode, onViewModeChange, selectedDay, onDayChange }: {
  dbWorkouts?: any[]; templateExercises?: any[]; timeFilter: string;
  viewMode: "range" | "day"; onViewModeChange: (m: "range" | "day") => void;
  selectedDay: string; onDayChange: (d: string) => void;
}) {
  // Day lens: narrow every panel to the picked day
  const rangeWorkouts = viewMode === "day"
    ? (dbWorkouts || []).filter(w => dayKeyOf(w.workout_date) === selectedDay)
    : (dbWorkouts || []);
  const lensLabel = viewMode === "day" ? fmtDayLong(selectedDay) : rangeLabel(timeFilter);

  // Extract progression data for weightlifting (max weight per exercise per day)
  const progressionData: any = {};

  // Separate cardio and lifting (cardio rows carry distance/duration/HR)
  const cardioWorkouts = rangeWorkouts.filter(w => w.distance_km || w.duration_minutes || w.average_heartrate);
  const liftingWorkouts = rangeWorkouts.filter(w => !w.distance_km && (w.weight > 0 || w.reps > 0 || w.sets > 0));

  // Group rows into sessions: every row of one session carries the same
  // session stats (activity_type, duration, calories, HR). Group key =
  // calendar day + activity_type (fallback: day + exercise_name).
  const sessionGroups = (() => {
    const map = new Map<string, any[]>();
    cardioWorkouts.forEach(w => {
      const day = (w.workout_date || "").split("T")[0];
      const key = `${day}|${w.activity_type || w.exercise_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return Array.from(map.entries()).map(([key, rows]) => {
      // Session stats are identical across rows — take them from any row
      const stats = rows.find(r => r.duration_minutes != null || r.calories != null || r.average_heartrate != null || r.distance_km != null) || rows[0];
      const streamRow = rows.find(r => r.streams?.heartrate?.data);
      return {
        key,
        title: rows[0].activity_type || rows[0].exercise_name,
        date: rows[0].workout_date,
        stats,
        exercises: rows.filter(r => (r.sets > 0 || r.reps > 0 || r.weight > 0)),
        hrData: streamRow ? streamRow.streams.heartrate.data.map((hr: number, idx: number) => ({ time: idx, hr })) : [],
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  // Daily training volume (sets × weight) and set counts from real rows
  const dailyVolume: Record<string, { volume: number; sets: number }> = {};
  const exerciseFreq: Record<string, number> = {};
  liftingWorkouts.forEach(w => {
    const date = w.workout_date.split('T')[0];
    if (!dailyVolume[date]) dailyVolume[date] = { volume: 0, sets: 0 };
    dailyVolume[date].sets += w.sets || 0;
    dailyVolume[date].volume += (w.sets || 0) * (w.weight || 0);
    exerciseFreq[w.exercise_name] = (exerciseFreq[w.exercise_name] || 0) + 1;
  });
  const volumeData = Object.keys(dailyVolume).sort().map(d => ({
    date: fmtDay(d),
    volume: Math.round(dailyVolume[d].volume),
    sets: dailyVolume[d].sets,
  }));
  const topFrequent = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sessionDays = Object.keys(dailyVolume).length;

  liftingWorkouts.forEach(w => {
    const date = w.workout_date.split('T')[0];
    const ex = w.exercise_name;
    const metricValue = w.weight > 0 ? w.weight : (w.reps || 0);
    
    if (metricValue > 0) {
      if (!progressionData[ex]) progressionData[ex] = [];
      const existingDate = progressionData[ex].find((d: any) => d.date === date);
      if (existingDate) {
        if (metricValue > existingDate.value) existingDate.value = metricValue;
      } else {
        progressionData[ex].push({ date, value: metricValue });
      }
    }
  });

  // Get top 3 exercises with the most history
  const topExercises = Object.keys(progressionData)
    .filter(k => progressionData[k].length > 1)
    .sort((a, b) => progressionData[b].length - progressionData[a].length)
    .slice(0, 3);

  return (
    <div className="space-y-5">
      <DayLens mode={viewMode} onModeChange={onViewModeChange} day={selectedDay} onDayChange={onDayChange} />
      {rangeWorkouts.length === 0 ? (
        <EmptyState message={viewMode === "day"
          ? `No workouts logged on ${fmtDayLong(selectedDay)}. Log a session from a template or via Chat (/chat).`
          : `No workouts logged in the ${rangeLabel(timeFilter)}. Log a session from a template or via Chat (/chat).`} icon={Dumbbell} />
      ) : (
        <>
          {/* Training volume — sets × weight per day, from real rows */}
          {volumeData.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                  Training Volume · {lensLabel}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {sessionDays} session day{sessionDays !== 1 ? "s" : ""} · {liftingWorkouts.reduce((a, w) => a + (w.sets || 0), 0)} sets
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                      <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: number, name: string) => name === "volume" ? [`${v} kg`, "Volume (sets × kg)"] : [v, "Sets"]}
                        contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                      />
                      <Bar dataKey="volume" name="volume" fill={C.kinematic} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Exercise Frequency</div>
                  <div className="space-y-1.5">
                    {topFrequent.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                        <span className="font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{name}</span>
                        <span className="font-black font-mono shrink-0 ml-2" style={{ color: C.kinematic }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Muscle coverage body map — template-joined muscle groups */}
          <MuscleCoveragePanel dbWorkouts={rangeWorkouts} templateExercises={templateExercises || []} timeFilter={timeFilter} label={lensLabel} />

          {sessionGroups.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Heart size={14} /> Session Log · {lensLabel}
              </div>
              <div className="space-y-4">
                {sessionGroups.map((s) => (
                  <SessionCard key={s.key} s={s} />
                ))}
              </div>
            </div>
          )}

          {liftingWorkouts.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Dumbbell size={14} /> Executed Protocol · {lensLabel}
              </div>
              <div className="space-y-3">
                {liftingWorkouts.slice(0, 10).map((ex) => (
                  <div key={ex.id} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex-1">
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{ex.exercise_name}</div>
                    </div>
                    <div className="text-sm font-black text-right" style={{ fontFamily: "var(--font-mono)", color: C.optimal, whiteSpace: "nowrap" }}>
                      {ex.sets} sets {ex.reps ? `x ${ex.reps} reps` : ""} {ex.weight > 0 ? `@ ${ex.weight}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topExercises.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Progression Trajectory · {lensLabel}</div>
              <div className="space-y-6">
                {topExercises.map((ex, i) => {
                  const data = progressionData[ex].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const color = i === 0 ? C.kinematic : i === 1 ? C.optimal : C.trends;
                  return (
                    <div key={ex}>
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-sm font-bold">{ex}</div>
                        <div className="text-xs font-mono font-bold" style={{ color }}>{data[data.length-1].value} peak</div>
                      </div>
                      <div style={{ height: "100px", width: "100%" }}>
                        <ResponsiveContainer>
                          <AreaChart data={data}>
                            <defs>
                              <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#grad-${i})`} />
                            <Tooltip contentStyle={{ background: "#000", border: "none", color: "#fff", borderRadius: "8px", fontSize: "12px", padding: "4px 8px" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── AI Copilot Bar ──────────────────────────────────────────────
function CopilotBar() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");

  const go = useCallback((prompt: string) => {
    const q = prompt.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  }, [router]);

  return (
    <div className="copilot-bar">
      {/* Collapsed bar */}
      {!expanded && (
        <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpanded(true)}>
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
              <Brain size={12} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>Copilot</span>
            <span className="text-xs ai-shimmer ml-2">Ask the copilot anything about your health data.</span>
          </div>
          <button className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:bg-white/5" style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            Expand <ChevronUp size={12} />
          </button>
        </div>
      )}

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
                  <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>LangGraph Copilot</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Prompts open in the Chat module</div>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                <X size={14} />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="px-5 py-3 flex gap-2 flex-wrap">
              {[
                { icon: FileText, prompt: "Give me my weekly health report" },
                { icon: Activity, prompt: "How's my training load?" },
                { icon: Search, prompt: "How has my sleep changed this month?" },
              ].map(a => (
                <button key={a.prompt} onClick={() => go(a.prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/5"
                  style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <a.icon size={11} /> {a.prompt}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 py-3 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && go(input)}
                placeholder="Ask: How has my sleep changed since the circadian protocol?"
                className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none transition-all"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-active)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={() => go(input)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 shrink-0"
                style={{ background: "var(--accent-sleep)", color: "#fff" }}>
                <Send size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── System Status Banner ─────────────────────────────────────────
// Honest status: each domain is "active" only when its source table has
// rows inside the selected time range. No fabricated readiness scores.
function SystemBanner({ metricsCount, workoutsCount, mealsCount, timeFilter }: {
  metricsCount: number; workoutsCount: number; mealsCount: number; timeFilter: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const domains = [
    { label: "CV", active: metricsCount > 0 },
    { label: "Sleep", active: metricsCount > 0 },
    { label: "Nutrition", active: mealsCount > 0 },
    { label: "Training", active: workoutsCount > 0 },
  ];
  const allEmpty = metricsCount === 0 && workoutsCount === 0 && mealsCount === 0;

  return (
    <div className="mb-4" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Data Sources</span>
          </div>
          <div className="flex items-center gap-3">
            {domains.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <StatusDot status={s.active ? "optimal" : "inactive"} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--text-tertiary)" }}>Metric days: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{metricsCount}</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Workout rows: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{workoutsCount}</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Meals: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{mealsCount}</span></span>
          </div>
          <button onClick={() => setCollapsed(x => !x)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-4">
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <AlertTriangle size={14} style={{ color: allEmpty ? C.warning : C.optimal, marginTop: 2 }} />
                <div className="flex-1">
                  <div className="text-xs font-bold mb-0.5" style={{ color: allEmpty ? C.warning : C.optimal }}>
                    {allEmpty ? "NO TELEMETRY IN RANGE" : "LIVE DATA"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {allEmpty
                      ? `Nothing recorded in the ${rangeLabel(timeFilter)}. ${CHAT_HINT}`
                      : `Counts reflect the ${rangeLabel(timeFilter)}. Health metrics (HRV, sleep, VO₂) arrive via Chat screenshots; workouts and meals via Chat logging.`}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function HealthOS() {
  const [activeTab, setActiveTab] = useState("cardio");
  const [timeFilter, setTimeFilter] = useState("month");

  // Day drill-down lens (shared across Sleep / Fuel / Kinematic)
  const [viewMode, setViewMode] = useState<"range" | "day">("range");
  const [selectedDay, setSelectedDay] = useState<string>(toDayKey(new Date()));
  const jumpToDay = (dk: string) => { setSelectedDay(dk); setViewMode("day"); };

  // Supabase states — all range-filtered by timeFilter
  const [dbWorkouts, setDbWorkouts] = useState<any[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [dbMeals, setDbMeals] = useState<any[]>([]);
  const [templateExercises, setTemplateExercises] = useState<any[]>([]);

  // Template exercise → muscle group mapping (range-independent, fetch once).
  // Merges the learned exercise_muscles dictionary so agent-classified
  // exercises (new/unknown ones) also land on the muscle map.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const [tmplRes, learnedRes] = await Promise.all([
        supabase.from("workout_template_exercises").select("exercise_name, muscle_group"),
        supabase.from("exercise_muscles").select("exercise_name, muscle_group"),
      ]);
      const merged: Record<string, any> = {};
      (learnedRes.data || []).forEach(r => { merged[r.exercise_name] = r; });
      (tmplRes.data || []).forEach(r => { merged[r.exercise_name] = r; }); // template wins
      if (!tmplRes.error || !learnedRes.error) setTemplateExercises(Object.values(merged));
    })();
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const cutoff = getCutoff(timeFilter).toISOString();

    const fetchWorkouts = async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .gte("workout_date", cutoff)
        .order("workout_date", { ascending: false });
      if (!error && data) setDbWorkouts(data);
    };

    const fetchMeals = async () => {
      const { data, error } = await supabase
        .from("meals")
        .select("*")
        .gte("meal_time", cutoff)
        .order("meal_time", { ascending: true });
      if (!error && data) setDbMeals(data);
    };

    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from("health_metrics")
        .select("*")
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: true });
      if (!error && data) setMetricsHistory(data);
    };

    fetchWorkouts();
    fetchMeals();
    fetchMetrics();

    // Subscribe to real-time changes
    const workoutsChannel = supabase
      .channel("workouts_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "workouts" }, () => {
        fetchWorkouts();
      })
      .subscribe();

    const mealsChannel = supabase
      .channel("meals_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, () => {
        fetchMeals();
      })
      .subscribe();

    const metricsChannel = supabase
      .channel("metrics_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "health_metrics" }, () => {
        fetchMetrics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(workoutsChannel);
      supabase.removeChannel(mealsChannel);
      supabase.removeChannel(metricsChannel);
    };
  }, [timeFilter]);

  const tabs = [
    { id: "cardio", label: "Cardiovascular", icon: Heart, color: C.cv },
    { id: "sleep", label: "Sleep", icon: Moon, color: C.sleep },
    { id: "fuel", label: "Fuel", icon: Flame, color: C.nutrition },
    { id: "kinematic", label: "Kinematic", icon: Dumbbell, color: C.kinematic },
    { id: "trends", label: "Trends", icon: TrendingUp, color: C.trends },
    { id: "templates", label: "Templates", icon: Target, color: C.textPrimary },
  ];

  const tabVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
  };

  return (
    <div className="health-main-wrapper">
      {/* Page Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={18} style={{ color: C.cv }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Health OS V7</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,230,118,0.15)", color: C.optimal, border: "1px solid rgba(0,230,118,0.3)" }}>Live</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Autonomous Agentic Health Command Center · Live Supabase telemetry
            </p>
          </div>
          {/* Time filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
            {["Day", "Week", "Month", "Quarter", "Year"].map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f.toLowerCase())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  background: timeFilter === f.toLowerCase() ? "var(--surface-quaternary)" : "transparent",
                  color: timeFilter === f.toLowerCase() ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: timeFilter === f.toLowerCase() ? "1px solid var(--border-active)" : "1px solid transparent",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* System Banner */}
        <SystemBanner metricsCount={metricsHistory.length} workoutsCount={dbWorkouts.length} mealsCount={dbMeals.length} timeFilter={timeFilter} />

        {/* Tab Nav */}
        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-tab={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            >
              <tab.icon size={15} style={{ color: activeTab === tab.id ? tab.color : "var(--text-tertiary)" }} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Areas */}
      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible" exit="exit">
            {activeTab === "cardio" && <CardioTab metricsHistory={metricsHistory} timeFilter={timeFilter} />}
            {activeTab === "sleep" && (
              <SleepTab metricsHistory={metricsHistory} timeFilter={timeFilter}
                viewMode={viewMode} onViewModeChange={setViewMode}
                selectedDay={selectedDay} onDayChange={setSelectedDay} onJumpToDay={jumpToDay} />
            )}
            {activeTab === "fuel" && (
              <FuelTab dbMeals={dbMeals} dbWorkouts={dbWorkouts} timeFilter={timeFilter}
                viewMode={viewMode} selectedDay={selectedDay} onJumpToDay={jumpToDay}
                dayLens={<DayLens mode={viewMode} onModeChange={setViewMode} day={selectedDay} onDayChange={setSelectedDay} />} />
            )}
            {activeTab === "kinematic" && (
              <KinematicTab dbWorkouts={dbWorkouts} templateExercises={templateExercises} timeFilter={timeFilter}
                viewMode={viewMode} onViewModeChange={setViewMode}
                selectedDay={selectedDay} onDayChange={setSelectedDay} />
            )}
            {activeTab === "trends" && <TrendsTab metricsHistory={metricsHistory} dbMeals={dbMeals} timeFilter={timeFilter} />}
            {activeTab === "templates" && <TemplatesTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* AI Copilot Bar */}
      <CopilotBar />
    </div>
  );
}
