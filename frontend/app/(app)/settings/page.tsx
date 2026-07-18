"use client";

import { motion } from "framer-motion";
import { Settings, User, DollarSign, Sliders, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabaseClient";

// Animations
const containerVariants: any = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

// Single-user fallback id (matches TemplatesTab convention)
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

const EMPTY_FORM = {
  height_cm: "",
  current_weight_kg: "",
  target_weight_kg: "",
  daily_caloric_target: "",
  base_salary: "",
  bank_balance: "",
  target_savings_rate: "",
  expected_yield: "",
  strict_macros: false,
  dynamic_budget: false,
};

const toNum = (v: string) => (v === "" ? null : Number(v));

export default function SettingsOS() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [profileKey, setProfileKey] = useState<{ col: "id" | "user_id"; val: string } | null>(null);
  const [loadedBankBalance, setLoadedBankBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("user_profiles").select("*").limit(1);
      if (error || !data || data.length === 0) return;
      const p = data[0];
      if (p.id) setProfileKey({ col: "id", val: p.id });
      else if (p.user_id) setProfileKey({ col: "user_id", val: p.user_id });
      setLoadedBankBalance(p.bank_balance != null ? Number(p.bank_balance) : null);
      setForm({
        height_cm:            p.height_cm ?? "",
        current_weight_kg:    p.current_weight_kg ?? "",
        target_weight_kg:     p.target_weight_kg ?? "",
        daily_caloric_target: p.daily_caloric_target ?? "",
        base_salary:          p.base_salary ?? "",
        bank_balance:         p.bank_balance ?? "",
        target_savings_rate:  p.target_savings_rate ?? "",
        expected_yield:       p.expected_yield ?? "",
        strict_macros:        !!p.strict_macros,
        dynamic_budget:       !!p.dynamic_budget,
      });
    };
    load();
  }, []);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg("");

    const newBankBalance = toNum(form.bank_balance);
    const payload: any = {
      height_cm:            toNum(form.height_cm),
      current_weight_kg:    toNum(form.current_weight_kg),
      target_weight_kg:     toNum(form.target_weight_kg),
      daily_caloric_target: form.daily_caloric_target === "" ? null : Math.round(Number(form.daily_caloric_target)),
      base_salary:          toNum(form.base_salary),
      bank_balance:         newBankBalance,
      target_savings_rate:  toNum(form.target_savings_rate),
      expected_yield:       toNum(form.expected_yield),
      strict_macros:        form.strict_macros,
      dynamic_budget:       form.dynamic_budget,
    };
    // Only stamp bank_balance_updated_at when the balance actually changed —
    // the live estimate elsewhere sums transactions after this timestamp.
    if (newBankBalance !== loadedBankBalance) {
      payload.bank_balance_updated_at = new Date().toISOString();
    }

    const res = profileKey
      ? await supabase.from("user_profiles").update(payload).eq(profileKey.col, profileKey.val).select()
      : await supabase.from("user_profiles").insert({ ...payload, user_id: DEFAULT_USER_ID }).select();

    if (res.error) {
      setStatus("error");
      setErrorMsg(res.error.message);
      return;
    }
    if (!profileKey && res.data?.length) {
      const row = res.data[0];
      if (row.id) setProfileKey({ col: "id", val: row.id });
      else if (row.user_id) setProfileKey({ col: "user_id", val: row.user_id });
    }
    setLoadedBankBalance(newBankBalance);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 3000);
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Height (cm)</label>
              <input type="number" value={form.height_cm} onChange={set("height_cm")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Current Weight (kg)</label>
              <input type="number" value={form.current_weight_kg} onChange={set("current_weight_kg")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Target Weight (kg)</label>
              <input type="number" value={form.target_weight_kg} onChange={set("target_weight_kg")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Daily Caloric Target</label>
              <input type="number" value={form.daily_caloric_target} onChange={set("daily_caloric_target")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900" />
            </div>
          </div>
        </motion.div>

        {/* Financials */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <DollarSign className="text-emerald-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Capital Flow Constraints</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Base Salary (Annual)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                <input type="number" value={form.base_salary} onChange={set("base_salary")} className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Bank Balance (€)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">€</span>
                <input type="number" value={form.bank_balance} onChange={set("bank_balance")} step="0.01" className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Target Savings Rate (%)</label>
              <input type="number" value={form.target_savings_rate} onChange={set("target_savings_rate")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Expected Investment Yield (%)</label>
              <input type="number" value={form.expected_yield} onChange={set("expected_yield")} step="0.1" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
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
            {([
              {
                key: "strict_macros" as const,
                title: "Strict Macro Enforcement",
                desc: "AI will flag days where protein drops below 80% of target.",
              },
              {
                key: "dynamic_budget" as const,
                title: "Dynamic Budget Adjustments",
                desc: "Auto-shift discretionary funds based on previous week's performance.",
              },
            ]).map(rule => (
              <div key={rule.key} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <div className="font-semibold text-slate-900">{rule.title}</div>
                  <div className="text-sm text-slate-500">{rule.desc}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, [rule.key]: !prev[rule.key] }))}
                  className={`relative inline-block w-12 h-6 rounded-full transition-colors shrink-0 ${form[rule.key] ? "bg-teal-500" : "bg-slate-200"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form[rule.key] ? "right-1" : "left-1"}`} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Action Bar */}
        <motion.div variants={itemVariants} className="flex items-center justify-end gap-4">
          {status === "saved" && (
            <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="text-emerald-600 flex items-center gap-2 font-medium text-sm">
              <CheckCircle2 size={16} /> Settings saved
            </motion.span>
          )}
          {status === "error" && (
            <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="text-rose-600 flex items-center gap-2 font-medium text-sm">
              <AlertTriangle size={16} /> {errorMsg || "Save failed"}
            </motion.span>
          )}
          <button type="submit" disabled={status === "saving"} className="px-6 py-2.5 bg-slate-900 text-white font-medium rounded-md hover:bg-slate-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50">
            {status === "saving" ? "Saving..." : "Commit Changes"}
          </button>
        </motion.div>

      </form>
    </motion.div>
  );
}
