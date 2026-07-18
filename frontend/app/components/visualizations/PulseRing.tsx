"use client";

import { motion } from "framer-motion";

interface PulseRingProps {
  score: number | null;
  segments: {
    health: number | null;
    wealth: number | null;
    recovery: number | null;
    growth: number | null;
  };
  hasAnomaly?: boolean;
}

export default function PulseRing({ score, segments, hasAnomaly = false }: PulseRingProps) {
  const cx = 160, cy = 160;

  // 4 concentric rings, inner → outer
  const rings = [
    { key: "recovery", label: "Recovery", value: segments.recovery, radius: 52,  color: "#8b5cf6", strokeW: 10 },
    { key: "growth",   label: "Growth",   value: segments.growth,   radius: 74,  color: "#f97316", strokeW: 10 },
    { key: "wealth",   label: "Wealth",   value: segments.wealth,   radius: 96,  color: "#3b82f6", strokeW: 10 },
    { key: "health",   label: "Health",   value: segments.health,   radius: 118, color: "#10b981", strokeW: 10 },
  ];

  return (
    <div className="relative flex flex-col items-center w-full">
      {/* Anomaly ripple */}
      {hasAnomaly && (
        <motion.div
          className="absolute rounded-full border border-red-400/40 pointer-events-none"
          style={{ width: 250, height: 250, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          animate={{ width: [250, 360], height: [250, 360], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
        />
      )}

      <svg width="320" height="320" viewBox="0 0 320 320" style={{ overflow: "visible", maxWidth: "100%", height: "auto" }}>
        <defs>
          {rings.map(r => (
            <filter key={`glow-${r.key}`} id={`glow-${r.key}`}>
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Background tracks */}
        {rings.map(r => (
          <circle
            key={`track-${r.key}`}
            cx={cx} cy={cy} r={r.radius}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={r.strokeW}
          />
        ))}

        {/* Animated arcs */}
        {rings.map((r, i) => {
          if (r.value == null) return null;
          const circ = 2 * Math.PI * r.radius;
          const pct = r.value / 100;
          const fillLen = circ * pct - 5;
          const gapLen = circ * (1 - pct) + 5;
          return (
            <motion.circle
              key={r.key}
              cx={cx} cy={cy} r={r.radius}
              fill="none"
              stroke={r.color}
              strokeWidth={r.strokeW}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${Math.max(0, fillLen)} ${Math.max(0, gapLen)}` }}
              transition={{ duration: 1.4, ease: [0, 0, 0.2, 1], delay: i * 0.15 }}
              style={{ filter: `drop-shadow(0 0 7px ${r.color}70)` }}
            />
          );
        })}

        {/* Center score */}
        <motion.text
          x={cx} y={cy - 14}
          textAnchor="middle"
          fontSize="42"
          fontWeight="900"
          fontFamily="'JetBrains Mono', monospace"
          fill="#0F172A"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          {score != null ? Math.round(score) : "—"}
        </motion.text>

        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="10" fontWeight="800"
          fill="#94A3B8" fontFamily="'JetBrains Mono', monospace" letterSpacing="3">
          {score != null ? "LIFE SCORE" : "AWAITING DATA"}
        </text>

        {/* Ring end-cap labels */}
        {rings.map((r) => {
          if (r.value == null) return null;
          const pct = r.value / 100;
          const angle = pct * 2 * Math.PI - Math.PI / 2;
          const lx = cx + r.radius * Math.cos(angle);
          const ly = cy + r.radius * Math.sin(angle);
          return (
            <motion.circle
              key={`cap-${r.key}`}
              cx={lx} cy={ly} r={5}
              fill={r.color}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 + rings.indexOf(r) * 0.1 }}
              style={{ filter: `drop-shadow(0 0 4px ${r.color})` }}
            />
          );
        })}
      </svg>

      {/* Domain score chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full mt-1">
        {rings.map(r => (
          <motion.div
            key={r.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rings.indexOf(r) * 0.1 + 1.0, duration: 0.35 }}
            className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl"
            style={{
              background: `${r.color}10`,
              border: `1px solid ${r.color}28`,
            }}
          >
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: r.color }}>
              {r.label}
            </div>
            <div className="text-lg font-black leading-none" style={{ fontFamily: "var(--font-mono)", color: r.color }}>
              {r.value != null ? r.value : "—"}
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: `${r.color}20` }}>
              <div className="h-full rounded-full" style={{ width: `${r.value ?? 0}%`, background: r.color }} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
