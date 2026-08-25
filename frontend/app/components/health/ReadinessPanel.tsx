"use client";

import { Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ComposedChart, Line, Scatter
} from "recharts";
import { C, rangeLabel, fmtDay, EmptyState, NeedMoreNote, RANGE_DAYS } from "./shared";

interface ReadinessPanelProps {
  metricsHistory: any[];
  timeFilter: string;
}

export default function ReadinessPanel({ metricsHistory, timeFilter }: ReadinessPanelProps) {
  const rows = metricsHistory || [];
  if (rows.length === 0) {
    return <EmptyState icon={Heart} message={`No cardiovascular metrics in the ${rangeLabel(timeFilter)}. Data arrives via Chat screenshots. HRV, resting HR and VO₂ max are extracted automatically.`} />;
  }

  const latest = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;

  const kpis = [
    { label: "HRV", key: "hrv", unit: "ms", color: C.nutrition },
    { label: "Resting HR", key: "resting_heart_rate", unit: "bpm", color: C.trends },
    { label: "Sleeping HR", key: "sleeping_heart_rate", unit: "bpm", color: C.sleep },
    { label: "VO₂ Max", key: "vo2_max", unit: "", color: C.cv },
    { label: "Avg HR", key: "average_heart_rate", unit: "bpm", color: C.kinematic },
  ].filter(k => latest[k.key] != null).map(k => ({
    ...k,
    val: latest[k.key],
    delta: prev && prev[k.key] != null ? Math.round((latest[k.key] - prev[k.key]) * 10) / 10 : null,
  }));

  const chartData = rows.map(r => ({
    date: fmtDay(r.recorded_at),
    hrv: r.hrv ?? null,
    rhr: r.resting_heart_rate ?? null,
  }));
  const hasHrv = chartData.some(d => d.hrv != null);
  const hasRhr = chartData.some(d => d.rhr != null);

  const hrRangeData = rows
    .filter(r => r.min_heart_rate != null && r.max_heart_rate != null)
    .map(r => ({
      date: fmtDay(r.recorded_at),
      base: r.min_heart_rate,
      span: Math.max(1, r.max_heart_rate - r.min_heart_rate),
      min: r.min_heart_rate,
      max: r.max_heart_rate,
      avg: r.average_heart_rate ?? null,
      rhr: r.resting_heart_rate ?? null,
      sleepHr: r.sleeping_heart_rate ?? null,
    }));

  const HRRangeTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="card-surface px-3 py-2 text-xs shadow-lg" style={{ borderRadius: "var(--radius-md)", minWidth: 150 }}>
        <div className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="font-mono" style={{ color: C.cv }}>Range: {d.min}–{d.max} bpm</div>
        {d.avg != null && <div className="font-mono" style={{ color: "var(--text-secondary)" }}>Avg: {d.avg} bpm</div>}
        {d.rhr != null && <div className="font-mono" style={{ color: C.trends }}>Resting: {d.rhr} bpm</div>}
        {d.sleepHr != null && <div className="font-mono" style={{ color: C.sleep }}>Sleeping: {d.sleepHr} bpm</div>}
      </div>
    );
  };

  const ZONE_COLORS: Record<string, string> = {
    zone1: C.optimal, zone2: C.trends, zone3: C.warning, zone4: C.cv, zone5: "#9C27B0",
  };
  const zoneDays = rows.map(r => {
    const z = r.heart_rate_zones;
    if (!z || typeof z !== "object" || Array.isArray(z)) return null;
    const zones = ["zone1", "zone2", "zone3", "zone4", "zone5"]
      .map(k => ({ key: k, min: typeof (z as any)[k] === "number" ? (z as any)[k] : 0 }));
    const total = zones.reduce((a, zz) => a + zz.min, 0);
    return total > 0 ? { date: fmtDay(r.recorded_at), zones, total } : null;
  }).filter(Boolean) as Array<{ date: string; zones: { key: string; min: number }[]; total: number }>;

  const rangeDays = RANGE_DAYS[timeFilter] ?? 30;
  const showHrRange = hrRangeData.length >= 2 && hrRangeData.length / rangeDays >= 0.4;
  const showZones = zoneDays.length > 0;

  return (
    <div className="space-y-5">
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Cardiovascular Metrics · {rangeLabel(timeFilter)}
          </div>
          <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {rows.length} day{rows.length !== 1 ? "s" : ""} recorded
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map(m => (
            <div key={m.label} className="p-4 rounded-xl flex flex-col justify-between" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>{m.label}</div>
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-black" style={{ fontFamily: "var(--font-mono)", color: m.color, lineHeight: 1 }}>{m.val}</span>
                  <span className="text-xs pb-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.unit}</span>
                </div>
                {m.delta !== null && m.delta !== 0 && (
                  <span className="text-[10px] font-bold inline-flex items-center gap-0.5" style={{ color: m.delta > 0 ? C.optimal : C.critical, fontFamily: "var(--font-mono)" }}>
                    {m.delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                )}
                {m.delta === 0 && (
                  <span className="text-[10px] font-bold inline-flex items-center gap-0.5" style={{ color: "var(--text-tertiary)" }}>
                    <Minus size={10} /> 0
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          HRV &amp; Resting HR Trend · {rangeLabel(timeFilter)}
        </div>
        {(hasHrv || hasRhr) && chartData.filter(d => d.hrv != null || d.rhr != null).length >= 2 ? (
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[600px] h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.nutrition} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.nutrition} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rhrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.trends} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.trends} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }} />
                  {hasHrv && <Area type="monotone" dataKey="hrv" name="HRV (ms)" stroke={C.nutrition} strokeWidth={2.5} fill="url(#hrvGrad)" dot={{ r: 3, fill: C.nutrition }} connectNulls />}
                  {hasRhr && <Area type="monotone" dataKey="rhr" name="Resting HR (bpm)" stroke={C.trends} strokeWidth={2.5} fill="url(#rhrGrad)" dot={{ r: 3, fill: C.trends }} connectNulls />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <NeedMoreNote message={`Need at least 2 days with HRV or resting HR in the ${rangeLabel(timeFilter)}.`} />
        )}
      </div>

      {showHrRange && (
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Daily Heart Rate Range · {rangeLabel(timeFilter)}
        </div>
        {hrRangeData.length >= 2 ? (
          <>
            <div className="overflow-x-auto -mx-2 px-2">
              <div className="min-w-[600px] h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={hrRangeData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={["dataMin - 5", "dataMax + 5"]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip content={<HRRangeTooltip />} />
                    <Bar dataKey="base" stackId="hr" fill="transparent" isAnimationActive={false} />
                    <Bar dataKey="span" stackId="hr" name="Min–Max" fill={C.cv} fillOpacity={0.22} radius={[4, 4, 4, 4]} />
                    <Scatter dataKey="avg" name="Avg" fill={C.cv} />
                    <Line type="monotone" dataKey="rhr" name="Resting" stroke={C.trends} strokeWidth={2} dot={{ r: 3, fill: C.trends }} connectNulls />
                    <Line type="monotone" dataKey="sleepHr" name="Sleeping" stroke={C.sleep} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: C.sleep }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: C.cv, opacity: 0.3 }} /> Min–Max</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{ background: C.cv }} /> Avg</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ background: C.trends }} /> Resting</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ background: C.sleep }} /> Sleeping</span>
            </div>
          </>
        ) : null}
      </div>
      )}

      {showZones && (
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          HR Zones per Day · {rangeLabel(timeFilter)}
        </div>
        {zoneDays.length > 0 ? (
          <div className="space-y-3">
            {zoneDays.map(d => (
              <div key={d.date} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-[10px] font-bold font-mono" style={{ color: "var(--text-tertiary)" }}>{d.date}</div>
                <div className="flex-1 flex h-3 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                  {d.zones.filter(z => z.min > 0).map(z => (
                    <motion.div key={z.key}
                      initial={{ width: 0 }}
                      animate={{ width: `${(z.min / d.total) * 100}%` }}
                      transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
                      style={{ background: ZONE_COLORS[z.key] }}
                      title={`${z.key}: ${Math.round(z.min)} min`}
                    />
                  ))}
                </div>
                <div className="w-16 shrink-0 text-right text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{Math.round(d.total)} min</div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
              {["zone1", "zone2", "zone3", "zone4", "zone5"].map(k => (
                <span key={k} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: ZONE_COLORS[k] }} /> {k.replace("zone", "Z")}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
