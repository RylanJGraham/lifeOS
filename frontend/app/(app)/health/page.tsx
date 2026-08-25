"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TemplatesTab } from "./TemplatesTab";
import FuelTab from "../../components/health/FuelTab";
import ReadinessPanel from "../../components/health/ReadinessPanel";
import SleepPanel from "../../components/health/SleepPanel";
import NutritionPanel from "../../components/health/NutritionPanel";
import WorkoutsPanel from "../../components/health/WorkoutsPanel";
import InsightBanners from "../../components/InsightBanners";
import { supabase } from "../../../utils/supabaseClient";
import { THEME } from "../../../utils/theme";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, Moon, Dumbbell, Activity, Brain, ChevronUp, ChevronDown,
  X, Send, FileText, Search, Target, Flame, TrendingUp, AlertTriangle,
} from "lucide-react";
import { C, getCutoff, toDayKey, dayKeyOf, fmtDayLong, rangeLabel, StatusDot, DayLens } from "../../components/health/shared";

const CHAT_HINT = "Data arrives by sending screenshots in Chat (/chat).";

// ─── AI Copilot Bar ────────────────────────────────────────────────
function CopilotBar() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");

  const go = (prompt: string) => {
    const q = prompt.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="copilot-bar">
      {!expanded && (
        <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpanded(true)}>
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
              <Brain size={12} style={{ color: "var(--accent-sleep)" }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>Copilot</span>
            <span className="text-xs ai-shimmer ml-2">Ask the copilot anything about your health data.</span>
          </div>
          <button className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:bg-white/5" style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            Expand <ChevronUp size={12} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--ai-surface)", border: "1px solid var(--border-ai)" }}>
                  <Brain size={14} style={{ color: "var(--accent-sleep)" }} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-sleep)" }}>LangGraph Copilot</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Prompts open in the Chat module</div>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                <X size={14} />
              </button>
            </div>

            <div className="px-5 py-3 flex gap-2 flex-wrap">
              {[
                { icon: FileText, prompt: "Give me my weekly health report" },
                { icon: Activity, prompt: "How's my training load?" },
                { icon: Search, prompt: "How has my sleep changed this month?" },
              ].map(a => (
                <button key={a.prompt} onClick={() => go(a.prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/5"
                  style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <a.icon size={11} /> {a.prompt}
                </button>
              ))}
            </div>

            <div className="px-5 py-3 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && go(input)}
                placeholder="Ask: How has my sleep changed since the circadian protocol?"
                className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none transition-all"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-active)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={() => go(input)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 shrink-0"
                style={{ background: "var(--accent-sleep)", color: "#fff" }}>
                <Send size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── System Status Banner ─────────────────────────────────────────
function SystemBanner({ metricsCount, workoutsCount, mealsCount, timeFilter }: {
  metricsCount: number; workoutsCount: number; mealsCount: number; timeFilter: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const domains = [
    { label: "CV", active: metricsCount > 0 },
    { label: "Sleep", active: metricsCount > 0 },
    { label: "Nutrition", active: mealsCount > 0 },
    { label: "Training", active: workoutsCount > 0 },
  ];
  const allEmpty = metricsCount === 0 && workoutsCount === 0 && mealsCount === 0;

  return (
    <div className="mb-4" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Data Sources</span>
          </div>
          <div className="flex items-center gap-3">
            {domains.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <StatusDot status={s.active ? "optimal" : "inactive"} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--text-tertiary)" }}>Metric days: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{metricsCount}</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Workout rows: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{workoutsCount}</span></span>
            <span style={{ color: "var(--text-tertiary)" }}>Meals: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{mealsCount}</span></span>
          </div>
          <button onClick={() => setCollapsed(x => !x)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-4">
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                <AlertTriangle size={14} style={{ color: allEmpty ? C.warning : C.optimal, marginTop: 2 }} />
                <div className="flex-1">
                  <div className="text-xs font-bold mb-0.5" style={{ color: allEmpty ? C.warning : C.optimal }}>
                    {allEmpty ? "NO TELEMETRY IN RANGE" : "LIVE DATA"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {allEmpty
                      ? `Nothing recorded in the ${rangeLabel(timeFilter)}. ${CHAT_HINT}`
                      : `Counts reflect the ${rangeLabel(timeFilter)}. Health metrics (HRV, sleep, VO₂) arrive via Chat screenshots; workouts and meals via Chat logging.`}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function HealthOS() {
  const [activeTab, setActiveTab] = useState("cardio");
  const [timeFilter, setTimeFilter] = useState("month");

  const [viewMode, setViewMode] = useState<"range" | "day">("range");
  const [selectedDay, setSelectedDay] = useState<string>(toDayKey(new Date()));
  const jumpToDay = (dk: string) => { setSelectedDay(dk); setViewMode("day"); };

  const [dbWorkouts, setDbWorkouts] = useState<any[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [dbMeals, setDbMeals] = useState<any[]>([]);
  const [templateExercises, setTemplateExercises] = useState<any[]>([]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const [tmplRes, learnedRes] = await Promise.all([
        supabase.from("workout_template_exercises").select("exercise_name, muscle_group"),
        supabase.from("exercise_muscles").select("exercise_name, muscle_group"),
      ]);
      const merged: Record<string, any> = {};
      (learnedRes.data || []).forEach(r => { merged[r.exercise_name] = r; });
      (tmplRes.data || []).forEach(r => { merged[r.exercise_name] = r; });
      if (!tmplRes.error || !learnedRes.error) setTemplateExercises(Object.values(merged));
    })();
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const cutoff = getCutoff(timeFilter).toISOString();

    const fetchWorkouts = async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .gte("workout_date", cutoff)
        .order("workout_date", { ascending: false });
      if (!error && data) setDbWorkouts(data);
    };

    const fetchMeals = async () => {
      const { data, error } = await supabase
        .from("meals")
        .select("*")
        .gte("meal_time", cutoff)
        .order("meal_time", { ascending: true });
      if (!error && data) setDbMeals(data);
    };

    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from("health_metrics")
        .select("*")
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: true });
      if (!error && data) setMetricsHistory(data);
    };

    fetchWorkouts();
    fetchMeals();
    fetchMetrics();

    const workoutsChannel = supabase
      .channel("workouts_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "workouts" }, () => { fetchWorkouts(); })
      .subscribe();

    const mealsChannel = supabase
      .channel("meals_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, () => { fetchMeals(); })
      .subscribe();

    const metricsChannel = supabase
      .channel("metrics_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "health_metrics" }, () => { fetchMetrics(); })
      .subscribe();

    return () => {
      supabase.removeChannel(workoutsChannel);
      supabase.removeChannel(mealsChannel);
      supabase.removeChannel(metricsChannel);
    };
  }, [timeFilter]);

  const tabs = [
    { id: "cardio", label: "Cardiovascular", icon: Heart, color: C.cv },
    { id: "sleep", label: "Sleep", icon: Moon, color: C.sleep },
    { id: "fuel", label: "Fuel", icon: Flame, color: C.nutrition },
    { id: "kinematic", label: "Kinematic", icon: Dumbbell, color: C.kinematic },
    { id: "trends", label: "Trends", icon: TrendingUp, color: C.trends },
    { id: "templates", label: "Templates", icon: Target, color: C.textPrimary },
  ];

  const tabVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
  };

  return (
    <div className="health-main-wrapper">
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={18} style={{ color: C.cv }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Health OS V7</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,230,118,0.15)", color: C.optimal, border: "1px solid rgba(0,230,118,0.3)" }}>Live</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Autonomous Agentic Health Command Center · Live Supabase telemetry
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-subtle)" }}>
            {["Day", "Week", "Month", "Quarter", "Year"].map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f.toLowerCase())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  background: timeFilter === f.toLowerCase() ? "var(--surface-quaternary)" : "transparent",
                  color: timeFilter === f.toLowerCase() ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: timeFilter === f.toLowerCase() ? "1px solid var(--border-active)" : "1px solid transparent",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <SystemBanner metricsCount={metricsHistory.length} workoutsCount={dbWorkouts.length} mealsCount={dbMeals.length} timeFilter={timeFilter} />

        <div className="mb-4">
          <InsightBanners domains={["doctor", "nutritionist", "pt", "readiness", "pacing", "bodycomp", "correlations"]} />
        </div>

        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {tabs.map(tab => (
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

      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible" exit="exit">
            {activeTab === "cardio" && <ReadinessPanel metricsHistory={metricsHistory} timeFilter={timeFilter} />}
            {activeTab === "sleep" && (
              <SleepPanel metricsHistory={metricsHistory} timeFilter={timeFilter}
                viewMode={viewMode} onViewModeChange={setViewMode}
                selectedDay={selectedDay} onDayChange={setSelectedDay} onJumpToDay={jumpToDay} />
            )}
            {activeTab === "fuel" && (
              <FuelTab dbMeals={dbMeals} dbWorkouts={dbWorkouts} timeFilter={timeFilter}
                viewMode={viewMode} selectedDay={selectedDay} onJumpToDay={jumpToDay}
                dayLens={<DayLens mode={viewMode} onModeChange={setViewMode} day={selectedDay} onDayChange={setSelectedDay} />} />
            )}
            {activeTab === "kinematic" && (
              <WorkoutsPanel dbWorkouts={dbWorkouts} templateExercises={templateExercises} timeFilter={timeFilter}
                viewMode={viewMode} onViewModeChange={setViewMode}
                selectedDay={selectedDay} onDayChange={setSelectedDay} />
            )}
            {activeTab === "trends" && <NutritionPanel metricsHistory={metricsHistory} dbMeals={dbMeals} timeFilter={timeFilter} />}
            {activeTab === "templates" && <TemplatesTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      <CopilotBar />
    </div>
  );
}
