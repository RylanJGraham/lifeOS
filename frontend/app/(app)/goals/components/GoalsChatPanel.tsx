"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SendHorizonal, Trash2, Target } from "lucide-react";
import { sendGoalsChat } from "../../../../utils/api";

// ─── Types & constants ───────────────────────────────────────────
interface GoalsChatMessage {
  role: "user" | "agent" | "error";
  text: string;
  ts: number;
}

const STORAGE_KEY = "lifeos_goals_chat_history";
const MAX_STORED = 100;
const HISTORY_WINDOW = 20; // messages sent to the backend as context

const QUICK_ACTIONS = [
  "Help me plan a big purchase",
  "I want to quit a habit",
  "Review my goals",
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Goals Chat Panel ────────────────────────────────────────────
export default function GoalsChatPanel({ onGoalsChanged }: { onGoalsChanged: () => void }) {
  const [messages, setMessages] = useState<GoalsChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw).slice(-MAX_STORED));
    } catch {
      // Corrupt history — start fresh
    }
  }, []);

  // Persist history (capped)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // Storage full / unavailable — ignore
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMsg: GoalsChatMessage = { role: "user", text: trimmed, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const history = next
        .slice(-HISTORY_WINDOW)
        .filter((m) => m.role === "user" || m.role === "agent")
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const { reply, goals_changed } = await sendGoalsChat(trimmed, history);
      setMessages((prev) => [...prev, { role: "agent", text: reply, ts: Date.now() }]);
      if (goals_changed) onGoalsChanged();
    } catch (e: unknown) {
      const msg =
        e instanceof TypeError
          ? "Backend unreachable — start uvicorn on :8000"
          : e instanceof Error
          ? e.message
          : "Unknown error";
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

  return (
    <div
      className="card-surface flex flex-col min-h-[480px] lg:h-[calc(100vh-160px)]"
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
            <Target size={13} color="#fff" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Goals Architect</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Plan · track · review
            </div>
          </div>
        </div>
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
              <Target size={22} color="#fff" />
            </div>
            <div className="text-base font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>
              Design your next goal
            </div>
            <div className="text-xs max-w-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Theorycraft a goal — I'll turn it into a tracked plan when you're ready.
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
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[85%] px-4 py-2.5 text-sm leading-relaxed"
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

      {/* Composer */}
      <div className="flex items-end gap-2.5 px-5 py-3.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
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
          placeholder={sending ? "Agent is thinking..." : "Describe a goal…  (Enter to send, Shift+Enter for newline)"}
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
          disabled={sending || !input.trim()}
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
  );
}
