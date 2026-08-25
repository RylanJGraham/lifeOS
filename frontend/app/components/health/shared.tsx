"use client";

import { Activity } from "lucide-react";
import { THEME } from "../../../utils/theme";

// ─── Colour palette helpers — Light Mode ─────────────────────────
export const C = {
  ...THEME,
  cv: "#E03535",
  sleep: "#5B42E8",
  nutrition: "#00A878",
  kinematic: "#E07020",
  trends: "#0EA5E9",
  inactive: "#9CA3AF",
};

// ─── Time-range helpers ──────────────────────────────────────────
// Day = today (local), Week = 7d, Month = 30d, Quarter = 90d, Year = 365d.
export const RANGE_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };

export function getCutoff(timeFilter: string): Date {
  const d = new Date();
  if (timeFilter === "day") {
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - (RANGE_DAYS[timeFilter] ?? 30));
  }
  return d;
}

export function rangeLabel(timeFilter: string): string {
  switch (timeFilter) {
    case "day": return "today";
    case "week": return "last 7 days";
    case "month": return "last 30 days";
    case "quarter": return "last 90 days";
    case "year": return "last 365 days";
    default: return "selected range";
  }
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayKeyOf(iso: string): string { return toDayKey(new Date(iso)); }

export function fmtDayLong(dk: string): string {
  return new Date(dk + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export const CHAT_HINT = "Data arrives by sending screenshots in Chat (/chat).";

// ─── Shared subcomponents ────────────────────────────────────────
export function StatusDot({ status }: { status: "optimal" | "warning" | "critical" | "inactive" }) {
  const colors = {
    optimal: C.optimal, warning: C.warning, critical: C.critical, inactive: C.inactive,
  };
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status !== "inactive" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
          style={{ background: colors[status] }} />
      )}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: colors[status] }} />
    </span>
  );
}

export function EmptyState({ message, icon: Icon = Activity }: { message: string, icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 card-surface mt-4 mb-4" style={{ borderRadius: "var(--radius-xl)", minHeight: "200px" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
        <Icon size={20} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Awaiting Telemetry</div>
      <div className="text-sm text-center max-w-xs" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        {message}
      </div>
    </div>
  );
}

export function NeedMoreNote({ message }: { message: string }) {
  return (
    <div className="text-[11px] italic px-3 py-2.5 rounded-lg text-center"
      style={{ color: "var(--text-tertiary)", background: "var(--surface-tertiary)", border: "1px dashed var(--border-subtle)" }}>
      {message}
    </div>
  );
}

export function DayLens({ mode, onModeChange, day, onDayChange }: {
  mode: "range" | "day"; onModeChange: (m: "range" | "day") => void;
  day: string; onDayChange: (d: string) => void;
}) {
  const shift = (n: number) => {
    const d = new Date(day + "T00:00:00");
    d.setDate(d.getDate() + n);
    onDayChange(toDayKey(d));
  };
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
        {(["range", "day"] as const).map(m => (
          <button key={m} onClick={() => onModeChange(m)}
            className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{
              background: mode === m ? "var(--surface-quaternary)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
              border: mode === m ? "1px solid var(--border-active)" : "1px solid transparent",
            }}>
            {m === "range" ? "Range" : "Day"}
          </button>
        ))}
      </div>
      {mode === "day" && (
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <input type="date" value={day} onChange={e => e.target.value && onDayChange(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-mono outline-none"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
