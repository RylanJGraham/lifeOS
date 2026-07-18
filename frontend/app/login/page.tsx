"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle } from "lucide-react";
import { supabase } from "../../utils/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in → straight to the app
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/");
  };

  return (
    <div
      className="flex items-center justify-center px-4"
      style={{ minHeight: "100vh", background: "var(--surface-primary)" }}
    >
      <div
        className="card-surface w-full p-8"
        style={{ maxWidth: 380, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-elevated)" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(91,66,232,0.3)",
              marginBottom: 12,
            }}
          >
            <Activity size={20} color="#fff" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            HUMAN ENGINE
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            OS v7
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-[10px] uppercase tracking-widest font-bold mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                minHeight: 44,
              }}
            />
          </div>
          <div>
            <label
              className="block text-[10px] uppercase tracking-widest font-bold mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--surface-tertiary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                minHeight: 44,
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold"
              style={{
                color: "var(--status-critical)",
                background: "#DC26260D",
                border: "1px solid #DC262630",
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-sm font-bold text-white rounded-lg disabled:opacity-50"
            style={{
              minHeight: 44,
              background: "linear-gradient(135deg, var(--accent-cardiovascular), var(--accent-sleep))",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(91,66,232,0.3)",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
