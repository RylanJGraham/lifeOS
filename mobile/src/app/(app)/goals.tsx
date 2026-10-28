import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput, Pressable, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SendHorizonal, BrainCircuit, Gauge, Calendar, Check, ChevronDown, Flag, Wallet } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { sendGoalsChat } from "@/lib/api";
import { useTransactions } from "@/lib/queries";
import { colors, radius, spacing, fonts, type, withAlpha } from "@/theme";
import { Surface, SectionLabel, LoadingState, EmptyState, Pill, Ring, ScreenHeader, AccentCard, HEADER_BAR_HEIGHT } from "@/components/ui";

interface Goal {
  id: string;
  title: string;
  category: "financial" | "habit" | "personal";
  status: "active" | "achieved" | "abandoned";
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  deadline: string | null;
  priority: number;
  created_at: string;
  updated_at: string | null;
}

const HISTORY_KEY = "lifeos_goals_chat_history";
const CATEGORY_COLOR: Record<Goal["category"], string> = { financial: colors.wealth, habit: colors.kinematic, personal: colors.focus };
const CATEGORIES: Goal["category"][] = ["financial", "habit", "personal"];
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface Pace {
  label: "Ahead" | "On track" | "Behind";
  color: string;
  text: string;
}

function paceOf(goal: Goal): Pace | null {
  if (!goal.deadline || !goal.target_value || goal.current_value == null) return null;
  const created = new Date(goal.created_at).getTime();
  const deadline = new Date(goal.deadline).getTime();
  const now = Date.now();
  if (deadline <= created) return null;
  const elapsedFraction = Math.min(1, Math.max(0, (now - created) / (deadline - created)));
  const expectedPct = elapsedFraction * 100;
  const actualPct = Math.min(999, (goal.current_value / goal.target_value) * 100);
  const diff = actualPct - expectedPct;
  if (diff > 5) return { label: "Ahead", color: colors.good, text: `Ahead +${diff.toFixed(0)}% vs timeline` };
  if (diff < -5) return { label: "Behind", color: colors.bad, text: `Behind ${diff.toFixed(0)}% pace` };
  return { label: "On track", color: colors.warn, text: `On track · pace ${actualPct.toFixed(0)}%` };
}

// Average unit/week run-rate computed from real created_at/current_value —
// no fabricated projection, just elapsed-time division.
function runRateOf(goal: Goal): string | null {
  if (!goal.unit || goal.current_value == null || goal.current_value <= 0) return null;
  const elapsedWeeks = (Date.now() - new Date(goal.created_at).getTime()) / MS_PER_WEEK;
  if (elapsedWeeks < 0.5) return null;
  const rate = goal.current_value / elapsedWeeks;
  return `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} ${goal.unit}/wk avg`;
}

function deadlineOf(goal: Goal): string | null {
  if (!goal.deadline) return null;
  const deadline = new Date(goal.deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / MS_PER_DAY);
  const dateLabel = deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return daysLeft >= 0 ? `${dateLabel} (${daysLeft}d left)` : `${dateLabel} (overdue)`;
}

interface FullTransaction {
  amount: number;
  transaction_date: string;
  merchant_name?: string | null;
}

function monthlyFreeFunds(txs: FullTransaction[]): { income: number; recurring: number; free: number; breakdown: { merchant: string; amount: number }[] } {
  const thisMonth = txs.filter((t) => t.transaction_date?.startsWith(new Date().toISOString().slice(0, 7)));
  const income = thisMonth.reduce((a, t) => a + (typeof t.amount === "number" ? Math.max(t.amount, 0) : 0), 0);
  const byMerchant = new Map<string, { amounts: number[]; total: number }>();
  for (const t of thisMonth) {
    if (typeof t.amount !== "number" || t.amount >= 0 || !t.transaction_date) continue;
    const merchant = (t.merchant_name ?? "Unknown").trim();
    if (!merchant) continue;
    const existing = byMerchant.get(merchant) ?? { amounts: [], total: 0 };
    existing.amounts.push(Math.abs(t.amount));
    existing.total += Math.abs(t.amount);
    byMerchant.set(merchant, existing);
  }
  const recurring: { merchant: string; amount: number }[] = [];
  for (const [merchant, data] of byMerchant) {
    if (data.amounts.length < 2) continue;
    const sortedDates = thisMonth
      .filter((t) => (t.merchant_name ?? "Unknown").trim() === merchant)
      .map((t) => t.transaction_date)
      .sort();
    let monthlyGaps = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const d1 = new Date(sortedDates[i - 1]).getTime();
      const d2 = new Date(sortedDates[i]).getTime();
      const days = (d2 - d1) / 86400000;
      if (days >= 25 && days <= 35) monthlyGaps++;
    }
    if (monthlyGaps > 0 || data.amounts.length >= 3) {
      recurring.push({ merchant, amount: data.total / data.amounts.length });
    }
  }
  const recurringTotal = recurring.reduce((a, r) => a + r.amount, 0);
  return { income, recurring: recurringTotal, free: income - recurringTotal, breakdown: recurring.sort((a, b) => b.amount - a.amount) };
}

function MetaBarItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.metaBarItem}>
      {icon}
      <Text style={styles.metaBarText}>{label}</Text>
    </View>
  );
}

function priorityLabel(p: number) {
  return `P${p}`;
}

function priorityColor(p: number): string {
  if (p >= 5) return colors.bad;
  if (p >= 4) return colors.kinematic;
  if (p >= 3) return colors.focus;
  if (p >= 2) return colors.trends;
  return colors.neutral;
}

function GoalCard({ goal, onChangePriority }: { goal: Goal; onChangePriority?: (id: string, priority: number) => void }) {
  const progress = goal.target_value && goal.current_value != null ? Math.min(100, (goal.current_value / goal.target_value) * 100) : null;
  const pace = paceOf(goal);
  const runRate = runRateOf(goal);
  const deadline = deadlineOf(goal);
  const color = CATEGORY_COLOR[goal.category];

  return (
    <AccentCard
      tier={pace?.label === "Behind" ? "critical" : "standard"}
      color={color}
      badgeLabel={goal.category.toUpperCase()}
      metaRight={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onChangePriority?.(goal.id, goal.priority);
            }}
            hitSlop={8}
            style={({ pressed }) => [pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <Pill label={priorityLabel(goal.priority)} color={priorityColor(goal.priority)} />
          </Pressable>
          {pace ? <Pill label={pace.text.toUpperCase()} color={pace.color} /> : null}
        </View>
      }
      title={goal.title}
      detail={
        <View style={styles.cardBody}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {progress != null ? (
              <View style={styles.cardValueRow}>
                <Text style={styles.cardValue}>{goal.current_value}</Text>
                <Text style={styles.cardValueUnit}>
                  / {goal.target_value} {goal.unit ?? ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.cardValueUnit}>No progress logged yet</Text>
            )}
          </View>
          {progress != null ? (
            <Ring progress={progress} size={56} strokeWidth={5} color={color}>
              <Text style={styles.ringPct}>{progress.toFixed(0)}%</Text>
            </Ring>
          ) : null}
        </View>
      }
      footer={
        runRate || deadline ? (
          <View style={styles.metaBar}>
            {runRate ? <MetaBarItem icon={<Gauge size={13} color={colors.textTertiary} />} label={runRate} /> : <View />}
            {deadline ? <MetaBarItem icon={<Calendar size={13} color={colors.textTertiary} />} label={deadline} /> : <View />}
          </View>
        ) : undefined
      }
    />
  );
}

function AchievedRow({ goal }: { goal: Goal }) {
  const pct =
    goal.target_value && goal.current_value != null ? Math.round(Math.min(999, (goal.current_value / goal.target_value) * 100)) : null;
  const completedDate = goal.updated_at ? new Date(goal.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <View style={styles.achievedRow}>
      <View style={styles.achievedIcon}>
        <Check size={14} color={colors.good} strokeWidth={3} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.achievedTitle} numberOfLines={1}>{goal.title}</Text>
        <Text style={styles.achievedSubtitle} numberOfLines={1}>
          {completedDate ? `Completed ${completedDate}` : "Completed"}
          {pct != null ? ` · ${pct}% target met` : ""}
        </Text>
      </View>
      {pct != null ? (
        <View style={styles.achievedPctBadge}>
          <Text style={styles.achievedPctText}>{pct}%</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | Goal["category"]>("all");
  const [achievedExpanded, setAchievedExpanded] = useState(true);
  const transactions = useTransactions(500);

  const fetchGoals = useCallback(async () => {
    const { data } = await supabase.from("goals").select("*").neq("status", "abandoned");
    if (data) {
      const sorted = [...data].sort((a: Goal, b: Goal) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return (b.priority ?? 3) - (a.priority ?? 3);
      });
      setGoals(sorted as Goal[]);
    }
  }, []);

  useEffect(() => {
    fetchGoals().finally(() => setLoading(false));
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) setHistory(JSON.parse(raw));
    });
  }, [fetchGoals]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals();
    setRefreshing(false);
  };

  const changePriority = useCallback(async (goalId: string, current: number) => {
    const next = current >= 5 ? 1 : current + 1;
    await supabase.from("goals").update({ priority: next, updated_at: new Date().toISOString() }).eq("id", goalId);
    await fetchGoals();
  }, [fetchGoals]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const nextHistory = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setInput("");
    setSending(true);
    try {
      const res = await sendGoalsChat(text, history.slice(-20));
      const withReply = [...nextHistory, { role: "assistant", content: res.reply }];
      setHistory(withReply);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(withReply.slice(-100))).catch(() => {});
      if (res.goals_changed) fetchGoals();
    } catch (err) {
      setHistory((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "request failed"}` }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingState label="Loading Goals…" />;

  const active = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");
  const lastExchange = history.slice(-2);

  const paces = active.map((g) => paceOf(g)).filter(Boolean) as Pace[];
  const behindCount = paces.filter((p) => p.label === "Behind").length;
  const statusLabel = behindCount > 0 ? "WATCH" : "NOMINAL";
  const statusColor = behindCount > 0 ? colors.warn : colors.good;

  const filteredActive = categoryFilter === "all" ? active : active.filter((g) => g.category === categoryFilter);

  const txs = (transactions.data ?? []) as FullTransaction[];
  const funds = monthlyFreeFunds(txs);
  const financialGoals = active.filter((g) => g.category === "financial" && g.target_value && g.current_value != null);
  const remainingTotal = financialGoals.reduce((a, g) => a + Math.max(0, (g.target_value ?? 0) - (g.current_value ?? 0)), 0);
  const allocation = remainingTotal > 0 && funds.free > 0
    ? (() => {
        const weighted = financialGoals.map((g) => {
          const remaining = Math.max(0, (g.target_value ?? 0) - (g.current_value ?? 0));
          const weight = remaining * (g.priority ?? 3);
          return { goal: g, remaining, weight };
        });
        const totalWeight = weighted.reduce((a, w) => a + w.weight, 0) || 1;
        return weighted
          .map(({ goal, remaining, weight }) => ({
            id: goal.id,
            title: goal.title,
            priority: goal.priority ?? 3,
            monthly: (weight / totalWeight) * funds.free,
            monthsToFund: remaining / Math.max(1, (weight / totalWeight) * funds.free),
          }))
          .sort((a, b) => b.monthly - a.monthly);
      })()
    : [];

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
      <Surface style={styles.strategistCard}>
        <View style={styles.strategistHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <BrainCircuit size={14} color={colors.focus} />
            <Text style={styles.strategistLabel}>STRATEGIST TELEMETRY</Text>
          </View>
          <Text style={styles.strategistBadge}>{sending ? "THINKING…" : "SYNAPSE ACTIVE"}</Text>
        </View>
        {!chatFocused && lastExchange.length > 0 ? (
          <Pressable onPress={() => setChatFocused(true)} style={styles.transcript}>
            {lastExchange.map((m, i) => (
              <Text key={i} style={[styles.chatLine, m.role === "user" && styles.chatLineUser]} numberOfLines={2}>
                {m.role === "user" ? "YOU: " : "AI: "}
                {m.content}
              </Text>
            ))}
          </Pressable>
        ) : null}
        {chatFocused ? (
          <View style={styles.transcript}>
            {history.slice(-6).map((m, i) => (
              <Text key={i} style={[styles.chatLine, m.role === "user" && styles.chatLineUser]}>
                {m.role === "user" ? "YOU: " : "AI: "}
                {m.content}
              </Text>
            ))}
          </View>
        ) : null}
        {!chatFocused && lastExchange.length === 0 ? <Text style={styles.chatPlaceholder}>Ask the goal strategist…</Text> : null}
        <View style={styles.chatInputRow}>
          <TextInput
            ref={inputRef}
            style={styles.chatInput}
            placeholder="Describe a new target to Goal Strategist…"
            placeholderTextColor={colors.textTertiary}
            value={input}
            onChangeText={setInput}
            onFocus={() => setChatFocused(true)}
            onSubmitEditing={send}
          />
          <Pressable onPress={send} disabled={sending || !input.trim()} style={styles.sendButton}>
            {sending ? <ActivityIndicator size="small" color={colors.textInverse} /> : <SendHorizonal size={16} color={colors.textInverse} />}
          </Pressable>
        </View>
      </Surface>

      <Surface style={styles.fundsCard}>
        <View style={styles.fundsHeader}>
          <Wallet size={16} color={colors.wealth} />
          <Text style={styles.fundsLabel}>MONTHLY FREE FUNDS</Text>
        </View>
        <Text style={styles.fundsValue}>€{funds.free.toFixed(0)}</Text>
        <View style={styles.fundsMetaRow}>
          <Text style={styles.fundsMeta}>Income €{funds.income.toFixed(0)}</Text>
          <Text style={styles.fundsMeta}>Recurring €{funds.recurring.toFixed(0)}</Text>
        </View>
        {allocation.length > 0 ? (
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <Text style={styles.fundsLabel}>SUGGESTED MONTHLY ALLOCATION</Text>
            {allocation.slice(0, 4).map((a) => (
              <View key={a.id} style={styles.allocationRow}>
                <Pill label={priorityLabel(a.priority)} color={priorityColor(a.priority)} />
                <Text style={styles.allocationTitle} numberOfLines={1}>{a.title}</Text>
                <Text style={styles.allocationAmount}>€{a.monthly.toFixed(0)}/mo</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Surface>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Pressable onPress={() => setCategoryFilter("all")} style={[styles.filterChip, categoryFilter === "all" && styles.filterChipActiveDark]}>
          <Text style={[styles.filterChipText, categoryFilter === "all" && styles.filterChipTextActiveDark]}>ALL ({active.length})</Text>
        </Pressable>
        {CATEGORIES.map((cat) => {
          const count = active.filter((g) => g.category === cat).length;
          const activeChip = categoryFilter === cat;
          const color = CATEGORY_COLOR[cat];
          return (
            <Pressable
              key={cat}
              onPress={() => setCategoryFilter(cat)}
              style={[styles.filterChip, { backgroundColor: withAlpha(color, activeChip ? 0.28 : 0.12) }]}
            >
              <Text style={[styles.filterChipText, { color }]}>
                {cat.toUpperCase()} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel
        title="Active"
        subtitle={categoryFilter === "all" ? `${active.length} goals` : `${filteredActive.length} of ${active.length} goals`}
      />
      {filteredActive.length === 0 ? (
        <EmptyState
          label="No active goals — ask the strategist to create one."
          icon={<Flag size={32} color={colors.textTertiary} />}
          action={{ label: "Ask the strategist", onPress: () => { setChatFocused(true); inputRef.current?.focus(); } }}
        />
      ) : (
        filteredActive.map((g) => <GoalCard key={g.id} goal={g} onChangePriority={changePriority} />)
      )}

      {achieved.length > 0 ? (
        <Surface style={styles.achievedCard}>
          <Pressable onPress={() => setAchievedExpanded((v) => !v)} style={styles.achievedToggle}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.achievedDot, { backgroundColor: colors.good }]} />
              <Text style={styles.achievedToggleLabel}>ACHIEVED GOALS ({achieved.length})</Text>
            </View>
            <View style={{ transform: [{ rotate: achievedExpanded ? "0deg" : "-90deg" }] }}>
              <ChevronDown size={16} color={colors.textTertiary} />
            </View>
          </Pressable>
          {achievedExpanded ? (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              {achieved.map((g) => <AchievedRow key={g.id} goal={g} />)}
            </View>
          ) : null}
        </Surface>
      ) : null}
      </ScrollView>
      <ScreenHeader
        title="Goals & Trajectories"
        statusLabel={statusLabel}
        statusColor={statusColor}
        subtitle={`${active.length} active · ${behindCount} behind pace`}
        onBack={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },
  strategistCard: { marginBottom: spacing.md },
  strategistHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  strategistLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.textPrimary, letterSpacing: 0.6 },
  strategistBadge: { fontFamily: fonts.monoSemiBold, fontSize: 9.5, color: colors.focus, letterSpacing: 0.5 },
  transcript: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, gap: 4, marginBottom: spacing.sm },
  chatPlaceholder: { ...type.caption, color: colors.textTertiary, fontStyle: "italic", marginBottom: spacing.sm },
  chatLine: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },
  chatLineUser: { color: colors.textPrimary, fontFamily: fonts.geistMedium },
  chatInputRow: { flexDirection: "row", gap: spacing.sm },
  chatInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sendButton: { backgroundColor: colors.focus, borderRadius: radius.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.sm },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.surface2 },
  filterChipActiveDark: { backgroundColor: colors.textPrimary },
  filterChipText: { fontFamily: fonts.monoSemiBold, fontSize: 9.5, letterSpacing: 0.5, color: colors.textSecondary },
  filterChipTextActiveDark: { color: colors.textInverse },
  cardBody: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm, marginTop: 2 },
  cardValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "wrap" },
  cardValue: { ...type.metricXl, color: colors.textPrimary },
  cardValueUnit: { ...type.body, color: colors.textTertiary },
  ringPct: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary },
  metaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  metaBarItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  metaBarText: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.textTertiary, letterSpacing: 0.3 },
  achievedCard: { marginTop: spacing.sm },
  achievedToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  achievedDot: { width: 7, height: 7, borderRadius: 3.5 },
  achievedToggleLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, color: colors.textPrimary, letterSpacing: 0.5 },
  achievedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm },
  achievedIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: withAlpha(colors.good, 0.15), alignItems: "center", justifyContent: "center" },
  achievedTitle: { ...type.body, fontFamily: fonts.geistMedium, color: colors.textPrimary, fontSize: 13 },
  achievedSubtitle: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.textTertiary, marginTop: 1 },
  achievedPctBadge: { backgroundColor: withAlpha(colors.good, 0.15), borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  achievedPctText: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.good },
  fundsCard: { gap: spacing.xs },
  fundsHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fundsLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6 },
  fundsValue: { ...type.display, color: colors.wealth, fontSize: 28 },
  fundsMetaRow: { flexDirection: "row", gap: spacing.md },
  fundsMeta: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textSecondary },
  allocationRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  allocationTitle: { flex: 1, ...type.caption, color: colors.textPrimary },
  allocationAmount: { fontFamily: fonts.monoSemiBold, fontSize: 12, color: colors.wealth },
});
