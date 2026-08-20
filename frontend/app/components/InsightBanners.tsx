"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Stethoscope, Apple, Dumbbell, Target, Zap, Wallet, TrendingUp, Radar, LucideIcon,
} from "lucide-react";
import { supabase } from "../../utils/supabaseClient";

// Shared registry: which engine wrote the insight, how it's badged, where it links.
export const INSIGHT_DOMAIN_META: Record<string, { name: string; icon: LucideIcon; color: string; href: string }> = {
  doctor:       { name: "Dr. Ada",      icon: Stethoscope, color: "#E03535", href: "/specialist" },
  nutritionist: { name: "Nora",         icon: Apple,       color: "#00A878", href: "/specialist" },
  pt:           { name: "Kane",         icon: Dumbbell,    color: "#E07020", href: "/specialist" },
  readiness:    { name: "Readiness",    icon: Zap,         color: "#5B42E8", href: "/health" },
  pacing:       { name: "Fuel pacing",  icon: Apple,       color: "#00A878", href: "/health" },
  bodycomp:     { name: "Body comp",    icon: TrendingUp,  color: "#0EA5E9", href: "/health" },
  correlations: { name: "Patterns",     icon: Radar,       color: "#0EA5E9", href: "/health" },
  cash:         { name: "Cash flow",    icon: Wallet,      color: "#059669", href: "/finance" },
  habits:       { name: "Habits",       icon: Target,      color: "#0EA5E9", href: "/goals" },
  goals:        { name: "Goals",        icon: Target,      color: "#0EA5E9", href: "/goals" },
};

function relDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * Compact insight banners for a page. Shows the latest insight per requested
 * domain; renders nothing when there are none, so pages stay clean.
 */
export default function InsightBanners({ domains, limit = 3 }: { domains: string[]; limit?: number }) {
  const [insights, setInsights] = useState<any[]>([]);
  const key = domains.join(",");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const { data } = await supabase
        .from("ai_insights")
        .select("id, domain, insight_text, action_item, generated_at")
        .in("domain", key.split(","))
        .order("generated_at", { ascending: false })
        .limit(30);
      const seen = new Set<string>();
      const latest = (data || []).filter(i => {
        if (seen.has(i.domain)) return false;
        seen.add(i.domain);
        return true;
      });
      setInsights(latest.slice(0, limit));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit]);

  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {insights.map((ins, i) => {
        const meta = INSIGHT_DOMAIN_META[ins.domain] || INSIGHT_DOMAIN_META.goals;
        const Icon = meta.icon;
        return (
          <motion.div
            key={ins.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-3.5 rounded-xl"
            style={{
              background: `${meta.color}06`,
              border: `1px solid ${meta.color}20`,
              borderLeft: `3px solid ${meta.color}`,
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Icon size={12} style={{ color: meta.color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
                  {meta.name}
                </span>
              </div>
              <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {relDay(ins.generated_at)}
              </span>
            </div>
            <div className="text-[11px] leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>
              {ins.insight_text}
            </div>
            {ins.action_item && (
              <div className="flex items-start justify-between gap-2 mt-1.5">
                <div className="text-[11px] font-bold" style={{ color: meta.color }}>→ {ins.action_item}</div>
                <Link href={meta.href} className="text-[10px] font-bold shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  open →
                </Link>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
