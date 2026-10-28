import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart, BarChart } from "react-native-gifted-charts";
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, PieChart, FileText, Eye, Activity, BrainCircuit, AlertTriangle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useProfile,
  useTransactions,
  usePositions,
  usePortfolioSnapshots,
  useLatestSnapshot,
  useOrders,
  useDailyReports,
  useSignals,
  useSignalPerformance,
  useWatchlist,
  useTransactionAnomalies,
  parseAnomaly,
  monthSpend,
  liveBankBalance,
  byCurrency,
  byField,
  topMovers,
  type FullTransaction,
  type Signal,
} from "@/lib/queries";
import { spendStatus } from "@/lib/pacing";
import { colors, colors as lightColors, radius, spacing, fonts, withAlpha } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";
import {
  SectionLabel,
  ListRow,
  Pill,
  Dot,
  SegmentedControl,
  LoadingState,
  ErrorBanner,
  ScreenHeader,
  Surface,
  AccentCard,
  MetaRow,
  PacingBar,
  AnimatedNumber,
  Ring as ProgressRing,
  HEADER_BAR_HEIGHT,
} from "@/components/ui";

const CHART_WIDTH = 300;
const ALLOC_COLORS = [colors.wealth, colors.focus, colors.trends, colors.kinematic, colors.nutrition, colors.cardio];

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

function fmtMoney(n: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function anomalyDetailText(finding: ReturnType<typeof parseAnomaly>): string {
  if (!finding) return "Review this transaction in your ledger.";
  if (finding.type === "duplicate_charge") {
    return `Possible duplicate on ${finding.dates?.join(" and ") ?? ""} for ${fmtMoney(finding.amount ?? 0)}.`;
  }
  if (finding.type === "subscription_change") {
    const direction = (finding.change_pct ?? 0) >= 0 ? "up" : "down";
    return `Subscription changed ${direction} ${Math.abs(finding.change_pct ?? 0).toFixed(0)}% (${fmtMoney(finding.latest_amount ?? 0)} vs ${fmtMoney(finding.previous_amount ?? 0)}).`;
  }
  if (finding.type === "unusual_amount") {
    return `${fmtMoney(finding.amount ?? 0)} is ${finding.z_score?.toFixed(1)}σ above your ${fmtMoney(finding.avg_amount ?? 0)} average.`;
  }
  return "Review this transaction in your ledger.";
}

export default function CapitalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [view, setView] = useState<"ledger" | "portfolio" | "intel">("ledger");

  const profile = useProfile();
  const transactions = useTransactions(500);
  const positions = usePositions();
  const snapshots = usePortfolioSnapshots(90);
  const latestSnapshot = useLatestSnapshot();
  const orders = useOrders(50);
  const reports = useDailyReports(7);
  const signals = useSignals(30);
  const signalPerf = useSignalPerformance();
  const watchlist = useWatchlist();
  const anomalies = useTransactionAnomalies(10);

  const loading = profile.loading || transactions.loading || positions.loading || snapshots.loading || latestSnapshot.loading;
  const refreshing = profile.refreshing || transactions.refreshing || positions.refreshing;
  const firstError = profile.error || transactions.error || positions.error || snapshots.error || latestSnapshot.error || orders.error;

  const onRefresh = () => {
    profile.refetch();
    transactions.refetch();
    positions.refetch();
    snapshots.refetch();
    latestSnapshot.refetch();
    orders.refetch();
    reports.refetch();
    signals.refetch();
    signalPerf.refetch();
    watchlist.refetch();
    anomalies.refetch();
  };

  const txs = useMemo(() => (transactions.data ?? []) as FullTransaction[], [transactions.data]);

  const now = new Date();
  const nowMs = now.getTime();

  const subscriptions = useMemo(() => {
    const byMerchant = new Map<string, { dates: string[]; amounts: number[]; total: number }>();
    for (const t of txs) {
      if (typeof t.amount !== "number" || t.amount >= 0 || !t.transaction_date) continue;
      const merchant = t.merchant_name?.trim();
      if (!merchant) continue;
      const existing = byMerchant.get(merchant) ?? { dates: [], amounts: [], total: 0 };
      existing.dates.push(t.transaction_date);
      existing.amounts.push(Math.abs(t.amount));
      existing.total += Math.abs(t.amount);
      byMerchant.set(merchant, existing);
    }
    const recurring: { merchant: string; amount: number; frequency: string; lastDate: string; nextDate: string | null; monthlyTotal: number; yearlyTotal: number }[] = [];
    for (const [merchant, data] of byMerchant) {
      if (data.dates.length < 2) continue;
      const sorted = [...data.dates].sort();
      let monthlyGaps = 0;
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1]).getTime();
        const d2 = new Date(sorted[i]).getTime();
        const days = (d2 - d1) / 86400000;
        if (days >= 25 && days <= 35) monthlyGaps++;
      }
      if (monthlyGaps > 0 || data.dates.length >= 3) {
        const avg = data.total / data.amounts.length;
        const freq = monthlyGaps > 0 ? "monthly" : "recurring";
        const lastDate = sorted[sorted.length - 1];
        // Next expected date: last charge + avg gap (in days)
        let nextDate: string | null = null;
        if (monthlyGaps > 0) {
          const next = new Date(lastDate);
          next.setDate(next.getDate() + 30);
          nextDate = next.toISOString().slice(0, 10);
        }
        const spanMonths = Math.max(1, (nowMs - new Date(sorted[0]).getTime()) / (30 * 86400000));
        const monthlyTotal = freq === "monthly" ? avg : (avg * data.amounts.length) / spanMonths;
        recurring.push({
          merchant,
          amount: avg,
          frequency: freq,
          lastDate,
          nextDate,
          monthlyTotal,
          yearlyTotal: monthlyTotal * 12,
        });
      }
    }
    return recurring.sort((a, b) => b.monthlyTotal - a.monthlyTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs]);

  const subscriptionsMonthlyTotal = subscriptions.reduce((a, s) => a + s.monthlyTotal, 0);
  const subscriptionsYearlyTotal = subscriptions.reduce((a, s) => a + s.yearlyTotal, 0);

  const signalsBySymbol = useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const s of signals.data ?? []) {
      if (!s.symbol) continue;
      const list = map.get(s.symbol) ?? [];
      list.push(s);
      map.set(s.symbol, list);
    }
    return map;
  }, [signals.data]);

  if (loading) return <LoadingState label="Loading Capital…" />;

  const balance = profile.data ? liveBankBalance(profile.data.bank_balance, profile.data.bank_balance_updated_at, txs) : null;
  const { income, expenses } = monthSpend(txs);
  const net = income + expenses;
  const pace = spendStatus(expenses, profile.data ?? undefined);

  const categoryTotals = monthSpend(txs).monthTx.reduce<Record<string, number>>((acc, t) => {
    if (typeof t.amount !== "number" || t.amount >= 0) return acc;
    const cat = t.category ?? "Uncategorized";
    acc[cat] = (acc[cat] ?? 0) + Math.abs(t.amount);
    return acc;
  }, {});
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCatSpend = topCategories.length > 0 ? topCategories[0][1] : 0;
  void topCategories; void maxCatSpend; // retained for future use

  const dailySpendMap = new Map<string, number>();
  const since14 = new Date(nowMs - 14 * 86400000).toISOString().slice(0, 10);
  for (const t of txs) {
    if (!t.transaction_date || t.transaction_date < since14) continue;
    if (typeof t.amount !== "number" || t.amount >= 0) continue;
    const day = t.transaction_date.slice(0, 10);
    dailySpendMap.set(day, (dailySpendMap.get(day) ?? 0) + Math.abs(t.amount));
  }
  const dailySpendData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(nowMs - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { value: Number((dailySpendMap.get(d) ?? 0).toFixed(2)) };
  });
  const hasSpendData = dailySpendData.some((d) => d.value > 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = now.getDate() / daysInMonth;
  const budget = profile.data?.base_salary ?? null;
  const spentPct = budget ? Math.min(100, (Math.abs(expenses) / budget) * 100) : null;
  const burnSeverity = spentPct == null ? null : pace?.severity ?? "good";
  const burnColor = burnSeverity === "bad" ? colors.bad : burnSeverity === "warn" ? colors.kinematic : colors.good;

  // ── Budget vs. actual by category ──
  // Default category budgets derived from net income × typical percentages.
  // The user can later override these via a settings row; for now we use
  // sensible defaults so the pacing rings are meaningful on first use.
  const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
    Food: 0.18,
    Shopping: 0.12,
    Entertainment: 0.05,
    Health: 0.04,
    Other: 0.06,
  };
  const categoryBudgets = income > 0
    ? Object.fromEntries(
        Object.entries(DEFAULT_CATEGORY_BUDGETS).map(([cat, pct]) => [cat, income * pct]),
      )
    : {};
  const monthPct = monthFraction * 100;
  const budgetCategories = Array.from(
    new Set([...Object.keys(categoryBudgets), ...Object.keys(categoryTotals)]),
  )
    .map((cat) => {
      const catBudget = categoryBudgets[cat] ?? 0;
      const actual = categoryTotals[cat] ?? 0;
      const pct = catBudget > 0 ? (actual / catBudget) * 100 : actual > 0 ? 100 : 0;
      const severity = pct > 100 ? "over" : pct > monthPct + 10 ? "warn" : "good";
      const ringColor = severity === "over" ? colors.bad : severity === "warn" ? colors.kinematic : colors.good;
      return { cat, budget: catBudget, actual, pct, severity, ringColor };
    })
    .filter((r) => r.actual > 0 || r.budget > 0)
    .sort((a, b) => b.actual - a.actual);

  const targetSavingsRate = profile.data?.target_savings_rate ?? null;
  const actualSavingsRate = income > 0 ? (net / income) * 100 : null;
  const savingsGap = actualSavingsRate != null && targetSavingsRate != null ? actualSavingsRate - targetSavingsRate : null;
  const savingsColor = savingsGap == null ? colors.good : savingsGap >= 0 ? colors.good : savingsGap >= -10 ? colors.kinematic : colors.bad;

  const currencyTotals = byCurrency(positions.data ?? []);
  const assetClassTotals = byField(positions.data ?? [], "asset_class");
  const sectorTotals = byField(positions.data ?? [], "sector");
  const { gainers, losers } = topMovers(positions.data ?? [], 5);
  const snapshotChartData = (snapshots.data ?? []).map((s) => ({ value: s.total_value }));
  const activeRecommendations = (orders.data ?? []).filter((o) => ["proposed", "approved", "sent"].includes(o.status));
  const latest = latestSnapshot.data;
  const riskFlags = latest?.risk_flags ?? [];

  // Net worth
  const portfolioTotal = Object.values(currencyTotals).reduce((a, v) => a + v.value, 0);
  const netWorth = (balance ?? 0) + portfolioTotal;
  const portfolioPct = netWorth > 0 ? (portfolioTotal / netWorth) * 100 : 0;
  const cashPct = netWorth > 0 ? ((balance ?? 0) / netWorth) * 100 : 0;

  const statusLabel = pace?.severity === "bad" ? "OVERRUN" : pace?.severity === "warn" ? "WATCH" : "NOMINAL";
  const statusColor = pace?.severity === "bad" ? colors.bad : pace?.severity === "warn" ? colors.kinematic : colors.good;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
      {firstError ? <ErrorBanner message={firstError} /> : null}

      {/* ─── Hero: Net Worth ─── */}
      <View style={[styles.heroCard, { backgroundColor: colors.wealth }]}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroEyebrow}>NET WORTH</Text>
            <View style={styles.heroStatusPill}>
              <Text style={styles.heroStatusPillText}>{statusLabel}</Text>
            </View>
          </View>
          <AnimatedNumber
            value={netWorth}
            format={(n) => fmtMoney(n)}
            style={styles.heroValue}
          />
          <View style={styles.heroBreakdown}>
            <View style={styles.heroBreakdownItem}>
              <View style={[styles.heroBreakdownIcon, { backgroundColor: withAlpha("#FFFFFF", 0.15) }]}>
                <Wallet size={12} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.heroBreakdownLabel}>CASH</Text>
                <Text style={styles.heroBreakdownValue}>{balance != null ? fmtMoney(balance) : "—"}</Text>
              </View>
            </View>
            <View style={styles.heroBreakdownDivider} />
            <View style={styles.heroBreakdownItem}>
              <View style={[styles.heroBreakdownIcon, { backgroundColor: withAlpha("#FFFFFF", 0.15) }]}>
                <TrendingUp size={12} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.heroBreakdownLabel}>PORTFOLIO</Text>
                <Text style={styles.heroBreakdownValue}>{portfolioTotal > 0 ? fmtMoney(portfolioTotal) : "—"}</Text>
              </View>
            </View>
          </View>
          {/* Allocation bar */}
          {netWorth > 0 ? (
            <View style={styles.allocBar}>
              <PacingBar
                height={8}
                segments={[
                  { value: cashPct, color: withAlpha("#FFFFFF", 0.6) },
                  { value: portfolioPct, color: withAlpha("#FFFFFF", 0.3) },
                ]}
              />
              <View style={styles.allocLegend}>
                <View style={styles.allocLegendItem}>
                  <Dot color={withAlpha("#FFFFFF", 0.6)} size={7} />
                  <Text style={styles.allocLegendText}>{Math.round(cashPct)}% cash</Text>
                </View>
                <View style={styles.allocLegendItem}>
                  <Dot color={withAlpha("#FFFFFF", 0.3)} size={7} />
                  <Text style={styles.allocLegendText}>{Math.round(portfolioPct)}% portfolio</Text>
                </View>
              </View>
            </View>
          ) : null}
      </View>

      <SegmentedControl
        options={[
          { key: "ledger", label: "Cash" },
          { key: "portfolio", label: "Portfolio" },
          { key: "intel", label: "Intel" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "ledger" ? (
        <>
          {/* ─── Monthly summary card ─── */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryLabel}>MONTHLY FLOW</Text>
              <Text style={styles.summaryMonth}>{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIcon, { backgroundColor: withAlpha(colors.good, 0.1) }]}>
                  <ArrowUpRight size={14} color={colors.good} />
                </View>
                <Text style={styles.summaryItemLabel}>INCOME</Text>
                <Text style={[styles.summaryItemValue, { color: colors.good }]}>{fmtMoney(income)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIcon, { backgroundColor: withAlpha(colors.bad, 0.1) }]}>
                  <ArrowDownRight size={14} color={colors.bad} />
                </View>
                <Text style={styles.summaryItemLabel}>EXPENSES</Text>
                <Text style={[styles.summaryItemValue, { color: colors.bad }]}>{fmtMoney(Math.abs(expenses))}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIcon, { backgroundColor: withAlpha(net >= 0 ? colors.good : colors.bad, 0.1) }]}>
                  <PieChart size={14} color={net >= 0 ? colors.good : colors.bad} />
                </View>
                <Text style={styles.summaryItemLabel}>NET</Text>
                <Text style={[styles.summaryItemValue, { color: net >= 0 ? colors.good : colors.bad }]}>
                  {net >= 0 ? "+" : ""}{fmtMoney(net)}
                </Text>
              </View>
            </View>
          </View>

          {/* ─── Budget pacing ─── */}
          {spentPct != null ? (
            <AccentCard
              tier={burnSeverity === "bad" ? "critical" : "standard"}
              color={burnColor}
              badgeLabel={(burnSeverity ?? "good").toUpperCase()}
              metaRight={`CAP ${fmtMoney(budget as number)}`}
              title={`${spentPct.toFixed(0)}% of monthly budget spent`}
              detail={`Day ${now.getDate()}/${daysInMonth} · ${(monthFraction * 100).toFixed(0)}% of month elapsed`}
              footer={
                <View style={{ marginTop: spacing.sm }}>
                  <PacingBar segments={[{ value: spentPct, color: burnColor }]} />
                </View>
              }
            />
          ) : null}

          {/* ─── Savings rate ─── */}
          {actualSavingsRate != null && targetSavingsRate != null ? (
            <AccentCard
              tier={savingsGap != null && savingsGap < -10 ? "critical" : "standard"}
              color={savingsColor}
              badgeLabel={savingsGap != null && savingsGap >= 0 ? "ON TARGET" : "BEHIND"}
              metaRight={`TGT ${targetSavingsRate.toFixed(1)}%`}
              title={`${actualSavingsRate.toFixed(1)}% savings rate`}
              detail="Net income saved this month, vs. your target rate"
              footer={
                <View style={{ marginTop: spacing.sm }}>
                  <PacingBar segments={[{ value: Math.max(0, Math.min(100, actualSavingsRate)), color: savingsColor }]} />
                </View>
              }
            />
          ) : null}

          {/* ─── Daily spend chart ─── */}
          {hasSpendData ? (
            <>
              <SectionLabel title="Daily spend (14d)" />
              <Surface style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Text style={styles.chartTitle}>Last 14 days</Text>
                  <Text style={styles.chartRange}>{fmtMoney(dailySpendData.reduce((a, d) => a + d.value, 0))} total</Text>
                </View>
                <BarChart
                  data={dailySpendData}
                  width={CHART_WIDTH}
                  height={120}
                  barWidth={12}
                  spacing={10}
                  frontColor={colors.bad}
                  hideYAxisText
                  hideRules
                  xAxisColor="transparent"
                  yAxisColor="transparent"
                  initialSpacing={0}
                />
              </Surface>
            </>
          ) : null}

          {/* ─── Transaction anomalies ─── */}
          {anomalies.data && anomalies.data.length > 0 ? (
            <>
              <SectionLabel title="Anomalies" subtitle={`${anomalies.data.length} flagged`} />
              {anomalies.data.slice(0, 3).map((a) => {
                const finding = parseAnomaly(a.action_item);
                return (
                  <AccentCard
                    key={a.id}
                    tier={finding?.severity === "high" ? "critical" : "standard"}
                    color={finding?.severity === "high" ? colors.bad : colors.kinematic}
                    badgeLabel={finding?.type?.replace("_", " ")?.toUpperCase() ?? "ANOMALY"}
                    metaRight={fmtDate(a.generated_at)}
                    title={finding?.merchant ?? "Transaction anomaly"}
                    detail={anomalyDetailText(finding)}
                  />
                );
              })}
            </>
          ) : null}

          {/* ─── Recurring spend ─── */}
          {subscriptions.length > 0 ? (
            <>
              <SectionLabel title="Recurring spend" subtitle={`${subscriptions.length} merchant${subscriptions.length === 1 ? "" : "s"}`} />
              <Surface style={styles.subsSummaryCard}>
                <View style={styles.subsSummaryItem}>
                  <Text style={styles.subsSummaryLabel}>MONTHLY</Text>
                  <Text style={[styles.subsSummaryValue, { color: colors.bad }]}>{fmtMoney(subscriptionsMonthlyTotal)}</Text>
                </View>
                <View style={styles.subsSummaryDivider} />
                <View style={styles.subsSummaryItem}>
                  <Text style={styles.subsSummaryLabel}>YEARLY</Text>
                  <Text style={[styles.subsSummaryValue, { color: colors.bad }]}>{fmtMoney(subscriptionsYearlyTotal)}</Text>
                </View>
                <View style={styles.subsSummaryDivider} />
                <View style={styles.subsSummaryItem}>
                  <Text style={styles.subsSummaryLabel}>MERCHANTS</Text>
                  <Text style={styles.subsSummaryValue}>{subscriptions.length}</Text>
                </View>
              </Surface>
              <Surface style={{ paddingVertical: 0 }}>
                {subscriptions.slice(0, 6).map((s, i) => (
                  <View key={s.merchant}>
                    <ListRow
                      title={s.merchant}
                      subtitle={s.nextDate ? `Next ~${fmtDate(s.nextDate)} · ${s.frequency}` : s.frequency}
                      trailing={fmtMoney(s.amount)}
                      trailingColor={colors.textPrimary}
                    />
                    {i < Math.min(subscriptions.length, 6) - 1 ? <View style={styles.rowDivider} /> : null}
                  </View>
                ))}
              </Surface>
            </>
          ) : null}

          {/* ─── Budget vs. actual by category ─── */}
          <SectionLabel title="Budget vs. actual" subtitle={`${now.toLocaleDateString(undefined, { month: "short" })} · Day ${now.getDate()}/${daysInMonth}`} />
          {budgetCategories.length === 0 ? (
            <Surface style={styles.emptyCard}>
              <Wallet size={28} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No spending logged this month</Text>
              <Text style={styles.emptyBody}>Upload a bank statement via Ingest to start tracking your budget pacing.</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push("/(tabs)/chat");
                }}
                style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.emptyCtaText}>Upload statement</Text>
              </Pressable>
            </Surface>
          ) : (
            <Surface style={{ paddingVertical: 0 }}>
              {budgetCategories.map((row, i) => {
                const remaining = row.budget - row.actual;
                return (
                  <View key={row.cat}>
                    <View style={styles.catRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
                        <ProgressRing
                          progress={Math.min(100, row.pct)}
                          size={42}
                          strokeWidth={4}
                          color={row.ringColor}
                        >
                          <Text style={[styles.catRingPct, { color: row.ringColor }]}>{Math.round(row.pct)}</Text>
                        </ProgressRing>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.catLabel}>{row.cat}</Text>
                          <Text style={styles.catSub}>
                            {fmtMoney(row.actual)} / {fmtMoney(row.budget)}
                          </Text>
                          <View style={styles.catBarWrap}>
                            <PacingBar
                              height={5}
                              segments={[{ value: Math.min(100, row.pct), color: row.ringColor }]}
                            />
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.catValue, { color: row.ringColor }]}>
                          {remaining >= 0 ? "+" : ""}{fmtMoney(remaining)}
                        </Text>
                        <Text style={styles.catPaceLabel}>
                          {row.severity === "over"
                            ? "OVER"
                            : row.severity === "warn"
                              ? "PACING UP"
                              : "ON TRACK"}
                        </Text>
                      </View>
                    </View>
                    {i < budgetCategories.length - 1 ? <View style={styles.rowDivider} /> : null}
                  </View>
                );
              })}
            </Surface>
          )}

          {/* ─── Ledger stream ─── */}
          <SectionLabel title="Ledger stream" subtitle="Latest 15" />
          <Surface style={{ paddingVertical: 0 }}>
            {txs.slice(0, 15).map((t, i) => (
              <View key={i}>
                <ListRow
                  title={t.merchant_name ?? t.category ?? "Transaction"}
                  subtitle={t.transaction_date ? fmtDate(t.transaction_date) : undefined}
                  trailing={fmtMoney(typeof t.amount === "number" ? t.amount : 0)}
                  trailingColor={(t.amount as number) >= 0 ? colors.good : colors.textPrimary}
                />
                {i < Math.min(txs.length, 15) - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
          </Surface>
        </>
      ) : view === "portfolio" ? (
        <>
          {/* ─── Portfolio view ─── */}
          {Object.keys(currencyTotals).length === 0 ? (
            <Surface style={styles.emptyCard}>
              <PieChart size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No active portfolios</Text>
              <Text style={styles.emptyBody}>Log your first investment via Ingest to start tracking.</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push("/(tabs)/chat");
                }}
                style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.emptyCtaText}>Log a trade</Text>
              </Pressable>
            </Surface>
          ) : (
            <View style={styles.portfolioCards}>
              {Object.entries(currencyTotals).map(([currency, v]) => {
                const count = positions.data?.filter((p) => p.currency === currency).length ?? 0;
                return (
                  <View key={currency} style={styles.portfolioCard}>
                    <View style={styles.portfolioHeader}>
                      <Text style={styles.portfolioLabel}>{currency} PORTFOLIO</Text>
                      <Pill label={v.pnl >= 0 ? "UP" : "DOWN"} color={v.pnl >= 0 ? colors.good : colors.bad} />
                    </View>
                    <Text style={styles.portfolioValue}>{fmtMoney(v.value, currency)}</Text>
                    <View style={styles.portfolioStats}>
                      <View style={styles.portfolioStat}>
                        <Text style={styles.portfolioStatLabel}>P&L</Text>
                        <Text style={[styles.portfolioStatValue, { color: v.pnl >= 0 ? colors.good : colors.bad }]}>
                          {v.pnl >= 0 ? "+" : ""}{fmtMoney(v.pnl, currency)}
                        </Text>
                      </View>
                      <View style={styles.portfolioStat}>
                        <Text style={styles.portfolioStatLabel}>POSITIONS</Text>
                        <Text style={styles.portfolioStatValue}>{count}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ─── Portfolio summary ─── */}
          {Object.keys(currencyTotals).length > 0 && (
            <Surface style={styles.portfolioSummaryGrid}>
              {(() => {
                const totalValue = Object.values(currencyTotals).reduce((a, v) => a + v.value, 0);
                const totalPnl = Object.values(currencyTotals).reduce((a, v) => a + v.pnl, 0);
                const cash = latest?.cash ?? 0;
                const invested = totalValue - cash;
                const items = [
                  { label: "TOTAL VALUE", value: fmtMoney(totalValue) },
                  { label: "TOTAL P&L", value: `${totalPnl >= 0 ? "+" : ""}${fmtMoney(totalPnl)}`, color: totalPnl >= 0 ? colors.good : colors.bad },
                  { label: "CASH", value: fmtMoney(cash) },
                  { label: "INVESTED", value: fmtMoney(invested) },
                  { label: "POSITIONS", value: String(positions.data?.length ?? 0) },
                  { label: "CURRENCIES", value: String(Object.keys(currencyTotals).length) },
                ];
                return items.map((item, i) => (
                  <View key={i} style={styles.portfolioSummaryItem}>
                    <Text style={styles.portfolioSummaryLabel}>{item.label}</Text>
                    <Text style={[styles.portfolioSummaryValue, { color: item.color ?? colors.textPrimary }]}>{item.value}</Text>
                  </View>
                ));
              })()}
            </Surface>
          )}

          {/* ─── Asset class allocation ─── */}
          {Object.keys(assetClassTotals).length > 0 && (
            <>
              <SectionLabel title="Asset class allocation" />
              <Surface style={styles.allocCard}>
                <PacingBar
                  height={10}
                  segments={Object.entries(assetClassTotals).map(([key, v], i) => ({
                    value: (v.value / Object.values(assetClassTotals).reduce((a, x) => a + x.value, 0)) * 100,
                    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
                  }))}
                />
                <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                  {Object.entries(assetClassTotals).map(([key, v], i) => {
                    const total = Object.values(assetClassTotals).reduce((a, x) => a + x.value, 0) || 1;
                    const pct = (v.value / total) * 100;
                    return (
                      <ListRow
                        key={key}
                        icon={<Dot color={ALLOC_COLORS[i % ALLOC_COLORS.length]} size={10} />}
                        title={key.charAt(0).toUpperCase() + key.slice(1)}
                        subtitle={`${pct.toFixed(1)}% weight`}
                        trailing={fmtMoney(v.value)}
                      />
                    );
                  })}
                </View>
              </Surface>
            </>
          )}

          {/* ─── Sector allocation ─── */}
          {Object.keys(sectorTotals).length > 0 && !Object.keys(sectorTotals).every((k) => k === "Unknown") && (
            <>
              <SectionLabel title="Sector allocation" />
              <Surface style={styles.allocCard}>
                <PacingBar
                  height={10}
                  segments={Object.entries(sectorTotals).map(([key, v], i) => ({
                    value: (v.value / Object.values(sectorTotals).reduce((a, x) => a + x.value, 0)) * 100,
                    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
                  }))}
                />
                <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                  {Object.entries(sectorTotals).map(([key, v], i) => {
                    const total = Object.values(sectorTotals).reduce((a, x) => a + x.value, 0) || 1;
                    const pct = (v.value / total) * 100;
                    return (
                      <ListRow
                        key={key}
                        icon={<Dot color={ALLOC_COLORS[i % ALLOC_COLORS.length]} size={10} />}
                        title={key}
                        subtitle={`${pct.toFixed(1)}% weight`}
                        trailing={fmtMoney(v.value)}
                      />
                    );
                  })}
                </View>
              </Surface>
            </>
          )}

          {/* ─── Top movers ─── */}
          {(gainers.length > 0 || losers.length > 0) && (
            <>
              <SectionLabel title="Top movers" subtitle="Best and worst unrealized returns" />
              <View style={styles.moverRow}>
                <Surface style={[styles.moverCard, { flex: 1 }]}>
                  <Text style={styles.moverTitle}>GAINERS</Text>
                  {gainers.slice(0, 3).map((p, i) => (
                    <View key={p.symbol} style={{ marginTop: i === 0 ? 0 : spacing.sm }}>
                      <ListRow
                        title={p.symbol}
                        subtitle={fmtMoney(p.position_value, p.currency)}
                        trailing={`+${(p.pct * 100).toFixed(1)}%`}
                        trailingColor={colors.good}
                      />
                    </View>
                  ))}
                </Surface>
                <Surface style={[styles.moverCard, { flex: 1 }]}>
                  <Text style={[styles.moverTitle, { color: colors.bad }]}>LOSERS</Text>
                  {losers.slice(0, 3).map((p, i) => (
                    <View key={p.symbol} style={{ marginTop: i === 0 ? 0 : spacing.sm }}>
                      <ListRow
                        title={p.symbol}
                        subtitle={fmtMoney(p.position_value, p.currency)}
                        trailing={`${(p.pct * 100).toFixed(1)}%`}
                        trailingColor={colors.bad}
                      />
                    </View>
                  ))}
                </Surface>
              </View>
            </>
          )}

          {/* ─── Risk flags ─── */}
          {riskFlags.length > 0 && (
            <>
              <SectionLabel title="Risk flags" subtitle="From latest advisor snapshot" />
              <Surface style={styles.riskCard}>
                {riskFlags.map((flag, i) => (
                  <View key={i} style={styles.riskRow}>
                    <AlertTriangle size={14} color={colors.bad} />
                    <Text style={styles.riskText}>{flag}</Text>
                  </View>
                ))}
              </Surface>
            </>
          )}

          {/* ─── Portfolio chart ─── */}
          {snapshotChartData.length >= 2 ? (
            <>
              <SectionLabel title="Portfolio value (90d)" />
              <Surface style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <TrendingUp size={14} color={colors.wealth} />
                  <Text style={styles.chartTitle}>90-day trend</Text>
                </View>
                <LineChart
                  data={snapshotChartData}
                  width={CHART_WIDTH}
                  height={130}
                  color={colors.wealth}
                  thickness={2}
                  areaChart
                  startFillColor={colors.wealth}
                  startOpacity={0.15}
                  endOpacity={0}
                  hideYAxisText
                  hideRules
                  xAxisColor="transparent"
                  yAxisColor="transparent"
                  initialSpacing={0}
                  dataPointsColor={colors.wealth}
                />
              </Surface>
            </>
          ) : null}

          {/* ─── Recommendations ─── */}
          <SectionLabel title="Recommendations" subtitle="Advisory only — the app never executes trades" />
          {activeRecommendations.length === 0 ? (
            <Surface style={styles.emptyCard}>
              <Text style={styles.emptyText}>No advisory signals generated yet.</Text>
            </Surface>
          ) : (
            activeRecommendations.map((o) => {
              const isReduce = o.action === "SELL" || o.action === "TRIM";
              const color = isReduce ? colors.bad : colors.good;
              const currency = o.currency ?? "EUR";
              return (
                <AccentCard
                  key={o.id}
                  tier={isReduce ? "critical" : "standard"}
                  color={color}
                  badgeLabel={o.action}
                  metaRight={o.confidence != null ? `${(o.confidence <= 1 ? o.confidence * 100 : o.confidence).toFixed(0)}% CONF` : undefined}
                  title={`${o.quantity} ${o.symbol}`}
                  detail={o.rationale ?? undefined}
                  footer={
                    <View style={{ marginTop: spacing.sm }}>
                      {o.limit_price != null ? <MetaRow label="Limit" value={fmtMoney(o.limit_price, currency)} /> : null}
                      {o.stop_price != null ? <MetaRow label="Stop" value={fmtMoney(o.stop_price, currency)} /> : null}
                      {o.tif ? <MetaRow label="TIF" value={o.tif} /> : null}
                      <Text style={styles.hint}>
                        {`Tell Ingest when you act on this (e.g. "${isReduce ? "sold" : "bought"} ${o.quantity} ${o.symbol} at …") to update holdings.`}
                      </Text>
                    </View>
                  }
                />
              );
            })
          )}

          {/* ─── Allocated ledgers ─── */}
          <SectionLabel title="Allocated ledgers" subtitle="Unblended valuations — asset weight per currency" />
          {(positions.data?.length ?? 0) === 0 ? (
            <Surface style={styles.emptyCard}>
              <Text style={styles.emptyText}>No positions yet.</Text>
            </Surface>
          ) : (
            Object.entries(currencyTotals).map(([currency, totals]) => {
              const currencyPositions = [...positions.data!]
                .filter((p) => p.currency === currency)
                .sort((a, b) => b.position_value - a.position_value);
              return (
                <Surface key={currency} style={styles.allocCard}>
                  <View style={styles.allocHeader}>
                    <Text style={styles.allocLabel}>{currency} PORTFOLIO</Text>
                    <Text style={[styles.allocPnl, { color: totals.pnl >= 0 ? colors.good : colors.bad }]}>
                      {totals.pnl >= 0 ? "+" : ""}{fmtMoney(totals.pnl, currency)}
                    </Text>
                  </View>

                  <View style={styles.allocBarHeader}>
                    <Text style={styles.allocBarHeaderText}>ASSET WEIGHT DISTRIBUTION</Text>
                    <Text style={styles.allocBarHeaderText}>
                      {currencyPositions.length} position{currencyPositions.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <PacingBar
                    height={8}
                    segments={currencyPositions.map((p, i) => ({
                      value: totals.value > 0 ? (p.position_value / totals.value) * 100 : 0,
                      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
                    }))}
                  />

                  <View style={{ marginTop: spacing.sm }}>
                    {currencyPositions.map((p, i) => {
                      const weight = totals.value > 0 ? (p.position_value / totals.value) * 100 : 0;
                      return (
                        <ListRow
                          key={p.symbol}
                          icon={<Dot color={ALLOC_COLORS[i % ALLOC_COLORS.length]} size={10} />}
                          title={p.symbol}
                          subtitle={`${weight.toFixed(1)}% weight`}
                          trailing={fmtMoney(p.position_value, currency)}
                          trailingSubtitle={`${p.unrealized_pnl >= 0 ? "+" : ""}${fmtMoney(p.unrealized_pnl, currency)}`}
                        />
                      );
                    })}
                  </View>
                </Surface>
              );
            })
          )}
        </>
      ) : (
        <>
          {/* ─── Intelligence view ─── */}
          <SectionLabel title="Market regime" subtitle="Latest advisor assessment" />
          {reports.data && reports.data.length > 0 ? (
            <AccentCard
              tier="standard"
              color={colors.trends}
              badgeLabel="REGIME"
              metaRight={reports.data[0].report_date}
              title={reports.data[0].title ?? `Market report ${reports.data[0].report_date}`}
              detail={reports.data[0].json_content && typeof reports.data[0].json_content === "object" && "summary" in reports.data[0].json_content ? String(reports.data[0].json_content.summary) : "Daily market regime and portfolio assessment."}
              footer={
                <View style={{ marginTop: spacing.sm, gap: 2 }}>
                  {reports.data[0].market_regime ? <MetaRow label="Regime" value={reports.data[0].market_regime} /> : null}
                  {reports.data[0].vix_level != null ? <MetaRow label="VIX" value={reports.data[0].vix_level.toFixed(1)} /> : null}
                  {reports.data[0].portfolio_value != null ? <MetaRow label="Portfolio" value={fmtMoney(reports.data[0].portfolio_value)} /> : null}
                </View>
              }
              onPress={() => router.push(`/(app)/report/${reports.data![0].id}`)}
            />
          ) : (
            <Surface style={styles.emptyCard}>
              <FileText size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No daily reports yet</Text>
              <Text style={styles.emptyBody}>The market advisor runs on weekdays after the IBKR sync.</Text>
            </Surface>
          )}

          {reports.data && reports.data.length > 1 && (
            <>
              <SectionLabel title="Report archive" subtitle={`${reports.data.length - 1} previous briefings`} />
              <Surface style={{ paddingVertical: 0 }}>
                {reports.data.slice(1, 6).map((r, i) => (
                  <View key={r.id}>
                    <ListRow
                      icon={<FileText size={14} color={colors.trends} />}
                      title={r.title ?? `Report ${r.report_date}`}
                      subtitle={r.market_regime ?? "Daily briefing"}
                      trailing={r.report_date}
                      trailingSubtitle={r.vix_level != null ? `VIX ${r.vix_level.toFixed(1)}` : undefined}
                      onPress={() => router.push(`/(app)/report/${r.id}`)}
                    />
                    {i < Math.min(reports.data!.length - 1, 5) - 1 ? <View style={styles.rowDivider} /> : null}
                  </View>
                ))}
              </Surface>
            </>
          )}

          <SectionLabel title="Live signals" subtitle={`${signals.data?.length ?? 0} recent`} />
          {signals.data && signals.data.length > 0 ? (
            Array.from(signalsBySymbol.entries()).slice(0, 6).map(([symbol, list]) => {
              const latestSignal = list[0];
              const isReduce = latestSignal.action === "SELL" || latestSignal.action === "TRIM";
              const color = isReduce ? colors.bad : latestSignal.action === "BUY" || latestSignal.action === "ADD" ? colors.good : colors.trends;
              return (
                <AccentCard
                  key={symbol}
                  tier={isReduce ? "critical" : "standard"}
                  color={color}
                  badgeLabel={(latestSignal.action ?? "HOLD").toUpperCase()}
                  metaRight={`${list.length} signal${list.length === 1 ? "" : "s"}`}
                  title={symbol}
                  detail={latestSignal.reasoning ?? `${latestSignal.signal_type ?? "Signal"} generated by the advisor swarm.`}
                  footer={
                    <View style={{ marginTop: spacing.sm, gap: 2 }}>
                      {latestSignal.confidence != null ? <MetaRow label="Confidence" value={`${(latestSignal.confidence <= 1 ? latestSignal.confidence * 100 : latestSignal.confidence).toFixed(0)}%`} /> : null}
                      {latestSignal.price_target != null ? <MetaRow label="Target" value={fmtMoney(latestSignal.price_target)} /> : null}
                      {latestSignal.stop_loss != null ? <MetaRow label="Stop" value={fmtMoney(latestSignal.stop_loss)} /> : null}
                    </View>
                  }
                />
              );
            })
          ) : (
            <Surface style={styles.emptyCard}>
              <BrainCircuit size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No active signals</Text>
              <Text style={styles.emptyBody}>The advisor swarm proposes actions on weekdays after market close.</Text>
            </Surface>
          )}

          <SectionLabel title="Signal performance" subtitle="Historical win rate per action" />
          {signalPerf.data && signalPerf.data.length > 0 ? (
            <Surface style={{ paddingVertical: 0 }}>
              {signalPerf.data.slice(0, 6).map((s, i) => {
                const total = (s.total_signals ?? 0);
                const wins = (s.wins ?? 0);
                const rate = (s.win_rate ?? 0) * 100;
                return (
                  <View key={`${s.symbol}-${s.action}-${i}`}>
                    <ListRow
                      icon={<Activity size={14} color={rate >= 50 ? colors.good : colors.bad} />}
                      title={`${s.symbol}`}
                      subtitle={`${s.action} · ${total} signal${total === 1 ? "" : "s"}`}
                      trailing={`${rate.toFixed(0)}%`}
                      trailingSubtitle={`${wins}W / ${total - wins}L`}
                      trailingColor={rate >= 50 ? colors.good : colors.bad}
                    />
                    {i < Math.min(signalPerf.data!.length, 6) - 1 ? <View style={styles.rowDivider} /> : null}
                  </View>
                );
              })}
            </Surface>
          ) : (
            <Surface style={styles.emptyCard}>
              <Activity size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No graded signals yet</Text>
              <Text style={styles.emptyBody}>Signals are graded after 5 market days and rolled into performance stats.</Text>
            </Surface>
          )}

          <SectionLabel title="Candidate radar" subtitle="Watchlist candidates by conviction" />
          {watchlist.data && watchlist.data.length > 0 ? (
            watchlist.data.slice(0, 6).map((w) => {
              const color = w.in_portfolio ? colors.good : w.interest_state === "convinced" ? colors.trends : colors.textTertiary;
              return (
                <AccentCard
                  key={w.id}
                  tier={w.in_portfolio ? "standard" : "critical"}
                  color={color}
                  badgeLabel={(w.interest_state ?? "scouting").toUpperCase()}
                  metaRight={w.in_portfolio ? "HELD" : `${Math.round((w.conviction_score ?? 0) * 100)}%`}
                  title={w.symbol}
                  detail={w.thesis ?? w.category ?? "Scout candidate under evaluation."}
                  footer={
                    <View style={{ marginTop: spacing.sm, gap: 2 }}>
                      {w.last_signal_action ? (
                        <MetaRow label="Latest signal" value={`${w.last_signal_action} ${w.last_signal_confidence != null ? `(${(w.last_signal_confidence <= 1 ? w.last_signal_confidence * 100 : w.last_signal_confidence).toFixed(0)}%)` : ""}`} />
                      ) : null}
                      {w.signal_count ? <MetaRow label="Signals" value={String(w.signal_count)} /> : null}
                    </View>
                  }
                />
              );
            })
          ) : (
            <Surface style={styles.emptyCard}>
              <Eye size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Radar empty</Text>
              <Text style={styles.emptyBody}>The Sunday scout persona proposes 1-5 new watchlist candidates weekly.</Text>
            </Surface>
          )}
        </>
      )}
      </ScrollView>
      <ScreenHeader title="Capital" subtitle="Cash + portfolio — no FX conversion" statusLabel={statusLabel} statusColor={statusColor} />
    </View>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },

  // ─── Hero card ───
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  heroEyebrow: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 1,
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
  heroValue: {
    fontFamily: fonts.monoBold,
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: -1.2,
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
    gap: 8,
  },
  heroBreakdownIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBreakdownLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.6,
  },
  heroBreakdownValue: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  heroBreakdownDivider: {
    width: 1,
    height: 28,
    backgroundColor: withAlpha("#FFFFFF", 0.2),
  },
  allocBar: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha("#FFFFFF", 0.15) },
  allocLegend: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  allocLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  allocLegendText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: withAlpha("#FFFFFF", 0.6),
    letterSpacing: 0.4,
  },

  // ─── Monthly summary card ───
  summaryCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    ...cardShadow,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  summaryLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  summaryMonth: {
    fontFamily: fonts.geistMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryItemLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  summaryItemValue: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    letterSpacing: -0.3,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.hairline,
  },

  // ─── Portfolio summary ───
  portfolioSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  portfolioSummaryItem: {
    width: "30%",
    flexGrow: 1,
    alignItems: "center",
    gap: 4,
  },
  portfolioSummaryLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  portfolioSummaryValue: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },

  // ─── Movers ───
  moverRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  moverCard: {
    padding: spacing.md,
  },
  moverTitle: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.good,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  // ─── Risk flags ───
  riskCard: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  riskText: {
    flex: 1,
    fontFamily: fonts.geistRegular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },

  // ─── Chart cards ───
  chartCard: { marginBottom: spacing.sm, ...cardShadow },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  chartTitle: {
    fontFamily: fonts.geistMedium,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  chartRange: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },

  // ─── Category rows ───
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  catLabel: {
    fontFamily: fonts.geistMedium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  catSub: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  catBarWrap: { width: 120 },
  catValue: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  catRingPct: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
  },
  catPaceLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ─── Subscriptions summary ───
  subsSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  subsSummaryItem: { flex: 1, alignItems: "center" },
  subsSummaryLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subsSummaryValue: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  subsSummaryDivider: { width: 1, height: 28, backgroundColor: colors.hairline },

  // ─── Portfolio cards ───
  portfolioCards: { marginTop: spacing.lg, gap: spacing.sm },
  portfolioCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    ...cardShadow,
  },
  portfolioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  portfolioLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  portfolioValue: {
    fontFamily: fonts.monoBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: spacing.md,
  },
  portfolioStats: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  portfolioStat: { gap: 3 },
  portfolioStatLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  portfolioStatValue: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },

  // ─── Alloc card ───
  allocCard: { marginBottom: spacing.sm, ...cardShadow },
  allocHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  allocLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  allocPnl: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 12,
  },
  allocBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  allocBarHeaderText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  // ─── Empty states ───
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.geistMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  emptyBody: {
    fontFamily: fonts.geistRegular,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyText: {
    fontFamily: fonts.geistRegular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  emptyCta: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: withAlpha(colors.focus, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.focus, 0.3),
  },
  emptyCtaText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 12,
    color: colors.focus,
  },

  // ─── Row dividers ───
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: spacing.lg + 32 + spacing.md,
  },

  hint: { fontSize: 11, color: colors.textTertiary, fontStyle: "italic", marginTop: spacing.xs },
});
}
