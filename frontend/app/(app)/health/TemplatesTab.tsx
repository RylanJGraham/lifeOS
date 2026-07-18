import { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { Dumbbell, Plus, Trash2, Save } from "lucide-react";

// Exact muscle_group strings used by workout_template_exercises —
// keep in sync with the Muscle Coverage map on the Health page.
const MUSCLE_GROUPS = [
  "Chest", "Back", "Front Delts", "Rear Delts", "Biceps", "Triceps",
  "Abs", "Quads", "Hamstrings", "Glutes", "Calves",
];

export function TemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [exercises, setExercises] = useState([{ name: "", sets: 3, reps: null, weight: 0, group: "Chest" }]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    // Fetch user_id first
    const { data: profile } = await supabase.from("user_profiles").select("user_id").limit(1);
    const userId = profile?.[0]?.user_id || "00000000-0000-0000-0000-000000000000";

    const { data, error } = await supabase
      .from("workout_templates")
      .select(`
        *,
        workout_template_exercises (*)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTemplates(data);
    }
    setLoading(false);
  };

  const addExerciseRow = () => {
    setExercises([...exercises, { name: "", sets: 3, reps: null, weight: 0, group: "Chest" }]);
  };

  const removeExerciseRow = (index: number) => {
    const newEx = [...exercises];
    newEx.splice(index, 1);
    setExercises(newEx);
  };

  const updateExercise = (index: number, field: string, value: string | number) => {
    const newEx: any = [...exercises];
    newEx[index][field] = value;
    setExercises(newEx);
  };

  const saveTemplate = async () => {
    if (!newTemplateName.trim() || exercises.length === 0) return;

    const { data: profile } = await supabase.from("user_profiles").select("user_id").limit(1);
    const userId = profile?.[0]?.user_id || "00000000-0000-0000-0000-000000000000";

    const { data: tmpl, error: err1 } = await supabase
      .from("workout_templates")
      .insert({ user_id: userId, name: newTemplateName })
      .select()
      .single();

    if (tmpl && !err1) {
      const exerciseInserts = exercises.map((ex, i) => ({
        template_id: tmpl.id,
        exercise_name: ex.name,
        muscle_group: ex.group,
        sets: ex.sets,
        reps: ex.reps || null,
        weight: ex.weight,
        sort_order: i
      }));

      const { error: err2 } = await supabase.from("workout_template_exercises").insert(exerciseInserts);
      if (err2) {
        alert("Failed to save exercises: " + err2.message);
        console.error(err2);
        return;
      }
      
      setIsCreating(false);
      setNewTemplateName("");
      setExercises([{ name: "", sets: 3, reps: null, weight: 0, group: "Chest" }]);
      fetchTemplates();
    } else {
      alert("Failed to save template: " + (err1?.message || "Unknown error"));
      console.error(err1);
    }
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("workout_templates").delete().eq("id", id);
    fetchTemplates();
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading templates...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Workout Templates</h2>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-bold"
          >
            <Plus size={16} /> New Template
          </button>
        )}
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 mb-8 shadow-sm">
          <input 
            type="text" 
            placeholder="Template Name (e.g. Push Day)" 
            className="w-full text-lg font-bold p-2 border-b border-slate-200 mb-4 focus:outline-none"
            value={newTemplateName}
            onChange={e => setNewTemplateName(e.target.value)}
          />
          
          <div className="space-y-3 mb-6">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
                <input 
                  type="text" placeholder="Exercise Name" 
                  className="flex-1 p-2 rounded border border-slate-200 text-sm"
                  value={ex.name} onChange={e => updateExercise(i, 'name', e.target.value)}
                />
                <select
                  className="p-2 rounded border border-slate-200 text-sm bg-white"
                  value={ex.group} onChange={e => updateExercise(i, 'group', e.target.value)}
                >
                  {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input 
                  type="number" placeholder="Sets" 
                  className="w-16 p-2 rounded border border-slate-200 text-sm"
                  value={ex.sets} onChange={e => updateExercise(i, 'sets', parseInt(e.target.value))}
                />
                <input 
                  type="number" placeholder="Reps (opt)" 
                  className="w-20 p-2 rounded border border-slate-200 text-sm"
                  value={ex.reps ?? ""} onChange={e => updateExercise(i, 'reps', e.target.value ? parseInt(e.target.value) : "")}
                />
                <input 
                  type="number" placeholder="Lbs/Kg" 
                  className="w-20 p-2 rounded border border-slate-200 text-sm"
                  value={ex.weight} onChange={e => updateExercise(i, 'weight', parseFloat(e.target.value))}
                />
                <button onClick={() => removeExerciseRow(i)} className="p-2 text-red-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={addExerciseRow} className="flex items-center gap-1 text-sm text-slate-500 hover:text-black font-semibold">
              <Plus size={14} /> Add Exercise
            </button>
            <div className="flex-1" />
            <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-sm text-slate-500 font-bold">
              Cancel
            </button>
            <button onClick={saveTemplate} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
              <Save size={16} /> Save Template
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.length === 0 && !isCreating && (
          <div className="col-span-2 p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-500">
            <Dumbbell className="mx-auto mb-3 opacity-30" size={32} />
            <p>No workout templates defined.</p>
            <p className="text-sm">Create one to enable quick-logging via Telegram.</p>
          </div>
        )}
        
        {templates.map(t => (
          <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative group">
            <button 
              onClick={() => deleteTemplate(t.id)}
              className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={16} />
            </button>
            <h3 className="font-bold text-lg mb-4">{t.name}</h3>
            <div className="space-y-2">
              {t.workout_template_exercises?.map((ex: any) => (
                <div key={ex.id} className="flex justify-between text-sm items-center bg-slate-50 p-2 rounded-lg">
                  <span className="font-semibold text-slate-700">{ex.exercise_name}</span>
                  <span className="text-slate-500 font-mono text-xs">
                    {ex.sets} sets {ex.reps ? `x ${ex.reps} reps` : ""} {ex.weight > 0 ? `@ ${ex.weight}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
