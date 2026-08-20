import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";
import { Radar, Target, ArrowUpRight, ArrowDownRight, ChevronDown } from "lucide-react";
import React, { useState } from "react";
import type { WatchlistEntry, Signal, InterestState } from "./types";
import { C, num, numOrNull, confPct, fmtMoney, actionStyle, EmptyState } from "./shared";

// ─── Interest-state color ramp ───────────────────────────────────
function stateStyle(state: string | null | undefined): { color: string; bg: string; border: string; label: string } {
  switch ((state || "scouting").toLowerCase() as InterestState | string) {
    case "warming":
      return { color: "#D97706", bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.3)", label: "Warming" };
    case "convinced":
      return { color: C.optimal, bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)", label: "Convinced" };
    case "cooling":
      return { color: C.crypto, bg: "rgba(224,112,32,0.1)", border: "rgba(224,112,32,0.3)", label: "Cooling" };
    case "dropped":
      return { color: C.textTertiary, bg: "var(--surface-tertiary)", border: "var(--border-subtle)", label: "Dropped" };
    default:
      return { color: C.textSecondary, bg: "var(--surface-tertiary)", border: "var(--border-active)", label: "Scouting" };
  }
}

function weeksTracked(w: WatchlistEntry): string {
  if (w.tracking_since) {
    const ms = Date.now() - new Date(w.tracking_since).getTime();
    const weeks = Math.max(0, Math.floor(ms / (7 * 24 * 3600 * 1000)));
    return weeks === 0 ? "<1wk" : `${weeks}w`;
  }
  return "new";
}

/** Conviction-over-time series: explicit history first, else derive from signal confidence. */
function convictionSeries(w: WatchlistEntry, signals: Signal[]): { date: string; score: number }[] {
  if (Array.isArray(w.conviction_history) && w.conviction_history.length > 0) {
    return w.conviction_history
      .filter(p => p && p.date && typeof p.score === "number")
      .map(p => ({ date: p.date.slice(5, 10), score: p.score }));
  }
  return signals
    .filter(s => s.symbol === w.symbol && s.generated_at)
    .slice()
    .reverse() // signals arrive newest-first → chronological
    .map(s => ({
      date: s.generated_at!.slice(5, 10),
      score: confPct(s.confidence) ?? 0,
    }));
}

function ConvictionChart({ series, color }: { series: { date: string; score: number }[]; color: string }) {
  if (series.length < 2) {
    return (
      <div className="text-[9px] italic px-2 py-1.5 rounded text-center"
        style={{ color: "var(--text-tertiary)", background: "var(--surface-tertiary)" }}>
        Insufficient history.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={series} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={8} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" fontSize={8} tickLine={false} axisLine={false} width={20} />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(0)}`, "Score"]}
          contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "4px", fontSize: 9, padding: "2px 6px" }}
        />
        <Line type="monotone" dataKey="score" stroke={color} strokeWidth={1.5} dot={false} />
        {series.length > 0 && (
          <ReferenceDot x={series[series.length - 1].date} y={series[series.length - 1].score} r={2} fill={color} stroke="none" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function CandidateRow({ entry, signals }: { entry: WatchlistEntry; signals: Signal[] }) {
  const [expanded, setExpanded] = useState(false);
  const st = stateStyle(entry.interest_state);
  const score = numOrNull(entry.conviction_score);
  const series = convictionSeries(entry, signals);
  const latestSignal = signals.find(s => s.symbol === entry.symbol) || null;

  return (
    <div className="flex flex-col border-b border-[var(--border-subtle)] last:border-b-0">
      <div 
        className="flex items-center py-1.5 px-3 cursor-pointer hover:bg-[var(--surface-tertiary)] transition-colors gap-3 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Symbol */}
        <div className="font-bold font-mono text-[11px] w-12 shrink-0" style={{ color: "var(--text-primary)" }}>
          {entry.symbol}
        </div>
        
        {/* Interest State */}
        <div className="text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest text-center shrink-0 w-16"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          {st.label}
        </div>

        {/* Conviction Score */}
        <div className="text-[10px] font-mono font-bold w-10 shrink-0 text-right" style={{ color: score != null ? st.color : "var(--text-tertiary)" }}>
          {score != null ? score.toFixed(0) : "—"}
        </div>

        {/* Flex Data Line */}
        <div className="flex-1 flex items-center gap-3 text-[10px] font-mono overflow-hidden whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
          {entry.in_portfolio && <span style={{ color: C.equity }}>[HELD]</span>}
          <span className="shrink-0">{weeksTracked(entry)}</span>
          {num(entry.signal_count) > 0 && <span className="shrink-0">{num(entry.signal_count)}sig</span>}
          {entry.category && <span className="uppercase truncate">{entry.category}</span>}
          {entry.last_signal_action && (
             <span className="uppercase shrink-0" style={{ color: actionStyle(entry.last_signal_action).color }}>
               {entry.last_signal_action}
             </span>
          )}
        </div>

        <ChevronDown size={12} style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-[var(--surface-secondary)] border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Conviction</div>
            <ConvictionChart series={series} color={st.color} />
          </div>
          <div className="space-y-2">
            {entry.thesis && (
              <div className="text-[10px]" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                <span className="font-bold uppercase tracking-widest text-[8px] block mb-0.5" style={{ color: "var(--text-tertiary)" }}>Thesis</span>
                {entry.thesis}
              </div>
            )}
            {latestSignal?.reasoning && (
              <div className="text-[10px]" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                <span className="font-bold uppercase tracking-widest text-[8px] block mb-0.5" style={{ color: "var(--text-tertiary)" }}>Latest reasoning</span>
                {latestSignal.reasoning}
              </div>
            )}
            {latestSignal && (
              <div className="flex gap-4 text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {numOrNull(latestSignal.price_target) != null && (
                  <span className="inline-flex items-center gap-1"><ArrowUpRight size={10} style={{ color: C.optimal }} />{fmtMoney(num(latestSignal.price_target), null)}</span>
                )}
                {numOrNull(latestSignal.stop_loss) != null && (
                  <span className="inline-flex items-center gap-1"><ArrowDownRight size={10} style={{ color: C.alert }} />{fmtMoney(num(latestSignal.stop_loss), null)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CandidateRadar({ watchlist, signals }: {
  watchlist: WatchlistEntry[];
  signals: Signal[];
}) {
  if (watchlist.length === 0) {
    return (
      <EmptyState
        message="No watchlist candidates yet."
        icon={Radar}
      />
    );
  }

  // Promoted proposals: convinced state or high conviction score
  const promoted = watchlist.filter(w =>
    (w.interest_state || "").toLowerCase() === "convinced" || (numOrNull(w.conviction_score) ?? 0) >= 70
  );
  const remaining = watchlist.filter(w => !promoted.includes(w));

  return (
    <div className="space-y-4">
      {/* Promoted proposals */}
      {promoted.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target size={12} style={{ color: C.optimal }} />
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.optimal }}>
              Promoted Proposals · {promoted.length}
            </div>
          </div>
          <div className="flex flex-col border border-[rgba(5,150,105,0.3)] rounded-md overflow-hidden bg-[rgba(5,150,105,0.03)]">
            {promoted.map(w => <CandidateRow key={w.id ?? w.symbol} entry={w} signals={signals} />)}
          </div>
        </div>
      )}

      {/* Radar List */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
          Candidate Radar · {remaining.length}
        </div>
        <div className="flex flex-col border border-[var(--border-subtle)] rounded-md overflow-hidden bg-[var(--surface-primary)]">
          {remaining.map(w => <CandidateRow key={w.id ?? w.symbol} entry={w} signals={signals} />)}
        </div>
      </div>
    </div>
  );
}
