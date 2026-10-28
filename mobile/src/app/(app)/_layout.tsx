import { Stack } from "expo-router";

// The real tab bar lives in (tabs)/_layout.tsx. goals/specialist/system are
// deliberately NOT Tabs.Screen entries — Expo Router's Tabs (SDK 58) does not
// support navigating to a tab hidden via `href: null`, so screens that are
// reachable only from an in-app button (not the tab bar) must be pushed as
// Stack screens layered on top of the tab navigator instead. See the
// "native tabs" migration docs: a hidden tab "cannot be navigated to in any
// way" — the recommended pattern is nesting a Stack above/around the tabs.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="goals" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="specialist" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="system" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}
