"use client";

import { ComposedChart, Bar, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowRightLeft, DollarSign, Target } from "lucide-react";
import CashflowWaterfall from "../visualizations/CashflowWaterfall";
import TransactionsTable from "./TransactionsTable";
import { C, fmt2, EmptyState } from "./shared";

interface CashflowPanelProps {
  transactions: any[];
  timeFilter: string;
  bankBalance: number | null;
  bankBalanceStored: number | null;
  bankBalanceAt: string | null;
  savingsTarget: number | null;
}

export default function CashflowPanel({
  transactions,
  timeFilter,
  bankBalance,
  bankBalanceStored,
  bankBalanceAt,
  savingsTarget,
}: CashflowPanelProps) {
  // Bank Balance KPI — live estimate, independent of the selected time range
  const balanceCard = (
    <div
      className="card-surface p-6 relative overflow-hidden"
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid rgba(0, 143, 251, 0.2)",
      }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl"></div>
      <div
        className="text-xs font-bold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-tertiary)" }}
      >
        Bank Balance
      </div>
      {bankBalance != null ? (
        <>
          <div
            className="text-3xl font-black tracking-tight"
            style={{ fontFamily: "var(--font-mono)", color: "#008FFB" }}
          >
            €{bankBalance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-[10px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
            set to €{Number(bankBalanceStored).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {bankBalanceAt && (
              <>
                {" "}
                on{" "}
                {new Date(bankBalanceAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </>
            )}{" "}
            · updates in{" "}
            <a href="/settings" className="font-bold underline">
              Settings
            </a>
          </div>
        </>
      ) : (
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Set your bank balance in{" "}
          <a
            href="/settings"
            className="font-bold underline"
            style={{ color: "#008FFB" }}
          >
            Settings
          </a>{" "}
          to see a live estimate here.
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
  const bucketLabel = (key: string) =>
    useMonthly
      ? new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" })
      : new Date(key + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

  const timeMap: Record<
    string,
    { income: number; expense: number; sortKey: string; cumulative: number }
  > = {};

  transactions.forEach((t) => {
    if (!t.transaction_date) return;
    const key = useMonthly ? t.transaction_date.substring(0, 7) : weekKey(t.transaction_date);
    const amt = parseFloat(t.amount) || 0;

    if (!timeMap[key]) timeMap[key] = { sortKey: key, income: 0, expense: 0, cumulative: 0 };

    if (amt > 0) timeMap[key].income += amt;
    else timeMap[key].expense += Math.abs(amt);
  });

  const barData = Object.values(timeMap)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((d) => ({ ...d, time: bucketLabel(d.sortKey) }));

  let currentCumulative = 0;
  barData.forEach((d) => {
    currentCumulative += d.income - d.expense;
    d.cumulative = currentCumulative;
  });

  const totalIncome = barData.reduce((acc, curr) => acc + curr.income, 0);
  const totalExpense = barData.reduce((acc, curr) => acc + curr.expense, 0);
  const netRetention = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netRetention / totalIncome) * 100 : null;

  // Waterfall: income vs. top expense categories for the selected period (real data)
  const expByCat: Record<string, number> = {};
  transactions.forEach((t) => {
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
        <div
          className="card-surface p-6 relative overflow-hidden"
          style={{
            borderRadius: "var(--radius-xl)",
            border: "1px solid rgba(0, 227, 150, 0.2)",
          }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl"></div>
          <div
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Total Income
          </div>
          <div
            className="text-3xl font-black tracking-tight"
            style={{ fontFamily: "var(--font-mono)", color: "#00E396" }}
          >
            +${totalIncome.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div
          className="card-surface p-6 relative overflow-hidden"
          style={{
            borderRadius: "var(--radius-xl)",
            border: "1px solid rgba(255, 69, 96, 0.2)",
          }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>
          <div
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Total Expenses
          </div>
          <div
            className="text-3xl font-black tracking-tight"
            style={{ fontFamily: "var(--font-mono)", color: "#FF4560" }}
          >
            -${totalExpense.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div
          className="card-surface p-6 relative overflow-hidden"
          style={{
            borderRadius: "var(--radius-xl)",
            background: netRetention >= 0 ? "rgba(0, 227, 150, 0.03)" : "rgba(255, 69, 96, 0.03)",
          }}
        >
          <div
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Net Cash Flow
          </div>
          <div
            className="text-3xl font-black tracking-tight"
            style={{
              fontFamily: "var(--font-mono)",
              color: netRetention >= 0 ? "#00E396" : "#FF4560",
            }}
          >
            {netRetention >= 0 ? "+" : ""}
            ${netRetention.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        {balanceCard}
      </div>

      {/* Savings rate vs target */}
      {savingsRate != null && savingsTarget != null && savingsTarget > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background:
                savingsRate >= savingsTarget ? "rgba(5,150,105,0.06)" : "rgba(217,119,6,0.06)",
              border: `1px solid ${
                savingsRate >= savingsTarget
                  ? "rgba(5,150,105,0.25)"
                  : "rgba(217,119,6,0.25)"
              }`,
            }}
          >
            <Target size={12} style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }} />
            <span
              className="font-bold uppercase tracking-widest text-[9px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Savings rate
            </span>
            <span
              className="font-black font-mono"
              style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }}
            >
              {savingsRate.toFixed(1)}%
            </span>
            <span className="font-mono" style={{ color: "var(--text-tertiary)" }}>
              · target {savingsTarget}%
            </span>
            <span
              className="font-bold"
              style={{ color: savingsRate >= savingsTarget ? C.optimal : C.warning }}
            >
              {savingsRate >= savingsTarget ? "on track" : "below target"}
            </span>
          </div>
        </div>
      )}

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Income vs Expenses · {useMonthly ? "Monthly" : "Weekly"}
        </div>
        <div className="h-[350px] w-full mt-4 overflow-x-auto">
          <div className="h-full w-full" style={{ minWidth: Math.max(320, barData.length * 48) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E396" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#00E396" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF4560" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#FF4560" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#008FFB" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#008FFB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke="var(--text-tertiary)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) =>
                    `$${value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  }
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  contentStyle={{
                    background: "rgba(255,255,255,0.9)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    color: "var(--text-primary)",
                    boxShadow: "var(--shadow-modal)",
                  }}
                />
                <Bar
                  dataKey="income"
                  fill="url(#colorIncome)"
                  radius={[4, 4, 0, 0]}
                  name="Income"
                  maxBarSize={40}
                />
                <Bar
                  dataKey="expense"
                  fill="url(#colorExpense)"
                  radius={[4, 4, 0, 0]}
                  name="Expense"
                  maxBarSize={40}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#008FFB"
                  strokeWidth={3}
                  fill="url(#colorCumulative)"
                  name="Net Cumulative"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Net Cash Flow (Waterfall) · Selected Period
        </div>
        <CashflowWaterfall data={waterfallData} />
      </div>

      <TransactionsTable transactions={transactions} />
    </div>
  );
}
