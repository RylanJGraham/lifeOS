import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import type { CalendarOccurrence } from "@/lib/api";
import { dayKey, groupByDay, isSameDay, monthGrid } from "@/lib/calendarLayout";
import { eventColor, withAlpha } from "./shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_BLOCKS = 3;
const CELL_HEIGHT = 84;

// Regular month calendar: Mon–Sun columns, today filled, selected day outlined,
// each day shows coloured event blocks (+N more).
export function MonthView({
  month,
  events,
  selected,
  today,
  onSelect,
}: {
  month: Date;
  events: CalendarOccurrence[];
  selected: Date;
  today: Date;
  onSelect: (d: Date) => void;
}) {
  const { colors } = useTheme();
  const weeks = monthGrid(month);
  const byDay = groupByDay(events);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, { color: i >= 5 ? colors.textTertiary : colors.textSecondary }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={[styles.weekRow, { borderTopColor: colors.hairline }]}>
          {week.map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selected);
            const items = byDay.get(dayKey(d)) ?? [];
            const shown = items.slice(0, MAX_BLOCKS);
            const more = items.length - shown.length;
            return (
              <Pressable
                key={dayKey(d)}
                onPress={() => onSelect(d)}
                accessibilityLabel={`${d.toDateString()}${isToday ? ", today" : ""}, ${items.length} events`}
                style={[
                  styles.cell,
                  { borderLeftColor: colors.hairline },
                  isToday && { backgroundColor: withAlpha(colors.focus, 0.08) },
                  isSelected && { borderColor: colors.focus, borderWidth: 1.5 },
                ]}
              >
                <View style={[styles.dayBadge, isToday && { backgroundColor: colors.focus }]}>
                  <Text
                    style={[
                      styles.dayNum,
                      { color: isToday ? colors.textInverse : inMonth ? colors.textPrimary : colors.textTertiary },
                      isToday && { fontFamily: fonts.geistMedium },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                <View style={[styles.blocks, !inMonth && { opacity: 0.45 }]}>
                  {shown.map((ev) => {
                    const c = eventColor(ev, colors);
                    return (
                      <View key={ev.occurrence_id} style={[styles.block, { backgroundColor: withAlpha(c, 0.18), borderLeftColor: c }]}>
                        <Text numberOfLines={1} style={[styles.blockText, { color: colors.textPrimary }]}>
                          {ev.title}
                        </Text>
                      </View>
                    );
                  })}
                  {more > 0 ? <Text style={[styles.more, { color: colors.textSecondary }]}>+{more} more</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  weekdayRow: { flexDirection: "row", paddingVertical: spacing.sm },
  weekday: { flex: 1, textAlign: "center", fontFamily: fonts.geistMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  weekRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1, height: CELL_HEIGHT, paddingHorizontal: 2, paddingTop: 3, borderLeftWidth: StyleSheet.hairlineWidth },
  dayBadge: { alignSelf: "center", minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  dayNum: { fontFamily: fonts.geistRegular, fontSize: 12 },
  blocks: { gap: 2 },
  block: { borderLeftWidth: 2.5, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  blockText: { fontFamily: fonts.geistRegular, fontSize: 9 },
  more: { fontFamily: fonts.geistMedium, fontSize: 9, paddingLeft: 3 },
});
