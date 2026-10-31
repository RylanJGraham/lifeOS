import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts, radius, withAlpha } from "@/theme";
import { CATEGORY_COLOR_KEY, CATEGORY_LABEL, type CategoryRow } from "@/lib/categories";
import { Surface, ListRow } from "@/components/ui";

const eur = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Spending by category: each row's bar is its SHARE of total spending. A budget line appears only when a
// budget is actually known (yours, or a default share of take-home) — never a fake "€0 budget / 100% over".
export function CategoryBreakdown({
  rows,
  total,
  showBudgets,
  emptyText = "No spending in this period.",
}: {
  rows: CategoryRow[];
  total: number;
  showBudgets: boolean;
  emptyText?: string;
}) {
  const { colors } = useTheme();
  if (rows.length === 0) {
    return (
      <Surface style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
      </Surface>
    );
  }
  return (
    <Surface style={{ paddingVertical: spacing.sm }}>
      {rows.map((r, i) => {
        const c = colors[CATEGORY_COLOR_KEY[r.category] as keyof typeof colors] as string;
        const hasBudget = showBudgets && r.budget > 0;
        const left = r.budget - r.spent;
        return (
          <View key={r.category} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline }]}>
            <View style={styles.top}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>{CATEGORY_LABEL[r.category]}</Text>
              <Text style={[styles.amount, { color: colors.textPrimary }]}>{eur(r.spent)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
              <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, r.share))}%`, backgroundColor: c }]} />
            </View>
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                {r.count} transaction{r.count === 1 ? "" : "s"} · {r.share.toFixed(0)}% of spending
              </Text>
              {hasBudget ? (
                <Text style={[styles.metaText, { color: left >= 0 ? colors.textSecondary : colors.bad, fontFamily: fonts.geistMedium }]}>
                  {left >= 0 ? `${eur(left)} left of ${eur(r.budget)}` : `${eur(-left)} over ${eur(r.budget)}`}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <View style={[styles.totalRow, { borderTopColor: colors.hairline }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Total spent</Text>
        <Text style={[styles.amount, { color: colors.textPrimary }]}>{eur(total)}</Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1, fontFamily: fonts.geistMedium, fontSize: 15 },
  amount: { fontFamily: fonts.monoSemiBold, fontSize: 15 },
  track: { height: 6, borderRadius: radius.full, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  metaText: { fontFamily: fonts.geistRegular, fontSize: 12, flexShrink: 1 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.md, marginTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  emptyText: { fontFamily: fonts.geistRegular, fontSize: 14, textAlign: "center" },
});
