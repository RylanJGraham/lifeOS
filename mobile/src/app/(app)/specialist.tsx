import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput, Pressable, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SendHorizonal, HeartPulse, Salad, Dumbbell, Zap, MessageCircle, FolderLock, BrainCircuit, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { sendPersonaChat, type PersonaKey } from "@/lib/api";
import { resolveInsight } from "@/lib/queries";
import { colors, radius, spacing, fonts, withAlpha } from "@/theme";
import { Surface, SectionLabel, LoadingState, EmptyState, ScreenHeader, AccentCard, Pill, Dot, MetaRow, HEADER_BAR_HEIGHT } from "@/components/ui";

const PERSONAS: { key: PersonaKey; name: string; tagline: string; memoryDomain: string; color: string; icon: typeof HeartPulse }[] = [
  { key: "doctor", name: "Dr. Ada", tagline: "Cardiovascular & medical", memoryDomain: "medical", color: colors.cardio, icon: HeartPulse },
  { key: "nutritionist", name: "Nora", tagline: "Nutrition & fueling", memoryDomain: "nutrition", color: colors.nutrition, icon: Salad },
  { key: "pt", name: "Kane", tagline: "Training & recovery", memoryDomain: "training", color: colors.kinematic, icon: Dumbbell },
];

interface Insight {
  id: string;
  insight_text: string;
  action_item: string | null;
  generated_at: string;
}

interface Memory {
  id: string;
  content: string;
  created_at: string;
}

// Compact "3h ago" / "2d ago" style label — matches the mono timestamp
// treatment used elsewhere (metaRow/pod captions) without inventing a
// precision the source timestamp doesn't have.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function SpecialistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<PersonaKey>("doctor");
  const persona = PERSONAS.find((p) => p.key === activeKey)!;

  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const historyKey = `lifeos_persona_chat_${activeKey}`;

  const fetchInsights = useCallback(async () => {
    const [insightsRes, memoriesRes] = await Promise.all([
      supabase.from("ai_insights").select("id, insight_text, action_item, generated_at").eq("domain", activeKey).order("generated_at", { ascending: false }).limit(15),
      supabase.from("memories").select("id, content, created_at").eq("domain", persona.memoryDomain).order("created_at", { ascending: false }).limit(10),
    ]);
    setInsights((insightsRes.data as Insight[]) ?? []);
    setMemories((memoriesRes.data as Memory[]) ?? []);
  }, [activeKey, persona.memoryDomain]);

  useEffect(() => {
    setLoading(true);
    setHistory([]);
    AsyncStorage.getItem(historyKey).then((raw) => {
      if (raw) setHistory(JSON.parse(raw));
    });
    fetchInsights().finally(() => setLoading(false));
  }, [historyKey, fetchInsights]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInsights();
    setRefreshing(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const nextHistory = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setInput("");
    setSending(true);
    try {
      const res = await sendPersonaChat(activeKey, text, history.slice(-20));
      const withReply = [...nextHistory, { role: "assistant", content: res.reply }];
      setHistory(withReply);
      AsyncStorage.setItem(historyKey, JSON.stringify(withReply.slice(-100))).catch(() => {});
      if (res.changed) fetchInsights();
    } catch (err) {
      setHistory((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "request failed"}` }]);
    } finally {
      setSending(false);
    }
  };

  const oldestMemoryDays =
    memories.length > 0
      ? Math.max(1, Math.round((Date.now() - new Date(memories[memories.length - 1].created_at).getTime()) / 86400000))
      : null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
      {/* Persona switcher — 3 pillars */}
      <View style={styles.personaSelector}>
        {PERSONAS.map((p) => {
          const active = p.key === activeKey;
          const Icon = p.icon;
          return (
            <Pressable
              key={p.key}
              onPress={() => setActiveKey(p.key)}
              style={[styles.personaTab, active && styles.personaTabActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon size={15} color={active ? p.color : colors.textTertiary} />
                <Text style={[styles.personaTabLabel, active && { color: colors.textPrimary }]}>{p.name}</Text>
              </View>
              <Text style={styles.personaTabSub}>{p.tagline.split(" & ")[0]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected advisor identity */}
      <Surface style={styles.identityCard}>
        <View style={styles.identityHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Dot color={persona.color} size={9} />
            <View>
              <Text style={styles.identityName}>{persona.name}</Text>
              <Text style={styles.identityTagline}>{persona.tagline}</Text>
            </View>
          </View>
          <Pill label="ACTIVE" color={persona.color} />
        </View>
        <View style={styles.identityWell}>
          <MetaRow label="Last insight" value={insights[0] ? relativeTime(insights[0].generated_at) : "—"} />
          <MetaRow label="On record" value={`${memories.length} facts`} />
        </View>
      </Surface>

      {/* Consultation chat */}
      <Surface style={styles.chatCard}>
        <View style={styles.chatHeader}>
          <MessageCircle size={14} color={persona.color} />
          <Text style={styles.chatHeaderText}>Consultation</Text>
        </View>
        {history.length === 0 ? (
          <Text style={styles.emptyChat}>Ask {persona.name} anything.</Text>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {history.slice(-6).map((m, i) => {
              const isUser = m.role === "user";
              return (
                <View key={i} style={[styles.chatBubbleRow, isUser && styles.chatBubbleRowUser]}>
                  <View style={[styles.chatBubble, isUser ? { backgroundColor: persona.color } : styles.chatBubbleAdvisor]}>
                    <Text style={[styles.chatBubbleText, isUser && { color: colors.textInverse }]}>{m.content}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder={`Message ${persona.name}…`}
            placeholderTextColor={colors.textTertiary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
          />
          <Pressable onPress={send} disabled={sending || !input.trim()} style={[styles.sendButton, { backgroundColor: persona.color }]}>
            {sending ? <ActivityIndicator size="small" color={colors.textInverse} /> : <SendHorizonal size={16} color={colors.textInverse} />}
          </Pressable>
        </View>
      </Surface>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <SectionLabel title="Advisory insights" subtitle={`${insights.length} on file`} />
          {insights.length === 0 ? (
            <EmptyState label="No insights yet." icon={<BrainCircuit size={32} color={colors.textTertiary} />} />
          ) : (
            insights.map((i) => (
              <AccentCard
                key={i.id}
                tier={i.action_item ? "critical" : "standard"}
                color={persona.color}
                badgeLabel={persona.name.toUpperCase()}
                metaRight={relativeTime(i.generated_at)}
                title={i.insight_text}
                footer={
                  <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    {i.action_item ? (
                      <View style={styles.actionRow}>
                        <Zap size={12} color={persona.color} />
                        <Text style={[styles.actionRowText, { color: persona.color }]}>{i.action_item}</Text>
                      </View>
                    ) : null}
                    <Pressable
                      onPress={async () => {
                        await resolveInsight(i.id);
                        fetchInsights();
                      }}
                      style={[styles.resolveButton, { backgroundColor: withAlpha(persona.color, 0.1) }]}
                    >
                      <Check size={12} color={persona.color} />
                      <Text style={[styles.resolveButtonText, { color: persona.color }]}>MARK RESOLVED</Text>
                    </Pressable>
                  </View>
                }
              />
            ))
          )}

          <SectionLabel
            title="On record"
            subtitle={oldestMemoryDays ? `Synthesized across ${oldestMemoryDays}d of history` : undefined}
          />
          {memories.length === 0 ? (
            <EmptyState label="No durable facts recorded yet." icon={<FolderLock size={32} color={colors.textTertiary} />} />
          ) : (
            <Surface style={styles.recordCard}>
              <View style={styles.recordHeaderRow}>
                <FolderLock size={13} color={colors.textTertiary} />
                <Text style={styles.recordHeaderText}>Persistent memory</Text>
              </View>
              <View style={styles.tagCloud}>
                {memories.map((m) => (
                  <Pill key={m.id} label={m.content} color={persona.color} dim />
                ))}
              </View>
            </Surface>
          )}
        </>
      )}
      </ScrollView>
      <ScreenHeader title="Specialist Advisors" statusLabel={persona.name.toUpperCase()} statusColor={persona.color} onBack={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },

  personaSelector: { flexDirection: "row", gap: spacing.xs, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginBottom: spacing.md },
  personaTab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm, gap: 2 },
  personaTabActive: { backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.hairline },
  personaTabLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, color: colors.textTertiary, letterSpacing: 0.3 },
  personaTabSub: { fontFamily: fonts.geistRegular, fontSize: 10, color: colors.textTertiary },

  identityCard: { marginBottom: spacing.md },
  identityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  identityName: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 16, color: colors.textPrimary, letterSpacing: -0.2 },
  identityTagline: { fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  identityWell: { marginTop: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },

  chatCard: { marginBottom: spacing.sm },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  chatHeaderText: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, color: colors.textTertiary, letterSpacing: 0.6, textTransform: "uppercase" },
  emptyChat: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textTertiary, fontStyle: "italic" },
  chatBubbleRow: { flexDirection: "row" },
  chatBubbleRowUser: { justifyContent: "flex-end" },
  chatBubble: { maxWidth: "85%", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chatBubbleAdvisor: { backgroundColor: colors.surface2 },
  chatBubbleText: { fontFamily: fonts.geistRegular, fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  chatInputRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  chatInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 13, color: colors.textPrimary, fontFamily: fonts.geistRegular },
  sendButton: { borderRadius: radius.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  actionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs, backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  actionRowText: { flex: 1, fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 0.2, textTransform: "uppercase" },
  resolveButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  resolveButtonText: { fontFamily: fonts.monoSemiBold, fontSize: 10, letterSpacing: 0.2, textTransform: "uppercase" },

  recordCard: {},
  recordHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  recordHeaderText: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.textTertiary, letterSpacing: 0.4, textTransform: "uppercase" },
  tagCloud: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
