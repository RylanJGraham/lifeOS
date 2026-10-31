import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { addDays, localDay, startOfDay } from "@/lib/dateRange";

const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// From/To day pickers. Each date is a button that opens a full calendar in a sheet (the old compact
// pop-overs opened off the right edge of the screen). Picking "From" after "To" drags "To" along
// (and vice versa); future days are not selectable; "Single day" collapses the range.
export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const today = startOfDay(new Date());
  const [editing, setEditing] = useState<"from" | "to" | null>(null);
  const single = localDay(from) === localDay(to);

  const apply = (which: "from" | "to", d: Date) => {
    const day = startOfDay(d);
    if (which === "from") onChange(day, day > startOfDay(to) ? day : startOfDay(to));
    else onChange(day < startOfDay(from) ? day : startOfDay(from), day);
  };

  const quick = (label: string, fromOffset: number, toOffset: number) => (
    <Pressable
      key={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(addDays(today, fromOffset), addDays(today, toOffset));
      }}
      style={[styles.chip, { backgroundColor: colors.surface2 }]}
    >
      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );

  const dateButton = (label: string, d: Date, which: "from" | "to") => (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setEditing(which);
      }}
      accessibilityLabel={`${label}: ${fmt(d)}`}
      style={[styles.dateBtn, { backgroundColor: colors.surface2, borderColor: colors.hairline }]}
    >
      <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{fmt(d)}</Text>
    </Pressable>
  );

  const current = editing === "to" ? to : from;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
      <View style={styles.row}>
        {dateButton(single ? "Day" : "From", from, "from")}
        {!single ? dateButton("To", to, "to") : null}
      </View>
      <View style={styles.chips}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(from, from);
          }}
          style={[styles.chip, { backgroundColor: single ? colors.focus : colors.surface2 }]}
        >
          <Text style={[styles.chipText, { color: single ? colors.textInverse : colors.textSecondary }]}>Single day</Text>
        </Pressable>
        {quick("Yesterday", -1, -1)}
        {quick("Last 14d", -13, 0)}
        {quick("Last 30d", -29, 0)}
      </View>

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {editing === "to" ? "Range ends on" : single ? "Pick a day" : "Range starts on"}
            </Text>
            <Pressable onPress={() => setEditing(null)} hitSlop={10}>
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            maximumDate={today}
            onChange={(_e, d) => d && editing && apply(editing, d)}
            themeVariant={colors.bg === "#0F172A" ? "dark" : "light"}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  dateBtn: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  dateLabel: { fontFamily: fonts.geistMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  dateValue: { fontFamily: fonts.geistMedium, fontSize: 15, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  chipText: { fontFamily: fonts.geistMedium, fontSize: 12 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.spaceGroteskBold, fontSize: 20 },
});
