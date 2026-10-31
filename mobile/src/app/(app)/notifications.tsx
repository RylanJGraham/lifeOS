import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Switch, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Bell, CheckCheck } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { useNotifications } from "@/lib/queries";
import {
  fetchNotificationPrefs,
  markNotificationsRead,
  saveNotificationPrefs,
  sendTestNotification,
  type AppNotification,
  type NotificationPrefs,
} from "@/lib/api";
import { HEADER_BAR_HEIGHT, ScreenHeader, Surface, ErrorBanner, LoadingState, PrimaryButton } from "@/components/ui";

const KIND_LABELS: Record<string, string> = {
  calendar: "Calendar reminders",
  briefing: "Morning briefing",
  pacing: "Fuel pacing",
  goals: "Goal check-ins",
  audit: "Evening audit",
  insight: "Specialist insights",
  review: "Weekly review",
  investments: "Investments",
  system: "System alerts",
};

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const feed = useNotifications(50);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchNotificationPrefs()
      .then((r) => {
        setPrefs(r.data);
        setQuietStart(r.data.quiet_start?.slice(0, 5) ?? "");
        setQuietEnd(r.data.quiet_end?.slice(0, 5) ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const update = useCallback(async (patch: Parameters<typeof saveNotificationPrefs>[0]) => {
    setError(null);
    try {
      const res = await saveNotificationPrefs(patch);
      setPrefs(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const open = useCallback(
    async (n: AppNotification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!n.read_at) {
        await markNotificationsRead([n.id]).catch(() => {});
        feed.refetch();
      }
      if (n.deep_link?.startsWith("/")) router.push(n.deep_link as never);
    },
    [feed, router],
  );

  const readAll = useCallback(async () => {
    await markNotificationsRead().catch(() => {});
    feed.refetch();
  }, [feed]);

  const saveQuiet = useCallback(() => {
    if ((quietStart && !HHMM.test(quietStart)) || (quietEnd && !HHMM.test(quietEnd))) {
      setError("Quiet hours must look like 22:00.");
      return;
    }
    update({ quiet_start: quietStart || "", quiet_end: quietEnd || "" });
  }, [quietStart, quietEnd, update]);

  const sendTest = useCallback(async () => {
    setStatus(null);
    try {
      await sendTestNotification();
      setStatus("Sent — it should arrive in a few seconds.");
      feed.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [feed]);

  if (feed.loading) return <LoadingState label="Loading notifications…" />;

  const unread = feed.data?.unread ?? 0;
  const items = feed.data?.items ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + HEADER_BAR_HEIGHT, backgroundColor: colors.bg }]}>
      <ScreenHeader title="Notifications" subtitle={`${unread} unread`} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refetch} tintColor={colors.textSecondary} />}
      >
        {error || feed.error ? <ErrorBanner message={(error || feed.error) as string} /> : null}

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Recent</Text>
          {unread > 0 ? (
            <Pressable onPress={readAll} hitSlop={8} style={styles.readAll}>
              <CheckCheck size={14} color={colors.focus} />
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 13 }}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        {items.length === 0 ? (
          <Surface style={styles.empty}>
            <Bell size={24} color={colors.textTertiary} />
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>No notifications yet.</Text>
          </Surface>
        ) : (
          items.map((n) => (
            <Pressable key={n.id} onPress={() => open(n)}>
              <Surface style={styles.card}>
                <View style={styles.cardTop}>
                  {!n.read_at ? <View style={[styles.unreadDot, { backgroundColor: colors.focus }]} /> : null}
                  <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                    {n.title}
                  </Text>
                  <Text style={[styles.time, { color: colors.textTertiary }]}>{relative(n.created_at)}</Text>
                </View>
                {n.body ? (
                  <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>
                    {n.body}
                  </Text>
                ) : null}
              </Surface>
            </Pressable>
          ))
        )}

        {prefs ? (
          <>
            <Text style={[styles.sectionLabel, styles.settingsLabel, { color: colors.textSecondary }]}>Delivery</Text>
            <Surface style={styles.card}>
              <View style={styles.switchRow}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Push notifications</Text>
                <Switch value={prefs.push_enabled} onValueChange={(v) => update({ push_enabled: v })} />
              </View>
              <Text style={[styles.body, { color: colors.textTertiary }]}>
                Off: notifications still appear here, but nothing is pushed to your phone.
              </Text>
            </Surface>

            <Surface style={styles.card}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Quiet hours</Text>
              <Text style={[styles.body, { color: colors.textTertiary }]}>
                No pushes in this window (24h time, {prefs.timezone}). Leave empty to disable.
              </Text>
              <View style={styles.quietRow}>
                <TextInput
                  value={quietStart}
                  onChangeText={setQuietStart}
                  onBlur={saveQuiet}
                  placeholder="22:00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.timeInput, { color: colors.textPrimary, backgroundColor: colors.surface2 }]}
                  accessibilityLabel="Quiet hours start"
                />
                <Text style={{ color: colors.textSecondary }}>to</Text>
                <TextInput
                  value={quietEnd}
                  onChangeText={setQuietEnd}
                  onBlur={saveQuiet}
                  placeholder="07:00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.timeInput, { color: colors.textPrimary, backgroundColor: colors.surface2 }]}
                  accessibilityLabel="Quiet hours end"
                />
              </View>
            </Surface>

            <Surface style={styles.card}>
              <Text style={[styles.title, { color: colors.textPrimary, marginBottom: spacing.sm }]}>Categories</Text>
              {Object.entries(KIND_LABELS).map(([kind, label]) => (
                <View key={kind} style={styles.switchRow}>
                  <Text style={[styles.body, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
                  <Switch
                    value={prefs.kinds[kind] !== false}
                    onValueChange={(v) => update({ kinds: { ...prefs.kinds, [kind]: v } })}
                  />
                </View>
              ))}
            </Surface>

            <PrimaryButton label="Send test notification" onPress={sendTest} />
            {status ? <Text style={[styles.body, { color: colors.good, marginTop: spacing.sm }]}>{status}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxxl },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sectionLabel: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: spacing.xs,
  },
  settingsLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  readAll: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  card: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontFamily: fonts.geistMedium, fontSize: 15, flex: 1 },
  time: { fontFamily: fonts.geistRegular, fontSize: 12 },
  body: { fontFamily: fonts.geistRegular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  empty: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyBody: { fontFamily: fonts.geistRegular, fontSize: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  quietRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  timeInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    minWidth: 80,
    textAlign: "center",
  },
});
