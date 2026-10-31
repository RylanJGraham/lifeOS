import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Share,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Repeat, Flag, Coins, Link2, CreditCard, TrendingUp } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { useCalendarEvents } from "@/lib/queries";
import {
  createCalendarEvent,
  updateCalendarEvent,
  fetchCalendarFeedUrl,
  rotateCalendarFeedUrl,
  deleteCalendarEvent,
  type CalendarEventInput,
  type CalendarKind,
  type CalendarOccurrence,
  type Recurrence,
} from "@/lib/api";
import { ScreenHeader, Surface, ErrorBanner, LoadingState, SegmentedControl, PrimaryButton } from "@/components/ui";

const KINDS: { key: CalendarKind; label: string }[] = [
  { key: "event", label: "Event" },
  { key: "appointment", label: "Appt" },
  { key: "bill", label: "Bill" },
  { key: "reminder", label: "Remind" },
];

const REPEATS: { key: Recurrence; label: string }[] = [
  { key: "none", label: "Once" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const REMINDERS: { key: string; label: string; minutes: number[] }[] = [
  { key: "none", label: "None", minutes: [] },
  { key: "30", label: "30 min", minutes: [30] },
  { key: "60", label: "1 hour", minutes: [60] },
  { key: "1440", label: "1 day", minutes: [1440] },
];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatTime(ev: CalendarOccurrence): string {
  if (ev.all_day) return "All day";
  const t = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return ev.ends_at ? `${t(ev.starts_at)} – ${t(ev.ends_at)}` : t(ev.starts_at);
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const rangeEnd = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);
  const events = useCalendarEvents(month, rangeEnd);
  const [editing, setEditing] = useState<CalendarOccurrence | 'new' | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const ev of events.data ?? []) {
      const key = dayKey(new Date(ev.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events.data]);

  const shiftMonth = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const confirmDelete = useCallback(
    (ev: CalendarOccurrence) => {
      Alert.alert(
        ev.recurrence !== "none" ? "Delete all repeats?" : "Delete event?",
        ev.title,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteCalendarEvent(ev.id);
                events.refetch();
              } catch (e) {
                Alert.alert("Could not delete", e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    },
    [events],
  );

  const shareFeed = useCallback(async (rotate: boolean) => {
    try {
      const { url } = await (rotate ? rotateCalendarFeedUrl() : fetchCalendarFeedUrl());
      // iOS: Calendar -> Add Calendar -> Add Subscription Calendar -> paste this URL.
      await Share.share({ message: url });
    } catch (e) {
      Alert.alert("Calendar link", e instanceof Error ? e.message : String(e));
    }
  }, []);

  const feedMenu = useCallback(() => {
    Alert.alert(
      "Subscribe in Apple / Google Calendar",
      "Share the link, then add it as a subscription calendar. Anyone with the link can see your events — reset it to revoke access.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Share link", onPress: () => shareFeed(false) },
        { text: "Reset link", style: "destructive", onPress: () => shareFeed(true) },
      ],
    );
  }, [shareFeed]);

  const todayKey = dayKey(new Date());
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <ScreenHeader title="Calendar" subtitle={monthLabel} onBack={() => router.back()} />
      <View style={styles.monthBar}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityLabel="Previous month">
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={feedMenu} hitSlop={12} accessibilityLabel="Subscribe in another calendar app">
          <Link2 size={20} color={colors.focus} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityLabel="Next month">
          <ChevronRight size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {events.loading ? (
        <LoadingState label="Loading calendar…" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={events.refreshing} onRefresh={events.refetch} tintColor={colors.textSecondary} />}
        >
          {events.error ? <ErrorBanner message={events.error} /> : null}
          {byDay.length === 0 ? (
            <Surface style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nothing scheduled</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                Tap + to add an event, or tell the chat "dentist thursday 3pm".
              </Text>
            </Surface>
          ) : (
            byDay.map(([key, items]) => {
              const d = new Date(items[0].starts_at);
              const isToday = key === todayKey;
              return (
                <View key={key} style={styles.dayGroup}>
                  <Text style={[styles.dayLabel, { color: isToday ? colors.focus : colors.textSecondary }]}>
                    {isToday ? "Today · " : ""}
                    {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                  </Text>
                  {items.map((ev) => {
                    const derived = ev.origin !== "user";
                    return (
                      <Pressable key={ev.occurrence_id} disabled={derived} onPress={() => setEditing(ev)}>
                      <Surface style={styles.card}>
                        <View style={styles.cardRow}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.titleRow}>
                              {ev.origin === "goal" ? <Flag size={13} color={colors.focus} /> : null}
                              {ev.origin === "rsu" ? <Coins size={13} color={colors.wealth} /> : null}
                              {ev.origin === "subscription" ? <CreditCard size={13} color={colors.kinematic} /> : null}
                              {ev.origin === "dividend" ? <TrendingUp size={13} color={colors.wealth} /> : null}
                              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                                {ev.title}
                              </Text>
                            </View>
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatTime(ev)}</Text>
                            {ev.location ? (
                              <View style={styles.metaRow}>
                                <MapPin size={12} color={colors.textTertiary} />
                                <Text style={[styles.meta, { color: colors.textTertiary }]}>{ev.location}</Text>
                              </View>
                            ) : null}
                            {ev.recurrence !== "none" ? (
                              <View style={styles.metaRow}>
                                <Repeat size={12} color={colors.textTertiary} />
                                <Text style={[styles.meta, { color: colors.textTertiary }]}>{ev.recurrence}</Text>
                              </View>
                            ) : null}
                          </View>
                          {!derived ? (
                            <Pressable onPress={() => confirmDelete(ev)} hitSlop={10} accessibilityLabel={`Delete ${ev.title}`}>
                              <Trash2 size={18} color={colors.textTertiary} />
                            </Pressable>
                          ) : null}
                        </View>
                      </Surface>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setEditing("new");
        }}
        style={[styles.fab, { backgroundColor: colors.focus, bottom: insets.bottom + spacing.lg }]}
        accessibilityLabel="Add event"
      >
        <Plus size={26} color={colors.textInverse} />
      </Pressable>

      <EventModal
        event={editing === "new" ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          events.refetch();
        }}
      />
    </View>
  );
}

function roundedNextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function reminderKey(offsets: number[]): string {
  const first = offsets[0];
  if (first === undefined) return "none";
  return REMINDERS.find((r) => r.minutes[0] === first)?.key ?? "30";
}

// Create when `event` is null, edit otherwise. Editing a repeating event edits
// the whole series; the date shift is applied to the series start so the
// pattern keeps its shape.
function EventModal({
  event,
  visible,
  onClose,
  onSaved,
}: {
  event: CalendarOccurrence | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(roundedNextHour);
  const [kind, setKind] = useState<CalendarKind>("event");
  const [repeat, setRepeat] = useState<Recurrence>("none");
  const [reminder, setReminder] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the form whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (event) {
      setTitle(event.title);
      setLocation(event.location ?? "");
      setStart(new Date(event.starts_at));
      setKind(event.kind);
      setRepeat(event.recurrence);
      setReminder(reminderKey(event.reminder_offsets));
    } else {
      setTitle("");
      setLocation("");
      setStart(roundedNextHour());
      setKind("event");
      setRepeat("none");
      setReminder("30");
    }
  }, [visible, event]);

  const save = async () => {
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const reminderMinutes = REMINDERS.find((r) => r.key === reminder)?.minutes ?? [];
      if (event) {
        const patch: Partial<CalendarEventInput> = {
          title: title.trim(),
          kind,
          recurrence: repeat,
          location: location.trim() || null,
        };
        // Only touch reminders if the user changed them (custom offsets, e.g. a bill's
        // "9am the day before", aren't representable in the picker and must survive an edit).
        if (reminder !== reminderKey(event.reminder_offsets)) patch.reminder_offsets = reminderMinutes;
        let picked = start;
        if (event.all_day) picked = new Date(start.getFullYear(), start.getMonth(), start.getDate()); // local midnight
        const shiftMs = picked.getTime() - new Date(event.starts_at).getTime();
        if (shiftMs !== 0) {
          patch.starts_at = new Date(new Date(event.series_starts_at).getTime() + shiftMs).toISOString();
        }
        await updateCalendarEvent(event.id, patch);
      } else {
        await createCalendarEvent({
          title: title.trim(),
          starts_at: start.toISOString(),
          kind,
          recurrence: repeat,
          location: location.trim() || null,
          reminder_offsets: reminderMinutes,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <ScrollView contentContainerStyle={[styles.modalBody, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{event ? "Edit event" : "New event"}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface1, borderColor: colors.hairline }]}
            autoFocus={!event}
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Location (optional)"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface1, borderColor: colors.hairline }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {event && event.recurrence !== "none" ? "When (this occurrence — moves the whole series)" : "When"}
          </Text>
          <DateTimePicker
            value={start}
            mode={event?.all_day ? "date" : "datetime"}
            display="compact"
            onChange={(_e, d) => d && setStart(d)}
            themeVariant={colors.bg === "#0F172A" ? "dark" : "light"}
            style={{ alignSelf: "flex-start" }}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Type</Text>
          <SegmentedControl options={KINDS} value={kind} onChange={setKind} />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Repeats</Text>
          <SegmentedControl options={REPEATS} value={repeat} onChange={setRepeat} />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Remind me</Text>
          <SegmentedControl
            options={REMINDERS.map((r) => ({ key: r.key, label: r.label }))}
            value={reminder}
            onChange={setReminder}
          />

          {error ? <ErrorBanner message={error} /> : null}
          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton label={event ? "Save changes" : "Save event"} onPress={save} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  monthLabel: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 18 },
  scroll: { padding: spacing.md, paddingBottom: 120 },
  dayGroup: { marginBottom: spacing.lg },
  dayLabel: {
    fontFamily: fonts.spaceGroteskSemiBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontFamily: fonts.geistMedium, fontSize: 16, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  meta: { fontFamily: fonts.geistRegular, fontSize: 13, marginTop: 2 },
  empty: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 16 },
  emptyBody: { fontFamily: fonts.geistRegular, fontSize: 14, textAlign: "center" },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalBody: { padding: spacing.lg, gap: spacing.sm },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontFamily: fonts.spaceGroteskBold, fontSize: 22 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.geistRegular,
    fontSize: 16,
  },
  fieldLabel: { fontFamily: fonts.geistMedium, fontSize: 13, marginTop: spacing.md },
});
