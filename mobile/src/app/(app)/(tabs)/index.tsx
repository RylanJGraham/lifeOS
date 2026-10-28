import { useMemo, useRef, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Flag, Brain, ChevronRight, Trophy, Wallet, TrendingUp, Flame, Moon, Activity, ArrowUpRight, ArrowDownRight, Server, Camera } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useInsights,
  dedupeLatestPerDomain,
  useProfile,
  useTodayMeals,
  useTransactions,
  useHealthMetrics,
  useWorkouts,
  usePositions,
  usePortfolioSnapshots,
  useGoals,
  useGoalCheckins,
  usePipelines,
  useBackendStatus,
  useSystemLogs,
  useDailyReports,
  isCheckinPending,
  logGoalCheckin,
  updateGoalCurrentValue,
  resolveInsight,
  byCurrency,
  liveBankBalance,
  type Goal,
} from "@/lib/queries";
import { nutritionStatus, sleepStatus, detectPRs, dayFractionNow, type StatusItem, type Severity } from "@/lib/pacing";
import { colors, colors as lightColors, radius, spacing, withAlpha, fonts } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";
import {
  SectionLabel,
  LoadingState,
  ErrorBanner,
  Surface,
  ScreenHeader,
  AccentCard,
  Ring,
  Sparkline,
  AnimatedNumber,
  Dot,
  HEADER_BAR_HEIGHT,
} from "@/components/ui";

const HERO_RING_SIZE = 72;

const INSIGHT_DOMAINS = [
  "doctor", "nutritionist", "pt", "goals", "readiness", "pacing",
  "bodycomp", "cash", "habits", "correlations", "evening_audit",
  "advisor_action",
];

function routeForDomain(domain: string): string {
  if (domain === "cash" || domain === "advisor_action") return "/capital";
  if (["readiness", "pacing", "bodycomp", "correlations"].includes(domain)) return "/health";
  if (["goals", "habits"].includes(domain)) return "/goals";
  if (["doctor", "nutritionist", "pt"].includes(domain)) return "/specialist";
  return "/";
}

const DOMAIN_LABEL: Record<string, string> = {
  readiness: "Training readiness",
  pacing: "Fuel pacing",
  bodycomp: "Body composition",
  cash: "Cash flow",
  habits: "Habit consistency",
  correlations: "Cross-metric pattern",
  evening_audit: "Evening audit",
  goals: "Goal pace",
  doctor: "Medical",
  nutritionist: "Nutrition",
  pt: "Training",
};
function labelForDomain(domain: string): string {
  return DOMAIN_LABEL[domain] ?? domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_COLOR: Record<Severity, string> = { good: colors.good, warn: colors.kinematic, bad: colors.bad };
const SEVERITY_LABEL: Record<Severity, string> = { good: "ON TRACK", warn: "WATCH", bad: "CRITICAL" };

function fmtMoney(n: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

export default function CockpitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const insights = useInsights(INSIGHT_DOMAINS, 100);
  const profile = useProfile();
  const todayMeals = useTodayMeals();
  const transactions = useTransactions(500);
  const healthMetrics = useHealthMetrics(7);
  const workouts = useWorkouts(60);
  const positions = usePositions();
  const snapshots = usePortfolioSnapshots(90);
  const goals = useGoals();
  const goalCheckins = useGoalCheckins(goals.data?.map((g) => g.id) ?? [], 100);
  const pipelines = usePipelines();
  const backendStatus = useBackendStatus();
  const systemLogs = useSystemLogs(5);
  const dailyReports = useDailyReports(1);

  const loading = insights.loading || profile.loading || healthMetrics.loading || positions.loading || goals.loading;
  const refreshing = insights.refreshing || profile.refreshing || healthMetrics.refreshing || positions.refreshing || goals.refreshing || pipelines.refreshing || backendStatus.refreshing || systemLogs.refreshing || dailyReports.refreshing;
  const firstError = insights.error || profile.error || healthMetrics.error || positions.error || transactions.error || goals.error || goalCheckins.error || pipelines.error || backendStatus.error || dailyReports.error;

  const onRefresh = useCallback(() => {
    insights.refetch();
    profile.refetch();
    todayMeals.refetch();
    transactions.refetch();
    healthMetrics.refetch();
    workouts.refetch();
    positions.refetch();
    goals.refetch();
    goalCheckins.refetch();
    pipelines.refetch();
    backendStatus.refetch();
    systemLogs.refetch();
    dailyReports.refetch();
  }, [insights, profile, todayMeals, transactions, healthMetrics, workouts, positions, goals, goalCheckins, pipelines, backendStatus, systemLogs, dailyReports]);

  // Refetch on tab focus so data written by Ingest (meals, workouts, trades)
  // shows up immediately when the user returns to the Cockpit. Skip the
  // first mount — the hooks already fetch on mount.
  const refetchAll = useRef(onRefresh);
  useEffect(() => {
    refetchAll.current = onRefresh;
  }, [onRefresh]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetchAll.current();
    }, []),
  );

  const prItems = useMemo(() => detectPRs(workouts.data ?? []), [workouts.data]);

  const attentionFeed = useMemo<StatusItem[]>(() => {
    if (loading) return [];
    const items: StatusItem[] = [];
    const nStatus = nutritionStatus(todayMeals.data ?? [], profile.data ?? undefined);
    if (nStatus) items.push(nStatus);
    const sStatus = sleepStatus(healthMetrics.data?.[0]);
    if (sStatus) items.push(sStatus);

    const aiInsights = dedupeLatestPerDomain(insights.data ?? [], ["doctor", "nutritionist", "pt"]).filter(
      (i) => i.action_item,
    );
    for (const i of aiInsights.slice(0, 4)) {
      items.push({
        key: `insight-${i.id}`,
        severity: "warn",
        title: labelForDomain(i.domain),
        detail: i.action_item!,
        route: routeForDomain(i.domain),
      });
    }

    const order: Record<Severity, number> = { bad: 0, warn: 1, good: 2 };
    return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
  }, [loading, todayMeals.data, profile.data, healthMetrics.data, insights.data]);

  const pendingCheckins = useMemo<Goal[]>(() => {
    if (!goals.data || !goalCheckins.data) return [];
    return goals.data.filter((g) => isCheckinPending(g, goalCheckins.data ?? []));
  }, [goals.data, goalCheckins.data]);

  const handleCheckin = useCallback(async (goal: Goal, answer: "yes" | "no") => {
    const nextValue = answer === "yes" ? (goal.current_value ?? 0) + 1 : goal.current_value ?? 0;
    await logGoalCheckin(goal.id, answer, nextValue);
    await updateGoalCurrentValue(goal.id, nextValue);
    goals.refetch();
    goalCheckins.refetch();
  }, [goals, goalCheckins]);

  const handleResolveInsight = useCallback(async (insightId: string) => {
    await resolveInsight(insightId);
    insights.refetch();
  }, [insights]);

  // Pre-compute values needed by sparkline useMemos (must be before the
  // early return below — hooks can't be called conditionally).
  const preBalance = profile.data
    ? liveBankBalance(profile.data.bank_balance, profile.data.bank_balance_updated_at, transactions.data ?? [])
    : null;
  const preCurrencyTotals = byCurrency(positions.data ?? []);
  const prePortfolioTotal = Object.values(preCurrencyTotals).reduce((a, v) => a + v.value, 0);

  // Net worth sparkline (last 14 days from portfolio snapshots + cash)
  const netWorthSpark = useMemo(() => {
    const snaps = (snapshots?.data ?? []).map((s) => s.total_value + (preBalance ?? 0));
    if (snaps.length >= 2) return snaps.slice(-14);
    return [];
  }, [snapshots?.data, preBalance]);

  // Sleep sparkline (last 7 nights)
  const sleepSpark = useMemo(() => {
    return (healthMetrics.data ?? [])
      .filter((m) => m.sleep_duration_minutes != null)
      .map((m) => m.sleep_duration_minutes! / 60)
      .slice(0, 7)
      .reverse();
  }, [healthMetrics.data]);

  // Calorie sparkline (last 7 days — approximate from meals data)
  const calorieSpark = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const m of todayMeals.data ?? []) {
      const day = (m.meal_time ?? "").slice(0, 10);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + (m.calories ?? 0));
    }
    return Array.from(byDay.values()).slice(-7);
  }, [todayMeals.data]);

  // Readiness score: sleep + HRV + RHR composite
  const readinessScore = useMemo(() => {
    const latestMetric = healthMetrics.data?.[0];
    const sleepHours = latestMetric?.sleep_duration_minutes ? latestMetric.sleep_duration_minutes / 60 : null;
    const sleepPctVal = sleepHours != null ? Math.min(100, (sleepHours / 8) * 100) : null;
    let score = 0;
    let components = 0;
    if (sleepPctVal != null) { score += sleepPctVal * 0.4; components++; }
    if (latestMetric?.hrv != null) { score += Math.min(100, (latestMetric.hrv / 60) * 100) * 0.35; components++; }
    if (latestMetric?.resting_heart_rate != null) { score += Math.max(0, 100 - (latestMetric.resting_heart_rate - 50) * 2) * 0.25; components++; }
    return components > 0 ? Math.round(score / components) : null;
  }, [healthMetrics.data]);

  if (loading) return <LoadingState label="Loading Cockpit…" />;

  const latestMetric = healthMetrics.data?.[0];
  const currencyTotals = preCurrencyTotals;
  const balance = preBalance;
  const todayCalories = (todayMeals.data ?? []).reduce((a, m) => a + (m.calories ?? 0), 0);
  const todayProtein = (todayMeals.data ?? []).reduce((a, m) => a + (m.protein ?? 0), 0);

  const counts = { bad: 0, warn: 0, good: 0 };
  for (const item of attentionFeed) counts[item.severity]++;
  const dispatchLine = attentionFeed.length === 0 ? "All systems nominal" : `${counts.bad} CRITICAL · ${counts.warn} WATCH · ${counts.good} NOMINAL`;

  const services = backendStatus.data?.services;
  const servicesOk = services ? services.openrouter === "ok" && services.supabase === "ok" : null;
  const systemErrorCount = pipelines.data?.filter((p) => p.status === "error").length ?? 0;
  const systemOk = servicesOk === true && systemErrorCount === 0;
  const systemDegraded = servicesOk === false || systemErrorCount > 0;

  const dayFraction = dayFractionNow();
  const overallSeverity: Severity = counts.bad > 0 ? "bad" : counts.warn > 0 ? "warn" : "good";
  const overallColor = SEVERITY_COLOR[overallSeverity];

  // Left to spend this month
  const thisMonthStr = new Date().toISOString().slice(0, 7);
  const monthTxs = (transactions.data ?? []).filter((t) => t.transaction_date?.startsWith(thisMonthStr));
  const monthIncome = monthTxs.reduce((a, t) => a + (typeof t.amount === "number" ? Math.max(t.amount, 0) : 0), 0);
  const monthSpent = monthTxs.reduce((a, t) => a + (typeof t.amount === "number" ? Math.min(t.amount, 0) : 0), 0);
  const savingsRate = profile.data?.target_savings_rate ?? 0;
  const monthSpendable = monthIncome * (1 - savingsRate);
  const leftToSpend = monthSpendable + monthSpent; // monthSpent is negative

  // Net worth = cash + portfolio (sum across currencies, FX-agnostic display)
  const portfolioTotal = prePortfolioTotal;
  const netWorth = (balance ?? 0) + portfolioTotal;

  // Today's net worth delta (sum of today's transactions)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDelta = (transactions.data ?? [])
    .filter((t) => t.transaction_date === todayStr)
    .reduce((a, t) => a + (typeof t.amount === "number" ? t.amount : 0), 0);

  // Calorie pacing
  const calTarget = profile.data?.daily_caloric_target;
  const calPct = calTarget ? Math.min(100, (todayCalories / calTarget) * 100) : null;
  const proteinTarget = profile.data?.protein_target_g;
  const proteinPct = proteinTarget ? Math.min(100, (todayProtein / proteinTarget) * 100) : null;

  // Sleep pacing
  const sleepHours = latestMetric?.sleep_duration_minutes ? latestMetric.sleep_duration_minutes / 60 : null;
  const sleepPct = sleepHours != null ? Math.min(100, (sleepHours / 8) * 100) : null;

  const topItem = attentionFeed[0];
  const restItems = attentionFeed.slice(1);

  const latestCorrelation = insights.data?.find((i) => i.domain === "correlations" && !i.resolved_at);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {firstError ? <ErrorBanner message={firstError} /> : null}

        {/* ─── HERO: Net Worth + Day Pacing Ring ─── */}
        <View style={[styles.heroCard, { backgroundColor: colors.good }]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>NET WORTH</Text>
              <View style={styles.heroValueRow}>
                <AnimatedNumber
                  value={netWorth}
                  format={(n) => fmtMoney(n)}
                  style={styles.heroValue}
                />
                {todayDelta !== 0 ? (
                  <View style={styles.heroDelta}>
                    {todayDelta > 0 ? (
                      <ArrowUpRight size={12} color={overallColor} />
                    ) : (
                      <ArrowDownRight size={12} color={overallColor} />
                    )}
                    <Text style={styles.heroDeltaText}>
                      {todayDelta > 0 ? "+" : ""}{fmtMoney(todayDelta)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {netWorthSpark.length >= 2 ? (
                <View style={styles.heroSparkline}>
                  <Sparkline data={netWorthSpark} width={140} height={28} color={withAlpha("#FFFFFF", 0.7)} strokeWidth={2} fill={false} />
                </View>
              ) : null}
              <View style={styles.heroBreakdown}>
                <View style={styles.heroBreakdownItem}>
                  <Wallet size={12} color={withAlpha("#FFFFFF", 0.7)} />
                  <Text style={styles.heroBreakdownLabel}>Cash</Text>
                  <Text style={styles.heroBreakdownValue}>{balance != null ? fmtMoney(balance) : "—"}</Text>
                </View>
                <View style={styles.heroBreakdownDivider} />
                <View style={styles.heroBreakdownItem}>
                  <TrendingUp size={12} color={withAlpha("#FFFFFF", 0.7)} />
                  <Text style={styles.heroBreakdownLabel}>Portfolio</Text>
                  <Text style={styles.heroBreakdownValue}>{portfolioTotal > 0 ? fmtMoney(portfolioTotal) : "—"}</Text>
                </View>
              </View>
            </View>
            <Ring progress={dayFraction * 100} size={HERO_RING_SIZE} strokeWidth={6} color={withAlpha("#FFFFFF", 0.9)} track={withAlpha("#FFFFFF", 0.2)}>
              <View style={styles.heroRingInner}>
                <Text style={styles.heroRingPct}>{Math.round(dayFraction * 100)}</Text>
                <Text style={styles.heroRingUnit}>% DAY</Text>
              </View>
            </Ring>
          </View>
          <View style={styles.heroStatusRow}>
            <View style={styles.heroStatusPill}>
              <Text style={styles.heroStatusPillText}>
                {overallSeverity === "bad" ? "CRITICAL" : overallSeverity === "warn" ? "WATCH" : "NOMINAL"}
              </Text>
            </View>
            {readinessScore != null ? (
              <View style={styles.heroStatusPill}>
                <Text style={styles.heroStatusPillText}>RDY {readinessScore}</Text>
              </View>
            ) : null}
            <Text style={styles.heroStatusDetail}>{dispatchLine}</Text>
          </View>
        </View>

        {/* ─── Daily briefing + Left to spend ─── */}
        {dailyReports.data && dailyReports.data.length > 0 ? (
          <AccentCard
            tier="standard"
            color={colors.trends}
            badgeLabel="BRIEFING"
            metaRight={dailyReports.data[0].report_date}
            title={dailyReports.data[0].title ?? `Market report ${dailyReports.data[0].report_date}`}
            detail={dailyReports.data[0].json_content && typeof dailyReports.data[0].json_content === "object" && "summary" in dailyReports.data[0].json_content ? String(dailyReports.data[0].json_content.summary) : "Daily market regime and portfolio assessment."}
            onPress={() => router.push(`/(app)/report/${dailyReports.data![0].id}`)}
          />
        ) : null}

        <Surface style={styles.leftSpendCard}>
          <View style={styles.leftSpendHeader}>
            <Wallet size={14} color={colors.wealth} />
            <Text style={styles.leftSpendLabel}>LEFT TO SPEND THIS MONTH</Text>
          </View>
          <Text style={[styles.leftSpendValue, { color: leftToSpend >= 0 ? colors.good : colors.bad }]}>
            {leftToSpend >= 0 ? "" : "−"}€{Math.abs(leftToSpend).toFixed(0)}
          </Text>
          <View style={styles.leftSpendMetaRow}>
            <Text style={styles.leftSpendMeta}>Income €{monthIncome.toFixed(0)}</Text>
            <Text style={styles.leftSpendMeta}>Spent €{Math.abs(monthSpent).toFixed(0)}</Text>
            <Text style={styles.leftSpendMeta}>Target save {Math.round(savingsRate * 100)}%</Text>
          </View>
        </Surface>

        {/* ─── Nav Cards ─── */}
        <View style={styles.navCardsRow}>
          <Pressable
            style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push("/goals");
            }}
          >
            <View style={[styles.navCardIcon, { backgroundColor: withAlpha(colors.focus, 0.1) }]}>
              <Flag size={18} color={colors.focus} />
            </View>
            <Text style={styles.navCardLabel}>Goals</Text>
            <Text style={styles.navCardSub}>Strategy & pace</Text>
            <ChevronRight size={14} color={colors.textTertiary} style={styles.navCardChevron} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push("/specialist");
            }}
          >
            <View style={[styles.navCardIcon, { backgroundColor: withAlpha(colors.wealth, 0.1) }]}>
              <Brain size={18} color={colors.wealth} />
            </View>
            <Text style={styles.navCardLabel}>Advisors</Text>
            <Text style={styles.navCardSub}>3 specialists</Text>
            <ChevronRight size={14} color={colors.textTertiary} style={styles.navCardChevron} />
          </Pressable>
        </View>

        {/* ─── Quick log shortcuts ─── */}
        <View style={styles.quickLogRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push({ pathname: "/chat", params: { camera: "1" } });
            }}
            style={({ pressed }) => [styles.quickLogTile, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
          >
            <View style={[styles.quickLogIcon, { backgroundColor: withAlpha(colors.nutrition, 0.1) }]}>
              <Camera size={16} color={colors.nutrition} />
            </View>
            <Text style={styles.quickLogLabel}>Log photo</Text>
          </Pressable>
        </View>

        {/* ─── PR Alert ─── */}
        {prItems.length > 0 ? (
          <View style={styles.prBanner}>
            <View style={styles.prBannerLeft}>
              <Trophy size={16} color={colors.good} />
              <Text style={styles.prBannerText}>NEW PR</Text>
            </View>
            <Text style={styles.prDetail} numberOfLines={1}>{prItems[0].detail}</Text>
            {prItems.length > 1 ? (
              <View style={styles.prCount}>
                <Text style={styles.prCountText}>+{prItems.length - 1}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ─── Correlation / pattern card ─── */}
        {latestCorrelation ? (
          <AccentCard
            tier="standard"
            color={colors.focus}
            badgeLabel="PATTERN"
            metaRight={relativeDate(latestCorrelation.generated_at)}
            title={latestCorrelation.insight_text}
            detail={latestCorrelation.action_item ?? undefined}
            onPress={() => router.push("/specialist")}
          />
        ) : null}

        {/* ─── Daily briefing teaser ─── */}
        {dailyReports.data && dailyReports.data.length > 0 ? (
          <AccentCard
            tier="standard"
            color={colors.trends}
            badgeLabel="BRIEFING"
            metaRight={dailyReports.data[0].report_date}
            title={dailyReports.data[0].title ?? `Market report ${dailyReports.data[0].report_date}`}
            detail={dailyReports.data[0].market_regime ? `${dailyReports.data[0].market_regime} · ${dailyReports.data[0].json_content && typeof dailyReports.data[0].json_content === "object" && "summary" in dailyReports.data[0].json_content ? String(dailyReports.data[0].json_content.summary) : "Daily advisor report"}` : "Daily advisor report"}
            onPress={() => router.push("/capital")}
          />
        ) : null}

        {/* ─── Action Queue: hero card + rest ─── */}
        <SectionLabel title="Action queue" subtitle={attentionFeed.length === 0 ? "All clear" : `${attentionFeed.length} item${attentionFeed.length > 1 ? "s" : ""}`} />
        {attentionFeed.length === 0 ? (
          <Surface style={styles.allClearCard}>
            <Dot color={colors.good} size={10} />
            <Text style={styles.allClearText}>All systems nominal — nothing needs your attention right now.</Text>
          </Surface>
        ) : (
          <>
            {topItem ? (
              <AccentCard
                key={topItem.key}
                tier={topItem.severity === "bad" ? "critical" : "standard"}
                color={SEVERITY_COLOR[topItem.severity]}
                badgeLabel={SEVERITY_LABEL[topItem.severity]}
                title={topItem.title}
                detail={topItem.detail}
                onPress={() => router.push(topItem.route as never)}
                footer={
                  topItem.key.startsWith("insight-") ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        handleResolveInsight(topItem.key.replace("insight-", ""));
                      }}
                      style={styles.resolveButton}
                    >
                      <Text style={styles.resolveButtonText}>MARK RESOLVED</Text>
                    </Pressable>
                  ) : undefined
                }
              />
            ) : null}
            {restItems.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.route as never)}
                style={({ pressed }) => [styles.compactActionRow, pressed && { opacity: 0.6 }]}
              >
                <Dot color={SEVERITY_COLOR[item.severity]} size={8} />
                <Text style={styles.compactActionTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.compactActionDetail} numberOfLines={1}>{item.detail}</Text>
                {item.key.startsWith("insight-") ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      handleResolveInsight(item.key.replace("insight-", ""));
                    }}
                    hitSlop={8}
                    style={styles.inlineDoneButton}
                  >
                    <Text style={styles.inlineDoneText}>DONE</Text>
                  </Pressable>
                ) : (
                  <ChevronRight size={14} color={colors.textTertiary} />
                )}
              </Pressable>
            ))}
          </>
        )}

        {/* ─── Pending Goal Check-ins ─── */}
        {pendingCheckins.length > 0 ? (
          <>
            <SectionLabel title="Goal check-ins" subtitle={`${pendingCheckins.length} waiting`} />
            {pendingCheckins.map((goal) => (
              <AccentCard
                key={`checkin-${goal.id}`}
                tier="standard"
                color={colors.focus}
                badgeLabel={(goal.checkin_cadence ?? "daily").toUpperCase()}
                title={goal.title}
                detail={`Current: ${goal.current_value ?? 0} ${goal.unit ?? ""} · Stay on track?`}
                footer={
                  <View style={styles.checkinRow}>
                    <Pressable
                      onPress={() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                        handleCheckin(goal, "yes");
                      }}
                      style={[styles.checkinButton, { backgroundColor: colors.good }]}
                    >
                      <Text style={styles.checkinButtonText}>YES</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                        handleCheckin(goal, "no");
                      }}
                      style={[styles.checkinButton, { backgroundColor: withAlpha(colors.bad, 0.15) }]}
                    >
                      <Text style={[styles.checkinButtonText, { color: colors.bad }]}>NO</Text>
                    </Pressable>
                  </View>
                }
              />
            ))}
          </>
        ) : null}

        {/* ─── Live Telemetry: ring pods ─── */}
        <SectionLabel title="Live telemetry" action={{ label: "Bio →", onPress: () => router.push("/health") }} />
        <View style={styles.telemetryGrid}>
          {/* Sleep ring pod */}
          <View style={styles.ringPod}>
            <View style={styles.ringPodHeader}>
              <Moon size={12} color={colors.focus} />
              <Text style={styles.ringPodLabel}>SLEEP</Text>
            </View>
            <View style={styles.ringPodBody}>
              <Ring progress={sleepPct ?? 0} size={56} strokeWidth={5} color={colors.focus}>
                <Text style={styles.ringPodValue}>{sleepHours != null ? sleepHours.toFixed(1) : "—"}</Text>
                <Text style={styles.ringPodUnit}>h</Text>
              </Ring>
            </View>
            {sleepSpark.length >= 2 ? (
              <View style={styles.ringPodSpark}>
                <Sparkline data={sleepSpark} width={70} height={16} color={colors.focus} strokeWidth={1.5} fill={false} />
              </View>
            ) : (
              <Text style={styles.ringPodCaption}>{sleepPct != null ? `${Math.round(sleepPct)}% of 8h` : "No data"}</Text>
            )}
          </View>

          {/* Calories ring pod */}
          <View style={styles.ringPod}>
            <View style={styles.ringPodHeader}>
              <Flame size={12} color={colors.kinematic} />
              <Text style={styles.ringPodLabel}>FUEL</Text>
            </View>
            <View style={styles.ringPodBody}>
              <Ring progress={calPct ?? 0} size={56} strokeWidth={5} color={colors.kinematic}>
                <Text style={styles.ringPodValue}>{todayCalories > 0 ? String(Math.round(todayCalories)) : "—"}</Text>
                <Text style={styles.ringPodUnit}>kcal</Text>
              </Ring>
            </View>
            {calorieSpark.length >= 2 ? (
              <View style={styles.ringPodSpark}>
                <Sparkline data={calorieSpark} width={70} height={16} color={colors.kinematic} strokeWidth={1.5} fill={false} />
              </View>
            ) : (
              <Text style={styles.ringPodCaption}>{calTarget ? `${Math.round(todayCalories)}/${calTarget}` : "No target"}</Text>
            )}
          </View>

          {/* Protein ring pod */}
          <View style={styles.ringPod}>
            <View style={styles.ringPodHeader}>
              <Activity size={12} color={colors.nutrition} />
              <Text style={styles.ringPodLabel}>PROTEIN</Text>
            </View>
            <View style={styles.ringPodBody}>
              <Ring progress={proteinPct ?? 0} size={56} strokeWidth={5} color={colors.nutrition}>
                <Text style={styles.ringPodValue}>{todayProtein > 0 ? String(Math.round(todayProtein)) : "—"}</Text>
                <Text style={styles.ringPodUnit}>g</Text>
              </Ring>
            </View>
            <Text style={styles.ringPodCaption}>{proteinTarget ? `${Math.round(todayProtein)}/${proteinTarget}g` : "No target"}</Text>
          </View>
        </View>

        {/* ─── System status strip ─── */}
        {backendStatus.data || pipelines.data ? (
          <>
            <SectionLabel title="Systems" action={{ label: "System →", onPress: () => router.push("/system") }} />
            <Pressable
              onPress={() => router.push("/system")}
              style={({ pressed }) => [styles.systemStrip, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.systemStripLeft}>
                <Server size={16} color={systemOk ? colors.good : systemDegraded ? colors.bad : colors.textTertiary} />
                <View>
                  <Text style={styles.systemStripLabel}>CORE SERVICES</Text>
                  <Text style={styles.systemStripValue}>
                    {systemOk ? "All systems nominal" : systemDegraded ? `${systemErrorCount} issue${systemErrorCount === 1 ? "" : "s"}` : "Status unavailable"}
                  </Text>
                </View>
              </View>
              <View style={[styles.systemStripDot, { backgroundColor: systemOk ? colors.good : systemDegraded ? colors.bad : colors.neutral }]} />
            </Pressable>
          </>
        ) : null}

        {/* ─── Capital strip ─── */}
        <SectionLabel title="Capital" action={{ label: "Capital →", onPress: () => router.push("/capital") }} />
        <View style={styles.capitalStrip}>
          <View style={styles.capitalItem}>
            <Text style={styles.capitalLabel}>LIQUID CASH</Text>
            <Text style={[styles.capitalValue, { color: colors.wealth }]}>{balance != null ? fmtMoney(balance) : "—"}</Text>
          </View>
          <View style={styles.capitalDivider} />
          {Object.entries(currencyTotals).length > 0 ? (
            Object.entries(currencyTotals).map(([currency, v]) => (
              <View key={currency} style={styles.capitalItem}>
                <Text style={styles.capitalLabel}>PORTFOLIO ({currency})</Text>
                <Text style={[styles.capitalValue, { color: v.pnl >= 0 ? colors.good : colors.bad }]}>
                  {fmtMoney(v.value, currency)}
                </Text>
                <Text style={[styles.capitalPnl, { color: v.pnl >= 0 ? colors.good : colors.bad }]}>
                  {v.pnl >= 0 ? "+" : ""}{fmtMoney(v.pnl, currency)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.capitalItem}>
              <Text style={styles.capitalLabel}>PORTFOLIO</Text>
              <Text style={[styles.capitalValue, { color: colors.textTertiary }]}>—</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <ScreenHeader
        title="Cockpit"
        subtitle={dispatchLine}
        statusLabel={counts.bad > 0 ? "CRITICAL" : counts.warn > 0 ? "WATCH" : "NOMINAL"}
        statusColor={overallColor}
      />
    </View>
  );
}

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  content: { paddingHorizontal: spacing.lg },

  // ─── Hero Card ───
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  heroEyebrow: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: fonts.monoBold,
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: -1.2,
  },
  heroDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: withAlpha("#FFFFFF", 0.15),
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  heroDeltaText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    color: "#FFFFFF",
  },
  heroSparkline: {
    marginBottom: spacing.md,
  },
  heroBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroBreakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroBreakdownLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroBreakdownValue: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  heroBreakdownDivider: {
    width: 1,
    height: 16,
    backgroundColor: withAlpha("#FFFFFF", 0.2),
  },
  heroRingInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroRingPct: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroRingUnit: {
    fontFamily: fonts.monoMedium,
    fontSize: 8,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.5,
    marginTop: 1,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha("#FFFFFF", 0.15),
  },
  heroStatusPill: {
    backgroundColor: withAlpha("#FFFFFF", 0.15),
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroStatusPillText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  heroStatusDetail: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.5,
    flex: 1,
  },

  // ─── Quick log shortcuts ───
  quickLogRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  quickLogTile: { flex: 1, alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, ...cardShadow },
  quickLogIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  quickLogLabel: { fontFamily: fonts.geistMedium, fontSize: 12, color: colors.textPrimary },

  // ─── Left to spend ───
  leftSpendCard: { marginBottom: spacing.sm, gap: spacing.xs },
  leftSpendHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  leftSpendLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6 },
  leftSpendValue: { fontFamily: fonts.monoBold, fontSize: 26, letterSpacing: -0.5 },
  leftSpendMetaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  leftSpendMeta: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textSecondary },

  // ─── Nav Cards ───
  navCardsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  navCard: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    position: "relative",
    ...cardShadow,
  },
  navCardIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  navCardLabel: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  navCardSub: {
    fontFamily: fonts.geistRegular,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  navCardChevron: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
  },

  // ─── PR Banner ───
  prBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.good, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(colors.good, 0.25),
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  prBannerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  prBannerText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.good,
    letterSpacing: 0.8,
  },
  prDetail: {
    flex: 1,
    fontFamily: fonts.geistMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  prCount: {
    backgroundColor: withAlpha(colors.good, 0.15),
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  prCountText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.good,
  },

  // ─── All-clear card ───
  allClearCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  allClearText: {
    fontFamily: fonts.geistRegular,
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },

  // ─── Compact action rows (below the hero action card) ───
  compactActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 11,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  compactActionTitle: {
    fontFamily: fonts.geistMedium,
    fontSize: 13.5,
    color: colors.textPrimary,
    width: 90,
  },
  compactActionDetail: {
    flex: 1,
    fontFamily: fonts.geistRegular,
    fontSize: 12.5,
    color: colors.textTertiary,
  },

  // ─── Telemetry ring pods ───
  telemetryGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ringPod: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    alignItems: "center",
    ...cardShadow,
  },
  ringPodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: spacing.sm,
  },
  ringPodLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9.5,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  ringPodBody: {
    marginVertical: spacing.xs,
  },
  ringPodValue: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  ringPodUnit: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 1,
  },
  ringPodCaption: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  ringPodSpark: {
    marginTop: spacing.xs,
    alignItems: "center",
  },

  // ─── Insight resolve button ───
  resolveButton: { alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: withAlpha(colors.focus, 0.1), borderRadius: radius.sm },
  resolveButtonText: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.focus, letterSpacing: 0.5 },
  inlineDoneButton: { paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: withAlpha(colors.good, 0.1), borderRadius: radius.sm },
  inlineDoneText: { fontFamily: fonts.monoSemiBold, fontSize: 9, color: colors.good, letterSpacing: 0.5 },

  // ─── Goal check-in buttons ───
  checkinRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  checkinButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, paddingVertical: 8 },
  checkinButtonText: { fontFamily: fonts.monoSemiBold, fontSize: 11, color: colors.textInverse, letterSpacing: 0.5 },

  // ─── System strip ───
  systemStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    ...cardShadow,
  },
  systemStripLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  systemStripLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.6 },
  systemStripValue: { fontFamily: fonts.geistMedium, fontSize: 13, color: colors.textPrimary, marginTop: 2 },
  systemStripDot: { width: 10, height: 10, borderRadius: 5 },

  // ─── Capital strip ───
  capitalStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    ...cardShadow,
  },
  capitalItem: {
    flex: 1,
    alignItems: "center",
  },
  capitalLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  capitalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    letterSpacing: -0.5,
  },
  capitalPnl: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    marginTop: 3,
  },
  capitalDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.hairline,
    marginHorizontal: spacing.md,
  },
});
}
