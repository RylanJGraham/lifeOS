import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { updateCalendarEvent, type CalendarOccurrence } from "@/lib/api";
import { addDays, seriesStartForMove, startOfDay } from "@/lib/calendarLayout";
import { ErrorBanner, PrimaryButton } from "@/components/ui";

// Move an event to another day, keeping its time. For a repeating event the
// whole series moves by the same number of days.
export function MoveSheet({
  event,
  onClose,
  onMoved,
}: {
  event: CalendarOccurrence | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<Date>(() => startOfDay(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setTarget(startOfDay(new Date(event.starts_at)));
      setError(null);
    }
  }, [event]);

  const quick = (label: string, offset: number) => {
    const base = event ? startOfDay(new Date(event.starts_at)) : startOfDay(new Date());
    return (
      <Pressable key={label} onPress={() => setTarget(addDays(base, offset))} style={[styles.chip, { backgroundColor: colors.surface2 }]}>
        <Text style={[styles.chipText, { color: colors.textSecondary }]}>{label}</Text>
      </Pressable>
    );
  };

  const save = async () => {
    if (!event) return;
    setSaving(true);
    setError(null);
    try {
      await updateCalendarEvent(event.id, { starts_at: seriesStartForMove(event.starts_at, event.series_starts_at, target) });
      onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={event !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>Move “{event?.title}”</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
          {event ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Now: {new Date(event.starts_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              {event.all_day ? "" : ` · ${new Date(event.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
              {event.recurrence !== "none" ? "\nThis repeats, so the whole series moves by the same number of days." : ""}
            </Text>
          ) : null}
          <View style={styles.chips}>
            {quick("Next day", 1)}
            {quick("In 2 days", 2)}
            {quick("Next week", 7)}
            {quick("Previous day", -1)}
          </View>
          <DateTimePicker
            value={target}
            mode="date"
            display="inline"
            onChange={(_e, d) => d && setTarget(startOfDay(d))}
            themeVariant={colors.bg === "#0F172A" ? "dark" : "light"}
          />
          {error ? <ErrorBanner message={error} /> : null}
          <PrimaryButton
            label={`Move to ${target.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
            onPress={save}
            loading={saving}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  title: { flex: 1, fontFamily: fonts.spaceGroteskBold, fontSize: 20 },
  sub: { fontFamily: fonts.geistRegular, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  chipText: { fontFamily: fonts.geistMedium, fontSize: 12 },
});
