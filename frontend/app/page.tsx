"use client";

import { motion } from "framer-motion";
import {
  Activity, TrendingUp, TrendingDown, Minus, Heart, Wallet, DollarSign,
  AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight, Brain, Clock,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";
import PulseRing from "./components/visualizations/PulseRing";
import AnomalyStream, { LogEntry } from "./components/visualizations/AnomalyStream";
import CorrelationHeatmap from "./components/visualizations/CorrelationHeatmap";

// ─── Colour constants ─────────────────────────────────────────────
const C = {
  health:   "#E03535",
  wealth:   "#059669",
  sleep:    "#5B42E8",
  nutrition:"#00A878",
  optimal:  "#059669",
  warning:  "#D97706",
  critical: "#DC2626",
  text:     "#0F172A",
  textSec:  "#475569",
  textTer:  "#94A3B8",
  border:   "#E2E8F0",
};

// ─── Mock rich data (used when DB returns empty) ─────────────────
const MOCK_PORTFOLIO = {
  totalValue: 847230, dayChange: 3240, dayChangePct: 0.38,
  ytdReturn: 18.7, activePosCount: 8, winRate: 67, beta: 0.92, sharpe: 1.8,
  topMovers: [
    { symbol: "NVDA", change: 4.2,  value: 2840,  pos: true  },
    { symbol: "TSLA", change: -2.1, value: -890,  pos: false },
    { symbol: "MSFT", change: 1.8,  value: 1230,  pos: true  },
    { symbol: "COIN", change: -1.4, value: -340,  pos: false },
  ],
  alerts: [
    { type: "critical", text: "Tech concentration 52% (threshold 40%)"      },
    { type: "warning",  text: "COIN stop-loss $132.80 — 8% from entry"       },
    { type: "optimal",  text: "NVDA approaching target $920 (82% conf.)"    },
  ],
};

const MOCK_CASHFLOW = {
  income: 14200, expenses: 8450, savingsRate: 40.5, savingsRateDelta: 3.2,
  topCategories: [
    { name: "Housing",     amount: 3200, pct: 37.9, alert: false },
    { name: "Investments", amount: 2100, pct: 24.9, alert: false },
    { name: "Dining Out",  amount: 1240, pct: 14.7, alert: true  },
    { name: "Transport",   amount: 890,  pct: 10.5, alert: false },
    { name: "Groceries",   amount: 780,  pct: 9.2,  alert: false },
  ],
  anomaly: "⚠ Dining Out — z-score 2.7 on May 19 ($127 single transaction)",
};

const MOCK_ACTIVITY = [
  { time: "08:42", type: "portfolio", priority: "warning",  title: "NVDA approaching price target",       detail: "Currently $850.30 vs target $920. Consider taking 25% profits ($6,575). Confidence: 82%.", action: "Review Position" },
  { time: "06:30", type: "health",    priority: "optimal",  title: "Morning Brief — All Systems Ready",   detail: "Sleep 92/100. HRV elevated 54ms. Suggested: Upper Push (recovery 78%). Markets +0.3%.", action: "View Plan"      },
  { time: "21:15", type: "spending",  priority: "warning",  title: "Dining budget at 72% — 8 days left",  detail: "Projected to exceed by $180. Reallocate from entertainment or reduce 2 dining events.", action: "Review Budget" },
  { time: "14:30", type: "portfolio", priority: "critical", title: "Stop-Loss Triggered — TSLA",          detail: "TSLA hit stop at $178.50 (entry $195.30). Realized P&L: −$4,900 (−8.6%). Closed.",     action: "Post-Mortem"  },
  { time: "12:15", type: "health",    priority: "optimal",  title: "New PR — Bench Press 225×8",          detail: "Previous best 225×5. E1RM → 273 lbs (+11 lbs). Streak: 3 consecutive PRs on Upper Push.", action: "View Progress" },
  { time: "09:30", type: "health",    priority: "optimal",  title: "Run: 5.2 km · 28:14 (Z3 focus)",     detail: "Avg HR: 152 bpm. HR Recovery: 28 bpm/min. Tomorrow: Upper Push recommended.", action: "View Activity" },
];

// ─── Animation variants ───────────────────────────────────────────
const container: any = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const item: any     = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 24 } } };

// ─── Sub-components ──────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const h = 28, w = 72;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`).join(" ");
  const last = pts.split(" ").pop()!;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={parseFloat(last.split(",")[0])} cy={parseFloat(last.split(",")[1])} r={2.5} fill={color} />
    </svg>
  );
}

// Health Quadrant
function HealthQuadrant({ metrics }: { metrics: any }) {
  const hrv   = metrics?.hrv ?? 54;
  const rhr   = metrics?.resting_heart_rate ?? 58;
  const slpM  = metrics?.sleep_duration_minutes ?? 468;
  const slpH  = Math.floor(slpM / 60);
  const slpMm = slpM % 60;

  const pillars = [
    { label: "CV",        score: 85, color: C.health    },
    { label: "Sleep",     score: 92, color: C.sleep     },
    { label: "Nutrition", score: 65, color: C.nutrition },
    { label: "Recovery",  score: 78, color: C.optimal   },
  ];
  const readiness = Math.round(pillars.reduce((a, p) => a + p.score, 0) / pillars.length);

  return (
    <div className="card-surface p-5 flex flex-col gap-4" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Health Status</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.optimal }}>{readiness}</span>
            <span className="text-xs font-bold" style={{ color: C.textTer }}>/100 Readiness</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <Heart size={15} style={{ color: C.optimal }} />
        </div>
      </div>

      {/* Readiness bar */}
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.border }}>
        <motion.div className="h-full rounded-full" style={{ background: C.optimal }}
          initial={{ width: 0 }} animate={{ width: `${readiness}%` }} transition={{ duration: 1, ease: [0,0,0.2,1] }} />
      </div>

      {/* 4 pillar chips */}
      <div className="grid grid-cols-4 gap-2">
        {pillars.map(p => (
          <div key={p.label} className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center"
            style={{ background: `${p.color}08`, border: `1px solid ${p.color}22` }}>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: p.color }}>{p.label}</div>
            <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: p.color }}>{p.score}</div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.border }}>
              <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: p.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "HRV",   val: `${hrv}ms`,       delta: "+2",   color: C.nutrition, sparkData: [48,45,47,43,46,51,54] },
          { label: "RHR",   val: `${rhr} bpm`,      delta: "−1",   color: C.sleep,     sparkData: [61,59,60,58,57,57,58] },
          { label: "Sleep", val: `${slpH}h ${slpMm}m`, delta: "+0.3h", color: C.optimal,   sparkData: [7.1,7.3,6.8,7.4,7.5,7.6,7.8] },
        ].map(m => (
          <div key={m.label} className="p-2.5 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>{m.label}</div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-black" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{m.val}</div>
                <div className="text-[10px] font-bold" style={{ color: m.delta.startsWith("+") ? C.optimal : C.warning }}>{m.delta}</div>
              </div>
              <MiniSparkline data={m.sparkData} color={m.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Cross-domain callout */}
      <div className="p-3 rounded-xl flex items-start gap-2"
        style={{ background: "rgba(91,66,232,0.05)", border: "1px solid rgba(91,66,232,0.15)" }}>
        <Brain size={12} style={{ color: "var(--accent-sleep)", marginTop: 2, flexShrink: 0 }} />
        <span className="text-[11px] leading-relaxed" style={{ color: C.textSec }}>
          <span className="font-bold" style={{ color: "var(--accent-sleep)" }}>Cross-Domain: </span>
          Sleep &gt;7.5h → avg portfolio P&L{" "}
          <span className="font-bold" style={{ color: C.optimal }}>+$340/day</span>
          {" "}(r=0.43, p&lt;0.01, n=68). Sleep &lt;6.5h → avg <span className="font-bold" style={{ color: C.critical }}>−$127/day</span>.
        </span>
      </div>
    </div>
  );
}

// Portfolio Quadrant
function PortfolioQuadrant({ positions }: { positions: any[] }) {
  const totalVal  = positions.length > 0 ? positions.reduce((a, p) => a + (parseFloat(p.position_value) || 0), 0) : MOCK_PORTFOLIO.totalValue;
  const totalPnL  = positions.length > 0 ? positions.reduce((a, p) => a + (parseFloat(p.unrealized_pnl) || 0), 0) : MOCK_PORTFOLIO.dayChange;
  const pnlPos    = totalPnL >= 0;
  const posCount  = Math.max(positions.length, MOCK_PORTFOLIO.activePosCount);

  return (
    <div className="card-surface p-5 flex flex-col gap-4" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Portfolio Command</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.text }}>
              ${(totalVal / 1000).toFixed(1)}K
            </span>
            <span className="text-sm font-bold" style={{ color: pnlPos ? C.optimal : C.critical }}>
              {pnlPos ? "+" : ""}${Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })} today
            </span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <Wallet size={15} style={{ color: C.wealth }} />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "YTD",       val: "+18.7%",             color: C.optimal },
          { label: "Positions", val: `${posCount}`,        color: C.textSec },
          { label: "Win Rate",  val: `${MOCK_PORTFOLIO.winRate}%`, color: C.optimal },
          { label: "Sharpe",    val: `${MOCK_PORTFOLIO.sharpe}`,   color: C.sleep   },
        ].map(k => (
          <div key={k.label} className="p-2 rounded-xl text-center"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>{k.label}</div>
            <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Top movers */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.textTer }}>Today's Top Movers</div>
        <div className="grid grid-cols-2 gap-1.5">
          {MOCK_PORTFOLIO.topMovers.map(m => (
            <div key={m.symbol} className="flex items-center justify-between px-2.5 py-2 rounded-lg"
              style={{
                background: m.pos ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)",
                border: `1px solid ${m.pos ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`,
              }}>
              <div className="flex items-center gap-1.5">
                {m.pos
                  ? <ArrowUpRight size={12} style={{ color: C.optimal }} />
                  : <ArrowDownRight size={12} style={{ color: C.critical }} />}
                <span className="text-xs font-bold" style={{ color: C.text }}>{m.symbol}</span>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black font-mono" style={{ color: m.pos ? C.optimal : C.critical }}>
                  {m.pos ? "+" : ""}{m.change}%
                </div>
                <div className="text-[9px] font-mono" style={{ color: C.textTer }}>
                  {m.pos ? "+" : ""}${Math.abs(m.value).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk alerts */}
      <div className="space-y-1.5">
        {MOCK_PORTFOLIO.alerts.map((a, i) => {
          const col = a.type === "critical" ? C.critical : a.type === "warning" ? C.warning : C.optimal;
          const dot = a.type === "critical" ? "🔴" : a.type === "warning" ? "🟡" : "🟢";
          return (
            <div key={i} className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px]"
              style={{ background: `${col}07`, border: `1px solid ${col}20` }}>
              <span>{dot}</span>
              <span style={{ color: C.textSec }}>{a.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Cash Flow Quadrant
function CashFlowQuadrant({ transactions }: { transactions: any[] }) {
  let income = 0, expenses = 0;
  if (transactions.length > 0) {
    transactions.forEach(t => {
      const a = parseFloat(t.amount) || 0;
      if (a > 0) income += a; else expenses += Math.abs(a);
    });
  } else {
    income   = MOCK_CASHFLOW.income;
    expenses = MOCK_CASHFLOW.expenses;
  }
  const net         = income - expenses;
  const savingsRate = income > 0 ? ((net / income) * 100).toFixed(1) : MOCK_CASHFLOW.savingsRate.toFixed(1);

  return (
    <div className="card-surface p-5 flex flex-col gap-4" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Cash Flow Pulse</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: net >= 0 ? C.optimal : C.critical }}>
              {net >= 0 ? "+" : ""}${Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs font-bold" style={{ color: C.textTer }}>net · this period</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <DollarSign size={15} style={{ color: C.wealth }} />
        </div>
      </div>

      {/* Income / Expense / Savings chips */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-xl text-center" style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)" }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Income</div>
          <div className="text-sm font-black font-mono" style={{ color: C.optimal }}>+${(income / 1000).toFixed(1)}K</div>
        </div>
        <div className="p-2 rounded-xl text-center" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Expenses</div>
          <div className="text-sm font-black font-mono" style={{ color: C.critical }}>−${(expenses / 1000).toFixed(1)}K</div>
        </div>
        <div className="p-2 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Saved</div>
          <div className="text-sm font-black font-mono" style={{ color: C.wealth }}>{savingsRate}%</div>
        </div>
      </div>

      {/* Category bars */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.textTer }}>Top Spending Categories</div>
        <div className="space-y-2.5">
          {MOCK_CASHFLOW.topCategories.map((cat, i) => (
            <div key={cat.name}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold" style={{ color: cat.alert ? C.warning : C.textSec }}>
                  {cat.alert && "⚠ "}{cat.name}
                </span>
                <span className="font-mono" style={{ color: cat.alert ? C.warning : C.textTer }}>
                  ${cat.amount.toLocaleString()} · {cat.pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: cat.alert ? C.warning : C.wealth }}
                  initial={{ width: 0 }}
                  animate={{ width: `${cat.pct}%` }}
                  transition={{ duration: 0.8, ease: [0, 0, 0.2, 1], delay: i * 0.06 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Anomaly */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl"
        style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.18)" }}>
        <AlertTriangle size={12} style={{ color: C.critical, marginTop: 2, flexShrink: 0 }} />
        <span className="text-[11px]" style={{ color: C.textSec }}>{MOCK_CASHFLOW.anomaly}</span>
      </div>
    </div>
  );
}

// AI Activity Feed
function ActivityFeed({ logs }: { logs: LogEntry[] }) {
  const feed = logs.length > 0
    ? logs.slice(0, 6).map((l: any) => ({
        time:     new Date(l.timestamp || Date.now()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        type:     "system",
        priority: l.level === "alert" || l.level === "ALERT" ? "critical" : "optimal",
        title:    (l.message || "").substring(0, 52),
        detail:   l.message || "",
        action:   "View",
      }))
    : MOCK_ACTIVITY;

  const priColor = (p: string) =>
    p === "critical" ? C.critical : p === "warning" ? C.warning : C.optimal;
  const priIcon  = (p: string) =>
    p === "critical" ? AlertTriangle : p === "warning" ? AlertTriangle : CheckCircle;

  const typeIcon: Record<string, any> = {
    portfolio: Wallet, health: Heart, spending: DollarSign,
    system: Activity, critical: AlertTriangle, optimal: CheckCircle,
  };

  return (
    <div className="card-surface p-5 flex flex-col gap-3" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
          AI Insights & Activity
        </div>
        <div className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(91,66,232,0.1)", color: "var(--accent-sleep)", border: "1px solid rgba(91,66,232,0.2)" }}>
          {feed.length} events
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 380 }}>
        {feed.map((ev, i) => {
          const col   = priColor(ev.priority);
          const PIcon = priIcon(ev.priority);
          const TIcon = typeIcon[ev.type] || typeIcon["system"];
          return (
            <motion.div key={i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-3 rounded-xl"
              style={{ background: `${col}05`, border: `1px solid ${col}18` }}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${col}15`, border: `1px solid ${col}28` }}>
                  <TIcon size={12} style={{ color: col }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="text-xs font-bold truncate" style={{ color: C.text }}>{ev.title}</div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock size={9} style={{ color: C.textTer }} />
                      <div className="text-[10px] font-mono" style={{ color: C.textTer }}>{ev.time}</div>
                    </div>
                  </div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: C.textSec }}>{ev.detail}</div>
                  <button className="mt-1.5 text-[10px] font-bold" style={{ color: col }}>{ev.action} →</button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function TheNexus() {
  const [logs,        setLogs]        = useState<LogEntry[]>([]);
  const [metrics,     setMetrics]     = useState<any>(null);
  const [positions,   setPositions]   = useState<any[]>([]);
  const [transactions, setTxs]        = useState<any[]>([]);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [logsRes, metricsRes, posRes, txRes] = await Promise.all([
          supabase.from("system_logs").select("*").order("timestamp", { ascending: false }).limit(20),
          supabase.from("health_metrics").select("*").order("recorded_at", { ascending: false }).limit(1),
          supabase.from("advisor_positions").select("*").order("position_value", { ascending: false }),
          supabase.from("transactions").select("*").order("transaction_date", { ascending: false }).limit(200),
        ]);
        if (!logsRes.error   && logsRes.data)          setLogs(logsRes.data as LogEntry[]);
        if (!metricsRes.error && metricsRes.data?.length) setMetrics(metricsRes.data[0]);
        if (!posRes.error    && posRes.data)            setPositions(posRes.data);
        if (!txRes.error     && txRes.data)             setTxs(txRes.data);

        const sub = supabase.channel("nexus_logs")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, p => {
            setLogs(prev => [p.new as LogEntry, ...prev].slice(0, 50));
          })
          .subscribe();
        return () => { supabase.removeChannel(sub); };
      } catch (e) {
        console.error("Nexus fetch error:", e);
      }
    }
    fetchAll();
  }, []);

  const hasAlert = logs.some(l => l.level === "alert" || l.level === "ALERT");

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-10">

      {/* Page header */}
      <motion.div variants={item} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: C.text, letterSpacing: "-0.02em" }}>
            The Nexus
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.textTer, fontFamily: "var(--font-mono)" }}>
            Cross-domain intelligence · Unified command center · Live
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.25)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.optimal }} />
            All Systems Online
          </div>
          {hasAlert && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(220,38,38,0.1)", color: C.critical, border: "1px solid rgba(220,38,38,0.25)" }}>
              <AlertTriangle size={11} /> Alerts Active
            </div>
          )}
        </div>
      </motion.div>

      {/* ROW 1: Life Pulse + Anomaly Stream */}
      <motion.div variants={item} className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-5 xl:col-span-4 card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2"
            style={{ color: C.textTer }}>
            <Activity size={12} /> Life Pulse · 87.4 / 100
          </div>
          <PulseRing
            score={87.4}
            segments={{ health: 85, wealth: 70, recovery: 92, growth: 60 }}
            hasAnomaly={hasAlert}
          />
        </div>
        <div className="col-span-12 md:col-span-7 xl:col-span-8">
          <AnomalyStream logs={logs} />
        </div>
      </motion.div>

      {/* ROW 2: Health + Portfolio Quadrants */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthQuadrant metrics={metrics} />
        <PortfolioQuadrant positions={positions} />
      </motion.div>

      {/* ROW 3: Cash Flow + Activity Feed */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowQuadrant transactions={transactions} />
        <ActivityFeed logs={logs} />
      </motion.div>

      {/* ROW 4: Cross-Domain Correlation Engine */}
      <motion.div variants={item}>
        <CorrelationHeatmap />
      </motion.div>

    </motion.div>
  );
}
