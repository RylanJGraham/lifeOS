"use client";

import { useState } from "react";
import { Dumbbell, Heart, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Model from "react-body-highlighter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer
} from "recharts";
import { C, rangeLabel, fmtDay, fmtDayLong, dayKeyOf, EmptyState, NeedMoreNote, DayLens } from "./shared";

const MUSCLE_MAP: Record<string, string[]> = {
  "Chest": ["chest"],
  "Back": ["upper-back", "lower-back"],
  "Front Delts": ["front-deltoids"],
  "Rear Delts": ["back-deltoids"],
  "Biceps": ["biceps"],
  "Triceps": ["triceps"],
  "Abs": ["abs"],
  "Quads": ["quadriceps"],
  "Hamstrings": ["hamstring"],
  "Glutes": ["gluteal"],
  "Calves": ["calves"],
};
const MUSCLE_HIGHLIGHTS = ["#F2A468", "#EA8838", "#E07020"];

interface MuscleCoveragePanelProps {
  dbWorkouts?: any[];
  templateExercises: any[];
  timeFilter: string;
  label?: string;
}

function MuscleCoveragePanel({ dbWorkouts, templateExercises, timeFilter, label }: MuscleCoveragePanelProps) {
  const lensLabel = label ?? rangeLabel(timeFilter);
  const exToGroup: Record<string, string> = {};
  templateExercises.forEach(t => { if (t.exercise_name && t.muscle_group) exToGroup[t.exercise_name] = t.muscle_group; });

  const groupSets: Record<string, number> = {};
  Object.keys(MUSCLE_MAP).forEach(g => { groupSets[g] = 0; });
  let unmatched = 0;
  (dbWorkouts || []).forEach(w => {
    if (!(w.sets > 0 || w.reps > 0 || w.weight > 0)) return;
    const g = exToGroup[w.exercise_name];
    if (!g || !(g in groupSets)) { unmatched++; return; }
    groupSets[g] += w.sets || 0;
  });

  const totalSets = Object.values(groupSets).reduce((a, b) => a + b, 0);
  const maxSets = Math.max(1, ...Object.values(groupSets));
  const legend = Object.entries(groupSets).sort((a, b) => b[1] - a[1]);

  const modelData = Object.entries(groupSets)
    .filter(([, sets]) => sets > 0)
    .map(([group, sets]) => ({
      name: group,
      muscles: MUSCLE_MAP[group] as any,
      frequency: Math.max(1, Math.ceil((sets / maxSets) * 3)),
    }));

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Muscle Coverage · {lensLabel}
        </div>
        <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
          {totalSets} working sets
        </div>
      </div>

      {totalSets === 0 ? (
        <NeedMoreNote message={`No template-matched lifting sets in the ${lensLabel} — log a session from a template to see muscle coverage.`} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 flex flex-col items-center sm:flex-row sm:justify-center gap-2">
              <div className="text-center">
                <Model type="anterior" data={modelData} bodyColor="#E2E6F0" highlightedColors={MUSCLE_HIGHLIGHTS} style={{ width: "9rem" }} />
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "var(--text-tertiary)" }}>Front</div>
              </div>
              <div className="text-center">
                <Model type="posterior" data={modelData} bodyColor="#E2E6F0" highlightedColors={MUSCLE_HIGHLIGHTS} style={{ width: "9rem" }} />
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "var(--text-tertiary)" }}>Back</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Sets per Muscle Group</div>
              <div className="space-y-1.5">
                {legend.map(([group, sets]) => {
                  const neglected = sets === 0;
                  return (
                    <div key={group} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg"
                      style={neglected
                        ? { background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)" }
                        : { background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                      <span className="font-semibold truncate" style={{ color: neglected ? C.critical : "var(--text-secondary)" }}>
                        {group}{neglected ? " · neglected" : ""}
                      </span>
                      <span className="font-black font-mono shrink-0 ml-2" style={{ color: neglected ? C.critical : C.kinematic }}>
                        {sets}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {unmatched > 0 && (
            <div className="text-[10px] italic mt-3" style={{ color: "var(--text-tertiary)" }}>
              {unmatched} unmatched exercise row{unmatched !== 1 ? "s" : ""} not shown (no template muscle mapping)
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
      <button className="w-full text-left p-4 flex flex-col gap-3 transition-colors hover:bg-black/[0.02]" onClick={() => setOpen(x => !x)}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{s.title}</span>
            {s.exercises.length > 0 && (
              <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{s.exercises.length} exercise{s.exercises.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span className="text-xs font-mono">{new Date(s.date).toLocaleDateString()}</span>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono">
          {s.stats.distance_km != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Dist</div>
              <div className="font-bold" style={{ color: C.kinematic }}>{s.stats.distance_km} km</div>
            </div>
          )}
          {s.stats.duration_minutes != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Time</div>
              <div className="font-bold" style={{ color: C.optimal }}>{Math.round(s.stats.duration_minutes)} m</div>
            </div>
          )}
          {s.stats.average_heartrate != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Avg HR</div>
              <div className="font-bold" style={{ color: C.cv }}>{s.stats.average_heartrate} bpm</div>
            </div>
          )}
          {s.stats.max_heartrate != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Max HR</div>
              <div className="font-bold" style={{ color: C.cv }}>{s.stats.max_heartrate} bpm</div>
            </div>
          )}
          {s.stats.calories != null && (
            <div>
              <div style={{ color: "var(--text-tertiary)" }}>Cals</div>
              <div className="font-bold" style={{ color: C.nutrition }}>{s.stats.calories}</div>
            </div>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {s.exercises.length > 0 && (
                <div className="space-y-1.5 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {s.exercises.map((ex: any) => (
                    <div key={ex.id} className="flex items-center justify-between gap-4 text-xs pt-1.5">
                      <span className="font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{ex.exercise_name}</span>
                      <span className="font-black font-mono shrink-0" style={{ color: C.optimal, whiteSpace: "nowrap" }}>
                        {ex.sets > 0 ? `${ex.sets} sets` : ""}{ex.reps > 0 ? ` × ${ex.reps} reps` : ""}{ex.weight > 0 ? ` @ ${ex.weight} kg` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {s.hrData.length > 0 && (
                <div style={{ height: "60px", width: "100%", marginTop: "8px" }}>
                  <ResponsiveContainer>
                    <AreaChart data={s.hrData}>
                      <defs>
                        <linearGradient id={`grad-hr-${s.key.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.cv} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={C.cv} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="hr" stroke={C.cv} strokeWidth={1.5} fill={`url(#grad-hr-${s.key.replace(/[^a-zA-Z0-9]/g, "")})`} dot={false} isAnimationActive={false} />
                      <Tooltip contentStyle={{ background: "#000", border: "none", color: "#fff", borderRadius: "8px", fontSize: "10px", padding: "2px 6px" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface WorkoutsPanelProps {
  dbWorkouts?: any[];
  templateExercises?: any[];
  timeFilter: string;
  viewMode: "range" | "day";
  onViewModeChange: (m: "range" | "day") => void;
  selectedDay: string;
  onDayChange: (d: string) => void;
}

export default function WorkoutsPanel({
  dbWorkouts, templateExercises, timeFilter, viewMode, onViewModeChange, selectedDay, onDayChange
}: WorkoutsPanelProps) {
  const rangeWorkouts = viewMode === "day"
    ? (dbWorkouts || []).filter(w => dayKeyOf(w.workout_date) === selectedDay)
    : (dbWorkouts || []);
  const lensLabel = viewMode === "day" ? fmtDayLong(selectedDay) : rangeLabel(timeFilter);

  const progressionData: Record<string, any[]> = {};

  const cardioWorkouts = rangeWorkouts.filter(w => w.distance_km || w.duration_minutes || w.average_heartrate);
  const liftingWorkouts = rangeWorkouts.filter(w => !w.distance_km && (w.weight > 0 || w.reps > 0 || w.sets > 0));

  const sessionGroups = (() => {
    const map = new Map<string, any[]>();
    cardioWorkouts.forEach(w => {
      const day = (w.workout_date || "").split("T")[0];
      const key = `${day}|${w.activity_type || w.exercise_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return Array.from(map.entries()).map(([key, rows]) => {
      const stats = rows.find(r => r.duration_minutes != null || r.calories != null || r.average_heartrate != null || r.distance_km != null) || rows[0];
      const streamRow = rows.find(r => r.streams?.heartrate?.data);
      return {
        key,
        title: rows[0].activity_type || rows[0].exercise_name,
        date: rows[0].workout_date,
        stats,
        exercises: rows.filter(r => (r.sets > 0 || r.reps > 0 || r.weight > 0)),
        hrData: streamRow ? streamRow.streams.heartrate.data.map((hr: number, idx: number) => ({ time: idx, hr })) : [],
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const dailyVolume: Record<string, { volume: number; sets: number }> = {};
  const exerciseFreq: Record<string, number> = {};
  liftingWorkouts.forEach(w => {
    const date = w.workout_date.split('T')[0];
    if (!dailyVolume[date]) dailyVolume[date] = { volume: 0, sets: 0 };
    dailyVolume[date].sets += w.sets || 0;
    dailyVolume[date].volume += (w.sets || 0) * (w.weight || 0);
    exerciseFreq[w.exercise_name] = (exerciseFreq[w.exercise_name] || 0) + 1;
  });
  const volumeData = Object.keys(dailyVolume).sort().map(d => ({
    date: fmtDay(d),
    volume: Math.round(dailyVolume[d].volume),
    sets: dailyVolume[d].sets,
  }));
  const topFrequent = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sessionDays = Object.keys(dailyVolume).length;

  liftingWorkouts.forEach(w => {
    const date = w.workout_date.split('T')[0];
    const ex = w.exercise_name;
    const metricValue = w.weight > 0 ? w.weight : (w.reps || 0);
    if (metricValue > 0) {
      if (!progressionData[ex]) progressionData[ex] = [];
      const existingDate = progressionData[ex].find((d: any) => d.date === date);
      if (existingDate) {
        if (metricValue > existingDate.value) existingDate.value = metricValue;
      } else {
        progressionData[ex].push({ date, value: metricValue });
      }
    }
  });

  const topExercises = Object.keys(progressionData)
    .filter(k => progressionData[k].length > 1)
    .sort((a, b) => progressionData[b].length - progressionData[a].length)
    .slice(0, 3);

  return (
    <div className="space-y-5">
      <DayLens mode={viewMode} onModeChange={onViewModeChange} day={selectedDay} onDayChange={onDayChange} />
      {rangeWorkouts.length === 0 ? (
        <EmptyState message={viewMode === "day"
          ? `No workouts logged on ${fmtDayLong(selectedDay)}. Log a session from a template or via Chat (/chat).`
          : `No workouts logged in the ${rangeLabel(timeFilter)}. Log a session from a template or via Chat (/chat).`} icon={Dumbbell} />
      ) : (
        <>
          {volumeData.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                  Training Volume · {lensLabel}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {sessionDays} session day{sessionDays !== 1 ? "s" : ""} · {liftingWorkouts.reduce((a, w) => a + (w.sets || 0), 0)} sets
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                      <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: number, name: string) => name === "volume" ? [`${v} kg`, "Volume (sets × kg)"] : [v, "Sets"]}
                        contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12 }}
                      />
                      <Bar dataKey="volume" name="volume" fill={C.kinematic} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Exercise Frequency</div>
                  <div className="space-y-1.5">
                    {topFrequent.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                        <span className="font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{name}</span>
                        <span className="font-black font-mono shrink-0 ml-2" style={{ color: C.kinematic }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <MuscleCoveragePanel dbWorkouts={rangeWorkouts} templateExercises={templateExercises || []} timeFilter={timeFilter} label={lensLabel} />

          {sessionGroups.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Heart size={14} /> Session Log · {lensLabel}
              </div>
              <div className="space-y-4">
                {sessionGroups.map((s) => (
                  <SessionCard key={s.key} s={s} />
                ))}
              </div>
            </div>
          )}

          {liftingWorkouts.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Dumbbell size={14} /> Executed Protocol · {lensLabel}
              </div>
              <div className="space-y-3">
                {liftingWorkouts.slice(0, 10).map((ex) => (
                  <div key={ex.id} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex-1">
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{ex.exercise_name}</div>
                    </div>
                    <div className="text-sm font-black text-right" style={{ fontFamily: "var(--font-mono)", color: C.optimal, whiteSpace: "nowrap" }}>
                      {ex.sets} sets {ex.reps ? `x ${ex.reps} reps` : ""} {ex.weight > 0 ? `@ ${ex.weight}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topExercises.length > 0 && (
            <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Progression Trajectory · {lensLabel}</div>
              <div className="space-y-6">
                {topExercises.map((ex, i) => {
                  const data = progressionData[ex].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const color = i === 0 ? C.kinematic : i === 1 ? C.optimal : C.trends;
                  return (
                    <div key={ex}>
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-sm font-bold">{ex}</div>
                        <div className="text-xs font-mono font-bold" style={{ color }}>{data[data.length-1].value} peak</div>
                      </div>
                      <div style={{ height: "100px", width: "100%" }}>
                        <ResponsiveContainer>
                          <AreaChart data={data}>
                            <defs>
                              <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#grad-${i})`} />
                            <Tooltip contentStyle={{ background: "#000", border: "none", color: "#fff", borderRadius: "8px", fontSize: "12px", padding: "4px 8px" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
