"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { Server, MessageSquare, ExternalLink } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { getBackendStatus, BackendStatus } from "../../../utils/api";
import { THEME } from "../../../utils/theme";

// ─── Status Badge ────────────────────────────────────────────────
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? THEME.optimal : THEME.critical;
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{
        fontFamily: "var(--font-mono)",
        color,
        background: `${color}10`,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  );
}

export default function SystemObservabilityHub() {
  const [apiStatus, setApiStatus] = useState<BackendStatus | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    // 1. Poll FastAPI Status
    const fetchStatus = async () => {
      try {
        const data = await getBackendStatus();
        setApiStatus(data);
      } catch (e) {
        setApiStatus(null);
        console.error("FastAPI unreachable", e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s

    // 2. Fetch System Logs from Supabase
    // Note: requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const fetchLogs = async () => {
        const { data, error } = await supabase
          .from("system_logs")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);

        if (!error && data) setLogs(data);
      };

      fetchLogs();

      // Subscribe to real-time logs
      const channel = supabase
        .channel("system_logs_changes")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 20));
        })
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }

    return () => clearInterval(interval);
  }, []);

  const levelStyle = (level: string) => {
    const l = (level || "").toUpperCase();
    if (l === "ERROR" || l === "CRITICAL" || l === "ALERT")
      return { color: THEME.critical, background: `${THEME.critical}10`, border: `1px solid ${THEME.critical}30` };
    if (l === "WARNING")
      return { color: THEME.warning, background: `${THEME.warning}10`, border: `1px solid ${THEME.warning}30` };
    return { color: THEME.textSecondary, background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            System Observability
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            Engine status · service health · live logs
          </p>
        </div>
        <StatusBadge
          ok={apiStatus?.status === "online"}
          label={`API: ${apiStatus?.status || "offline"}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Service Statuses */}
        <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Server size={14} style={{ color: "var(--text-tertiary)" }} />
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Core Services
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: "Ollama (LLM)",        status: apiStatus?.services?.ollama },
              { label: "Supabase (Vector DB)", status: apiStatus?.services?.supabase },
              { label: "Ngrok (Webhook)",      status: apiStatus?.services?.ngrok },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                <StatusBadge ok={s.status === "ok"} label={s.status || "unknown"} />
              </div>
            ))}
          </div>
        </div>

        {/* Tracing Links */}
        <div className="card-surface p-5 col-span-1 lg:col-span-2" style={{ borderRadius: "var(--radius-xl)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
            LangSmith Tracing
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            Deep insights into LangGraph agent reasoning and execution paths.
          </p>
          <div
            className="p-4 rounded-xl flex justify-between items-center flex-wrap gap-2"
            style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}
          >
            <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              LANGCHAIN_TRACING_V2 is Enabled
            </span>
            <a
              href="https://smith.langchain.com/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--accent-trends)" }}
            >
              Open LangSmith Dashboard <ExternalLink size={12} />
            </a>
          </div>

          {/* Chat / Pipelines pointer */}
          <Link
            href="/chat"
            className="mt-3 p-4 rounded-xl flex justify-between items-center transition-all hover:opacity-80"
            style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare size={14} style={{ color: "var(--accent-sleep)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Pipeline controls and the LangGraph agent live in the Chat module
              </span>
            </div>
            <span className="text-xs font-bold" style={{ color: "var(--accent-sleep)" }}>Open Chat →</span>
          </Link>
        </div>
      </div>

      {/* Real-time System Logs */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Live System Logs (Realtime)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-active)" }}>
                {["Timestamp", "Level", "Service", "Message"].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log, i) => (
                  <tr key={log.id || i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-mono)", ...levelStyle(log.level) }}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{log.service}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{log.message}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Waiting for system logs... Ensure NEXT_PUBLIC_SUPABASE_URL is set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
