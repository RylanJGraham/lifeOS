"use client"

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Server, MessageSquare, ExternalLink, Play, Loader2, AlertCircle, CheckCircle2, Bot, Upload, FileText } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { getBackendStatus, BackendStatus, getPipelines, runPipeline, Pipeline, getTelegramWebhookInfo, TelegramWebhookInfo, API_URL, API_TOKEN } from "../../../utils/api";
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

// ─── Pipeline Controls ─────────────────────────────────────────────
function PipelineControls() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string>("");

  const load = async () => {
    try {
      const data = await getPipelines();
      setPipelines(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load pipelines");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRun = async (id: string) => {
    setRunning(prev => ({ ...prev, [id]: true }));
    setError("");
    try {
      await runPipeline(id);
      await load();
    } catch (e: any) {
      setError(e?.message || `Failed to run ${id}`);
    } finally {
      setRunning(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="mt-3 p-4 rounded-xl" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Server size={14} style={{ color: "var(--accent-sleep)" }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Pipeline Controls</span>
      </div>
      {error && <div className="text-[11px] mb-3" style={{ color: THEME.critical }}>{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-auto">
        {pipelines.map(p => {
          const isRunning = p.status === "running" || running[p.id];
          const lastError = p.last_error;
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg text-xs" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>{p.description}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {lastError ? <AlertCircle size={10} style={{ color: THEME.critical }} /> : <CheckCircle2 size={10} style={{ color: THEME.optimal }} />}
                  <span className="text-[10px] font-mono" style={{ color: lastError ? THEME.critical : "var(--text-tertiary)" }}>{lastError || p.status}</span>
                </div>
              </div>
              <button
                onClick={() => handleRun(p.id)}
                disabled={isRunning}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                style={{ background: THEME.optimal, color: "#fff" }}
              >
                {isRunning ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                {isRunning ? "Running" : "Run"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Statement Upload Card ────────────────────────────────────────
function StatementUploadCard() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Only PDF statements are supported.");
      return;
    }
    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_URL}/statements/upload`, {
        method: "POST",
        body: formData,
        headers: API_TOKEN ? { "X-API-Key": API_TOKEN } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Upload failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setMessage(data.message || "Statement uploaded and queued.");
    } catch (e: any) {
      setMessage(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center gap-2 mb-4">
        <FileText size={14} style={{ color: "var(--text-tertiary)" }} />
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Statement Upload
        </div>
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors"
        style={{
          borderColor: isDragging ? "var(--accent-trends)" : "var(--border-subtle)",
          background: isDragging ? "var(--surface-tertiary)" : "var(--surface-secondary)",
        }}
      >
        <Upload size={24} style={{ color: "var(--text-tertiary)", margin: "0 auto 0.5rem" }} />
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Drop a bank/CC PDF here, or click to browse
        </p>
        <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          Parsed via OpenRouter vision and inserted as transactions
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
      </div>
      {uploading && (
        <div className="flex items-center gap-2 mt-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          <Loader2 size={11} className="animate-spin" /> Uploading…
        </div>
      )}
      {message && !uploading && (
        <div className="text-[11px] mt-3" style={{ color: message.includes("failed") ? THEME.critical : THEME.optimal }}>
          {message}
        </div>
      )}
    </div>
  );
}

// ─── Telegram Webhook Health ───────────────────────────────────────
function TelegramWebhookCard() {
  const [info, setInfo] = useState<TelegramWebhookInfo | null>(null);
  const [error, setError] = useState<string>("");

  const load = async () => {
    try {
      const data = await getTelegramWebhookInfo();
      setInfo(data);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to load Telegram webhook info");
      setInfo(null);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const badge = () => {
    if (!info) return <StatusBadge ok={false} label="unknown" />;
    if (info.webhook_status === "ok") return <StatusBadge ok={true} label="ok" />;
    if (info.webhook_status === "failing") return <StatusBadge ok={false} label="failing" />;
    return <StatusBadge ok={false} label="not set" />;
  };

  const statusColor = () => {
    if (!info) return THEME.textTertiary;
    if (info.webhook_status === "ok") return THEME.optimal;
    if (info.webhook_status === "failing") return THEME.critical;
    return THEME.warning;
  };

  return (
    <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Bot size={14} style={{ color: "var(--text-tertiary)" }} />
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Telegram Webhook
        </div>
      </div>

      {error && (
        <div className="text-[11px] mb-3" style={{ color: THEME.critical }}>
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Status</span>
          {badge()}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
            Webhook URL
          </div>
          <div
            className="text-xs font-mono p-2.5 rounded-lg break-all"
            style={{ background: "var(--surface-tertiary)", color: statusColor() }}
          >
            {info?.webhook_url || "—"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              Pending Updates
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              {info?.pending_update_count ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              Last Update
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              {info?.last_update_at ? new Date(info.last_update_at).toLocaleTimeString() : "—"}
            </div>
          </div>
        </div>

        {info?.error && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: THEME.critical }}>
              Last Error
            </div>
            <div className="text-[11px] p-2.5 rounded-lg" style={{ background: `${THEME.critical}10`, color: THEME.critical, border: `1px solid ${THEME.critical}30` }}>
              {info.error}
            </div>
          </div>
        )}
      </div>
    </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
              { label: "OpenRouter (LLM)",    status: apiStatus?.services?.openrouter },
              { label: "Supabase (Vector DB)", status: apiStatus?.services?.supabase },
              { label: "Webhook (HTTPS)",      status: apiStatus?.services?.ngrok },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                <StatusBadge ok={s.status === "ok"} label={s.status || "unknown"} />
              </div>
            ))}
          </div>
        </div>

        {/* Telegram Webhook */}
        <TelegramWebhookCard />

        {/* Statement Upload */}
        <StatementUploadCard />

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

          {/* Pipeline controls */}
          <PipelineControls />
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
