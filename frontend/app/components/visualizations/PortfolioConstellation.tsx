"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabaseClient";

interface Node {
  id: string;
  symbol: string;
  currency: string;
  value: number;   // Size — position_value
  orbit: number;   // 0..1 — magnitude of unrealized P&L % (real data)
  pnl: number;     // unrealized P&L % (color)
  angle: number;   // Initial angle for orbit
}

const curSym = (c: string) => (c === "EUR" ? "€" : "$");

const getColor = (pnl: number) => {
  if (pnl > 20) return "from-emerald-300 to-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] text-white";
  if (pnl > 0) return "from-teal-300 to-teal-500 shadow-[0_0_15px_rgba(45,212,191,0.3)] text-white";
  if (pnl > -10) return "from-amber-300 to-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-white";
  return "from-red-400 to-rose-600 shadow-[0_0_20px_rgba(225,29,72,0.3)] text-white";
};

const getSize = (value: number, maxVal: number) => {
  if (maxVal === 0) return 40;
  return Math.max(30, (value / maxVal) * 80);
};

export default function PortfolioConstellation() {
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [portfolio, setPortfolio] = useState<Node[]>([]);
  const [maxVal, setMaxVal] = useState(1);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from('advisor_positions').select('*').eq('status', 'open');
      if (data && !error) {
        let currentMax = 0;
        const nodes = data.map((pos: any, i: number) => {
           const val = parseFloat(pos.position_value) || 0;
           const pnlPct = parseFloat(pos.unrealized_pnl_pct) || 0;
           if (val > currentMax) currentMax = val;
           return {
             id: pos.id ?? pos.symbol,
             symbol: pos.symbol,
             currency: pos.currency || "USD",
             value: val,
             // Orbit distance = magnitude of unrealized P&L % (scaled, min orbit so flat positions stay visible)
             orbit: Math.min(1, Math.max(0.15, Math.abs(pnlPct) / 30)),
             pnl: pnlPct,
             angle: (360 / data.length) * i
           };
        });
        setMaxVal(currentMax || 1);
        setPortfolio(nodes);
      }
      setLoaded(true);
    }
    fetchData();
  }, []);

  const centerX = 400; // SVG center
  const centerY = 300;
  const maxOrbitRadius = 250;

  if (loaded && portfolio.length === 0) {
    return (
      <div className="w-full h-[300px] bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Portfolio Constellation</h3>
        <p className="text-xs text-slate-400">No open positions to display.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] bg-slate-50 rounded-xl border border-slate-200 relative overflow-hidden flex items-center justify-center">

      <div className="absolute top-4 left-6 z-10">
        <h3 className="text-lg font-bold text-slate-800">Portfolio Constellation</h3>
        <p className="text-xs text-slate-500">Orbit = |Unrealized P&L %| | Size = Position Value</p>
      </div>

      {/* Main Container */}
      <div className="relative w-[800px] h-[600px]">
        {/* Orbit Rings */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
           {[0.2, 0.5, 0.8].map((vol, i) => (
             <circle
                key={i}
                cx={centerX}
                cy={centerY}
                r={vol * maxOrbitRadius}
                stroke="rgba(0,0,0,0.05)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="4 4"
             />
           ))}
           {/* Center "Sun" */}
           <circle cx={centerX} cy={centerY} r="15" fill="rgba(0,0,0,0.05)" />
        </svg>

        {/* Orbiting Nodes */}
        {portfolio.map((node) => {
          const orbitRadius = Math.max(40, node.orbit * maxOrbitRadius);
          const size = getSize(node.value, maxVal);
          const orbitDuration = 40 + (node.orbit * 40);

          return (
            <motion.div
              key={node.id}
              className="absolute pointer-events-none"
              style={{ left: centerX, top: centerY }}
              animate={{ rotate: 360 }}
              initial={{ rotate: node.angle }}
              transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}
            >
              {/* The actual planet */}
              <div
                className="absolute pointer-events-auto cursor-pointer flex items-center justify-center group"
                style={{
                  left: orbitRadius,
                  top: -size / 2, // Center vertically on the orbit path
                  width: size,
                  height: size,
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Planet Body */}
                <motion.div
                  className={`w-full h-full rounded-full bg-gradient-to-br ${getColor(node.pnl)} flex items-center justify-center border border-white/40 shadow-sm`}
                  whileHover={{ scale: 1.2 }}
                  animate={{ rotate: -360 }} // Counter-rotate to keep text upright
                  transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}
                >
                  <span className="text-[10px] font-bold">{node.symbol}</span>
                </motion.div>
              </div>
            </motion.div>
          );
        })}

        {/* Tooltip */}
        {hoveredNode && (
          <div className="absolute z-50 left-1/2 bottom-8 transform -translate-x-1/2 bg-white border border-slate-200 text-slate-800 p-4 rounded-xl shadow-xl min-w-[250px]">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
               <span className="font-bold text-lg">{hoveredNode.symbol}</span>
               <span className={`text-sm font-bold ${hoveredNode.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                 {hoveredNode.pnl > 0 ? '+' : ''}{hoveredNode.pnl.toFixed(1)}%
               </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Position Value</span>
                <span className="font-mono font-medium">{curSym(hoveredNode.currency)}{hoveredNode.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Currency</span>
                <span className="font-mono font-medium">{hoveredNode.currency}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
