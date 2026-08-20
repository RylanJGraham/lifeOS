"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, NotebookPen } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { PersonaConfig } from "./config";

interface Insight {
  id: string;
  insight_text: string;
  action_item: string | null;
  generated_at: string;
}

interface Note {
  id: string;
  content: string;
  created_at: string;
}

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Persona Insights Panel ──────────────────────────────────────
// Right-hand column of a specialist tab: the proactive insights the
// persona_insights worker writes to ai_insights, plus the durable notes
// the persona has logged to memories ("on record").
export default function PersonaInsightsPanel({
  persona,
  refreshKey,
}: {
  persona: PersonaConfig;
  refreshKey: number;
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const Icon = persona.icon;

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const { data: ins } = await supabase
        .from("ai_insights")
        .select("id, insight_text, action_item, generated_at")
        .eq("domain", persona.key)
        .order("generated_at", { ascending: false })
        .limit(15);
      setInsights(ins || []);

      const { data: mem } = await supabase
        .from("memories")
        .select("id, content, created_at")
        .eq("domain", persona.memoryDomain)
        .order("created_at", { ascending: false })
        .limit(10);
      setNotes(mem || []);
    })();
  }, [persona.key, persona.memoryDomain, refreshKey]);

  return (
    <div className="flex flex-col gap-6">
      {/* Insights */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} style={{ color: persona.accent }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            {persona.name}'s Insights
          </div>
        </div>
        {insights.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center p-6 text-center rounded-xl"
            style={{ background: "var(--surface-tertiary)", border: "1px dashed var(--border-subtle)" }}
          >
            <Icon size={16} style={{ color: "var(--text-tertiary)" }} className="mb-2" />
            <div className="text-[11px] max-w-sm" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              No insights yet — {persona.name} reviews your data automatically every
              evening and posts here (and on Telegram when something needs attention).
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {insights.map((ins, i) => (
              <motion.div
                key={ins.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="ai-card p-3.5"
                style={{ borderRadius: "var(--radius-lg)", borderLeftColor: persona.accent }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {relDate(ins.generated_at)}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {ins.insight_text}
                </div>
                {ins.action_item && (
                  <div className="text-[11px] font-semibold mt-2" style={{ color: persona.accent }}>
                    → {ins.action_item}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* On record */}
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center gap-2 mb-4">
          <NotebookPen size={14} style={{ color: persona.accent }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            On Record
          </div>
        </div>
        {notes.length === 0 ? (
          <div className="text-[11px]" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            Nothing on record yet — durable facts {persona.name} saves from your conversations show up here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span className="text-[10px] font-semibold shrink-0 mt-0.5"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", width: 64 }}>
                  {relDate(n.created_at)}
                </span>
                <span style={{ lineHeight: 1.5 }}>{n.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
