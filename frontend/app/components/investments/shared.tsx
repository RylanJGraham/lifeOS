"use client";

// ─── Shared UI helpers for the Investments module ────────────────
import React from "react";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { THEME } from "../../../utils/theme";

// ─── Colour palette — matches finance/page.tsx ───────────────────
export const C = {
  ...THEME,
  wealth: "#059669",
  growth: "#0EA5E9",
  equity: "#5B42E8",
  fixed: "#D97706",
  cash: "#94A3B8",
  crypto: "#E07020",
  alert: "#DC2626",
};

// ─── Coercion / formatting ───────────────────────────────────────
/** Coerce a PostgREST numeric (number | numeric-string | null) to number. */
export function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
};

/** Currency-aware symbol prefix; falls back to the ISO code + space. */
export function curSym(c: string | null | undefined): string {
  if (!c) return "$";
  return CURRENCY_SYMBOLS[c.toUpperCase()] ?? `${c.toUpperCase()} `;
}

export const fmt2 = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (n: number, currency: string | null | undefined) =>
  `${curSym(currency)}${fmt2(n)}`;

/** Confidence values arrive on either a 0–1 or 0–100 scale. */
export function confPct(v: number | string | null | undefined): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
}

/** Short display label for long/crypto symbols (e.g. "BTC-EUR"). */
export function shortSymbol(symbol: string): string {
  return symbol.length > 10 ? `${symbol.slice(0, 9)}…` : symbol;
}

// ─── Action styling (BUY/ADD green, SELL/TRIM red, else violet) ──
export function actionStyle(action: string | null | undefined): {
  color: string; bg: string; border: string;
} {
  const a = (action || "").toUpperCase();
  if (a === "BUY" || a === "ADD") return { color: C.optimal, bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)" };
  if (a === "SELL" || a === "TRIM") return { color: C.alert, bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.3)" };
  return { color: C.equity, bg: "rgba(91,66,232,0.1)", border: "rgba(91,66,232,0.3)" };
}

// ─── Shared subcomponents ────────────────────────────────────────
export function DeltaBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const isPos = value > 0;
  const isNeg = value < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? C.optimal : isNeg ? C.alert : C.textTertiary;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color, fontFamily: "var(--font-mono)" }}>
      <Icon size={11} />
      {isPos && "+"}{value.toFixed(1)}{suffix}
    </span>
  );
}

export function EmptyState({ message, icon: Icon = Activity }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 card-surface" style={{ borderRadius: "var(--radius-xl)", minHeight: "200px" }}>
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

import type { Position } from "./types";

/** Merge duplicate position rows (e.g. broker + Jarvis user_id mismatch) into a
 *  single row per symbol. Preference order: broker > manual > jarvis. The
 *  surviving row keeps the broker/manually logged basis and merges the most
 *  recent price, any sector/tags from Jarvis, and the latest signal fields. */
export function dedupePositions(positions: Position[]): Position[] {
  const groups = new Map<string, Position[]>();
  for (const p of positions) {
    const key = (p.symbol || "").toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const sourceRank = (s: string | null | undefined) => {
    const rank: Record<string, number> = { broker: 0, manual: 1, jarvis: 2 };
    return rank[(s || "").toLowerCase()] ?? 99;
  };

  return Array.from(groups.values()).map((rows) => {
    rows.sort((a, b) => {
      const ra = sourceRank(a.source);
      const rb = sourceRank(b.source);
      if (ra !== rb) return ra - rb;
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
    const [base, ...rest] = rows;
    const merged = { ...base };
    for (const r of rest) {
      if (!merged.sector && r.sector) merged.sector = r.sector;
      if (!merged.tags && r.tags) merged.tags = r.tags;
      if (r.updated_at && new Date(r.updated_at) > new Date(merged.updated_at || 0)) {
        if (r.current_price != null) merged.current_price = r.current_price;
        if (r.position_value != null) merged.position_value = r.position_value;
        if (r.unrealized_pnl != null) merged.unrealized_pnl = r.unrealized_pnl;
        if (r.unrealized_pnl_pct != null) merged.unrealized_pnl_pct = r.unrealized_pnl_pct;
        merged.updated_at = r.updated_at;
      }
      if (!merged.latest_signal_action && r.latest_signal_action) {
        merged.latest_signal_action = r.latest_signal_action;
        merged.latest_signal_confidence = r.latest_signal_confidence;
        merged.latest_signal_price_target = r.latest_signal_price_target;
      }
    }
    return merged;
  });
}

export function SectionCard({ title, sub, children, action }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{title}</div>
        {action}
      </div>
      {sub && <div className="text-[10px] mb-3" style={{ color: "var(--text-tertiary)" }}>{sub}</div>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}
