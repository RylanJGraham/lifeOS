import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import type { CalendarOccurrence } from "@/lib/api";
import { isSameDay } from "@/lib/calendarLayout";
import { Surface } from "@/components/ui";
import { AgendaList } from "./AgendaList";

// Everything happening on one day, opened by tapping a day in Month or Year view.
export function DaySheet({
  day,
  events,
  today,
  onClose,
  onEdit,
  onAdd,
  onTimeline,
}: {
  day: Date | null;
  events: CalendarOccurrence[];
  today: Date;
  onClose: () => void;
  onEdit: (ev: CalendarOccurrence) => void;
  onAdd: (day: Date) => void;
  onTimeline: (day: Date) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isToday = day ? isSameDay(day, today) : false;

  return (
    <Modal visible={day !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {day ? (
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                {isToday ? <Text style={[styles.todayTag, { color: colors.focus }]}>TODAY</Text> : null}
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </Text>
                <Text style={[styles.count, { color: colors.textSecondary }]}>
                  {events.length === 0 ? "No events" : `${events.length} event${events.length === 1 ? "" : "s"}`}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 15 }}>Done</Text>
              </Pressable>
            </View>

            {events.length === 0 ? (
              <Surface style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nothing scheduled this day.</Text>
              </Surface>
            ) : (
              <AgendaList events={events} onPress={onEdit} />
            )}

            <View style={styles.actions}>
              <Pressable onPress={() => onAdd(day)} style={[styles.btn, { backgroundColor: colors.focus }]}>
                <Text style={[styles.btnText, { color: colors.textInverse }]}>Add event</Text>
              </Pressable>
              <Pressable onPress={() => onTimeline(day)} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.btnText, { color: colors.textPrimary }]}>Open timeline</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.md, gap: spacing.md },
  todayTag: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1, marginBottom: 2 },
  title: { fontFamily: fonts.spaceGroteskBold, fontSize: 22 },
  count: { fontFamily: fonts.geistRegular, fontSize: 14, marginTop: 2 },
  empty: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  emptyText: { fontFamily: fonts.geistRegular, fontSize: 14 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  btnText: { fontFamily: fonts.geistMedium, fontSize: 15 },
});
