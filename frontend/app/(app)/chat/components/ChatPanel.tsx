"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SendHorizonal, Trash2, Sparkles, Server, ImagePlus, X } from "lucide-react";
import { sendChat, getPipelines, runPipeline, Pipeline } from "../../../../utils/api";
import PipelinesPanel from "./PipelinesPanel";

// ─── Types & constants ───────────────────────────────────────────
interface ChatMessage {
  role: "user" | "agent" | "system" | "error";
  text: string;
  ts: number;
  image?: string;   // data URL — kept in memory only, stripped before localStorage
  hadImage?: boolean; // set on persisted messages whose image data was stripped
}

const STORAGE_KEY = "lifeos_chat_history";
const MAX_STORED = 100;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB — LLM API rejects huge images

const QUICK_ACTIONS = [
  "What did I eat today?",
  "How's my training load?",
  "Portfolio summary",
  "Log a workout",
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Chat Panel ──────────────────────────────────────────────────
export default function ChatPanel() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [backendOffline, setBackendOffline] = useState(false);
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [showPipelines, setShowPipelines] = useState(false);
  const [attachment, setAttachment] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [attachError, setAttachError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevStatuses = useRef<Record<string, string> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore history + prefill composer from ?q=
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw).slice(-MAX_STORED));
    } catch {
      // Corrupt history — start fresh
    }
    const q = searchParams.get("q");
    if (q) setInput(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist history (capped) — strip image data URLs to protect the storage quota
  useEffect(() => {
    try {
      const storable = messages
        .slice(-MAX_STORED)
        .map((m) => (m.image ? { ...m, image: undefined, hadImage: true } : m));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storable));
    } catch {
      // Storage full / unavailable — ignore
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Poll pipelines every 5s; detect running → idle transitions
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getPipelines();
        setBackendOffline(false);
        setPipelines(data);

        const prev = prevStatuses.current;
        const next: Record<string, string> = {};
        data.forEach((p) => { next[p.id] = p.status; });
        if (prev) {
          data.forEach((p) => {
            if (prev[p.id] === "running" && p.status !== "running") {
              setMessages((msgs) => [
                ...msgs,
                {
                  role: "system",
                  text: p.last_error ? `✗ ${p.name} failed: ${p.last_error}` : `✓ ${p.name} finished`,
                  ts: Date.now(),
                },
              ]);
            }
          });
        }
        prevStatuses.current = next;
      } catch {
        setBackendOffline(true);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachError(`"${file.name}" is too large — images must be under 8MB.`);
      return;
    }
    setAttachError("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",")[1] || "";
      if (base64) setAttachment({ dataUrl, base64 });
    };
    reader.readAsDataURL(file);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || sending) return;
    const image = attachment;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed, ts: Date.now(), ...(image ? { image: image.dataUrl } : {}) },
    ]);
    setInput("");
    setAttachment(null);
    setAttachError("");
    setSending(true);
    try {
      const { reply } = await sendChat(trimmed, image?.base64);
      setBackendOffline(false);
      setMessages((prev) => [...prev, { role: "agent", text: reply, ts: Date.now() }]);
    } catch (e: any) {
      const msg =
        e instanceof TypeError
          ? "Backend unreachable — start uvicorn on :8000"
          : e?.message || "Unknown error";
      setMessages((prev) => [...prev, { role: "error", text: msg, ts: Date.now() }]);
    }
    setSending(false);
  };

  const clearHistory = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleRunPipeline = async (id: string) => {
    try {
      await runPipeline(id);
      setRunErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      // Refresh immediately so the badge flips to "running"
      const data = await getPipelines().catch(() => null);
      if (data) setPipelines(data);
    } catch (e: any) {
      const msg = e?.message || "Failed to start pipeline";
      setRunErrors((prev) => ({ ...prev, [id]: msg }));
      setTimeout(() => {
        setRunErrors((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 5000);
    }
  };

  return (
    <div className="flex gap-5" style={{ height: "calc(100vh - 104px)" }}>
      {/* ─── Conversation column ─── */}
      <div
        className="card-surface flex-1 flex flex-col min-w-0"
        style={{ borderRadius: "var(--radius-xl)", overflow: "hidden" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={13} color="#fff" />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>LifeOS Agent</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                LangGraph · online
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPipelines((v) => !v)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{
                color: "var(--text-secondary)",
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Server size={13} />
              Pipelines
            </button>
            <button
              onClick={clearHistory}
              title="Clear conversation"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{
                color: "var(--text-tertiary)",
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Trash2 size={13} />
              Clear
            </button>
          </div>
        </div>

        {/* Mobile pipelines drawer */}
        {showPipelines && (
          <div
            className="lg:hidden p-3"
            style={{ borderBottom: "1px solid var(--border-subtle)", maxHeight: 300, overflowY: "auto" }}
          >
            <PipelinesPanel
              pipelines={pipelines}
              offline={backendOffline}
              runErrors={runErrors}
              onRun={handleRunPipeline}
            />
          </div>
        )}

        {/* Message stream */}
        <div ref={scrollRef} className="flex-1 px-5 py-4" style={{ overflowY: "auto" }}>
          {messages.length === 0 && !sending ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-glow-ai)",
                  marginBottom: 16,
                }}
              >
                <Sparkles size={22} color="#fff" />
              </div>
              <div className="text-base font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>
                Talk to your LifeOS
              </div>
              <div className="text-xs max-w-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Log meals, workouts, and expenses in plain text — or ask questions
                about your health, training, and portfolio data.
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                {QUICK_ACTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-3.5 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      color: "var(--accent-sleep)",
                      background: "var(--ai-surface)",
                      border: "1px solid var(--border-ai)",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={`${m.ts}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={`flex ${m.role === "user" ? "justify-end" : m.role === "system" ? "justify-center" : "justify-start"}`}
                  >
                    {m.role === "system" ? (
                      <div
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                        style={{
                          color: m.text.startsWith("✗") ? "var(--status-critical)" : "var(--status-optimal)",
                          background: "var(--surface-tertiary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {m.text}
                      </div>
                    ) : (
                      <div
                        className="max-w-[75%] px-4 py-2.5 text-sm leading-relaxed"
                        style={{
                          borderRadius: "var(--radius-lg)",
                          borderBottomRightRadius: m.role === "user" ? 4 : "var(--radius-lg)",
                          borderBottomLeftRadius: m.role === "user" ? "var(--radius-lg)" : 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          ...(m.role === "user"
                            ? { background: "var(--accent-sleep)", color: "#fff" }
                            : m.role === "error"
                            ? {
                                background: "#DC26260D",
                                border: "1px solid #DC262630",
                                color: "var(--status-critical)",
                              }
                            : {
                                background: "var(--surface-secondary)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-primary)",
                                boxShadow: "var(--shadow-card)",
                              }),
                        }}
                      >
                        {m.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.image}
                            alt="attachment"
                            className="rounded-lg mb-2"
                            style={{ maxWidth: 220, maxHeight: 160, objectFit: "cover", display: "block" }}
                          />
                        )}
                        {!m.image && m.hadImage && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md mb-2"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: m.role === "user" ? "rgba(255,255,255,0.75)" : "var(--text-tertiary)",
                              background: m.role === "user" ? "rgba(255,255,255,0.15)" : "var(--surface-tertiary)",
                            }}
                          >
                            <ImagePlus size={10} /> image
                          </span>
                        )}
                        {m.text}
                        <div
                          className="text-[9px] mt-1 font-semibold"
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: m.role === "user" ? "rgba(255,255,255,0.6)" : "var(--text-tertiary)",
                            textAlign: m.role === "user" ? "right" : "left",
                          }}
                        >
                          {formatTime(m.ts)}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Thinking indicator */}
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div
                    className="flex items-center gap-1.5 px-4 py-3"
                    style={{
                      borderRadius: "var(--radius-lg)",
                      borderBottomLeftRadius: 4,
                      background: "var(--surface-secondary)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--accent-sleep)",
                          display: "inline-block",
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        {messages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pb-2">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={sending}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-40"
                style={{
                  color: "var(--accent-sleep)",
                  background: "var(--ai-surface)",
                  border: "1px solid var(--border-ai)",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Attachment preview + attach error */}
        {(attachment || attachError) && (
          <div className="flex items-center gap-3 px-5 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {attachment && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.dataUrl}
                  alt="attachment preview"
                  className="rounded-lg"
                  style={{ width: 56, height: 56, objectFit: "cover", border: "1px solid var(--border-subtle)" }}
                />
                <button
                  onClick={() => setAttachment(null)}
                  title="Remove attachment"
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full"
                  style={{
                    width: 18,
                    height: 18,
                    background: "var(--text-primary)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            )}
            {attachError && (
              <span className="text-[11px] font-semibold" style={{ color: "var(--status-critical)" }}>
                {attachError}
              </span>
            )}
          </div>
        )}

        {/* Composer */}
        <div className="flex items-end gap-2.5 px-5 py-3.5" style={{ borderTop: attachment || attachError ? "none" : "1px solid var(--border-subtle)" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            title="Attach an image"
            className="flex items-center justify-center rounded-xl disabled:opacity-40"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              color: "var(--text-tertiary)",
              background: "var(--surface-tertiary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <ImagePlus size={16} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={sending}
            placeholder={
              sending
                ? "Agent is thinking..."
                : attachment
                ? "Add a caption... (optional)"
                : "Message the agent…  (Enter to send, Shift+Enter for newline)"
            }
            rows={2}
            className="flex-1 text-sm px-3.5 py-2.5 rounded-xl resize-none focus:outline-none disabled:opacity-50"
            style={{
              background: "var(--surface-tertiary)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={sending || (!input.trim() && !attachment)}
            className="flex items-center justify-center rounded-xl text-white disabled:opacity-40"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
              boxShadow: "0 2px 8px rgba(91,66,232,0.3)",
            }}
          >
            <SendHorizonal size={16} />
          </button>
        </div>
      </div>

      {/* ─── Pipelines side panel (desktop) ─── */}
      <div className="hidden lg:block" style={{ width: 320, flexShrink: 0 }}>
        <PipelinesPanel
          pipelines={pipelines}
          offline={backendOffline}
          runErrors={runErrors}
          onRun={handleRunPipeline}
        />
      </div>
    </div>
  );
}
