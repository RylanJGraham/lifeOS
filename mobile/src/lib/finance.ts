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
