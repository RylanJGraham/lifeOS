import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { registerDevice } from "./api";
import { useAuth } from "./auth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getPushPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Ask for permission (if needed), get the Expo token, and register it with
 * the backend, which attaches it to the signed-in user. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulators have no push token.

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await registerDevice(token, Platform.OS);
  return token;
}

/** Mount once under AuthProvider: registers the device after sign-in and
 * opens the screen named by a tapped notification's `deep_link`. */
export function usePushSetup() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications().catch((e) => console.warn("Push registration failed", e));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const open = (data: Record<string, unknown> | undefined) => {
      const link = data?.deep_link;
      if (typeof link === "string" && link.startsWith("/")) router.push(link as never);
    };
    // App opened from a notification while killed.
    Notifications.getLastNotificationResponseAsync().then((r) => open(r?.notification.request.content.data));
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, [userId, router]);
}
