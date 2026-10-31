import { StyleSheet } from "react-native";
import { spacing, fonts, radius, withAlpha, type ThemeColors } from "@/theme";
import type { CalendarKind, CalendarOccurrence, Recurrence } from "@/lib/api";

export const KINDS: { key: CalendarKind; label: string }[] = [
  { key: "event", label: "Event" },
  { key: "appointment", label: "Appt" },
  { key: "bill", label: "Bill" },
  { key: "reminder", label: "Remind" },
];

export const REPEATS: { key: Recurrence; label: string }[] = [
  { key: "none", label: "Once" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

export const REMINDERS: { key: string; label: string; minutes: number[] }[] = [
  { key: "none", label: "None", minutes: [] },
  { key: "30", label: "30 min", minutes: [30] },
  { key: "60", label: "1 hour", minutes: [60] },
  { key: "1440", label: "1 day", minutes: [1440] },
];

export function roundedNextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Block colour for an event: synced/derived events by origin, your own by kind. */
export function eventColor(ev: Pick<CalendarOccurrence, "origin" | "kind">, c: ThemeColors): string {
  switch (ev.origin) {
    case "import": return c.wealth;
    case "goal": return c.kinematic;
    case "rsu":
    case "dividend": return c.good;
    case "subscription": return c.cardio;
  }
  switch (ev.kind) {
    case "appointment": return c.nutrition;
    case "bill": return c.kinematic;
    case "reminder": return c.trends;
    case "workout": return c.cardio;
    case "other": return c.neutral;
    default: return c.focus;
  }
}

export { withAlpha };

/** Styles shared by the calendar sheets and cards. */
export const calStyles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontFamily: fonts.geistMedium, fontSize: 16, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  meta: { fontFamily: fonts.geistRegular, fontSize: 13, marginTop: 2 },
  syncHeading: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 16, marginTop: spacing.sm },
  syncHelp: { fontFamily: fonts.geistRegular, fontSize: 13, lineHeight: 19 },
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
