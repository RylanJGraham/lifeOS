"use client";

import { Wallet, FileText, PieChart as PieIcon, ArrowRightLeft, TrendingUp, DollarSign, PiggyBank } from "lucide-react";
import InsightBanners from "../InsightBanners";
import { C } from "./shared";

interface FinanceHeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  timeFilter: string;
  setTimeFilter: (filter: string) => void;
  latestTxDate: string | null;
  onOpenReport: () => void;
}

const tabs = [
  { id: "spending", label: "Capital Outflow", icon: ArrowRightLeft, color: C.wealth },
  { id: "networth", label: "Net Worth", icon: TrendingUp, color: C.growth },
  { id: "cashflow", label: "Cash Flow", icon: DollarSign, color: C.crypto },
  { id: "budgets", label: "Budgets", icon: PiggyBank, color: C.equity },
];

export default function FinanceHeader({
  activeTab,
  setActiveTab,
  timeFilter,
  setTimeFilter,
  latestTxDate,
  onOpenReport,
}: FinanceHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} style={{ color: C.wealth }} />
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              Wealth OS V7
            </h1>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(5,150,105,0.1)",
                color: C.wealth,
                border: "1px solid rgba(5,150,105,0.2)",
              }}
            >
              Live
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            Capital Command: Liquidity, runway &amp; financial velocity · Data through {latestTxDate ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            style={{
              background: "rgba(91,66,232,0.08)",
              color: C.equity,
              border: "1px solid rgba(91,66,232,0.25)",
            }}
          >
            <FileText size={13} />
            Daily Report
          </button>
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            {["Day", "Week", "Month", "Quarter", "Year"].map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f.toLowerCase())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  background: timeFilter === f.toLowerCase() ? "var(--surface-tertiary)" : "transparent",
                  color: timeFilter === f.toLowerCase() ? "var(--text-primary)" : "var(--text-tertiary)",
                  border:
                    timeFilter === f.toLowerCase()
                      ? "1px solid var(--border-active)"
                      : "1px solid transparent",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Engine insight banners (cash runway, weekly review) */}
      <div className="mb-4">
        <InsightBanners domains={["cash", "goals"]} />
      </div>

      {/* Portfolio & research detail moved to the dedicated Investments page */}
      <a
        href="/investments"
        className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl mb-4 text-xs font-bold transition-all"
        style={{
          background: "rgba(5,150,105,0.06)",
          color: C.wealth,
          border: "1px solid rgba(5,150,105,0.2)",
        }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <PieIcon size={13} className="shrink-0" />
          <span className="truncate">
            Portfolio positions, trade signals &amp; research candidates now live in Investments
          </span>
        </span>
        <span className="uppercase tracking-widest text-[10px] shrink-0">Open Investments →</span>
      </a>

      {/* Tab Nav */}
      <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-tab={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
          >
            <tab.icon size={15} style={{ color: activeTab === tab.id ? tab.color : "var(--text-tertiary)" }} />
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
