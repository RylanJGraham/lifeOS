import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Plus, Link2 } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { useCalendarEvents } from "@/lib/queries";
import { fetchCalendarFeedUrl, rotateCalendarFeedUrl, deleteCalendarEvent, type CalendarOccurrence } from "@/lib/api";
import { HEADER_BAR_HEIGHT, ScreenHeader, Surface, ErrorBanner, LoadingState, SegmentedControl } from "@/components/ui";
import {
  addDays,
  addMonths,
  dayKey,
  groupByDay,
  isSameDay,
  monthGridRange,
  startOfDay,
  startOfMonth,
} from "@/lib/calendarLayout";
import { EventModal } from "@/components/calendar/EventModal";
import { SyncModal } from "@/components/calendar/SyncModal";
import { MonthView } from "@/components/calendar/MonthView";
import { DayView } from "@/components/calendar/DayView";
import { YearView } from "@/components/calendar/YearView";
import { AgendaList } from "@/components/calendar/AgendaList";

type ViewKey = "day" | "month" | "year";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    // Roll over at midnight (and when the app comes back after a long time).
    const t = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((cur) => (isSameDay(cur, now) ? cur : now));
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const today = useToday();

  const [view, setView] = useState<ViewKey>("month");
  const [focus, setFocus] = useState<Date>(() => startOfDay(new Date())); // the day / month / year being looked at
  const [editing, setEditing] = useState<CalendarOccurrence | "new" | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  // What to fetch for each view.
  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(focus), end: addDays(startOfDay(focus), 1) };
    if (view === "year") return { start: new Date(focus.getFullYear(), 0, 1), end: new Date(focus.getFullYear() + 1, 0, 1) };
    return monthGridRange(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dayKey(focus), focus.getFullYear(), focus.getMonth()]);
  const events = useCalendarEvents(range.start, range.end);
  const list = events.data ?? [];
  const byDay = useMemo(() => groupByDay(list), [list]);

  const step = (dir: -1 | 1) => {
    Haptics.selectionAsync().catch(() => {});
    setFocus((f) =>
      view === "day" ? addDays(f, dir) : view === "month" ? addMonths(f, dir) : new Date(f.getFullYear() + dir, 0, 1),
    );
  };
  const goToday = () => {
    Haptics.selectionAsync().catch(() => {});
    setFocus(today);
  };

  const heading =
    view === "day"
      ? focus.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "month"
        ? focus.toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : String(focus.getFullYear());
  const showingToday =
    view === "day" ? isSameDay(focus, today) : view === "month" ? focus.getMonth() === today.getMonth() && focus.getFullYear() === today.getFullYear() : focus.getFullYear() === today.getFullYear();

  const confirmDelete = useCallback(
    (ev: CalendarOccurrence) => {
      Alert.alert(ev.recurrence !== "none" ? "Delete all repeats?" : "Delete event?", ev.title, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCalendarEvent(ev.id);
              setEditing(null);
              events.refetch();
            } catch (e) {
              Alert.alert("Could not delete", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    },
    [events],
  );

  const shareFeed = useCallback(async (rotate: boolean) => {
    try {
      const { url } = await (rotate ? rotateCalendarFeedUrl() : fetchCalendarFeedUrl());
      await Share.share({ message: url });
    } catch (e) {
      Alert.alert("Calendar link", e instanceof Error ? e.message : String(e));
    }
  }, []);

  // New events start on the day being looked at (next hour if that is today, else 09:00).
  const defaultStart = useMemo(() => {
    const d = new Date(focus);
    if (isSameDay(d, today)) {
      const n = new Date();
      n.setMinutes(0, 0, 0);
      n.setHours(n.getHours() + 1);
      return n;
    }
    d.setHours(9, 0, 0, 0);
    return d;
  }, [focus, today]);

  const todayLong = today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const selectedItems = byDay.get(dayKey(focus)) ?? [];
  const firstLoad = events.loading && !events.data;

  return (
    <View style={[styles.container, { paddingTop: insets.top + HEADER_BAR_HEIGHT, backgroundColor: colors.bg }]}>
      <ScreenHeader title="Calendar" subtitle={`Today · ${todayLong}`} onBack={() => router.back()} />

      <View style={styles.controls}>
        <SegmentedControl options={VIEWS} value={view} onChange={setView} />
        <View style={styles.navRow}>
          <Pressable onPress={() => step(-1)} hitSlop={12} accessibilityLabel="Previous">
            <ChevronLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.heading, { color: colors.textPrimary }]} numberOfLines={1}>{heading}</Text>
          <Pressable onPress={() => step(1)} hitSlop={12} accessibilityLabel="Next">
            <ChevronRight size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={goToday}
            accessibilityLabel="Jump to today"
            style={[styles.pill, showingToday ? { backgroundColor: colors.surface2 } : { backgroundColor: colors.focus }]}
          >
            <Text style={[styles.pillText, { color: showingToday ? colors.textSecondary : colors.textInverse }]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => setSyncOpen(true)}
            accessibilityLabel="Sync calendars with Outlook, Google or Apple"
            style={[styles.pill, { backgroundColor: colors.surface1, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Link2 size={13} color={colors.focus} />
            <Text style={[styles.pillText, { color: colors.focus }]}>Sync Outlook / Google / Apple</Text>
          </Pressable>
        </View>
      </View>

      {events.error ? <View style={{ paddingHorizontal: spacing.md }}><ErrorBanner message={events.error} /></View> : null}

      {firstLoad ? (
        <LoadingState label="Loading calendar…" />
      ) : view === "day" ? (
        <DayView
          day={focus}
          events={list}
          today={today}
          onPressEvent={setEditing}
          refreshing={events.refreshing}
          onRefresh={events.refetch}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={events.refreshing} onRefresh={events.refetch} tintColor={colors.textSecondary} />}
        >
          {view === "month" ? (
            <>
              <MonthView month={focus} events={list} selected={focus} today={today} onSelect={setFocus} />
              <View style={styles.dayHeader}>
                <Text style={[styles.dayHeaderText, { color: isSameDay(focus, today) ? colors.focus : colors.textSecondary }]}>
                  {isSameDay(focus, today) ? "Today · " : ""}
                  {focus.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                </Text>
                <Pressable onPress={() => setView("day")} hitSlop={8}>
                  <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 13 }}>Timeline ›</Text>
                </Pressable>
              </View>
              {selectedItems.length === 0 ? (
                <Surface style={styles.empty}>
                  <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Nothing scheduled this day.</Text>
                </Surface>
              ) : (
                <AgendaList events={selectedItems} onPress={setEditing} />
              )}
            </>
          ) : (
            <YearView
              year={focus.getFullYear()}
              events={list}
              today={today}
              onPickMonth={(m) => {
                setFocus(m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear() ? today : startOfMonth(m));
                setView("month");
              }}
            />
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

      <SyncModal visible={syncOpen} onClose={() => setSyncOpen(false)} onChanged={events.refetch} onShareFeed={shareFeed} />

      <EventModal
        event={editing === "new" ? null : editing}
        visible={editing !== null}
        defaultStart={defaultStart}
        onClose={() => setEditing(null)}
        onDelete={confirmDelete}
        onSaved={() => {
          setEditing(null);
          events.refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { flex: 1, textAlign: "center", fontFamily: fonts.spaceGroteskSemiBold, fontSize: 17, paddingHorizontal: spacing.sm },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm },
  pill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  pillText: { fontFamily: fonts.geistMedium, fontSize: 13 },
  scroll: { padding: spacing.md, paddingBottom: 140 },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm, marginHorizontal: spacing.xs },
  dayHeaderText: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  empty: { borderRadius: radius.lg, padding: spacing.lg, alignItems: "center" },
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
});
