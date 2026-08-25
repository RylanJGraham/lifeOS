"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { THEME } from "../../../utils/theme";

// ─── Colour palette — matches the legacy finance/page.tsx palette ──
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

export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

export const curSym = (c: string) => CURRENCY_SYMBOLS[c] ?? "$";
export const fmt2 = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DeltaBadge({
  value,
  prefix = "",
}: {
  value: number | string;
  prefix?: string;
}) {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  const isPos = num > 0;
  const isNeg = num < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? C.optimal : isNeg ? C.alert : C.textTertiary;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold"
      style={{ color, fontFamily: "var(--font-mono)" }}
    >
      <Icon size={11} />
      {isPos && "+"}
      {prefix}
      {value}
    </span>
  );
}

export function MiniSparkline({
  data,
  color,
  height = 40,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
    )
    .join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={parseFloat(pts.split(" ").pop()!.split(",")[0])}
        cy={parseFloat(pts.split(" ").pop()!.split(",")[1])}
        r={3}
        fill={color}
      />
    </svg>
  );
}

export function getFilteredData(
  data: any[],
  timeFilter: string,
  dateField: string = "transaction_date"
) {
  if (!data || data.length === 0) return [];
  if (timeFilter === "all" || !timeFilter) return data;

  const now = new Date();
  const cutoff = new Date();

  if (timeFilter === "day") cutoff.setHours(0, 0, 0, 0);
  else if (timeFilter === "week") cutoff.setDate(now.getDate() - 7);
  else if (timeFilter === "month") cutoff.setDate(now.getDate() - 30);
  else if (timeFilter === "quarter") cutoff.setDate(now.getDate() - 90);
  else if (timeFilter === "year") cutoff.setDate(now.getDate() - 365);

  return data.filter((item) => {
    if (!item[dateField]) return true;
    const itemDate = new Date(item[dateField]);
    return itemDate >= cutoff;
  });
}

export function EmptyState({
  message,
  icon: Icon = Activity,
}: {
  message: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center p-10 card-surface mt-4 mb-4"
      style={{ borderRadius: "var(--radius-xl)", minHeight: "200px" }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "var(--surface-tertiary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Icon size={20} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div
        className="text-xs font-bold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        Awaiting Telemetry
      </div>
      <div
        className="text-sm text-center max-w-xs"
        style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}
      >
        {message}
      </div>
    </div>
  );
}

export const tabVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

export function SectionCard({
  title,
  sub,
  children,
  action,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)" }}
        >
          {title}
        </div>
        {action}
      </div>
      {sub && (
        <div className="text-[10px] mb-3" style={{ color: "var(--text-tertiary)" }}>
          {sub}
        </div>
      )}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}
