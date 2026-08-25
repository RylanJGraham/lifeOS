"use client";

import { PlusCircle, History, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Purchase } from "./types";
import { C, num, fmtMoney, actionStyle, EmptyState } from "./shared";

export default function ManualTrades({
  purchases,
  onLogTrade,
}: {
  purchases: Purchase[];
  onLogTrade: () => void;
}) {
  if (purchases.length === 0) {
    return (
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History size={15} style={{ color: C.equity }} />
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Manual Trades
            </div>
          </div>
          <button onClick={onLogTrade}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            style={{ background: "rgba(91,66,232,0.08)", color: C.equity, border: "1px solid rgba(91,66,232,0.25)" }}>
            <PlusCircle size={13} />
            Log Trade
          </button>
        </div>
        <EmptyState
          message="No manual trades logged yet. Text the bot or use the Log Trade button to record buys, sells, trims, and adds."
          icon={History}
        />
      </div>
    );
  }

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <History size={15} style={{ color: C.equity }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Manual Trades · {purchases.length}
          </div>
        </div>
        <button onClick={onLogTrade}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
          style={{ background: "rgba(91,66,232,0.08)", color: C.equity, border: "1px solid rgba(91,66,232,0.25)" }}>
          <PlusCircle size={13} />
          Log Trade
        </button>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
        {purchases.map((t, i) => {
          const action = (t.action || "").toUpperCase();
          const isIn = action === "BUY" || action === "ADD";
          const st = actionStyle(action);
          return (
            <div key={t.id ?? `${t.symbol}-${i}`} className="p-3 rounded-xl"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest shrink-0"
                    style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                    {isIn ? <ArrowUpRight size={10} className="inline mr-0.5" /> : <ArrowDownRight size={10} className="inline mr-0.5" />}
                    {action || "—"}
                  </span>
                  <span className="font-bold font-mono text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {t.symbol}
                  </span>
                  <span className="text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                    {num(t.quantity).toFixed(4)} @ {fmtMoney(num(t.price), t.currency)}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                    {fmtMoney(num(t.total_cost), t.currency)}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {t.executed_at ? t.executed_at.slice(0, 10) : "—"}
                  </div>
                </div>
              </div>
              {t.reason && (
                <div className="mt-2 text-[11px]" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {t.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
