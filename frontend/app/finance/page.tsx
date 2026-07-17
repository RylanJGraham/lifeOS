"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

import PortfolioConstellation from "../components/visualizations/PortfolioConstellation";
import CashflowWaterfall from "../components/visualizations/CashflowWaterfall";

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


function getFilteredData(data: any[], timeFilter: string, dateField: string = "transaction_date") {
  if (!data || data.length === 0) return [];
  if (timeFilter === "all" || !timeFilter) return data;
  
  const now = new Date();
  let cutoff = new Date();
  
  if (timeFilter === "day") cutoff.setDate(now.getDate() - 1);
  else if (timeFilter === "week") cutoff.setDate(now.getDate() - 7);
  else if (timeFilter === "month") cutoff.setMonth(now.getMonth() - 1);
  else if (timeFilter === "quarter") cutoff.setMonth(now.getMonth() - 3);
  else if (timeFilter === "year") cutoff.setFullYear(now.getFullYear() - 1);
  
  return data.filter(item => {
    if (!item[dateField]) return true;
    const itemDate = new Date(item[dateField]);
    return itemDate >= cutoff;
  });
}


// ─── Shared Transactions Table ──────────────────────────────────
function TransactionsTable({ transactions }: { transactions: any[] }) {
  if (!transactions || transactions.length === 0) return null;
  return (
    <div className="card-surface mt-5 overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Raw Transaction Data</div>
      </div>
      <div className="overflow-x-auto max-h-[400px]">
        <table className="data-table">
          <thead className="sticky top-0 z-10" style={{ background: "var(--surface-secondary)" }}>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Category</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => {
              const amt = parseFloat(t.amount) || 0;
              const isIncome = amt > 0;
              return (
                <tr key={t.id}>
                  <td className="w-[120px]" style={{ color: "var(--text-tertiary)" }}>{t.transaction_date}</td>
                  <td className="font-semibold" style={{ color: "var(--text-primary)" }}>{t.merchant_name}</td>
                  <td>
                    <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest" style={{ background: "var(--surface-tertiary)", color: "var(--text-secondary)" }}>
                      {t.category || "Uncategorized"}
                    </span>
                  </td>
                  <td className="text-right font-mono font-bold" style={{ color: isIncome ? C.optimal : C.textPrimary }}>
                    {isIncome ? "+" : "-"}${Math.abs(amt).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Spending / Capital Outflow ────────────────────────────
function SpendingTab({ transactions, timeFilter }: { transactions: any[], timeFilter: string }) {
  if (!transactions || transactions.length === 0) {
    return <EmptyState message="No spending transactions recorded for this period." icon={CreditCard} />;
  }

  // Filter out income (keep only expenses, which are usually negative but we take absolute value)
  const expenses = transactions.filter(t => (parseFloat(t.amount) || 0) < 0);
  
  // Aggregate by category
  const categoryMap: Record<string, number> = {};
  let totalOutflow = 0;
  
  expenses.forEach(t => {
    const amt = Math.abs(parseFloat(t.amount) || 0);
    const cat = t.category || "Uncategorized";
    categoryMap[cat] = (categoryMap[cat] || 0) + amt;
    totalOutflow += amt;
  });

  const pieData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const PIE_COLORS = [C.alert, C.warning, C.crypto, C.equity, C.growth, C.wealth, C.textTertiary];

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Outflow (Period)</div>
           <div className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.alert }}>${totalOutflow.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div className="card-surface p-5 flex flex-col justify-center" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Highest Category</div>
           <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{pieData[0]?.name || "N/A"}</div>
           <div className="text-xs font-semibold mt-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
             ${(pieData[0]?.value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ({(pieData[0]?.value / (totalOutflow || 1) * 100).toFixed(0)}%)
           </div>
        </div>
      </div>

      <AIInsightCard title="Anomaly Detected" confidence={88}>
        Your spending in <span className="font-bold">{pieData[0]?.name || "Top Category"}</span> is elevated compared to historical averages. Consider reviewing recent transactions to ensure alignment with your Wealth OS budget rules.
      </AIInsightCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Spending Distribution</div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-primary)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories List */}
        <div className="card-surface p-5 overflow-auto max-h-[320px]" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Top Categories</div>
          <div className="space-y-3">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></div>
                  <span className="font-semibold">{item.name}</span>
                </div>
                <span className="font-mono" style={{ color: "var(--text-secondary)" }}>${item.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Recent Expenses</div>
        <div className="space-y-2 max-h-[400px] overflow-auto">
          {expenses.slice(0, 15).map(t => (
            <div key={t.id} className="flex justify-between items-center p-3 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex flex-col">
                <span className="font-bold">{t.merchant_name}</span>
                <span className="text-xs text-slate-500">{t.transaction_date} • {t.category}</span>
              </div>
              <div className="font-mono font-bold" style={{ color: C.alert }}>
                -${Math.abs(parseFloat(t.amount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Net Worth ──────────────────────────────────────────────
function NetWorthTab({ snapshots }: { snapshots: any[] }) {
  if (!snapshots || snapshots.length === 0) {
    return <EmptyState message="No historical portfolio snapshots found. OpenClaw needs to log daily snapshots to build your net worth chart." icon={TrendingUp} />;
  }
  return <div className="p-10 text-center text-slate-500">Live Net Worth View under construction.</div>;
}

// ─── Tab: Portfolio ──────────────────────────────────────────────

// ─── Empty State Component ───────────────────────────────────────
function EmptyState({ message, icon: Icon }: { message: string, icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 card-surface mt-4 mb-4" style={{ borderRadius: "var(--radius-xl)", minHeight: "200px" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
        {Icon && <Icon size={20} style={{ color: "var(--text-tertiary)" }} />}
      </div>
      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Awaiting Telemetry</div>
      <div className="text-sm text-center max-w-xs" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        {message}
      </div>
    </div>
  );
}

function FinancialsTab({ positions, purchases, snapshots, timeFilter }: { positions: any[], purchases: any[], snapshots: any[], timeFilter: string }) {
  if (!positions || positions.length === 0) {
    return <EmptyState message="No active positions found. Tell your Telegram bot you bought something to initiate OpenClaw tracking." icon={PieIcon} />;
  }

  const totalValue = positions.reduce((acc, p) => acc + (parseFloat(p.position_value) || 0), 0);
  const totalUnrealized = positions.reduce((acc, p) => acc + (parseFloat(p.unrealized_pnl) || 0), 0);

  // Risk Decomposition mock data
  const baseRiskSectors = [
    {
      sector: "Technology", pct: 52, threshold: 40, alert: true,
      holdings: [
        { symbol: "NVDA", value: 124500, pnlPct:  26.8, beta: 1.4 },
        { symbol: "MSFT", value:  98200, pnlPct:  12.4, beta: 0.8 },
        { symbol: "AAPL", value:  76400, pnlPct:  -6.9, beta: 0.9 },
        { symbol: "AMD",  value:  34200, pnlPct:  18.2, beta: 1.6 },
        { symbol: "GOOGL",value:  41800, pnlPct:   3.2, beta: 1.1 },
      ]
    },
    {
      sector: "Crypto", pct: 22, threshold: 25, alert: false,
      holdings: [
        { symbol: "COIN", value: 52100, pnlPct: 15.4, beta: 2.1 },
      ]
    },
    {
      sector: "Finance", pct: 15, threshold: 30, alert: false,
      holdings: [
        { symbol: "JPM",  value: 47800, pnlPct:  8.2, beta: 1.2 },
      ]
    },
  ];

  // Adjust mock data size based on time filter to show dynamic UI
  const riskSectors = timeFilter === "day" 
    ? baseRiskSectors.slice(0, 1) 
    : timeFilter === "week" 
      ? baseRiskSectors.slice(0, 2) 
      : baseRiskSectors;

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Active Value</div>
           <div className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.equity }}>${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Unrealized P&L</div>
           <div className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: totalUnrealized >= 0 ? C.optimal : C.critical }}>
             {totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
           </div>
        </div>
      </div>

      {/* Portfolio Constellation */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
         <PortfolioConstellation />
      </div>

      {/* Risk Decomposition Treemap */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Risk Decomposition</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Portfolio concentration by sector · Size = allocation · Color = P&L</div>
          </div>
        </div>
        <div className="space-y-4">
          {riskSectors.map(sector => (
            <div key={sector.sector}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{sector.sector}</div>
                  <div className="text-[10px] font-black font-mono" style={{ color: sector.alert ? C.alert : C.textTertiary }}>{sector.pct}%</div>
                  {sector.alert && (
                    <div className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(220,38,38,0.1)", color: C.alert, border: "1px solid rgba(220,38,38,0.25)" }}>
                      ⚠ Over {sector.threshold}% threshold
                    </div>
                  )}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Target &lt;{sector.threshold}%</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {sector.holdings.map(h => (
                  <div key={h.symbol} className="flex-1 min-w-[80px] p-3 rounded-xl"
                    style={{
                      background: h.pnlPct > 0 ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)",
                      border: `1px solid ${h.pnlPct > 0 ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`,
                    }}>
                    <div className="text-xs font-black" style={{ color: "var(--text-primary)" }}>{h.symbol}</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: h.pnlPct > 0 ? C.optimal : C.alert }}>
                      {h.pnlPct > 0 ? "+" : ""}{h.pnlPct}%
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>${(h.value/1000).toFixed(0)}K</div>
                    <div className="text-[9px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>β {h.beta}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Positions Table */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Current Positions (OpenClaw)</div>
        <div className="space-y-3">
          {positions.map(p => (
            <div key={p.id} className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div>
                <div className="font-bold text-lg flex items-center gap-2">
                  {p.symbol}
                  {p.latest_signal_action && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: "rgba(91,66,232,0.1)", color: C.equity, border: "1px solid rgba(91,66,232,0.3)" }}>
                      AI: {p.latest_signal_action}
                    </span>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{parseFloat(p.quantity).toFixed(4)} shares @ ${parseFloat(p.average_cost).toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>${parseFloat(p.position_value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div className="text-xs font-bold" style={{ fontFamily: "var(--font-mono)", color: parseFloat(p.unrealized_pnl) >= 0 ? C.optimal : C.critical }}>
                   {parseFloat(p.unrealized_pnl) >= 0 ? "+" : ""}{parseFloat(p.unrealized_pnl).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Trade Activity Queue</div>
        {purchases && purchases.length > 0 ? (
          <div className="space-y-2">
            {purchases.map(trade => (
              <div key={trade.id} className="flex justify-between items-center p-3 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}>
                <div><span className="font-bold uppercase" style={{ color: trade.direction === 'in' ? C.optimal : C.alert }}>{trade.action}</span> <span className="font-mono">{parseFloat(trade.quantity).toFixed(2)} {trade.symbol}</span></div>
                <div className="font-mono" style={{ color: "var(--text-secondary)" }}>${parseFloat(trade.total_cost).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div className="text-xs font-bold uppercase tracking-widest">
                  {trade.processed ? <span style={{ color: C.optimal }}>✓ Synced</span> : <span style={{ color: C.warning }}>⏳ Pending</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
           <div className="text-sm text-slate-500">No recent trades.</div>
        )}
      </div>
    </div>
  );
}

function CashflowTab({ transactions, timeFilter }: { transactions: any[], timeFilter: string }) {
  if (!transactions || transactions.length === 0) {
    return <EmptyState message="No cash flow data available for this period." icon={ArrowRightLeft} />;
  }

  const isShortTerm = timeFilter === "day" || timeFilter === "week" || timeFilter === "month";
  const timeMap: Record<string, { income: number, expense: number, time: string, cumulative: number }> = {};
  
  transactions.forEach(t => {
    if (!t.transaction_date) return;
    const tKey = isShortTerm ? t.transaction_date : t.transaction_date.substring(0, 7);
    const amt = parseFloat(t.amount) || 0;
    
    if (!timeMap[tKey]) timeMap[tKey] = { time: tKey, income: 0, expense: 0, cumulative: 0 };
    
    if (amt > 0) timeMap[tKey].income += amt;
    else timeMap[tKey].expense += Math.abs(amt);
  });

  const barData = Object.values(timeMap).sort((a, b) => a.time.localeCompare(b.time));
  
  let currentCumulative = 0;
  barData.forEach(d => {
    currentCumulative += (d.income - d.expense);
    d.cumulative = currentCumulative;
  });

  const totalIncome = barData.reduce((acc, curr) => acc + curr.income, 0);
  const totalExpense = barData.reduce((acc, curr) => acc + curr.expense, 0);
  const netRetention = totalIncome - totalExpense;

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-500">

      {/* Monte Carlo Wealth Projection */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Monte Carlo Wealth Projection (10 Year)</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>1,000 simulations · Current: ${(totalIncome / 1000 * 60).toFixed(0)}K est. · Monthly contribution: ${(totalIncome - totalExpense > 0 ? (totalIncome - totalExpense) : 5750).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
          </div>
        </div>

        {/* Projection area chart */}
        <div className="h-[220px] w-full mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={[
                { year: "Now",  p5: 847,  p25: 847,  p50: 847,  p75: 847,  p95: 847  },
                { year: "2Y",   p5: 820,  p25: 950,  p50: 1050, p75: 1180, p95: 1350 },
                { year: "4Y",   p5: 790,  p25: 1100, p50: 1350, p75: 1600, p95: 1950 },
                { year: "6Y",   p5: 760,  p25: 1250, p50: 1680, p75: 2100, p95: 2700 },
                { year: "8Y",   p5: 730,  p25: 1450, p50: 2050, p75: 2700, p95: 3600 },
                { year: "10Y",  p5: 700,  p25: 1700, p50: 2500, p75: 3400, p95: 4800 },
              ]}
              margin={{ top: 5, right: 5, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="mcP95" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.optimal} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={C.optimal} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="mcP5" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.alert} stopOpacity={0.08}/>
                  <stop offset="95%" stopColor={C.alert} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="year" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `$${v}K`} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="p95" stroke="transparent" fill="url(#mcP95)" name="95th" />
              <Area type="monotone" dataKey="p75" stroke={C.optimal} strokeWidth={1.5} strokeDasharray="4 2" fill="none" name="75th Percentile" />
              <Area type="monotone" dataKey="p50" stroke={C.wealth}  strokeWidth={2.5} fill="none" name="Median (50th)" />
              <Area type="monotone" dataKey="p25" stroke={C.warning} strokeWidth={1.5} strokeDasharray="4 2" fill="none" name="25th Percentile" />
              <Area type="monotone" dataKey="p5"  stroke="transparent" fill="url(#mcP5)" name="5th" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Scenarios */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Bull (75th)",  val: "$3.4M", when: "2034", color: C.optimal },
            { label: "Base (50th)",  val: "$2.5M", when: "2034", color: C.wealth  },
            { label: "Bear (25th)",  val: "$1.7M", when: "2034", color: C.warning  },
          ].map(s => (
            <div key={s.label} className="text-center p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
              <div className="text-lg font-black font-mono" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>by {s.when}</div>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-xl" style={{ background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            🔴 Lifestyle inflation risk: if spending grows 3%/yr → $1M milestone delayed ~8 months. If savings rate drops to 30% → delayed ~14 months.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-surface p-6 relative overflow-hidden" style={{ borderRadius: "var(--radius-xl)", border: "1px solid rgba(0, 227, 150, 0.2)" }}>
           <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl"></div>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Income</div>
           <div className="text-3xl font-black tracking-tight" style={{ fontFamily: "var(--font-mono)", color: "#00E396" }}>+${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div className="card-surface p-6 relative overflow-hidden" style={{ borderRadius: "var(--radius-xl)", border: "1px solid rgba(255, 69, 96, 0.2)" }}>
           <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Expenses</div>
           <div className="text-3xl font-black tracking-tight" style={{ fontFamily: "var(--font-mono)", color: "#FF4560" }}>-${totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div className="card-surface p-6 relative overflow-hidden" style={{ borderRadius: "var(--radius-xl)", background: netRetention >= 0 ? "rgba(0, 227, 150, 0.03)" : "rgba(255, 69, 96, 0.03)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Net Cash Flow</div>
           <div className="text-3xl font-black tracking-tight" style={{ fontFamily: "var(--font-mono)", color: netRetention >= 0 ? "#00E396" : "#FF4560" }}>
             {netRetention >= 0 ? "+" : ""}${netRetention.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
           </div>
        </div>
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>{isShortTerm ? 'Daily' : 'Monthly'} Cash Flow Dynamics</div>
        <div className="h-[350px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E396" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#00E396" stopOpacity={0.2}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF4560" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#FF4560" stopOpacity={0.2}/>
                </linearGradient>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#008FFB" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#008FFB" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip 
                formatter={(value: number) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
                contentStyle={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", border: "1px solid var(--border-subtle)", borderRadius: "12px", color: "var(--text-primary)", boxShadow: "var(--shadow-modal)" }}
              />
              <Bar dataKey="income" fill="url(#colorIncome)" radius={[4, 4, 0, 0]} name="Income" maxBarSize={60} />
              <Bar dataKey="expense" fill="url(#colorExpense)" radius={[4, 4, 0, 0]} name="Expense" maxBarSize={60} />
              <Area type="monotone" dataKey="cumulative" stroke="#008FFB" strokeWidth={3} fill="url(#colorCumulative)" name="Net Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
         <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Net Cash Flow (Waterfall)</div>
         <CashflowWaterfall 
           data={[
             { name: "Starting", value: 5000, cumulative: 5000 },
             { name: "Salary", value: 8000, cumulative: 13000 },
             { name: "Rent", value: -2500, cumulative: 10500 },
             { name: "Groceries", value: -800, cumulative: 9700 },
             { name: "Dining", value: -400, cumulative: 9300 },
             { name: "Dividends", value: 300, cumulative: 9600 },
             { name: "Ending", value: 9600, cumulative: 9600 }
           ]}
         />
      </div>

      <TransactionsTable transactions={transactions} />
    </div>
  );
}

// ─── Tab: Signal Intelligence ────────────────────────────────────

const MOCK_SIGNALS = [
  {
    symbol: "NVDA", action: "BUY", entry: 824.30, target: 920.00, stop: 780.00,
    confidence: 82, agents: 4, status: "active", pnl: 3800, pnlPct: 4.6,
    reason: "Trend follow — earnings consolidation support. Majority consensus with high confidence across 4 agents.",
    agentVotes: [{ name: "Trend", pct: 92 }, { name: "Momentum", pct: 78 }, { name: "Value", pct: 81 }, { name: "Technical", pct: 77 }],
  },
  {
    symbol: "MSFT", action: "BUY", entry: 405.20, target: 450.00, stop: 390.00,
    confidence: 75, agents: 3, status: "active", pnl: 3500, pnlPct: 8.6,
    reason: "Breakout — cloud segment acceleration driving multiple expansion. Strong trend + value signal.",
    agentVotes: [{ name: "Trend", pct: 80 }, { name: "Value", pct: 71 }, { name: "Technical", pct: 74 }],
  },
  {
    symbol: "TSLA", action: "SELL", entry: 195.30, target: 178.00, stop: 210.00,
    confidence: 68, agents: 3, status: "stopped", pnl: -4900, pnlPct: -8.6,
    reason: "Reversal fail — downtrend acceleration, stop-loss triggered at $178.50. Post-mortem: entered too early.",
    agentVotes: [{ name: "Momentum", pct: 65 }, { name: "Trend", pct: 72 }, { name: "Technical", pct: 67 }],
  },
  {
    symbol: "COIN", action: "BUY", entry: 145.20, target: 165.00, stop: 132.80,
    confidence: 71, agents: 4, status: "warning", pnl: 2480, pnlPct: 17.1,
    reason: "Momentum play — crypto sentiment cycle. Position approaching stop-loss, monitor closely.",
    agentVotes: [{ name: "Trend", pct: 74 }, { name: "Momentum", pct: 68 }, { name: "Value", pct: 72 }, { name: "Technical", pct: 70 }],
  },
];

function SignalIntelligenceTab({ timeFilter }: { timeFilter: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Adjust signals based on time filter
  const signals = timeFilter === "30D" ? MOCK_SIGNALS.slice(0, 2) : 
                  timeFilter === "3M" ? MOCK_SIGNALS.slice(0, 3) : 
                  MOCK_SIGNALS;

  const statusMeta = (s: string) => {
    if (s === "active")  return { label: "Active",    color: C.optimal, bg: "rgba(5,150,105,0.1)"  };
    if (s === "stopped") return { label: "Stopped",   color: C.alert,   bg: "rgba(220,38,38,0.1)"  };
    if (s === "warning") return { label: "Near Stop", color: C.warning, bg: "rgba(217,119,6,0.1)"  };
    return                      { label: s,           color: C.textTertiary, bg: "var(--surface-tertiary)" };
  };

  return (
    <div className="space-y-5">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Active Signals",  val: signals.filter(s => s.status === "active").length, color: C.optimal },
          { label: "Win Rate",        val: "67%",                                                    color: C.optimal },
          { label: "Avg Confidence",  val: `${signals.length > 0 ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length) : 0}%`, color: C.equity },
          { label: "Swarm Agents",    val: signals.reduce((a, s) => a + s.agents, 0),           color: C.growth  },
        ].map(k => (
          <div key={k.label} className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Signal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {signals.map(sig => {
          const meta   = statusMeta(sig.status);
          const isOpen = expanded === sig.symbol;
          const pnlPos = sig.pnl >= 0;
          return (
            <div key={sig.symbol} className="card-surface overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="p-5">
                {/* Symbol + status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
                      style={{
                        background: sig.action === "BUY" ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)",
                        color: sig.action === "BUY" ? C.optimal : C.alert,
                        border: `1px solid ${sig.action === "BUY" ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)"}`,
                      }}>
                      {sig.action}
                    </div>
                    <div>
                      <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{sig.symbol}</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{sig.agents} agents · Swarm consensus</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>
                      {meta.label}
                    </div>
                    <div className="text-sm font-black font-mono" style={{ color: pnlPos ? C.optimal : C.alert }}>
                      {pnlPos ? "+" : ""}${sig.pnl.toLocaleString()} ({pnlPos ? "+" : ""}{sig.pnlPct}%)
                    </div>
                  </div>
                </div>

                {/* Entry / Target / Stop */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: "Entry",  val: sig.entry,  color: "var(--text-secondary)" },
                    { label: "Target", val: sig.target, color: C.optimal },
                    { label: "Stop",   val: sig.stop,   color: C.alert   },
                  ].map(p => (
                    <div key={p.label} className="text-center p-2 rounded-lg"
                      style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-tertiary)" }}>{p.label}</div>
                      <div className="text-sm font-black font-mono" style={{ color: p.color }}>${p.val.toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                {/* Confidence bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold" style={{ color: "var(--text-secondary)" }}>Confidence</span>
                    <span className="font-black font-mono" style={{ color: C.equity }}>{sig.confidence}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                    <motion.div className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${C.equity}, ${C.optimal})` }}
                      initial={{ width: 0 }} animate={{ width: `${sig.confidence}%` }}
                      transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }} />
                  </div>
                </div>

                <button
                  onClick={() => setExpanded(isOpen ? null : sig.symbol)}
                  className="text-[11px] font-bold flex items-center gap-1"
                  style={{ color: C.equity }}>
                  {isOpen ? "Hide" : "Show"} AI Reasoning Chain
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Expanded: reasoning + agent votes */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className="px-5 pb-5 space-y-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <div className="text-[11px] pt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {sig.reason}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Swarm Agent Votes</div>
                        <div className="space-y-1.5">
                          {sig.agentVotes.map(av => (
                            <div key={av.name} className="flex items-center gap-2">
                              <div className="text-[10px] font-bold w-20 shrink-0" style={{ color: "var(--text-secondary)" }}>{av.name}</div>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                                <div className="h-full rounded-full" style={{ width: `${av.pct}%`, background: C.equity }} />
                              </div>
                              <div className="text-[10px] font-black font-mono w-8 text-right" style={{ color: C.equity }}>{av.pct}%</div>
                            </div>
                          ))}
                        </div>
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
  );
}

// ─── AI Copilot Bar ──────────────────────────────────────────────
// ─── System Banner ────────────────────────────────────────────────
// ─── Main Page ───────────────────────────────────────────────────
export default function WealthOS() {
  const [activeTab, setActiveTab] = useState("spending");
  const [positions, setPositions] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    
    import("@supabase/supabase-js").then(({ createClient }) => {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      
      sb.from('advisor_positions_with_signals').select('*').order('position_value', { ascending: false }).then(res => {
        if (res.data) setPositions(res.data);
      });
      
      sb.from('advisor_purchases').select('*').order('executed_at', { ascending: false }).limit(10).then(res => {
        if (res.data) setPurchases(res.data);
      });

      sb.from('advisor_portfolio_snapshots').select('*').order('record_date', { ascending: false }).limit(30).then(res => {
        if (res.data) setSnapshots(res.data);
      });
      sb.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5000).then(res => {
        if (res.data) setTransactions(res.data);
      });
    });
  }, []);


  const [timeFilter, setTimeFilter] = useState("month");

  const filteredTransactions = getFilteredData(transactions, timeFilter, "transaction_date");

  const tabs = [
    { id: "spending",   label: "Capital Outflow", icon: ArrowRightLeft, color: C.wealth },
    { id: "networth",  label: "Net Worth",        icon: TrendingUp,     color: C.growth },
    { id: "financials",label: "Financials",        icon: PieIcon,        color: C.equity },
    { id: "cashflow",  label: "Cash Flow",         icon: DollarSign,     color: C.crypto },
    { id: "signals",   label: "Signal Intelligence",icon: Zap,           color: C.alert  },
  ];

  const tabVariants: any = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
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
          {activeTab === "spending"   && <SpendingTab transactions={filteredTransactions} timeFilter={timeFilter} />}
            {activeTab === "networth"  && <NetWorthTab snapshots={getFilteredData(snapshots, timeFilter, "record_date")} />}
            {activeTab === "financials" && <FinancialsTab positions={positions} purchases={getFilteredData(purchases, timeFilter, "executed_at")} snapshots={snapshots} timeFilter={timeFilter} />}
            {activeTab === "cashflow"  && <CashflowTab transactions={filteredTransactions} timeFilter={timeFilter} />}
            {activeTab === "signals"   && <SignalIntelligenceTab timeFilter={timeFilter} />}
          </motion.div>
        </AnimatePresence>
      </div>

      
    </div>
  );
}
