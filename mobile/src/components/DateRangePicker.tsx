import { View, Text, Pressable, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius } from "@/theme";
import { addDays, localDay, startOfDay } from "@/lib/dateRange";

// From/To day pickers. Picking "From" after "To" drags "To" along (and vice
// versa), future days are not selectable, and "Single day" collapses the range.
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
  const today = startOfDay(new Date());
  const theme = colors.bg === "#0F172A" ? "dark" : "light";
  const single = localDay(from) === localDay(to);

  const setFrom = (d: Date) => {
    const f = startOfDay(d);
    onChange(f, f > startOfDay(to) ? f : startOfDay(to));
  };
  const setTo = (d: Date) => {
    const t = startOfDay(d);
    onChange(t < startOfDay(from) ? t : startOfDay(from), t);
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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{single ? "Day" : "From"}</Text>
        <DateTimePicker value={from} mode="date" display="compact" maximumDate={today} onChange={(_e, d) => d && setFrom(d)} themeVariant={theme} />
      </View>
      {!single ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>To</Text>
          <DateTimePicker value={to} mode="date" display="compact" maximumDate={today} onChange={(_e, d) => d && setTo(d)} themeVariant={theme} />
        </View>
      ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: fonts.geistMedium, fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  chipText: { fontFamily: fonts.geistMedium, fontSize: 12 },
});
