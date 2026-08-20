"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Target, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { useGoalsData } from "../../components/goals/useGoalsData";
import GoalCard from "../../components/goals/GoalCard";
import InsightBanners from "../../components/InsightBanners";
import { EmptyState, C } from "../../components/investments/shared";
import GoalsChatPanel from "./components/GoalsChatPanel";

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div className="card-surface animate-pulse" style={{ borderRadius: "var(--radius-xl)", height, background: "var(--surface-secondary)" }} />
  );
}

function PageSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="order-2 lg:order-1 lg:col-span-5">
        <SkeletonBlock height={420} />
      </div>
      <div className="order-1 lg:order-2 lg:col-span-7 space-y-4">
        <SkeletonBlock height={140} />
        <SkeletonBlock height={140} />
        <SkeletonBlock height={140} />
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const {
    goals, checkins, liveBankBalance, latestPortfolioValue, netWorth,
    loading, error, refetch,
  } = useGoalsData();
  const [showAchieved, setShowAchieved] = useState(false);

  const liveValues = { bank: liveBankBalance, portfolio: latestPortfolioValue, netWorth };
  const activeGoals = goals.filter((g) => g.status !== "achieved");
  const achievedGoals = goals.filter((g) => g.status === "achieved");
  const checkinsFor = (goalId: string) => checkins.filter((c) => c.goal_id === goalId);

  return (
    <div style={{ background: "var(--surface-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      {/* Page Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target size={18} style={{ color: C.equity }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Goals
              </h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(91,66,232,0.1)", color: C.equity, border: "1px solid rgba(91,66,232,0.2)" }}>
                Architect
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Chat-driven goal planning · live financial progress · habit streaks
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

      {/* Error banner */}
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

      {loading ? (
        <PageSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-24"
        >
          {/* Engine insight banners (green lights, habit momentum) */}
          <div className="order-1 lg:order-1 lg:col-span-12">
            <InsightBanners domains={["goals", "habits"]} />
          </div>

          {/* Chat — left on desktop, below goals on mobile */}
          <div className="order-3 lg:order-1 lg:col-span-5">
            <GoalsChatPanel onGoalsChanged={refetch} />
          </div>

          {/* Goals grid — right on desktop, first on mobile */}
          <div className="order-2 lg:order-2 lg:col-span-7 space-y-4 min-w-0">
            {activeGoals.length === 0 && achievedGoals.length === 0 ? (
              <EmptyState
                message="No goals tracked yet. Theorycraft one with the Goals Architect — it'll appear here with live progress."
                icon={Target}
              />
            ) : (
              <>
                {activeGoals.length > 0 && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {activeGoals.map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        checkins={checkinsFor(g.id)}
                        liveValues={liveValues}
                        onChanged={refetch}
                      />
                    ))}
                  </div>
                )}

                {achievedGoals.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowAchieved((v) => !v)}
                      className="flex items-center gap-2 px-1 py-2 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {showAchieved ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <Trophy size={12} style={{ color: C.optimal }} />
                      Achieved · {achievedGoals.length}
                    </button>
                    {showAchieved && (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-1" style={{ opacity: 0.7 }}>
                        {achievedGoals.map((g) => (
                          <GoalCard
                            key={g.id}
                            goal={g}
                            checkins={checkinsFor(g.id)}
                            liveValues={liveValues}
                            onChanged={refetch}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
