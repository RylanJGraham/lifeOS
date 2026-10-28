import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Gauge, Mic, HeartPulse, Landmark, Settings } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

function tabPressHaptic() {
  Haptics.selectionAsync().catch(() => {});
}

const TAB_PRESS_LISTENER = { tabPress: tabPressHaptic };

function TabBarBackground() {
  const { isDark } = useTheme();
  return <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={{ flex: 1 }} />;
}

export default function AppTabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.focus,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { position: "absolute", borderTopColor: colors.hairline, backgroundColor: "transparent" },
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: "JetBrainsMono-Medium" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Cockpit", tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} /> }} listeners={TAB_PRESS_LISTENER} />
      <Tabs.Screen name="chat" options={{ title: "Ingest", tabBarIcon: ({ color, size }) => <Mic color={color} size={size} /> }} listeners={TAB_PRESS_LISTENER} />
      <Tabs.Screen name="health" options={{ title: "Bio", tabBarIcon: ({ color, size }) => <HeartPulse color={color} size={size} /> }} listeners={TAB_PRESS_LISTENER} />
      <Tabs.Screen name="capital" options={{ title: "Capital", tabBarIcon: ({ color, size }) => <Landmark color={color} size={size} /> }} listeners={TAB_PRESS_LISTENER} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} listeners={TAB_PRESS_LISTENER} />
    </Tabs>
  );
}
