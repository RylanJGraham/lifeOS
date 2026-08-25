"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { C, rangeLabel, fmtDay, fmtDayLong, dayKeyOf, EmptyState, NeedMoreNote, DayLens } from "./shared";

interface SleepScheduleChartProps {
  rows: any[];
  label: string;
  onJumpToDay?: (dk: string) => void;
}

function SleepScheduleChart({ rows, label, onJumpToDay }: SleepScheduleChartProps) {
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);

  const STAGE_SEGMENTS = [
    { key: "deep", label: "Deep", color: "#5B42E8" },
    { key: "rem", label: "REM", color: "#9B85F2" },
    { key: "light", label: "Light", color: "#D3CBF9" },
  ] as const;

  const parseHM = (s?: string | null): number | null => {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60;
  };
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  const clock = (h: number) => `${String(Math.round(h) % 24).padStart(2, "0")}:00`;
  const clockHM = (h: number) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const timed = rows.map(r => {
    const bed = parseHM(r.sleep_bed_time);
    const wake = parseHM(r.sleep_wake_time);
    if (bed == null || wake == null) return null;
    return { start: bed >= 12 ? bed : bed + 24, end: wake >= 12 ? wake : wake + 24 };
  }).filter(Boolean) as Array<{ start: number; end: number }>;

  const avgBed = timed.length ? timed.reduce((a, t) => a + t.start, 0) / timed.length : 24;
  const avgWake = timed.length ? timed.reduce((a, t) => a + t.end, 0) / timed.length : null;
  const bedStdMin = timed.length > 1
    ? Math.round(Math.sqrt(timed.reduce((a, t) => a + Math.pow(t.start - avgBed, 2), 0) / timed.length) * 60)
    : null;

  const entries = rows.map(r => {
    const bed = parseHM(r.sleep_bed_time);
    const wake = parseHM(r.sleep_wake_time);
    const hasTimes = bed != null && wake != null;
    const start = hasTimes ? (bed! >= 12 ? bed! : bed! + 24) : avgBed;
    const deep = r.sleep_deep_minutes ?? 0;
    const rem = r.sleep_rem_minutes ?? 0;
    const light = Math.max(0, r.sleep_duration_minutes - deep - rem);
    const d = new Date(r.recorded_at);
    return {
      dk: dayKeyOf(r.recorded_at),
      label: d.toLocaleDateString([], { weekday: "short" }),
      dateNum: d.getDate(),
      start,
      durH: r.sleep_duration_minutes / 60,
      estimated: !hasTimes,
      bed: r.sleep_bed_time, wake: r.sleep_wake_time,
      deep, rem, light, total: r.sleep_duration_minutes,
      sleepHr: r.sleeping_heart_rate ?? null,
      quality: r.sleep_duration_minutes >= 420 ? C.optimal : r.sleep_duration_minutes >= 360 ? C.warning : C.critical,
    };
  });

  const avgDurMin = rows.length ? Math.round(rows.reduce((a, r) => a + r.sleep_duration_minutes, 0) / rows.length) : 0;
  const ROW_H = 32;
  const X = (h: number) => `${((h - 18) / 18) * 100}%`;
  const ticks = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
  const hoverEntry = hover != null ? entries[hover.i] : null;

  const stats = [
    { label: "Avg Duration", val: fmt(avgDurMin), color: C.sleep },
    { label: "Avg Bed", val: timed.length ? clockHM(avgBed) : "—", color: C.sleep },
    { label: "Avg Wake", val: avgWake != null ? clockHM(avgWake) : "—", color: C.warning },
    {
      label: "Consistency",
      val: bedStdMin != null ? `±${bedStdMin} min` : "—",
      color: bedStdMin == null ? C.textTertiary : bedStdMin <= 30 ? C.optimal : bedStdMin <= 60 ? C.warning : C.critical,
    },
  ];

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Bed &amp; Wake Schedule · {label}
        </div>
        <div className="text-[10px] italic" style={{ color: "var(--text-tertiary)" }}>click a night for its day view</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {stats.map(s => (
          <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            <div className="text-lg font-black" style={{ fontFamily: "var(--font-mono)", color: s.color, lineHeight: 1 }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="flex">
        <div className="w-10 sm:w-12 shrink-0" />
        <div className="relative flex-1 h-4 mb-1">
          {ticks.map((t, i) => (
            <span key={t} className={`absolute text-[9px] font-mono ${i % 2 === 1 ? "hidden sm:block" : ""}`}
              style={{ left: X(t), transform: "translateX(-50%)", color: "var(--text-tertiary)" }}>
              {clock(t)}
            </span>
          ))}
        </div>
        <div className="w-16 sm:w-20 shrink-0" />
      </div>

      <div className="flex">
        <div className="w-10 sm:w-12 shrink-0 flex flex-col">
          {entries.map(e => (
            <div key={e.dk} style={{ height: ROW_H }} className="flex items-center text-[10px] font-mono font-bold" >
              <span style={{ color: "var(--text-tertiary)" }}>{e.label} <span style={{ color: "var(--text-secondary)" }}>{e.dateNum}</span></span>
            </div>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: entries.length * ROW_H }}>
          <div className="absolute top-0 bottom-0 rounded"
            style={{ left: X(23), width: `${((31 - 23) / 18) * 100}%`, background: "rgba(91,66,232,0.06)" }} />
          {ticks.map(t => (
            <div key={t} className="absolute top-0 bottom-0 w-px" style={{ left: X(t), background: "var(--border-subtle)" }} />
          ))}

          {entries.map((e, i) => (
            <div key={e.dk}
              className="absolute flex overflow-hidden cursor-pointer transition-transform hover:scale-y-110"
              style={{
                top: i * ROW_H + 5, height: ROW_H - 10,
                left: X(e.start), width: `${(e.durH / 18) * 100}%`,
                borderRadius: 6,
                border: e.estimated ? `1.5px dashed ${C.sleep}` : "none",
                opacity: e.estimated ? 0.55 : 1,
              }}
              onClick={() => onJumpToDay?.(e.dk)}
              onMouseEnter={() => setHover({ i, x: ((e.start - 18) / 18) * 100 })}
              onMouseLeave={() => setHover(null)}
            >
              <div style={{ width: `${(e.deep / e.total) * 100}%`, background: STAGE_SEGMENTS[0].color }} />
              <div style={{ width: `${(e.rem / e.total) * 100}%`, background: STAGE_SEGMENTS[1].color }} />
              <div style={{ width: `${(e.light / e.total) * 100}%`, background: STAGE_SEGMENTS[2].color }} />
            </div>
          ))}

          {timed.length > 0 && (
            <div className="absolute top-0 bottom-0" style={{ left: X(avgBed), borderLeft: `2px dashed ${C.sleep}` }}>
              <span className="absolute top-0 left-1 text-[8px] font-bold whitespace-nowrap" style={{ color: C.sleep }}>avg bed</span>
            </div>
          )}
          {avgWake != null && timed.length > 1 && (
            <div className="absolute top-0 bottom-0" style={{ left: X(avgWake), borderLeft: `2px dashed ${C.warning}` }}>
              <span className="absolute top-0 left-1 text-[8px] font-bold whitespace-nowrap" style={{ color: C.warning }}>avg wake</span>
            </div>
          )}

          {hoverEntry && hover != null && (
            <div className="absolute z-10 card-surface px-3 py-2 text-xs shadow-lg pointer-events-none"
              style={{
                left: `${Math.min(Math.max(hover.x, 10), 55)}%`,
                top: hover.i * ROW_H - 4,
                transform: "translateY(-100%)",
                borderRadius: "var(--radius-md)", minWidth: 150, maxWidth: 200,
              }}>
              <div className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{hoverEntry.label} {hoverEntry.dateNum}</div>
              <div className="font-mono" style={{ color: C.sleep }}>
                {hoverEntry.estimated
                  ? `~${clockHM(hoverEntry.start)} → ~${clockHM(hoverEntry.start + hoverEntry.durH)} (est.)`
                  : `${hoverEntry.bed} → ${hoverEntry.wake}`}
              </div>
              <div className="font-mono" style={{ color: "var(--text-secondary)" }}>Duration: {fmt(hoverEntry.total)}</div>
              <div className="font-mono" style={{ color: STAGE_SEGMENTS[0].color }}>Deep: {fmt(hoverEntry.deep)}</div>
              <div className="font-mono" style={{ color: STAGE_SEGMENTS[1].color }}>REM: {fmt(hoverEntry.rem)}</div>
              <div className="font-mono" style={{ color: "#A79DEC" }}>Light: {fmt(hoverEntry.light)}</div>
              {hoverEntry.sleepHr != null && (
                <div className="font-mono" style={{ color: C.cv }}>Sleeping HR: {hoverEntry.sleepHr} bpm</div>
              )}
              {hoverEntry.estimated && (
                <div className="text-[9px] italic mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  bed/wake not recorded — start estimated from average
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-16 sm:w-20 shrink-0 flex flex-col">
          {entries.map(e => (
            <div key={e.dk} style={{ height: ROW_H }} className="flex items-center justify-end gap-1.5 pr-1">
              <span className="text-[10px] font-mono font-bold" style={{ color: "var(--text-secondary)" }}>{fmt(e.total)}</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.quality }}
                title="green ≥7h · amber 6–7h · red <6h" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-3 mt-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
        {STAGE_SEGMENTS.map(s => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "rgba(91,66,232,0.12)" }} /> 23:00–07:00 target
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ border: `1.5px dashed ${C.sleep}`, opacity: 0.6 }} /> estimated time
        </span>
      </div>
    </div>
  );
}

interface SleepPanelProps {
  metricsHistory: any[];
  timeFilter: string;
  viewMode: "range" | "day";
  onViewModeChange: (m: "range" | "day") => void;
  selectedDay: string;
  onDayChange: (d: string) => void;
  onJumpToDay: (dk: string) => void;
}

export default function SleepPanel({
  metricsHistory, timeFilter, viewMode, onViewModeChange, selectedDay, onDayChange, onJumpToDay
}: SleepPanelProps) {
  const rows = (metricsHistory || []).filter(r => r.sleep_duration_minutes != null);
  const lens = <DayLens mode={viewMode} onModeChange={onViewModeChange} day={selectedDay} onDayChange={onDayChange} />;

  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  const STAGE_COLORS = { deep: "#5B42E8", light: "#3b82f6", rem: "#E03535" };

  const stageParts = (r: any) => {
    const deep = r.sleep_deep_minutes ?? 0;
    const rem = r.sleep_rem_minutes ?? 0;
    const light = Math.max(0, r.sleep_duration_minutes - deep - rem);
    return { deep, light, rem, total: r.sleep_duration_minutes };
  };

  if (viewMode === "day") {
    const row = rows.find(r => dayKeyOf(r.recorded_at) === selectedDay);
    if (!row) {
      return (
        <div className="space-y-5">
          {lens}
          <EmptyState icon={Moon} message={`No sleep recorded for ${fmtDayLong(selectedDay)}. Data arrives via Chat screenshots.`} />
        </div>
      );
    }
    const p = stageParts(row);
    const balanceMin = 480 - p.total;
    const kpis = [
      { label: "Total Sleep", val: fmt(p.total), color: C.sleep },
      { label: "Deep", val: `${fmt(p.deep)} · ${Math.round(p.deep / p.total * 100)}%`, color: STAGE_COLORS.deep },
      { label: "REM", val: `${fmt(p.rem)} · ${Math.round(p.rem / p.total * 100)}%`, color: STAGE_COLORS.rem },
      { label: "Light", val: `${fmt(p.light)} · ${Math.round(p.light / p.total * 100)}%`, color: STAGE_COLORS.light },
      { label: "Bed → Wake", val: `${row.sleep_bed_time ?? "—"} → ${row.sleep_wake_time ?? "—"}`, color: C.trends },
      ...(row.sleeping_heart_rate != null ? [{ label: "Sleeping HR", val: `${row.sleeping_heart_rate} bpm`, color: C.cv }] : []),
    ];
    return (
      <div className="space-y-5">
        {lens}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Night of {fmtDayLong(selectedDay)}
            </div>
            <div className="text-[10px] px-2 py-1 rounded-lg font-bold"
              style={balanceMin > 0
                ? { background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }
                : { background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>
              {balanceMin > 0 ? `${fmt(balanceMin)} under 8h` : `${fmt(-balanceMin)} over 8h`}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            {kpis.map(m => (
              <div key={m.label} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
                <div className="text-xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Stage Mix</div>
          <div className="flex h-8 rounded-xl overflow-hidden" style={{ background: "var(--border-subtle)" }}>
            {([
              { key: "deep", label: "Deep" }, { key: "light", label: "Light" }, { key: "rem", label: "REM" },
            ] as const).map(s => {
              const pctVal = Math.round((p[s.key] / p.total) * 100);
              return (
                <motion.div key={s.key}
                  initial={{ width: 0 }} animate={{ width: `${pctVal}%` }}
                  transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
                  className="flex items-center justify-center"
                  style={{ background: STAGE_COLORS[s.key] }}>
                  {pctVal >= 8 && <span className="text-[10px] font-bold text-white">{s.label} {pctVal}%</span>}
                </motion.div>
              );
            })}
          </div>
        </div>
        <SleepScheduleChart rows={[row]} label={fmtDayLong(selectedDay)} onJumpToDay={onJumpToDay} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        {lens}
        <EmptyState icon={Moon} message={`No sleep data in the ${rangeLabel(timeFilter)}. Data arrives via Chat screenshots. Sleep duration and stages are extracted automatically.`} />
      </div>
    );
  }

  const latest = rows[rows.length - 1];
  const lp = stageParts(latest);
  const avgMin = Math.round(rows.reduce((a, r) => a + r.sleep_duration_minutes, 0) / rows.length);

  const sleepHrData = rows
    .filter(r => r.sleeping_heart_rate != null)
    .map(r => ({ date: fmtDay(r.recorded_at), hr: r.sleeping_heart_rate }));

  let cum = 0;
  const balanceData = rows.map(r => {
    cum += (480 - r.sleep_duration_minutes) / 60;
    return { date: fmtDay(r.recorded_at), debt: Math.round(cum * 10) / 10 };
  });
  const finalDebt = balanceData.length ? balanceData[balanceData.length - 1].debt : 0;
  const isDebt = finalDebt > 0;

  return (
    <div className="space-y-5">
      {lens}

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Sleep Architecture · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {rows.length} night{rows.length !== 1 ? "s" : ""} recorded
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Last Night", val: fmt(lp.total), color: C.sleep },
            { label: `Avg (${rangeLabel(timeFilter)})`, val: fmt(avgMin), color: C.trends },
            { label: "Deep Sleep", val: fmt(lp.deep), color: STAGE_COLORS.deep },
            { label: "REM Sleep", val: fmt(lp.rem), color: STAGE_COLORS.rem },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="text-2xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {rows.length >= 2 ? (
        <SleepScheduleChart rows={rows} label={rangeLabel(timeFilter)} onJumpToDay={onJumpToDay} />
      ) : (
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Bed &amp; Wake Schedule · {rangeLabel(timeFilter)}
          </div>
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        </div>
      )}

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Stage Mix per Night · {rangeLabel(timeFilter)}
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
            {([["Deep", STAGE_COLORS.deep], ["Light", STAGE_COLORS.light], ["REM", STAGE_COLORS.rem]] as const).map(([l, c]) => (
              <span key={l} className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: c }} /> {l}</span>
            ))}
          </div>
        </div>
        {rows.length >= 2 ? (
          <div className="space-y-2.5">
            {rows.map(r => {
              const p = stageParts(r);
              return (
                <div key={r.recorded_at} className="flex items-center gap-3 cursor-pointer group" onClick={() => onJumpToDay(dayKeyOf(r.recorded_at))}>
                  <div className="w-14 shrink-0 text-[10px] font-bold font-mono group-hover:underline" style={{ color: "var(--text-tertiary)" }}>{fmtDay(r.recorded_at)}</div>
                  <div className="flex-1 flex h-3.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                    {([
                      { key: "deep" }, { key: "light" }, { key: "rem" },
                    ] as const).map(s => (
                      <motion.div key={s.key}
                        initial={{ width: 0 }} animate={{ width: `${(p[s.key] / p.total) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
                        style={{ background: STAGE_COLORS[s.key] }}
                        title={`${s.key}: ${fmt(p[s.key])}`}
                      />
                    ))}
                  </div>
                  <div className="w-16 shrink-0 text-right text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{fmt(p.total)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        )}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Sleeping Heart Rate · {rangeLabel(timeFilter)}
        </div>
        {sleepHrData.length >= 2 ? (
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sleepHrData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sleepHrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.sleep} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.sleep} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={["dataMin - 3", "dataMax + 3"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} bpm`, "Sleeping HR"]}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="hr" stroke={C.sleep} strokeWidth={2.5} fill="url(#sleepHrGrad)" dot={{ r: 3, fill: C.sleep }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 nights with sleeping HR in the ${rangeLabel(timeFilter)} — ${sleepHrData.length} available.`} />
        )}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Sleep Balance · {rangeLabel(timeFilter)}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Running cumulative {isDebt ? "deficit" : "surplus"} vs 8h/night across {rows.length} recorded night{rows.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-lg font-bold"
            style={isDebt
              ? { background: "rgba(217,119,6,0.1)", color: C.warning, border: "1px solid rgba(217,119,6,0.2)" }
              : { background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>
            {isDebt ? `⚠ ${Math.abs(finalDebt)}h DEBT` : `+${Math.abs(finalDebt)}h SURPLUS`}
          </div>
        </div>
        {balanceData.length >= 2 ? (
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isDebt ? C.warning : C.optimal} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isDebt ? C.warning : C.optimal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v}h`} />
                <Tooltip
                  formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}h`, "Cumulative balance"]}
                  contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="debt" stroke={isDebt ? C.warning : C.optimal} strokeWidth={2.5}
                  fill="url(#balanceGrad)" dot={{ r: 3, fill: isDebt ? C.warning : C.optimal }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 recorded nights in the ${rangeLabel(timeFilter)} — ${rows.length} available.`} />
        )}
      </div>
    </div>
  );
}
