import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Plus, SendHorizonal, X, FileText } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { sendChat, uploadStatement, type UIBlock } from "@/lib/api";
import { colors as lightColors, radius, spacing, fonts, withAlpha } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader, SectionLabel, NavRow, Dot, FormattedText, ChatBlock, HEADER_BAR_HEIGHT } from "@/components/ui";

type Attachment =
  | { id: string; kind: "image"; uri: string; base64: string }
  | { id: string; kind: "file"; uri: string; name: string };

interface ChatMessage {
  role: "user" | "agent" | "system" | "error";
  text: string;
  ts: number;
  imageUri?: string;
  fileName?: string;
  ui?: UIBlock | null;
}

const STORAGE_KEY = "lifeos_chat_history";
const SESSION_KEY = "lifeos_chat_session_id";
const MAX_STORED = 100;

const QUICK_ACTIONS = [
  "What did I eat today?",
  "How's my training load?",
  "Portfolio summary",
  "Log a workout",
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { camera } = useLocalSearchParams<{ camera?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const sessionIdRef = useRef<string>("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setMessages(JSON.parse(raw).slice(-MAX_STORED));
      } catch {
        // Corrupt history — start fresh.
      }
      let sid = await AsyncStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await AsyncStorage.setItem(SESSION_KEY, sid);
      }
      sessionIdRef.current = sid;
    })();
  }, []);

  useEffect(() => {
    const storable = messages.slice(-MAX_STORED).map(({ imageUri, fileName, ...m }) => m);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storable)).catch(() => {});
  }, [messages]);

  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, allowsMultipleSelection: true });

    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets
      .filter((a) => a.base64)
      .map((a) => ({ id: makeId(), kind: "image" as const, uri: a.uri, base64: a.base64! }));
    setAttachments((prev) => [...prev, ...picked]);
  }, []);

  useEffect(() => {
    if (camera === "1") {
      const timer = setTimeout(() => pickImage(true), 400);
      return () => clearTimeout(timer);
    }
  }, [camera, pickImage]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true });
    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets.map((a) => ({ id: makeId(), kind: "file" as const, uri: a.uri, name: a.name }));
    setAttachments((prev) => [...prev, ...picked]);
  };

  const openAttachSheet = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library", "Choose PDF"],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) pickImage(true);
          if (index === 2) pickImage(false);
          if (index === 3) pickFile();
        },
      );
    } else {
      pickFile();
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (uploading) return;

    const currentAttachments = attachments;
    const imageUris = currentAttachments.filter((a) => a.kind === "image").map((a) => a.uri);
    const fileNames = currentAttachments.filter((a) => a.kind === "file").map((a) => a.name);
    const userMsg: ChatMessage = {
      role: "user",
      text,
      ts: Date.now(),
      imageUri: imageUris[0],
      fileName: fileNames[0],
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setSending(true);

    try {
      const imagesToSend = currentAttachments
        .filter((a): a is Attachment & { kind: "image" } => a.kind === "image")
        .map((a) => a.base64);
      const filesToSend = currentAttachments
        .filter((a): a is Attachment & { kind: "file" } => a.kind === "file");

      let messageText = text;
      let uploadRefs: string[] = [];

      if (filesToSend.length > 0) {
        setUploading(true);
        try {
          const results = await Promise.all(
            filesToSend.map((f) => uploadStatement(f.uri, f.name).catch((e) => ({ status: "error", error: e, name: f.name })))
          );
          uploadRefs = results
            .filter((r): r is { status: string; upload_id?: string | null; name: string } => r.status !== "error")
            .map((r) => `${r.name}${r.upload_id ? ` (upload_id: ${r.upload_id})` : ""}`);
          const failures = results.filter((r) => r.status === "error");
          if (failures.length > 0) {
            setMessages((prev) => [
              ...prev,
              {
                role: "error",
                text: `PDF upload failed for: ${failures.map((f: any) => f.name).join(", ")}`,
                ts: Date.now(),
              },
            ]);
          }
        } finally {
          setUploading(false);
        }
        if (uploadRefs.length > 0) {
          const fileNote = `I uploaded PDF statement(s): ${uploadRefs.join(", ")}. They're queued for parsing via the pdf-statement-sync pipeline.`;
          messageText = text ? `${text}\n\n${fileNote}` : fileNote;
        }
      }

      const res = await sendChat(messageText, imagesToSend.length > 0 ? imagesToSend : undefined, sessionIdRef.current);
      setMessages((prev) => [...prev, { role: "agent", text: res.reply, ts: Date.now(), ui: res.ui }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: err instanceof Error ? err.message : "Chat request failed", ts: Date.now() },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1 }}>
        {messages.length === 0 ? (
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={[styles.emptyScroll, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md }]}
            keyboardShouldPersistTaps="handled"
          >
            <SectionLabel title="Quick prompts" subtitle="Tap to prefill" />
            <View style={styles.navList}>
              {QUICK_ACTIONS.map((q) => (
                <NavRow
                  key={q}
                  title={q}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setInput(q);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.scrollFlex}
            data={messages}
            keyExtractor={(m) => String(m.ts)}
            contentContainerStyle={[styles.list, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.lg }]}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isUser = item.role === "user";
              const isError = item.role === "error";
              // Structured replies render as a card (ChatBlock) instead of a
              // prose bubble — the block already carries any insight text,
              // so showing both would just repeat the same numbers twice.
              if (item.ui && !isUser) {
                return (
                  <View style={styles.blockWrap}>
                    <ChatBlock block={item.ui} />
                    <Text style={styles.bubbleTime}>{formatTime(item.ts)}</Text>
                  </View>
                );
              }
              return (
                <View
                  style={[
                    styles.bubble,
                    isUser ? styles.bubbleUser : styles.bubbleAgent,
                    isError && styles.bubbleError,
                  ]}
                >
                  {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.bubbleImage} /> : null}
                  {item.fileName ? (
                    <View style={styles.bubbleFile}>
                      <FileText size={16} color={isUser ? colors.textInverse : colors.textSecondary} />
                      <Text
                        style={[styles.bubbleFileName, isUser && styles.bubbleFileNameUser]}
                        numberOfLines={1}
                      >
                        {item.fileName}
                      </Text>
                    </View>
                  ) : null}
                  {item.text ? (
                    <FormattedText
                      text={item.text}
                      style={[styles.bubbleText, isUser && styles.bubbleTextUser]}
                      boldStyle={isUser ? { color: colors.textInverse } : undefined}
                    />
                  ) : null}
                  <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>{formatTime(item.ts)}</Text>
                </View>
              );
            }}
          />
        )}
      </View>
      <ScreenHeader title="Ingest" subtitle="Log meals, workouts, trades, or ask about your data." statusLabel="READY" statusColor={colors.good} />

      {sending ? (
        <View style={styles.typingRow}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.focus} />
          ) : (
            <Dot color={colors.focus} size={6} />
          )}
          <Text style={styles.typingText}>{uploading ? "Uploading PDF…" : "Extracting…"}</Text>
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.attachmentPreview}
          contentContainerStyle={styles.attachmentRow}
        >
          {attachments.map((a) => (
            <View key={a.id} style={styles.attachmentItem}>
              {a.kind === "image" ? (
                <Image source={{ uri: a.uri }} style={styles.attachmentThumb} />
              ) : (
                <View style={styles.attachmentFileThumb}>
                  <FileText size={22} color={colors.textSecondary} />
                  <Text style={styles.attachmentFileName} numberOfLines={2}>
                    {a.name}
                  </Text>
                </View>
              )}
              <Pressable onPress={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} style={styles.attachmentRemove}>
                <X size={14} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {messages.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.quickRow}
          contentContainerStyle={styles.quickRowContent}
        >
          {QUICK_ACTIONS.map((q) => (
            <Pressable
              key={q}
              style={styles.quickChip}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setInput(q);
              }}
            >
              <Text style={styles.quickChipText} numberOfLines={1}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.inputBar, { marginBottom: insets.bottom + 56 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            openAttachSheet();
          }}
          style={({ pressed }) => [styles.iconButton, pressed && { transform: [{ scale: 0.9 }] }]}
        >
          <Plus size={19} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Message Human Engine…"
          placeholderTextColor={colors.textTertiary}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            send();
          }}
          disabled={sending || uploading || (!input.trim() && attachments.length === 0)}
          style={[styles.sendButton, (sending || uploading || (!input.trim() && attachments.length === 0)) && styles.sendButtonDisabled]}
        >
          <SendHorizonal size={17} color={colors.textInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollFlex: { flex: 1 },
  emptyScroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  navList: { backgroundColor: colors.surface1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  blockWrap: { maxWidth: "92%", alignSelf: "flex-start", marginBottom: spacing.sm },
  bubble: {
    maxWidth: "85%",
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleAgent: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.focus,
    borderTopRightRadius: 4,
  },
  bubbleError: { backgroundColor: withAlpha(colors.bad, 0.1), borderColor: withAlpha(colors.bad, 0.3) },
  bubbleText: { fontFamily: fonts.geistRegular, fontSize: 14.5, color: colors.textPrimary, lineHeight: 20 },
  bubbleTextUser: { color: colors.textInverse },
  bubbleImage: { width: 200, height: 150, borderRadius: radius.md, marginBottom: spacing.xs },
  bubbleFile: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  bubbleFileName: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  bubbleFileNameUser: { color: withAlpha(colors.textInverse, 0.85) },
  bubbleTime: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary, marginTop: 4 },
  bubbleTimeUser: { color: withAlpha(colors.textInverse, 0.7) },
  typingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  typingText: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  attachmentPreview: { maxHeight: 76, paddingVertical: spacing.xs },
  attachmentRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  attachmentItem: { position: "relative", marginRight: spacing.sm },
  attachmentThumb: { width: 60, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface1 },
  attachmentFileThumb: {
    width: 140,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  attachmentFileName: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
  attachmentRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: colors.bad,
    borderRadius: radius.full,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRow: { flexGrow: 0, paddingTop: spacing.xs },
  quickRowContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  quickChip: {
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginRight: spacing.xs,
  },
  quickChipText: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.textSecondary },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.hairline,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconButton: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: spacing.xs,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: fonts.geistRegular,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  sendButton: { backgroundColor: colors.focus, borderRadius: radius.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.5 },
});
}
