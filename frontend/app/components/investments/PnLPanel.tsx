"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Coins } from "lucide-react";
import type { Purchase, Position, Dividend } from "./types";
import { C, num, fmtMoney, EmptyState } from "./shared";
import { supabase } from "../../../utils/supabaseClient";

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="text-xl font-black font-mono" style={{ color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

export default function PnLPanel({ positions, purchases }: { positions: Position[]; purchases: Purchase[] }) {
  const [dividends, setDividends] = useState<Dividend[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: profile } = await supabase.from("user_profiles").select("user_id").limit(1);
        const userId = profile?.[0]?.user_id || "00000000-0000-0000-0000-000000000000";
        const { data } = await supabase
          .from("advisor_dividends")
          .select("*")
          .eq("user_id", userId)
          .order("dividend_date", { ascending: false });
        if (!cancelled && data) setDividends(data as Dividend[]);
      } catch {
        // Dividend data is additive; don't block the rest of the panel on error.
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (positions.length === 0 && purchases.length === 0) {
    return <EmptyState message="No trades or positions yet. Realized P&L will be calculated once you have matched buys and sells." icon={DollarSign} />;
  }

  // Unrealized P&L from current positions
  const unrealizedPnl = positions.reduce((sum, p) => sum + num(p.unrealized_pnl), 0);
  const totalCost = positions.reduce((sum, p) => sum + num(p.quantity) * num(p.average_cost), 0);
  const unrealizedPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

  // Realized P&L: simple FIFO per symbol
  const buysBySymbol: Record<string, { qty: number; cost: number }[]> = {};
  const realized: Record<string, number> = {};

  // Build FIFO queues from purchases
  const sortedPurchases = [...purchases].sort((a, b) => {
    const ta = a.executed_at ? new Date(a.executed_at).getTime() : 0;
    const tb = b.executed_at ? new Date(b.executed_at).getTime() : 0;
    return ta - tb;
  });

  for (const t of sortedPurchases) {
    const sym = t.symbol;
    const qty = num(t.quantity);
    const price = num(t.price);
    const fees = num(t.fees) || 0;
    const action = (t.action || "").toUpperCase();

    if (!buysBySymbol[sym]) buysBySymbol[sym] = [];

    if (action === "BUY" || action === "ADD") {
      buysBySymbol[sym].push({ qty, cost: qty * price + fees });
    } else if (action === "SELL" || action === "TRIM") {
      let remaining = qty;
      let proceeds = qty * price - fees;
      let matchedCost = 0;
      while (remaining > 0 && buysBySymbol[sym].length > 0) {
        const lot = buysBySymbol[sym][0];
        const take = Math.min(remaining, lot.qty);
        matchedCost += (take / lot.qty) * lot.cost;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 0) buysBySymbol[sym].shift();
      }
      realized[sym] = (realized[sym] || 0) + (proceeds - matchedCost);
    }
  }

  const totalRealized = Object.values(realized).reduce((a, b) => a + b, 0);
  const winners = Object.entries(realized).filter(([, v]) => v > 0);
  const losers = Object.entries(realized).filter(([, v]) => v < 0);

  // Trailing 12-month dividend yield
  const totalPortfolioValue = positions.reduce((sum, p) => sum + num(p.position_value), 0);
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const trailingDividends = dividends.filter((d) => d.dividend_date && new Date(d.dividend_date) >= oneYearAgo);
  const trailingDividendIncome = trailingDividends.reduce((sum, d) => sum + num(d.amount), 0);
  const dividendYield = totalPortfolioValue > 0 ? (trailingDividendIncome / totalPortfolioValue) * 100 : 0;
  const recentDividends = dividends.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Unrealized P&L" value={fmtMoney(unrealizedPnl, "USD")} color={unrealizedPnl >= 0 ? C.optimal : C.alert} />
        <Kpi label="Unrealized %" value={`${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPct.toFixed(2)}%`} color={unrealizedPnl >= 0 ? C.optimal : C.alert} />
        <Kpi label="Realized P&L" value={fmtMoney(totalRealized, "USD")} color={totalRealized >= 0 ? C.optimal : C.alert} />
        <Kpi label="Div Yield (TTM)" value={`${dividendYield.toFixed(2)}%`} color={dividendYield >= 0 ? C.wealth : C.alert} />
        <Kpi label="Total Trades" value={purchases.length.toString()} />
      </div>

      {purchases.length > 0 && (
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>Realized P&L by Symbol (FIFO)</div>
          {Object.keys(realized).length === 0 ? (
            <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              No closed trades yet. Realized P&L appears once a sell/trim is matched to a prior buy.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(realized).sort((a, b) => b[1] - a[1]).map(([symbol, pnl]) => (
                <div key={symbol} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "var(--surface-tertiary)" }}>
                  <div className="flex items-center gap-2">
                    {pnl >= 0 ? <TrendingUp size={12} style={{ color: C.optimal }} /> : <TrendingDown size={12} style={{ color: C.alert }} />}
                    <span className="font-bold font-mono text-xs" style={{ color: "var(--text-primary)" }}>{symbol}</span>
                  </div>
                  <span className="font-bold font-mono text-xs" style={{ color: pnl >= 0 ? C.optimal : C.alert }}>
                    {pnl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(pnl), "USD")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {recentDividends.length > 0 && (
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
            <Coins size={12} /> Recent Dividends
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-xs" style={{ minWidth: "320px" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)" }}>
                  <th className="text-left font-semibold pb-2">Symbol</th>
                  <th className="text-left font-semibold pb-2">Date</th>
                  <th className="text-right font-semibold pb-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentDividends.map((d) => (
                  <tr key={d.id ?? `${d.symbol}-${d.dividend_date}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="py-2 font-mono font-bold" style={{ color: "var(--text-primary)" }}>{d.symbol}</td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>{d.dividend_date}</td>
                    <td className="py-2 text-right font-mono" style={{ color: C.wealth }}>{fmtMoney(num(d.amount), d.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
