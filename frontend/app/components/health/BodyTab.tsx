"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Scale, Plus, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { C, EmptyState, fmtDay, rangeLabel } from "./shared";

interface BodyTabProps {
  metricsHistory: any[];
  timeFilter: string;
}

interface WeightPoint {
  day: string;
  label: string;
  weight: number;
  change: number | null;
}

export default function BodyTab({ metricsHistory, timeFilter }: BodyTabProps) {
  const [profile, setProfile] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [newWeight, setNewWeight] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setUserId(data.user.id);
    });
    supabase
      .from("user_profiles")
      .select("height_cm, current_weight_kg, target_weight_kg")
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setProfile(data);
      });
  }, []);

  const weightRows = useMemo(() => {
    return (metricsHistory || [])
      .filter((m: any) => m.body_weight_kg != null)
      .sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  }, [metricsHistory]);

  const points: WeightPoint[] = useMemo(() => {
    return weightRows.map((row: any, idx: number) => {
      const w = parseFloat(row.body_weight_kg);
      const prev = idx > 0 ? parseFloat(weightRows[idx - 1].body_weight_kg) : null;
      return {
        day: row.recorded_at,
        label: fmtDay(row.recorded_at),
        weight: w,
        change: prev != null ? w - prev : null,
      };
    });
  }, [weightRows]);

  const latest = points.length > 0 ? points[points.length - 1].weight : profile?.current_weight_kg ?? null;
  const heightCm = profile?.height_cm ?? 190;
  const heightM = Number(heightCm) / 100;
  const bmi = latest != null && heightM > 0 ? latest / (heightM * heightM) : null;
  const targetKg = profile?.target_weight_kg ?? null;

  const logWeight = async () => {
    const val = parseFloat(newWeight);
    if (!Number.isFinite(val) || val <= 20 || val >= 300 || !userId) return;
    setSaving(true);
    const { error } = await supabase.from("health_metrics").insert({
      user_id: userId,
      recorded_at: new Date().toISOString(),
      body_weight_kg: val,
      notes: "Manual check-in",
    });
    if (!error) {
      setNewWeight("");
      // The realtime subscription on health_metrics will refresh the parent list.
      // Also keep profile current_weight_kg in sync.
      await supabase.from("user_profiles").update({ current_weight_kg: val }).eq("user_id", userId);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Height</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{heightCm} <span className="text-xs font-semibold">cm</span></div>
        </div>
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Current Weight</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{latest != null ? `${latest.toFixed(1)}` : "—"} <span className="text-xs font-semibold">kg</span></div>
        </div>
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Target Weight</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{targetKg != null ? `${Number(targetKg).toFixed(1)}` : "—"} <span className="text-xs font-semibold">kg</span></div>
        </div>
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>BMI</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{bmi != null ? bmi.toFixed(1) : "—"}</div>
        </div>
      </div>

      {/* Log weight */}
      <div className="card-surface p-4 flex flex-col sm:flex-row gap-3 items-center" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center gap-2 flex-1 w-full">
          <Scale size={16} style={{ color: C.cv }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Log weight check-in</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="number"
            step="0.1"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") logWeight(); }}
            placeholder="kg"
            className="w-full sm:w-32 px-3 py-2 rounded-xl text-sm bg-transparent border"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <button
            onClick={logWeight}
            disabled={saving || !newWeight}
            className="flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
            style={{ background: C.cv, color: "#fff" }}
          >
            {saving ? <Activity size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
        </div>
      </div>

      {/* Chart */}
      {points.length >= 2 ? (
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Weight Trend · {rangeLabel(timeFilter)}</div>
            {points.length > 1 && (
              <div className="flex items-center gap-1 text-xs font-bold" style={{ color: points[points.length - 1].weight >= points[0].weight ? C.warning : C.optimal }}>
                {points[points.length - 1].weight >= points[0].weight ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {(points[points.length - 1].weight - points[0].weight).toFixed(1)} kg
              </div>
            )}
          </div>
          <div className="w-full overflow-x-auto">
            <div style={{ minWidth: 320, height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}
                    labelStyle={{ color: "var(--text-tertiary)", fontSize: 11 }}
                    itemStyle={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 700 }}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} kg`, "Weight"]}
                  />
                  {targetKg != null && <ReferenceLine y={Number(targetKg)} stroke={C.optimal} strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="weight" stroke={C.cv} strokeWidth={2} dot={{ r: 3, fill: C.cv }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : points.length === 1 ? (
        <div className="card-surface p-6 text-center" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>One check-in recorded</div>
          <div className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{points[0].weight.toFixed(1)} <span className="text-sm font-semibold">kg</span></div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{fmtDay(points[0].day)}</div>
        </div>
      ) : (
        <EmptyState message="No weight check-ins yet. Log one above or send a screenshot with your scale reading in Chat." icon={Scale} />
      )}

      {/* Check-in list */}
      {points.length > 0 && (
        <div className="card-surface p-4" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>Check-ins</div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {[...points].reverse().map((p, idx) => {
              const reversedIdx = points.length - 1 - idx;
              const prev = reversedIdx > 0 ? points[reversedIdx - 1].weight : null;
              const delta = prev != null ? p.weight - prev : null;
              return (
                <div key={p.day + idx} className="flex items-center justify-between py-2" style={{ borderBottom: idx === points.length - 1 ? "none" : "1px solid var(--border-subtle)" }}>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{fmtDay(p.day)}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{p.weight.toFixed(1)} kg</span>
                    {delta != null && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: delta > 0 ? "rgba(224,53,53,0.12)" : delta < 0 ? "rgba(0,230,118,0.12)" : "var(--surface-tertiary)",
                        color: delta > 0 ? C.cv : delta < 0 ? C.optimal : "var(--text-tertiary)"
                      }}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
