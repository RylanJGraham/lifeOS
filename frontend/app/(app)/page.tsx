"use client";

import { motion } from "framer-motion";
import {
  Activity, TrendingUp, TrendingDown, Minus, Heart, Wallet, DollarSign,
  AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight, Clock,
  Moon, Dumbbell, UtensilsCrossed, PiggyBank,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabaseClient";
import { THEME } from "../../utils/theme";
import PulseRing, { PulseSegment } from "../components/visualizations/PulseRing";
import AnomalyStream, { LogEntry } from "../components/visualizations/AnomalyStream";

// ─── Colour constants ─────────────────────────────────────────────
const C = {
  ...THEME,
  health:   "#E03535",
  wealth:   "#059669",
  sleep:    "#5B42E8",
  nutrition:"#00A878",
  text:     "#0F172A",
  textSec:  "#475569",
  textTer:  "#94A3B8",
};

// ─── Time range filter ────────────────────────────────────────────
const RANGE_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const RANGE_LABEL: Record<string, string> = {
  day: "today", week: "last 7 days", month: "last 30 days", year: "last 365 days",
};

function rangeCutoffISO(filter: string): string {
  const d = new Date();
  if (filter === "day") d.setHours(0, 0, 0, 0); // today, local
  else d.setDate(d.getDate() - (RANGE_DAYS[filter] ?? 30));
  return d.toISOString();
}

const curSym = (c: string) => (c === "EUR" ? "€" : "$");
const fmtNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSleep = (mins: number) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

// ─── Empty state ─────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, message }: { icon: any; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 flex-1">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
        style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
        <Icon size={16} style={{ color: C.textTer }} />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textSec }}>{title}</div>
      <div className="text-xs max-w-[260px] leading-relaxed" style={{ color: C.textTer }}>{message}</div>
    </div>
  );
}

// ─── Animation variants ───────────────────────────────────────────
const container: any = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const item: any     = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 24 } } };

// ─── Sub-components ──────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const h = 28, w = 72;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`).join(" ");
  const last = pts.split(" ").pop()!;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={parseFloat(last.split(",")[0])} cy={parseFloat(last.split(",")[1])} r={2.5} fill={color} />
    </svg>
  );
}

// Small trend arrow — goodWhenDown for metrics where lower is better (RHR etc.)
function TrendArrow({ delta, goodWhenDown = false, unit = "" }: { delta: number | null; goodWhenDown?: boolean; unit?: string }) {
  if (delta == null) return null;
  const flat = delta === 0;
  const good = flat ? true : (delta < 0) === goodWhenDown;
  const Icon = flat ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: good ? C.optimal : C.warning }}>
      <Icon size={10} />
      {flat ? "0" : Math.abs(delta)}{unit}
    </span>
  );
}

// ─── Life Pulse — real score from the last 7 days ────────────────
// sleep 40% (avg duration vs 8h) · training 30% (sessions vs 4/wk) ·
// nutrition 20% (avg protein vs target, else kcal logged days) · finance 10%
// (spend within budget if base_salary set). Missing domains reweight.
interface LifePulse {
  score: number | null;
  segments: PulseSegment[];
}

function computeLifePulse({ healthRows, workoutRows, meals, profile, transactions }: {
  healthRows: any[]; workoutRows: any[] | null; meals: any[] | null; profile: any; transactions: any[];
}): LifePulse {
  // ── Sleep (rows from the last 7 days only) ──
  const weekCutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const sleepVals = healthRows
    .filter(r => !r.recorded_at || r.recorded_at.slice(0, 10) >= weekCutoff)
    .map(r => parseFloat(r.sleep_duration_minutes))
    .filter(v => Number.isFinite(v) && v > 0);
  const avgSleep = sleepVals.length > 0 ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;
  const sleepScore = avgSleep != null ? Math.min(100, (avgSleep / 480) * 100) : null;

  // ── Training (sessions = distinct training days in the window) ──
  const sessionDays = workoutRows
    ? new Set(workoutRows.map(w => (w.workout_date || "").slice(0, 10)).filter(Boolean))
    : null;
  const trainingScore = sessionDays != null ? Math.min(100, (sessionDays.size / 4) * 100) : null;

  // ── Nutrition ──
  const proteinTarget = parseFloat(profile?.protein_target_g);
  let nutritionScore: number | null = null;
  let nutritionHint = "";
  if (meals != null) {
    const byDay: Record<string, { protein: number; kcal: number }> = {};
    meals.forEach(m => {
      const day = (m.meal_time || "").slice(0, 10);
      if (!day) return;
      if (!byDay[day]) byDay[day] = { protein: 0, kcal: 0 };
      byDay[day].protein += parseFloat(m.protein) || 0;
      byDay[day].kcal += parseFloat(m.calories) || 0;
    });
    const days = Object.values(byDay);
    if (Number.isFinite(proteinTarget) && proteinTarget > 0) {
      if (days.length > 0) {
        const avgProtein = days.reduce((a, d) => a + d.protein, 0) / days.length;
        nutritionScore = Math.min(100, (avgProtein / proteinTarget) * 100);
        nutritionHint = `${Math.round(avgProtein)}g vs ${Math.round(proteinTarget)}g protein`;
      }
    } else {
      nutritionScore = (days.length / 7) * 100;
      nutritionHint = `meals logged ${days.length}/7d`;
    }
  }

  // ── Finance (spend last 30 days vs monthly budget from base_salary) ──
  const salary = parseFloat(profile?.base_salary);
  let financeScore: number | null = null;
  let financeHint = "";
  if (Number.isFinite(salary) && salary > 0) {
    const budget = salary / 12;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const spend30 = transactions.reduce((a, t) => {
      const amt = parseFloat(t.amount) || 0;
      if (amt >= 0 || !t.transaction_date || t.transaction_date < cutoffStr) return a;
      return a + Math.abs(amt);
    }, 0);
    financeScore = spend30 <= budget ? 100 : Math.max(0, 100 - ((spend30 / budget) - 1) * 100);
    financeHint = `$${Math.round(spend30)} of $${Math.round(budget)} budget`;
  }

  const segments: PulseSegment[] = [
    { key: "sleep",     label: "Sleep",     value: sleepScore,     color: C.sleep,     hint: avgSleep != null ? `${fmtSleep(avgSleep)} vs 8h` : "no data" },
    { key: "training",  label: "Training",  value: trainingScore,  color: C.health,    hint: sessionDays != null ? `${sessionDays.size}/4 sessions` : "no data" },
    { key: "nutrition", label: "Nutrition", value: nutritionScore, color: C.nutrition, hint: nutritionHint || "no data" },
    { key: "finance",   label: "Finance",   value: financeScore,   color: C.wealth,    hint: financeHint || "no budget set" },
  ];

  const weights: Record<string, number> = { sleep: 40, training: 30, nutrition: 20, finance: 10 };
  let wSum = 0, acc = 0;
  segments.forEach(s => {
    if (s.value != null) { wSum += weights[s.key]; acc += s.value * weights[s.key]; }
  });
  const score = wSum > 0 ? acc / wSum : null;

  return { score, segments };
}

// ─── Health Quadrant — real sleep / HR / training ────────────────
function HealthQuadrant({ rows, sessions }: { rows: any[]; sessions: number | null }) {
  const num = (v: any): number | null => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const prev   = rows.length > 1 ? rows[rows.length - 2] : null;

  const sleepM   = num(latest?.sleep_duration_minutes);
  const rhr      = num(latest?.resting_heart_rate);
  const rhrPrev  = num(prev?.resting_heart_rate);
  const shr      = num(latest?.sleeping_heart_rate);
  const shrPrev  = num(prev?.sleeping_heart_rate);

  const sleepSeries = rows.map(r => num(r.sleep_duration_minutes)).filter((v): v is number => v != null);
  const rhrSeries   = rows.map(r => num(r.resting_heart_rate)).filter((v): v is number => v != null);

  return (
    <div className="card-surface p-5 flex flex-col gap-4 h-full" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Health</div>
          {latest?.recorded_at && (
            <div className="text-[10px] font-mono mt-0.5" style={{ color: C.textTer }}>
              Latest: {new Date(latest.recorded_at).toLocaleDateString()}
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(224,53,53,0.08)", border: "1px solid rgba(224,53,53,0.2)" }}>
          <Heart size={15} style={{ color: C.health }} />
        </div>
      </div>

      {!latest ? (
        <EmptyState icon={Heart} title="No health data yet"
          message="Health metrics arrive by sending screenshots in Chat (/chat) — sleep and heart rate will appear here." />
      ) : (
        <>
          {/* Sleep hero */}
          <div className="p-3 rounded-xl flex items-center justify-between"
            style={{ background: "rgba(91,66,232,0.05)", border: "1px solid rgba(91,66,232,0.15)" }}>
            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: C.sleep }}>
                <Moon size={10} /> Last night
              </div>
              <div className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.text }}>
                {sleepM != null ? fmtSleep(sleepM) : "—"}
              </div>
              {(latest.sleep_bed_time || latest.sleep_wake_time) && (
                <div className="text-[10px] font-mono mt-0.5" style={{ color: C.textTer }}>
                  {latest.sleep_bed_time ?? "—"} → {latest.sleep_wake_time ?? "—"}
                </div>
              )}
            </div>
            {sleepSeries.length >= 2 && <MiniSparkline data={sleepSeries} color={C.sleep} />}
          </div>

          {/* HR + training chips */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>Resting HR</div>
              <div className="text-xs font-black" style={{ fontFamily: "var(--font-mono)", color: C.health }}>
                {rhr != null ? `${Math.round(rhr)} bpm` : "—"}
              </div>
              <TrendArrow delta={rhr != null && rhrPrev != null ? Math.round(rhr - rhrPrev) : null} goodWhenDown />
            </div>
            <div className="p-2.5 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>Sleeping HR</div>
              <div className="text-xs font-black" style={{ fontFamily: "var(--font-mono)", color: C.sleep }}>
                {shr != null ? `${Math.round(shr)} bpm` : "—"}
              </div>
              <TrendArrow delta={shr != null && shrPrev != null ? Math.round(shr - shrPrev) : null} goodWhenDown />
            </div>
            <div className="p-2.5 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textTer }}>Sessions · 7d</div>
              <div className="text-xs font-black" style={{ fontFamily: "var(--font-mono)", color: C.nutrition }}>
                {sessions != null ? `${sessions}/4` : "—"}
              </div>
              <div className="w-full h-1 rounded-full overflow-hidden mt-1" style={{ background: C.border }}>
                <div className="h-full rounded-full" style={{ width: `${sessions != null ? Math.min(100, (sessions / 4) * 100) : 0}%`, background: C.nutrition }} />
              </div>
            </div>
          </div>

          {/* RHR trend */}
          {rhrSeries.length >= 2 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Resting HR · {rhrSeries.length} days</span>
              <MiniSparkline data={rhrSeries} color={C.health} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Portfolio Quadrant — open advisor_positions, totals per currency (no FX conversion)
function PortfolioQuadrant({ positions }: { positions: any[] }) {
  const hasData = positions.length > 0;

  const totals: Record<string, { val: number; pnl: number }> = {};
  positions.forEach(p => {
    const cur = p.currency || "USD";
    if (!totals[cur]) totals[cur] = { val: 0, pnl: 0 };
    totals[cur].val += parseFloat(p.position_value) || 0;
    totals[cur].pnl += parseFloat(p.unrealized_pnl) || 0;
  });

  const winners = positions.filter(p => (parseFloat(p.unrealized_pnl) || 0) > 0).length;
  const losers  = positions.filter(p => (parseFloat(p.unrealized_pnl) || 0) < 0).length;
  const movers = [...positions]
    .sort((a, b) => Math.abs(parseFloat(b.unrealized_pnl) || 0) - Math.abs(parseFloat(a.unrealized_pnl) || 0));
  const topMover = movers[0] || null;

  return (
    <div className="card-surface p-5 flex flex-col gap-4 h-full" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Portfolio</div>
          {hasData ? (
            <div className="mt-0.5 space-y-0.5">
              {Object.entries(totals).map(([cur, t]) => (
                <div key={cur} className="flex items-baseline gap-2">
                  <span className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: C.text }}>
                    {curSym(cur)}{fmtNum(t.val)}
                  </span>
                  <span className="text-xs font-bold" style={{ color: t.pnl >= 0 ? C.optimal : C.critical }}>
                    {t.pnl >= 0 ? "+" : "−"}{curSym(cur)}{fmtNum(Math.abs(t.pnl))} unrealized
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xl font-black mt-0.5" style={{ fontFamily: "var(--font-mono)", color: C.textTer }}>—</div>
          )}
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <Wallet size={15} style={{ color: C.wealth }} />
        </div>
      </div>

      {hasData ? (
        <>
          {Object.keys(totals).length > 1 && (
            <div className="text-[10px]" style={{ color: C.textTer }}>
              Mixed currencies — totals per currency, no FX conversion.
            </div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Positions", val: `${positions.length}`, color: C.textSec },
              { label: "Winners",   val: `${winners}`,          color: C.optimal },
              { label: "Losers",    val: `${losers}`,           color: losers > 0 ? C.critical : C.textSec },
            ].map(k => (
              <div key={k.label} className="p-2 rounded-xl text-center"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>{k.label}</div>
                <div className="text-sm font-black" style={{ fontFamily: "var(--font-mono)", color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Top mover */}
          {topMover && (() => {
            const pnl    = parseFloat(topMover.unrealized_pnl) || 0;
            const pctRaw = parseFloat(topMover.unrealized_pnl_pct);
            const pct    = Number.isFinite(pctRaw) ? pctRaw : 0;
            const pos    = pnl >= 0;
            return (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{
                  background: pos ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)",
                  border: `1px solid ${pos ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`,
                }}>
                <div className="flex items-center gap-2">
                  {pos
                    ? <ArrowUpRight size={13} style={{ color: C.optimal }} />
                    : <ArrowDownRight size={13} style={{ color: C.critical }} />}
                  <div>
                    <div className="text-xs font-bold" style={{ color: C.text }}>{topMover.symbol}</div>
                    <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textTer }}>Top mover</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-black font-mono" style={{ color: pos ? C.optimal : C.critical }}>
                    {pos ? "+" : "−"}{Math.abs(pct).toFixed(1)}%
                  </div>
                  <div className="text-[9px] font-mono" style={{ color: C.textTer }}>
                    {pos ? "+" : "−"}{curSym(topMover.currency)}{fmtNum(Math.abs(pnl))}
                  </div>
                </div>
              </div>
            );
          })()}

          <a href="/finance" className="text-[10px] font-bold mt-auto" style={{ color: C.wealth }}>
            Open Wealth OS →
          </a>
        </>
      ) : (
        <EmptyState icon={Wallet} title="No positions yet"
          message="Portfolio positions will appear here once the advisor engine logs holdings." />
      )}
    </div>
  );
}

// Cash Flow Quadrant — transactions within the selected time range
function CashFlowQuadrant({ transactions, rangeLabel, bankBalance }: { transactions: any[]; rangeLabel: string; bankBalance?: number | null }) {
  const hasData = transactions.length > 0;
  let income = 0, expenses = 0;
  const byCat: Record<string, number> = {};
  transactions.forEach(t => {
    const a = parseFloat(t.amount) || 0;
    if (a > 0) income += a;
    else {
      expenses += Math.abs(a);
      const cat = t.category || "Other";
      byCat[cat] = (byCat[cat] || 0) + Math.abs(a);
    }
  });
  const net         = income - expenses;
  const savingsRate = income > 0 ? ((net / income) * 100).toFixed(1) : "0.0";
  const topCategories = Object.entries(byCat)
    .map(([name, amount]) => ({ name, amount, pct: expenses > 0 ? (amount / expenses) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  return (
    <div className="card-surface p-5 flex flex-col gap-4 h-full" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>Cash Flow</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: net >= 0 ? C.optimal : C.critical }}>
              {net >= 0 ? "+" : "−"}${fmtNum(Math.abs(net))}
            </span>
            <span className="text-xs font-bold" style={{ color: C.textTer }}>net · {rangeLabel}</span>
          </div>
          {bankBalance != null && (
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono"
              style={{ background: "rgba(0,143,251,0.08)", color: "#008FFB", border: "1px solid rgba(0,143,251,0.25)" }}>
              <PiggyBank size={11} />
              bank ≈ €{fmtNum(bankBalance)} · live
            </span>
          )}
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <DollarSign size={15} style={{ color: C.wealth }} />
        </div>
      </div>

      {hasData ? (
        <>
          {/* Income / Expense / Savings chips */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-xl text-center" style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Income</div>
              <div className="text-sm font-black font-mono" style={{ color: C.optimal }}>+${fmtNum(income)}</div>
            </div>
            <div className="p-2 rounded-xl text-center" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Expenses</div>
              <div className="text-sm font-black font-mono" style={{ color: C.critical }}>−${fmtNum(expenses)}</div>
            </div>
            <div className="p-2 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.textTer }}>Saved</div>
              <div className="text-sm font-black font-mono" style={{ color: C.wealth }}>{savingsRate}%</div>
            </div>
          </div>

          {/* Category bars */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.textTer }}>
              Top Spending · {rangeLabel}
            </div>
            <div className="space-y-2.5">
              {topCategories.map((cat, i) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold" style={{ color: C.textSec }}>{cat.name}</span>
                    <span className="font-mono" style={{ color: C.textTer }}>
                      ${cat.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {cat.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                    <motion.div className="h-full rounded-full"
                      style={{ background: C.wealth }}
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.pct}%` }}
                      transition={{ duration: 0.8, ease: [0, 0, 0.2, 1], delay: i * 0.06 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={DollarSign} title={`No transactions · ${rangeLabel}`}
          message="No transactions fall inside the selected range. Widen the filter or wait for new transactions to be ingested." />
      )}
    </div>
  );
}

// AI Activity Feed — real system_logs (levels: INFO / WARNING / ERROR)
function ActivityFeed({ logs }: { logs: LogEntry[] }) {
  const feed = logs.slice(0, 6).map((l: any) => {
    const lvl = (l.level || "").toUpperCase();
    return {
      time:     new Date(l.timestamp || Date.now()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      type:     "system",
      priority: lvl === "ERROR" ? "critical" : lvl === "WARNING" ? "warning" : "optimal",
      title:    (l.message || "").substring(0, 52),
      detail:   l.message || "",
    };
  });

  const priColor = (p: string) =>
    p === "critical" ? C.critical : p === "warning" ? C.warning : C.optimal;

  const typeIcon: Record<string, any> = {
    portfolio: Wallet, health: Heart, spending: DollarSign,
    system: Activity, critical: AlertTriangle, optimal: CheckCircle,
  };

  return (
    <div className="card-surface p-5 flex flex-col gap-3 h-full" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textTer }}>
          AI Insights & Activity
        </div>
        <div className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(91,66,232,0.1)", color: "var(--accent-sleep)", border: "1px solid rgba(91,66,232,0.2)" }}>
          {feed.length} events
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 380 }}>
        {feed.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet"
            message="Agent events and insights will appear here once the engine emits system logs." />
        ) : feed.map((ev, i) => {
          const col   = priColor(ev.priority);
          const TIcon = typeIcon[ev.type] || typeIcon["system"];
          return (
            <motion.div key={i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-3 rounded-xl"
              style={{ background: `${col}05`, border: `1px solid ${col}18` }}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${col}15`, border: `1px solid ${col}28` }}>
                  <TIcon size={12} style={{ color: col }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="text-xs font-bold truncate" style={{ color: C.text }}>{ev.title}</div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock size={9} style={{ color: C.textTer }} />
                      <div className="text-[10px] font-mono" style={{ color: C.textTer }}>{ev.time}</div>
                    </div>
                  </div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: C.textSec }}>{ev.detail}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function TheNexus() {
  const [logs,         setLogs]        = useState<LogEntry[]>([]);
  const [healthRows,   setHealthRows]  = useState<any[]>([]);
  const [positions,    setPositions]   = useState<any[]>([]);
  const [transactions, setTxs]         = useState<any[]>([]);
  const [profile,      setProfile]     = useState<any>(null);
  const [meals,        setMeals]       = useState<any[] | null>(null);
  const [workoutRows,  setWorkoutRows] = useState<any[] | null>(null);
  const [timeFilter,   setTimeFilter]  = useState("month");

  useEffect(() => {
    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
    // health_metrics uses a fixed 30-day window: the Life Pulse always needs the
    // last 7 days regardless of the page filter, and the quadrant shows the latest.
    const monthAgoIso = new Date(Date.now() - 30 * 86400000).toISOString();

    async function fetchAll() {
      try {
        const [logsRes, metricsRes, posRes, txRes, profileRes, mealsRes, workoutsRes] = await Promise.all([
          supabase.from("system_logs").select("*").order("timestamp", { ascending: false }).limit(20),
          supabase.from("health_metrics").select("*").gte("recorded_at", monthAgoIso).order("recorded_at", { ascending: true }).limit(90),
          supabase.from("advisor_positions").select("*").eq("status", "open").order("position_value", { ascending: false }),
          supabase.from("transactions").select("*").order("transaction_date", { ascending: false }).limit(500),
          supabase.from("user_profiles").select("bank_balance, bank_balance_updated_at, base_salary, protein_target_g").limit(1),
          supabase.from("meals").select("meal_time, protein, calories").gte("meal_time", weekAgoIso).order("meal_time", { ascending: true }),
          supabase.from("workouts").select("workout_date, activity_type, duration_minutes").gte("workout_date", weekAgoIso),
        ]);
        if (!logsRes.error    && logsRes.data)            setLogs(logsRes.data as LogEntry[]);
        if (!metricsRes.error && metricsRes.data)         setHealthRows(metricsRes.data);
        if (!posRes.error     && posRes.data)             setPositions(posRes.data);
        if (!txRes.error      && txRes.data)              setTxs(txRes.data);
        if (!profileRes.error && profileRes.data?.length) setProfile(profileRes.data[0]);
        if (!mealsRes.error)                              setMeals(mealsRes.data ?? []);
        if (!workoutsRes.error)                           setWorkoutRows(workoutsRes.data ?? []);
      } catch (e) {
        console.error("Nexus fetch error:", e);
      }
    }
    fetchAll();

    // Create the channel synchronously: Strict Mode mounts effects twice, and
    // a channel created inside the async fn leaks past the first cleanup.
    const channel = supabase.channel("nexus_logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, p => {
        setLogs(prev => [p.new as LogEntry, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [timeFilter]);

  // Range filter applied client-side; full transaction set is kept for the balance estimate
  const cutoffDate  = rangeCutoffISO(timeFilter).slice(0, 10);
  const filteredTxs = transactions.filter(t => !t.transaction_date || t.transaction_date >= cutoffDate);

  // Live bank balance: stored balance + net transaction change since it was set
  let liveBalance: number | null = null;
  if (profile?.bank_balance != null) {
    const stored = parseFloat(profile.bank_balance);
    if (Number.isFinite(stored)) {
      const since = profile.bank_balance_updated_at
        ? new Date(profile.bank_balance_updated_at).toISOString().slice(0, 10)
        : null;
      const net = transactions.reduce((a, t) => {
        if (!t.transaction_date) return a;
        if (since && t.transaction_date <= since) return a;
        return a + (parseFloat(t.amount) || 0);
      }, 0);
      liveBalance = stored + net;
    }
  }

  // Life Pulse — always computed from the last 7 days, independent of the page filter
  const lifePulse = computeLifePulse({ healthRows, workoutRows, meals, profile, transactions });
  const sessionCount = workoutRows
    ? new Set(workoutRows.map(w => (w.workout_date || "").slice(0, 10)).filter(Boolean)).size
    : null;

  const hasAlert = logs.some(l => (l.level || "").toUpperCase() === "ERROR");

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-10">

      {/* Page header */}
      <motion.div variants={item} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: C.text, letterSpacing: "-0.02em" }}>
            The Nexus
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.textTer, fontFamily: "var(--font-mono)" }}>
            Cross-domain intelligence · Unified command center · Live
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
            {["Day", "Week", "Month", "Year"].map(f => (
              <button key={f} onClick={() => setTimeFilter(f.toLowerCase())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  background: timeFilter === f.toLowerCase() ? "var(--surface-tertiary)" : "transparent",
                  color: timeFilter === f.toLowerCase() ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: timeFilter === f.toLowerCase() ? "1px solid var(--border-active)" : "1px solid transparent",
                }}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full"
            style={hasAlert
              ? { background: "rgba(220,38,38,0.1)", color: C.critical, border: "1px solid rgba(220,38,38,0.25)" }
              : { background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.25)" }}>
            {hasAlert
              ? <><AlertTriangle size={11} /> Errors in system logs</>
              : <><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.optimal }} /> No errors in logs</>}
          </div>
        </div>
      </motion.div>

      {/* ROW 1: Life Pulse + Anomaly Stream */}
      <motion.div variants={item} className="grid grid-cols-12 gap-6 items-stretch">
        <div className="col-span-12 md:col-span-5 xl:col-span-4 card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
              style={{ color: C.textTer }}>
              <Activity size={12} /> Life Pulse
            </div>
            <div className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--surface-tertiary)", color: C.textTer, border: "1px solid var(--border-subtle)" }}>
              computed from last 7 days
            </div>
          </div>
          <PulseRing
            score={lifePulse.score}
            segments={lifePulse.segments}
            hasAnomaly={hasAlert}
          />
          <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {[
              { icon: Moon,            color: C.sleep,     text: "Sleep · avg duration vs 8h goal · 40%" },
              { icon: Dumbbell,        color: C.health,    text: "Training · sessions vs 4/week goal · 30%" },
              { icon: UtensilsCrossed, color: C.nutrition, text: "Nutrition · avg protein vs target · 20%" },
              { icon: PiggyBank,       color: C.wealth,    text: "Finance · spend within monthly budget · 10%" },
            ].map(d => (
              <div key={d.text} className="flex items-center gap-2">
                <d.icon size={11} style={{ color: d.color, flexShrink: 0 }} />
                <span className="text-[10px]" style={{ color: C.textTer }}>{d.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 md:col-span-7 xl:col-span-8">
          <AnomalyStream logs={logs} />
        </div>
      </motion.div>

      {/* ROW 2: Health + Portfolio Quadrants */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <HealthQuadrant rows={healthRows} sessions={sessionCount} />
        <PortfolioQuadrant positions={positions} />
      </motion.div>

      {/* ROW 3: Cash Flow + Activity Feed */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <CashFlowQuadrant transactions={filteredTxs} rangeLabel={RANGE_LABEL[timeFilter]} bankBalance={liveBalance} />
        <ActivityFeed logs={logs} />
      </motion.div>

    </motion.div>
  );
}
