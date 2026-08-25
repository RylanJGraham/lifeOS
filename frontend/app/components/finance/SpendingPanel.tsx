"use client";

import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CreditCard } from "lucide-react";
import { C, fmt2, EmptyState } from "./shared";

interface SpendingPanelProps {
  transactions: any[];
  allTransactions: any[];
  timeFilter: string;
}

export default function SpendingPanel({ transactions, allTransactions, timeFilter }: SpendingPanelProps) {
  if (!transactions || transactions.length === 0) {
    return <EmptyState message="No spending transactions recorded for this period." icon={CreditCard} />;
  }

  // Filter out income (keep only expenses, which are negative amounts)
  const expenses = transactions.filter((t) => (parseFloat(t.amount) || 0) < 0);

  // Aggregate by category
  const categoryMap: Record<string, number> = {};
  let totalOutflow = 0;

  expenses.forEach((t) => {
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
  expenses.forEach((t) => {
    if (!t.transaction_date) return;
    byDay[t.transaction_date] = (byDay[t.transaction_date] || 0) + Math.abs(parseFloat(t.amount) || 0);
  });
  const dailyData = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, spend]) => ({ date: date.slice(5), spend: +spend.toFixed(2) }));

  // ── Merchant leaderboard (filtered period) ──
  const byMerchant: Record<string, { total: number; count: number }> = {};
  expenses.forEach((t) => {
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
    (allTransactions || []).forEach((t) => {
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
  const topCatLastVal = mThis.topCat ? mLast.cats[mThis.topCat.name] || 0 : 0;
  const topCatDelta = mThis.topCat ? mThis.topCat.value - topCatLastVal : null;

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Total Outflow (Period)
          </div>
          <div
            className="text-2xl sm:text-3xl font-black break-all"
            style={{ fontFamily: "var(--font-mono)", color: C.alert }}
          >
            ${totalOutflow.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div
          className="card-surface p-5 flex flex-col justify-center"
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <div
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Highest Category
          </div>
          <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            {pieData[0]?.name || "N/A"}
          </div>
          <div
            className="text-xs font-semibold mt-1"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            ${(pieData[0]?.value || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ({((pieData[0]?.value / (totalOutflow || 1)) * 100).toFixed(0)}%)
          </div>
        </div>
      </div>

      {/* Month-over-month chips */}
      {mThis.spend > 0 && (
        <div className="flex flex-wrap gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: "var(--surface-tertiary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span
              className="font-bold uppercase tracking-widest text-[9px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              This month
            </span>
            <span className="font-black font-mono" style={{ color: "var(--text-primary)" }}>
              ${fmt2(mThis.spend)}
            </span>
            {momPct != null && (
              <span
                className="font-bold font-mono"
                style={{ color: momPct <= 0 ? C.optimal : C.alert }}
              >
                {momPct <= 0 ? "▼" : "▲"} {Math.abs(momPct).toFixed(0)}% vs {mLastLabel}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: "var(--surface-tertiary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span
              className="font-bold uppercase tracking-widest text-[9px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {mLastLabel}
            </span>
            <span className="font-black font-mono" style={{ color: "var(--text-secondary)" }}>
              {mLast.spend > 0 ? `$${fmt2(mLast.spend)}` : "no data"}
            </span>
          </div>
          {mThis.topCat && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span
                className="font-bold uppercase tracking-widest text-[9px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                Top · {mThis.topCat.name}
              </span>
              <span className="font-black font-mono" style={{ color: "var(--text-primary)" }}>
                ${fmt2(mThis.topCat.value)}
              </span>
              {topCatDelta != null && mLast.spend > 0 && (
                <span
                  className="font-bold font-mono"
                  style={{ color: topCatDelta <= 0 ? C.optimal : C.alert }}
                >
                  {topCatDelta <= 0 ? "−" : "+"}${fmt2(Math.abs(topCatDelta))} vs {mLastLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Daily spending trend */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Daily Spending Trend
        </div>
        <div className="h-[220px] w-full overflow-x-auto">
          <div className="h-full w-full" style={{ minWidth: Math.max(320, dailyData.length * 24) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  stroke="var(--text-tertiary)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--text-tertiary)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={50}
                />
                <Tooltip
                  formatter={(value: number) => [`$${fmt2(value)}`, "Spend"]}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  contentStyle={{
                    background: "var(--surface-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
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
          <div
            className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            Merchant Leaderboard · Top {merchants.length}
          </div>
          <div className="space-y-3">
            {merchants.map((m, i) => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[10px] font-black font-mono w-4 shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {m.name}
                    </span>
                    <span
                      className="text-[10px] font-mono shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      ×{m.count}
                    </span>
                  </div>
                  <span
                    className="font-mono font-bold shrink-0 ml-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ${fmt2(m.total)}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-tertiary)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: C.wealth }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(m.total / maxMerchant) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0, 0, 0.2, 1], delay: i * 0.05 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category donut + list */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            Spending Distribution
          </div>
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
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                  contentStyle={{
                    background: "var(--surface-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    color: "var(--text-primary)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-3 overflow-auto max-h-[160px]">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                    }}
                  />
                  <span className="font-semibold truncate">{item.name}</span>
                </div>
                <span
                  className="font-mono shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  ${item.value.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Expenses Table */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Recent Expenses
        </div>
        <div className="space-y-2 max-h-[400px] overflow-auto">
          {expenses.slice(0, 15).map((t) => (
            <div
              key={t.id}
              className="flex justify-between items-center gap-3 p-3 rounded-lg text-sm"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-bold truncate">{t.merchant_name}</span>
                <span className="text-xs text-slate-500 truncate">
                  {t.transaction_date} • {t.category}
                </span>
              </div>
              <div
                className="font-mono font-bold shrink-0"
                style={{ color: C.alert }}
              >
                -${Math.abs(parseFloat(t.amount) || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
