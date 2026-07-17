"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Table, Search, Sparkles, Filter, Database, BrainCircuit, ArrowRight, Download, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Mock Data
const generateMockData = () => {
  const data = [];
  for (let i = 0; i < 20; i++) {
    data.push({
      id: `row-${i}`,
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sleep_score: Math.floor(60 + Math.random() * 35),
      hrv: Math.floor(30 + Math.random() * 50),
      trading_pnl: (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 5000),
      workout_intensity: Math.floor(Math.random() * 100),
      category: Math.random() > 0.5 ? "Training Day" : "Rest Day"
    });
  }
  return data;
};

const MOCK_DATA = generateMockData();

export default function DataExplorer() {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const toggleRow = (id: string) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRows(newSet);
  };

  const handleProcess = () => {
    if (selectedRows.size === 0) return;
    setIsProcessing(true);
    // Simulate LLM processing delay
    setTimeout(() => {
      setIsProcessing(false);
      setShowResult(true);
    }, 3000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6 bg-slate-50 min-h-screen text-slate-800">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Database className="text-teal-600" />
            Universal Data Explorer
          </h1>
          <p className="text-slate-500 mt-1">Select data ranges and let LangGraph analyze the correlations.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="relative">
             <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
             <input type="text" placeholder="Natural language query..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
           </div>
           <button className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 bg-white shadow-sm"><Filter size={18} /></button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Table View */}
        <div className={`transition-all duration-500 ${showResult ? 'col-span-12 lg:col-span-6' : 'col-span-12'}`}>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
               <span className="text-sm font-semibold text-slate-700">Raw Data (health_metrics x finance)</span>
               <div className="flex gap-2">
                 <button className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-800 p-1.5 border border-slate-200 rounded bg-white shadow-sm">
                   <Download size={14} /> Export
                 </button>
                 <button 
                    onClick={handleProcess}
                    disabled={selectedRows.size === 0 || isProcessing}
                    className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all shadow-sm ${selectedRows.size > 0 && !isProcessing ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                 >
                   {isProcessing ? (
                     <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                       <BrainCircuit size={14} />
                     </motion.div>
                   ) : <Sparkles size={14} />}
                   {isProcessing ? 'Analyzing...' : `AI Process (${selectedRows.size})`}
                 </button>
               </div>
            </div>
            
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input 
                         type="checkbox" 
                         className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white"
                         onChange={(e) => {
                           if(e.target.checked) setSelectedRows(new Set(MOCK_DATA.map(d => d.id)));
                           else setSelectedRows(new Set());
                         }}
                         checked={selectedRows.size === MOCK_DATA.length && MOCK_DATA.length > 0}
                      />
                    </th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Sleep Score</th>
                    <th className="px-4 py-3 text-right">HRV (ms)</th>
                    <th className="px-4 py-3 text-right">Trading PnL</th>
                    <th className="px-4 py-3 text-right">Intensity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_DATA.map((row) => (
                    <tr 
                      key={row.id} 
                      onClick={() => toggleRow(row.id)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedRows.has(row.id) ? 'bg-teal-50 hover:bg-teal-100/50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={selectedRows.has(row.id)}
                          onChange={() => {}} // handled by row click
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.date}</td>
                      <td className="px-4 py-3">
                         <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${row.category === 'Training Day' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                           {row.category}
                         </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{row.sleep_score}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.hrv}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${row.trading_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.trading_pnl >= 0 ? '+' : ''}{row.trading_pnl}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{row.workout_intensity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* AI Analysis Result Panel */}
        <AnimatePresence>
          {showResult && (
            <motion.div 
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="col-span-12 lg:col-span-6"
            >
              <div className="bg-white border border-blue-200 rounded-xl shadow-xl overflow-hidden h-[600px] flex flex-col relative">
                
                {/* Glow effect */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-teal-400 to-emerald-400" />
                
                <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-blue-50/50">
                   <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shadow-sm">
                      <Sparkles className="text-blue-600" size={20} />
                   </div>
                   <div>
                     <h3 className="font-bold text-slate-900 text-lg">AI Multi-modal Synthesis</h3>
                     <p className="text-xs text-slate-500 font-mono">Agent: LangGraph Multi-Domain • Confidence: 89%</p>
                   </div>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                  <div className="prose prose-sm prose-slate max-w-none">
                    <p className="text-slate-700 leading-relaxed text-[15px]">
                      Based on the selected <strong>{selectedRows.size} records</strong>, the AI has identified a statistically significant pattern bridging your physiological data and financial decisions.
                    </p>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-4 shadow-sm">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">
                        <TrendingUp size={16} className="text-emerald-600" /> Core Finding
                      </h4>
                      <p className="text-slate-600 mb-0">
                        There is a strong inverse correlation (<strong>r = -0.74</strong>) between HRV dropping below 40ms and severe drawdowns in trading PnL within 48 hours. 
                        High intensity workouts on low HRV days compounded the trading losses.
                      </p>
                    </div>

                    <div className="h-48 mt-6 mb-4 relative">
                      {/* Simple mock chart */}
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={MOCK_DATA.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="date" hide />
                          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} />
                          <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={10} />
                          <Tooltip contentStyle={{backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px'}} />
                          <Line yAxisId="left" type="monotone" dataKey="hrv" stroke="#3b82f6" strokeWidth={3} dot={false} name="HRV (ms)" />
                          <Line yAxisId="right" type="monotone" dataKey="trading_pnl" stroke="#10b981" strokeWidth={3} dot={false} name="Trading PnL" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-6 flex justify-between items-center border-t border-slate-100 pt-4">
                      <button className="text-slate-500 text-sm hover:text-slate-800 font-medium">View detailed logic trace</button>
                      <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 shadow-md flex items-center gap-2">
                        Create Auto-Rule <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
