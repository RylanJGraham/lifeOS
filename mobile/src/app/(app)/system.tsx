import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Constants from "expo-constants";
import { Server, Database, Cpu, Webhook, Upload, Play } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { getBackendStatus, getTelegramWebhookInfo, getPipelines, runPipeline, uploadStatement, API_URL, type Pipeline, type BackendStatus, type TelegramWebhookInfo } from "@/lib/api";
import { colors, radius, spacing, fonts } from "@/theme";
import { Surface, SectionLabel, LoadingState, Pill, ScreenHeader, PodGrid, Pod, AccentCard, MetaRow, ListRow, Dot, HEADER_BAR_HEIGHT } from "@/components/ui";

interface SystemLog {
  timestamp: string;
  level: string;
  service: string;
  message: string;
}

function levelColor(level: string) {
  if (["ERROR", "CRITICAL", "ALERT"].includes(level)) return colors.bad;
  if (level === "WARNING") return colors.warn;
  return colors.textTertiary;
}

function pipelineColor(status: string) {
  if (status === "running") return colors.trends;
  if (status === "error") return colors.bad;
  return colors.neutral;
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [webhook, setWebhook] = useState<TelegramWebhookInfo | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    const [statusRes, webhookRes, pipelinesRes, logsRes] = await Promise.allSettled([
      getBackendStatus(),
      getTelegramWebhookInfo(),
      getPipelines(),
      supabase.from("system_logs").select("timestamp, level, service, message").order("timestamp", { ascending: false }).limit(20),
    ]);
    if (statusRes.status === "fulfilled") setStatus(statusRes.value);
    if (webhookRes.status === "fulfilled") setWebhook(webhookRes.value);
    if (pipelinesRes.status === "fulfilled") setPipelines(pipelinesRes.value);
    if (logsRes.status === "fulfilled" && logsRes.value.data) setLogs(logsRes.value.data as SystemLog[]);
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const pickStatement = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      const res = await uploadStatement(result.assets[0].uri, result.assets[0].name);
      setUploadStatus(res.message ?? "Parsed via OpenRouter vision and inserted as transactions.");
    } catch (err) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : "upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRunPipeline = async (id: string) => {
    setRunErrors((e) => ({ ...e, [id]: "" }));
    setRunningIds((r) => ({ ...r, [id]: true }));
    try {
      await runPipeline(id);
      await fetchAll();
    } catch (err) {
      setRunErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Failed to run" }));
      setTimeout(() => setRunErrors((e) => ({ ...e, [id]: "" })), 5000);
    } finally {
      setRunningIds((r) => ({ ...r, [id]: false }));
    }
  };

  if (loading) return <LoadingState label="Loading System…" />;

  const services = status?.services;
  const serviceEntries: { key: string; label: string; caption: string; icon: React.ReactNode }[] = [
    { key: "openrouter", label: "OpenRouter", caption: "LLM routing & extraction", icon: <Cpu size={14} color={colors.textTertiary} /> },
    { key: "supabase", label: "Supabase", caption: "Persistence & auth", icon: <Database size={14} color={colors.textTertiary} /> },
    { key: "ngrok", label: "Ngrok", caption: "Telegram tunnel", icon: <Server size={14} color={colors.textTertiary} /> },
  ];
  const servicesOk = services ? services.openrouter === "ok" && services.supabase === "ok" : false;
  const okCount = services ? Object.values(services).filter((v) => v === "ok").length : 0;
  const totalCount = services ? Object.keys(services).length : 0;
  const errorLogCount = logs.filter((l) => ["ERROR", "CRITICAL", "ALERT"].includes(l.level)).length;
  const statusLabel = !status ? "UNKNOWN" : servicesOk ? "NOMINAL" : "DEGRADED";
  const statusColor = !status ? colors.neutral : servicesOk ? colors.good : colors.bad;

  const runningCount = pipelines.filter((p) => p.status === "running").length;
  const appVersion = Constants.expoConfig?.version ?? "dev";
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? Constants.expoConfig?.android?.package ?? "";

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
      <Surface style={styles.statusStrip}>
        <View style={styles.statusStripLeft}>
          <Dot color={statusColor} size={8} />
          <Text style={styles.statusStripText}>
            {status ? `${okCount}/${totalCount} SERVICES NOMINAL` : "STATUS UNAVAILABLE"}
          </Text>
        </View>
        <Pill label={statusLabel} color={statusColor} />
      </Surface>

      <SectionLabel title="Core services" />
      <PodGrid>
        {serviceEntries.map((s) => {
          const value = services?.[s.key as keyof typeof services];
          const ok = value === "ok";
          return (
            <Pod
              key={s.key}
              label={s.label}
              value={!status ? "—" : ok ? "Online" : "Down"}
              accent={!status ? colors.neutral : ok ? colors.good : colors.bad}
              caption={s.caption}
            />
          );
        })}
      </PodGrid>

      <SectionLabel title="Ingestion & stream carriers" />
      <Surface>
        <ListRow
          icon={<Webhook size={16} color={colors.textTertiary} />}
          title="Telegram webhook"
          subtitle={webhook?.webhook_url ?? "Not configured"}
          trailing={webhook?.webhook_status ?? "unknown"}
          trailingColor={webhook?.webhook_status === "ok" ? colors.good : webhook?.webhook_status === "not_set" ? colors.neutral : colors.bad}
        />
        {webhook?.pending_update_count != null ? (
          <MetaRow label="Pending updates" value={String(webhook.pending_update_count)} />
        ) : null}
        {webhook?.error ? <Text style={[styles.detailText, { color: colors.bad }]}>{webhook.error}</Text> : null}
      </Surface>

      <SectionLabel title="Pipelines" subtitle={`${pipelines.length} registered · ${runningCount} running`} />
      {pipelines.length === 0 ? (
        <Surface><Text style={styles.detailText}>No pipelines registered.</Text></Surface>
      ) : (
        pipelines.map((p) => (
          <AccentCard
            key={p.id}
            color={pipelineColor(p.status)}
            badgeLabel={p.status.toUpperCase()}
            metaRight={p.schedule ?? undefined}
            title={p.name}
            detail={p.description}
            footer={
              <View style={styles.pipelineFooter}>
                <MetaRow label="Last run" value={formatWhen(p.last_started_at)} />
                {p.last_error ? <MetaRow label="Last error" value={p.last_error} valueColor={colors.bad} /> : null}
                <Pressable
                  style={[styles.runButton, runningIds[p.id] && { opacity: 0.6 }]}
                  onPress={() => handleRunPipeline(p.id)}
                  disabled={runningIds[p.id]}
                >
                  {runningIds[p.id] ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Play size={12} color={colors.textSecondary} />
                  )}
                  <Text style={styles.runButtonText}>{runningIds[p.id] ? "Running…" : "Run now"}</Text>
                </Pressable>
                {runErrors[p.id] ? <Text style={[styles.detailText, { color: colors.bad }]}>{runErrors[p.id]}</Text> : null}
              </View>
            }
          />
        ))
      )}

      <SectionLabel title="Diagnostics" />
      <Surface>
        <ListRow
          icon={<Upload size={16} color={colors.textTertiary} />}
          title="Upload bank statement"
          subtitle={uploading ? "Uploading…" : "PDF → parsed via OpenRouter vision"}
          onPress={uploading ? undefined : pickStatement}
        />
        {uploadStatus ? <Text style={styles.detailText}>{uploadStatus}</Text> : null}
      </Surface>

      {logs.length > 0 ? (
        <>
          <SectionLabel title="Live system logs" subtitle={errorLogCount > 0 ? `${errorLogCount} errors in last 20` : undefined} />
          <Surface>
            {logs.map((log, i) => (
              <View key={i} style={[styles.logRow, i > 0 && styles.logRowDivider]}>
                <Dot color={levelColor(log.level)} size={6} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logMessage} numberOfLines={1}>
                    <Text style={{ color: levelColor(log.level), fontFamily: fonts.monoSemiBold }}>{log.level}</Text>
                    {"  "}
                    {log.service}: {log.message}
                  </Text>
                </View>
                <Text style={styles.detailText}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>LIFEOS MOBILE · v{appVersion}</Text>
        {bundleId ? <Text style={styles.footerSub}>{bundleId}</Text> : null}
      </View>
      </ScrollView>
      <ScreenHeader title="System" subtitle={API_URL} statusLabel={statusLabel} statusColor={statusColor} onBack={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },
  statusStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  statusStripLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusStripText: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, color: colors.textPrimary, letterSpacing: 0.4 },
  detailText: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  pipelineFooter: { marginTop: spacing.xs, gap: 2 },
  runButton: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  runButtonText: { fontFamily: fonts.monoSemiBold, fontSize: 11, color: colors.textSecondary },
  logRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10 },
  logRowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  logMessage: { fontSize: 12, color: colors.textPrimary },
  footer: { alignItems: "center", gap: 2, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  footerText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6 },
  footerSub: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.textTertiary },
});
