import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Pressable, type StyleProp, type ViewStyle, type TextStyle, type KeyboardTypeOptions } from "react-native";
import { ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Polyline } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type, withAlpha, fonts } from "@/theme";
import { useTheme } from "@/theme/ThemeProvider";

// Height (excluding the safe-area inset, which ScreenHeader adds itself)
// every screen reserves at the top of its scroll content to clear the fixed,
// blurred ScreenHeader bar. Screens compute `insets.top + HEADER_BAR_HEIGHT`.
export const HEADER_BAR_HEIGHT = 64;

// "Telemetry Pod" — the primary card container across the app. Elevated
// (soft shadow) rather than purely bordered, matching the Stitch "Instrument
// Pod" elevation spec.
export function Surface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.surface, { backgroundColor: colors.surface1, borderColor: colors.hairline }, style]}>{children}</View>;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// Fixed, blurred top bar — matches the Stitch "HE // 01" header: compact
// (not a big page-title block), pinned above scroll content, translucent.
// Screens render this OUTSIDE their ScrollView (as a sibling) and reserve
// HEADER_BAR_HEIGHT + insets.top of top padding in their scroll content.
export function ScreenHeader({
  title,
  subtitle,
  statusLabel = "NOMINAL",
  statusColor = colors.good,
  onBack,
}: {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusColor?: string;
  // Pass router.back() for screens pushed via Stack (no tab bar visible to
  // tap back to) — e.g. Goals/Specialist/System, which live outside the
  // (tabs) group. Omit for the 5 real tab screens.
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.headerBar, { paddingTop: insets.top, borderBottomColor: colors.hairline }]}>
      <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <View style={styles.headerBarRow}>
        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1, gap: spacing.sm }}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={10} style={styles.headerBackButton}>
              <ChevronRight size={16} color={colors.textPrimary} style={{ transform: [{ rotate: "180deg" }] }} />
            </Pressable>
          ) : null}
          <View style={{ flexShrink: 1 }}>
            <View style={styles.headerBrandRow}>
              <Text style={styles.brand}>HE // 01</Text>
              <Dot color={colors.good} size={5} />
            </View>
            <Text style={styles.headerScreenLabel} numberOfLines={1}>{title}</Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: withAlpha(statusColor, 0.1), borderColor: withAlpha(statusColor, 0.3) }]}>
          <Dot color={statusColor} size={6} />
          <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.headerSubtitle} numberOfLines={1}>
        {subtitle ?? " "}
      </Text>
    </View>
  );
}

// Compact metric card — 2-up grid, the "Telemetry Pod" pattern used for
// vitals/capital/fuel summaries across the app instead of plain stat rows.
export function Pod({
  label,
  value,
  unit,
  caption,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  accent: string;
}) {
  return (
    <Surface style={styles.pod}>
      <Text style={styles.podLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <Text style={[styles.podValue, { color: accent }]}>{value}</Text>
        {unit ? <Text style={styles.podUnit}>{unit}</Text> : null}
      </View>
      {caption ? <Text style={styles.podCaption}>{caption}</Text> : null}
    </Surface>
  );
}

export function PodGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.podGrid}>{children}</View>;
}

export function SectionLabel({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionLabelRow}>
      <View>
        <Text style={styles.sectionLabel}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitleSmall}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.sectionAction}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Hero numeric readout — JetBrains Mono, tabular. The primary way this app
// surfaces a metric.
export function Stat({
  label,
  value,
  unit,
  accent,
  size = "lg",
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  size?: "lg" | "md";
}) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        <Text style={[size === "lg" ? styles.statValueLg : styles.statValueMd, accent ? { color: accent } : null]}>
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// Radial progress ring — recessed well with an active status-colored arc.
export function Ring({
  progress,
  size = 64,
  strokeWidth = 7,
  color,
  track,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = circumference * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? colors.surface2} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── Sparkline ───────────────────────────────────────────────
// Mini SVG trend line — renders a normalized polyline from a series
// of numeric values. Used inside pods to show direction at a glance.
export function Sparkline({
  data,
  width = 60,
  height = 20,
  color,
  strokeWidth = 1.5,
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  strokeWidth?: number;
  fill?: boolean;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const stepX = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polylinePoints = points.join(" ");
  const areaPoints = `${pad},${height - pad} ${polylinePoints} ${width - pad},${height - pad}`;
  return (
    <Svg width={width} height={height}>
      {fill ? (
        <Polyline points={areaPoints} fill={color} fillOpacity={0.12} stroke="none" />
      ) : null}
      <Polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── AnimatedNumber ──────────────────────────────────────────
// Counts up/down from the previous value to the new value when the
// `value` prop changes. Uses requestAnimationFrame-style loop via
// setInterval (RN has no RAF). Formats via the provided formatter.
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(0),
  duration = 600,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    const start = Date.now();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        prevRef.current = to;
      }
    }, 16);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [value, duration]);

  return <Text style={style}>{format(display)}</Text>;
}

// Status Chip / Pulse Badge — [bead] [label], 8-12% tint background.
export function Pill({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, dim ? 0.08 : 0.12), borderColor: withAlpha(color, 0.3) }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      {label ? <Text style={[styles.pillText, { color }]}>{label}</Text> : null}
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// Lightweight markdown-lite renderer for assistant/backend reply text —
// supports **bold** spans and blank-line-separated paragraphs. Backend
// responses (chat, specialist advisors, goals coaching) use this instead of
// full markdown, so this intentionally only handles that subset.
export function FormattedText({
  text,
  style,
  boldStyle,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
}) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, pi) => (
        <Text key={pi} style={[style, pi > 0 ? { marginTop: spacing.xs } : null]}>
          {para.split("\n").map((line, li, arr) => (
            <Text key={li}>
              {renderBoldSegments(line, boldStyle)}
              {li < arr.length - 1 ? "\n" : ""}
            </Text>
          ))}
        </Text>
      ))}
    </>
  );
}

function renderBoldSegments(line: string, boldStyle?: StyleProp<TextStyle>) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} style={[{ fontFamily: fonts.geistMedium, color: colors.textPrimary }, boldStyle]}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

// Segmented pacing track — the "COCKPIT PACING DISPATCH" bar in the Stitch
// design: multiple colored segments laid end to end instead of a single fill.
export function PacingBar({ segments, height = 6 }: { segments: { value: number; color: string }[]; height?: number }) {
  return (
    <View style={[styles.pacingTrack, { height, borderRadius: height / 2 }]}>
      {segments.map((s, i) => (
        <View key={i} style={{ width: `${Math.max(0, Math.min(100, s.value))}%`, height: "100%", backgroundColor: s.color }} />
      ))}
    </View>
  );
}

// Ranked Action Queue card — left accent stripe + severity badge + optional
// footer (prescription row / mini pacing bar / review action).
export function AccentCard({
  tier = "standard",
  color,
  badgeLabel,
  metaRight,
  title,
  detail,
  footer,
  onPress,
}: {
  tier?: "critical" | "standard";
  color: string;
  badgeLabel: string;
  metaRight?: React.ReactNode;
  title: string;
  detail?: React.ReactNode;
  footer?: React.ReactNode;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  const critical = tier === "critical";
  return (
    <Wrapper
      onPress={
        onPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPress();
            }
          : undefined
      }
      style={({ pressed }: { pressed?: boolean }) => [
        styles.accentCard,
        critical ? { borderColor: withAlpha(color, 0.45), borderWidth: 1.5 } : { borderColor: colors.hairline, borderWidth: 1 },
        pressed && onPress ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={[styles.accentStripe, { backgroundColor: color, width: critical ? 4 : 2 }]} />
      <View style={styles.accentBody}>
        <View style={styles.accentHeader}>
          <View style={[styles.accentBadge, { backgroundColor: critical ? color : withAlpha(color, 0.12) }]}>
            <Text style={[styles.accentBadgeText, { color: critical ? colors.textInverse : color }]}>{badgeLabel}</Text>
          </View>
          {metaRight ? (
            typeof metaRight === "string" ? (
              <Text style={[styles.accentMeta, { color: critical ? color : colors.textTertiary }]}>{metaRight}</Text>
            ) : (
              metaRight
            )
          ) : null}
        </View>
        <Text style={critical ? styles.accentTitleLg : styles.accentTitleMd}>{title}</Text>
        {detail ? (typeof detail === "string" ? <Text style={styles.accentDetail}>{detail}</Text> : detail) : null}
        {footer}
      </View>
    </Wrapper>
  );
}

// Compact key/value line used inside AccentCard footers and PodDetailed's
// secondary readout block.
export function MetaRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaRowLabel}>{label}</Text>
      <Text style={[styles.metaRowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// Telemetry pod with a recessed secondary-readout well beneath the headline
// metric — the "Live Telemetry Deck" pod pattern (sleep eff / RHR+HRV, etc.)
export function PodDetailed({
  label,
  value,
  unit,
  caption,
  accent,
  badge,
  rows,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  accent: string;
  badge?: { label: string; color?: string };
  rows?: { label: string; value: string; valueColor?: string }[];
}) {
  return (
    <Surface style={styles.podDetailed}>
      <View style={styles.podDetailedHeader}>
        <Text style={styles.podLabel}>{label}</Text>
        {badge ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Dot color={badge.color ?? colors.good} size={5} />
            <Text style={[styles.podBadgeText, { color: badge.color ?? colors.good }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <Text style={[styles.podValue, { color: accent }]}>{value}</Text>
        {unit ? <Text style={styles.podUnit}>{unit}</Text> : null}
      </View>
      {caption ? <Text style={styles.podCaption}>{caption}</Text> : null}
      {rows && rows.length > 0 ? (
        <View style={styles.podWell}>
          {rows.map((r) => (
            <MetaRow key={r.label} label={r.label} value={r.value} valueColor={r.valueColor} />
          ))}
        </View>
      ) : null}
    </Surface>
  );
}

// Renders a chat reply's structured block (see src/lib/api.ts UIBlock /
// src/nodes/ui_blocks.py) — a logging confirmation or a data-query answer.
// Sits inside a chat bubble, so it's compact rather than full Surface padding.
export function ChatBlock({
  block,
  onConfirm,
  onEdit,
  onCancel,
}: {
  block: import("@/lib/api").UIBlock;
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
  if (block.type === "confirmation") {
    const color =
      block.status === "error"
        ? colors.bad
        : block.status === "removed"
          ? colors.textTertiary
          : block.status === "preview"
            ? colors.kinematic
            : colors.good;
    return (
      <View style={[styles.chatBlock, { borderColor: withAlpha(color, 0.3) }]}>
        <View style={styles.chatBlockHeader}>
          <Dot color={color} size={6} />
          <Text style={[styles.chatBlockTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {block.title}
          </Text>
        </View>
        {block.subtitle ? <Text style={styles.chatBlockSubtitle}>{block.subtitle}</Text> : null}
        {block.rows.length > 0 ? (
          <View style={styles.chatBlockWell}>
            {block.rows.map((r, i) => (
              <MetaRow key={`${r.label}-${i}`} label={r.label} value={r.value} />
            ))}
          </View>
        ) : null}
        {block.insight ? <Text style={styles.chatBlockInsight}>{block.insight}</Text> : null}
        {block.status === "preview" && (onConfirm || onEdit || onCancel) ? (
          <View style={styles.previewActions}>
            {onCancel ? (
              <Pressable onPress={onCancel} style={[styles.previewBtn, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.previewBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
            ) : null}
            {onEdit ? (
              <Pressable onPress={onEdit} style={[styles.previewBtn, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.previewBtnText, { color: colors.textPrimary }]}>Edit</Text>
              </Pressable>
            ) : null}
            {onConfirm ? (
              <Pressable onPress={onConfirm} style={[styles.previewBtn, { backgroundColor: colors.good }]}>
                <Text style={[styles.previewBtnText, { color: colors.bg }]}>Confirm</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  // stat_grid
  return (
    <View style={styles.chatBlock}>
      <Text style={styles.chatBlockEyebrow}>{block.title.toUpperCase()}</Text>
      <View style={styles.chatStatGrid}>
        {block.stats.map((s, i) => {
          const sevColor =
            s.severity === "good" ? colors.good : s.severity === "warn" ? colors.kinematic : s.severity === "bad" ? colors.bad : colors.textPrimary;
          return (
            <View key={`${s.label}-${i}`} style={styles.chatStat}>
              <Text style={styles.chatStatLabel} numberOfLines={1}>{s.label.toUpperCase()}</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                <Text style={[styles.chatStatValue, { color: sevColor }]}>{s.value}</Text>
                {s.unit ? <Text style={styles.chatStatUnit}>{s.unit}</Text> : null}
              </View>
              {s.caption ? <Text style={styles.chatStatCaption} numberOfLines={1}>{s.caption}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  trailing,
  trailingSubtitle,
  trailingColor,
  onPress,
  icon,
}: {
  title: string;
  subtitle?: string;
  trailing?: string;
  trailingSubtitle?: string;
  trailingColor?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={
        onPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPress();
            }
          : undefined
      }
      style={({ pressed }: { pressed?: boolean }) => [styles.row, pressed && onPress ? { opacity: 0.6 } : null]}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing ? (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.rowTrailing, trailingColor ? { color: trailingColor } : null]}>{trailing}</Text>
          {trailingSubtitle ? <Text style={styles.rowSubtitle}>{trailingSubtitle}</Text> : null}
        </View>
      ) : null}
    </Wrapper>
  );
}

// Segmented time-range selector — recessed tray, white active tab.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.key);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FormField({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formFieldLabel}>{label}</Text>
      <TextInput
        style={styles.formFieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

export function NavRow({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.6 }]}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

// Reusable haptic + scale-on-press wrapper. Use for any tappable card,
// tile, or chip that wants consistent feedback across the app.
export function HapticPressable({
  children,
  onPress,
  style,
  haptic = "light",
  scaleTo = 0.97,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: "light" | "medium" | "selection";
  scaleTo?: number;
}) {
  return (
    <Pressable
      onPress={() => {
        const style = haptic === "selection"
          ? Haptics.selectionAsync()
          : Haptics.impactAsync(
              haptic === "medium"
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light,
            );
        style.catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        style,
        pressed ? { transform: [{ scale: scaleTo }], opacity: 0.9 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  color,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      disabled={disabled || loading}
      style={[styles.primaryButton, color ? { backgroundColor: color } : null, (disabled || loading) && { opacity: 0.5 }]}
    >
      {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.focus} />
      <Text style={styles.centeredText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label, icon, action }: { label: string; icon?: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.centered}>
      {icon ? <View style={{ marginBottom: spacing.sm }}>{icon}</View> : null}
      <Text style={styles.centeredText}>{label}</Text>
      {action ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            action.onPress();
          }}
          style={styles.emptyAction}
        >
          <Text style={styles.emptyActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>Couldn&apos;t load: {message}</Text>
    </View>
  );
}

// Soft elevation shared by every card-like surface — matches the Stitch
// "Instrument Pod" shadow spec (razor-thin edge, not a heavy drop shadow).
const cardShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    ...cardShadow,
  },
  screenTitle: { ...type.display, color: colors.textPrimary },
  screenSubtitle: { ...type.body, color: colors.textTertiary, marginTop: 2 },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    overflow: "hidden",
  },
  headerBarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerBrandRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerBackButton: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 13, color: colors.textPrimary, letterSpacing: -0.1 },
  headerScreenLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.textTertiary, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 1 },
  headerSubtitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: 3,
    paddingBottom: spacing.xs,
  },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontFamily: fonts.monoSemiBold, fontSize: 10, letterSpacing: 0.5 },
  podGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pod: { width: "47%", padding: spacing.md },
  podLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
  podValue: { fontFamily: fonts.monoBold, fontSize: 20, letterSpacing: -0.5 },
  podUnit: { fontFamily: fonts.geistRegular, fontSize: 12, color: colors.textTertiary, marginBottom: 2 },
  podCaption: { fontFamily: fonts.geistRegular, fontSize: 10.5, color: colors.textTertiary, marginTop: 3 },
  sectionLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionLabel: { ...type.micro, color: colors.textTertiary, textTransform: "uppercase" },
  sectionSubtitleSmall: { ...type.caption, color: colors.textTertiary, marginTop: 2, textTransform: "none" },
  sectionAction: { ...type.caption, color: colors.focus },
  statLabel: { ...type.micro, color: colors.textTertiary, textTransform: "uppercase", marginBottom: 4 },
  statValueLg: { ...type.metricXl, color: colors.textPrimary },
  statValueMd: { ...type.metricLg, color: colors.textPrimary },
  statUnit: { ...type.body, color: colors.textTertiary, marginBottom: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...type.micro },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...type.body, color: colors.textPrimary, fontFamily: "Geist-Medium" },
  rowSubtitle: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  rowTrailing: { ...type.metricMd, color: colors.textPrimary },
  segmented: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radius.sm, padding: 3 },
  segment: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.hairline },
  segmentText: { ...type.caption, color: colors.textTertiary },
  segmentTextActive: { color: colors.textPrimary, fontFamily: "Geist-Medium" },
  formField: { marginBottom: spacing.md },
  formFieldLabel: { ...type.caption, color: colors.textTertiary, marginBottom: 6, textTransform: "uppercase" },
  formFieldInput: { backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.textPrimary, fontFamily: "JetBrainsMono-Medium" },
  navRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: spacing.lg, gap: spacing.md },
  primaryButton: { backgroundColor: colors.textPrimary, borderRadius: radius.sm, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { ...type.heading, color: colors.textInverse },
  centered: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  centeredText: { ...type.body, color: colors.textTertiary },
  emptyAction: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: withAlpha(colors.focus, 0.1), borderRadius: radius.sm },
  emptyActionText: { ...type.caption, color: colors.focus, fontFamily: fonts.geistMedium },
  errorBanner: { backgroundColor: withAlpha(colors.bad, 0.1), borderWidth: 1, borderColor: withAlpha(colors.bad, 0.3), borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  errorBannerText: { ...type.caption, color: colors.bad },
  pacingTrack: { flexDirection: "row", width: "100%", backgroundColor: colors.surface2, overflow: "hidden" },
  accentCard: { flexDirection: "row", backgroundColor: colors.surface1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...cardShadow },
  accentStripe: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.sm },
  accentBody: { flex: 1, paddingLeft: spacing.sm },
  accentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  accentBadge: { flexDirection: "row", alignItems: "center", borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  accentBadgeText: { fontFamily: "JetBrainsMono-SemiBold", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  accentMeta: { ...type.metricMd },
  accentTitleLg: { ...type.heading, color: colors.textPrimary, marginBottom: 3 },
  accentTitleMd: { fontFamily: "Geist-Medium", fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  accentDetail: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 1.5 },
  metaRowLabel: { ...type.micro, color: colors.textTertiary, textTransform: "none" },
  metaRowValue: { fontFamily: "JetBrainsMono-SemiBold", fontSize: 11, color: colors.textPrimary },
  podDetailed: { width: "47%", padding: spacing.md, justifyContent: "space-between" },
  podDetailedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  podBadgeText: { fontFamily: "JetBrainsMono-SemiBold", fontSize: 10 },
  podWell: { marginTop: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.xs },
  chatBlock: { backgroundColor: colors.surface1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, marginTop: spacing.xs, ...cardShadow },
  chatBlockHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  chatBlockTitle: { fontFamily: fonts.geistMedium, fontSize: 14 },
  chatBlockSubtitle: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  chatBlockWell: { marginTop: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.xs },
  chatBlockInsight: { ...type.caption, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 17 },
  previewActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  previewBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center" },
  previewBtnText: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 13 },
  chatBlockEyebrow: { fontFamily: fonts.monoSemiBold, fontSize: 9.5, color: colors.textTertiary, letterSpacing: 0.6, marginBottom: spacing.sm },
  chatStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chatStat: { minWidth: "44%", flexGrow: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm },
  chatStatLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 3 },
  chatStatValue: { fontFamily: fonts.monoBold, fontSize: 17, letterSpacing: -0.3 },
  chatStatUnit: { ...type.caption, color: colors.textTertiary, marginBottom: 1 },
  chatStatCaption: { ...type.caption, fontSize: 10, color: colors.textTertiary, marginTop: 2 },
});
