import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.humanengine.lifeos",
  appName: "Human Engine OS",
  // Static export (npm run build:ios) bundled directly into the app —
  // no remote URL, so the app works even with a flaky connection to the
  // UI itself (API calls to the DO backend still need a network).
  webDir: "out",
  ios: {
    contentInset: "always",
  },
};

export default config;
