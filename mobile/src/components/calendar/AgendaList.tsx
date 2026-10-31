import { View, Text, Pressable } from "react-native";
import { MapPin, Repeat, CalendarDays, Trash2 } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme";
import type { CalendarOccurrence } from "@/lib/api";
import { Surface } from "@/components/ui";
import { calStyles as styles, eventColor } from "./shared";

function timeLabel(ev: CalendarOccurrence): string {
  if (ev.all_day) return "All day";
  const t = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return ev.ends_at ? `${t(ev.starts_at)} – ${t(ev.ends_at)}` : t(ev.starts_at);
}

const ORIGIN_LABEL: Record<string, string> = {
  import: "linked calendar",
  goal: "goal deadline",
  rsu: "RSU vest (est.)",
  subscription: "renewal (est.)",
  dividend: "dividend (est.)",
};

// Cards for one day's events. Your own events open for editing; synced and
// derived ones are read-only.
export function AgendaList({
  events,
  onPress,
  onMove,
  onDelete,
}: {
  events: CalendarOccurrence[];
  onPress: (ev: CalendarOccurrence) => void;
  onMove?: (ev: CalendarOccurrence) => void;
  onDelete?: (ev: CalendarOccurrence) => void;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {events.map((ev) => {
        const c = eventColor(ev, colors);
        return (
          <Pressable key={ev.occurrence_id} disabled={ev.origin !== "user" && ev.origin !== "goal"} onPress={() => onPress(ev)}>
            <Surface style={[styles.card, { borderLeftWidth: 4, borderLeftColor: c }]}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{ev.title}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {timeLabel(ev)}{ev.origin !== "user" ? ` · ${ORIGIN_LABEL[ev.origin] ?? ev.origin}` : ""}
              </Text>
              {ev.location ? (
                <View style={styles.metaRow}>
                  <MapPin size={12} color={colors.textTertiary} />
                  <Text style={[styles.meta, { color: colors.textTertiary, marginTop: 0 }]}>{ev.location}</Text>
                </View>
              ) : null}
              {ev.recurrence !== "none" ? (
                <View style={styles.metaRow}>
                  <Repeat size={12} color={colors.textTertiary} />
                  <Text style={[styles.meta, { color: colors.textTertiary, marginTop: 0 }]}>{ev.recurrence}</Text>
                </View>
              ) : null}
              {ev.origin === "goal" ? <Text style={[styles.meta, { color: colors.focus }]}>Tap to change this deadline in Goals ›</Text> : null}
              {ev.origin === "user" && (onMove || onDelete) ? (
                <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                  {onMove ? (
                    <Pressable onPress={() => onMove(ev)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <CalendarDays size={14} color={colors.focus} />
                      <Text style={{ color: colors.focus, fontSize: 13 }}>Move</Text>
                    </Pressable>
                  ) : null}
                  {onDelete ? (
                    <Pressable onPress={() => onDelete(ev)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Trash2 size={14} color={colors.bad} />
                      <Text style={{ color: colors.bad, fontSize: 13 }}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Surface>
          </Pressable>
        );
      })}
    </View>
  );
}
