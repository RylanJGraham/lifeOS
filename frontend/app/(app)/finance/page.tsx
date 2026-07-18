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

import PortfolioConstellation from "../../components/visualizations/PortfolioConstellation";
import CashflowWaterfall from "../../components/visualizations/CashflowWaterfall";
import { supabase } from "../../../utils/supabaseClient";
import { THEME } from "../../../utils/theme";

// ─── Colour palette — Light Mode ────────────────────────────────
const C = {
  ...THEME,
  wealth: "#059669",
  growth: "#0EA5E9",
  equity: "#5B42E8",
  fixed: "#D97706",
  cash: "#94A3B8",
  crypto: "#E07020",
  alert: "#DC2626",
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
  const cutoff = new Date();

  if (timeFilter === "day") cutoff.setHours(0, 0, 0, 0);          // today, local
  else if (timeFilter === "week") cutoff.setDate(now.getDate() - 7);
  else if (timeFilter === "month") cutoff.setDate(now.getDate() - 30);
  else if (timeFilter === "quarter") cutoff.setDate(now.getDate() - 90);
  else if (timeFilter === "year") cutoff.setDate(now.getDate() - 365);

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

  // Filter out income (keep only expenses, which are negative amounts)
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

  const points = snapshots
    .map(s => ({
      date: s.record_date,
      value: parseFloat(s.total_value ?? s.value ?? s.net_worth) || 0,
    }))
    .filter(p => p.date && p.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (points.length === 0) {
    return <EmptyState message="Portfolio snapshots exist but contain no usable values yet." icon={TrendingUp} />;
  }

  const latest    = points[points.length - 1];
  const first     = points[0];
  const delta     = latest.value - first.value;
  const deltaPct  = first.value !== 0 ? (delta / first.value) * 100 : 0;
  const deltaPos  = delta >= 0;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Net Worth",        val: `$${latest.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: C.growth },
          { label: "Period Change",    val: `${deltaPos ? "+" : "−"}$${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} (${deltaPos ? "+" : ""}${deltaPct.toFixed(1)}%)`, color: deltaPos ? C.optimal : C.alert },
          { label: "Snapshots",        val: `${points.length}`, color: C.equity },
        ].map(k => (
          <div key={k.label} className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* History chart */}
      <div className="card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Net Worth History · {first.date} → {latest.date}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={points} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.growth} stopOpacity={0.15}/>
                <stop offset="95%" stopColor={C.growth} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <Tooltip formatter={(v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke={C.growth} strokeWidth={2.5} fill="url(#nwFill)" name="Net Worth" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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

function FinancialsTab({ positions, purchases }: { positions: any[], purchases: any[] }) {
  if (!positions || positions.length === 0) {
    return <EmptyState message="No open positions found. Positions logged by the advisor engine will appear here." icon={PieIcon} />;
  }

  const curSym = (c: string) => (c === "EUR" ? "€" : "$");
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Positions are mixed USD/EUR — total per currency, never fake an FX conversion
  const totals: Record<string, { val: number; pnl: number }> = {};
  positions.forEach(p => {
    const cur = p.currency || "USD";
    if (!totals[cur]) totals[cur] = { val: 0, pnl: 0 };
    totals[cur].val += parseFloat(p.position_value) || 0;
    totals[cur].pnl += parseFloat(p.unrealized_pnl) || 0;
  });
  const mixed = Object.keys(totals).length > 1;

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Open Value</div>
           {Object.entries(totals).map(([cur, t]) => (
             <div key={cur} className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.equity }}>
               {curSym(cur)}{fmt(t.val)} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>{cur}</span>
             </div>
           ))}
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Unrealized P&L</div>
           {Object.entries(totals).map(([cur, t]) => (
             <div key={cur} className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: t.pnl >= 0 ? C.optimal : C.critical }}>
               {t.pnl >= 0 ? "+" : "−"}{curSym(cur)}{fmt(Math.abs(t.pnl))} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>{cur}</span>
             </div>
           ))}
        </div>
      </div>
      {mixed && (
        <div className="text-[11px] -mt-2" style={{ color: "var(--text-tertiary)" }}>
          Portfolio holds mixed currencies — totals are shown per currency, no FX conversion applied.
        </div>
      )}

      {/* Portfolio Constellation */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
         <PortfolioConstellation />
      </div>

      {/* Positions Table */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Open Positions</div>
        <div className="space-y-3">
          {positions.map(p => {
            const sym  = curSym(p.currency);
            const qty  = parseFloat(p.quantity) || 0;
            const cost = parseFloat(p.average_cost) || 0;
            const val  = parseFloat(p.position_value) || 0;
            const pnl  = parseFloat(p.unrealized_pnl) || 0;
            return (
              <div key={p.id ?? p.symbol} className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    {p.symbol}
                    {p.latest_signal_action && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: "rgba(91,66,232,0.1)", color: C.equity, border: "1px solid rgba(91,66,232,0.3)" }}>
                        AI: {p.latest_signal_action}
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{qty.toFixed(4)} shares @ {sym}{cost.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{sym}{fmt(val)}</div>
                  <div className="text-xs font-bold" style={{ fontFamily: "var(--font-mono)", color: pnl >= 0 ? C.optimal : C.critical }}>
                     {pnl >= 0 ? "+" : "−"}{sym}{fmt(Math.abs(pnl))}
                  </div>
                </div>
              </div>
            );
          })}
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

function CashflowTab({ transactions, timeFilter, bankBalance, bankBalanceStored, bankBalanceAt }: {
  transactions: any[], timeFilter: string,
  bankBalance: number | null, bankBalanceStored: number | null, bankBalanceAt: string | null,
}) {
  // Bank Balance KPI — live estimate, independent of the selected time range
  const balanceCard = (
    <div className="card-surface p-6 relative overflow-hidden" style={{ borderRadius: "var(--radius-xl)", border: "1px solid rgba(0, 143, 251, 0.2)" }}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl"></div>
      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Bank Balance</div>
      {bankBalance != null ? (
        <>
          <div className="text-3xl font-black tracking-tight" style={{ fontFamily: "var(--font-mono)", color: "#008FFB" }}>
            €{bankBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
            set to €{Number(bankBalanceStored).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {bankBalanceAt && <> on {new Date(bankBalanceAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
            {" "}· updates in <a href="/settings" className="font-bold underline">Settings</a>
          </div>
        </>
      ) : (
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Set your bank balance in <a href="/settings" className="font-bold underline" style={{ color: "#008FFB" }}>Settings</a> to see a live estimate here.
        </div>
      )}
    </div>
  );

  if (!transactions || transactions.length === 0) {
    return (
      <div className="space-y-5">
        {balanceCard}
        <EmptyState message="No cash flow data available for this period." icon={ArrowRightLeft} />
      </div>
    );
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

  // Waterfall: income vs. top expense categories for the selected period (real data)
  const expByCat: Record<string, number> = {};
  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (amt < 0) {
      const cat = t.category || "Other";
      expByCat[cat] = (expByCat[cat] || 0) + Math.abs(amt);
    }
  });
  const sortedCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);
  const topCats = sortedCats.slice(0, 4);
  const otherExp = sortedCats.slice(4).reduce((a, [, v]) => a + v, 0);

  const waterfallData: { name: string; value: number; cumulative: number }[] = [];
  let wfCum = 0;
  if (totalIncome > 0) {
    wfCum = totalIncome;
    waterfallData.push({ name: "Income", value: totalIncome, cumulative: wfCum });
  }
  topCats.forEach(([name, v]) => {
    wfCum -= v;
    waterfallData.push({ name, value: -v, cumulative: wfCum });
  });
  if (otherExp > 0) {
    wfCum -= otherExp;
    waterfallData.push({ name: "Other", value: -otherExp, cumulative: wfCum });
  }
  waterfallData.push({ name: "Net", value: wfCum, cumulative: wfCum });

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-500">

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
        {balanceCard}
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
         <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Net Cash Flow (Waterfall) · Selected Period</div>
         <CashflowWaterfall data={waterfallData} />
      </div>

      <TransactionsTable transactions={transactions} />
    </div>
  );
}

// ─── Tab: Signal Intelligence ────────────────────────────────────

function SignalIntelligenceTab() {
  return <EmptyState message="No trade signals yet. Signals generated by the advisor swarm will appear here." icon={Zap} />;
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
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    supabase.from('advisor_positions_with_signals').select('*').eq('status', 'open').order('position_value', { ascending: false }).then(res => {
      if (res.data) setPositions(res.data);
    });

    supabase.from('advisor_purchases').select('*').order('executed_at', { ascending: false }).limit(10).then(res => {
      if (res.data) setPurchases(res.data);
    });

    supabase.from('advisor_portfolio_snapshots').select('*').order('record_date', { ascending: false }).limit(30).then(res => {
      if (res.data) setSnapshots(res.data);
    });
    supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5000).then(res => {
      if (res.data) setTransactions(res.data);
    });
    supabase.from('user_profiles').select('bank_balance, bank_balance_updated_at').limit(1).then(res => {
      if (res.data && res.data.length > 0) setProfile(res.data[0]);
    });
  }, []);


  const [timeFilter, setTimeFilter] = useState("month");

  const filteredTransactions = getFilteredData(transactions, timeFilter, "transaction_date");
  const latestTxDate = transactions.length > 0 ? transactions[0].transaction_date : null;

  // Live bank balance: stored balance + net transaction change since it was set
  let liveBalance: number | null = null;
  if (profile?.bank_balance != null) {
    const stored = parseFloat(profile.bank_balance);
    if (Number.isFinite(stored)) {
      const since = profile.bank_balance_updated_at
        ? new Date(profile.bank_balance_updated_at).toISOString().slice(0, 10)
        : null;
      const net = transactions.reduce((a, t) => {
        if (!t.transaction_date) return a;
        if (since && t.transaction_date <= since) return a;
        return a + (parseFloat(t.amount) || 0);
      }, 0);
      liveBalance = stored + net;
    }
  }

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
              Capital Command: Liquidity, runway &amp; financial velocity · Data through {latestTxDate ?? "—"}
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
            {activeTab === "financials" && <FinancialsTab positions={positions} purchases={getFilteredData(purchases, timeFilter, "executed_at")} />}
            {activeTab === "cashflow"  && <CashflowTab transactions={filteredTransactions} timeFilter={timeFilter} bankBalance={liveBalance} bankBalanceStored={profile?.bank_balance ?? null} bankBalanceAt={profile?.bank_balance_updated_at ?? null} />}
            {activeTab === "signals"   && <SignalIntelligenceTab />}
          </motion.div>
        </AnimatePresence>
      </div>


    </div>
  );
}
