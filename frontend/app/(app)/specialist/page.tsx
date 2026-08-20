"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PERSONAS } from "../../components/personas/config";
import PersonaChatPanel from "../../components/personas/PersonaChatPanel";
import PersonaInsightsPanel from "../../components/personas/PersonaInsightsPanel";
import { PersonaKey } from "../../../utils/api";

export default function SpecialistPage() {
  const [active, setActive] = useState<PersonaKey>("doctor");
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const persona = PERSONAS.find((p) => p.key === active)!;

  const bumpChanged = (key: PersonaKey) =>
    setRefreshKeys((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

  return (
    <div className="flex flex-col gap-5">
      {/* Header + persona tabs */}
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          Specialist
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          Your care team — they read your live data, remember what you tell them, and check in on you.
        </p>
        <div className="flex gap-2 mt-4">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            const isActive = p.key === active;
            return (
              <button
                key={p.key}
                onClick={() => setActive(p.key)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  background: isActive ? p.accent : "var(--surface-tertiary)",
                  border: `1px solid ${isActive ? p.accent : "var(--border-subtle)"}`,
                }}
              >
                <Icon size={15} />
                {p.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat left, insights right — remount per persona for clean state */}
      <motion.div
        key={persona.key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        <div className="lg:col-span-5">
          <PersonaChatPanel persona={persona} onChanged={() => bumpChanged(persona.key)} />
        </div>
        <div className="lg:col-span-7">
          <PersonaInsightsPanel persona={persona} refreshKey={refreshKeys[persona.key] || 0} />
        </div>
      </motion.div>
    </div>
  );
}
