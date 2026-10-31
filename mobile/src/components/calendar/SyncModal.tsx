import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, fonts } from "@/theme";
import {
  fetchCalendarSubscriptions,
  addCalendarSubscription,
  syncCalendarSubscription,
  deleteCalendarSubscription,
  type CalendarSubscription,
} from "@/lib/api";
import { Surface, ErrorBanner, PrimaryButton } from "@/components/ui";
import { calStyles as styles } from "./shared";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

// Link external calendars INTO LifeOS (Outlook "publish" link) and share
// LifeOS OUT to other apps.
export function SyncModal({
  visible,
  onClose,
  onChanged,
  onShareFeed,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
  onShareFeed: (rotate: boolean) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [subs, setSubs] = useState<CalendarSubscription[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("Outlook");
  const [hideDetails, setHideDetails] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSubs((await fetchCalendarSubscriptions()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setError(null);
      load();
    }
  }, [visible, load]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run("add", async () => {
      if (!url.trim()) throw new Error("Paste your calendar link first.");
      await addCalendarSubscription(name.trim() || "Outlook", url.trim(), hideDetails ? "busy" : "full");
      setUrl("");
    });

  const remove = (s: CalendarSubscription) =>
    Alert.alert("Remove calendar?", `${s.name}'s events will disappear from LifeOS (your Outlook calendar is untouched).`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => run(`rm-${s.id}`, () => deleteCalendarSubscription(s.id)) },
    ]);

  const box = [styles.input, { color: colors.textPrimary, backgroundColor: colors.surface1, borderColor: colors.hairline }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={[styles.modalBody, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Sync calendars</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium, fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>

          <Text style={[styles.syncHeading, { color: colors.textPrimary }]}>Bring Outlook into LifeOS</Text>
          <Text style={[styles.syncHelp, { color: colors.textSecondary }]}>
            In Outlook on the web: Settings (gear) → Calendar → Shared calendars → Publish a calendar → pick the calendar, choose
            "Can view all details" → Publish → copy the ICS link and paste it below. Events appear here read-only and refresh
            every 30 minutes.
          </Text>
          <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Work)" placeholderTextColor={colors.textTertiary} style={box} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://outlook.office365.com/…/calendar.ics"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={box}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary, fontSize: 14 }]}>Hide meeting details</Text>
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                Store only that you're busy — titles, places and notes never reach LifeOS.
              </Text>
            </View>
            <Switch value={hideDetails} onValueChange={setHideDetails} />
          </View>
          <PrimaryButton label={busy === "add" ? "Linking… importing events" : "Link calendar"} onPress={add} loading={busy === "add"} />
          {error ? <ErrorBanner message={error} /> : null}

          {subs.length > 0 ? <Text style={[styles.syncHeading, { color: colors.textPrimary, marginTop: spacing.lg }]}>Linked calendars</Text> : null}
          {subs.map((s) => (
            <Surface key={s.id} style={styles.card}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{s.name}</Text>
              <Text style={[styles.meta, { color: s.last_error ? colors.bad : colors.textSecondary }]}>
                {s.last_error ? s.last_error : `${s.event_count} events · synced ${ago(s.last_synced_at)}`}
              </Text>
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                {s.host} · {s.privacy === "busy" ? "busy only" : "full details"} · link stored encrypted
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                <Pressable onPress={() => run(`sync-${s.id}`, () => syncCalendarSubscription(s.id))} disabled={busy !== null}>
                  <Text style={{ color: colors.focus, fontFamily: fonts.geistMedium }}>{busy === `sync-${s.id}` ? "Syncing…" : "Sync now"}</Text>
                </Pressable>
                <Pressable onPress={() => remove(s)} disabled={busy !== null}>
                  <Text style={{ color: colors.bad, fontFamily: fonts.geistMedium }}>Remove</Text>
                </Pressable>
              </View>
            </Surface>
          ))}

          <Text style={[styles.syncHeading, { color: colors.textPrimary, marginTop: spacing.lg }]}>Send LifeOS to other calendars</Text>
          <Text style={[styles.syncHelp, { color: colors.textSecondary }]}>
            Share a link that Outlook, Google or Apple Calendar can subscribe to (one-way: LifeOS → them). Your Outlook events
            are not included, so nothing loops back.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.lg }}>
            <Pressable onPress={() => onShareFeed(false)}><Text style={{ color: colors.focus, fontFamily: fonts.geistMedium }}>Share link</Text></Pressable>
            <Pressable onPress={() => onShareFeed(true)}><Text style={{ color: colors.bad, fontFamily: fonts.geistMedium }}>Reset link</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
