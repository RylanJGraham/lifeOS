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

const curSym = (c: string) => (c === "EUR" ? "€" : "$");
const fmt2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
function SpendingTab({ transactions, allTransactions, timeFilter }: { transactions: any[], allTransactions: any[], timeFilter: string }) {
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

  // ── Daily spending trend (filtered period) ──
  const byDay: Record<string, number> = {};
  expenses.forEach(t => {
    if (!t.transaction_date) return;
    byDay[t.transaction_date] = (byDay[t.transaction_date] || 0) + Math.abs(parseFloat(t.amount) || 0);
  });
  const dailyData = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, spend]) => ({ date: date.slice(5), spend: +spend.toFixed(2) }));

  // ── Merchant leaderboard (filtered period) ──
  const byMerchant: Record<string, { total: number; count: number }> = {};
  expenses.forEach(t => {
    const m = t.merchant_name || "Unknown";
    if (!byMerchant[m]) byMerchant[m] = { total: 0, count: 0 };
    byMerchant[m].total += Math.abs(parseFloat(t.amount) || 0);
    byMerchant[m].count += 1;
  });
  const merchants = Object.entries(byMerchant)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const maxMerchant = merchants.length > 0 ? merchants[0].total : 1;

  // ── Month-over-month comparison (calendar months, all transactions) ──
  const nowD = new Date();
  const mThisKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  const prevD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const mLastKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
  const mLastLabel = prevD.toLocaleDateString("en-US", { month: "short" });

  const monthAgg = (key: string) => {
    let spend = 0;
    const cats: Record<string, number> = {};
    (allTransactions || []).forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (amt >= 0 || !t.transaction_date || !t.transaction_date.startsWith(key)) return;
      const abs = Math.abs(amt);
      spend += abs;
      const cat = t.category || "Uncategorized";
      cats[cat] = (cats[cat] || 0) + abs;
    });
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    return { spend, topCat: top ? { name: top[0], value: top[1] } : null, cats };
  };
  const mThis = monthAgg(mThisKey);
  const mLast = monthAgg(mLastKey);
  const momPct = mLast.spend > 0 ? ((mThis.spend - mLast.spend) / mLast.spend) * 100 : null;
  const topCatLastVal = mThis.topCat ? (mLast.cats[mThis.topCat.name] || 0) : 0;
  const topCatDelta = mThis.topCat ? mThis.topCat.value - topCatLastVal : null;

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Total Outflow (Period)</div>
           <div className="text-2xl sm:text-3xl font-black break-all" style={{ fontFamily: "var(--font-mono)", color: C.alert }}>${totalOutflow.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div className="card-surface p-5 flex flex-col justify-center" style={{ borderRadius: "var(--radius-xl)" }}>
           <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Highest Category</div>
           <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{pieData[0]?.name || "N/A"}</div>
           <div className="text-xs font-semibold mt-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
             ${(pieData[0]?.value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ({(pieData[0]?.value / (totalOutflow || 1) * 100).toFixed(0)}%)
           </div>
        </div>
      </div>

      {/* Month-over-month chips */}
      {mThis.spend > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <span className="font-bold uppercase tracking-widest text-[9px]" style={{ color: "var(--text-tertiary)" }}>This month</span>
            <span className="font-black font-mono" style={{ color: "var(--text-primary)" }}>${fmt2(mThis.spend)}</span>
            {momPct != null && (
              <span className="font-bold font-mono" style={{ color: momPct <= 0 ? C.optimal : C.alert }}>
                {momPct <= 0 ? "▼" : "▲"} {Math.abs(momPct).toFixed(0)}% vs {mLastLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <span className="font-bold uppercase tracking-widest text-[9px]" style={{ color: "var(--text-tertiary)" }}>{mLastLabel}</span>
            <span className="font-black font-mono" style={{ color: "var(--text-secondary)" }}>
              {mLast.spend > 0 ? `$${fmt2(mLast.spend)}` : "no data"}
            </span>
          </div>
          {mThis.topCat && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <span className="font-bold uppercase tracking-widest text-[9px]" style={{ color: "var(--text-tertiary)" }}>Top · {mThis.topCat.name}</span>
              <span className="font-black font-mono" style={{ color: "var(--text-primary)" }}>${fmt2(mThis.topCat.value)}</span>
              {topCatDelta != null && mLast.spend > 0 && (
                <span className="font-bold font-mono" style={{ color: topCatDelta <= 0 ? C.optimal : C.alert }}>
                  {topCatDelta <= 0 ? "−" : "+"}${fmt2(Math.abs(topCatDelta))} vs {mLastLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Daily spending trend */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Daily Spending Trend</div>
        <div className="h-[220px] w-full overflow-x-auto">
          <div className="h-full w-full" style={{ minWidth: dailyData.length * 24 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={50} />
                <Tooltip
                  formatter={(value: number) => [`$${fmt2(value)}`, "Spend"]}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <Bar dataKey="spend" fill={C.alert} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Merchant leaderboard */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Merchant Leaderboard · Top {merchants.length}</div>
          <div className="space-y-3">
            {merchants.map((m, i) => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black font-mono w-4 shrink-0" style={{ color: "var(--text-tertiary)" }}>{i + 1}</span>
                    <span className="font-bold truncate" style={{ color: "var(--text-primary)" }}>{m.name}</span>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>×{m.count}</span>
                  </div>
                  <span className="font-mono font-bold shrink-0 ml-2" style={{ color: "var(--text-secondary)" }}>${fmt2(m.total)}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: C.wealth }}
                    initial={{ width: 0 }} animate={{ width: `${(m.total / maxMerchant) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0, 0, 0.2, 1], delay: i * 0.05 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category donut + list */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Spending Distribution</div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
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
          <div className="space-y-2 mt-3 overflow-auto max-h-[160px]">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></div>
                  <span className="font-semibold truncate">{item.name}</span>
                </div>
                <span className="font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>${item.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
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
            <div key={t.id} className="flex justify-between items-center gap-3 p-3 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex flex-col min-w-0">
                <span className="font-bold truncate">{t.merchant_name}</span>
                <span className="text-xs text-slate-500 truncate">{t.transaction_date} • {t.category}</span>
              </div>
              <div className="font-mono font-bold shrink-0" style={{ color: C.alert }}>
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
function NetWorthTab({ snapshots, bankBalance, positions }: { snapshots: any[], bankBalance: number | null, positions: any[] }) {
  // Portfolio totals per currency (no FX conversion)
  const totals: Record<string, number> = {};
  (positions || []).forEach(p => {
    const cur = p.currency || "USD";
    totals[cur] = (totals[cur] || 0) + (parseFloat(p.position_value) || 0);
  });
  const eurPortfolio = totals["EUR"] || 0;
  const usdPortfolio = totals["USD"] || 0;
  const hasPortfolio = Object.keys(totals).length > 0;
  const eurTotal = (bankBalance ?? 0) + eurPortfolio;

  const points = (snapshots || [])
    .map(s => ({
      date: s.record_date,
      value: parseFloat(s.total_value ?? s.value ?? s.net_worth) || 0,
    }))
    .filter(p => p.date && p.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasHistory = points.length > 0;
  const latest    = hasHistory ? points[points.length - 1] : null;
  const first     = hasHistory ? points[0] : null;
  const delta     = hasHistory ? latest!.value - first!.value : 0;
  const deltaPct  = hasHistory && first!.value !== 0 ? (delta / first!.value) * 100 : 0;
  const deltaPos  = delta >= 0;

  return (
    <div className="space-y-5">
      {/* Current net worth — honest, point-in-time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Cash · Live Estimate</div>
          {bankBalance != null ? (
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.growth }}>€{fmt2(bankBalance)}</div>
          ) : (
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Set your bank balance in <a href="/settings" className="font-bold underline">Settings</a>.
            </div>
          )}
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Investments</div>
          {hasPortfolio ? Object.entries(totals).map(([cur, v]) => (
            <div key={cur} className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.equity }}>
              {curSym(cur)}{fmt2(v)} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>{cur}</span>
            </div>
          )) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>No open positions.</div>
          )}
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Net Worth · Current</div>
          {bankBalance != null || hasPortfolio ? (
            <>
              {(bankBalance != null || eurPortfolio > 0) && (
                <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.wealth }}>
                  €{fmt2(eurTotal)} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>EUR</span>
                </div>
              )}
              {usdPortfolio > 0 && (
                <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.wealth }}>
                  ${fmt2(usdPortfolio)} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>USD</span>
                </div>
              )}
              <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>per currency · no FX conversion</div>
            </>
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>
          )}
        </div>
      </div>

      {/* History — only when real snapshots exist */}
      {hasHistory ? (
        <div className="card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Net Worth History · {first!.date} → {latest!.date}
            </div>
            <div className="text-xs font-bold font-mono" style={{ color: deltaPos ? C.optimal : C.alert }}>
              {deltaPos ? "+" : "−"}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({deltaPos ? "+" : ""}{deltaPct.toFixed(1)}%)
            </div>
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
      ) : (
        <div className="card-surface p-6 flex items-start gap-3" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <TrendingUp size={16} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>History starts when snapshots arrive</div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              The figures above are today's live point-in-time net worth. Once the advisor begins logging daily
              portfolio snapshots, the net-worth history chart will build itself here — no backfilled or estimated history.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Portfolio ──────────────────────────────────────────────

function FinancialsTab({ positions }: { positions: any[] }) {
  if (!positions || positions.length === 0) {
    return <EmptyState message="No open positions found. Positions logged by the advisor engine will appear here." icon={PieIcon} />;
  }

  const fmt = fmt2;

  // Positions are mixed USD/EUR — total per currency, never fake an FX conversion
  const totals: Record<string, { val: number; pnl: number }> = {};
  positions.forEach(p => {
    const cur = p.currency || "USD";
    if (!totals[cur]) totals[cur] = { val: 0, pnl: 0 };
    totals[cur].val += parseFloat(p.position_value) || 0;
    totals[cur].pnl += parseFloat(p.unrealized_pnl) || 0;
  });
  const mixed = Object.keys(totals).length > 1;

  // Allocation donut — top 8 positions by value + Other (raw values, mixed currencies)
  const ALLOC_COLORS = [C.equity, C.growth, C.wealth, C.crypto, C.warning, C.alert, "#0D9488", "#64748B", C.cash];
  const sortedByVal = [...positions].sort((a, b) => (parseFloat(b.position_value) || 0) - (parseFloat(a.position_value) || 0));
  const totalVal = sortedByVal.reduce((a, p) => a + (parseFloat(p.position_value) || 0), 0);
  const topAlloc = sortedByVal.slice(0, 8);
  const otherVal = sortedByVal.slice(8).reduce((a, p) => a + (parseFloat(p.position_value) || 0), 0);
  const allocData = topAlloc.map(p => ({
    name: p.symbol,
    value: parseFloat(p.position_value) || 0,
    currency: p.currency || "USD",
  }));
  if (otherVal > 0) allocData.push({ name: "Other", value: otherVal, currency: "USD" });

  // Per-position P&L bars
  const pnlData = [...positions]
    .map(p => ({
      symbol: p.symbol,
      pnl: +(parseFloat(p.unrealized_pnl) || 0).toFixed(2),
      currency: p.currency || "USD",
    }))
    .sort((a, b) => b.pnl - a.pnl);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Allocation donut */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Allocation by Position Value</div>
          <div className="text-[10px] mb-3" style={{ color: "var(--text-tertiary)" }}>Share of raw position value · mixed USD/EUR</div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {allocData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={ALLOC_COLORS[index % ALLOC_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [`${curSym(props.payload.currency)}${fmt2(value)}`, name]}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-3 overflow-auto max-h-[160px]">
            {allocData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ALLOC_COLORS[idx % ALLOC_COLORS.length] }}></div>
                  <span className="font-semibold truncate">{item.name}</span>
                </div>
                <span className="font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
                  {totalVal > 0 ? `${((item.value / totalVal) * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-position P&L bars */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Unrealized P&L by Position</div>
          <div className="text-[10px] mb-3" style={{ color: "var(--text-tertiary)" }}>Each bar in the position's own currency (see table)</div>
          <div style={{ height: Math.max(220, pnlData.length * 30) }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <XAxis type="number" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="symbol" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [`${curSym(props.payload.currency)}${fmt2(value)}`, "P&L"]}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <ReferenceLine x={0} stroke="var(--border-active)" />
                <Bar dataKey="pnl" radius={[0, 3, 3, 0]} maxBarSize={16}>
                  {pnlData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? C.optimal : C.alert} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
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
    </div>
  );
}

function CashflowTab({ transactions, timeFilter, bankBalance, bankBalanceStored, bankBalanceAt, savingsTarget }: {
  transactions: any[], timeFilter: string,
  bankBalance: number | null, bankBalanceStored: number | null, bankBalanceAt: string | null,
  savingsTarget: number | null,
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

  // Bucket weekly for short ranges, monthly for the year view
  const useMonthly = timeFilter === "year";
  const weekKey = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return d.toISOString().slice(0, 10);
  };
  const bucketLabel = (key: string) => useMonthly
    ? new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" })
    : new Date(key + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const timeMap: Record<string, { income: number, expense: number, sortKey: string, cumulative: number }> = {};

  transactions.forEach(t => {
    if (!t.transaction_date) return;
    const key = useMonthly ? t.transaction_date.substring(0, 7) : weekKey(t.transaction_date);
    const amt = parseFloat(t.amount) || 0;

    if (!timeMap[key]) timeMap[key] = { sortKey: key, income: 0, expense: 0, cumulative: 0 };

    if (amt > 0) timeMap[key].income += amt;
    else timeMap[key].expense += Math.abs(amt);
  });

  const barData = Object.values(timeMap)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(d => ({ ...d, time: bucketLabel(d.sortKey) }));

  let currentCumulative = 0;
  barData.forEach(d => {
    currentCumulative += (d.income - d.expense);
    d.cumulative = currentCumulative;
  });

  const totalIncome = barData.reduce((acc, curr) => acc + curr.income, 0);
  const totalExpense = barData.reduce((acc, curr) => acc + curr.expense, 0);
  const netRetention = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netRetention / totalIncome) * 100 : null;

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

      {/* Savings rate vs target */}
      {savingsRate != null && savingsTarget != null && savingsTarget > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: savingsRate >= savingsTarget ? "rgba(5,150,105,0.06)" : "rgba(217,119,6,0.06)",
              border: `1px solid ${savingsRate >= savingsTarget ? "rgba(5,150,105,0.25)" : "rgba(217,119,6,0.25)"}`,
            }}>
            <Target size={12} style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }} />
            <span className="font-bold uppercase tracking-widest text-[9px]" style={{ color: "var(--text-tertiary)" }}>Savings rate</span>
            <span className="font-black font-mono" style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }}>
              {savingsRate.toFixed(1)}%
            </span>
            <span className="font-mono" style={{ color: "var(--text-tertiary)" }}>· target {savingsTarget}%</span>
            <span className="font-bold" style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }}>
              {savingsRate >= savingsTarget ? "on track" : "below target"}
            </span>
          </div>
        </div>
      )}

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Income vs Expenses · {useMonthly ? "Monthly" : "Weekly"}
        </div>
        <div className="h-[350px] w-full mt-4 overflow-x-auto">
          <div className="h-full w-full" style={{ minWidth: barData.length * 48 }}>
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
              <Bar dataKey="income" fill="url(#colorIncome)" radius={[4, 4, 0, 0]} name="Income" maxBarSize={40} />
              <Bar dataKey="expense" fill="url(#colorExpense)" radius={[4, 4, 0, 0]} name="Expense" maxBarSize={40} />
              <Area type="monotone" dataKey="cumulative" stroke="#008FFB" strokeWidth={3} fill="url(#colorCumulative)" name="Net Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
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

// ─── Main Page ───────────────────────────────────────────────────
export default function WealthOS() {
  const [activeTab, setActiveTab] = useState("spending");
  const [positions, setPositions] = useState<any[]>([]);
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

    supabase.from('advisor_portfolio_snapshots').select('*').order('record_date', { ascending: false }).limit(30).then(res => {
      if (res.data) setSnapshots(res.data);
    });
    supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5000).then(res => {
      if (res.data) setTransactions(res.data);
    });
    supabase.from('user_profiles').select('bank_balance, bank_balance_updated_at, base_salary, target_savings_rate').limit(1).then(res => {
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

  const savingsTarget = profile?.target_savings_rate != null ? parseFloat(profile.target_savings_rate) : null;

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
            {activeTab === "spending"   && <SpendingTab transactions={filteredTransactions} allTransactions={transactions} timeFilter={timeFilter} />}
            {activeTab === "networth"   && <NetWorthTab snapshots={getFilteredData(snapshots, timeFilter, "record_date")} bankBalance={liveBalance} positions={positions} />}
            {activeTab === "financials" && <FinancialsTab positions={positions} />}
            {activeTab === "cashflow"   && <CashflowTab transactions={filteredTransactions} timeFilter={timeFilter} bankBalance={liveBalance} bankBalanceStored={profile?.bank_balance ?? null} bankBalanceAt={profile?.bank_balance_updated_at ?? null} savingsTarget={savingsTarget} />}
            {activeTab === "signals"    && <SignalIntelligenceTab />}
          </motion.div>
        </AnimatePresence>
      </div>


    </div>
  );
}
