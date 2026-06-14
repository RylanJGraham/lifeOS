"use client";

import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, BrainCircuit, Target, BatteryCharging, TrendingUp } from "lucide-react";

// Mock data for the System Health Score over 30 days
const mockSystemHealth = Array.from({ length: 30 }).map((_, i) => ({
  day: `Day ${i + 1}`,
  score: 60 + Math.random() * 30 + (i * 0.5)
}));

// Animations
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function TheNexus() {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">The Nexus</h1>
        <p className="text-slate-500 mt-1">Cross-domain intelligence and unified system metrics.</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        
        {/* The "Pulse" Hero */}
        <motion.div variants={itemVariants} className="col-span-12 p-6 bg-white border border-slate-200 shadow-sm rounded-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-2">
                <BrainCircuit size={14} className="text-teal-600" />
                System Health Score
              </div>
              <div className="text-4xl font-black text-slate-900">87.4<span className="text-lg text-teal-600 ml-2">▲</span></div>
            </div>
            
            {/* Floating Insight Overlay */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg max-w-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">
                <Activity size={12} /> Live Insight
              </div>
              <p className="text-sm text-slate-600">Recovery index has improved by 12% in correlation with reduced late-night discretionary spending.</p>
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockSystemHealth} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Delta Gauges */}
        <motion.div variants={itemVariants} className="col-span-12 grid grid-cols-3 gap-6">
          <div className="p-6 bg-white border border-slate-200 shadow-sm rounded-xl">
             <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-4 flex items-center gap-2">
                <Target size={14} className="text-slate-400" />
                Body Mass Trajectory
              </div>
              <div className="flex items-end justify-between mb-2">
                <div className="text-2xl font-black text-slate-900">82.5 kg</div>
                <div className="text-sm font-medium text-slate-500">Goal: 85.0 kg</div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-800 rounded-full" style={{ width: '45%' }} />
              </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 shadow-sm rounded-xl">
             <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-600" />
                Capital Deployment
              </div>
              <div className="flex items-end justify-between mb-2">
                <div className="text-2xl font-black text-slate-900">$3,450</div>
                <div className="text-sm font-medium text-emerald-600">Saved: $1,200</div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-slate-800" style={{ width: '60%' }} />
                <div className="h-full bg-emerald-500" style={{ width: '20%' }} />
              </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 shadow-sm rounded-xl">
             <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-4 flex items-center gap-2">
                <BatteryCharging size={14} className="text-teal-600" />
                Recovery Index
              </div>
              <div className="flex items-end justify-between mb-2">
                <div className="text-2xl font-black text-slate-900">92%</div>
                <div className="text-sm font-medium text-teal-600">Optimal</div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: '92%' }} />
              </div>
          </div>
        </motion.div>

        {/* Agent Topography */}
        <motion.div variants={itemVariants} className="col-span-12 p-6 bg-slate-900 shadow-sm rounded-xl relative overflow-hidden h-64 border border-slate-800 flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-6 absolute top-6 left-6 flex items-center gap-2">
            <Activity size={14} className="text-slate-400" />
            Agent Topography (LangGraph Sync)
          </div>

          <div className="flex items-center gap-8 z-10">
            {/* Visual Node Graph */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full border-2 border-slate-700 bg-slate-800 flex items-center justify-center">
                 <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[10px] text-slate-400 font-mono">DATA.SYNC</div>
            </div>

            <div className="h-0.5 w-16 bg-gradient-to-r from-slate-700 to-teal-900" />

            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full border-2 border-teal-800 bg-slate-800 flex items-center justify-center shadow-[0_0_15px_rgba(13,148,136,0.3)]">
                 <BrainCircuit className="text-teal-500" size={24} />
              </div>
              <div className="text-[10px] text-teal-500 font-mono">LLAMA3.1_CORE</div>
            </div>

            <div className="h-0.5 w-16 bg-gradient-to-r from-teal-900 to-slate-700" />

            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full border-2 border-slate-700 bg-slate-800 flex items-center justify-center">
                 <div className="w-3 h-3 rounded-full bg-slate-500" />
              </div>
              <div className="text-[10px] text-slate-400 font-mono">INSIGHT.GEN</div>
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
