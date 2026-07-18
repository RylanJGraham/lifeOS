"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Wallet, Settings, LayoutGrid, Bell, MessageSquare, Server,
  Menu, X, LogOut,
} from "lucide-react";
import AuthGate from "../components/AuthGate";
import { supabase } from "../../utils/supabaseClient";

const NAV_MODULES = [
  { href: "/", icon: LayoutGrid, label: "The Nexus", accent: "var(--accent-trends)" },
  { href: "/health", icon: Activity, label: "Health OS", accent: "var(--accent-cardiovascular)" },
  { href: "/finance", icon: Wallet, label: "Wealth OS", accent: "var(--accent-wealth)" },
  { href: "/chat", icon: MessageSquare, label: "Chat", accent: "var(--accent-sleep)" },
];

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Close the mobile drawer on navigation
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const signOut = async () => {
    setUserMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <AuthGate>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Mobile backdrop */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 lg:hidden"
            style={{ background: "rgba(15,23,42,0.35)" }}
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* Sidebar — drawer on mobile, fixed on desktop */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex flex-col w-[250px] transition-transform duration-300 lg:translate-x-0 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            background: "var(--surface-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Logo */}
          <div className="flex items-center justify-between" style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
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
            <button
              onClick={() => setNavOpen(false)}
              className="lg:hidden flex items-center justify-center"
              style={{ width: 40, height: 40, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
            <div style={{ padding: "0 8px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Modules
            </div>
            {NAV_MODULES.map((item) => (
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
              href="/system"
              className="sidebar-link"
            >
              <Server size={16} style={{ color: "var(--text-tertiary)" }} />
              System
            </Link>
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
          className="flex-1 lg:ml-[250px] flex flex-col"
          style={{ minHeight: "100vh", minWidth: 0 }}
        >
          {/* Top Bar */}
          <header
            className="flex items-center justify-between lg:justify-end px-4 lg:px-6"
            style={{
              height: 56,
              borderBottom: "1px solid var(--border-subtle)",
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(12px)",
              position: "sticky",
              top: 0,
              zIndex: 20,
              boxShadow: "0 1px 0 var(--border-subtle)",
            }}
          >
            {/* Hamburger (mobile) */}
            <button
              onClick={() => setNavOpen(true)}
              className="lg:hidden flex items-center justify-center"
              style={{ width: 40, height: 40, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            {/* Right side */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Status dots */}
              <div className="hidden md:flex" style={{ alignItems: "center", gap: 12 }}>
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
                className="hidden md:block"
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

              {/* Avatar + user menu */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label="Account menu"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
                    border: "2px solid var(--border-active)",
                    cursor: "pointer",
                  }}
                />
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 z-50 card-surface p-1.5"
                      style={{
                        top: "calc(100% + 8px)",
                        minWidth: 160,
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-elevated)",
                      }}
                    >
                      <button
                        onClick={signOut}
                        className="flex items-center gap-2 w-full px-3 text-xs font-semibold rounded-lg transition-colors hover:opacity-70"
                        style={{
                          minHeight: 40,
                          color: "var(--status-critical)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <LogOut size={14} />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6" style={{ overflowY: "auto" }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>{children}</div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
