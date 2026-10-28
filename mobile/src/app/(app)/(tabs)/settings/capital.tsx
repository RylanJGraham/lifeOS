import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme";
import { Surface, SectionLabel, FormField, PrimaryButton, LoadingState } from "@/components/ui";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

interface CapitalProfile {
  id?: string;
  user_id?: string;
  base_salary: number | null;
  bank_balance: number | null;
  target_savings_rate: number | null;
}

export default function CapitalSettings() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CapitalProfile | null>(null);
  const [originalBankBalance, setOriginalBankBalance] = useState<number | null>(null);
  const [form, setForm] = useState({ base_salary: "", bank_balance: "", target_savings_rate: "" });

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, user_id, base_salary, bank_balance, target_savings_rate")
      .limit(1)
      .then(({ data }) => {
        const p = (data?.[0] as CapitalProfile) ?? null;
        setProfile(p);
        setOriginalBankBalance(p?.bank_balance ?? null);
        setForm({
          base_salary: p?.base_salary?.toString() ?? "",
          bank_balance: p?.bank_balance?.toString() ?? "",
          target_savings_rate: p?.target_savings_rate?.toString() ?? "",
        });
        setLoading(false);
      });
  }, []);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const newBankBalance = num(form.bank_balance);
    const payload: Record<string, unknown> = {
      id: profile?.id,
      user_id: profile?.user_id ?? ZERO_UUID,
      base_salary: num(form.base_salary),
      bank_balance: newBankBalance,
      target_savings_rate: num(form.target_savings_rate),
    };
    // Only stamp bank_balance_updated_at when the value actually changed —
    // the live-balance formula (src/lib/finance.ts) uses this as the
    // "since" cutoff for summing transactions, so stamping it unconditionally
    // would silently zero out days of already-tracked transaction history.
    if (newBankBalance !== originalBankBalance) {
      payload.bank_balance_updated_at = new Date().toISOString();
    }
    const { error: upsertError } = await supabase.from("user_profiles").upsert(payload);
    setSaving(false);
    if (upsertError) setError(upsertError.message);
    else {
      setOriginalBankBalance(newBankBalance);
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
      <SectionLabel title="Income & Reserves" />
      <Surface>
        <FormField label="Base salary" value={form.base_salary} onChangeText={set("base_salary")} keyboardType="numeric" />
        <FormField label="Bank balance" value={form.bank_balance} onChangeText={set("bank_balance")} keyboardType="numeric" />
      </Surface>

      <SectionLabel title="Savings Goal" />
      <Surface>
        <FormField label="Target savings rate (%)" value={form.target_savings_rate} onChangeText={set("target_savings_rate")} keyboardType="numeric" />
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
