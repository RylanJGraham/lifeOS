// Ported verbatim from frontend/app/(app)/finance/page.tsx (duplicated there in
// Nexus + Goals too — centralized here instead, per the audit's recommendation).
export interface Transaction {
  transaction_date: string | null;
  amount: number | string | null;
  [key: string]: unknown;
}

export function liveBankBalance(
  storedBalance: number | string | null | undefined,
  balanceUpdatedAt: string | null | undefined,
  transactions: Transaction[],
): number | null {
  if (storedBalance == null) return null;
  const stored = typeof storedBalance === "string" ? parseFloat(storedBalance) : storedBalance;
  if (!Number.isFinite(stored)) return null;

  const since = balanceUpdatedAt ? new Date(balanceUpdatedAt).toISOString().slice(0, 10) : null;
  const net = transactions.reduce((acc, t) => {
    if (!t.transaction_date) return acc;
    if (since && t.transaction_date <= since) return acc;
    const amount = typeof t.amount === "string" ? parseFloat(t.amount) : t.amount;
    return acc + (Number.isFinite(amount as number) ? (amount as number) : 0);
  }, 0);

  return stored + net;
}

/**
 * Monthly take-home to budget against. `base_salary` is stored as a single number with no unit
 * (yours is 32000 — an annual figure), so don't trust it as "per month":
 *  1. the most recent of this/last month that actually shows income (>= 500) in the transactions, else
 *  2. base_salary / 12 when it looks annual (>= 6000), else base_salary as-is, else 0.
 * Income = positive amounts in the Income category (or any positive amount if nothing is categorised).
 */
export function monthlyTakeHome(
  baseSalary: number | string | null | undefined,
  transactions: { transaction_date: string | null; amount: number | string | null; category?: string | null }[],
  now: Date = new Date(),
): number {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = key(now);
  const lastMonth = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const income = (month: string) =>
    transactions.reduce((acc, t) => {
      const amount = typeof t.amount === "string" ? parseFloat(t.amount) : t.amount;
      if (!t.transaction_date?.startsWith(month) || typeof amount !== "number" || !(amount > 0)) return acc;
      return (t.category ?? "Income") === "Income" ? acc + amount : acc;
    }, 0);
  for (const m of [thisMonth, lastMonth]) {
    const v = income(m);
    if (v >= 500) return Math.round(v);
  }
  const salary = typeof baseSalary === "string" ? parseFloat(baseSalary) : baseSalary;
  if (!salary || !Number.isFinite(salary) || salary <= 0) return 0;
  return Math.round(salary >= 6000 ? salary / 12 : salary);
}
