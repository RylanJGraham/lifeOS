"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
  ScatterChart, Scatter, ZAxis, Cell, PieChart, Pie, RadialBarChart, RadialBar
} from "recharts";
import {
  Heart, Moon, Zap, Dumbbell, Activity, Brain, AlertTriangle,
  ChevronDown, ChevronUp, ChevronRight, Check, X, BarChart2,
  TrendingUp, TrendingDown, Minus, Send, Settings, FileText,
  Search, Target, Clock, Flame, RotateCcw, Info, Eye,
  ArrowUpRight, ArrowDownRight, Layers
} from "lucide-react";

// ─── Colour palette helpers — Light Mode ─────────────────────────
const C = {
  cv: "#E03535",
  sleep: "#5B42E8",
  nutrition: "#00A878",
  kinematic: "#E07020",
  trends: "#0EA5E9",
  optimal: "#059669",
  warning: "#D97706",
  critical: "#DC2626",
  inactive: "#9CA3AF",
  surfPrimary: "#F4F6FA",
  surfSecondary: "#FFFFFF",
  surfTertiary: "#EEF1F8",
  surfQuat: "#E2E6F0",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  border: "#E2E8F0",
  borderActive: "#CBD5E1",
};

// ─── Mock Data ───────────────────────────────────────────────────
const vo2TrajectoryData = [
  { month: "Jan", actual: 42.1, predicted: null, ci_low: null, ci_high: null },
  { month: "Feb", actual: 43.4, predicted: null, ci_low: null, ci_high: null },
  { month: "Mar", actual: 44.8, predicted: null, ci_low: null, ci_high: null },
  { month: "Apr", actual: 47.2, predicted: null, ci_low: null, ci_high: null },
  { month: "May", actual: null, predicted: 48.3, ci_low: 47.6, ci_high: 49.0 },
  { month: "Jun", actual: null, predicted: 49.1, ci_low: 48.0, ci_high: 50.2 },
  { month: "Jul", actual: null, predicted: 49.8, ci_low: 48.2, ci_high: 51.4 },
  { month: "Aug", actual: null, predicted: 50.4, ci_low: 48.4, ci_high: 52.4 },
  { month: "Sep", actual: null, predicted: 50.9, ci_low: 48.5, ci_high: 53.3 },
  { month: "Oct", actual: null, predicted: 51.4, ci_low: 48.6, ci_high: 54.2 },
  { month: "Nov", actual: null, predicted: 51.8, ci_low: 48.7, ci_high: 54.9 },
  { month: "Dec", actual: null, predicted: 52.1, ci_low: 48.7, ci_high: 55.5 },
];

const hrvData = [
  { day: "Apr14", hrv: 43, baseline: 45 }, { day: "Apr15", hrv: 46, baseline: 45 },
  { day: "Apr16", hrv: 42, baseline: 45 }, { day: "Apr17", hrv: 44, baseline: 45 },
  { day: "Apr18", hrv: 47, baseline: 45 }, { day: "Apr19", hrv: 46, baseline: 45 },
  { day: "Apr20", hrv: 48, baseline: 45 },
];

const rhrData = [
  { day: "Apr14", rhr: 55, baseline: 54 }, { day: "Apr15", rhr: 54, baseline: 54 },
  { day: "Apr16", rhr: 56, baseline: 54 }, { day: "Apr17", rhr: 53, baseline: 54 },
  { day: "Apr18", rhr: 52, baseline: 54 }, { day: "Apr19", rhr: 52, baseline: 54 },
  { day: "Apr20", rhr: 52, baseline: 54 },
];

const ctlAtlData = [
  { date: "Mar1", ctl: 55, atl: 48, tsb: 7 }, { date: "Mar8", ctl: 58, atl: 62, tsb: -4 },
  { date: "Mar15", ctl: 62, atl: 70, tsb: -8 }, { date: "Mar22", ctl: 66, atl: 68, tsb: -2 },
  { date: "Mar29", ctl: 69, atl: 74, tsb: -5 }, { date: "Apr5", ctl: 70, atl: 78, tsb: -8 },
  { date: "Apr12", ctl: 72, atl: 72, tsb: 0 }, { date: "Apr19", ctl: 72, atl: 64, tsb: 8 },
  { date: "Today", ctl: 72, atl: 64, tsb: -8 },
];

const weeklyZoneData = [
  { week: "W1", z1: 3, z2: 5, z3: 3, z4: 2, z5: 0.5 },
  { week: "W2", z1: 4, z2: 6, z3: 2, z4: 1.5, z5: 0.5 },
  { week: "W3", z1: 2, z2: 7, z3: 3.5, z4: 2, z5: 1 },
  { week: "W4", z1: 3.5, z2: 5.5, z3: 4, z4: 2.5, z5: 0.5 },
  { week: "W5", z1: 3, z2: 6, z3: 3, z4: 1.5, z5: 0.5 },
  { week: "W6", z1: 4, z2: 7, z3: 3.5, z4: 2, z5: 1 },
  { week: "W7", z1: 3.5, z2: 6.5, z3: 3, z4: 2.5, z5: 0.5 },
  { week: "W8", z1: 3, z2: 5.5, z3: 4, z4: 3, z5: 1 },
  { week: "W9", z1: 4, z2: 7.5, z3: 2.5, z4: 2, z5: 0.5 },
  { week: "W10", z1: 3.5, z2: 6, z3: 3, z4: 1.5, z5: 0.5 },
  { week: "W11", z1: 3, z2: 6.5, z3: 3.5, z4: 2, z5: 1 },
  { week: "W12", z1: 3.5, z2: 5.8, z3: 3.2, z4: 2.1, z5: 0.9 },
];

const sleepOnsetData = [
  { date: "Apr7", onset: 23.0 }, { date: "Apr8", onset: 23.25 },
  { date: "Apr9", onset: 23.5 }, { date: "Apr10", onset: 23.75 },
  { date: "Apr11", onset: 24.1 }, { date: "Apr12", onset: 24.3 },
  { date: "Apr13", onset: 24.5 }, { date: "Apr14", onset: 24.2 },
  { date: "Apr15", onset: 24.6 }, { date: "Apr16", onset: 24.8 },
  { date: "Apr17", onset: 25.0 }, { date: "Apr18", onset: 24.7 },
  { date: "Apr19", onset: 25.2 }, { date: "Apr20", onset: 25.4 },
];

const sleepStageData = [
  { night: "Mon", deep: 1.8, light: 3.4, rem: 2.1, awake: 0.3 },
  { night: "Tue", deep: 1.5, light: 3.8, rem: 1.9, awake: 0.5 },
  { night: "Wed", deep: 1.0, light: 4.2, rem: 1.4, awake: 0.8 },
  { night: "Thu", deep: 1.9, light: 3.5, rem: 2.2, awake: 0.2 },
  { night: "Fri", deep: 2.1, light: 3.2, rem: 2.4, awake: 0.3 },
  { night: "Sat", deep: 2.3, light: 3.7, rem: 2.6, awake: 0.2 },
  { night: "Sun", deep: 1.8, light: 3.4, rem: 2.2, awake: 0.3 },
];

const macroData = [
  { name: "Protein", value: 165, target: 190, color: C.cv },
  { name: "Carbs", value: 280, target: 350, color: C.nutrition },
  { name: "Fat", value: 72, target: 90, color: C.warning },
  { name: "Fiber", value: 28, target: 35, color: C.trends },
];

const mealLog = [
  { time: "07:30", name: "Greek Yogurt + Oats + Berries", kcal: 420, p: 38, c: 52, f: 8, ai: "Optimal fasted glucose window. High casein content ideal post-sleep." },
  { time: "11:00", name: "Chicken Caesar (no croutons)", kcal: 480, p: 52, c: 18, f: 22, ai: "Good pre-workout fuel. Could add 20g carbs for afternoon session." },
  { time: "14:30", name: "Protein Shake + Banana", kcal: 320, p: 35, c: 42, f: 4, ai: "Perfect intra/post-workout window. Banana glycemic spike well-timed." },
  { time: "19:00", name: "Salmon + Sweet Potato + Broccoli", kcal: 610, p: 48, c: 55, f: 18, ai: "Excellent omega-3 for overnight HRV. Anti-inflammatory profile." },
];

const sessionLog = [
  { date: "Today", type: "Tempo (Planned)", dur: "45:00", dist: "8.2km", avgHR: 158, tss: 78, zones: [10, 15, 35, 30, 10] },
  { date: "Apr 19", type: "Zone 2 Endurance", dur: "60:00", dist: "10.1km", avgHR: 142, tss: 62, zones: [15, 55, 22, 7, 1] },
  { date: "Apr 18", type: "Recovery Run", dur: "30:00", dist: "4.5km", avgHR: 122, tss: 22, zones: [60, 32, 7, 1, 0] },
  { date: "Apr 17", type: "Interval VO₂ Max", dur: "38:00", dist: "7.8km", avgHR: 152, tss: 82, zones: [18, 22, 18, 28, 14] },
  { date: "Apr 16", type: "Long Run", dur: "90:00", dist: "16.2km", avgHR: 148, tss: 125, zones: [10, 45, 28, 15, 2] },
  { date: "Apr 15", type: "Zone 2 Endurance", dur: "55:00", dist: "9.4km", avgHR: 139, tss: 58, zones: [20, 52, 20, 7, 1] },
  { date: "Apr 14", type: "Tempo Run", dur: "42:00", dist: "7.9km", avgHR: 156, tss: 76, zones: [12, 18, 30, 32, 8] },
];

const copilotMessages = [
  { time: "23:14:02", type: "cron", text: "Sleep analysis complete. Onset drift +47 min over 14 days detected." },
  { time: "23:14:05", type: "cron", text: "Recovery scores updated. Tomorrow readiness projected at 72/100." },
  { time: "23:14:08", type: "insight", text: "HRV trending ↑ above baseline. Positive adaptation signal." },
  { time: "23:16:22", type: "insight", text: "VO₂ Max trajectory: +0.8 ml/kg/min this month (accelerating)." },
  { time: "23:18:44", type: "alert", text: "Sleep onset approaching circadian danger zone. Phase advance recommended." },
  { time: "23:20:01", type: "cron", text: "Nutrition log processed. Protein deficit: 25g. Omega-3 surplus." },
];

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

function DeltaBadge({ value, unit = "" }: { value: number | string; unit?: string }) {
  const num = typeof value === "number" ? value : parseFloat(value as string);
  const isPos = num > 0;
  const isNeg = num < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? C.optimal : isNeg ? C.critical : C.textTertiary;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color, fontFamily: "var(--font-mono)" }}>
      <Icon size={11} />
      {isPos && "+"}{value}{unit}
    </span>
  );
}

function MetricCard({
  label, value, unit, delta, deltaUnit, accentColor, sublabel, children
}: {
  label: string; value: string | number; unit?: string; delta?: number;
  deltaUnit?: string; accentColor?: string; sublabel?: string; children?: React.ReactNode;
}) {
  return (
    <div className="card-surface p-4 flex flex-col gap-1 hover:border-[--border-active] transition-all duration-200" style={{ borderRadius: "var(--radius-lg)" }}>
      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div className="flex items-end gap-1.5 mt-1">
        <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: accentColor ?? "var(--text-primary)", lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span className="text-sm pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{unit}</span>}
      </div>
      {sublabel && <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sublabel}</div>}
      {delta !== undefined && <div className="mt-1"><DeltaBadge value={delta} unit={deltaUnit} /></div>}
      {children}
    </div>
  );
}

function AIInsightCard({ title, confidence, children, onDismiss }: {
  title: string; confidence: number; children: React.ReactNode; onDismiss?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ai-card p-5" style={{ borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-glow)", border: "1px solid var(--border-ai)" }}>
            <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>AI Analysis</div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(123,97,255,0.2)", color: "var(--accent-sleep)", border: "1px solid var(--border-ai)" }}>
            {confidence}% conf
          </span>
          {onDismiss && (
            <button onClick={onDismiss} className="p-1 rounded hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{children}</div>
      <button
        onClick={() => setExpanded(x => !x)}
        className="mt-3 text-xs font-semibold transition-colors hover:underline"
        style={{ color: "var(--accent-sleep)" }}
      >
        {expanded ? "Hide reasoning ▲" : "Show reasoning ▼"}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 text-xs leading-relaxed" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Model: LangGraph HealthAgent v3.2 | Training data: 14-day rolling window | Inputs: HRV, RHR, sleep stages, TSS, nutrition log | Inference time: 1.4s
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpandableSection({ title, icon: Icon, defaultOpen = false, accentColor, badge, children }: {
  title: string; icon: React.ElementType; defaultOpen?: boolean;
  accentColor?: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-lg)" }}>
      <button
        className="expandable-header w-full text-left"
        onClick={() => setOpen(x => !x)}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: accentColor ?? "var(--text-tertiary)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{title}</span>
          {badge}
        </div>
        <div style={{ color: "var(--text-tertiary)" }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ZoneBar({ pct, zone }: { pct: number; zone: 1 | 2 | 3 | 4 | 5 }) {
  const colors = {
    1: "#4CAF50", 2: "#2196F3", 3: "#FF9800", 4: "#F44336", 5: "#9C27B0",
  };
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0, 0, 0.2, 1], delay: zone * 0.05 }}
        style={{ background: colors[zone] }}
      />
    </div>
  );
}

function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── VO2 Max Gauge SVG ───────────────────────────────────────────
function VO2Gauge({ value, max = 60 }: { value: number; max?: number }) {
  const pct = value / max;
  const radius = 70;
  const stroke = 10;
  const circumference = Math.PI * radius;
  const dashoffset = circumference * (1 - pct);
  const zones = [
    { label: "Fair", min: 0, max: 35, color: "#616161" },
    { label: "Good", min: 35, max: 42, color: "#2196F3" },
    { label: "Excellent", min: 42, max: 50, color: C.nutrition },
    { label: "Superior", min: 50, max: 60, color: C.cv },
  ];
  const label = zones.find(z => value >= z.min && value < z.max)?.label ?? "Elite";
  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={110} viewBox="0 0 180 110">
        <defs>
          <linearGradient id="vo2grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.nutrition} />
            <stop offset="100%" stopColor={C.cv} />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <path d="M10,100 A80,80 0 0,1 170,100" fill="none" stroke="var(--surface-quaternary)" strokeWidth={stroke} strokeLinecap="round" />
        {/* Value arc */}
        <motion.path
          d="M10,100 A80,80 0 0,1 170,100"
          fill="none"
          stroke="url(#vo2grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${circumference * pct} ${circumference * (1 - pct)}` }}
          transition={{ duration: 1, ease: [0, 0, 0.2, 1] }}
          style={{ filter: "drop-shadow(0 0 8px rgba(255,69,69,0.5))" }}
        />
        <text x="90" y="82" textAnchor="middle" fontSize="32" fontWeight="900" fontFamily="'JetBrains Mono',monospace" fill={C.textPrimary}>{value}</text>
        <text x="90" y="100" textAnchor="middle" fontSize="11" fill={C.textTertiary} fontFamily="'JetBrains Mono',monospace">ml/kg/min</text>
      </svg>
      <span className="text-xs font-bold uppercase tracking-widest px-3 py-0.5 rounded-full"
        style={{ background: "rgba(0,230,118,0.15)", color: C.optimal, border: "1px solid rgba(0,230,118,0.3)" }}>
        {label} · 82nd %ile
      </span>
    </div>
  );
}

// ─── Sleep Score Donut ───────────────────────────────────────────
function SleepScoreDonut({ score }: { score: number }) {
  const pct = score / 100;
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      <svg width={128} height={128} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-quaternary)" strokeWidth={10} />
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={C.sleep} strokeWidth={10} strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${circ * pct} ${circ * (1 - pct)}` }}
          transition={{ duration: 1.2, ease: [0, 0, 0.2, 1] }}
          style={{ filter: "drop-shadow(0 0 8px rgba(123,97,255,0.6))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.textPrimary, lineHeight: 1 }}>{score}</span>
        <span className="text-xs font-bold" style={{ color: C.sleep }}>/100</span>
        <span className="text-xs font-bold mt-0.5 uppercase tracking-widest" style={{ color: C.optimal }}>Great</span>
      </div>
    </div>
  );
}

// ─── Zone mini bar (for session table) ──────────────────────────
function ZoneMiniBar({ zones }: { zones: number[] }) {
  const colors = [C.optimal, C.trends, C.warning, C.cv, "#9C27B0"];
  return (
    <div className="flex gap-0.5 h-4 w-16 items-end">
      {zones.map((z, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${z}%`, background: colors[i], opacity: 0.85 }} />
      ))}
    </div>
  );
}

// ─── Tab: Cardiovascular Hub ─────────────────────────────────────
function CardioTab({ aiAccepted, setAiAccepted }: { aiAccepted: boolean; setAiAccepted: (v: boolean) => void }) {
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [showProjection, setShowProjection] = useState(true);
  const [dismissInsight, setDismissInsight] = useState(false);

  return (
    <div className="space-y-5">
      {/* Hero Section */}
      <div className="grid grid-cols-12 gap-4">
        {/* VO2 Max Hero */}
        <div className="col-span-12 lg:col-span-5 card-surface p-6" style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-glow-cv)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>VO₂ Max · Hero Metric</div>
          <div className="flex flex-col items-center mb-4">
            <VO2Gauge value={47.2} />
          </div>
          <div className="space-y-1.5 mt-2">
            {[
              { label: "30-day Δ", val: "+0.8 ml/kg/min", color: C.optimal },
              { label: "90-day Δ", val: "+2.4 ml/kg/min", color: C.optimal },
              { label: "Annual Δ", val: "+5.1 ml/kg/min", color: C.optimal },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>{r.label}</span>
                <span style={{ color: r.color, fontWeight: 700 }}>{r.val}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full text-xs font-bold uppercase tracking-widest py-2 rounded-lg transition-all hover:opacity-80"
            style={{ background: "rgba(255,69,69,0.1)", border: "1px solid rgba(255,69,69,0.3)", color: C.cv }}>
            Expand Projection →
          </button>
        </div>

        {/* Readiness & Strain */}
        <div className="col-span-12 lg:col-span-7 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Readiness &amp; Strain Summary</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: "Readiness", val: "72", unit: "/100", delta: "+4", color: C.optimal },
              { label: "HRV", val: "48", unit: "ms", delta: "+3ms", color: C.nutrition },
              { label: "Resting HR", val: "52", unit: "bpm", delta: "-2bpm", color: C.trends },
              { label: "Recovery", val: "82", unit: "%", delta: "+6%", color: C.optimal },
            ].map(m => (
              <div key={m.label} className="p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>{m.val}</span>
                  <span className="text-xs pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.unit}</span>
                </div>
                <div className="mt-1"><DeltaBadge value={m.delta} /></div>
              </div>
            ))}
          </div>
          {/* HRV sparkline */}
          <div className="p-3 rounded-xl mb-2" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>HRV — 7-day</span>
              <span className="text-xs font-bold" style={{ color: C.nutrition, fontFamily: "var(--font-mono)" }}>48ms ▲</span>
            </div>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={hrvData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.nutrition} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.nutrition} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="hrv" stroke={C.nutrition} strokeWidth={2} fill="url(#hrvGrad)" dot={false} />
                <ReferenceLine y={45} stroke={C.textTertiary} strokeDasharray="3 3" strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* RHR sparkline */}
          <div className="p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Resting HR — 7-day</span>
              <span className="text-xs font-bold" style={{ color: C.trends, fontFamily: "var(--font-mono)" }}>52 bpm ▼</span>
            </div>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={rhrData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rhrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.trends} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.trends} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="rhr" stroke={C.trends} strokeWidth={2} fill="url(#rhrGrad)" dot={false} />
                <ReferenceLine y={54} stroke={C.textTertiary} strokeDasharray="3 3" strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Training Decision */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)", borderLeft: `3px solid ${aiAccepted ? C.optimal : C.warning}` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
              <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>Today's Training Decision</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {aiAccepted ? "✓ AI Optimization Active" : "AI Recommends: Optimize for Weekly Load"}
              </div>
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "rgba(123,97,255,0.15)", color: C.sleep, border: "1px solid var(--border-ai)" }}>
            87% confidence
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="plan-card original p-4 rounded-xl space-y-2" style={{ background: "var(--surface-tertiary)", borderLeft: `3px solid ${C.warning}`, border: `1px solid var(--border-subtle)` }}>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.warning }}>Original Plan</div>
            <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Tempo Run</div>
            <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              <div>Duration: 45 min</div>
              <div>Target HR: 158 bpm (Threshold)</div>
              <div>TSS: 78 · Est Recovery: 36h</div>
              <div>Caloric burn: ~520 kcal</div>
            </div>
            <div className="text-xs font-semibold flex items-center gap-1 mt-2" style={{ color: C.warning }}>
              <AlertTriangle size={11} /> -30% Sat perf projected
            </div>
          </div>
          <div className="p-4 rounded-xl space-y-2" style={{ background: "var(--surface-tertiary)", borderLeft: `3px solid ${C.optimal}`, border: "1px solid rgba(0,230,118,0.2)", boxShadow: "0 0 20px rgba(0,230,118,0.05)" }}>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.optimal }}>AI Optimized Plan</div>
            <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Zone 2 Endurance Run</div>
            <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              <div>Duration: 60 min</div>
              <div>Target HR: 135–148 bpm (Z2)</div>
              <div>TSS: 52 · Est Recovery: 18h</div>
              <div>Caloric burn: ~440 kcal</div>
            </div>
            <div className="text-xs font-semibold flex items-center gap-1 mt-2" style={{ color: C.optimal }}>
              <Check size={11} /> Saturday fully preserved
            </div>
          </div>
        </div>

        {/* What-if comparison */}
        <div className="p-4 rounded-xl mb-4" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>48-Hour Projection</div>
          <div className="grid grid-cols-3 gap-2 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            <div className="font-bold" style={{ color: "var(--text-tertiary)" }}>Metric</div>
            <div className="font-bold text-center" style={{ color: C.warning }}>Original</div>
            <div className="font-bold text-center" style={{ color: C.optimal }}>AI Plan</div>
            {[
              ["Tomorrow Readiness", "41/100 🔴", "58/100 🟢"],
              ["Saturday Perf", "61/100 🟡", "72/100 🟢"],
              ["Injury Risk", "4.2/10 🟡", "1.8/10 🟢"],
              ["Weekly TSS", "342 (high)", "316 (optimal)"],
            ].map(([m, o, a]) => (
              <>
                <div key={`m-${m}`} style={{ color: "var(--text-secondary)" }}>{m}</div>
                <div key={`o-${m}`} className="text-center" style={{ color: "var(--text-secondary)" }}>{o}</div>
                <div key={`a-${m}`} className="text-center" style={{ color: "var(--text-secondary)" }}>{a}</div>
              </>
            ))}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          {!aiAccepted ? (
            <>
              <button onClick={() => setAiAccepted(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:opacity-90"
                style={{ background: C.optimal, color: "#000" }}>
                <Check size={14} /> Accept AI Optimization
              </button>
              <button className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-white/5"
                style={{ border: "1px solid var(--border-active)", color: "var(--text-secondary)" }}>
                Force Original Plan
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.optimal }}>
              <Check size={16} /> AI Optimization Active — Zone 2 plan locked in
            </div>
          )}
        </div>
        <div className="mt-3 text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          ⓘ You've accepted AI optimization in 4 of 6 recent suggestions. Weeks with &gt;80% compliance: +5.2% VO₂ Max improvement.
        </div>
      </div>

      {/* VO2 Trajectory Chart */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>VO₂ Max Trajectory</div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Full Year View with AI Projection</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowProjection(x => !x)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
              style={{ background: showProjection ? "rgba(123,97,255,0.15)" : "var(--surface-quaternary)", color: showProjection ? C.sleep : "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
              {showProjection ? "Hide" : "Show"} Projection
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={vo2TrajectoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="vo2AreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cv} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.cv} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="predAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.sleep} stopOpacity={0.15} />
                <stop offset="100%" stopColor={C.sleep} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" axisLine={false} tickLine={false}
              tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
            <YAxis domain={[38, 58]} axisLine={false} tickLine={false}
              tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
            <Tooltip
              contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}
              labelStyle={{ color: "var(--text-secondary)" }}
            />
            {/* Reference bands */}
            <ReferenceLine y={35} stroke={C.inactive} strokeDasharray="4 4" strokeWidth={1} label={{ value: "Fair", fill: C.textTertiary, fontSize: 10, position: "right" }} />
            <ReferenceLine y={42} stroke={C.trends} strokeDasharray="4 4" strokeWidth={1} label={{ value: "Good", fill: C.textTertiary, fontSize: 10, position: "right" }} />
            <ReferenceLine y={50} stroke={C.optimal} strokeDasharray="4 4" strokeWidth={1} label={{ value: "Superior", fill: C.textTertiary, fontSize: 10, position: "right" }} />
            {/* Actual */}
            <Area type="monotone" dataKey="actual" stroke={C.cv} strokeWidth={2.5} fill="url(#vo2AreaGrad)"
              dot={{ r: 4, fill: C.cv, stroke: "var(--surface-primary)", strokeWidth: 2 }} name="Measured" />
            {/* CI band */}
            {showProjection && (
              <Area type="monotone" dataKey="ci_high" stroke="none" fill="rgba(123,97,255,0.1)" name="CI High" />
            )}
            {/* Predicted */}
            {showProjection && (
              <Line type="monotone" dataKey="predicted" stroke={C.sleep} strokeWidth={2} strokeDasharray="6 3"
                dot={{ r: 3, fill: C.sleep, stroke: "var(--surface-primary)", strokeWidth: 2 }} name="AI Predicted" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {/* Trajectory Insights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { l: "Current", v: "47.2", u: "ml/kg/min" },
            { l: "Expected (P50)", v: "50.3", u: "by Dec" },
            { l: "Best Case (P90)", v: "52.1", u: "by Dec" },
            { l: "Conservative", v: "48.6", u: "by Dec" },
          ].map(m => (
            <div key={m.l} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{m.l}</div>
              <div className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{m.v}</div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.u}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HR Zone Distribution */}
      <ExpandableSection title="Heart Rate Zone Distribution" icon={Activity} defaultOpen={true} accentColor={C.cv}>
        <div className="grid grid-cols-12 gap-4 mt-2">
          <div className="col-span-12 lg:col-span-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={[{ v: 28 }, { v: 35 }, { v: 22 }, { v: 12 }, { v: 3 }]}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="v" startAngle={90} endAngle={-270}
                >
                  {["#4CAF50", "#2196F3", "#FF9800", "#F44336", "#9C27B0"].map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="col-span-12 lg:col-span-8 space-y-3">
            {[
              { zone: 1 as const, label: "Zone 1 — Recovery", bpm: "<131", pct: 28, delta: "+2%", hours: "12h 36m", status: "✓" },
              { zone: 2 as const, label: "Zone 2 — Endurance", bpm: "131–148", pct: 35, delta: "▼3%", hours: "15h 45m", status: "⚠" },
              { zone: 3 as const, label: "Zone 3 — Tempo", bpm: "149–157", pct: 22, delta: "▼1%", hours: "9h 54m", status: "✓" },
              { zone: 4 as const, label: "Zone 4 — Threshold", bpm: "158–169", pct: 12, delta: "+1%", hours: "5h 24m", status: "✓" },
              { zone: 5 as const, label: "Zone 5 — Anaerobic", bpm: ">170", pct: 3, delta: "+1%", hours: "1h 21m", status: "✓" },
            ].map(z => (
              <div key={z.zone} className="p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex justify-between items-center mb-1.5 text-xs font-bold" style={{ fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{z.label} ({z.bpm} bpm)</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{z.hours} · {z.delta}</span>
                </div>
                <ZoneBar pct={z.pct} zone={z.zone} />
                <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {z.pct}% total · {z.status}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Weekly zone stacked bar */}
        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Weekly Zone Trend — Last 12 Weeks</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyZoneData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
              <Bar dataKey="z1" stackId="a" fill="#4CAF50" name="Z1" />
              <Bar dataKey="z2" stackId="a" fill="#2196F3" name="Z2" />
              <Bar dataKey="z3" stackId="a" fill="#FF9800" name="Z3" />
              <Bar dataKey="z4" stackId="a" fill="#F44336" name="Z4" />
              <Bar dataKey="z5" stackId="a" fill="#9C27B0" name="Z5" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ExpandableSection>

      {/* CTL/ATL Chart */}
      <ExpandableSection title="Training Load & Recovery (42-day rolling)" icon={BarChart2} accentColor={C.trends}>
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={ctlAtlData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ctlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.optimal} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.optimal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
              <ReferenceLine y={0} stroke={C.border} strokeWidth={1} />
              <Area type="monotone" dataKey="ctl" stroke={C.optimal} strokeWidth={2} fill="url(#ctlGrad)" name="CTL (Fitness)" />
              <Line type="monotone" dataKey="atl" stroke={C.cv} strokeWidth={2} strokeDasharray="5 3" dot={false} name="ATL (Fatigue)" />
              <Line type="monotone" dataKey="tsb" stroke={C.sleep} strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="TSB (Balance)" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { label: "CTL (Fitness)", val: "72", color: C.optimal, note: "Building" },
              { label: "ATL (Fatigue)", val: "64", color: C.cv, note: "Current load" },
              { label: "TSB (Balance)", val: "-8", color: C.sleep, note: "Optimal zone" },
            ].map(m => (
              <div key={m.label} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
                <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{m.val}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{m.note}</div>
              </div>
            ))}
          </div>
        </div>
      </ExpandableSection>

      {/* Session Log */}
      <div className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Cardio Session Log</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Last 7 Sessions</div>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "6px 10px", color: "var(--text-tertiary)" }}>
              <Search size={12} /> Search sessions...
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Dur</th>
                <th>Dist</th>
                <th>Avg HR</th>
                <th>TSS</th>
                <th>Zones</th>
              </tr>
            </thead>
            <tbody>
              {sessionLog.map((s, i) => (
                <>
                  <tr key={i} onClick={() => setExpandedSession(expandedSession === i ? null : i)}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.date}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{s.type}</td>
                    <td>{s.dur}</td>
                    <td>{s.dist}</td>
                    <td style={{ color: s.avgHR > 155 ? C.cv : s.avgHR > 140 ? C.warning : C.optimal }}>{s.avgHR}</td>
                    <td>{s.tss}</td>
                    <td><ZoneMiniBar zones={s.zones} /></td>
                  </tr>
                  {expandedSession === i && (
                    <tr key={`exp-${i}`}>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="p-4 m-2 rounded-xl"
                          style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-active)" }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Session Detail — {s.date} · {s.type}</div>
                            <button onClick={() => setExpandedSession(null)} style={{ color: "var(--text-tertiary)" }}>
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {[
                              { l: "Duration", v: s.dur },
                              { l: "Distance", v: s.dist },
                              { l: "Avg HR", v: `${s.avgHR} bpm` },
                              { l: "TSS", v: String(s.tss) },
                            ].map(m => (
                              <div key={m.l} className="p-2 rounded-lg" style={{ background: "var(--surface-quaternary)" }}>
                                <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>{m.l}</div>
                                <div className="text-base font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs p-3 rounded-xl" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
                            <span style={{ color: C.sleep }}>🧠 AI: </span>
                            Pacing consistent through rep 4, minor fade at rep 5 (+5 sec/km). HR drift indicates incomplete recovery between later intervals. Recommendation: extend recovery intervals by 30s or cap at 4 reps until HRR improves. Running economy trending positively → biomechanical efficiency improving.
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Insight */}
      {!dismissInsight && (
        <AIInsightCard title="VO₂ Max Acceleration Detected" confidence={87} onDismiss={() => setDismissInsight(true)}>
          Your VO₂ Max improvement is accelerating. The last 30 days show <strong style={{ color: C.optimal }}>+0.8 ml/kg/min</strong> vs +0.4 in the previous period. This correlates with increased Zone 2 volume (+22%), improved sleep consistency (bedtime variance ↓18 min), and higher AI protocol compliance (67% → 80%). At current trajectory, you reach <strong style={{ color: C.cv }}>50.0 ml/kg/min by December</strong> — 6 weeks ahead of conservative estimate.
          <div className="mt-3 space-y-1">
            {[
              "• Maintain Zone 2 volume — primary driver",
              "• HRV trend positive — continue current recovery",
              "• Consider: add VO₂ Max interval if plateau detected",
              "• Watch: TSB approaching -10, monitor fatigue",
            ].map(a => <div key={a} className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{a}</div>)}
          </div>
        </AIInsightCard>
      )}
    </div>
  );
}

// ─── Tab: Sleep Architecture ─────────────────────────────────────
function SleepTab({ protocolApplied, setProtocolApplied }: { protocolApplied: boolean; setProtocolApplied: (v: boolean) => void }) {
  return (
    <div className="space-y-5">
      {/* Hero: Sleep Score + Drift */}
      <div className="grid grid-cols-12 gap-4">
        {/* Sleep Score */}
        <div className="col-span-12 lg:col-span-5 card-surface p-6" style={{ borderRadius: "var(--radius-xl)", boxShadow: "0 0 30px rgba(123,97,255,0.12)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Sleep Score · Last Night</div>
          <div className="flex flex-col items-center mb-4">
            <SleepScoreDonut score={84} />
          </div>
          <div className="space-y-2">
            {[
              { label: "Duration", val: "7h 42m", score: 92 },
              { label: "Deep Sleep", val: "1h 48m", score: 90 },
              { label: "REM Sleep", val: "2h 12m", score: 88 },
              { label: "Efficiency", val: "94%", score: 94 },
              { label: "Latency", val: "8 min", score: 100 },
              { label: "Consistency", val: "72%", score: 72 },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="text-xs w-24 shrink-0" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{c.label}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: c.score >= 85 ? C.optimal : c.score >= 70 ? C.sleep : C.warning }}
                    initial={{ width: 0 }} animate={{ width: `${c.score}%` }} transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }} />
                </div>
                <span className="text-xs w-14 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{c.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chronotype Drift */}
        <div className="col-span-12 lg:col-span-7 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Chronotype Drift Analysis</div>
            <span className="protocol-badge warning">⚠ +47 min drift</span>
          </div>
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sleep Onset — Last 14 Nights</div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={sleepOnsetData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="onsetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.sleep} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.sleep} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} interval={2} />
              <YAxis domain={[22, 26]} axisLine={false} tickLine={false}
                tickFormatter={v => v > 24 ? `${Math.round((v - 24) * 60)}m AM` : `${24 - v}h PM`}
                tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
              <ReferenceLine y={23.25} stroke={protocolApplied ? C.optimal : C.sleep} strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "AI Lock Target", fill: C.sleep, fontSize: 9 }} />
              <Area type="monotone" dataKey="onset" stroke={C.sleep} strokeWidth={2} fill="url(#onsetGrad)"
                dot={(p: any) => <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill={p.payload.onset > 24 ? C.cv : C.sleep} stroke="var(--surface-primary)" strokeWidth={1.5} />}
                name="Sleep Onset" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(255,23,68,0.05)", border: "1px solid rgba(255,23,68,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} style={{ color: C.critical }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.critical }}>Drift Status: Approaching Danger Zone</span>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Sleep onset drifted +47 min over 14 days (11:00 PM → 1:24 AM). Deep sleep peaks shifting laterally. Circadian misalignment risk rising. Protocol recommended.
            </p>
            {!protocolApplied ? (
              <button onClick={() => setProtocolApplied(true)}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all hover:opacity-90"
                style={{ background: C.sleep, color: "#fff" }}>
                Apply Phase Advance Protocol
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: C.optimal }}>
                <Check size={12} /> Phase Advance Protocol Active — Day 1/5
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sleep Stage Breakdown */}
      <ExpandableSection title="Sleep Stage Distribution — 7 Nights" icon={Moon} defaultOpen={true} accentColor={C.sleep}>
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sleepStageData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="night" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
              <Bar dataKey="deep" stackId="a" fill="#1a1049" name="Deep" />
              <Bar dataKey="rem" stackId="a" fill={C.sleep} name="REM" />
              <Bar dataKey="light" stackId="a" fill="#4B3F9E" name="Light" />
              <Bar dataKey="awake" stackId="a" fill={C.border} name="Awake" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-4 gap-3 mt-3">
            {[
              { label: "Deep Sleep", val: "1h 48m", pct: "23%", color: "#1a1049", target: "20-25%" },
              { label: "REM Sleep", val: "2h 12m", pct: "29%", color: C.sleep, target: "20-25%" },
              { label: "Light Sleep", val: "3h 24m", pct: "44%", color: "#4B3F9E", target: "45-55%" },
              { label: "Awake", val: "18 min", pct: "4%", color: C.border, target: "<5%" },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
                </div>
                <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{s.val}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.pct} · target {s.target}</div>
              </div>
            ))}
          </div>
        </div>
      </ExpandableSection>

      {/* Sleep Debt & Recovery */}
      <ExpandableSection title="Sleep Debt & Recovery Tracking" icon={Clock} accentColor={C.warning}>
        <div className="grid grid-cols-3 gap-4 mt-2">
          {[
            { label: "Sleep Debt", val: "-1.2h", color: C.warning, note: "Accumulated this week" },
            { label: "Avg Duration", val: "7.4h", color: C.sleep, note: "vs 8h target" },
            { label: "Consistency", val: "72%", color: C.trends, note: "Bedtime variance ±42min" },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{m.val}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{m.note}</div>
            </div>
          ))}
        </div>
      </ExpandableSection>

      {/* AI Sleep Insight */}
      <AIInsightCard title="Circadian Phase Delay Detected" confidence={91}>
        Sleep onset has drifted <strong style={{ color: C.warning }}>+47 minutes</strong> over 14 days. Deep sleep latency is increasing, and REM pressure is building. Root cause: consistent late light exposure and irregular meal timing. The Phase Advance Protocol (5-day gradual advance of 10 min/night) has a 94% success rate in your chronotype cohort.
        <div className="mt-3 space-y-1">
          {[
            "• Tonight: Target bedtime 1:15 AM → 1:00 AM",
            "• Shift final meal to 7:30 PM (90 min earlier)",
            "• Blue light block: 10:00 PM start",
            "• Morning anchor: alarm 7:30 AM regardless of sleep time",
          ].map(a => <div key={a} className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{a}</div>)}
        </div>
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Fuel (Nutrition) ───────────────────────────────────────
function FuelTab() {
  const totalKcal = mealLog.reduce((s, m) => s + m.kcal, 0);
  const targetKcal = 2800;
  const [selectedMeal, setSelectedMeal] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {/* Macro Overview */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Today · Dynamic Targets</div>

          <div className="flex items-end gap-2 mb-4">
            <span className="text-4xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{totalKcal}</span>
            <span className="text-sm mb-1.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>/ {targetKcal} kcal</span>
          </div>

          {/* Calorie progress */}
          <div className="mb-5">
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
              <motion.div className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${C.nutrition}, ${C.trends})` }}
                initial={{ width: 0 }} animate={{ width: `${Math.min(totalKcal / targetKcal * 100, 100)}%` }}
                transition={{ duration: 1, ease: [0, 0, 0.2, 1] }} />
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              <span>{totalKcal} eaten</span><span>{targetKcal - totalKcal} remaining</span>
            </div>
          </div>

          <div className="space-y-3">
            {macroData.map(m => (
              <div key={m.name}>
                <div className="flex justify-between text-xs mb-1.5 font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{m.name}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{m.value}g / {m.target}g</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: m.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(m.value / m.target * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }} />
                </div>
              </div>
            ))}
          </div>

          {/* AI Rollover Banner */}
          <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(255,140,66,0.08)", border: "1px solid rgba(255,140,66,0.25)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.kinematic }}>🔥 AI Macro Rollover Active</div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Yesterday's -380 kcal deficit → +60g Carbs added to today's pre-workout window to prevent catabolism.
            </div>
          </div>
        </div>

        {/* Macro Chart */}
        <div className="col-span-12 lg:col-span-3 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Macro Split</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={macroData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" nameKey="name">
                {macroData.map((m, i) => <Cell key={i} fill={m.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--surface-floating)", border: "1px solid var(--border-active)", borderRadius: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {macroData.map(m => (
              <div key={m.name} className="flex items-center gap-2 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: m.color }} />
                <span style={{ color: "var(--text-secondary)" }}>{m.name}</span>
                <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>{Math.round(m.value / macroData.reduce((s, x) => s + x.value, 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Micronutrients */}
        <div className="col-span-12 lg:col-span-4 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Micronutrient Status</div>
          <div className="space-y-3">
            {[
              { name: "Vitamin D", val: 78, color: C.warning, status: "Low" },
              { name: "Omega-3", val: 115, color: C.nutrition, status: "Optimal" },
              { name: "Magnesium", val: 92, color: C.sleep, status: "Good" },
              { name: "Zinc", val: 87, color: C.trends, status: "Good" },
              { name: "B12", val: 140, color: C.optimal, status: "Excess" },
              { name: "Iron", val: 65, color: C.cv, status: "Moderate" },
            ].map(m => (
              <div key={m.name}>
                <div className="flex justify-between text-xs mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{m.name}</span>
                  <span style={{ color: m.val < 80 ? C.warning : m.val > 110 ? C.sleep : C.optimal, fontWeight: 700 }}>{m.val}% · {m.status}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: m.color }}
                    initial={{ width: 0 }} animate={{ width: `${Math.min(m.val, 100)}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Meal Log */}
      <div className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Intake Log</div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Today · {mealLog.length} meals logged</div>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {mealLog.map((meal, i) => (
            <div key={i}>
              <button
                className="w-full p-4 flex items-center gap-4 transition-colors hover:bg-[var(--surface-tertiary)] text-left"
                onClick={() => setSelectedMeal(selectedMeal === i ? null : i)}
              >
                <div className="text-xs font-bold w-14 shrink-0" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{meal.time}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{meal.name}</div>
                  <div className="flex gap-3 mt-1 text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                    <span style={{ color: C.cv }}>{meal.p}g P</span>
                    <span style={{ color: C.nutrition }}>{meal.c}g C</span>
                    <span style={{ color: C.warning }}>{meal.f}g F</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{meal.kcal}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>kcal</div>
                </div>
                <ChevronDown size={14} style={{ color: "var(--text-tertiary)", transform: selectedMeal === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              <AnimatePresence>
                {selectedMeal === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mb-4 p-3 rounded-xl text-xs leading-relaxed"
                      style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      <span style={{ color: C.sleep }}>🧠 AI: </span>{meal.ai}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <AIInsightCard title="Nutrition Optimization — Today" confidence={79}>
        Total intake on track at <strong style={{ color: C.nutrition }}>1,830 kcal</strong>. Protein hitting 87% of target — add a 25g protein snack (e.g., cottage cheese) pre-bed to hit leucine threshold for overnight MPS. Omega-3 surplus from salmon dinner is ideal for tonight's HRV and anti-inflammatory signaling. Vitamin D remains low — consider 2000 IU supplementation.
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Kinematic Load ─────────────────────────────────────────
function KinematicTab() {
  const [overrideStatus, setOverrideStatus] = useState<"pending" | "approved" | "rejected">("pending");

  return (
    <div className="space-y-5">
      {/* Override Widget */}
      <AnimatePresence>
        {overrideStatus === "pending" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
            className="relative overflow-hidden p-6"
            style={{ background: "var(--surface-secondary)", border: `1px solid rgba(255,23,68,0.3)`, borderRadius: "var(--radius-xl)", boxShadow: "0 0 30px rgba(255,23,68,0.08)" }}
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <AlertTriangle size={160} style={{ color: C.critical }} />
            </div>
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,23,68,0.15)", border: "1px solid rgba(255,23,68,0.3)" }}>
                <AlertTriangle size={18} style={{ color: C.critical }} className="animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.critical }}>Algorithmic Auto-Regulation Triggered</div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
                  Anatomical strain map detects critical Lower Back and CNS fatigue (Score: 0.9/1.0) from Monday's heavy pull session. Executing planned Heavy Deadlifts today carries elevated injury risk.
                </p>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="p-4 rounded-xl relative overflow-hidden" style={{ background: "rgba(255,23,68,0.05)", border: "1px solid rgba(255,23,68,0.15)" }}>
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                      <X size={80} style={{ color: C.critical }} />
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Planned Protocol</div>
                    <div className="text-xl font-bold line-through" style={{ color: "var(--text-tertiary)" }}>Deadlift 4×5 @ 140kg</div>
                    <div className="text-xs mt-2" style={{ color: C.critical, fontFamily: "var(--font-mono)" }}>High CNS demand · 72h recovery req.</div>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.2)" }}>
                    <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.optimal }}>AI Substitution</div>
                    <div className="text-xl font-bold" style={{ color: C.optimal }}>Romanian DL 3×10 @ 90kg</div>
                    <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Active recovery · improved blood flow</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOverrideStatus("approved")}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:opacity-90"
                    style={{ background: C.optimal, color: "#000" }}>
                    <Check size={14} /> Approve Substitution
                  </button>
                  <button onClick={() => setOverrideStatus("rejected")}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-white/5"
                    style={{ border: "1px solid var(--border-active)", color: "var(--text-secondary)" }}>
                    Force Original Plan
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {overrideStatus !== "pending" && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 p-4 rounded-xl"
          style={{ background: overrideStatus === "approved" ? "rgba(0,230,118,0.08)" : "rgba(255,23,68,0.08)", border: `1px solid ${overrideStatus === "approved" ? "rgba(0,230,118,0.2)" : "rgba(255,23,68,0.2)"}`, borderRadius: "var(--radius-lg)" }}>
          {overrideStatus === "approved" ? <Check size={16} style={{ color: C.optimal }} /> : <X size={16} style={{ color: C.critical }} />}
          <span className="text-sm font-semibold" style={{ color: overrideStatus === "approved" ? C.optimal : C.critical }}>
            {overrideStatus === "approved" ? "AI Substitution Active — Romanian Deadlift 3×10 @ 90kg" : "Manual Override — Original plan maintained"}
          </span>
        </motion.div>
      )}

      {/* Strain Map + Protocol */}
      <div className="grid grid-cols-12 gap-4">
        {/* Anatomical Map (visual representation) */}
        <div className="col-span-12 lg:col-span-5 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Live Anatomical Strain Map</div>
          {/* SVG body placeholder with colored zones */}
          <div className="relative mx-auto" style={{ width: 180, height: 320 }}>
            <svg width="180" height="320" viewBox="0 0 180 320" style={{ fontFamily: "var(--font-mono)" }}>
              {/* Body outline */}
              <ellipse cx="90" cy="40" rx="30" ry="32" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="60" y="70" width="60" height="90" rx="10" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="20" y="72" width="36" height="80" rx="10" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="124" y="72" width="36" height="80" rx="10" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="65" y="158" width="22" height="90" rx="8" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="93" y="158" width="22" height="90" rx="8" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="65" y="246" width="22" height="60" rx="6" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              <rect x="93" y="246" width="22" height="60" rx="6" fill="#1A1A24" stroke="#3A3A52" strokeWidth="1.5" />
              {/* Critical zones — lower back */}
              <rect x="62" y="130" width="56" height="28" rx="6" fill={`${C.critical}40`} stroke={C.critical} strokeWidth="1.5" opacity="0.9" />
              <text x="90" y="148" textAnchor="middle" fontSize="8" fill={C.critical} fontWeight="700">CRITICAL 0.9</text>
              {/* High zones — traps/upper back */}
              <rect x="62" y="74" width="56" height="30" rx="6" fill={`${C.cv}30`} stroke={C.cv} strokeWidth="1" opacity="0.8" />
              <text x="90" y="93" textAnchor="middle" fontSize="7" fill={C.cv} fontWeight="700">HIGH 0.7</text>
              {/* Moderate — hamstrings */}
              <rect x="65" y="192" width="50" height="28" rx="5" fill={`${C.warning}25`} stroke={C.warning} strokeWidth="1" opacity="0.8" />
              <text x="90" y="210" textAnchor="middle" fontSize="7" fill={C.warning} fontWeight="700">MOD 0.5</text>
              {/* Mild — chest/triceps */}
              <rect x="62" y="105" width="56" height="28" rx="5" fill={`${C.nutrition}15`} stroke={C.nutrition} strokeWidth="1" opacity="0.6" />
              <text x="90" y="123" textAnchor="middle" fontSize="7" fill={C.nutrition} fontWeight="700">MILD 0.3</text>
            </svg>
          </div>
          <div className="space-y-2 mt-2">
            {[
              { muscle: "Lower Back", score: 0.9, color: C.critical, label: "Critical" },
              { muscle: "Trapezius / Upper Back", score: 0.7, color: C.cv, label: "High" },
              { muscle: "Hamstrings", score: 0.5, color: C.warning, label: "Moderate" },
              { muscle: "Chest / Triceps", score: 0.3, color: C.nutrition, label: "Mild" },
            ].map(m => (
              <div key={m.muscle} className="flex items-center gap-2">
                <span className="text-xs w-36 shrink-0" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{m.muscle}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <div className="h-full rounded-full" style={{ width: `${m.score * 100}%`, background: m.color }} />
                </div>
                <span className="text-xs w-16 text-right font-bold" style={{ color: m.color, fontFamily: "var(--font-mono)" }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Executable Protocol */}
        <div className="col-span-12 lg:col-span-7 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Executable Protocol · Today · Heavy Pull</div>
          <div className="space-y-3">
            {[
              {
                name: overrideStatus === "approved" ? "Romanian Deadlift" : "Deadlift (Conventional)",
                sets: overrideStatus === "approved" ? "3×10 @ 90kg" : "4×5 @ 140kg",
                modified: overrideStatus === "approved",
                note: overrideStatus === "approved" ? "AI substitution — lower back sparing" : "Original plan",
              },
              { name: "Weighted Pullups", sets: "3×8 @ +20kg", modified: false, note: "Unchanged" },
              { name: "Barbell Row", sets: "4×8 @ 80kg", modified: false, note: "Unchanged" },
              { name: "Face Pulls", sets: "3×15 @ 25kg", modified: false, note: "Added by AI — rotator cuff health" },
              { name: "Farmer's Carry", sets: "4×30m @ 40kg/hand", modified: false, note: "Grip & core finisher" },
            ].map((ex, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: ex.modified ? "rgba(0,230,118,0.05)" : "var(--surface-tertiary)", border: `1px solid ${ex.modified ? "rgba(0,230,118,0.2)" : "var(--border-subtle)"}` }}>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{ex.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{ex.note}</div>
                </div>
                <div className="text-sm font-black text-right" style={{ fontFamily: "var(--font-mono)", color: ex.modified ? C.optimal : "var(--text-secondary)", whiteSpace: "nowrap" }}>{ex.sets}</div>
                {ex.modified && <Check size={14} style={{ color: C.optimal, shrink: 0 }} />}
              </div>
            ))}
          </div>

          {/* Weekly Volume */}
          <div className="mt-4 p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>Weekly Volume by Muscle Group</div>
            <div className="space-y-2">
              {[
                { muscle: "Back", sets: 18, target: 16, color: C.cv },
                { muscle: "Chest", sets: 12, target: 14, color: C.sleep },
                { muscle: "Legs", sets: 14, target: 16, color: C.nutrition },
                { muscle: "Shoulders", sets: 10, target: 12, color: C.warning },
                { muscle: "Arms", sets: 8, target: 10, color: C.trends },
              ].map(m => (
                <div key={m.muscle} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{m.muscle}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(m.sets / 20 * 100, 100)}%`, background: m.color }} />
                  </div>
                  <span className="w-16 text-right" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.sets}/{m.target} sets</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AIInsightCard title="Kinematic Load Assessment" confidence={94}>
        Lower back strain score at 0.9/1.0 from Monday's 140kg deadlift session. Neural fatigue indicators (increased RPE, altered recruitment patterns) suggest 48–72h of mechanical deloading. Romanian deadlift preserves posterior chain stimulus while reducing spinal compressive forces by ~40%. Expected Lower Back score reduction: 0.9 → 0.6 by tomorrow.
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Trends ─────────────────────────────────────────────────
function TrendsTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-12 gap-4">
        {[
          { label: "VO₂ Max", val: "47.2", unit: "ml/kg/min", delta: +5.1, color: C.cv, sparkData: [42, 43, 44.5, 45.8, 46.2, 46.8, 47.2] },
          { label: "Resting HR", val: "52", unit: "bpm", delta: -4, color: C.trends, sparkData: [58, 57, 56, 55, 54, 53, 52] },
          { label: "HRV Baseline", val: "45", unit: "ms", delta: +6, color: C.optimal, sparkData: [38, 39, 40, 41, 42, 44, 45] },
          { label: "Sleep Score Avg", val: "79", unit: "/100", delta: +8, color: C.sleep, sparkData: [68, 70, 72, 74, 76, 78, 79] },
          { label: "Weekly Volume", val: "6.2", unit: "hrs", delta: +1.1, color: C.kinematic, sparkData: [4.5, 4.8, 5.2, 5.6, 5.8, 6.0, 6.2] },
          { label: "Body Weight", val: "82.4", unit: "kg", delta: -1.2, color: C.nutrition, sparkData: [83.8, 83.6, 83.4, 83.2, 82.9, 82.6, 82.4] },
        ].map(m => (
          <div key={m.label} className="col-span-12 sm:col-span-6 lg:col-span-4 card-surface p-4" style={{ borderRadius: "var(--radius-lg)" }}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <DeltaBadge value={m.delta} unit={m.unit.includes("bpm") ? " bpm" : m.unit.includes("ms") ? " ms" : ""} />
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</span>
              <span className="text-xs pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.unit}</span>
            </div>
            <div className="mt-3">
              <MiniSparkline data={m.sparkData} color={m.color} height={40} />
            </div>
          </div>
        ))}
      </div>

      {/* Correlation Matrix */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Key Metric Correlations — 30 Day</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { a: "Zone 2 Volume", b: "VO₂ Max", corr: 0.87, dir: "+" },
            { a: "Sleep Duration", b: "Next-day HRV", corr: 0.74, dir: "+" },
            { a: "Resting HR", b: "Recovery Score", corr: -0.81, dir: "-" },
            { a: "TSB (Balance)", b: "Performance", corr: 0.69, dir: "+" },
            { a: "Sleep Consistency", b: "Mood Score", corr: 0.72, dir: "+" },
            { a: "Training Stress", b: "Fatigue", corr: 0.93, dir: "+" },
          ].map(c => (
            <div key={`${c.a}-${c.b}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {c.a} → {c.b}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <div className="h-full rounded-full" style={{ width: `${c.corr * 100}%`, background: c.dir === "+" ? C.optimal : C.cv }} />
                </div>
                <span className="text-xs font-bold w-10 text-right" style={{ fontFamily: "var(--font-mono)", color: c.dir === "+" ? C.optimal : C.cv }}>
                  {c.dir === "+" ? "r=" : "r=-"}{Math.abs(c.corr).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AIInsightCard title="30-Day Trend Summary" confidence={85}>
        Strong positive momentum across all key biomarkers. VO₂ Max trajectory is accelerating (+0.8 this month vs +0.4 prior). Sleep quality improvements are driving HRV gains — the correlation (r=0.74) is statistically robust. Body composition improving: weight down 1.2kg with performance metrics up, suggesting fat loss with lean mass retention.
      </AIInsightCard>
    </div>
  );
}

// ─── AI Copilot Bar ──────────────────────────────────────────────
function CopilotBar() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(copilotMessages);
  const streamRef = useRef<HTMLDivElement>(null);

  const send = useCallback(() => {
    if (!input.trim()) return;
    setMessages(prev => [
      ...prev,
      { time: new Date().toLocaleTimeString("en-GB"), type: "insight", text: `Query: "${input}" — Processing...` }
    ]);
    setInput("");
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [input]);

  return (
    <div className="copilot-bar" style={{ left: 250 }}>
      {/* Collapsed bar */}
      {!expanded && (
        <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpanded(true)}>
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
              <Brain size={12} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>Copilot</span>
            <span className="text-xs ai-shimmer ml-2">Your VO₂ Max is trending up +0.8 this month — ahead of schedule.</span>
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
            initial={{ height: 0 }} animate={{ height: 360 }} exit={{ height: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
                  <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full flex items-center justify-center" style={{ background: C.optimal }}>
                    <div className="w-1 h-1 rounded-full bg-black" />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>LangGraph Copilot</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Health agent active · real-time analysis</div>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                <X size={14} />
              </button>
            </div>

            {/* Stream */}
            <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-3 copilot-stream">
              {messages.map((m, i) => (
                <div key={i} className={`event-${m.type}`}>
                  <span className="timestamp">[{m.time}]</span>
                  <span className={`text-xs ${m.type === "insight" ? "font-semibold" : ""}`} style={{ color: m.type === "insight" ? C.optimal : m.type === "alert" ? C.warning : "var(--text-tertiary)" }}>
                    {m.type.charAt(0).toUpperCase() + m.type.slice(1)}:
                  </span>
                  {" "}{m.text}
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="px-5 py-2 flex gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {[
                { icon: Settings, label: "Engine Parameters" },
                { icon: FileText, label: "Weekly Report" },
                { icon: Search, label: "Query Data" },
              ].map(a => (
                <button key={a.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/5"
                  style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <a.icon size={11} /> {a.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 py-3 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Ask: How has my sleep changed since the circadian protocol?"
                className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none transition-all"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-active)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={send}
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
function SystemBanner() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-4" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>System Status</span>
          </div>
          <div className="flex items-center gap-3">
            {[
              { label: "CV", status: "optimal" as const },
              { label: "Sleep", status: "warning" as const },
              { label: "Nutrition", status: "optimal" as const },
              { label: "Recovery", status: "optimal" as const },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <StatusDot status={s.status} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--text-tertiary)" }}>Readiness: <span style={{ color: C.optimal, fontWeight: 700 }}>72/100</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Protocols: <span style={{ color: C.sleep, fontWeight: 700 }}>2 active</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Alerts: <span style={{ color: C.warning, fontWeight: 700 }}>1</span></span>
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
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,214,0,0.05)", border: "1px solid rgba(255,214,0,0.2)" }}>
                <AlertTriangle size={14} style={{ color: C.warning, marginTop: 2 }} />
                <div className="flex-1">
                  <div className="text-xs font-bold mb-0.5" style={{ color: C.warning }}>⚠ SLEEP DRIFT DETECTED</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    Sleep onset moving +47 min over 14 days. Circadian misalignment approaching danger threshold. Phase advance protocol recommended.
                  </div>
                </div>
                <button className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 hover:opacity-80 transition-opacity" style={{ background: C.sleep, color: "#fff" }}>
                  View Details
                </button>
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
  const [aiAccepted, setAiAccepted] = useState(false);
  const [protocolApplied, setProtocolApplied] = useState(false);

  const tabs = [
    { id: "cardio", label: "Cardiovascular", icon: Heart, color: C.cv },
    { id: "sleep", label: "Sleep", icon: Moon, color: C.sleep },
    { id: "fuel", label: "Fuel", icon: Flame, color: C.nutrition },
    { id: "kinematic", label: "Kinematic", icon: Dumbbell, color: C.kinematic },
    { id: "trends", label: "Trends", icon: TrendingUp, color: C.trends },
  ];

  const tabVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0, 0, 0.2, 1] } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
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
              Autonomous Agentic Health Command Center · Last sync: 2 min ago
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
        <SystemBanner />

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

      {/* Tab Content */}
      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible" exit="exit">
            {activeTab === "cardio" && <CardioTab aiAccepted={aiAccepted} setAiAccepted={setAiAccepted} />}
            {activeTab === "sleep" && <SleepTab protocolApplied={protocolApplied} setProtocolApplied={setProtocolApplied} />}
            {activeTab === "fuel" && <FuelTab />}
            {activeTab === "kinematic" && <KinematicTab />}
            {activeTab === "trends" && <TrendsTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* AI Copilot Bar */}
      <CopilotBar />
    </div>
  );
}
