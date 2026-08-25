"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { C, curSym, fmt2 } from "./shared";

interface NetWorthPanelProps {
  snapshots: any[];
  bankBalance: number | null;
  positions: any[];
}

export default function NetWorthPanel({ snapshots, bankBalance, positions }: NetWorthPanelProps) {
  // Portfolio totals per currency (no FX conversion)
  const totals: Record<string, number> = {};
  (positions || []).forEach((p) => {
    const cur = p.currency || "USD";
    totals[cur] = (totals[cur] || 0) + (parseFloat(p.position_value) || 0);
  });
  const eurPortfolio = totals["EUR"] || 0;
  const usdPortfolio = totals["USD"] || 0;
  const hasPortfolio = Object.keys(totals).length > 0;
  const eurTotal = (bankBalance ?? 0) + eurPortfolio;

  const points = (snapshots || [])
    .map((s) => ({
      date: s.record_date,
      value: parseFloat(s.total_value ?? s.value ?? s.net_worth) || 0,
    }))
    .filter((p) => p.date && p.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasHistory = points.length > 0;
  const latest = hasHistory ? points[points.length - 1] : null;
  const first = hasHistory ? points[0] : null;
  const delta = hasHistory ? latest!.value - first!.value : 0;
  const deltaPct = hasHistory && first!.value !== 0 ? (delta / first!.value) * 100 : 0;
  const deltaPos = delta >= 0;

  return (
    <div className="space-y-5">
      {/* Current net worth — honest, point-in-time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Cash · Live Estimate
          </div>
          {bankBalance != null ? (
            <div
              className="text-2xl font-black"
              style={{ fontFamily: "var(--font-mono)", color: C.growth }}
            >
              €{fmt2(bankBalance)}
            </div>
          ) : (
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Set your bank balance in{" "}
              <a href="/settings" className="font-bold underline">
                Settings
              </a>
              .
            </div>
          )}
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Investments
          </div>
          {hasPortfolio ? (
            Object.entries(totals).map(([cur, v]) => (
              <div
                key={cur}
                className="text-2xl font-black"
                style={{ fontFamily: "var(--font-mono)", color: C.equity }}
              >
                {curSym(cur)}
                {fmt2(v)}{" "}
                <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>
                  {cur}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No open positions.
            </div>
          )}
        </div>
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Net Worth · Current
          </div>
          {bankBalance != null || hasPortfolio ? (
            <>
              {(bankBalance != null || eurPortfolio > 0) && (
                <div
                  className="text-2xl font-black"
                  style={{ fontFamily: "var(--font-mono)", color: C.wealth }}
                >
                  €{fmt2(eurTotal)}{" "}
                  <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>
                    EUR
                  </span>
                </div>
              )}
              {usdPortfolio > 0 && (
                <div
                  className="text-2xl font-black"
                  style={{ fontFamily: "var(--font-mono)", color: C.wealth }}
                >
                  ${fmt2(usdPortfolio)}{" "}
                  <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>
                    USD
                  </span>
                </div>
              )}
              <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                per currency · no FX conversion
              </div>
            </>
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              —
            </div>
          )}
        </div>
      </div>

      {/* History — only when real snapshots exist */}
      {hasHistory ? (
        <div className="card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Net Worth History · {first!.date} → {latest!.date}
            </div>
            <div
              className="text-xs font-bold font-mono"
              style={{ color: deltaPos ? C.optimal : C.alert }}
            >
              {deltaPos ? "+" : "−"}
              {curSym("EUR")}
              {Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} (
              {deltaPos ? "+" : ""}
              {deltaPct.toFixed(1)}%)
            </div>
          </div>
          <div className="h-[320px] w-full overflow-x-auto">
            <div className="h-full w-full" style={{ minWidth: Math.max(320, points.length * 24) }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.growth} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.growth} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${curSym("EUR")}${(v / 1000).toFixed(0)}K`}
                    stroke="var(--text-tertiary)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    formatter={(v: number) =>
                      `${curSym("EUR")}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    }
                    contentStyle={{
                      background: "var(--surface-secondary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={C.growth}
                    strokeWidth={2.5}
                    fill="url(#nwFill)"
                    name="Net Worth"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-surface p-6 flex items-start gap-3" style={{ borderRadius: "var(--radius-xl)" }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
          >
            <TrendingUp size={16} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div>
            <div
              className="text-xs font-bold uppercase tracking-widest mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              History starts when snapshots arrive
            </div>
            <div
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}
            >
              The figures above are today's live point-in-time net worth. Once the advisor begins
              logging daily portfolio snapshots, the net-worth history chart will build itself here
              — no backfilled or estimated history.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
