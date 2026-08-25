"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, AlertTriangle, CheckCircle, Activity } from "lucide-react";
import { supabase } from "../../../../utils/supabaseClient";

interface HeartbeatRow {
  worker_id: string;
  status: string;
  last_run_at: string | null;
  next_expected_at: string | null;
  error: string | null;
  metadata: any;
}

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

function formatNext(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "due now";
  if (diff < 60) return `in ${diff}s`;
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  return `in ${Math.floor(diff / 86400)}d`;
}

export default function ScheduledTasksPanel() {
  const [tasks, setTasks] = useState<HeartbeatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("worker_heartbeats")
      .select("worker_id, status, last_run_at, next_expected_at, error, metadata")
      .order("last_run_at", { ascending: false });
    if (!error && data) {
      setTasks(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    const channel = supabase
      .channel("worker_heartbeats_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_heartbeats" }, () => fetchTasks())
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const healthy = tasks.filter((t) => t.status === "ok" && !t.error).length;
  const failing = tasks.filter((t) => t.status === "error" || t.error).length;

  return (
    <div
      className="card-surface flex flex-col"
      style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", marginBottom: 20 }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: "var(--text-tertiary)" }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Scheduled Jobs
          </div>
        </div>
        {!loading && (
          <div className="flex items-center gap-1.5">
            {failing > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#DC262610", color: "var(--status-critical)" }}>
                {failing} issue{failing > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(0,230,118,0.12)", color: "var(--status-optimal)" }}>
              {healthy} healthy
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-2 p-3" style={{ maxHeight: 360, overflowY: "auto" }}>
        {loading && (
          <div className="text-xs text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            Loading job schedule…
          </div>
        )}
        {!loading && tasks.length === 0 && (
          <div className="text-xs text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            No worker heartbeats yet. Run a worker to register its schedule.
          </div>
        )}
        {tasks.map((t) => {
          const ok = t.status === "ok" && !t.error;
          return (
            <div
              key={t.worker_id}
              className="p-3 rounded-xl"
              style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-[12px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {t.worker_id}
                </div>
                {ok ? (
                  <CheckCircle size={13} style={{ color: "var(--status-optimal)", flexShrink: 0 }} />
                ) : t.error ? (
                  <AlertTriangle size={13} style={{ color: "var(--status-critical)", flexShrink: 0 }} />
                ) : (
                  <Activity size={13} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                <span>last: {timeAgo(t.last_run_at)}</span>
                <span>next: {formatNext(t.next_expected_at)}</span>
              </div>
              {t.error && (
                <div className="text-[10px] font-semibold mt-1.5 px-2 py-1 rounded-lg" style={{ color: "var(--status-critical)", background: "#DC26260D", border: "1px solid #DC262625" }}>
                  {t.error}
                </div>
              )}
              {t.metadata?.schedule && (
                <div className="text-[10px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                  Schedule: {t.metadata.schedule}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
