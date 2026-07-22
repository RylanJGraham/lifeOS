"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, User, DollarSign, Sliders, CheckCircle2, AlertTriangle,
  Target, Sparkles, Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { calculateTargets, CalculatedTargets } from "../../../utils/api";

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
  age: "",
  sex: "" as "" | "male" | "female",
  current_weight_kg: "",
  target_weight_kg: "",
  goal: "",
  activity_level: "",
  physique_description: "",
  daily_caloric_target: "",
  protein_target_g: "",
  carbs_target_g: "",
  fat_target_g: "",
  base_salary: "",
  bank_balance: "",
  target_savings_rate: "",
  expected_yield: "",
  strict_macros: false,
  dynamic_budget: false,
};

const toNum = (v: string) => (v === "" ? null : Number(v));
const toInt = (v: string) => (v === "" ? null : Math.round(Number(v)));

const GOALS = [
  { key: "cut",        label: "Cut",        desc: "Fat loss deficit",   delta: "−500 kcal" },
  { key: "lean_bulk",  label: "Lean Bulk",  desc: "Slow muscle gain",   delta: "+250 kcal" },
  { key: "bulk",       label: "Bulk",       desc: "Max muscle gain",    delta: "+500 kcal" },
  { key: "maintain",   label: "Maintain",   desc: "Hold current weight", delta: "±0 kcal"  },
] as const;

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary", desc: "Desk job, little exercise" },
  { key: "light",     label: "Light",     desc: "1–3 sessions / week" },
  { key: "moderate",  label: "Moderate",  desc: "3–5 sessions / week" },
  { key: "athlete",   label: "Athlete",   desc: "6+ sessions / week" },
] as const;

export default function SettingsOS() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [profileKey, setProfileKey] = useState<{ col: "id" | "user_id"; val: string } | null>(null);
  const [loadedBankBalance, setLoadedBankBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [calcResult, setCalcResult] = useState<CalculatedTargets | null>(null);

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
        age:                  p.age ?? "",
        sex:                  p.sex ?? "",
        current_weight_kg:    p.current_weight_kg ?? "",
        target_weight_kg:     p.target_weight_kg ?? "",
        goal:                 p.goal ?? "",
        activity_level:       p.activity_level ?? "",
        physique_description: "",
        daily_caloric_target: p.daily_caloric_target ?? "",
        protein_target_g:     p.protein_target_g ?? "",
        carbs_target_g:       p.carbs_target_g ?? "",
        fat_target_g:         p.fat_target_g ?? "",
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

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const saveProfile = async (opts: {
    formOverrides?: Partial<typeof EMPTY_FORM>;
    extraPayload?: Record<string, any>;
    successMsg?: string;
  } = {}) => {
    const { formOverrides = {}, extraPayload = {}, successMsg } = opts;
    setStatus("saving");
    setErrorMsg("");

    const f = { ...form, ...formOverrides };
    const newBankBalance = toNum(f.bank_balance);
    const payload: any = {
      height_cm:            toNum(f.height_cm),
      age:                  toInt(f.age),
      sex:                  f.sex || null,
      goal:                 f.goal || null,
      activity_level:       f.activity_level || null,
      current_weight_kg:    toNum(f.current_weight_kg),
      target_weight_kg:     toNum(f.target_weight_kg),
      daily_caloric_target: toInt(f.daily_caloric_target),
      protein_target_g:     toInt(f.protein_target_g),
      carbs_target_g:       toInt(f.carbs_target_g),
      fat_target_g:         toInt(f.fat_target_g),
      base_salary:          toNum(f.base_salary),
      bank_balance:         newBankBalance,
      target_savings_rate:  toNum(f.target_savings_rate),
      expected_yield:       toNum(f.expected_yield),
      strict_macros:        f.strict_macros,
      dynamic_budget:       f.dynamic_budget,
      ...extraPayload,
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
    setSavedMsg(successMsg || "Settings saved");
    setTimeout(() => { setStatus("idle"); setSavedMsg(""); }, 5000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile();
  };

  const handleCalculate = async () => {
    setCalcError("");
    if (!form.height_cm || !form.age || !form.sex) {
      setCalcError("Height, age and sex are required for the calculation.");
      return;
    }
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const result = await calculateTargets({
        height_cm: Number(form.height_cm),
        age: Number(form.age),
        sex: form.sex as "male" | "female",
        physique_description: form.physique_description,
        goal: (form.goal || "maintain") as any,
        activity_level: (form.activity_level || "moderate") as any,
        current_weight_kg: form.current_weight_kg === "" ? null : Number(form.current_weight_kg),
      });
      setCalcResult(result);
    } catch (e: any) {
      setCalcError(e?.message || "Calculation failed — is the backend running?");
    }
    setCalcLoading(false);
  };

  const handleApply = async () => {
    if (!calcResult) return;
    const formOverrides = {
      daily_caloric_target: String(calcResult.calories),
      protein_target_g: String(calcResult.protein_g),
      carbs_target_g: String(calcResult.carbs_g),
      fat_target_g: String(calcResult.fat_g),
    };
    setForm(prev => ({ ...prev, ...formOverrides }));
    await saveProfile({
      formOverrides,
      extraPayload: {
        estimated_weight_kg: calcResult.estimated_weight_kg,
        targets_computed_at: new Date().toISOString(),
      },
      successMsg: `Targets updated — Fuel tab now tracks ${calcResult.calories.toLocaleString()} kcal · ${calcResult.protein_g}g P`,
    });
  };

  const inputCls = "w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-mono text-slate-900";
  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-6 pb-20">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Engine Settings</h1>
        <p className="text-slate-500 mt-1">Configure baseline biometrics, nutrition targets, financial goals, and system rules.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">

        {/* ─── Body ─── */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <User className="text-teal-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Body</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Height (cm)</label>
              <input type="number" value={form.height_cm} onChange={set("height_cm")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Age</label>
              <input type="number" value={form.age} onChange={set("age")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Sex</label>
              <select value={form.sex} onChange={set("sex")} className={inputCls}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Current Weight (kg)</label>
              <input type="number" value={form.current_weight_kg} onChange={set("current_weight_kg")} step="0.1" className={inputCls} />
              <p className="text-[11px] text-slate-400 mt-1.5">Leave empty if unknown — the AI will estimate it.</p>
            </div>
            <div>
              <label className={labelCls}>Target Weight (kg)</label>
              <input type="number" value={form.target_weight_kg} onChange={set("target_weight_kg")} step="0.1" className={inputCls} />
            </div>
          </div>
        </motion.div>

        {/* ─── Goal Engine ─── */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Target className="text-violet-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Goal Engine</h2>
          </div>

          {/* Goal */}
          <label className={labelCls}>Goal</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {GOALS.map(g => {
              const active = form.goal === g.key;
              return (
                <button
                  type="button"
                  key={g.key}
                  onClick={() => setForm(prev => ({ ...prev, goal: g.key }))}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    active
                      ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? "text-violet-700" : "text-slate-900"}`}>{g.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{g.desc}</div>
                  <div className={`text-[11px] font-mono font-bold mt-1 ${active ? "text-violet-600" : "text-slate-400"}`}>{g.delta}</div>
                </button>
              );
            })}
          </div>

          {/* Activity level */}
          <label className={labelCls}>Activity Level</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {ACTIVITY_LEVELS.map(a => {
              const active = form.activity_level === a.key;
              return (
                <button
                  type="button"
                  key={a.key}
                  onClick={() => setForm(prev => ({ ...prev, activity_level: a.key }))}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    active
                      ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? "text-violet-700" : "text-slate-900"}`}>{a.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{a.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Physique description */}
          <div className="mb-6">
            <label className={labelCls}>Physique Description</label>
            <input
              type="text"
              value={form.physique_description}
              onChange={set("physique_description")}
              placeholder="e.g. skinny athletic with a bit of belly fat"
              className={inputCls + " font-sans"}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">Used by the AI to estimate your weight when the scale value is empty.</p>
          </div>

          {/* Calculate */}
          <button
            type="button"
            onClick={handleCalculate}
            disabled={calcLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-md hover:bg-violet-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {calcLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {calcLoading ? "Calculating…" : "Calculate with AI"}
          </button>
          {calcLoading && (
            <p className="text-[11px] text-slate-400 mt-2">Estimating with the LLM — this can take 5–10 seconds.</p>
          )}
          {calcError && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200">
              <AlertTriangle size={13} className="shrink-0" /> {calcError}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {calcResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-5 p-5 rounded-xl border border-violet-200 bg-violet-50/50"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 flex items-center gap-1.5">
                      Weight
                      {calcResult.weight_was_estimated && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-100 border border-amber-200 normal-case tracking-normal">
                          AI estimate
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-black font-mono text-slate-900">{calcResult.estimated_weight_kg} kg</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">BMR</div>
                    <div className="text-lg font-black font-mono text-slate-900">{calcResult.bmr.toLocaleString()} kcal</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">TDEE</div>
                    <div className="text-lg font-black font-mono text-slate-900">{calcResult.tdee.toLocaleString()} kcal</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Calories", val: `${calcResult.calories.toLocaleString()}`, unit: "kcal", color: "text-violet-700" },
                    { label: "Protein",  val: `${calcResult.protein_g}`,  unit: "g", color: "text-rose-600" },
                    { label: "Carbs",    val: `${calcResult.carbs_g}`,    unit: "g", color: "text-teal-600" },
                    { label: "Fat",      val: `${calcResult.fat_g}`,      unit: "g", color: "text-amber-600" },
                  ].map(t => (
                    <div key={t.label} className="p-3 rounded-lg bg-white border border-slate-200 text-center">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{t.label}</div>
                      <div className={`text-xl font-black font-mono ${t.color}`}>
                        {t.val}<span className="text-xs font-bold text-slate-400 ml-0.5">{t.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleApply}
                  disabled={status === "saving"}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-md hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  {status === "saving" ? "Applying…" : "Apply to my targets"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual targets */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <label className={labelCls}>Daily Targets (editable)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold mb-1.5">Calories (kcal)</label>
                <input type="number" value={form.daily_caloric_target} onChange={set("daily_caloric_target")} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold mb-1.5">Protein (g)</label>
                <input type="number" value={form.protein_target_g} onChange={set("protein_target_g")} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold mb-1.5">Carbs (g)</label>
                <input type="number" value={form.carbs_target_g} onChange={set("carbs_target_g")} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold mb-1.5">Fat (g)</label>
                <input type="number" value={form.fat_target_g} onChange={set("fat_target_g")} className={inputCls} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Finance ─── */}
        <motion.div variants={itemVariants} className="p-8 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <DollarSign className="text-emerald-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">Capital Flow Constraints</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Base Salary (Annual)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                <input type="number" value={form.base_salary} onChange={set("base_salary")} className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Bank Balance (€)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">€</span>
                <input type="number" value={form.bank_balance} onChange={set("bank_balance")} step="0.01" className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Target Savings Rate (%)</label>
              <input type="number" value={form.target_savings_rate} onChange={set("target_savings_rate")} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
            </div>
            <div>
              <label className={labelCls}>Expected Investment Yield (%)</label>
              <input type="number" value={form.expected_yield} onChange={set("expected_yield")} step="0.1" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-slate-900" />
            </div>
          </div>
        </motion.div>

        {/* ─── Agent toggles ─── */}
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
              <CheckCircle2 size={16} /> {savedMsg || "Settings saved"}
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
