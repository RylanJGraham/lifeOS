import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Zap, Check, ChevronDown } from "lucide-react";
import React, { useState } from "react";
import type { Signal, SignalPerformance } from "./types";
import { C, num, numOrNull, confPct, actionStyle, EmptyState } from "./shared";

/** Win rate for a performance row: explicit win_rate first, else wins/total. */
function winRateOf(row: SignalPerformance): number | null {
  const explicit = numOrNull(row.win_rate);
  if (explicit != null) return explicit <= 1 ? explicit * 100 : explicit;
  const wins = numOrNull(row.wins);
  const total = numOrNull(row.total_signals);
  if (wins != null && total != null && total > 0) return (wins / total) * 100;
  return null;
}

function WinRateBars({ rows }: { rows: SignalPerformance[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const wr = winRateOf(r);
        if (wr == null) return null;
        const total = numOrNull(r.total_signals);
        return (
          <div key={`${r.symbol}-${r.action}-${i}`}>
            <div className="flex items-center justify-between text-[10px] mb-0.5 font-mono">
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {r.symbol}
                {r.action && <span style={{ color: "var(--text-tertiary)" }}> · {r.action}</span>}
              </span>
              <span className="font-bold" style={{ color: wr >= 50 ? C.optimal : C.alert }}>
                {wr.toFixed(0)}%{total != null && <span style={{ color: "var(--text-tertiary)" }}> · {total} signals</span>}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
              <motion.div className="h-full rounded-full" style={{ background: wr >= 50 ? C.optimal : C.alert }}
                initial={{ width: 0 }} animate={{ width: `${Math.min(100, wr)}%` }}
                transition={{ duration: 0.7, ease: [0, 0, 0.2, 1], delay: i * 0.05 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SymbolRow({ symbol, signals, performance }: { symbol: string; signals: Signal[]; performance?: SignalPerformance[] }) {
  const [expanded, setExpanded] = useState(false);
  // signals arrive newest-first
  const latest = signals[0];
  const st = actionStyle(latest?.action);
  
  // Aggregate hit rate for this specific symbol (across actions if multiple)
  let hitRateDisplay = "—";
  let hitRateColor = "var(--text-tertiary)";
  if (performance && performance.length > 0) {
    // If there's a performance row for the latest action, use that, else average
    const matched = performance.find(p => p.action === latest?.action) || performance[0];
    const wr = winRateOf(matched);
    if (wr != null) {
      hitRateDisplay = `${wr.toFixed(0)}%`;
      hitRateColor = wr >= 50 ? C.optimal : C.alert;
    }
  }

  const trend = signals
    .slice()
    .reverse()
    .filter(s => s.generated_at && s.confidence != null)
    .map(s => ({
      date: s.generated_at!.slice(5, 10),
      conf: confPct(s.confidence) ?? 0,
    }));

  return (
    <div className="flex flex-col border-b border-[var(--border-subtle)] last:border-b-0">
      <div 
        className="flex items-center py-1.5 px-3 cursor-pointer hover:bg-[var(--surface-tertiary)] transition-colors gap-3 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Symbol */}
        <div className="font-bold font-mono text-[11px] w-12 shrink-0" style={{ color: "var(--text-primary)" }}>
          {symbol}
        </div>
        
        {/* Latest Action */}
        <div className="text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest text-center shrink-0 w-12"
          style={{ background: latest?.action ? st.bg : "transparent", color: latest?.action ? st.color : "var(--text-tertiary)", border: latest?.action ? `1px solid ${st.border}` : "none" }}>
          {latest?.action || "—"}
        </div>

        {/* Win Rate */}
        <div className="text-[10px] font-mono font-bold w-10 shrink-0 text-right" style={{ color: hitRateColor }}>
          {hitRateDisplay}
        </div>

        {/* Flex Data Line */}
        <div className="flex-1 flex items-center gap-3 text-[10px] font-mono overflow-hidden whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
          {latest?.confidence != null && <span className="shrink-0" style={{ color: st.color }}>{confPct(latest.confidence)?.toFixed(0)}% conf</span>}
          <span className="shrink-0">{signals.length} sigs</span>
          {latest?.signal_type && <span className="uppercase truncate">{latest.signal_type}</span>}
        </div>

        <ChevronDown size={12} style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-[var(--surface-secondary)] border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            {performance && performance.length > 0 && (
              <div className="mb-3">
                <div className="text-[8px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-tertiary)" }}>Win rate</div>
                <WinRateBars rows={performance} />
              </div>
            )}

            {trend.length > 1 && (
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Confidence trend</div>
                <ResponsiveContainer width="100%" height={50}>
                  <LineChart data={trend} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={8} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" fontSize={8} tickLine={false} axisLine={false} width={20} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(0)}%`, "Confidence"]}
                      contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "4px", fontSize: 9, padding: "2px 6px" }}
                    />
                    <Line type="monotone" dataKey="conf" stroke={st.color} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="space-y-1.5 max-h-[200px] overflow-auto pr-1">
            <div className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Timeline</div>
            {signals.map(s => {
              const sst = actionStyle(s.action);
              const conf = confPct(s.confidence);
              return (
                <div key={s.id ?? `${s.generated_at}-${s.action}`} className="p-2 border-b border-[var(--border-subtle)] last:border-0"
                  style={{ background: "transparent" }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {s.action && (
                        <span className="text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest"
                          style={{ background: sst.bg, color: sst.color, border: `1px solid ${sst.border}` }}>
                          {s.action}
                        </span>
                      )}
                      {conf != null && (
                        <span className="text-[10px] font-bold font-mono" style={{ color: sst.color }}>{conf.toFixed(0)}%</span>
                      )}
                      {s.executed && (
                        <span className="inline-flex items-center gap-1 text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest"
                          style={{ background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.25)" }}>
                          <Check size={8} /> Exec
                        </span>
                      )}
                      {s.outcome && (
                        <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                          → {s.outcome}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                      {s.generated_at ? new Date(s.generated_at).toLocaleString() : ""}
                    </span>
                  </div>
                  {s.reasoning && (
                    <div className="text-[10px] mt-1" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {s.reasoning}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignalFeed({ signals, performance }: {
  signals: Signal[];
  performance: SignalPerformance[];
}) {
  if (signals.length === 0 && performance.length === 0) {
    return (
      <EmptyState
        message="No trade signals yet."
        icon={Zap}
      />
    );
  }

  // Group by symbol — keep full history, no dedup. Ordered by latest activity.
  const bySymbol = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = bySymbol.get(s.symbol);
    if (list) list.push(s);
    else bySymbol.set(s.symbol, [s]);
  }
  const groups = Array.from(bySymbol.entries());

  const perfBySymbol = new Map<string, SignalPerformance[]>();
  for (const r of performance) {
    const list = perfBySymbol.get(r.symbol);
    if (list) list.push(r);
    else perfBySymbol.set(r.symbol, [r]);
  }

  return (
    <div className="space-y-4">
      {performance.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
            Global Win Rate Overview
          </div>
          <div className="p-3 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-primary)]">
            <WinRateBars rows={performance} />
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
          Signal Feed · {groups.length} symbols
        </div>
        <div className="flex flex-col border border-[var(--border-subtle)] rounded-md overflow-hidden bg-[var(--surface-primary)]">
          {groups.map(([symbol, list]) => (
            <SymbolRow 
              key={symbol} 
              symbol={symbol} 
              signals={list} 
              performance={perfBySymbol.get(symbol)} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}
