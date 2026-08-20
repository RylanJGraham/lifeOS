"use client";

import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Wallet, TrendingUp, TrendingDown, Shield, AlertTriangle, PieChart as PieIcon } from "lucide-react";
import PortfolioConstellation from "../visualizations/PortfolioConstellation";
import type { Position, Snapshot } from "./types";
import { C, num, curSym, fmt2, fmtMoney, EmptyState, SectionCard } from "./shared";

const ALLOC_COLORS = [C.equity, C.growth, C.wealth, C.crypto, C.warning, C.alert, "#0D9488", "#64748B", C.cash];

function KpiCard({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div style={accent ? { color: accent } : undefined}>{children}</div>
    </div>
  );
}

export default function PortfolioOverview({ positions, snapshots }: {
  positions: Position[];
  snapshots: Snapshot[];
}) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  // Positions are mixed USD/EUR — total per currency, never fake an FX conversion
  const totals: Record<string, { val: number; pnl: number }> = {};
  positions.forEach(p => {
    const cur = p.currency || "USD";
    if (!totals[cur]) totals[cur] = { val: 0, pnl: 0 };
    totals[cur].val += num(p.position_value);
    totals[cur].pnl += num(p.unrealized_pnl);
  });
  const mixed = Object.keys(totals).length > 1;

  // Allocation donut — top 8 positions by value + Other (raw values, mixed currencies)
  const sortedByVal = [...positions].sort((a, b) => num(b.position_value) - num(a.position_value));
  const totalVal = sortedByVal.reduce((a, p) => a + num(p.position_value), 0);
  const allocData = sortedByVal.slice(0, 8).map(p => ({
    name: p.symbol,
    value: num(p.position_value),
    currency: p.currency || "USD",
  }));
  const otherVal = sortedByVal.slice(8).reduce((a, p) => a + num(p.position_value), 0);
  if (otherVal > 0) allocData.push({ name: "Other", value: otherVal, currency: "USD" });

  // Net-worth history from daily snapshots
  const points = snapshots
    .map(s => ({ date: s.record_date, value: num(s.total_value) }))
    .filter(p => p.date && p.value > 0);
  const hasHistory = points.length > 0;
  const firstPt = hasHistory ? points[0] : null;
  const lastPt = hasHistory ? points[points.length - 1] : null;
  const delta = hasHistory ? lastPt!.value - firstPt!.value : 0;
  const deltaPct = hasHistory && firstPt!.value !== 0 ? (delta / firstPt!.value) * 100 : 0;

  const dailyPnl = latest ? num(latest.daily_pnl) : null;
  const beta = latest ? num(latest.beta_estimate) : null;
  const riskFlags = latest?.risk_flags || [];

  return (
    <div className="space-y-5">
      {/* Hero — orbiting positions visual (fetches advisor_positions itself) */}
      <PortfolioConstellation />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Value">
          {latest ? (
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.equity }}>
              ${fmt2(num(latest.total_value))}
            </div>
          ) : Object.keys(totals).length > 0 ? (
            Object.entries(totals).map(([cur, t]) => (
              <div key={cur} className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.equity }}>
                {curSym(cur)}{fmt2(t.val)} <span className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>{cur}</span>
              </div>
            ))
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>
          )}
        </KpiCard>

        <KpiCard label="Unrealized P&L">
          {latest && latest.unrealized_pnl != null ? (
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: num(latest.unrealized_pnl) >= 0 ? C.optimal : C.critical }}>
              {num(latest.unrealized_pnl) >= 0 ? "+" : "−"}${fmt2(Math.abs(num(latest.unrealized_pnl)))}
            </div>
          ) : Object.keys(totals).length > 0 ? (
            Object.entries(totals).map(([cur, t]) => (
              <div key={cur} className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: t.pnl >= 0 ? C.optimal : C.critical }}>
                {t.pnl >= 0 ? "+" : "−"}{curSym(cur)}{fmt2(Math.abs(t.pnl))}
              </div>
            ))
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>
          )}
        </KpiCard>

        <KpiCard label="Cash">
          {latest && latest.cash != null ? (
            <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.growth }}>
              ${fmt2(num(latest.cash))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Awaiting first snapshot</div>
          )}
        </KpiCard>

        <KpiCard label="Daily P&L">
          {dailyPnl != null ? (
            <div className="flex items-center gap-2">
              {dailyPnl >= 0
                ? <TrendingUp size={16} style={{ color: C.optimal }} />
                : <TrendingDown size={16} style={{ color: C.alert }} />}
              <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: dailyPnl >= 0 ? C.optimal : C.critical }}>
                {dailyPnl >= 0 ? "+" : "−"}${fmt2(Math.abs(dailyPnl))}
              </span>
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>
          )}
        </KpiCard>

        <KpiCard label="Beta">
          {beta != null && latest?.beta_estimate != null ? (
            <div className="flex items-center gap-2">
              <Shield size={16} style={{ color: C.equity }} />
              <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                {beta.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>
          )}
        </KpiCard>
      </div>

      {/* Risk flags from the latest snapshot */}
      {riskFlags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle size={13} style={{ color: C.warning }} />
          {riskFlags.map(flag => (
            <span key={flag} className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider"
              style={{ background: "rgba(217,119,6,0.08)", color: C.warning, border: "1px solid rgba(217,119,6,0.3)" }}>
              {flag}
            </span>
          ))}
        </div>
      )}
      {mixed && (
        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Portfolio holds mixed currencies — position totals are shown per currency, no FX conversion applied.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Net-worth history */}
        {hasHistory ? (
          <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Portfolio Value · {firstPt!.date} → {lastPt!.date}
              </div>
              <div className="text-xs font-bold font-mono" style={{ color: delta >= 0 ? C.optimal : C.alert }}>
                {delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({delta >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={points} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="invNwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.growth} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={C.growth} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={45} />
                <Tooltip
                  formatter={(v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="value" stroke={C.growth} strokeWidth={2.5} fill="url(#invNwFill)" name="Total Value" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <SectionCard title="Portfolio Value History">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <TrendingUp size={16} style={{ color: "var(--text-tertiary)" }} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>History starts when snapshots arrive</div>
                <div className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  Once the advisor begins logging daily portfolio snapshots, the value history chart will build itself here.
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Allocation donut */}
        {allocData.length > 0 ? (
          <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Allocation by Position Value</div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-tertiary)" }}>Share of raw position value{mixed ? " · mixed currencies" : ""}</div>
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
                    formatter={(value: number, name: string, props: { payload?: { currency?: string } }) => [fmtMoney(value, props?.payload?.currency ?? null), name]}
                    contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-3 overflow-auto max-h-[140px]">
              {allocData.map((item, idx) => (
                <div key={item.name} className="flex justify-between items-center gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ALLOC_COLORS[idx % ALLOC_COLORS.length] }} />
                    <span className="font-semibold truncate">{item.name}</span>
                  </div>
                  <span className="font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
                    {totalVal > 0 ? `${((item.value / totalVal) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState message="No open positions to allocate. Positions opened by the advisor engine will appear here." icon={PieIcon} />
        )}
      </div>

      {positions.length === 0 && !latest && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <Wallet size={13} />
          No portfolio telemetry yet — KPI cards will populate once the advisor writes its first snapshot.
        </div>
      )}

    </div>
  );
}
