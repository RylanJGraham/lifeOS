"use client";

import { Activity } from "lucide-react";

// Cross-domain correlations require overlapping history across health, finance
// and training data. health_metrics is currently empty, so there is nothing
// real to correlate — render an honest placeholder instead of fabricated
// Pearson r values.
export default function CorrelationHeatmap() {
  return (
    <div className="card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
        Cross-Domain Correlation Engine
      </div>
      <div className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
        Pearson correlations between sleep, recovery, spending and training
      </div>
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
          style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <Activity size={16} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
          Not enough data yet
        </div>
        <div className="text-xs max-w-[340px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Correlations need weeks of overlapping health and finance history. Health metrics arrive by
          sending screenshots in{" "}
          <a href="/chat" className="font-bold underline" style={{ color: "var(--accent-sleep)" }}>Chat</a>
          {" "}— the matrix will compute itself once the data exists.
        </div>
      </div>
    </div>
  );
}
