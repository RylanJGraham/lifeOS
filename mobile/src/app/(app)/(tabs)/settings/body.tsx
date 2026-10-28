import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme";
import { Surface, SectionLabel, FormField, PrimaryButton, LoadingState } from "@/components/ui";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

interface BodyProfile {
  id?: string;
  user_id?: string;
  height_cm: number | null;
  age: number | null;
  sex: string | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
}

export default function BodySettings() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [form, setForm] = useState({ height_cm: "", age: "", sex: "", current_weight_kg: "", target_weight_kg: "" });

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, user_id, height_cm, age, sex, current_weight_kg, target_weight_kg")
      .limit(1)
      .then(({ data }) => {
        const p = (data?.[0] as BodyProfile) ?? null;
        setProfile(p);
        setForm({
          height_cm: p?.height_cm?.toString() ?? "",
          age: p?.age?.toString() ?? "",
          sex: p?.sex ?? "",
          current_weight_kg: p?.current_weight_kg?.toString() ?? "",
          target_weight_kg: p?.target_weight_kg?.toString() ?? "",
        });
        setLoading(false);
      });
  }, []);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const { error: upsertError } = await supabase.from("user_profiles").upsert({
      id: profile?.id,
      user_id: profile?.user_id ?? ZERO_UUID,
      height_cm: num(form.height_cm),
      age: num(form.age),
      sex: form.sex || null,
      current_weight_kg: num(form.current_weight_kg),
      target_weight_kg: num(form.target_weight_kg),
    });
    setSaving(false);
    if (upsertError) setError(upsertError.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SectionLabel title="Biometrics" />
      <Surface>
        <FormField label="Height (cm)" value={form.height_cm} onChangeText={set("height_cm")} keyboardType="numeric" />
        <FormField label="Age" value={form.age} onChangeText={set("age")} keyboardType="numeric" />
        <FormField label="Sex (male/female)" value={form.sex} onChangeText={set("sex")} />
      </Surface>

      <SectionLabel title="Weight Targets" />
      <Surface>
        <FormField label="Current weight (kg)" value={form.current_weight_kg} onChangeText={set("current_weight_kg")} keyboardType="numeric" />
        <FormField label="Target weight (kg)" value={form.target_weight_kg} onChangeText={set("target_weight_kg")} keyboardType="numeric" />
      </Surface>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={saved ? "Saved ✓" : "Save"} onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  error: { color: colors.bad, fontSize: 13, fontWeight: "600" },
});
