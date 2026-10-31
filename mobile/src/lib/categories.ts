// One category vocabulary for the whole app. The backend (chat logger + PDF import) writes the long
// names ("Food & Dining"); older rows and some code paths use short ones ("Food"). Everything the UI
// shows or sums goes through canonicalCategory() so "Food" and "Food & Dining" are one category.

export const CATEGORIES = [
  "Food & Dining",
  "Shopping & Goods",
  "Transportation",
  "Entertainment & Subscriptions",
  "Health & Fitness",
  "Housing & Utilities",
  "Education & Career",
  "Personal Care",
  "Investment",
  "Income",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

const ALIASES: Record<string, Category> = {
  food: "Food & Dining",
  groceries: "Food & Dining",
  dining: "Food & Dining",
  restaurants: "Food & Dining",
  shopping: "Shopping & Goods",
  transport: "Transportation",
  travel: "Transportation",
  entertainment: "Entertainment & Subscriptions",
  subscriptions: "Entertainment & Subscriptions",
  health: "Health & Fitness",
  fitness: "Health & Fitness",
  utilities: "Housing & Utilities",
  housing: "Housing & Utilities",
  rent: "Housing & Utilities",
  education: "Education & Career",
  uncategorized: "Other",
  misc: "Other",
};

const LOWER = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c] as const));

export function canonicalCategory(raw: string | null | undefined): Category {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return "Other";
  return LOWER.get(key) ?? ALIASES[key] ?? "Other";
}

/** Short label for tight spaces. */
export const CATEGORY_LABEL: Record<Category, string> = {
  "Food & Dining": "Food & dining",
  "Shopping & Goods": "Shopping",
  Transportation: "Transport",
  "Entertainment & Subscriptions": "Subscriptions & fun",
  "Health & Fitness": "Health",
  "Housing & Utilities": "Housing & bills",
  "Education & Career": "Education",
  "Personal Care": "Personal care",
  Investment: "Investing",
  Income: "Income",
  Other: "Other",
};

/** Which theme colour key each category uses (resolved against the active theme). */
export const CATEGORY_COLOR_KEY: Record<Category, "nutrition" | "focus" | "trends" | "wealth" | "cardio" | "kinematic" | "neutral" | "good"> = {
  "Food & Dining": "nutrition",
  "Shopping & Goods": "focus",
  Transportation: "trends",
  "Entertainment & Subscriptions": "wealth",
  "Health & Fitness": "cardio",
  "Housing & Utilities": "kinematic",
  "Education & Career": "focus",
  "Personal Care": "cardio",
  Investment: "good",
  Income: "good",
  Other: "neutral",
};

/** Share of monthly take-home used as the default budget when you haven't set one. */
export const DEFAULT_BUDGET_SHARE: Partial<Record<Category, number>> = {
  "Food & Dining": 0.18,
  "Shopping & Goods": 0.1,
  Transportation: 0.06,
  "Entertainment & Subscriptions": 0.06,
  "Health & Fitness": 0.04,
  "Housing & Utilities": 0.3,
  "Personal Care": 0.03,
  "Education & Career": 0.03,
};

export interface CategoryRow {
  category: Category;
  spent: number; // positive number
  count: number;
  share: number; // 0..100 of total spending
  budget: number; // 0 = none known
}

/** Sum EXPENSES (negative amounts) by canonical category, with optional budgets. */
export function categoryBreakdown(
  txs: { amount: number | string | null; category: string | null }[],
  budgets: Partial<Record<Category, number>> = {},
): { rows: CategoryRow[]; total: number } {
  const acc = new Map<Category, { spent: number; count: number }>();
  for (const t of txs) {
    const amount = typeof t.amount === "string" ? parseFloat(t.amount) : t.amount; // the API can return numerics as strings
    if (typeof amount !== "number" || !(amount < 0)) continue;
    const cat = canonicalCategory(t.category);
    if (cat === "Income") continue;
    const cur = acc.get(cat) ?? { spent: 0, count: 0 };
    cur.spent += -amount;
    cur.count += 1;
    acc.set(cat, cur);
  }
  const total = [...acc.values()].reduce((a, v) => a + v.spent, 0);
  const rows = [...acc.entries()]
    .map(([category, v]) => ({
      category,
      spent: Math.round(v.spent * 100) / 100,
      count: v.count,
      share: total > 0 ? (v.spent / total) * 100 : 0,
      budget: budgets[category] ?? 0,
    }))
    .sort((a, b) => b.spent - a.spent);
  return { rows, total: Math.round(total * 100) / 100 };
}

/** Budgets: your saved ones win; otherwise a share of monthly take-home (0 base => none). */
export function resolveBudgets(
  monthlyBase: number,
  saved: { category: string; monthly_limit: number }[] = [],
): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  if (monthlyBase > 0) {
    for (const [cat, share] of Object.entries(DEFAULT_BUDGET_SHARE)) out[cat as Category] = Math.round(monthlyBase * (share as number));
  }
  for (const b of saved) out[canonicalCategory(b.category)] = Number(b.monthly_limit);
  return out;
}
