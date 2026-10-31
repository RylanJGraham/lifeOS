import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, type ScrollViewInstance } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import type { CalendarOccurrence } from "@/lib/api";
import { isSameDay, layoutDay } from "@/lib/calendarLayout";
import { eventColor, withAlpha } from "./shared";

const HOUR_H = 60; // px per hour
const GUTTER = 48;

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Day as a vertical 24h timeline: all-day strip on top, timed events as blocks
// sized by duration (overlaps share the width), and a live "now" line on today.
export function DayView({
  day,
  events,
  today,
  onPressEvent,
  onLongPressEvent,
  refreshing,
  onRefresh,
}: {
  day: Date;
  events: CalendarOccurrence[];
  today: Date;
  onPressEvent: (ev: CalendarOccurrence) => void;
  onLongPressEvent: (ev: CalendarOccurrence) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const [nowMin, setNowMin] = useState(() => minutesNow());
  const isToday = isSameDay(day, today);

  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  const allDay = events.filter((e) => e.all_day);
  const blocks = layoutDay(events, day);

  // Scroll to "now" on today, otherwise to the first event (or 08:00).
  useEffect(() => {
    const target = isToday ? nowMin : blocks.length ? blocks[0].startMin : 8 * 60;
    const y = Math.max(0, (target / 60) * HOUR_H - 140);
    const t = setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.getTime(), isToday]);

  const trackWidth = Math.max(0, width - GUTTER - spacing.sm);

  return (
    <View style={{ flex: 1 }}>
      {allDay.length > 0 ? (
        <View style={styles.allDayRow}>
          <Text style={[styles.allDayLabel, { color: colors.textTertiary }]}>All day</Text>
          <View style={styles.allDayChips}>
            {allDay.map((ev) => {
              const c = eventColor(ev, colors);
              return (
                <Pressable
                  key={ev.occurrence_id}
                  disabled={ev.origin !== "user" && ev.origin !== "goal"}
                  onPress={() => onPressEvent(ev)}
                  onLongPress={() => onLongPressEvent(ev)}
                  style={[styles.allDayChip, { backgroundColor: withAlpha(c, 0.18), borderLeftColor: c }]}
                >
                  <Text numberOfLines={1} style={[styles.allDayText, { color: colors.textPrimary }]}>{ev.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scroll}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View style={{ height: HOUR_H * 24 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <View key={h} style={[styles.hourRow, { top: h * HOUR_H }]}>
              <Text style={[styles.hourLabel, { color: colors.textTertiary }]}>{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</Text>
              <View style={[styles.hourLine, { backgroundColor: colors.hairline }]} />
            </View>
          ))}

          {blocks.map((b) => {
            const c = eventColor(b.event, colors);
            const colW = trackWidth / b.columns;
            const height = Math.max(22, ((b.endMin - b.startMin) / 60) * HOUR_H - 2);
            return (
              <Pressable
                key={b.event.occurrence_id}
                disabled={b.event.origin !== "user" && b.event.origin !== "goal"}
                onPress={() => onPressEvent(b.event)}
                onLongPress={() => onLongPressEvent(b.event)}
                accessibilityLabel={`${b.event.title}, ${fmt(b.event.starts_at)}`}
                style={[
                  styles.event,
                  {
                    top: (b.startMin / 60) * HOUR_H + 1,
                    height,
                    left: GUTTER + b.column * colW,
                    width: colW - 3,
                    backgroundColor: withAlpha(c, 0.2),
                    borderLeftColor: c,
                  },
                ]}
              >
                <Text numberOfLines={2} style={[styles.eventTitle, { color: colors.textPrimary }]}>{b.event.title}</Text>
                {height >= 40 ? (
                  <Text numberOfLines={1} style={[styles.eventTime, { color: colors.textSecondary }]}>
                    {fmt(b.event.starts_at)}{b.event.ends_at ? ` – ${fmt(b.event.ends_at)}` : ""}{b.event.location ? ` · ${b.event.location}` : ""}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}

          {isToday ? (
            <View pointerEvents="none" style={[styles.nowWrap, { top: (nowMin / 60) * HOUR_H }]}>
              <View style={[styles.nowDot, { backgroundColor: colors.cardio }]} />
              <View style={[styles.nowLine, { backgroundColor: colors.cardio }]} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function minutesNow(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

const styles = StyleSheet.create({
  allDayRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  allDayLabel: { width: GUTTER - spacing.md, fontFamily: fonts.geistMedium, fontSize: 10, paddingTop: 4 },
  allDayChips: { flex: 1, gap: 4 },
  allDayChip: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  allDayText: { fontFamily: fonts.geistMedium, fontSize: 12 },
  hourRow: { position: "absolute", left: 0, right: 0, height: HOUR_H, flexDirection: "row" },
  hourLabel: { width: GUTTER, fontFamily: fonts.monoMedium, fontSize: 10, textAlign: "right", paddingRight: spacing.sm, marginTop: -6 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, marginRight: spacing.sm },
  event: { position: "absolute", borderLeftWidth: 3, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, overflow: "hidden" },
  eventTitle: { fontFamily: fonts.geistMedium, fontSize: 12 },
  eventTime: { fontFamily: fonts.geistRegular, fontSize: 10, marginTop: 1 },
  nowWrap: { position: "absolute", left: GUTTER - 5, right: spacing.sm, height: 10, marginTop: -5, flexDirection: "row", alignItems: "center" },
  nowDot: { width: 10, height: 10, borderRadius: 5 },
  nowLine: { flex: 1, height: 2 },
});
