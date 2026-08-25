"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, PiggyBank, Send, Sparkles, MessageSquare } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { sendBudgetCoachChat } from "../../../utils/api";
import { C, fmt2, EmptyState } from "./shared";

interface BudgetPanelProps {
  transactions: any[];
}

export default function BudgetPanel({ transactions }: BudgetPanelProps) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [newLimit, setNewLimit] = useState("");

  // Budget-coach chat state
  interface ChatMessage {
    role: "user" | "agent";
    text: string;
  }
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "I'm your budget coach. Ask me what you're spending on, whether a purchase fits, or how to save more." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const QUICK_PROMPTS = [
    "What am I spending most on?",
    "Suggest budgets based on my income",
    "Can I afford a new PC?",
    "How can I save more each month?",
  ];

  useEffect(() => {
    supabase
      .from("budgets")
      .select("*")
      .order("category")
      .then((res) => {
        setBudgets(res.data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const spentByCategory: Record<string, number> = {};
  (transactions || []).forEach((t) => {
    const amt = parseFloat(t.amount) || 0;
    if (amt >= 0 || !t.transaction_date || !t.transaction_date.startsWith(monthKey)) return;
    const cat = (t.category || "Uncategorized").trim();
    spentByCategory[cat] = (spentByCategory[cat] || 0) + Math.abs(amt);
  });

  const addBudget = async () => {
    const category = newCategory.trim();
    const limit = parseFloat(newLimit);
    if (!category || !Number.isFinite(limit) || limit <= 0) return;
    const { data, error } = await supabase
      .from("budgets")
      .upsert({
        category,
        monthly_limit: limit,
        currency: "EUR",
      })
      .select();
    if (!error && data && data[0]) {
      setBudgets((prev) => {
        const rest = prev.filter(
          (b) => b.category.toLowerCase() !== category.toLowerCase()
        );
        return [...rest, data[0]].sort((a, b) => a.category.localeCompare(b.category));
      });
      setNewCategory("");
      setNewLimit("");
    }
  };

  const deleteBudget = async (id: string) => {
    await supabase.from("budgets").delete().eq("id", id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next = [...messages, { role: "user" as const, text: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const history = next.slice(-20).map((m) => ({
        role: m.role,
        content: m.text,
      }));
      const { reply } = await sendBudgetCoachChat(trimmed, history);
      setMessages([...next, { role: "agent" as const, text: reply }]);
    } catch (e: any) {
      setMessages([
        ...next,
        {
          role: "agent" as const,
          text: "I couldn't reach the budget coach right now. Make sure the backend is running on :8000.",
        },
      ]);
    }
    setSending(false);
  };

  if (loading) return <EmptyState message="Loading budgets..." icon={PiggyBank} />;

  return (
    <div className="space-y-5">
      {/* Budget coach chat */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={15} style={{ color: C.equity }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Budget Coach
          </div>
        </div>

        <div
          ref={scrollRef}
          className="space-y-3 mb-4 max-h-[320px] overflow-y-auto pr-1"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-[11px] leading-relaxed p-3 rounded-xl ${
                m.role === "user" ? "ml-8" : "mr-8"
              }`}
              style={{
                background:
                  m.role === "user" ? "rgba(91,66,232,0.12)" : "var(--surface-tertiary)",
                border:
                  m.role === "user"
                    ? "1px solid rgba(91,66,232,0.25)"
                    : "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="mr-8 text-[11px] p-3 rounded-xl italic" style={{ color: "var(--text-tertiary)" }}>
              Thinking…
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors hover:opacity-80"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Sparkles size={10} style={{ color: C.warning }} /> {prompt}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask about your spending, budgets, or affordability…"
            className="flex-1 px-3 py-2 rounded-xl text-sm bg-transparent border"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={sending || !input.trim()}
            className="flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
            style={{ background: C.equity, color: "#fff" }}
          >
            <Send size={14} /> Send
          </button>
        </div>
      </div>

      {/* Budget envelopes */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Budget Envelopes · {monthKey}
        </div>
        {budgets.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No budgets set. Add your first envelope below.
          </div>
        ) : (
          <div className="space-y-4">
            {budgets.map((b) => {
              const spent = spentByCategory[b.category] || 0;
              const limit = parseFloat(b.monthly_limit) || 0;
              const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
              const over = spent > limit;
              const color = over ? C.alert : pct >= 80 ? C.warning : C.optimal;
              return (
                <div key={b.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                        {b.category}
                      </span>
                      <span className="font-mono" style={{ color: "var(--text-tertiary)" }}>
                        €{fmt2(spent)} / €{fmt2(limit)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black font-mono" style={{ color }}>
                        {pct.toFixed(0)}%
                      </span>
                      <button
                        onClick={() => deleteBudget(b.id)}
                        className="p-1 rounded hover:bg-red-500/10"
                        title="Delete budget"
                      >
                        <Trash2 size={12} style={{ color: C.alert }} />
                      </button>
                    </div>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-tertiary)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: [0, 0, 0.2, 1] }}
                    />
                  </div>
                  {over && (
                    <div className="text-[10px] font-bold mt-1" style={{ color: C.alert }}>
                      Over budget by €{fmt2(spent - limit)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Add / Update Envelope
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Category (e.g. Groceries)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl text-sm bg-transparent border"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <input
            type="number"
            placeholder="Monthly limit €"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 rounded-xl text-sm bg-transparent border"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <button
            onClick={addBudget}
            className="flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            style={{ background: C.wealth, color: "#fff" }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
