"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Settings2, X, Activity, Moon, Beaker, Dumbbell } from "lucide-react";

export default function AgentTerminal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("sleep");
  
  // Terminal log stream simulation
  const [logs, setLogs] = useState([
    "[03:14:22] cron_health_sync: Ingesting biometric data...",
    "[03:14:45] node_hrv_analysis: SDNN dropped 12%. Cross-referencing with workouts...",
    "[03:14:46] node_correlation: High CNS fatigue detected from deadlift volume.",
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLogs((prev) => {
        const newLogs = [...prev, `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] action_engine: Recalculating dynamic baseline...`];
        return newLogs.slice(-3); // Keep only last 3
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 right-0 w-[calc(100vw-250px)] bg-slate-900 border-t border-slate-800 text-slate-400 font-mono text-[10px] uppercase tracking-widest z-40 flex items-center justify-between px-6 h-12 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <Terminal size={14} className="text-teal-500 shrink-0" />
          <div className="flex flex-col flex-1 overflow-hidden h-full justify-center">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={logs[logs.length - 1]}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="truncate"
              >
                {logs[logs.length - 1]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded border border-slate-700 transition-colors ml-4 shrink-0"
        >
          <Settings2 size={12} /> Goal Parameters
        </button>
      </div>

      {/* Goal Setting Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Engine Parameters</h2>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Manual Base Overrides</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Sidebar & Content */}
              <div className="flex flex-1 overflow-hidden">
                <div className="w-48 bg-slate-50 border-r border-slate-100 p-4 space-y-2">
                  <button onClick={() => setActiveTab('sleep')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-md ${activeTab === 'sleep' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200/50'}`}>
                    <Moon size={16} /> Sleep
                  </button>
                  <button onClick={() => setActiveTab('fuel')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-md ${activeTab === 'fuel' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-200/50'}`}>
                    <Beaker size={16} /> Fuel
                  </button>
                  <button onClick={() => setActiveTab('load')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-md ${activeTab === 'load' ? 'bg-rose-100 text-rose-700' : 'text-slate-500 hover:bg-slate-200/50'}`}>
                    <Dumbbell size={16} /> Load
                  </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto">
                  
                  {activeTab === 'sleep' && (
                    <div className="space-y-6">
                      <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg mb-6">
                        <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">AI Recommendation</div>
                        <p className="text-sm text-slate-800 font-medium">To optimize CNS recovery, LangGraph proposes a baseline shift: Bedtime 22:30, Wake 06:30 (8h Total).</p>
                        <div className="mt-3 flex gap-2">
                          <button className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded shadow-sm hover:bg-indigo-700">Accept Protocol</button>
                          <button className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 text-xs font-bold rounded shadow-sm hover:bg-indigo-50">Override</button>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Target Bedtime</label>
                          <input type="time" defaultValue="22:30" className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Target Wake Time</label>
                          <input type="time" defaultValue="06:30" className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold" />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'fuel' && (
                    <div className="space-y-6">
                       <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
                        <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Algorithmic Rollover</div>
                        <p className="text-sm text-slate-800 font-medium">Yesterday's -400kcal deficit has been rolled over. AI recommends bumping Carbs +60g and Fat +10g for today's Hypertrophy load.</p>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Daily Caloric Baseline</label>
                          <input type="number" defaultValue={3200} className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                           <div>
                            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Protein (g)</label>
                            <input type="number" defaultValue={180} className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold text-slate-800" />
                          </div>
                           <div>
                            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Carbs (g)</label>
                            <input type="number" defaultValue={400} className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold text-slate-400" />
                          </div>
                           <div>
                            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Fats (g)</label>
                            <input type="number" defaultValue={95} className="w-full border border-slate-200 rounded px-3 py-2 text-sm font-bold text-amber-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'load' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Planned Weekly Cadence</h3>
                        
                        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Monday</span>
                            <span className="text-sm font-bold text-slate-900">Push (Hypertrophy)</span>
                          </div>
                          <button className="text-xs text-rose-600 font-bold hover:underline">Edit Protocol</button>
                        </div>
                        
                        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Tuesday</span>
                            <span className="text-sm font-bold text-slate-900">Pull (Strength)</span>
                          </div>
                          <button className="text-xs text-rose-600 font-bold hover:underline">Edit Protocol</button>
                        </div>

                        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 flex items-center justify-between opacity-50">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Wednesday</span>
                            <span className="text-sm font-bold text-slate-900">Active Recovery</span>
                          </div>
                          <button className="text-xs text-slate-400 font-bold hover:underline">Edit Protocol</button>
                        </div>
                        
                      </div>
                      <button className="w-full py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-widest mt-4">Save Cadence</button>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
