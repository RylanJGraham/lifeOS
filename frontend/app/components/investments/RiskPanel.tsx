"use client";

import { useState, useEffect } from "react";
import { Shield, AlertTriangle, Check } from "lucide-react";
import type { Position, Snapshot } from "./types";
import { C, num, fmtMoney, EmptyState } from "./shared";
import { supabase } from "../../../utils/supabaseClient";

export interface RiskPolicy {
  max_position_pct: number;
  max_sector_pct: number;
  min_cash_pct: number;
  daily_loss_guardrail_pct: number;
  approval_threshold_usd: number;
}

const DEFAULT_POLICY: RiskPolicy = {
  max_position_pct: 15,
  max_sector_pct: 40,
  min_cash_pct: 5,
  daily_loss_guardrail_pct: 5,
  approval_threshold_usd: 1000,
};

function RiskFlag({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: ok ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)", border: `1px solid ${ok ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.25)"}` }}>
      {ok ? <Check size={13} style={{ color: C.optimal, marginTop: 2 }} /> : <AlertTriangle size={13} style={{ color: C.alert, marginTop: 2 }} />}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ok ? C.optimal : C.alert }}>{label}</div>
        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{detail}</div>
      </div>
    </div>
  );
}

export default function RiskPanel({ positions, snapshots }: { positions: Position[]; snapshots: Snapshot[] }) {
  const [policy, setPolicy] = useState<RiskPolicy>(DEFAULT_POLICY);

  useEffect(() => {
    supabase.from("user_profiles").select("risk_policy").limit(1).then(({ data }) => {
      if (data && data.length > 0 && data[0].risk_policy) {
        setPolicy({ ...policy, ...data[0].risk_policy });
      }
    });
  }, []);

  if (positions.length === 0 && snapshots.length === 0) {
    return <EmptyState message="No portfolio telemetry yet. Risk metrics will appear once the market advisor writes a snapshot." icon={Shield} />;
  }

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const totalValue = positions.reduce((sum, p) => sum + num(p.position_value), 0);
  const cash = num(latest?.cash ?? 0);
  const portfolioValue = totalValue + cash;

  // Concentration
  let maxPositionPct = 0;
  let maxSymbol = "—";
  for (const p of positions) {
    const val = num(p.position_value);
    const pct = portfolioValue > 0 ? (val / portfolioValue) * 100 : 0;
    if (pct > maxPositionPct) {
      maxPositionPct = pct;
      maxSymbol = p.symbol;
    }
  }

  // Sector concentration
  const sectorTotals: Record<string, number> = {};
  for (const p of positions) {
    const sector = p.sector || "Unknown";
    sectorTotals[sector] = (sectorTotals[sector] || 0) + num(p.position_value);
  }
  let maxSectorPct = 0;
  let maxSector = "—";
  for (const [sector, val] of Object.entries(sectorTotals)) {
    const pct = portfolioValue > 0 ? (val / portfolioValue) * 100 : 0;
    if (pct > maxSectorPct) {
      maxSectorPct = pct;
      maxSector = sector;
    }
  }

  const cashPct = portfolioValue > 0 ? (cash / portfolioValue) * 100 : 0;

  // Daily loss guardrail
  let dailyLossPct = 0;
  if (latest?.daily_pnl != null && portfolioValue > 0) {
    dailyLossPct = (Math.min(0, num(latest.daily_pnl)) / portfolioValue) * 100;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={15} style={{ color: C.equity }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Risk Guardrails
          </div>
        </div>
        <div className="space-y-2">
          <RiskFlag
            ok={maxPositionPct <= policy.max_position_pct}
            label="Position concentration"
            detail={`${maxSymbol} is ${maxPositionPct.toFixed(1)}% of portfolio (limit ${policy.max_position_pct}%).`}
          />
          <RiskFlag
            ok={maxSectorPct <= policy.max_sector_pct}
            label="Sector concentration"
            detail={`${maxSector} is ${maxSectorPct.toFixed(1)}% of portfolio (limit ${policy.max_sector_pct}%).`}
          />
          <RiskFlag
            ok={cashPct >= policy.min_cash_pct}
            label="Cash reserve"
            detail={`Cash is ${cashPct.toFixed(1)}% of portfolio (minimum ${policy.min_cash_pct}%).`}
          />
          <RiskFlag
            ok={Math.abs(dailyLossPct) <= policy.daily_loss_guardrail_pct}
            label="Daily loss guardrail"
            detail={`Daily P&L is ${dailyLossPct.toFixed(2)}% (limit ${policy.daily_loss_guardrail_pct}%).`}
          />
        </div>
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Allocation Check
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              <span>{maxSymbol} position</span>
              <span style={{ color: maxPositionPct > policy.max_position_pct ? C.alert : "inherit" }}>{maxPositionPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, maxPositionPct)}%`, background: maxPositionPct > policy.max_position_pct ? C.alert : C.equity }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              <span>{maxSector} sector</span>
              <span style={{ color: maxSectorPct > policy.max_sector_pct ? C.alert : "inherit" }}>{maxSectorPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, maxSectorPct)}%`, background: maxSectorPct > policy.max_sector_pct ? C.alert : C.growth }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              <span>Cash</span>
              <span>{cashPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, cashPct)}%`, background: C.wealth }} />
            </div>
          </div>
        </div>
        <div className="mt-4 text-[10px]" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Total portfolio value: {fmtMoney(portfolioValue, "USD")} · Positions: {fmtMoney(totalValue, "USD")} · Cash: {fmtMoney(cash, "USD")}
        </div>
      </div>
    </div>
  );
}
