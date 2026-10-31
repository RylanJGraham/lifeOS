import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts } from "@/theme";
import {
  createCalendarEvent,
  updateCalendarEvent,
  type CalendarEventInput,
  type CalendarKind,
  type CalendarOccurrence,
  type Recurrence,
} from "@/lib/api";
import { ErrorBanner, SegmentedControl, PrimaryButton } from "@/components/ui";
import { KINDS, REPEATS, REMINDERS, roundedNextHour, calStyles as styles } from "./shared";

function reminderKey(offsets: number[]): string {
  const first = offsets[0];
  if (first === undefined) return "none";
  return REMINDERS.find((r) => r.minutes[0] === first)?.key ?? "30";
}

// Create when `event` is null, edit otherwise. Editing a repeating event edits
// the whole series; the date shift is applied to the series start so the
// pattern keeps its shape.
export function EventModal({
  event,
  visible,
  onClose,
  onSaved,
  onDelete,
  defaultStart,
}: {
  event: CalendarOccurrence | null;
  onDelete?: (ev: CalendarOccurrence) => void;
  defaultStart?: Date;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(roundedNextHour);
  const [kind, setKind] = useState<CalendarKind>("event");
  const [repeat, setRepeat] = useState<Recurrence>("none");
  const [reminder, setReminder] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the form whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (event) {
      setTitle(event.title);
      setLocation(event.location ?? "");
      setStart(new Date(event.starts_at));
      setKind(event.kind);
      setRepeat(event.recurrence);
      setReminder(reminderKey(event.reminder_offsets));
    } else {
      setTitle("");
      setLocation("");
      setStart(defaultStart ?? roundedNextHour());
      setKind("event");
      setRepeat("none");
      setReminder("30");
    }
  }, [visible, event, defaultStart]);

  const save = async () => {
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const reminderMinutes = REMINDERS.find((r) => r.key === reminder)?.minutes ?? [];
      if (event) {
        const patch: Partial<CalendarEventInput> = {
          title: title.trim(),
          kind,
          recurrence: repeat,
          location: location.trim() || null,
        };
        // Only touch reminders if the user changed them (custom offsets, e.g. a bill's
        // "9am the day before", aren't representable in the picker and must survive an edit).
        if (reminder !== reminderKey(event.reminder_offsets)) patch.reminder_offsets = reminderMinutes;
        let picked = start;
        if (event.all_day) picked = new Date(start.getFullYear(), start.getMonth(), start.getDate()); // local midnight
        const shiftMs = picked.getTime() - new Date(event.starts_at).getTime();
        if (shiftMs !== 0) {
          patch.starts_at = new Date(new Date(event.series_starts_at).getTime() + shiftMs).toISOString();
        }
        await updateCalendarEvent(event.id, patch);
      } else {
        await createCalendarEvent({
          title: title.trim(),
          starts_at: start.toISOString(),
          kind,
          recurrence: repeat,
          location: location.trim() || null,
          reminder_offsets: reminderMinutes,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <ScrollView contentContainerStyle={[styles.modalBody, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{event ? "Edit event" : "New event"}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface1, borderColor: colors.hairline }]}
            autoFocus={!event}
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Location (optional)"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface1, borderColor: colors.hairline }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {event && event.recurrence !== "none" ? "When (this occurrence — moves the whole series)" : "When"}
          </Text>
          <DateTimePicker
            value={start}
            mode={event?.all_day ? "date" : "datetime"}
            display="compact"
            onChange={(_e, d) => d && setStart(d)}
            themeVariant={colors.bg === "#0F172A" ? "dark" : "light"}
            style={{ alignSelf: "flex-start" }}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Type</Text>
          <SegmentedControl options={KINDS} value={kind} onChange={setKind} />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Repeats</Text>
          <SegmentedControl options={REPEATS} value={repeat} onChange={setRepeat} />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Remind me</Text>
          <SegmentedControl
            options={REMINDERS.map((r) => ({ key: r.key, label: r.label }))}
            value={reminder}
            onChange={setReminder}
          />

          {error ? <ErrorBanner message={error} /> : null}
          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton label={event ? "Save changes" : "Save event"} onPress={save} loading={saving} />
          </View>
          {event && onDelete ? (
            <Pressable onPress={() => onDelete(event)} style={{ alignSelf: "center", paddingVertical: spacing.md }}>
              <Text style={{ color: colors.bad, fontFamily: fonts.geistMedium, fontSize: 15 }}>
                {event.recurrence !== "none" ? "Delete all repeats" : "Delete event"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
