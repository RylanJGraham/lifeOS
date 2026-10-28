import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, spacing, fonts, type } from "@/theme";
import { ScreenHeader, Surface, LoadingState, ErrorBanner, MetaRow, HEADER_BAR_HEIGHT } from "@/components/ui";

interface Report {
  id: string;
  report_date: string;
  title: string | null;
  market_regime: string | null;
  vix_level: number | null;
  portfolio_value: number | null;
  html_content: string | null;
  json_content: Record<string, unknown> | null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatActionableSignals(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const signals = json.actionable_signals as { action: string; symbol: string; confidence?: number }[] | undefined;
  if (!signals || signals.length === 0) return null;
  return signals.map((s) => `${s.action} ${s.symbol}${s.confidence != null ? ` (${Math.round(s.confidence * 100)}%)` : ""}`).join(" · ");
}

export default function ReportDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(id ? null : "Missing report id");

  useEffect(() => {
    if (!id) return;
    supabase
      .from("advisor_daily_reports")
      .select("id, report_date, title, market_regime, vix_level, portfolio_value, html_content, json_content")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setReport(data as Report);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) return <LoadingState label="Loading report…" />;
  if (error || !report) return <ErrorBanner message={error ?? "Report not found"} />;

  const bodyText = report.html_content ? stripHtml(report.html_content) : null;
  const signalsText = formatActionableSignals(report.json_content);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + HEADER_BAR_HEIGHT + spacing.md, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <Surface style={styles.headerCard}>
          <View style={styles.iconRow}>
            <FileText size={20} color={colors.trends} />
            <Text style={styles.date}>{report.report_date}</Text>
          </View>
          <Text style={styles.title}>{report.title ?? `Daily report ${report.report_date}`}</Text>
          <View style={styles.metaGrid}>
            {report.market_regime ? <MetaRow label="Regime" value={report.market_regime} /> : null}
            {report.vix_level != null ? <MetaRow label="VIX" value={report.vix_level.toFixed(1)} /> : null}
            {report.portfolio_value != null ? <MetaRow label="Portfolio" value={`€${report.portfolio_value.toFixed(0)}`} /> : null}
          </View>
        </Surface>

        {signalsText ? (
          <Surface style={styles.signalsCard}>
            <Text style={styles.sectionLabel}>ACTIONABLE SIGNALS</Text>
            <Text style={styles.signalsText}>{signalsText}</Text>
          </Surface>
        ) : null}

        {bodyText ? (
          <Surface style={styles.bodyCard}>
            <Text style={styles.sectionLabel}>BRIEFING</Text>
            <Text style={styles.bodyText}>{bodyText}</Text>
          </Surface>
        ) : null}
      </ScrollView>
      <ScreenHeader title="Advisor Report" onBack={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  headerCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  date: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  title: {
    ...type.heading,
    fontSize: 20,
    color: colors.textPrimary,
  },
  metaGrid: {
    gap: 2,
    marginTop: spacing.xs,
  },
  signalsCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bodyCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  signalsText: {
    ...type.body,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  bodyText: {
    ...type.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
