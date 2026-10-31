import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import type { CalendarOccurrence } from "@/lib/api";
import { dayKey, groupByDay, heatLevel, isSameDay, monthGrid } from "@/lib/calendarLayout";
import { withAlpha } from "./shared";

const HEAT_ALPHA = [0, 0.18, 0.38, 0.6, 0.85];

// Twelve mini months; each day is tinted by how busy it is, today is ringed.
// Tap a month to open it.
export function YearView({
  year,
  events,
  today,
  onPickMonth,
  onPickDay,
}: {
  year: number;
  events: CalendarOccurrence[];
  today: Date;
  onPickMonth: (month: Date) => void;
  onPickDay: (day: Date) => void;
}) {
  const { colors } = useTheme();
  const byDay = groupByDay(events);
  const total = events.length;

  return (
    <View>
      <Text style={[styles.summary, { color: colors.textSecondary }]}>
        {total} event{total === 1 ? "" : "s"} in {year}
      </Text>
      <View style={styles.grid}>
        {Array.from({ length: 12 }, (_, m) => {
          const month = new Date(year, m, 1);
          const isCurrent = today.getFullYear() === year && today.getMonth() === m;
          return (
            <View
              key={m}
              style={[styles.month, { backgroundColor: colors.surface1, borderColor: isCurrent ? colors.focus : colors.hairline }]}
            >
              <Pressable
                onPress={() => onPickMonth(month)}
                hitSlop={6}
                accessibilityLabel={`Open ${month.toLocaleDateString(undefined, { month: "long" })} ${year}`}
              >
                <Text style={[styles.monthTitle, { color: isCurrent ? colors.focus : colors.textPrimary }]}>
                  {month.toLocaleDateString(undefined, { month: "short" })} ›
                </Text>
              </Pressable>
              {monthGrid(month).map((week, wi) => (
                <View key={wi} style={styles.week}>
                  {week.map((d) => {
                    if (d.getMonth() !== m) return <View key={dayKey(d)} style={styles.day} />;
                    const level = heatLevel((byDay.get(dayKey(d)) ?? []).length);
                    const isToday = isSameDay(d, today);
                    return (
                      <Pressable
                        key={dayKey(d)}
                        onPress={() => onPickDay(d)}
                        hitSlop={1}
                        accessibilityLabel={`${d.toDateString()}, ${(byDay.get(dayKey(d)) ?? []).length} events`}
                        style={[
                          styles.day,
                          level > 0 && { backgroundColor: withAlpha(colors.focus, HEAT_ALPHA[level]) },
                          isToday && { borderWidth: 1.5, borderColor: colors.cardio },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNum,
                            { color: level >= 3 ? colors.textInverse : colors.textSecondary },
                            isToday && { color: level >= 3 ? colors.textInverse : colors.cardio, fontFamily: fonts.geistMedium },
                          ]}
                        >
                          {d.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { fontFamily: fonts.geistRegular, fontSize: 13, marginBottom: spacing.sm, marginLeft: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  month: { width: "31.8%", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 5 },
  monthTitle: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 12, marginBottom: 3, marginLeft: 2 },
  week: { flexDirection: "row" },
  day: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 3, margin: 0.5 },
  dayNum: { fontFamily: fonts.geistRegular, fontSize: 7 },
});
