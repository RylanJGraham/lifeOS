"use client";

import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { TemplatesTab } from "./TemplatesTab";
import FuelTab from "../components/health/FuelTab";
import { createBrowserClient } from "@supabase/ssr";
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

// ─── Tab: Cardiovascular Hub ─────────────────────────────────────

// ACWR data (Acute:Chronic Workload Ratio — 7 weeks)
const acwrData = [
  { week: "W1", acwr: 0.91 }, { week: "W2", acwr: 1.05 }, { week: "W3", acwr: 1.22 },
  { week: "W4", acwr: 0.88 }, { week: "W5", acwr: 1.10 }, { week: "W6", acwr: 1.18 },
  { week: "W7", acwr: 1.15 },
];

const hrPolarData = [
  { zone: "Z1 Easy",    pct: 12, target: 40, color: "#10b981" },
  { zone: "Z2 Aerobic", pct: 28, target: 40, color: "#3b82f6" },
  { zone: "Z3 Tempo",   pct: 35, target: 10, color: "#f59e0b" },
  { zone: "Z4 Thresh",  pct: 20, target: 8,  color: "#ef4444" },
  { zone: "Z5 VO₂",    pct: 5,  target: 2,  color: "#8b5cf6" },
];

function CardioTab({ latestMetrics, timeFilter }: { latestMetrics: any, timeFilter: string }) {
  if (!latestMetrics || (!latestMetrics.hrv && !latestMetrics.resting_heart_rate)) {
    return <EmptyState message="No cardiovascular telemetry found. Please upload your health metrics via Telegram." icon={Heart} />;
  }

  const currentHRV = latestMetrics.hrv ? String(latestMetrics.hrv) : "-";
  const currentRHR = latestMetrics.resting_heart_rate ? String(latestMetrics.resting_heart_rate) : "-";

  const baseAcwrData = [
    { week: "W-6", acute: 1.1, chronic: 1.0 },
    { week: "W-5", acute: 1.4, chronic: 1.05 },
    { week: "W-4", acute: 0.9, chronic: 1.1 },
    { week: "W-3", acute: 1.2, chronic: 1.12 },
    { week: "W-2", acute: 1.5, chronic: 1.15 },
    { week: "W-1", acute: 0.8, chronic: 1.18 },
    { week: "Now", acute: 1.3, chronic: 1.15 },
  ];
  
  const acwrData = timeFilter === "day" || timeFilter === "week" ? baseAcwrData.slice(-2) :
                   timeFilter === "month" ? baseAcwrData.slice(-4) :
                   baseAcwrData;

  return (
    <div className="space-y-5">
      {/* Readiness KPIs */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Readiness &amp; Strain Summary</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "HRV", val: currentHRV, unit: "ms",  delta: "+2",   color: C.nutrition },
            { label: "Resting HR", val: currentRHR, unit: "bpm", delta: "−1",  color: C.trends   },
            { label: "Sleep", val: latestMetrics.sleep_duration_minutes ? Math.floor(latestMetrics.sleep_duration_minutes/60) + "h" : "7h", unit: "", delta: "+0.3h", color: C.optimal },
            { label: "Resp. Rate", val: latestMetrics.respiratory_rate ?? "14.2", unit: "/min", delta: "stable", color: C.kinematic },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl flex flex-col justify-between" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</span>
                  <span className="text-xs pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.unit}</span>
                </div>
                <span className="text-[10px] font-bold" style={{ color: m.delta.startsWith("+") ? C.optimal : m.delta.startsWith("−") ? C.warning : C.textTertiary }}>{m.delta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ACWR Training Load */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Acute:Chronic Workload Ratio (ACWR)</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Current ACWR: <span className="font-bold" style={{ color: C.optimal }}>1.15</span> — Optimal zone (0.8 – 1.3). Injury risk: LOW.</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>LOW RISK</div>
        </div>
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={acwrData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="acwrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.nutrition} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={C.nutrition} stopOpacity={0}/>
                </linearGradient>
              </defs>
              {/* Optimal zone band */}
              <ReferenceLine y={1.3} stroke={C.warning} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "1.3 Upper", position: "right", fontSize: 9, fill: C.warning }} />
              <ReferenceLine y={0.8} stroke={C.trends} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "0.8 Lower", position: "right", fontSize: 9, fill: C.trends }} />
              <XAxis dataKey="week" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0.5, 1.6]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => v.toFixed(2)} contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="acwr" stroke={C.nutrition} strokeWidth={2.5} fill="url(#acwrGrad)" dot={{ r: 4, fill: C.nutrition, stroke: "#fff", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(91,66,232,0.04)", border: "1px solid rgba(91,66,232,0.12)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <Brain size={11} className="inline mr-1" style={{ color: "var(--accent-sleep)" }} />
            <span className="font-bold" style={{ color: "var(--accent-sleep)" }}>AI Recommendation: </span>
            Maintain current load for 1 more week then deload (Week 4 of mesocycle). Chest volume ↑40% this week — monitor recovery.
          </span>
        </div>
      </div>

      {/* HR Zone Polarization */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>HR Zone Distribution (Last 30 Days)</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Current: 40% Easy / 35% Moderate / 25% Hard — Optimal polarized: 80%/20%</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }}>⚠ NOT POLARIZED</div>
        </div>
        <div className="space-y-3">
          {hrPolarData.map(z => {
            const isOver = z.pct > z.target * 1.5;
            const barColor = isOver ? C.warning : z.color;
            return (
              <div key={z.zone}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: z.color }} />
                    <span className="font-bold" style={{ color: "var(--text-secondary)" }}>{z.zone}</span>
                    {isOver && <span className="text-[10px] font-bold" style={{ color: C.warning }}>⚠ High</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ color: "var(--text-tertiary)" }}>Target {z.target}%</span>
                    <span className="font-black font-mono" style={{ color: isOver ? C.warning : z.color }}>{z.pct}%</span>
                  </div>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: barColor }}
                    initial={{ width: 0 }} animate={{ width: `${z.pct}%` }}
                    transition={{ duration: 0.8, ease: [0,0,0.2,1] }} />
                  {/* Target marker */}
                  <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${z.target}%`, background: "rgba(0,0,0,0.35)" }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.2)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            🟡 Too much Zone 3 (tempo) relative to the polarized model. Shift 2–3 moderate sessions/week to easy Z2 or high-intensity Z4–5 to maximize VO₂ adaptations.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Sleep Architecture ─────────────────────────────────────
function SleepTab({ latestMetrics, timeFilter }: { latestMetrics: any, timeFilter: string }) {
  if (!latestMetrics || !latestMetrics.sleep_duration_minutes) {
    return <EmptyState message="No sleep telemetry found. Connect Apple Health or Oura via Telegram." icon={Moon} />;
  }

  const baseSleepDebtData = [
    { day: "Mon", debt: 0.5, accumulated: 0.5 },
    { day: "Tue", debt: 1.2, accumulated: 1.7 },
    { day: "Wed", debt: -0.2, accumulated: 1.5 },
    { day: "Thu", debt: 2.0, accumulated: 3.5 },
    { day: "Fri", debt: 0.8, accumulated: 4.3 },
    { day: "Sat", debt: -1.5, accumulated: 2.8 },
    { day: "Sun", debt: 1.0, accumulated: 3.8 },
  ];
  
  const sleepDebtData = timeFilter === "day" ? baseSleepDebtData.slice(-1) :
                        timeFilter === "week" ? baseSleepDebtData.slice(-3) :
                        baseSleepDebtData;

  const totalMin = latestMetrics.sleep_duration_minutes ?? 468;
  const deepMin  = latestMetrics.sleep_deep_minutes ?? 126;
  const remMin   = latestMetrics.sleep_rem_minutes  ?? 108;
  const lightMin = Math.max(0, totalMin - deepMin - remMin);
  const awakeMin = Math.max(0, totalMin - deepMin - remMin - lightMin);

  const fmt = (m: number) => `${Math.floor(m/60)}h ${m%60}m`;

  // Sleep debt: compare to 8h target over 7 days (mock 7-day history)
  const sleepDebtHours = 2.3; // mock
  const debtPercent = Math.min(100, (sleepDebtHours / 8) * 100);

  const stages = [
    { label: "Deep Sleep",  min: deepMin,  pct: Math.round(deepMin/totalMin*100),  color: "#5B42E8", target: 20 },
    { label: "REM Sleep",   min: remMin,   pct: Math.round(remMin/totalMin*100),   color: "#E03535", target: 20 },
    { label: "Light Sleep", min: lightMin, pct: Math.round(lightMin/totalMin*100), color: "#3b82f6", target: 50 },
    { label: "Awake",       min: awakeMin, pct: Math.round(awakeMin/totalMin*100), color: "#94A3B8", target: 5  },
  ];

  return (
    <div className="space-y-5">
      {/* Header metrics */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Sleep Architecture</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Sleep",  val: fmt(totalMin), delta: "+0.3h", color: C.sleep    },
            { label: "Deep Sleep",   val: fmt(deepMin),  delta: "+0.4h", color: "#5B42E8" },
            { label: "REM Sleep",    val: fmt(remMin),   delta: "−0.1h", color: C.cv       },
            { label: "Efficiency",   val: "92%",         delta: "+2%",   color: C.optimal  },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
              <div className="text-[10px] font-bold mt-1" style={{ color: m.delta.startsWith("+") ? C.optimal : C.warning }}>{m.delta}</div>
            </div>
          ))}
        </div>

        {/* Stage breakdown bars */}
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>Stage Breakdown</div>
        <div className="space-y-3">
          {stages.map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: "var(--text-tertiary)" }}>Target {s.target}%</span>
                  <span className="font-black font-mono" style={{ color: s.color }}>{fmt(s.min)} ({s.pct}%)</span>
                </div>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                <motion.div className="h-full rounded-full" style={{ background: s.color }}
                  initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.8, ease: [0,0,0.2,1] }} />
                <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${s.target}%`, background: "rgba(0,0,0,0.3)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sleep Debt Tracker */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>7-Day Sleep Debt</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Cumulative deficit vs 8h/night target</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }}>⚠ 2.3h DEBT</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
              <motion.div className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${C.sleep}, ${C.warning})` }}
                initial={{ width: 0 }} animate={{ width: `${debtPercent}%` }}
                transition={{ duration: 1, ease: [0,0,0.2,1] }} />
            </div>
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              <span>0h deficit</span>
              <span>8h max deficit</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.warning }}>{sleepDebtHours}h</div>
            <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>accumulated</div>
          </div>
        </div>
        <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.18)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            🟡 Sleep onset drifting 45 min later over past 7 days (avg 12:15 AM vs baseline 11:30 PM). Consider 10:30 PM screen cutoff rule.
          </span>
        </div>
      </div>

      {/* Cross-domain correlation callout */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Cross-Domain Correlations</div>
        <div className="space-y-3">
          {[
            { label: "Sleep Quality → Trading P&L",         r: 0.82, p: "0.004", finding: "High-sleep days: avg P&L +$340 vs -$127 on poor-sleep days.",            color: C.optimal },
            { label: "Dinner Protein >40g → Deep Sleep",    r: 0.41, p: "0.039", finding: "Evenings with >40g protein produce 2.3h avg deep sleep (+0.6h).",          color: C.nutrition },
            { label: "Dining Out Frequency → Sleep Onset", r:-0.52, p: "0.014", finding: ">3× dining out/week → 45-min later sleep onset & −0.8h deep sleep.",    color: C.warning },
          ].map(c => (
            <div key={c.label} className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: `${c.color}07`, border: `1px solid ${c.color}20` }}>
              <div className="text-sm font-black font-mono shrink-0 mt-0.5" style={{ color: c.color }}>{c.r > 0 ? "+" : ""}{c.r.toFixed(2)}</div>
              <div className="flex-1">
                <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{c.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{c.finding}</div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--text-tertiary)" }}>p={c.p}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Fuel (Nutrition) ───────────────────────────────────────
// Legacy FuelTab removed and abstracted to components/health/FuelTab.tsx

// ─── Workout Templates Manager ───────────────────────────────────────
function WorkoutTemplatesManager() {
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState([{ name: "", sets: 3, reps: 10, weight: 0 }]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = async () => {
    if (!name) return;
    setLoading(true);
    setMsg("");
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: profile } = await supabase.from("user_profiles").select("user_id").limit(1).single();
      const user_id = profile?.user_id || "00000000-0000-0000-0000-000000000000";

      const { data: tmpl, error: tmplErr } = await supabase.from("workout_templates").insert({ name, user_id }).select().single();
      if (tmplErr) throw tmplErr;

      const exPayloads = exercises.map((ex, i) => ({
        template_id: tmpl.id,
        user_id,
        exercise_name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        order_index: i
      }));

      const { error: exErr } = await supabase.from("workout_template_exercises").insert(exPayloads);
      if (exErr) throw exErr;

      setMsg("Template saved!");
      setName("");
      setExercises([{ name: "", sets: 3, reps: 10, weight: 0 }]);
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="card-surface p-5 mb-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Create Workout Template</div>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>Template Name</label>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. Chest Workout" 
            className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20" 
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-bold flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
            Exercises
            <button onClick={() => setExercises([...exercises, { name: "", sets: 3, reps: 10, weight: 0 }])} className="text-teal-600 hover:underline">+ Add Exercise</button>
          </label>
          {exercises.map((ex, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={ex.name} onChange={e => { const newEx = [...exercises]; newEx[i].name = e.target.value; setExercises(newEx); }} placeholder="Exercise (e.g. Bench Press)" className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm text-slate-800 focus:outline-none" />
              <input type="number" value={ex.sets} onChange={e => { const newEx = [...exercises]; newEx[i].sets = Number(e.target.value); setExercises(newEx); }} placeholder="Sets" className="w-16 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm text-slate-800 focus:outline-none" />
              <input type="number" value={ex.reps} onChange={e => { const newEx = [...exercises]; newEx[i].reps = Number(e.target.value); setExercises(newEx); }} placeholder="Reps" className="w-16 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm text-slate-800 focus:outline-none" />
              <input type="number" value={ex.weight} onChange={e => { const newEx = [...exercises]; newEx[i].weight = Number(e.target.value); setExercises(newEx); }} placeholder="Weight" className="w-20 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm text-slate-800 focus:outline-none" />
              <button onClick={() => setExercises(exercises.filter((_, idx) => idx !== i))} className="p-2 text-slate-400 hover:text-red-500 rounded"><X size={16}/></button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button onClick={handleSave} disabled={loading || !name} className="px-5 py-2.5 bg-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-teal-700 transition-colors">
            {loading ? "Saving..." : "Save Template"}
          </button>
          {msg && <span className="text-xs font-semibold text-teal-600">{msg}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Kinematic Load ─────────────────────────────────────────
// ─── Tab: Kinematic Load & Cardio ──────────────────────────────────
function KinematicTab({ dbWorkouts }: { dbWorkouts?: any[] }) {
  // Extract progression data for weightlifting (max weight per exercise per day)
  const progressionData: any = {};
  
  // Separate cardio and lifting
  const cardioWorkouts = dbWorkouts?.filter(w => w.strava_id || w.distance_km || w.duration_minutes) || [];
  const liftingWorkouts = dbWorkouts?.filter(w => !w.strava_id && !w.distance_km && (w.weight > 0 || w.reps > 0 || w.sets > 0)) || [];

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
      {(!dbWorkouts || dbWorkouts.length === 0) ? (
        <EmptyState message="No workout telemetry found. Complete a template or text Telegram to log a workout." icon={Dumbbell} />
      ) : (
        <>
          {cardioWorkouts.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Heart size={14} /> Cardiovascular Activities
              </div>
              <div className="space-y-4">
                {cardioWorkouts.map((cw) => {
                  // Parse heart rate stream if available
                  let hrData = [];
                  if (cw.streams && cw.streams.heartrate && cw.streams.heartrate.data) {
                    hrData = cw.streams.heartrate.data.map((hr: number, idx: number) => ({ time: idx, hr }));
                  }
                  
                  return (
                    <div key={cw.id} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                      <div className="flex justify-between items-center">
                        <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{cw.exercise_name}</div>
                        <div className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{new Date(cw.workout_date).toLocaleDateString()}</div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                        <div>
                          <div style={{ color: "var(--text-tertiary)" }}>Dist</div>
                          <div className="font-bold" style={{ color: C.kinematic }}>{cw.distance_km || '--'} km</div>
                        </div>
                        <div>
                          <div style={{ color: "var(--text-tertiary)" }}>Time</div>
                          <div className="font-bold" style={{ color: C.optimal }}>{cw.duration_minutes || '--'} m</div>
                        </div>
                        <div>
                          <div style={{ color: "var(--text-tertiary)" }}>Avg HR</div>
                          <div className="font-bold" style={{ color: C.cv }}>{cw.average_heartrate || '--'} bpm</div>
                        </div>
                        <div>
                          <div style={{ color: "var(--text-tertiary)" }}>Cals</div>
                          <div className="font-bold" style={{ color: C.nutrition }}>{cw.calories || '--'}</div>
                        </div>
                      </div>

                      {hrData.length > 0 && (
                        <div style={{ height: "60px", width: "100%", marginTop: "8px" }}>
                          <ResponsiveContainer>
                            <AreaChart data={hrData}>
                              <defs>
                                <linearGradient id={`grad-hr-${cw.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={C.cv} stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor={C.cv} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <Area type="monotone" dataKey="hr" stroke={C.cv} strokeWidth={1.5} fill={`url(#grad-hr-${cw.id})`} dot={false} isAnimationActive={false} />
                              <Tooltip contentStyle={{ background: "#000", border: "none", color: "#fff", borderRadius: "8px", fontSize: "10px", padding: "2px 6px" }} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {liftingWorkouts.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Dumbbell size={14} /> Executed Protocol
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
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Progression Trajectory</div>
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

// ─── Tab: Trends ─────────────────────────────────────────────────
function TrendsTab({ latestMetrics, timeFilter }: { latestMetrics: any, timeFilter: string }) {
  if (!latestMetrics) {
    return <EmptyState message="No historical metrics available to compute macro trends." icon={Activity} />;
  }

  const baseHealthWealthData = [
    { date: "Jan", health: 82, wealth: 740 },
    { date: "Feb", health: 85, wealth: 760 },
    { date: "Mar", health: 78, wealth: 750 },
    { date: "Apr", health: 88, wealth: 790 },
    { date: "May", health: 91, wealth: 830 },
    { date: "Jun", health: 90, wealth: 847 },
  ];
  
  const healthWealthData = timeFilter === "day" || timeFilter === "week" ? baseHealthWealthData.slice(-2) :
                           timeFilter === "month" ? baseHealthWealthData.slice(-4) :
                           baseHealthWealthData;
  return (
    <div className="space-y-5">
      {/* System averages */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Current Biometrics</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Resting HR",  val: latestMetrics.resting_heart_rate ?? 58,   unit: "bpm", trend: "▼", trendColor: C.optimal  },
            { label: "HRV",         val: latestMetrics.hrv ?? 54,                   unit: "ms",  trend: "▲", trendColor: C.optimal  },
            { label: "VO₂ Max",    val: latestMetrics.vo2_max ?? 44.2,              unit: "",    trend: "▲", trendColor: C.optimal  },
            { label: "Resp. Rate", val: latestMetrics.respiratory_rate ?? 14.2,    unit: "/min",trend: "→", trendColor: C.textTertiary },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.trends }}>{m.val} <span className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>{m.unit}</span></div>
              <div className="text-sm font-bold mt-1" style={{ color: m.trendColor }}>{m.trend}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-domain insight grid */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Cross-Domain Intelligence (90-day window)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              domain: "Health → Wealth",
              icon: "💰",
              insights: [
                { finding: "Sleep >7.5h → avg daily P&L +$340",          stat: "r=0.43, p<0.01",  action: "Protect sleep before trading days",              color: C.optimal },
                { finding: "HRV >55ms → win rate 73% vs 52% when <45ms", stat: "r=0.38, p=0.02",  action: "Avoid new positions when HRV <45ms",              color: C.nutrition },
              ]
            },
            {
              domain: "Nutrition → Performance",
              icon: "🍗",
              insights: [
                { finding: "Dinner protein >40g → +0.6h deep sleep",     stat: "r=0.41, p=0.039", action: "Target 40g+ protein at dinner",                   color: C.optimal },
                { finding: "Pre-WO carbs >60g → +12% training volume",   stat: "r=0.63, p=0.007", action: "60–80g carbs 60–90 min pre-workout",              color: C.nutrition },
              ]
            },
            {
              domain: "Lifestyle → Sleep",
              icon: "🌙",
              insights: [
                { finding: "Dining out >3×/wk → 45-min onset drift",     stat: "r=-0.52, p=0.014",action: "Set 8 PM meal cutoff on weeknights",              color: C.warning },
                { finding: "Stress (low HRV) → spending +23% above avg", stat: "r=-0.68, p=0.002",action: "Mindfulness trigger when HRV <45ms pre-market",   color: C.warning },
              ]
            },
            {
              domain: "Workout → Recovery",
              icon: "🏋️",
              insights: [
                { finding: "RPE 9+ sessions → next-day focus −15%",      stat: "r=-0.28, p=0.12",  action: "Schedule key decisions on moderate workout days", color: C.kinematic },
                { finding: "Moderate intensity (Z2) → HRV +4ms next day",stat: "r=0.38, p=0.049", action: "Prioritize Z2 before important cognitive work",    color: C.optimal },
              ]
            },
          ].map(section => (
            <div key={section.domain} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span>{section.icon}</span>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{section.domain}</div>
              </div>
              <div className="space-y-2.5">
                {section.insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1 h-full rounded-full shrink-0 mt-1" style={{ background: ins.color, width: 3, minHeight: 32 }} />
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>{ins.finding}</div>
                      <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>{ins.stat}</div>
                      <div className="text-[10px] mt-0.5 font-semibold" style={{ color: ins.color }}>→ {ins.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
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

  // Supabase states
  const [dbWorkouts, setDbWorkouts] = useState<any[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<any>(null);
  const [dbMeals, setDbMeals] = useState<any[]>([]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const fetchWorkouts = async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .order("workout_date", { ascending: false })
        .limit(20);
      if (!error && data) setDbWorkouts(data);
    };

    const fetchMeals = async () => {
      const now = new Date();
      let cutoff = new Date();
      
      if (timeFilter === "day") cutoff.setDate(now.getDate() - 1);
      else if (timeFilter === "week") cutoff.setDate(now.getDate() - 7);
      else if (timeFilter === "month") cutoff.setMonth(now.getMonth() - 1);
      else if (timeFilter === "quarter") cutoff.setMonth(now.getMonth() - 3);
      else if (timeFilter === "year") cutoff.setFullYear(now.getFullYear() - 1);
      else cutoff.setDate(now.getDate() - 1); // default fallback

      const { data, error } = await supabase
        .from("meals")
        .select("*")
        .gte("meal_time", cutoff.toISOString())
        .order("meal_time", { ascending: true });
      if (!error && data) setDbMeals(data);
    };

    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from("health_metrics")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) setLatestMetrics(data[0]);
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

      {/* Main Content Areas */}
      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible" exit="exit">
            {activeTab === "cardio" && <CardioTab latestMetrics={latestMetrics} timeFilter={timeFilter} />}
            {activeTab === "sleep" && <SleepTab latestMetrics={latestMetrics} timeFilter={timeFilter} />}
            {activeTab === "fuel" && <FuelTab dbMeals={dbMeals} dbWorkouts={dbWorkouts} />}
            {activeTab === "kinematic" && <KinematicTab dbWorkouts={dbWorkouts} />}
            {activeTab === "trends" && <TrendsTab latestMetrics={latestMetrics} timeFilter={timeFilter} />}
            {activeTab === "templates" && <TemplatesTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* AI Copilot Bar */}
      <CopilotBar />
    </div>
  );
}
