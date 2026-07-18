"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../utils/supabaseClient";

// Renders children only once a Supabase session exists; otherwise redirects
// to /login. Pages under the (app) group mount only after this gate opens,
// so their data fetching always runs with a valid session.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setAuthed(true);
      else router.replace("/login");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setAuthed(true);
      else router.replace("/login");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (!authed) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: "100vh", background: "var(--surface-primary)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="animate-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent-sleep)",
              display: "inline-block",
            }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
          >
            Authenticating…
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
