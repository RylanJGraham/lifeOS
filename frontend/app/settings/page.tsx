"use client";

import { motion } from "framer-motion";
import { Settings, User, DollarSign, Sliders, CheckCircle2 } from "lucide-react";
import { useState } from "react";

// Animations
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function SettingsOS() {
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-6 pb-20">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Engine Settings</h1>
        <p className="text-slate-500 mt-1">Configure baseline biometrics, financial goals, and system rules.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Biometrics */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <User className="text-teal-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Biometrics & Fuel Goals</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Height (cm)</label>
              <input type="number" defaultValue={190} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Current Weight (kg)</label>
              <input type="number" defaultValue={78} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Target Weight (kg)</label>
              <input type="number" defaultValue={85} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Daily Caloric Target</label>
              <input type="number" defaultValue={3200} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
          </div>
        </motion.div>

        {/* Financials */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <DollarSign className="text-emerald-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Capital Flow Constraints</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Base Salary (Annual)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                <input type="number" defaultValue={85000} className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Target Savings Rate (%)</label>
              <input type="number" defaultValue={30} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Expected Investment Yield (%)</label>
              <input type="number" defaultValue={7.5} step="0.1" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
            </div>
          </div>
        </motion.div>

        {/* System Rules */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Sliders className="text-slate-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Agent Configuration</h2>
          </div>
          
          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">Strict Macro Enforcement</div>
                <div className="text-sm text-slate-500">AI will flag days where protein drops below 80% of target.</div>
              </div>
              <div className="relative inline-block w-12 h-6 rounded-full bg-teal-500">
                <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full transition-transform" />
              </div>
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">Dynamic Budget Adjustments</div>
                <div className="text-sm text-slate-500">Auto-shift discretionary funds based on previous week's performance.</div>
              </div>
              <div className="relative inline-block w-12 h-6 rounded-full bg-slate-200">
                <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform" />
              </div>
            </label>
          </div>
        </motion.div>

        {/* Action Bar */}
        <motion.div variants={itemVariants} className="flex items-center justify-end gap-4">
          {saved && (
            <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="text-emerald-600 flex items-center gap-2 font-medium text-sm">
              <CheckCircle2 size={16} /> Configuration Synced
            </motion.span>
          )}
          <button type="submit" className="px-6 py-2.5 bg-slate-900 text-white font-medium rounded-md hover:bg-slate-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
            Commit Changes
          </button>
        </motion.div>

      </form>
    </motion.div>
  );
}
