import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronRight,
  Activity,
  Brain,
  Flame,
  Moon,
  TrendingUp,
  Wallet,
  Trophy,
  Flag,
  Server,
  Calendar as CalendarIcon,
  Bell,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { useInsights, resolveInsight, type Insight } from "@/lib/queries";
import { goalCheckinAnswer } from "@/lib/api";
import { ScreenHeader, Surface, ErrorBanner, LoadingState } from "@/components/ui";

const ALL_DOMAINS = [
  "doctor",
  "nutritionist",
  "pt",
  "readiness",
  "pacing",
  "bodycomp",
  "correlations",
  "evening_audit",
  "goals",
  "habits",
  "cash",
  "advisor_action",
  "health_summary",
];

const GROUP_ORDER = ["Fuel", "Training", "Health", "Wealth", "Goals", "System"];

const DOMAIN_GROUP: Record<string, string> = {
  pacing: "Fuel",
  nutritionist: "Fuel",
  readiness: "Training",
  pt: "Training",
  doctor: "Health",
  health_summary: "Health",
  evening_audit: "Health",
  correlations: "Health",
  bodycomp: "Health",
  advisor_action: "Wealth",
  cash: "Wealth",
  goals: "Goals",
  habits: "Goals",
};

const DOMAIN_ICON: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  doctor: Activity,
  nutritionist: Flame,
  pt: Trophy,
  readiness: Activity,
  pacing: Flame,
  bodycomp: Activity,
  correlations: Brain,
  evening_audit: Moon,
  goals: Flag,
  habits: Flag,
  cash: Wallet,
  advisor_action: TrendingUp,
  health_summary: Activity,
};

const DOMAIN_LABEL: Record<string, string> = {
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  pt: "PT",
  readiness: "Readiness",
  pacing: "Fuel pacing",
  bodycomp: "Body comp",
  correlations: "Pattern",
  evening_audit: "Evening audit",
  goals: "Goal pace",
  habits: "Habits",
  cash: "Cash flow",
  advisor_action: "Advisor action",
  health_summary: "Health summary",
};

function labelForDomain(domain: string) {
  return DOMAIN_LABEL[domain] ?? domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function routeForDomain(domain: string): string {
  if (domain === "cash" || domain === "advisor_action") return "/capital";
  if (["readiness", "pacing", "bodycomp", "correlations", "health_summary"].includes(domain)) return "/health";
  if (["goals", "habits"].includes(domain)) return "/goals";
  if (["doctor", "nutritionist", "pt"].includes(domain)) return "/specialist";
  return "/";
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const insights = useInsights(ALL_DOMAINS, 200);

  const unresolved = useMemo(
    () => (insights.data ?? []).filter((i) => !i.resolved_at),
    [insights.data],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Insight[]>();
    for (const insight of unresolved) {
      const group = DOMAIN_GROUP[insight.domain] ?? "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(insight);
    }
    // Sort each group by generated_at desc
    for (const arr of map.values()) {
      arr.sort((a, b) => +new Date(b.generated_at) - +new Date(a.generated_at));
    }
    return map;
  }, [unresolved]);

  const handleResolve = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await resolveInsight(id);
      insights.refetch();
    },
    [insights],
  );

  const handleCheckin = useCallback(
    async (insight: Insight, answer: "yes" | "no") => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      let goalId = insight.metadata?.goal_id;
      if (!goalId && insight.action_item) {
        const match = insight.action_item.match(/\[yesno:([^\]]+)\]/);
        if (match) goalId = match[1];
      }
      if (!goalId) return;
      await goalCheckinAnswer(goalId, answer, insight.id);
      insights.refetch();
    },
    [insights],
  );

  const handleNavigate = useCallback(
    (domain: string) => {
      router.push(routeForDomain(domain) as never);
    },
    [router],
  );

  if (insights.loading) return <LoadingState label="Loading inbox…" />;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <ScreenHeader title="Inbox" subtitle={`${unresolved.length} unresolved`} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={insights.refreshing} onRefresh={insights.refetch} tintColor={colors.textSecondary} />
        }
      >
        {insights.error ? <ErrorBanner message={insights.error} /> : null}

        <View style={styles.shortcuts}>
          <Pressable onPress={() => router.push("/calendar" as never)} style={[styles.shortcut, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
            <CalendarIcon size={16} color={colors.focus} />
            <Text style={[styles.shortcutText, { color: colors.textPrimary }]}>Calendar</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/notifications" as never)} style={[styles.shortcut, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
            <Bell size={16} color={colors.focus} />
            <Text style={[styles.shortcutText, { color: colors.textPrimary }]}>Notifications</Text>
          </Pressable>
        </View>

        {unresolved.length === 0 ? (
          <Surface style={styles.emptyCard}>
            <Server size={24} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear</Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              No pending insights from your pipelines or advisors. Check back after the next run.
            </Text>
          </Surface>
        ) : (
          GROUP_ORDER.filter((g) => grouped.has(g)).map((group) => (
            <View key={group} style={styles.group}>
              <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{group}</Text>
              {grouped.get(group)!.map((insight) => {
                const Icon = DOMAIN_ICON[insight.domain] ?? Flag;
                const isYesNo =
                  insight.metadata?.action === "yes_no" ||
                  (insight.action_item?.includes("[yesno:") ?? false);
                return (
                  <Surface key={insight.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardMeta}>
                        <Icon size={14} color={colors.textSecondary} />
                        <Text style={[styles.domainLabel, { color: colors.textSecondary }]}>
                          {labelForDomain(insight.domain)}
                        </Text>
                        <Text style={[styles.date, { color: colors.textTertiary }]}>{relativeDate(insight.generated_at)}</Text>
                      </View>
                      {!isYesNo ? (
                        <Pressable
                          onPress={() => handleResolve(insight.id)}
                          hitSlop={8}
                          style={[styles.doneButton, { backgroundColor: colors.surface2 }]}
                        >
                          <Check size={16} color={colors.good} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={[styles.insightText, { color: colors.textPrimary }]} numberOfLines={4}>
                      {insight.insight_text}
                    </Text>
                    {insight.action_item ? (
                      <Text style={[styles.actionItem, { color: colors.focus }]} numberOfLines={2}>
                        → {insight.action_item.replace(/\[yesno:[^\]]*\]\s*/, "")}
                      </Text>
                    ) : null}
                    {isYesNo ? (
                      <View style={styles.yesNoRow}>
                        <Pressable
                          onPress={() => handleCheckin(insight, "no")}
                          style={[styles.yesNoBtn, { backgroundColor: colors.surface2 }]}
                        >
                          <Text style={[styles.yesNoText, { color: colors.textSecondary }]}>No</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleCheckin(insight, "yes")}
                          style={[styles.yesNoBtn, { backgroundColor: colors.good }]}
                        >
                          <Text style={[styles.yesNoText, { color: colors.bg }]}>Yes</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => handleNavigate(insight.domain)} style={styles.goRow}>
                        <Text style={[styles.goText, { color: colors.textSecondary }]}>Go to {routeForDomain(insight.domain).replace("/", "")}</Text>
                        <ChevronRight size={14} color={colors.textTertiary} />
                      </Pressable>
                    )}
                  </Surface>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  shortcuts: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  shortcut: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shortcutText: { fontFamily: fonts.geistMedium, fontSize: 14 },
  group: { marginBottom: spacing.lg },
  groupLabel: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 12,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
    marginRight: spacing.sm,
  },
  domainLabel: {
    fontFamily: fonts.geistRegular,
    fontSize: 12,
  },
  date: {
    fontFamily: fonts.geistRegular,
    fontSize: 12,
  },
  doneButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  insightText: {
    fontFamily: fonts.geistRegular,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  actionItem: {
    fontFamily: fonts.geistRegular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  goRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  goText: {
    fontFamily: fonts.geistRegular,
    fontSize: 13,
  },
  yesNoRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  yesNoText: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 13,
  },
  emptyCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 18,
    marginTop: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.geistRegular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
