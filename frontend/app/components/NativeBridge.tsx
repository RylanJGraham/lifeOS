"use client";

import { useEffect } from "react";

// No-ops in the browser (Vercel). On the Capacitor iOS build this makes the
// status bar match the app chrome and stops the native keyboard from
// resizing/covering the webview content.
export default function NativeBridge() {
  useEffect(() => {
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      await StatusBar.setBackgroundColor({ color: "#F4F6FA" }).catch(() => {});

      const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
      await Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});
    })();
  }, []);

  return null;
}
