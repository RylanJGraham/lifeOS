import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Activity, Wallet, Settings, LayoutGrid, Search, Bell } from "lucide-react";
import AgentTerminal from "./components/AgentTerminal";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Human Engine OS — Life Command Center",
  description: "Autonomous Agentic Health, Finance & Life Operating System",
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
          display: "flex",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: 250,
            background: "var(--surface-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            height: "100vh",
            zIndex: 10,
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Logo */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(91,66,232,0.3)",
                }}
              >
                <Activity size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
                  HUMAN ENGINE
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                  OS v7
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
            <div style={{ padding: "0 8px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Modules
            </div>
            {[
              { href: "/", icon: LayoutGrid, label: "The Nexus", accent: "var(--accent-trends)" },
              { href: "/health", icon: Activity, label: "Health OS", accent: "var(--accent-cardiovascular)" },
              { href: "/finance", icon: Wallet, label: "Wealth OS", accent: "var(--accent-wealth)" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="sidebar-link"
              >
                <item.icon size={16} className="sidebar-link-icon" />
                {item.label}
              </Link>
            ))}

            <div style={{ margin: "16px 0 8px", padding: "0 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              System
            </div>
            <Link
              href="/settings"
              className="sidebar-link"
            >
              <Settings size={16} style={{ color: "var(--text-tertiary)" }} />
              Engine Settings
            </Link>
          </nav>

          {/* Status Footer */}
          <div style={{ padding: "12px", borderTop: "1px solid var(--border-subtle)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--status-optimal)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                LangGraph Agents Active
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div
          style={{
            flex: 1,
            marginLeft: 250,
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          {/* Top Bar */}
          <header
            style={{
              height: 56,
              borderBottom: "1px solid var(--border-subtle)",
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(12px)",
              position: "sticky",
              top: 0,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              boxShadow: "0 1px 0 var(--border-subtle)",
            }}
          >
            {/* Search */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--text-tertiary)",
                background: "var(--surface-tertiary)",
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                width: 260,
              }}
            >
              <Search size={14} />
              <span>Search command...</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 5px",
                  background: "var(--surface-secondary)",
                  border: "1px solid var(--border-active)",
                  borderRadius: 4,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Ctrl K
              </span>
            </div>

            {/* Right side */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Status dots */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {[
                  { label: "CV", color: "var(--status-optimal)" },
                  { label: "Sleep", color: "var(--status-warning)" },
                  { label: "Fuel", color: "var(--status-optimal)" },
                  { label: "Recovery", color: "var(--status-optimal)" },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Bell */}
              <button
                style={{ position: "relative", padding: 6, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
              >
                <Bell size={18} />
                <span
                  style={{
                    position: "absolute",
                    top: 5,
                    right: 5,
                    width: 7,
                    height: 7,
                    background: "var(--status-warning)",
                    borderRadius: "50%",
                    border: "1.5px solid var(--surface-secondary)",
                  }}
                />
              </button>

              {/* Avatar */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
                  border: "2px solid var(--border-active)",
                }}
              />
            </div>
          </header>

          <main style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>{children}</div>
          </main>
        </div>

        {/* The LangGraph Terminal */}
        <AgentTerminal />
      </body>
    </html>
  );
}
