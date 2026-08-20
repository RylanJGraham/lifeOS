"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, RefreshCw, AlertTriangle, PieChart as PieIcon, Radar, Zap, FileText, Briefcase } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useInvestmentsData } from "../../components/investments/useInvestmentsData";
import PortfolioOverview from "../../components/investments/PortfolioOverview";
import PositionsTable from "../../components/investments/PositionsTable";
import CandidateRadar from "../../components/investments/CandidateRadar";
import SignalFeed from "../../components/investments/SignalFeed";
import ReportsPanel from "../../components/investments/ReportsPanel";
import RsuTracker from "../../components/investments/RsuTracker";
import { C } from "../../components/investments/shared";

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div className="card-surface animate-pulse" style={{ borderRadius: "var(--radius-xl)", height, background: "var(--surface-secondary)" }} />
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-5">
      <SkeletonBlock height={300} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map(i => <SkeletonBlock key={i} height={96} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonBlock height={280} />
        <SkeletonBlock height={280} />
      </div>
      <SkeletonBlock height={320} />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub, color }: {
  icon: LucideIcon;
  title: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div className="text-sm font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{title}</div>
        <div className="text-[10px]" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{sub}</div>
      </div>
    </div>
  );
}

export default function InvestmentsPage() {
  const {
    positions, snapshots, signals, watchlist, performance, purchases,
    positionHistory, reports, rsus, loading, error, refetch,
  } = useInvestmentsData();

  const [activeTab, setActiveTab] = React.useState("overview");

  return (
    <div style={{ background: "var(--surface-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      {/* Page Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={18} style={{ color: C.wealth }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Investments
              </h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(5,150,105,0.1)", color: C.optimal, border: "1px solid rgba(5,150,105,0.2)" }}>
                Advisor
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Portfolio, positions, candidate radar &amp; signal intelligence · written by the advisor engine
            </p>
          </div>
          <button onClick={refetch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            style={{ background: "var(--surface-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 mb-5 rounded-xl"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: C.alert }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.alert }}>
              Data fetch failed
            </div>
            <div className="text-xs break-words" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {error}
            </div>
          </div>
          <button onClick={refetch}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
            style={{ background: "rgba(220,38,38,0.1)", color: C.alert, border: "1px solid rgba(220,38,38,0.3)" }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto" style={{ borderColor: "var(--border-subtle)" }}>
          {[
            { id: "overview", label: "Overview", icon: PieIcon },
            { id: "radar", label: "Candidate Radar", icon: Radar },
            { id: "intelligence", label: "Intelligence", icon: Zap },
            { id: "reports", label: "Advisor Reports", icon: FileText }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
              style={{ 
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-tertiary)",
                background: activeTab === tab.id ? "var(--surface-tertiary)" : "transparent"
              }}
            >
              <tab.icon size={14} style={{ color: activeTab === tab.id ? C.equity : "inherit" }} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <PageSkeleton />
      ) : (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } }}
          className="space-y-8 pb-24"
        >
          {activeTab === "overview" && (
            <>
              <section>
                <SectionHeader icon={PieIcon} title="Portfolio Overview" sub="Live positions, snapshots & allocation" color={C.equity} />
                <div className="mt-3">
                  <PortfolioOverview positions={positions} snapshots={snapshots} />
                </div>
              </section>

              <section>
                <PositionsTable positions={positions} positionHistory={positionHistory} purchases={purchases} />
              </section>

              {rsus && rsus.length > 0 && (
                <section>
                  <SectionHeader icon={Briefcase} title="Company Equity & RSUs" sub="Vesting schedules and live value" color={C.wealth} />
                  <div className="mt-3">
                    <RsuTracker rsus={rsus} />
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === "radar" && (
            <section>
              <SectionHeader icon={Radar} title="Candidate Radar" sub="Watchlist conviction — multi-week evaluation" color={C.warning} />
              <div className="mt-3">
                <CandidateRadar watchlist={watchlist} signals={signals} />
              </div>
            </section>
          )}

          {activeTab === "intelligence" && (
            <section>
              <SectionHeader icon={Zap} title="Signal Intelligence" sub="Full signal history & win rates per symbol" color={C.alert} />
              <div className="mt-3">
                <SignalFeed signals={signals} performance={performance} />
              </div>
            </section>
          )}

          {activeTab === "reports" && (
            <section>
              <SectionHeader icon={FileText} title="Advisor Reports" sub="Daily HTML briefings from the advisor" color={C.equity} />
              <div className="mt-3">
                <ReportsPanel reports={reports} />
              </div>
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
}
