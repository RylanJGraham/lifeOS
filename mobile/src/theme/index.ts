// Ported from the Stitch "Human Engine" design system (light, Swiss
// functionalism + aviation glass-cockpit). Source of truth: the design-md
// generated alongside the Stitch project "Human Engine Personal Cockpit".

export const colors = {
  bg: "#F8FAFC", // Base Canvas (Slate 50)
  surface0: "#F8FAFC",
  surface1: "#FFFFFF", // Container Elevated — card surfaces
  surface2: "#F1F5F9", // Container Recessed — metric wells, sparkline tracks
  surface3: "#E2E8F0",
  hairline: "#E2E8F0", // Structural Outlines
  hairlineStrong: "#CBD5E1",

  // Functional status rails
  cardio: "#DC2626", // Intense Coral/Crimson — strain, drawdown, alerts
  focus: "#2563EB", // Cobalt — intelligence/recommendation signals
  nutrition: "#059669", // Vivid Emerald — optimal pacing, positive yield
  kinematic: "#D97706", // Radiant Amber — thresholds, warnings
  trends: "#0284C7", // Cyan core — telemetry baseline, sync
  wealth: "#7C3AED", // Vivid Violet — capital/equity instruments

  good: "#059669",
  warn: "#D97706",
  bad: "#DC2626",
  neutral: "#94A3B8",

  textPrimary: "#0F172A", // Slate 900
  textSecondary: "#475569", // Slate 600
  textTertiary: "#94A3B8", // Slate 400
  textInverse: "#F8FAFC",
};

export type ThemeColors = typeof colors;

export const darkColors: ThemeColors = {
  bg: "#0F172A",
  surface0: "#0F172A",
  surface1: "#1E293B",
  surface2: "#334155",
  surface3: "#475569",
  hairline: "#334155",
  hairlineStrong: "#475569",

  // Functional status rails stay identical for brand recognition.
  cardio: "#EF4444",
  focus: "#3B82F6",
  nutrition: "#10B981",
  kinematic: "#F59E0B",
  trends: "#38BDF8",
  wealth: "#8B5CF6",

  good: "#10B981",
  warn: "#F59E0B",
  bad: "#EF4444",
  neutral: "#64748B",

  textPrimary: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textTertiary: "#64748B",
  textInverse: "#0F172A",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
export const radius = { sm: 6, md: 8, lg: 10, xl: 14, full: 999 }; // roundness: 1 — compact, machined

// expo-font registers iOS fonts under the name baked into the font file
// itself (its PostScript name), not the object key passed to useFonts() —
// confirmed via each .ttf's `name` table (nameID 6). Using the JS-safe
// underscore names here (e.g. "SpaceGrotesk_700Bold") silently falls back to
// the system font on iOS since no font is actually registered under that
// string. See src/app/_layout.tsx for the corresponding useFonts() call.
export const fonts = {
  spaceGroteskSemiBold: "SpaceGrotesk-SemiBold",
  spaceGroteskBold: "SpaceGrotesk-Bold",
  geistRegular: "Geist-Regular",
  geistMedium: "Geist-Medium",
  monoMedium: "JetBrainsMono-Medium",
  monoSemiBold: "JetBrainsMono-SemiBold",
  monoBold: "JetBrainsMono-Bold",
};

export const type = {
  display: { fontFamily: fonts.spaceGroteskBold, fontSize: 32, letterSpacing: -0.6 },
  title: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 22, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.spaceGroteskSemiBold, fontSize: 17, letterSpacing: -0.2 },
  body: { fontFamily: fonts.geistRegular, fontSize: 15 },
  caption: { fontFamily: fonts.geistMedium, fontSize: 12.5 },
  micro: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.8 },
  metricXl: { fontFamily: fonts.monoBold, fontSize: 32, letterSpacing: -1 },
  metricLg: { fontFamily: fonts.monoSemiBold, fontSize: 22, letterSpacing: -0.6 },
  metricMd: { fontFamily: fonts.monoSemiBold, fontSize: 15, letterSpacing: -0.3 },
};

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}
