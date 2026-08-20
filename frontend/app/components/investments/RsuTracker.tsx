import React from "react";
import { CompanyRSU } from "./types";
import { C, num, fmt2 } from "./shared";
import { Briefcase } from "lucide-react";

export default function RsuTracker({ rsus }: { rsus: CompanyRSU[] }) {
  if (!rsus || rsus.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rsus.map((rsu) => {
        const grantDate = new Date(rsu.grant_date);
        const today = new Date();
        const yearsElapsed = (today.getTime() - grantDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        
        const vestYears = num(rsu.vesting_years) || 3;
        const totalValue = num(rsu.initial_grant_value_usd) || 0;
        
        // Simple linear vesting calculation for the visualizer
        let vestPct = (yearsElapsed / vestYears) * 100;
        if (vestPct > 100) vestPct = 100;
        if (vestPct < 0) vestPct = 0;

        // If there's a 1-year cliff, and we haven't hit it yet
        if (yearsElapsed < 1) vestPct = 0;

        const vestedValue = (vestPct / 100) * totalValue;
        const unvestedValue = totalValue - vestedValue;

        return (
          <div key={rsu.id} className="card-surface p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between"
            style={{ border: `1px solid ${C.wealth}40`, background: `linear-gradient(135deg, var(--surface-primary) 0%, ${C.wealth}10 100%)` }}>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: C.wealth }}>
                  <Briefcase size={12} />
                  Company Equity
                </div>
                <div className="text-xl font-black font-mono tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {rsu.ticker} Grant
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Total Value
                </div>
                <div className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  ${fmt2(totalValue)}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-2 font-mono">
                <span style={{ color: C.optimal }}>Vested: ${fmt2(vestedValue)}</span>
                <span style={{ color: C.alert }}>Unvested: ${fmt2(unvestedValue)}</span>
              </div>
              
              <div className="h-2 w-full rounded-full overflow-hidden flex" style={{ background: "var(--surface-tertiary)" }}>
                <div className="h-full" style={{ width: `${vestPct}%`, background: C.optimal, transition: "width 1s ease-out" }} />
                <div className="h-full" style={{ width: `${100 - vestPct}%`, background: C.alert, transition: "width 1s ease-out" }} />
              </div>
              
              <div className="mt-3 flex justify-between text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text-tertiary)" }}>
                <span>Granted: {grantDate.toLocaleDateString()}</span>
                <span>{vestPct.toFixed(1)}% Vested</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
