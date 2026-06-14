"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
  PieChart, Pie, Cell, ScatterChart, Scatter
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PieChart as PieIcon, ArrowRightLeft,
  Brain, AlertTriangle, ChevronDown, ChevronUp, Check, X,
  Send, Settings, FileText, Search, Target, DollarSign,
  BarChart2, Clock, ArrowUpRight, ArrowDownRight, Minus,
  Shield, Zap, RefreshCw, Info, CreditCard, Layers, Activity
} from "lucide-react";

// ─── Colour palette — Light Mode ────────────────────────────────
const C = {
  wealth: "#059669",
  growth: "#0EA5E9",
  equity: "#5B42E8",
  fixed: "#D97706",
  cash: "#94A3B8",
  crypto: "#E07020",
  alert: "#DC2626",
  warning: "#D97706",
  optimal: "#059669",
  critical: "#DC2626",
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
const netWorthHistory = [
  { month: "Jan", actual: 41200, projected: null, ci_high: null, ci_low: null },
  { month: "Feb", actual: 44800, projected: null, ci_high: null, ci_low: null },
  { month: "Mar", actual: 47300, projected: null, ci_high: null, ci_low: null },
  { month: "Apr", actual: 51600, projected: null, ci_high: null, ci_low: null },
  { month: "May", actual: 49800, projected: null, ci_high: null, ci_low: null },
  { month: "Jun", actual: 53400, projected: 53400, ci_high: 53400, ci_low: 53400 },
  { month: "Jul", actual: null, projected: 57200, ci_high: 59800, ci_low: 54600 },
  { month: "Aug", actual: null, projected: 61400, ci_high: 65200, ci_low: 57600 },
  { month: "Sep", actual: null, projected: 65800, ci_high: 71200, ci_low: 60400 },
  { month: "Oct", actual: null, projected: 70200, ci_high: 77600, ci_low: 62800 },
  { month: "Nov", actual: null, projected: 74800, ci_high: 84400, ci_low: 65200 },
  { month: "Dec", actual: null, projected: 79600, ci_high: 91200, ci_low: 68000 },
];

const spendingData = [
  { week: "Apr W1", housing: 1200, food: 480, transport: 120, subscriptions: 85, health: 0, shopping: 240, infra: 145 },
  { week: "Apr W2", housing: 0, food: 520, transport: 95, subscriptions: 0, health: 220, shopping: 180, infra: 0 },
  { week: "Apr W3", housing: 0, food: 445, transport: 110, subscriptions: 0, health: 0, shopping: 95, infra: 0 },
  { week: "Apr W4", housing: 0, food: 510, transport: 130, subscriptions: 85, health: 0, shopping: 320, infra: 145 },
  { week: "May W1", housing: 1200, food: 498, transport: 108, subscriptions: 85, health: 0, shopping: 210, infra: 0 },
  { week: "May W2", housing: 0, food: 465, transport: 92, subscriptions: 0, health: 220, shopping: 150, infra: 290 },
];

const dailySpend = [
  { day: "Mon", amount: 45, category: "food" },
  { day: "Tue", amount: 84 + 42 + 12, category: "mixed" },
  { day: "Wed", amount: 42, category: "food" },
  { day: "Thu", amount: 145 + 10 + 20, category: "infra" },
  { day: "Fri", amount: 85 + 220, category: "mixed" },
  { day: "Sat", amount: 60 + 120, category: "mixed" },
  { day: "Sun", amount: 30, category: "food" },
];

const portfolioHoldings = [
  { ticker: "VOO", name: "Vanguard S&P 500", value: 18400, allocation: 34.5, dayChange: +1.24, cost: 16200, color: C.equity },
  { ticker: "QQQ", name: "Nasdaq 100", value: 7200, allocation: 13.5, dayChange: +2.18, cost: 5800, color: "#7C3AED" },
  { ticker: "VXUS", name: "Intl Stocks (ex-US)", value: 4800, allocation: 9.0, dayChange: -0.34, cost: 4600, color: "#0891B2" },
  { ticker: "BND", name: "US Bond Total Market", value: 6400, allocation: 12.0, dayChange: +0.12, cost: 6800, color: C.fixed },
  { ticker: "HYSA", name: "High-Yield Savings", value: 10200, allocation: 19.1, dayChange: 0, cost: 10200, color: C.cash },
  { ticker: "BTC", name: "Bitcoin (0.08 BTC)", value: 6400, allocation: 12.0, dayChange: +3.42, cost: 3200, color: C.crypto },
];
const totalPortfolio = portfolioHoldings.reduce((s, h) => s + h.value, 0);

const pieData = portfolioHoldings.map(h => ({ name: h.ticker, value: h.value, color: h.color }));

const cashflowData = [
  { month: "Jan", income: 5800, expenses: 3200, savings: 2600 },
  { month: "Feb", income: 6200, expenses: 3600, savings: 2600 },
  { month: "Mar", income: 5800, expenses: 3100, savings: 2700 },
  { month: "Apr", income: 7400, expenses: 3800, savings: 3600 },
  { month: "May", income: 6000, expenses: 4200, savings: 1800 },
  { month: "Jun", income: 6800, expenses: 3500, savings: 3300 },
];

const ledger = [
  { id: 1, date: "Jun 13", merchant: "Amazon Web Services", category: "Infrastructure", amount: 290, anomaly: true, anomalyReason: "Double the trailing 3-month avg ($145). Likely new EC2 instance or storage expansion." },
  { id: 2, date: "Jun 12", merchant: "Whole Foods Market", category: "Groceries", amount: 84.50, anomaly: false },
  { id: 3, date: "Jun 11", merchant: "Vanguard — VOO Purchase", category: "Investment", amount: 1000, anomaly: false, isInvestment: true },
  { id: 4, date: "Jun 10", merchant: "Uber Eats", category: "Dining", amount: 67.20, anomaly: true, anomalyReason: "Breaches Tuesday 'Cook at home' protocol. 3rd dining out this week vs 2/week budget." },
  { id: 5, date: "Jun 09", merchant: "Equinox", category: "Health", amount: 220, anomaly: false },
  { id: 6, date: "Jun 08", merchant: "Netflix + Spotify + Claude", category: "Subscriptions", amount: 85, anomaly: false },
  { id: 7, date: "Jun 07", merchant: "Apple Store", category: "Electronics", amount: 428, anomaly: true, anomalyReason: "Unplanned discretionary spend. Exceeds monthly non-essential cap ($300) for June." },
  { id: 8, date: "Jun 06", merchant: "Salary Deposit", category: "Income", amount: -6800, anomaly: false, isIncome: true },
];

const savingsGoals = [
  { name: "Emergency Fund", current: 10200, target: 15000, color: C.wealth, priority: "High" },
  { name: "Down Payment", current: 18400, target: 80000, color: C.equity, priority: "High" },
  { name: "Vacation — Japan", current: 2800, target: 5000, color: C.growth, priority: "Medium" },
  { name: "MacBook Pro", current: 1200, target: 3500, color: C.crypto, priority: "Low" },
];

const budgetCategories = [
  { name: "Housing", budget: 1200, spent: 1200, color: C.textTertiary },
  { name: "Food & Dining", budget: 650, spent: 498, color: C.wealth },
  { name: "Transport", budget: 200, spent: 108, color: C.growth },
  { name: "Health & Fitness", budget: 300, spent: 220, color: C.equity },
  { name: "Subscriptions", budget: 120, spent: 85, color: C.fixed },
  { name: "Shopping", budget: 300, spent: 210, color: C.warning },
  { name: "Infrastructure", budget: 150, spent: 290, color: C.alert },
];

const copilotMessages = [
  { time: "23:12:04", type: "cron", text: "Portfolio sync complete. Net worth updated: $53,400." },
  { time: "23:12:08", type: "insight", text: "AWS bill 2× average. Flagged for review — possible unoptimized EC2." },
  { time: "23:14:22", type: "insight", text: "Savings rate this month: 48.5% — highest in 6 months." },
  { time: "23:16:30", type: "alert", text: "Infrastructure budget exceeded by $140. Rebalance recommended." },
  { time: "23:18:01", type: "cron", text: "VOO auto-invest scheduled for tomorrow: $500 DCA." },
  { time: "23:20:44", type: "insight", text: "BTC allocation up to 12% — approaching 15% risk cap." },
];

const trendMetrics = [
  { label: "Net Worth", values: [41200, 44800, 47300, 51600, 49800, 53400], color: C.wealth },
  { label: "Monthly Savings", values: [2600, 2600, 2700, 3600, 1800, 3300], color: C.growth },
  { label: "Portfolio Return", values: [3.2, 4.1, 5.8, 8.2, 6.4, 9.1], color: C.equity },
  { label: "Savings Rate %", values: [44.8, 41.9, 46.5, 48.6, 30.0, 48.5], color: C.optimal },
];

// ─── Shared Subcomponents ────────────────────────────────────────

function DeltaBadge({ value, prefix = "" }: { value: number | string; prefix?: string }) {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  const isPos = num > 0;
  const isNeg = num < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? C.optimal : isNeg ? C.alert : C.textTertiary;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color, fontFamily: "var(--font-mono)" }}>
      <Icon size={11} />
      {isPos && "+"}{prefix}{value}
    </span>
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
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-glow)", border: "1px solid var(--border-ai)" }}>
            <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>AI Analysis</div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(91,66,232,0.08)", color: "var(--accent-sleep)", border: "1px solid var(--border-ai)" }}>
            {confidence}% conf
          </span>
          {onDismiss && (
            <button onClick={onDismiss} className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{children}</div>
      <button onClick={() => setExpanded(x => !x)} className="mt-3 text-xs font-semibold" style={{ color: "var(--accent-sleep)" }}>
        {expanded ? "Hide reasoning ▲" : "Show reasoning ▼"}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="mt-3 pt-3 text-xs leading-relaxed" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Model: LangGraph WealthAgent v2.4 | Inputs: Plaid transactions, portfolio data, budget rules, savings goals | Inference: 0.8s
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpandableSection({ title, icon: Icon, defaultOpen = false, accentColor, badge, children }: {
  title: string; icon: React.ElementType; defaultOpen?: boolean; accentColor?: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-lg)" }}>
      <button className="expandable-header w-full text-left" onClick={() => setOpen(x => !x)}>
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: accentColor ?? "var(--text-tertiary)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{title}</span>
          {badge}
        </div>
        <div style={{ color: "var(--text-tertiary)" }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
            <div className="p-4 pt-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={parseFloat(pts.split(" ").pop()!.split(",")[0])} cy={parseFloat(pts.split(" ").pop()!.split(",")[1])} r={3} fill={color} />
    </svg>
  );
}

// ─── Tab: Spending / Capital Outflow ────────────────────────────
function SpendingTab() {
  const [expandedTx, setExpandedTx] = useState<number | null>(null);
  const totalSpent = budgetCategories.reduce((s, c) => s + c.spent, 0);
  const totalBudget = budgetCategories.reduce((s, c) => s + c.budget, 0);
  const overBudget = budgetCategories.filter(c => c.spent > c.budget);

  return (
    <div className="space-y-5">
      {/* Hero: Budget Status */}
      <div className="grid grid-cols-12 gap-4">
        {/* Budget Overview */}
        <div className="col-span-12 lg:col-span-5 card-surface p-5" style={{ borderRadius: "var(--radius-xl)", borderLeft: `3px solid ${overBudget.length > 0 ? C.warning : C.optimal}` }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>June Budget · Month to Date</div>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-4xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>
              ${totalSpent.toLocaleString()}
            </span>
            <span className="text-sm mb-1.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>/ ${totalBudget.toLocaleString()}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--surface-quaternary)" }}>
            <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${C.optimal}, ${totalSpent > totalBudget ? C.alert : C.growth})` }}
              initial={{ width: 0 }} animate={{ width: `${Math.min(totalSpent / totalBudget * 100, 100)}%` }}
              transition={{ duration: 1, ease: [0, 0, 0.2, 1] }} />
          </div>
          <div className="flex justify-between text-xs mb-4" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
            <span>${totalSpent.toLocaleString()} spent</span>
            <span>${(totalBudget - totalSpent).toLocaleString()} remaining</span>
          </div>

          {/* Budget by category */}
          <div className="space-y-2.5">
            {budgetCategories.map(cat => {
              const pct = Math.min(cat.spent / cat.budget * 100, 100);
              const over = cat.spent > cat.budget;
              return (
                <div key={cat.name}>
                  <div className="flex justify-between text-xs mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{cat.name}</span>
                    <span style={{ color: over ? C.alert : "var(--text-tertiary)", fontWeight: over ? 700 : 400 }}>
                      ${cat.spent} / ${cat.budget} {over && "⚠"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: over ? C.alert : cat.color }}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spending Chart */}
        <div className="col-span-12 lg:col-span-7 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Weekly Outflow — Last 6 Weeks</div>
            </div>
            {overBudget.length > 0 && (
              <span className="protocol-badge warning">
                <AlertTriangle size={10} /> {overBudget.length} over budget
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spendingData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 10, fontFamily: "var(--font-mono)" }} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: C.surfSecondary, border: `1px solid ${C.borderActive}`, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }} />
              <Bar dataKey="housing" stackId="a" fill={C.textTertiary} name="Housing" />
              <Bar dataKey="food" stackId="a" fill={C.wealth} name="Food" />
              <Bar dataKey="transport" stackId="a" fill={C.growth} name="Transport" />
              <Bar dataKey="health" stackId="a" fill={C.equity} name="Health" />
              <Bar dataKey="subscriptions" stackId="a" fill={C.fixed} name="Subscriptions" />
              <Bar dataKey="shopping" stackId="a" fill={C.warning} name="Shopping" />
              <Bar dataKey="infra" stackId="a" fill={C.alert} name="Infrastructure" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { label: "Housing", color: C.textTertiary },
              { label: "Food", color: C.wealth },
              { label: "Transport", color: C.growth },
              { label: "Health", color: C.equity },
              { label: "Subscriptions", color: C.fixed },
              { label: "Shopping", color: C.warning },
              { label: "Infra", color: C.alert },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Anomaly Alert */}
      <div className="p-4 rounded-xl" style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "var(--radius-lg)" }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(91,66,232,0.08)", border: "1px solid var(--border-ai)" }}>
            <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>AI Spending Analysis</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(91,66,232,0.08)", color: "var(--accent-sleep)", border: "1px solid var(--border-ai)" }}>89% conf</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>3 anomalies detected this month.</strong> AWS infrastructure costs are 2× the trailing average — audit your EC2 instances for unoptimized compute. Discretionary dining has breached protocol 3× this week. The Apple Store purchase exceeded your non-essential cap. Total overspend: <strong style={{ color: C.alert }}>$263</strong> vs budget.
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Ledger */}
      <div className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Algorithmic Ledger</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>June 2026 · {ledger.length} transactions</div>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "6px 10px", color: "var(--text-tertiary)" }}>
              <Search size={12} /> Search transactions...
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((tx, i) => (
                <>
                  <tr key={tx.id} onClick={() => setExpandedTx(expandedTx === i ? null : i)}>
                    <td style={{ color: "var(--text-tertiary)" }}>{tx.date}</td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>{tx.merchant}</td>
                    <td>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--surface-tertiary)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
                        {tx.category}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: tx.isIncome ? C.optimal : tx.isInvestment ? C.equity : "var(--text-primary)", fontWeight: 700 }}>
                      {tx.isIncome ? "+" : tx.isInvestment ? "" : "-"}${Math.abs(tx.amount).toLocaleString()}
                    </td>
                    <td>
                      {tx.anomaly ? (
                        <div className="flex items-center gap-1">
                          <AlertTriangle size={13} style={{ color: C.warning }} />
                          <span className="text-xs font-bold" style={{ color: C.warning }}>Anomaly</span>
                        </div>
                      ) : tx.isInvestment ? (
                        <span className="text-xs font-bold" style={{ color: C.equity }}>Invested</span>
                      ) : tx.isIncome ? (
                        <span className="text-xs font-bold" style={{ color: C.optimal }}>Income</span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {expandedTx === i && tx.anomaly && (
                    <tr key={`exp-${i}`}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mx-3 my-2 p-4 rounded-xl overflow-hidden"
                          style={{ background: "rgba(91,66,232,0.04)", border: "1px solid var(--border-ai)" }}>
                          <div className="flex items-start gap-2">
                            <Brain size={13} style={{ color: "var(--accent-sleep)", marginTop: 2 }} />
                            <div>
                              <div className="text-xs font-bold mb-1" style={{ color: "var(--accent-sleep)" }}>AI Anomaly Explanation</div>
                              <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{tx.anomalyReason}</div>
                            </div>
                            <button onClick={() => setExpandedTx(null)} className="ml-auto" style={{ color: "var(--text-tertiary)" }}>
                              <X size={13} />
                            </button>
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

      <AIInsightCard title="Spending Behaviour Analysis — June" confidence={88}>
        Savings rate is holding at <strong style={{ color: C.optimal }}>48.5%</strong> despite 3 budget breaches. Primary driver of overrun is infrastructure costs (+$140) and unplanned discretionary spending ($428 Apple). Recommend: audit AWS with Cost Explorer, enforce dining protocol for remainder of month, and defer Apple purchase to July to preserve savings target.
        <div className="mt-3 space-y-1">
          {["• Run AWS Cost Explorer — identify idle EC2 instances", "• Enable dining block Tue/Wed (Cook at home protocol)", "• Defer Apple Store to July — reclaim $428", "• Auto-invest $300 surplus from May toward VOO DCA"].map(a => (
            <div key={a} className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{a}</div>
          ))}
        </div>
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Net Worth ──────────────────────────────────────────────
function NetWorthTab() {
  const [showProjection, setShowProjection] = useState(true);

  return (
    <div className="space-y-5">
      {/* Hero Metrics */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 card-surface p-5" style={{ borderRadius: "var(--radius-xl)", borderLeft: `3px solid ${C.wealth}` }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Net Worth</div>
          <div className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>
            $53,400
          </div>
          <DeltaBadge value="+$3,600" />
          <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>vs last month</div>
          <div className="mt-4 space-y-2">
            {[
              { label: "Assets", val: "$53,400", color: C.wealth },
              { label: "Liabilities", val: "$0", color: C.alert },
              { label: "Monthly Δ", val: "+$3,600 (+7.2%)", color: C.optimal },
              { label: "YTD Δ", val: "+$12,200 (+29.6%)", color: C.optimal },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>{m.label}</span>
                <span style={{ color: m.color, fontWeight: 700 }}>{m.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Monthly Cashflow</div>
          <div className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-mono)", color: C.optimal, lineHeight: 1 }}>
            +$3,300
          </div>
          <DeltaBadge value="+$1,500" />
          <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>vs May (+83%)</div>
          <div className="mt-4 space-y-2">
            {[
              { label: "Income", val: "$6,800", color: C.optimal },
              { label: "Expenses", val: "$3,500", color: C.alert },
              { label: "Savings Rate", val: "48.5%", color: C.wealth },
              { label: "Invested", val: "$1,500/month DCA", color: C.equity },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>{m.label}</span>
                <span style={{ color: m.color, fontWeight: 700 }}>{m.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Runway Estimate</div>
          <div className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-mono)", color: C.growth, lineHeight: 1 }}>
            15.3
          </div>
          <div className="text-xs mb-2" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>months at current burn</div>
          <div className="mt-4 space-y-2">
            {[
              { label: "Monthly Burn", val: "$3,500", color: "var(--text-primary)" },
              { label: "Liquid Assets", val: "$10,200", color: C.growth },
              { label: "FIRE Number", val: "$840,000 (4% rule)", color: C.textTertiary },
              { label: "FIRE ETA", val: "~18 years (conservative)", color: C.textTertiary },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>{m.label}</span>
                <span style={{ color: m.color, fontWeight: 700, fontSize: 10 }}>{m.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Net Worth Chart */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Net Worth Trajectory</div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Full Year View with AI Projection</div>
          </div>
          <button onClick={() => setShowProjection(x => !x)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: showProjection ? "rgba(91,66,232,0.08)" : "var(--surface-tertiary)", color: showProjection ? "var(--accent-sleep)" : "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            {showProjection ? "Hide" : "Show"} AI Projection
          </button>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={netWorthHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.wealth} stopOpacity={0.2} />
                <stop offset="100%" stopColor={C.wealth} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.equity} stopOpacity={0.15} />
                <stop offset="100%" stopColor={C.equity} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} tickFormatter={v => `$${v / 1000}k`} />
            <Tooltip contentStyle={{ background: C.surfSecondary, border: `1px solid ${C.borderActive}`, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}
              formatter={(v: number) => [`$${v?.toLocaleString()}`, ""]} />
            <ReferenceLine y={50000} stroke={C.textTertiary} strokeDasharray="4 4" strokeWidth={1} label={{ value: "$50k", fill: C.textTertiary, fontSize: 10, position: "right" }} />
            {showProjection && <Area type="monotone" dataKey="ci_high" stroke="none" fill="rgba(91,66,232,0.06)" name="CI High" />}
            <Area type="monotone" dataKey="actual" stroke={C.wealth} strokeWidth={2.5} fill="url(#wealthGrad)"
              dot={{ r: 4, fill: C.wealth, stroke: C.surfSecondary, strokeWidth: 2 }} name="Actual" />
            {showProjection && <Line type="monotone" dataKey="projected" stroke={C.equity} strokeWidth={2} strokeDasharray="6 3"
              dot={{ r: 3, fill: C.equity, stroke: C.surfSecondary, strokeWidth: 2 }} name="AI Projected" />}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { l: "Current", v: "$53,400", color: C.wealth },
            { l: "Conservative (P10)", v: "$68,000", color: C.textTertiary },
            { l: "Expected (P50)", v: "$79,600", color: C.equity },
            { l: "Best Case (P90)", v: "$91,200", color: C.optimal },
          ].map(m => (
            <div key={m.l} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{m.l}</div>
              <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: m.color }}>{m.v}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>by Dec 2026</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cashflow Chart */}
      <ExpandableSection title="Monthly Cashflow — Income vs Expenses" icon={ArrowRightLeft} defaultOpen={true} accentColor={C.growth}>
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={cashflowData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.optimal} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={C.optimal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} tickFormatter={v => `$${v / 1000}k`} />
              <Tooltip contentStyle={{ background: C.surfSecondary, border: `1px solid ${C.borderActive}`, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
              <Area type="monotone" dataKey="income" stroke={C.optimal} strokeWidth={2} fill="url(#incomeGrad)" name="Income" />
              <Bar dataKey="expenses" fill={`${C.alert}30`} stroke={C.alert} strokeWidth={1} name="Expenses" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="savings" stroke={C.equity} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: C.equity }} name="Net Savings" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ExpandableSection>

      {/* Savings Goals */}
      <ExpandableSection title="Savings Goals Tracker" icon={Target} defaultOpen={true} accentColor={C.wealth}>
        <div className="space-y-3 mt-2">
          {savingsGoals.map(goal => {
            const pct = Math.min(goal.current / goal.target * 100, 100);
            return (
              <div key={goal.name} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{goal.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      ${goal.current.toLocaleString()} / ${goal.target.toLocaleString()} · {pct.toFixed(0)}%
                    </div>
                  </div>
                  <span className="protocol-badge" style={{ background: `${goal.color}12`, color: goal.color, border: `1px solid ${goal.color}30` }}>
                    {goal.priority}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: goal.color }}
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </ExpandableSection>

      <AIInsightCard title="Net Worth Trajectory — June Review" confidence={84}>
        Net worth grew <strong style={{ color: C.optimal }}>+$3,600 (+7.2%)</strong> in June despite a May market drawdown. The 48.5% savings rate is the highest in 6 months — primary driver being reduced discretionary spend and a $800 side income deposit. At this trajectory, you reach <strong style={{ color: C.wealth }}>$79,600 by December</strong> (P50). Emergency fund will hit 6-month coverage ($21,000) in 3.6 months at current savings pace.
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Portfolio ──────────────────────────────────────────────
function PortfolioTab() {
  const [rebalanceAccepted, setRebalanceAccepted] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState<number | null>(null);

  const totalGain = portfolioHoldings.reduce((s, h) => s + (h.value - h.cost), 0);
  const totalGainPct = (totalGain / portfolioHoldings.reduce((s, h) => s + h.cost, 0)) * 100;

  return (
    <div className="space-y-5">
      {/* Portfolio Overview */}
      <div className="grid grid-cols-12 gap-4">
        {/* Donut Chart */}
        <div className="col-span-12 lg:col-span-5 card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Asset Allocation</div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: C.surfSecondary, border: `1px solid ${C.borderActive}`, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Total</div>
              <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                ${totalPortfolio.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            {portfolioHoldings.map(h => (
              <div key={h.ticker} className="flex items-center gap-2 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: h.color }} />
                <span style={{ color: "var(--text-secondary)" }}>{h.ticker}</span>
                <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>{h.allocation}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings */}
        <div className="col-span-12 lg:col-span-7 card-surface overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>Holdings</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${totalPortfolio.toLocaleString()}</span>
                  <span className={totalGain >= 0 ? "metric-badge-positive" : "metric-badge-negative"}>
                    {totalGain >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}% total return
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {portfolioHoldings.map((h, i) => {
              const gain = h.value - h.cost;
              const gainPct = (gain / h.cost) * 100;
              return (
                <div key={h.ticker}>
                  <button className="w-full p-4 text-left transition-colors hover:bg-[var(--surface-tertiary)]"
                    onClick={() => setExpandedHolding(expandedHolding === i ? null : i)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                        style={{ background: `${h.color}15`, color: h.color, border: `1px solid ${h.color}30`, fontFamily: "var(--font-mono)" }}>
                        {h.ticker.slice(0, 3)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{h.ticker}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{h.name}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${h.value.toLocaleString()}</div>
                        <div className="flex items-center justify-end gap-1 text-xs" style={{ color: h.dayChange > 0 ? C.optimal : h.dayChange < 0 ? C.alert : C.textTertiary, fontFamily: "var(--font-mono)" }}>
                          {h.dayChange > 0 ? <TrendingUp size={10} /> : h.dayChange < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                          {h.dayChange > 0 ? "+" : ""}{h.dayChange}% today
                        </div>
                      </div>
                    </div>
                  </button>
                  <AnimatePresence>
                    {expandedHolding === i && (
                      <motion.div key={`exp-${h.ticker}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                        <div className="mx-3 mb-3 p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { l: "Cost Basis", v: `$${h.cost.toLocaleString()}` },
                              { l: "Current Value", v: `$${h.value.toLocaleString()}` },
                              { l: "Total Gain", v: `${gain >= 0 ? "+" : ""}$${gain.toLocaleString()} (${gainPct.toFixed(1)}%)`, color: gain >= 0 ? C.optimal : C.alert },
                            ].map(m => (
                              <div key={m.l}>
                                <div className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>{m.l}</div>
                                <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: m.color ?? "var(--text-primary)" }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Rebalance Recommendation */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)", borderLeft: `3px solid ${rebalanceAccepted ? C.optimal : C.equity}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-glow)", border: "1px solid var(--border-ai)" }}>
              <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>AI Rebalance Recommendation</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{rebalanceAccepted ? "✓ Rebalance Scheduled" : "Portfolio Drift Detected"}</div>
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "rgba(91,66,232,0.08)", color: "var(--accent-sleep)", border: "1px solid var(--border-ai)" }}>
            91% confidence
          </span>
        </div>
        <div className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
          Bitcoin has appreciated to <strong style={{ color: C.crypto }}>12% of portfolio</strong>, approaching your 15% risk cap. Equities exposure is 57% vs your target of 70%. Cash drag in HYSA is 19% — deploy $3,200 into VOO to return to target allocation.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Current Equities", val: "57%", target: "70%", action: "BUY" },
            { label: "Fixed Income", val: "12%", target: "10%", action: "HOLD" },
            { label: "Cash / HYSA", val: "19%", target: "10%", action: "REDUCE" },
            { label: "Crypto / Alt", val: "12%", target: "10%", action: "TRIM" },
          ].map(a => (
            <div key={a.label} className="p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{a.label}</div>
              <div className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{a.val}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>target {a.target}</div>
              <span className="text-xs font-bold mt-1 inline-block" style={{ color: a.action === "BUY" ? C.optimal : a.action === "HOLD" ? C.textTertiary : C.warning }}>
                → {a.action}
              </span>
            </div>
          ))}
        </div>
        {!rebalanceAccepted ? (
          <div className="flex gap-3">
            <button onClick={() => setRebalanceAccepted(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:opacity-90"
              style={{ background: C.equity, color: "#fff" }}>
              <Check size={14} /> Execute Rebalance ($3,200 VOO)
            </button>
            <button className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-black/5"
              style={{ border: "1px solid var(--border-active)", color: "var(--text-secondary)" }}>
              Defer 30 Days
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.optimal }}>
            <Check size={16} /> Rebalance scheduled for Monday market open — $3,200 VOO purchase
          </div>
        )}
      </div>

      <AIInsightCard title="Portfolio Health Assessment" confidence={87}>
        Portfolio total return is <strong style={{ color: C.optimal }}>+{totalGainPct.toFixed(1)}%</strong> since inception. Strongest performer: BTC (+100%, 2× cost basis). Weakest: BND (slightly underwater due to rate environment, long-term hold appropriate). Risk-adjusted, your Sharpe ratio is estimated at 1.42 — above the 1.0 benchmark. Main action needed: deploy HYSA excess into productive assets.
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Cash Flow ──────────────────────────────────────────────
function CashflowTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Monthly Income", val: "$6,800", delta: "+$800 vs avg", color: C.optimal, icon: TrendingUp },
          { label: "Monthly Expenses", val: "$3,500", delta: "-$700 vs May", color: C.wealth, icon: TrendingDown },
          { label: "Net Savings", val: "$3,300", delta: "+$1,500 vs May", color: C.equity, icon: ArrowUpRight },
        ].map(m => (
          <div key={m.label} className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <m.icon size={16} style={{ color: m.color }} />
            </div>
            <div className="text-3xl font-black mb-1" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.delta}</div>
          </div>
        ))}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>6-Month Cashflow View</div>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={cashflowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.optimal} stopOpacity={0.15} />
                <stop offset="100%" stopColor={C.optimal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: "var(--font-mono)" }} tickFormatter={v => `$${v / 1000}k`} />
            <Tooltip contentStyle={{ background: C.surfSecondary, border: `1px solid ${C.borderActive}`, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
            <Area type="monotone" dataKey="income" stroke={C.optimal} strokeWidth={2} fill="url(#incomeGrad2)" name="Income" />
            <Bar dataKey="expenses" fill={`${C.alert}20`} stroke={C.alert} strokeWidth={1.5} name="Expenses" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="savings" stroke={C.equity} strokeWidth={2.5}
              dot={{ r: 4, fill: C.equity, stroke: C.surfSecondary, strokeWidth: 2 }} name="Net Savings" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ExpandableSection title="Income Sources Breakdown" icon={DollarSign} defaultOpen={true} accentColor={C.optimal}>
        <div className="space-y-3 mt-2">
          {[
            { source: "Primary Salary (after tax)", amount: 5800, pct: 85.3, color: C.optimal, recurring: true },
            { source: "Freelance / Side Income", amount: 800, pct: 11.8, color: C.growth, recurring: false },
            { source: "Portfolio Dividends", amount: 120, pct: 1.8, color: C.equity, recurring: true },
            { source: "HYSA Interest", amount: 80, pct: 1.1, color: C.fixed, recurring: true },
          ].map(s => (
            <div key={s.source} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.source}</div>
                <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{s.pct}% of income</span>
                  {s.recurring && <span className="protocol-badge active" style={{ padding: "1px 6px", fontSize: 10 }}>Recurring</span>}
                </div>
              </div>
              <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: s.color }}>${s.amount.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </ExpandableSection>

      <AIInsightCard title="Cash Flow Optimisation" confidence={82}>
        Your income diversification score is <strong style={{ color: C.optimal }}>14.7%</strong> non-salary — low but growing. Freelance income is volatile (range $0–$1,800/month). Recommend building it to 20%+ for resilience. Dividend income will compound: at current portfolio growth, dividends reach $400/month by 2028, covering 11% of current expenses.
      </AIInsightCard>
    </div>
  );
}

// ─── Tab: Trends ─────────────────────────────────────────────────
function WealthTrendsTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-12 gap-4">
        {trendMetrics.map(m => (
          <div key={m.label} className="col-span-12 sm:col-span-6 lg:col-span-3 card-surface p-4" style={{ borderRadius: "var(--radius-lg)" }}>
            <div className="flex justify-between items-start mb-3">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <DeltaBadge value={m.values[m.values.length - 1] > m.values[0] ? `+${((m.values[m.values.length - 1] - m.values[0]) / m.values[0] * 100).toFixed(1)}%` : `-${((m.values[0] - m.values[m.values.length - 1]) / m.values[0] * 100).toFixed(1)}%`} />
            </div>
            <div className="text-2xl font-black mb-3" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>
              {m.label.includes("$") || m.label.includes("Worth") || m.label.includes("Savings")
                ? `$${m.values[m.values.length - 1].toLocaleString()}`
                : `${m.values[m.values.length - 1].toFixed(1)}${m.label.includes("%") || m.label.includes("Rate") ? "%" : "%"}`}
            </div>
            <MiniSparkline data={m.values} color={m.color} height={40} />
          </div>
        ))}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Key Financial Correlations — 6 Months</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { a: "Savings Rate", b: "Net Worth Growth", corr: 0.92, positive: true },
            { a: "Portfolio Performance", b: "Total Return", corr: 0.87, positive: true },
            { a: "Dining Spend", b: "Month-end Savings", corr: -0.74, positive: false },
            { a: "Side Income", b: "Savings Rate", corr: 0.68, positive: true },
            { a: "Market Volatility", b: "Portfolio Value", corr: -0.61, positive: false },
            { a: "DCA Consistency", b: "Portfolio Growth", corr: 0.89, positive: true },
          ].map(c => (
            <div key={`${c.a}-${c.b}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {c.a} → {c.b}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: "var(--surface-quaternary)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.abs(c.corr) * 100}%`, background: c.positive ? C.optimal : C.alert }} />
                </div>
                <span className="text-xs font-bold w-10 text-right" style={{ fontFamily: "var(--font-mono)", color: c.positive ? C.optimal : C.alert }}>
                  r={c.positive ? "" : "-"}{Math.abs(c.corr).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AIInsightCard title="6-Month Financial Trajectory" confidence={86}>
        Strong compounding trajectory confirmed. Net worth growth is accelerating month-over-month, driven by increasing savings rate and portfolio appreciation. The high correlation between DCA consistency and portfolio growth (r=0.89) validates the auto-invest strategy. Primary risk: lifestyle creep — dining and shopping spend both trended +18% over 6 months despite income growing only +12%.
      </AIInsightCard>
    </div>
  );
}

// ─── AI Copilot Bar ──────────────────────────────────────────────
function WealthCopilotBar() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(copilotMessages);
  const streamRef = useRef<HTMLDivElement>(null);

  const send = useCallback(() => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, {
      time: new Date().toLocaleTimeString("en-GB"), type: "insight",
      text: `Query: "${input}" — Analyzing financial data...`
    }]);
    setInput("");
  }, [input]);

  return (
    <div className="copilot-bar" style={{ left: 250 }}>
      {!expanded && (
        <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpanded(true)}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--ai-glow)", border: "1px solid var(--border-ai)" }}>
              <Brain size={12} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>Copilot</span>
            <span className="text-xs ai-shimmer ml-2">Net worth +$3,600 this month — savings rate at 6-month high.</span>
          </div>
          <button className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:bg-black/5"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            Expand <ChevronUp size={12} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 360 }} exit={{ height: 0 }} transition={{ duration: 0.35 }} className="overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-glow)", border: "1px solid var(--border-ai)" }}>
                  <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>LangGraph Wealth Copilot</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Connected to Plaid · portfolio sync active</div>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                <X size={14} />
              </button>
            </div>

            <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-3 copilot-stream">
              {messages.map((m, i) => (
                <div key={i} className={`event-${m.type}`}>
                  <span className="timestamp">[{m.time}]</span>
                  <span className="text-xs font-semibold" style={{ color: m.type === "insight" ? C.optimal : m.type === "alert" ? C.warning : C.textTertiary }}>
                    {m.type.charAt(0).toUpperCase() + m.type.slice(1)}:
                  </span>
                  {" "}{m.text}
                </div>
              ))}
            </div>

            <div className="px-5 py-2 flex gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {[{ icon: Settings, label: "Budget Rules" }, { icon: FileText, label: "Monthly Report" }, { icon: RefreshCw, label: "Sync Accounts" }].map(a => (
                <button key={a.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-black/5"
                  style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <a.icon size={11} /> {a.label}
                </button>
              ))}
            </div>

            <div className="px-5 py-3 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Ask: How much did I overspend this month vs budget?"
                className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-active)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
              <button onClick={send} className="px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 hover:opacity-90 transition-opacity"
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

// ─── System Banner ────────────────────────────────────────────────
function WealthBanner() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-4 card-surface overflow-hidden" style={{ borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Wealth Status</span>
          <div className="flex items-center gap-3">
            {[
              { label: "Cashflow", status: "optimal" as const },
              { label: "Portfolio", status: "optimal" as const },
              { label: "Budget", status: "warning" as const },
              { label: "Goals", status: "optimal" as const },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {s.status !== "inactive" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: s.status === "optimal" ? C.optimal : C.warning }} />}
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: s.status === "optimal" ? C.optimal : C.warning }} />
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--text-tertiary)" }}>NW: <span style={{ color: C.wealth, fontWeight: 700 }}>$53,400</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Rate: <span style={{ color: C.optimal, fontWeight: 700 }}>48.5%</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Anomalies: <span style={{ color: C.warning, fontWeight: 700 }}>3</span></span>
          </div>
          <button onClick={() => setCollapsed(x => !x)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-4">
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(217,119,6,0.04)", border: "1px solid rgba(217,119,6,0.15)" }}>
                <AlertTriangle size={14} style={{ color: C.warning, marginTop: 2 }} />
                <div className="flex-1">
                  <div className="text-xs font-bold mb-0.5" style={{ color: C.warning }}>⚠ 3 BUDGET ANOMALIES THIS MONTH</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    AWS ($290, 2× avg), Uber Eats protocol breach, Apple Store overspend. Total: $263 over budget.
                  </div>
                </div>
                <button className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 hover:opacity-80" style={{ background: "var(--accent-sleep)", color: "#fff" }}>
                  Review
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
export default function WealthOS() {
  const [activeTab, setActiveTab] = useState("spending");
  const [timeFilter, setTimeFilter] = useState("month");

  const tabs = [
    { id: "spending", label: "Capital Outflow", icon: ArrowRightLeft, color: C.wealth },
    { id: "networth", label: "Net Worth", icon: TrendingUp, color: C.growth },
    { id: "portfolio", label: "Portfolio", icon: PieIcon, color: C.equity },
    { id: "cashflow", label: "Cash Flow", icon: DollarSign, color: C.crypto },
    { id: "wtrends", label: "Trends", icon: BarChart2, color: C.alert },
  ];

  const tabVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0, 0, 0.2, 1] } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
  };

  return (
    <div style={{ background: "var(--surface-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      {/* Page Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} style={{ color: C.wealth }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Wealth OS V7</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>Live</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Capital Command: Liquidity, runway &amp; financial velocity · Last sync: 4 min ago
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
            {["Day", "Week", "Month", "Quarter", "Year"].map(f => (
              <button key={f} onClick={() => setTimeFilter(f.toLowerCase())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  background: timeFilter === f.toLowerCase() ? "var(--surface-tertiary)" : "transparent",
                  color: timeFilter === f.toLowerCase() ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: timeFilter === f.toLowerCase() ? "1px solid var(--border-active)" : "1px solid transparent",
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <WealthBanner />

        {/* Tab Nav */}
        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-tab={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}>
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
            {activeTab === "spending" && <SpendingTab />}
            {activeTab === "networth" && <NetWorthTab />}
            {activeTab === "portfolio" && <PortfolioTab />}
            {activeTab === "cashflow" && <CashflowTab />}
            {activeTab === "wtrends" && <WealthTrendsTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      <WealthCopilotBar />
    </div>
  );
}
