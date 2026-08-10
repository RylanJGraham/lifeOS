"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, TrendingUp, Activity } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";

interface DailyReport {
  id: string;
  report_date: string;
  title: string | null;
  status: string | null;
  report_type: string | null;
  html_content: string | null;
  market_regime: string | null;
  vix_level: number | null;
  portfolio_value: number | null;
  generated_at: string | null;
}

const curSym = (c: string) => (c === "EUR" ? "€" : "$");

export default function DailyReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    supabase
      .from("advisor_daily_reports")
      .select("id, report_date, title, status, report_type, html_content, market_regime, vix_level, portfolio_value, generated_at")
      .order("report_date", { ascending: false })
      .limit(14)
      .then(res => {
        const rows = (res.data as DailyReport[]) || [];
        setReports(rows);
        setSelectedDate(rows.length > 0 ? rows[0].report_date : null);
        setLoaded(true);
      });
  }, [open]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onKey]);

  const report = reports.find(r => r.report_date === selectedDate) || null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="card-surface w-full max-w-4xl flex flex-col overflow-hidden"
            style={{ borderRadius: "var(--radius-xl)", maxHeight: "90vh", background: "var(--surface-primary)" }}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(91,66,232,0.1)", border: "1px solid rgba(91,66,232,0.25)" }}>
                  <FileText size={16} style={{ color: "#5B42E8" }} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {report?.title || "Daily Advisor Report"}
                  </div>
                  <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {report && <span>{report.report_date}</span>}
                    {report?.market_regime && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest"
                        style={{ background: "var(--surface-tertiary)", color: "var(--text-secondary)" }}>
                        {report.market_regime}
                      </span>
                    )}
                    {report?.vix_level != null && <span>VIX {report.vix_level}</span>}
                    {report?.portfolio_value != null && (
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp size={10} />${report.portfolio_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                style={{ background: "var(--surface-tertiary)", color: "var(--text-tertiary)" }}>
                <X size={15} />
              </button>
            </div>

            {/* Date chips */}
            {reports.length > 1 && (
              <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
                {reports.map(r => (
                  <button key={r.report_date} onClick={() => setSelectedDate(r.report_date)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono shrink-0 transition-all"
                    style={{
                      background: selectedDate === r.report_date ? "var(--surface-tertiary)" : "transparent",
                      color: selectedDate === r.report_date ? "var(--text-primary)" : "var(--text-tertiary)",
                      border: selectedDate === r.report_date ? "1px solid var(--border-active)" : "1px solid var(--border-subtle)",
                    }}>
                    {r.report_date.slice(5)}
                  </button>
                ))}
              </div>
            )}

            {/* Body — bot-generated HTML in a fully sandboxed iframe */}
            <div className="flex-1 overflow-hidden" style={{ minHeight: "400px" }}>
              {report?.html_content ? (
                <iframe
                  key={report.id}
                  srcDoc={report.html_content}
                  sandbox=""
                  title={`Daily report ${report.report_date}`}
                  className="w-full h-full border-0"
                  style={{ minHeight: "60vh", background: "#fff" }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-10 gap-3">
                  <Activity size={20} style={{ color: "var(--text-tertiary)" }} />
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                    {loaded ? "No report yet" : "Loading…"}
                  </div>
                  <div className="text-xs text-center max-w-xs" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                    The advisor writes its daily HTML report to advisor_daily_reports after each 15:30 CET run.
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
