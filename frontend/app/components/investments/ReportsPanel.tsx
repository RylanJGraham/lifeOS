"use client";

import { useState } from "react";
import { FileText, TrendingUp, ChevronRight } from "lucide-react";
import DailyReportModal from "../finance/DailyReportModal";
import type { DailyReport } from "./types";
import { C, num, EmptyState } from "./shared";

export default function ReportsPanel({ reports }: { reports: DailyReport[] }) {
  const [modalOpen, setModalOpen] = useState(false);

  // DailyReportModal manages its own report list + selection (props are
  // only open/onClose), so a row click simply opens the viewer.
  const openViewer = () => setModalOpen(true);

  return (
    <>
      <div className="card-surface p-5" style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Daily Advisor Reports
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              Written by the advisor after each 15:30 CET run
            </div>
          </div>
          <button onClick={openViewer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            style={{ background: "rgba(91,66,232,0.08)", color: C.equity, border: "1px solid rgba(91,66,232,0.25)" }}>
            <FileText size={13} />
            Open Report
          </button>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            message="No daily reports yet. The advisor writes its first HTML report to advisor_daily_reports after its next run."
            icon={FileText}
          />
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={openViewer}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left transition-all hover:opacity-80"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", cursor: "pointer" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(91,66,232,0.1)", border: "1px solid rgba(91,66,232,0.25)" }}>
                    <FileText size={13} style={{ color: C.equity }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {r.title || "Daily Advisor Report"}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                      <span>{r.report_date}</span>
                      {r.market_regime && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest"
                          style={{ background: "var(--surface-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                          {r.market_regime}
                        </span>
                      )}
                      {r.vix_level != null && <span>VIX {num(r.vix_level)}</span>}
                      {r.portfolio_value != null && (
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp size={9} />${num(r.portfolio_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      {r.status && <span className="uppercase tracking-widest">{r.status}</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <DailyReportModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
