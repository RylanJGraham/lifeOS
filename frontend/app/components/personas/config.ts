import { Stethoscope, Apple, Dumbbell, LucideIcon } from "lucide-react";
import { PersonaKey } from "../../../utils/api";

export interface PersonaConfig {
  key: PersonaKey;
  name: string;
  title: string;
  icon: LucideIcon;
  accent: string;
  tagline: string;
  emptyTitle: string;
  emptyText: string;
  quickActions: string[];
  placeholder: string;
  memoryDomain: string; // memories.domain for "on record" notes
}

export const PERSONAS: PersonaConfig[] = [
  {
    key: "doctor",
    name: "Dr. Ada",
    title: "Doctor",
    icon: Stethoscope,
    accent: "var(--accent-cardiovascular)",
    tagline: "Symptoms · trends · recovery",
    emptyTitle: "Talk to Dr. Ada",
    emptyText:
      "Tell me what's been going on medically — symptoms, sleep, recovery. I watch your telemetry and keep your history on record.",
    quickActions: [
      "How has my sleep and recovery been this week?",
      "I want to log a symptom",
      "Any trends in my data I should worry about?",
    ],
    placeholder: "Describe what's going on medically…",
    memoryDomain: "medical",
  },
  {
    key: "nutritionist",
    name: "Nora",
    title: "Nutritionist",
    icon: Apple,
    accent: "var(--accent-nutrition)",
    tagline: "Food quality · gaps · swaps",
    emptyTitle: "Talk to Nora",
    emptyText:
      "Ask me whether what you're eating is actually good for you — I'll judge your real logged meals, not generic advice.",
    quickActions: [
      "Honestly rate my diet this week",
      "What micronutrients am I missing?",
      "What should I swap out first?",
    ],
    placeholder: "Ask about your food…",
    memoryDomain: "nutrition",
  },
  {
    key: "pt",
    name: "Kane",
    title: "Personal Trainer",
    icon: Dumbbell,
    accent: "var(--accent-kinematic)",
    tagline: "Coverage · priorities · programming",
    emptyTitle: "Talk to Kane",
    emptyText:
      "Tell me which muscle groups you want to grow — I'll audit your actual weekly sets against that and fix the programming.",
    quickActions: [
      "Which muscle groups am I neglecting?",
      "I want bigger shoulders",
      "Audit my training week",
    ],
    placeholder: "Talk training…",
    memoryDomain: "training",
  },
];
