"use client";

import { motion } from "framer-motion";
import { Play, AlertTriangle } from "lucide-react";
import { Pipeline } from "../../../../utils/api";

// ─── Helpers ─────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Status Badge ────────────────────────────────────────────────
function StatusBadge({ p }: { p: Pipeline }) {
  const base: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: "var(--font-mono)",
    padding: "3px 8px",
    borderRadius: "var(--radius-full)",
  };

  if (p.status === "running") {
    return (
      <motion.span
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
        style={{ ...base, color: "var(--accent-sleep)", background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}
      >
        running
      </motion.span>
    );
  }
  if (p.last_error) {
    return (
      <span
        title={p.last_error}
        style={{ ...base, color: "var(--status-critical)", background: "#DC262610", border: "1px solid #DC262630", cursor: "help" }}
      >
        error
      </span>
    );
  }
  return (
    <span style={{ ...base, color: "var(--text-tertiary)", background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
      idle
    </span>
  );
}

// ─── Pipelines Panel ─────────────────────────────────────────────
export default function PipelinesPanel({
  pipelines,
  offline,
  runErrors,
  onRun,
}: {
  pipelines: Pipeline[];
  offline: boolean;
  runErrors: Record<string, string>;
  onRun: (id: string) => void;
}) {
  return (
    <div
      className="card-surface flex flex-col h-full"
      style={{ borderRadius: "var(--radius-xl)", overflow: "hidden" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Pipelines
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ color: "var(--text-tertiary)", background: "var(--surface-tertiary)", fontFamily: "var(--font-mono)" }}
        >
          {pipelines.length}
        </span>
      </div>

      {offline && (
        <div
          className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-lg text-[11px] font-semibold"
          style={{
            color: "var(--status-warning)",
            background: "#D9770610",
            border: "1px solid #D9770630",
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          Backend offline — start uvicorn on :8000
        </div>
      )}

      <div className="flex-1 flex flex-col gap-2.5 p-3" style={{ overflowY: "auto" }}>
        {!offline && pipelines.length === 0 && (
          <div className="text-xs text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            No pipelines registered.
          </div>
        )}
        {pipelines.map((p) => {
          const running = p.status === "running";
          return (
            <div
              key={p.id}
              className="p-3.5 rounded-xl"
              style={{
                background: "var(--surface-secondary)",
                border: `1px solid ${running ? "var(--border-ai)" : "var(--border-subtle)"}`,
                boxShadow: running ? "var(--shadow-glow-ai)" : "var(--shadow-card)",
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-[13px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {p.name}
                </div>
                <StatusBadge p={p} />
              </div>
              {p.description && (
                <div className="text-[11px] leading-relaxed mb-2.5" style={{ color: "var(--text-secondary)" }}>
                  {p.description}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
                >
                  last run: {timeAgo(p.last_finished_at || p.last_started_at)}
                </span>
                <button
                  onClick={() => onRun(p.id)}
                  disabled={running}
                  title={running ? "Already running" : "Run pipeline"}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                  style={{ background: "var(--accent-sleep)" }}
                >
                  <Play size={11} />
                  Run
                </button>
              </div>
              {runErrors[p.id] && (
                <div
                  className="text-[10px] font-semibold mt-2 px-2 py-1.5 rounded-lg"
                  style={{
                    color: "var(--status-critical)",
                    background: "#DC26260D",
                    border: "1px solid #DC262625",
                  }}
                >
                  {runErrors[p.id]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
