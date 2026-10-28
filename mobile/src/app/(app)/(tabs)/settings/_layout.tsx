import { Stack } from "expo-router";
import { colors } from "@/theme";

// The one place in the app with a genuine native large-title header — it's a
// real Stack navigator (drill-down edit screens), unlike the other tabs
// which sit flat under bottom-tabs (no native large title support there).
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: true,
        headerBlurEffect: "light",
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary },
        headerLargeTitleStyle: { color: colors.textPrimary, fontWeight: "800" },
        headerStyle: { backgroundColor: "transparent" },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="body" options={{ title: "Body", headerLargeTitle: false }} />
      <Stack.Screen name="targets" options={{ title: "Daily Targets", headerLargeTitle: false }} />
      <Stack.Screen name="capital" options={{ title: "Capital Flow", headerLargeTitle: false }} />
    </Stack>
  );
}
