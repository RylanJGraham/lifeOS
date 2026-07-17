"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

interface CorrelationData {
  x: string;
  y: string;
  r: number;     // -1.0 to 1.0 Pearson r
  p: number;     // p-value
  n: number;     // sample size
  insight?: string;
  action?: string;
}

// 5×5 cross-domain correlation matrix
// X = input lifestyle variables | Y = outcome variables
const X_LABELS = ["Sleep Quality", "HRV Level", "Workout Int.", "Dining Out", "Pre-WO Carbs"];
const Y_LABELS = ["Trading PnL", "Spending", "Workout Volume", "Deep Sleep", "Next-Day Focus"];

const DATA: CorrelationData[] = [
  // Sleep Quality →
  { x: "Sleep Quality", y: "Trading PnL",     r:  0.82, p: 0.004, n: 68, insight: "Sleep >7.5h days: avg P&L +$340. Sleep <6.5h days: avg P&L -$127.", action: "Automate: halve position sizes on <6.5h sleep nights." },
  { x: "Sleep Quality", y: "Spending",         r: -0.45, p: 0.023, n: 68, insight: "Poor sleep correlates with 23% higher discretionary spending.", action: "Set spending hold on days after <6h sleep." },
  { x: "Sleep Quality", y: "Workout Volume",   r:  0.61, p: 0.009, n: 55, insight: "Well-rested days produce 18% higher training volume.", action: "Schedule intense sessions after high-sleep nights." },
  { x: "Sleep Quality", y: "Deep Sleep",       r:  0.74, p: 0.001, n: 68, insight: "Sleep quality score strongly predicts deep sleep duration.", action: null },
  { x: "Sleep Quality", y: "Next-Day Focus",   r:  0.68, p: 0.003, n: 45, insight: "Sleep quality strongly predicts cognitive performance the next day.", action: "Protect sleep before important decision days." },

  // HRV Level →
  { x: "HRV Level",     y: "Trading PnL",     r:  0.74, p: 0.006, n: 62, insight: "HRV >55ms: avg P&L +$420, win rate 73%. HRV <45ms: avg P&L -$89, win rate 52%.", action: "Rule: avoid new positions when HRV <45ms." },
  { x: "HRV Level",     y: "Spending",         r: -0.68, p: 0.002, n: 62, insight: "Stress (low HRV) correlates with emotional spending +23% above baseline.", action: "Trigger mindfulness alert when HRV <45ms before market open." },
  { x: "HRV Level",     y: "Workout Volume",   r:  0.55, p: 0.018, n: 55, insight: "Higher HRV enables 14% greater training volume tolerance.", action: "Adjust planned workout intensity to HRV each morning." },
  { x: "HRV Level",     y: "Deep Sleep",       r:  0.41, p: 0.041, n: 62, insight: "Better recovery (high HRV) slightly predicts subsequent deep sleep.", action: null },
  { x: "HRV Level",     y: "Next-Day Focus",   r:  0.59, p: 0.011, n: 45, insight: "HRV is a strong predictor of next-day cognitive readiness.", action: "Block high-stakes meetings when HRV is suppressed." },

  // Workout Intensity →
  { x: "Workout Int.",  y: "Trading PnL",     r:  0.32, p: 0.089, n: 58, insight: "Moderate workouts show slight positive association with decision quality.", action: null },
  { x: "Workout Int.",  y: "Spending",         r:  0.15, p: 0.310, n: 58, insight: "No significant relationship detected.", action: null },
  { x: "Workout Int.",  y: "Workout Volume",   r: -0.10, p: 0.420, n: 55, insight: "High-intensity sessions slightly reduce weekly volume (fatigue effect).", action: null },
  { x: "Workout Int.",  y: "Deep Sleep",       r:  0.38, p: 0.049, n: 58, insight: "Moderate-to-high intensity workouts marginally improve deep sleep.", action: "Schedule evening workouts >3h before bed to avoid sleep disruption." },
  { x: "Workout Int.",  y: "Next-Day Focus",   r: -0.28, p: 0.120, n: 45, insight: "Very high intensity (RPE 9+) correlates with reduced next-day cognitive output.", action: "Avoid RPE 9+ sessions the night before important presentations." },

  // Dining Out →
  { x: "Dining Out",    y: "Trading PnL",     r: -0.33, p: 0.078, n: 60, insight: "Frequent dining out (late meals) slightly correlates with worse next-day decision quality.", action: null },
  { x: "Dining Out",    y: "Spending",         r:  0.81, p: 0.001, n: 60, insight: "Dining out is the strongest lifestyle predictor of budget overruns.", action: "Alert: 3+ dining events/week historically exceed dining budget by 31%." },
  { x: "Dining Out",    y: "Workout Volume",   r: -0.22, p: 0.195, n: 55, insight: "Weak negative association between dining frequency and workout consistency.", action: null },
  { x: "Dining Out",    y: "Deep Sleep",       r: -0.52, p: 0.014, n: 60, insight: ">3x/week dining out correlates with 45-min later sleep onset and -0.8h deep sleep.", action: "Set 8 PM meal cutoff rule on weeknights to protect sleep architecture." },
  { x: "Dining Out",    y: "Next-Day Focus",   r: -0.41, p: 0.037, n: 45, insight: "Late-night dining disrupts sleep → reduced focus the next day.", action: "Track late meal correlation with next-day productivity score." },

  // Pre-WO Carbs →
  { x: "Pre-WO Carbs",  y: "Trading PnL",     r:  0.09, p: 0.500, n: 48, insight: "No meaningful relationship with trading outcomes.", action: null },
  { x: "Pre-WO Carbs",  y: "Spending",         r: -0.08, p: 0.545, n: 48, insight: "No significant relationship detected.", action: null },
  { x: "Pre-WO Carbs",  y: "Workout Volume",   r:  0.63, p: 0.007, n: 48, insight: "Carbs >60g pre-workout correlate with 12% higher training volume.", action: "Target 60–80g carbs 60–90 min before high-intensity sessions." },
  { x: "Pre-WO Carbs",  y: "Deep Sleep",       r: -0.18, p: 0.285, n: 48, insight: "Pre-workout carb timing has minimal impact on sleep architecture.", action: null },
  { x: "Pre-WO Carbs",  y: "Next-Day Focus",   r:  0.29, p: 0.115, n: 45, insight: "Better-fueled workouts may slightly improve next-day cognitive recovery.", action: null },
];

function getColor(r: number): string {
  if (r > 0.7)  return `rgba(5, 150, 105, ${0.55 + r * 0.3})`;
  if (r > 0.4)  return `rgba(16, 185, 129, ${0.25 + r * 0.4})`;
  if (r > 0.1)  return `rgba(110, 231, 183, ${0.15 + r * 0.5})`;
  if (r > -0.1) return `rgba(203, 213, 225, 0.25)`;
  if (r > -0.4) return `rgba(252, 165, 165, ${0.15 + Math.abs(r) * 0.4})`;
  if (r > -0.7) return `rgba(239, 68, 68, ${0.25 + Math.abs(r) * 0.35})`;
  return `rgba(185, 28, 28, ${0.5 + Math.abs(r) * 0.3})`;
}

function sigLabel(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01)  return "**";
  if (p < 0.05)  return "*";
  return "ns";
}

function isSignificant(p: number) { return p < 0.05; }

export default function CorrelationHeatmap() {
  const [hoveredCell, setHoveredCell] = useState<CorrelationData | null>(null);
  const [showActionsOnly, setShowActionsOnly] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  const significantCells = DATA.filter(d => isSignificant(d.p) && d.action);
  const filteredCells = showActionsOnly ? significantCells : null;

  return (
    <div className="card-surface p-6" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Cross-Domain Correlation Engine
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            5×5 matrix · {DATA.length} domain pairs · 45–68 day rolling window · Pearson r
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowActionsOnly(x => !x)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: showActionsOnly ? "rgba(91,66,232,0.1)" : "var(--surface-tertiary)",
              color: showActionsOnly ? "var(--accent-sleep)" : "var(--text-tertiary)",
              border: showActionsOnly ? "1px solid rgba(91,66,232,0.3)" : "1px solid var(--border-subtle)",
            }}
          >
            {showActionsOnly ? "✓ " : ""}Actionable Only
          </button>
          <div className="flex items-center gap-4 text-[10px] font-bold" style={{ color: "var(--text-tertiary)" }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(5,150,105,0.7)", display: "inline-block" }} /> Strong +
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(203,213,225,0.4)", display: "inline-block" }} /> Neutral
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.6)", display: "inline-block" }} /> Inverse −
            </span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          {/* X Labels */}
          <div className="flex mb-2" style={{ paddingLeft: 130 }}>
            {X_LABELS.map(x => (
              <div key={x} className="text-[10px] font-bold text-center uppercase tracking-wider flex-1"
                style={{ color: "var(--text-tertiary)" }}>
                {x}
              </div>
            ))}
          </div>

          {/* Rows */}
          {Y_LABELS.map((y, yi) => (
            <div key={y} className="flex items-center mb-1.5">
              {/* Y label */}
              <div className="text-[10px] font-bold uppercase tracking-wider text-right pr-3 shrink-0"
                style={{ width: 130, color: "var(--text-tertiary)" }}>
                {y}
              </div>

              {/* Cells */}
              {X_LABELS.map((x) => {
                const cell = DATA.find(d => d.x === x && d.y === y);
                if (!cell) return <div key={x} className="flex-1 mx-0.5 h-12 rounded-lg" style={{ background: "var(--surface-tertiary)" }} />;

                const sig = isSignificant(cell.p);
                const isHov = hoveredCell?.x === x && hoveredCell?.y === y;
                const hasAction = !!cell.action;
                const dimmed = showActionsOnly && !hasAction;

                return (
                  <motion.div
                    key={x}
                    className="flex-1 mx-0.5 h-12 rounded-lg relative cursor-pointer flex flex-col items-center justify-center gap-0.5"
                    style={{
                      background: getColor(cell.r),
                      border: `1px solid ${sig ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)"}`,
                      opacity: dimmed ? 0.3 : 1,
                    }}
                    whileHover={{ scale: 1.06, zIndex: 20 }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <span className="text-[11px] font-black" style={{ fontFamily: "var(--font-mono)", color: Math.abs(cell.r) > 0.3 ? "#fff" : "var(--text-secondary)" }}>
                      {cell.r > 0 ? "+" : ""}{cell.r.toFixed(2)}
                    </span>
                    <span className="text-[9px] font-bold" style={{ color: Math.abs(cell.r) > 0.3 ? "rgba(255,255,255,0.75)" : "var(--text-tertiary)" }}>
                      {sigLabel(cell.p)}
                    </span>
                    {hasAction && sig && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white flex items-center justify-center"
                        style={{ border: "1px solid rgba(91,66,232,0.4)" }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-sleep)" }} />
                      </div>
                    )}

                    {/* Hover Tooltip */}
                    {isHov && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 pointer-events-none"
                        style={{
                          background: "var(--surface-secondary)",
                          border: "1px solid var(--border-active)",
                          borderRadius: "var(--radius-md)",
                          boxShadow: "var(--shadow-elevated)",
                          padding: "12px",
                        }}>
                        <div className="text-xs font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                          {x} × {y}
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Pearson r</div>
                            <div className="text-sm font-black font-mono" style={{ color: cell.r > 0 ? "#059669" : "#dc2626" }}>
                              {cell.r > 0 ? "+" : ""}{cell.r.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>p-value</div>
                            <div className="text-sm font-black font-mono" style={{ color: sig ? "#059669" : "var(--text-secondary)" }}>
                              {cell.p.toFixed(3)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>n</div>
                            <div className="text-sm font-black font-mono" style={{ color: "var(--text-secondary)" }}>{cell.n}</div>
                          </div>
                        </div>
                        <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{cell.insight}</div>
                        {cell.action && (
                          <div className="mt-2 text-[10px] font-bold px-2 py-1 rounded" style={{ background: "rgba(91,66,232,0.08)", color: "var(--accent-sleep)", border: "1px solid rgba(91,66,232,0.2)" }}>
                            → {cell.action}
                          </div>
                        )}
                        {!sig && (
                          <div className="mt-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            ⚠ Not statistically significant (p={cell.p.toFixed(3)})
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Top actionable correlations */}
      <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
          Strongest Actionable Signals — Click to expand
        </div>
        <div className="space-y-2">
          {DATA.filter(d => isSignificant(d.p) && d.action && Math.abs(d.r) >= 0.6)
            .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
            .slice(0, 4)
            .map((d, i) => {
              const key = `${d.x}-${d.y}`;
              const isOpen = expandedInsight === key;
              const color = d.r > 0 ? "#059669" : "#dc2626";
              return (
                <div key={key} className="rounded-xl overflow-hidden"
                  style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)" }}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
                    onClick={() => setExpandedInsight(isOpen ? null : key)}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                      {d.r > 0 ? <CheckCircle size={13} style={{ color }} /> : <AlertTriangle size={13} style={{ color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                        {d.x} × {d.y}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                        r={d.r > 0 ? "+" : ""}{d.r.toFixed(2)} · p={d.p.toFixed(3)} · n={d.n}
                      </div>
                    </div>
                    <div className="text-xs font-black font-mono shrink-0" style={{ color }}>
                      {d.r > 0 ? "+" : ""}{d.r.toFixed(2)}
                    </div>
                    {isOpen ? <ChevronUp size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-2">
                          <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.insight}</div>
                          <div className="flex items-start gap-2 p-2.5 rounded-lg"
                            style={{ background: "rgba(91,66,232,0.06)", border: "1px solid rgba(91,66,232,0.15)" }}>
                            <Info size={11} style={{ color: "var(--accent-sleep)", marginTop: 2, flexShrink: 0 }} />
                            <span className="text-[11px] font-semibold" style={{ color: "var(--accent-sleep)" }}>
                              Recommended Action: {d.action}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
