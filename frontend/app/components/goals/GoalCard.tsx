"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet, Flame, Target, CalendarClock, Circle, CheckCircle2,
  Trophy, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { C, num, numOrNull, fmtMoney, fmt2 } from "../investments/shared";
import type { Goal, GoalCheckin, Milestone } from "./types";

// ─── Palette per category ────────────────────────────────────────
const CATEGORY_META: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  financial: { icon: Wallet, color: C.wealth, label: "Financial" },
  habit: { icon: Flame, color: C.crypto, label: "Habit" },
  personal: { icon: Target, color: C.equity, label: "Personal" },
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  active: { color: C.growth, bg: "rgba(14,165,233,0.1)", border: "rgba(14,165,233,0.3)", label: "Active" },
  achieved: { color: C.optimal, bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)", label: "Achieved" },
  abandoned: { color: C.textTertiary, bg: "var(--surface-tertiary)", border: "var(--border-subtle)", label: "Abandoned" },
};

export interface LiveValues {
  bank: number | null;
  portfolio: number | null;
  netWorth: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────
/** `plan` is jsonb — parsed array normally, but tolerate a stringified legacy row. */
function parseMilestones(plan: Goal["plan"]): Milestone[] {
  let raw: unknown = plan;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is Milestone => !!m && typeof m === "object" && typeof (m as Milestone).label === "string");
}

function localDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Consecutive days with check-ins, ending today or yesterday. */
function habitStreak(checkins: GoalCheckin[]): number {
  const days = new Set(
    checkins.filter(c => c.created_at).map(c => localDateStr(new Date(c.created_at as string))),
  );
  if (days.size === 0) return 0;
  const cursor = new Date();
  if (!days.has(localDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDateStr(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysSinceLastCheckin(checkins: GoalCheckin[]): number | null {
  const ts = checkins
    .filter(c => c.created_at)
    .map(c => new Date(c.created_at as string).getTime());
  if (ts.length === 0) return null;
  return Math.floor((Date.now() - Math.max(...ts)) / 86400000);
}

function deadlineCountdown(deadline: string): number | null {
  const end = new Date(`${deadline.slice(0, 10)}T23:59:59`);
  if (!Number.isFinite(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

// ─── GoalCard ────────────────────────────────────────────────────
export default function GoalCard({
  goal, checkins, liveValues, onChanged,
}: {
  goal: Goal;
  checkins: GoalCheckin[];
  liveValues: LiveValues;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const meta = CATEGORY_META[goal.category ?? ""] ?? CATEGORY_META.personal;
  const status = STATUS_STYLE[goal.status ?? ""] ?? STATUS_STYLE.active;
  const Icon = meta.icon;
  const isHabit = goal.category === "habit";
  const isAchieved = goal.status === "achieved";

  // ─── Progress computation ──────────────────────────────────────
  const target = numOrNull(goal.target_value);
  let current: number | null;
  if (goal.linked_metric === "net_worth") current = liveValues.netWorth;
  else if (goal.linked_metric === "bank_balance") current = liveValues.bank;
  else if (goal.linked_metric === "portfolio_value") current = liveValues.portfolio;
  else {
    const withValue = checkins.filter(c => numOrNull(c.value) != null);
    const latest = withValue.length > 0 ? withValue[withValue.length - 1] : null;
    current = latest ? numOrNull(latest.value) : numOrNull(goal.current_value);
  }
  const hasBar = target != null && target > 0 && current != null;
  const actualPct = hasBar ? (num(current) / num(target)) * 100 : null;

  // Pace: expected % = elapsed time / total time (created_at → deadline)
  let pace: { label: string; color: string; bg: string; border: string } | null = null;
  if (actualPct != null && goal.deadline && goal.created_at && !isAchieved) {
    const start = new Date(goal.created_at).getTime();
    const end = new Date(`${goal.deadline.slice(0, 10)}T23:59:59`).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const expectedPct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
      const diff = actualPct - expectedPct;
      if (diff > 5) pace = { label: "Ahead", color: C.optimal, bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)" };
      else if (diff < -5) pace = { label: "Behind", color: C.alert, bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.3)" };
      else pace = { label: "On track", color: C.equity, bg: "rgba(91,66,232,0.1)", border: "rgba(91,66,232,0.3)" };
    }
  }

  const daysLeft = goal.deadline ? deadlineCountdown(goal.deadline) : null;
  const milestones = parseMilestones(goal.plan);
  const doneCount = milestones.filter(m => m.done).length;

  // ─── Habit stats ───────────────────────────────────────────────
  const streak = isHabit ? habitStreak(checkins) : 0;
  const lastAgo = isHabit ? daysSinceLastCheckin(checkins) : null;

  // ─── Value formatting ──────────────────────────────────────────
  const fmtValue = (v: number) =>
    goal.currency ? fmtMoney(v, goal.currency) : `${fmt2(v)}${goal.unit ? ` ${goal.unit}` : ""}`;

  const markAchieved = async () => {
    setBusy(true);
    const { error: err } = await supabase.from("goals").update({ status: "achieved" }).eq("id", goal.id);
    setBusy(false);
    if (!err) onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${goal.title}"? This also removes its check-ins.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("goals").delete().eq("id", goal.id);
    setBusy(false);
    if (!err) onChanged();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="card-surface p-5"
      style={{ borderRadius: "var(--radius-xl)", opacity: isAchieved ? 0.75 : 1 }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
          >
            <Icon size={16} style={{ color: meta.color }} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              {goal.title}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ color: status.color, background: status.bg, border: `1px solid ${status.border}` }}
              >
                {status.label}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {meta.label}
              </span>
              {goal.linked_metric && (
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.growth, fontFamily: "var(--font-mono)" }}>
                  · live {String(goal.linked_metric).replace("_", " ")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isAchieved && (
            <button
              onClick={markAchieved}
              disabled={busy}
              title="Mark as achieved"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
              style={{ color: C.optimal, background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.25)" }}
            >
              <Trophy size={11} />
              Achieve
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            title="Delete goal"
            className="flex items-center justify-center w-7 h-7 rounded-lg disabled:opacity-40"
            style={{ color: C.alert, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {goal.description && (
        <div className="text-xs mb-3" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {goal.description}
        </div>
      )}

      {/* Progress */}
      {hasBar && actualPct != null && target != null && current != null && (
        <div className="mb-3">
          <div className="flex items-end justify-between gap-2 mb-1.5 flex-wrap">
            <div className="text-xs font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {fmtValue(current)}
              <span className="font-semibold" style={{ color: "var(--text-tertiary)" }}> / {fmtValue(target)}</span>
            </div>
            <div className="flex items-center gap-2">
              {pace && (
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ color: pace.color, background: pace.bg, border: `1px solid ${pace.border}` }}
                >
                  {pace.label}
                </span>
              )}
              <span className="text-xs font-bold" style={{ color: meta.color, fontFamily: "var(--font-mono)" }}>
                {Math.min(999, actualPct).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-tertiary)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: isAchieved ? C.optimal : meta.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* Deadline + habit nudge row */}
      <div className="flex items-center gap-3 flex-wrap mb-1">
        {daysLeft != null && !isAchieved && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: daysLeft < 0 ? C.alert : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            <CalendarClock size={11} />
            {daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`}
          </span>
        )}
        {isHabit && (
          <>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: C.crypto, fontFamily: "var(--font-mono)" }}>
                <Flame size={11} />
                {streak}d streak
              </span>
            )}
            <span className="text-[10px] font-semibold" style={{ color: lastAgo != null && lastAgo > 1 ? C.warning : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {lastAgo == null ? "No check-ins yet" : lastAgo === 0 ? "Checked in today" : `Last check-in ${lastAgo}d ago`}
            </span>
          </>
        )}
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>
            Milestones · {doneCount}/{milestones.length}
          </div>
          <div className="flex flex-col gap-1.5">
            {milestones.map((m, i) => (
              <div key={`${m.label}-${i}`} className="flex items-center gap-2">
                {m.done
                  ? <CheckCircle2 size={13} style={{ color: C.optimal, flexShrink: 0 }} />
                  : <Circle size={13} style={{ color: "var(--border-active)", flexShrink: 0 }} />}
                <span
                  className="text-xs flex-1 min-w-0 truncate"
                  style={{
                    color: m.done ? "var(--text-tertiary)" : "var(--text-secondary)",
                    textDecoration: m.done ? "line-through" : "none",
                  }}
                >
                  {m.label}
                </span>
                {m.value != null && (
                  <span className="text-[10px] font-semibold" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {fmtValue(num(m.value))}
                  </span>
                )}
                {m.date && (
                  <span className="text-[10px] font-semibold" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {String(m.date).slice(0, 10)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
