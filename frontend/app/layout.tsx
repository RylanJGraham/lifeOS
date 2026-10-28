import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NativeBridge from "./components/NativeBridge";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Human Engine OS — Life Command Center",
  description: "Autonomous Agentic Health, Finance & Life Operating System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let content draw under the iPhone notch/home indicator so safe-area-inset-*
  // (used below and in the app shell) has real values instead of 0.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={inter.className}
        style={{
          background: "var(--surface-primary)",
          color: "var(--text-primary)",
          minHeight: "100vh",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
