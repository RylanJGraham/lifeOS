"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, PieChart as PieIcon } from "lucide-react";
import type { Position, Purchase, PositionHistoryRow } from "./types";
import { C, num, numOrNull, curSym, fmt2, fmtMoney, confPct, shortSymbol, actionStyle, EmptyState } from "./shared";

function PositionDetail({ symbol, currency, history, purchases }: {
  symbol: string;
  currency: string | null;
  history: PositionHistoryRow[];
  purchases: Purchase[];
}) {
  const rows = history
    .filter(h => h.symbol === symbol)
    .map(h => ({
      date: h.record_date.slice(5),
      price: num(h.price),
      weight: num(h.portfolio_weight) <= 1 ? num(h.portfolio_weight) * 100 : num(h.portfolio_weight),
    }));

  const trades = purchases.filter(p => p.symbol === symbol);

  return (
    <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Mini price / weight chart */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>
          Price &amp; Portfolio Weight · 90d
        </div>
        {rows.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={rows} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={9} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="price" stroke="var(--text-tertiary)" fontSize={9} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={50}
                tickFormatter={v => `${curSym(currency)}${v}`} />
              <YAxis yAxisId="weight" orientation="right" stroke="var(--text-tertiary)" fontSize={9} tickLine={false} axisLine={false} width={36}
                tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 11 }}
              />
              <Area yAxisId="price" type="monotone" dataKey="price" stroke={C.growth} strokeWidth={2} fill={C.growth} fillOpacity={0.08} name="Price" />
              <Line yAxisId="weight" type="monotone" dataKey="weight" stroke={C.equity} strokeWidth={1.5} dot={false} name="Weight %" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-[11px] italic px-3 py-2.5 rounded-lg text-center"
            style={{ color: "var(--text-tertiary)", background: "var(--surface-secondary)", border: "1px dashed var(--border-subtle)" }}>
            Position history builds day by day — not enough points yet.
          </div>
        )}
      </div>

      {/* Trade ledger */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>
          Trade Ledger · {trades.length}
        </div>
        {trades.length > 0 ? (
          <div className="space-y-1.5 max-h-[180px] overflow-auto">
            {trades.map((t, i) => {
              const dir = (t.direction || t.action || "").toUpperCase();
              const isBuy = dir === "BUY" || dir === "LONG";
              return (
                <div key={t.id ?? `${t.executed_at}-${i}`} className="flex items-center justify-between gap-2 p-2 rounded-lg text-[11px]"
                  style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0"
                      style={{
                        background: isBuy ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.08)",
                        color: isBuy ? C.optimal : C.alert,
                        border: `1px solid ${isBuy ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)"}`,
                      }}>
                      {t.action || t.direction || "—"}
                    </span>
                    <span className="font-mono truncate" style={{ color: "var(--text-secondary)" }}>
                      {num(t.quantity)} @ {fmtMoney(num(t.price), t.currency)}
                    </span>
                  </div>
                  <span className="font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    {t.executed_at ? t.executed_at.slice(0, 10) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] italic px-3 py-2.5 rounded-lg text-center"
            style={{ color: "var(--text-tertiary)", background: "var(--surface-secondary)", border: "1px dashed var(--border-subtle)" }}>
            No executed orders on record for this symbol.
          </div>
        )}
      </div>
    </div>
  );
}

export default function PositionsTable({ positions, positionHistory, purchases }: {
  positions: Position[];
  positionHistory: PositionHistoryRow[];
  purchases: Purchase[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (positions.length === 0) {
    return <EmptyState message="No open positions found. Positions logged by the advisor engine will appear here." icon={PieIcon} />;
  }

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
        Open Positions · {positions.length}
      </div>
      <div className="space-y-3">
        {positions.map(p => {
          const key = p.id ?? p.symbol;
          const sym = curSym(p.currency);
          const qty = num(p.quantity);
          const cost = num(p.average_cost);
          const price = numOrNull(p.current_price);
          const val = num(p.position_value);
          const pnl = num(p.unrealized_pnl);
          const pnlPct = numOrNull(p.unrealized_pnl_pct);
          const conf = confPct(p.latest_signal_confidence);
          const target = numOrNull(p.latest_signal_price_target);
          const st = actionStyle(p.latest_signal_action);
          const isOpen = expanded === key;

          return (
            <div key={key} className="rounded-xl overflow-hidden"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left transition-colors"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div className="min-w-0">
                  <div className="font-bold text-base flex items-center gap-2 flex-wrap" style={{ color: "var(--text-primary)" }}>
                    <span title={p.symbol}>{shortSymbol(p.symbol)}</span>
                    {p.latest_signal_action && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                        style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                        AI: {p.latest_signal_action}
                      </span>
                    )}
                    {p.sector && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest"
                        style={{ background: "var(--surface-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
                        {p.sector}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {qty.toFixed(4)} @ {sym}{cost.toFixed(2)}
                    {price != null && <> · now {sym}{price.toFixed(2)}</>}
                    {target != null && <> · target {sym}{target.toFixed(2)}</>}
                  </div>
                  {conf != null && (
                    <div className="flex items-center gap-2 mt-2 max-w-[220px]">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-secondary)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: st.color }}
                          initial={{ width: 0 }} animate={{ width: `${Math.min(100, conf)}%` }}
                          transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }} />
                      </div>
                      <span className="text-[9px] font-bold font-mono shrink-0" style={{ color: st.color }}>{conf.toFixed(0)}%</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      {sym}{fmt2(val)}
                    </div>
                    <div className="text-xs font-bold" style={{ fontFamily: "var(--font-mono)", color: pnl >= 0 ? C.optimal : C.critical }}>
                      {pnl >= 0 ? "+" : "−"}{sym}{fmt2(Math.abs(pnl))}
                      {pnlPct != null && <> ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</>}
                    </div>
                  </div>
                  {isOpen
                    ? <ChevronUp size={15} style={{ color: "var(--text-tertiary)" }} />
                    : <ChevronDown size={15} style={{ color: "var(--text-tertiary)" }} />}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
                    exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
                    className="px-4 overflow-hidden"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <PositionDetail symbol={p.symbol} currency={p.currency} history={positionHistory} purchases={purchases} />
                    <div className="pb-4" />
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
