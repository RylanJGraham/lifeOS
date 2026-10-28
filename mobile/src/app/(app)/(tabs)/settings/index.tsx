import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PersonStanding, Target, Landmark, Cpu, ChevronRight, Moon, Sun } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { colors as lightColors, spacing, radius, fonts, withAlpha } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader, HEADER_BAR_HEIGHT } from "@/components/ui";

interface SettingsProfile {
  height_cm: number | null;
  age: number | null;
  sex: string | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  daily_caloric_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  base_salary: number | null;
  bank_balance: number | null;
  target_savings_rate: number | null;
}

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

export default function SettingsIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, mode, setMode } = useTheme();
  const styles = createStyles(colors);
  const [profile, setProfile] = useState<SettingsProfile | null>(null);

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select(
        "height_cm, age, sex, current_weight_kg, target_weight_kg, daily_caloric_target, protein_target_g, carbs_target_g, fat_target_g, base_salary, bank_balance, target_savings_rate",
      )
      .limit(1)
      .then(({ data }) => setProfile((data?.[0] as SettingsProfile) ?? null));
  }, []);

  const bodySubtitle = profile?.height_cm || profile?.current_weight_kg
    ? [
        profile.height_cm ? `${profile.height_cm}cm` : null,
        profile.current_weight_kg ? `${profile.current_weight_kg}kg` : null,
        profile.age ? `${profile.age}${profile.sex ? profile.sex[0].toUpperCase() : ""}` : null,
        profile.target_weight_kg ? `target ${profile.target_weight_kg}kg` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "Height, age, weight";

  const targetsSubtitle = profile?.daily_caloric_target
    ? [
        `${profile.daily_caloric_target} kcal`,
        profile.protein_target_g ? `${profile.protein_target_g}g P` : null,
        profile.carbs_target_g ? `${profile.carbs_target_g}g C` : null,
        profile.fat_target_g ? `${profile.fat_target_g}g F` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "Calories, macros, AI calculator";

  const capitalSubtitle = profile?.base_salary || profile?.bank_balance
    ? [
        profile.base_salary ? `salary ${profile.base_salary}` : null,
        profile.bank_balance ? `balance ${profile.bank_balance}` : null,
        profile.target_savings_rate ? `${profile.target_savings_rate}% savings` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "Salary, bank balance, savings rate";

  // Completion stats
  const bodyComplete = !!(profile?.height_cm && profile?.age && profile?.current_weight_kg);
  const targetsComplete = !!(profile?.daily_caloric_target && profile?.protein_target_g);
  const capitalComplete = !!(profile?.base_salary && profile?.bank_balance);
  const completedCount = [bodyComplete, targetsComplete, capitalComplete].filter(Boolean).length;
  const completionPct = Math.round((completedCount / 3) * 100);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
      {/* ─── Profile Hero ─── */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroEyebrow}>CONFIGURATION</Text>
            <Text style={styles.heroTitle}>Settings</Text>
          </View>
          <View style={[styles.completionBadge, { backgroundColor: withAlpha(completionPct === 100 ? colors.good : colors.kinematic, 0.1) }]}>
            <Text style={[styles.completionPct, { color: completionPct === 100 ? colors.good : colors.kinematic }]}>
              {completionPct}%
            </Text>
            <Text style={[styles.completionLabel, { color: completionPct === 100 ? colors.good : colors.kinematic }]}>
              {completionPct === 100 ? "COMPLETE" : "SET UP"}
            </Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>
          {completionPct === 100
            ? "All systems configured. Your cockpit is fully operational."
            : `${3 - completedCount} of 3 sections still need configuration.`}
        </Text>
      </View>

      {/* ─── Section 01 ─── */}
      <Text style={styles.sectionHeader}>01 // BIOMETRICS & TARGETS</Text>
      <View style={styles.navGroup}>
        <NavCard
          icon={<PersonStanding size={20} color={colors.focus} />}
          iconBg={withAlpha(colors.focus, 0.1)}
          title="Body"
          subtitle={bodySubtitle}
          complete={bodyComplete}
          onPress={() => router.push("/settings/body")}
          styles={styles}
        />
        <View style={styles.navDivider} />
        <NavCard
          icon={<Target size={20} color={colors.nutrition} />}
          iconBg={withAlpha(colors.nutrition, 0.1)}
          title="Daily Targets"
          subtitle={targetsSubtitle}
          complete={targetsComplete}
          onPress={() => router.push("/settings/targets")}
          styles={styles}
        />
      </View>

      {/* ─── Section 02 ─── */}
      <Text style={styles.sectionHeader}>02 // CAPITAL & FINANCE</Text>
      <View style={styles.navGroup}>
        <NavCard
          icon={<Landmark size={20} color={colors.wealth} />}
          iconBg={withAlpha(colors.wealth, 0.1)}
          title="Capital Flow"
          subtitle={capitalSubtitle}
          complete={capitalComplete}
          onPress={() => router.push("/settings/capital")}
          styles={styles}
        />
      </View>

      {/* ─── Section 03 ─── */}
      <Text style={styles.sectionHeader}>03 // CORE DIAGNOSTICS</Text>
      <View style={styles.navGroup}>
        <NavCard
          icon={<Cpu size={20} color={colors.textSecondary} />}
          iconBg={withAlpha(colors.textSecondary, 0.1)}
          title="System"
          subtitle="Status, logs, pipelines, statement upload"
          complete={true}
          onPress={() => router.push("/system")}
          styles={styles}
        />
      </View>

      {/* ─── Section 04 ─── */}
      <Text style={styles.sectionHeader}>04 // APPEARANCE</Text>
      <View style={styles.navGroup}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setMode(mode === "system" ? (isDark ? "light" : "dark") : mode === "dark" ? "light" : "dark");
          }}
          style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        >
          <View style={[styles.navIcon, { backgroundColor: withAlpha(colors.focus, 0.1) }]}>
            {isDark ? <Moon size={20} color={colors.focus} /> : <Sun size={20} color={colors.focus} />}
          </View>
          <View style={styles.navBody}>
            <Text style={styles.navTitle}>Dark mode</Text>
            <Text style={styles.navSubtitle}>{mode === "system" ? "Follow system" : mode === "dark" ? "On" : "Off"}</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </Pressable>
        <View style={styles.themeSelectorRow}>
          {(["system", "light", "dark"] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMode(m);
                }}
                style={[styles.themeChip, active && { backgroundColor: colors.focus, borderColor: colors.focus }]}
              >
                <Text style={[styles.themeChipText, active && { color: colors.textInverse }]}>
                  {m === "system" ? "System" : m === "light" ? "Light" : "Dark"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      </ScrollView>
      <ScreenHeader title="Settings" subtitle="Configuration & diagnostics" statusLabel={completionPct === 100 ? "NOMINAL" : "SETUP"} statusColor={completionPct === 100 ? colors.good : colors.kinematic} />
    </View>
  );
}

function NavCard({
  icon,
  iconBg,
  title,
  subtitle,
  complete,
  onPress,
  styles,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  complete: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.navCard}>
      <View style={[styles.navIcon, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.navBody}>
        <View style={styles.navTitleRow}>
          <Text style={styles.navTitle}>{title}</Text>
          {complete ? (
            <View style={styles.completeDot}>
              <View style={styles.completeDotInner} />
            </View>
          ) : (
            <View style={styles.incompleteDot} />
          )}
        </View>
        <Text style={styles.navSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={styles.navSubtitle.color} />
    </View>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },

  // ─── Hero ───
  heroCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    ...cardShadow,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  heroEyebrow: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  completionBadge: {
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  completionPct: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    letterSpacing: -0.5,
  },
  completionLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  heroSubtitle: {
    fontFamily: fonts.geistRegular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // ─── Section headers ───
  sectionHeader: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // ─── Nav group ───
  navGroup: {
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: "hidden",
    ...cardShadow,
  },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  themeSelectorRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  themeChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
  },
  themeChipText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  navBody: {
    flex: 1,
  },
  navTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navTitle: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  navSubtitle: {
    fontFamily: fonts.geistRegular,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  completeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: withAlpha(colors.good, 0.15),
    alignItems: "center",
    justifyContent: "center",
  },
  completeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.good,
  },
  incompleteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.kinematic,
  },
  navDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
});
}
