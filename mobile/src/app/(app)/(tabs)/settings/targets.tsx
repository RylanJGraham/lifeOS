import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { calculateTargets, type CalculatedTargets } from "@/lib/api";
import { colors, radius, spacing, type } from "@/theme";
import {
  Surface,
  SectionLabel,
  FormField,
  PrimaryButton,
  SegmentedControl,
  LoadingState,
  PacingBar,
  MetaRow,
  Pill,
} from "@/components/ui";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const GOALS: { key: "cut" | "lean_bulk" | "bulk" | "maintain"; label: string }[] = [
  { key: "cut", label: "Cut" },
  { key: "lean_bulk", label: "Lean bulk" },
  { key: "bulk", label: "Bulk" },
  { key: "maintain", label: "Maintain" },
];
const ACTIVITY: { key: "sedentary" | "light" | "moderate" | "athlete"; label: string }[] = [
  { key: "sedentary", label: "Sedentary" },
  { key: "light", label: "Light" },
  { key: "moderate", label: "Moderate" },
  { key: "athlete", label: "Athlete" },
];

interface TargetsProfile {
  id?: string;
  user_id?: string;
  height_cm: number | null;
  age: number | null;
  sex: string | null;
  current_weight_kg: number | null;
  daily_caloric_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal: string | null;
  activity_level: string | null;
}

export default function TargetsSettings() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<TargetsProfile | null>(null);

  const [form, setForm] = useState({ daily_caloric_target: "", protein_target_g: "", carbs_target_g: "", fat_target_g: "" });
  const [goal, setGoal] = useState<(typeof GOALS)[number]["key"]>("maintain");
  const [activity, setActivity] = useState<(typeof ACTIVITY)[number]["key"]>("moderate");
  const [physique, setPhysique] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<CalculatedTargets | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, user_id, height_cm, age, sex, current_weight_kg, daily_caloric_target, protein_target_g, carbs_target_g, fat_target_g, goal, activity_level")
      .limit(1)
      .then(({ data }) => {
        const p = (data?.[0] as TargetsProfile) ?? null;
        setProfile(p);
        setForm({
          daily_caloric_target: p?.daily_caloric_target?.toString() ?? "",
          protein_target_g: p?.protein_target_g?.toString() ?? "",
          carbs_target_g: p?.carbs_target_g?.toString() ?? "",
          fat_target_g: p?.fat_target_g?.toString() ?? "",
        });
        if (p?.goal) setGoal(p.goal as typeof goal);
        if (p?.activity_level) setActivity(p.activity_level as typeof activity);
        setLoading(false);
      });
  }, []);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const runCalculator = async () => {
    if (!profile?.height_cm || !profile?.age || !profile?.sex) {
      setCalcError("Set height, age, and sex in Body settings first.");
      return;
    }
    setCalculating(true);
    setCalcError(null);
    try {
      const result = await calculateTargets({
        height_cm: profile.height_cm,
        age: profile.age,
        sex: profile.sex as "male" | "female",
        physique_description: physique,
        goal,
        activity_level: activity,
        current_weight_kg: profile.current_weight_kg,
      });
      setCalcResult(result);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const applyCalculated = async () => {
    if (!calcResult) return;
    setSaving(true);
    await supabase.from("user_profiles").upsert({
      id: profile?.id,
      user_id: profile?.user_id ?? ZERO_UUID,
      daily_caloric_target: Math.round(calcResult.calories),
      protein_target_g: Math.round(calcResult.protein_g),
      carbs_target_g: Math.round(calcResult.carbs_g),
      fat_target_g: Math.round(calcResult.fat_g),
      estimated_weight_kg: calcResult.weight_was_estimated ? calcResult.estimated_weight_kg : undefined,
      goal,
      activity_level: activity,
      targets_computed_at: new Date().toISOString(),
    });
    setForm({
      daily_caloric_target: String(Math.round(calcResult.calories)),
      protein_target_g: String(Math.round(calcResult.protein_g)),
      carbs_target_g: String(Math.round(calcResult.carbs_g)),
      fat_target_g: String(Math.round(calcResult.fat_g)),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveManual = async () => {
    setSaving(true);
    setError(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const { error: upsertError } = await supabase.from("user_profiles").upsert({
      id: profile?.id,
      user_id: profile?.user_id ?? ZERO_UUID,
      daily_caloric_target: num(form.daily_caloric_target),
      protein_target_g: num(form.protein_target_g),
      carbs_target_g: num(form.carbs_target_g),
      fat_target_g: num(form.fat_target_g),
      goal,
      activity_level: activity,
    });
    setSaving(false);
    if (upsertError) setError(upsertError.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) return <LoadingState />;

  const caloriesPct = calcResult ? Math.max(0, Math.min(100, (calcResult.calories / calcResult.tdee) * 100)) : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SectionLabel title="System Calibrator" subtitle="Re-calculate from body metrics, goal, and activity" />
      <Surface>
        <Text style={styles.label}>Goal</Text>
        <SegmentedControl options={GOALS} value={goal} onChange={setGoal} />
        <View style={{ height: spacing.md }} />
        <Text style={styles.label}>Activity level</Text>
        <SegmentedControl options={ACTIVITY} value={activity} onChange={setActivity} />
        <View style={{ height: spacing.md }} />
        <FormField label="Physique description (optional — helps estimate weight if not set)" value={physique} onChangeText={setPhysique} />
        {calcError ? <Text style={styles.error}>{calcError}</Text> : null}
        <PrimaryButton label="Re-calculate with AI" onPress={runCalculator} loading={calculating} color={colors.trends} />
      </Surface>

      {calcResult ? (
        <>
          <SectionLabel title="AI Recommended Envelope" subtitle={calcResult.weight_was_estimated ? `Weight estimated at ${calcResult.estimated_weight_kg.toFixed(1)}kg` : undefined} />
          <Surface>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>DAILY CALORIC TARGET</Text>
              <Pill label={goal.toUpperCase().replace("_", " ")} color={colors.nutrition} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
              <Text style={styles.heroValue}>{Math.round(calcResult.calories).toLocaleString()}</Text>
              <Text style={styles.heroUnit}>kcal</Text>
            </View>
            <View style={{ height: spacing.sm }} />
            <PacingBar segments={[{ value: caloriesPct, color: colors.nutrition }]} />
            <View style={styles.pacingLabels}>
              <Text style={styles.pacingLabelText}>Target: {Math.round(calcResult.calories)}</Text>
              <Text style={styles.pacingLabelText}>TDEE: {Math.round(calcResult.tdee)}</Text>
            </View>

            <View style={{ height: spacing.md }} />
            <Text style={styles.wellLabel}>Macro Allocation</Text>
            <View style={styles.well}>
              <MetaRow label="BMR baseline" value={`${Math.round(calcResult.bmr)} kcal`} />
              <MetaRow label="TDEE total" value={`${Math.round(calcResult.tdee)} kcal`} />
              <MetaRow label="Protein" value={`${Math.round(calcResult.protein_g)}g · ${Math.round(calcResult.protein_g * 4)} kcal`} valueColor={colors.focus} />
              <MetaRow label="Carbohydrates" value={`${Math.round(calcResult.carbs_g)}g · ${Math.round(calcResult.carbs_g * 4)} kcal`} valueColor={colors.kinematic} />
              <MetaRow label="Fats" value={`${Math.round(calcResult.fat_g)}g · ${Math.round(calcResult.fat_g * 9)} kcal`} valueColor={colors.wealth} />
            </View>

            <View style={{ height: spacing.md }} />
            <PrimaryButton label={saved ? "Applied ✓" : "Apply to targets"} onPress={applyCalculated} loading={saving} color={colors.good} />
          </Surface>
        </>
      ) : null}

      <SectionLabel title="Manual Target Overrides" subtitle="Tap to edit" />
      <Surface>
        <FormField label="Calories" value={form.daily_caloric_target} onChangeText={set("daily_caloric_target")} keyboardType="numeric" />
        <FormField label="Protein (g)" value={form.protein_target_g} onChangeText={set("protein_target_g")} keyboardType="numeric" />
        <FormField label="Carbs (g)" value={form.carbs_target_g} onChangeText={set("carbs_target_g")} keyboardType="numeric" />
        <FormField label="Fat (g)" value={form.fat_target_g} onChangeText={set("fat_target_g")} keyboardType="numeric" />
      </Surface>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={saved ? "Saved ✓" : "Save manually"} onPress={saveManual} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  label: { fontSize: 12.5, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm, textTransform: "uppercase" },
  error: { color: colors.bad, fontSize: 13, fontWeight: "600", marginBottom: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  cardLabel: { fontFamily: "JetBrainsMono-SemiBold", fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6 },
  heroValue: { ...type.metricXl, color: colors.textPrimary },
  heroUnit: { ...type.body, color: colors.textTertiary, marginBottom: 6 },
  pacingLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: spacing.md },
  pacingLabelText: { ...type.micro, color: colors.textTertiary },
  wellLabel: { ...type.micro, color: colors.textTertiary, textTransform: "uppercase", marginBottom: spacing.sm },
  well: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs },
});
