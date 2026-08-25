"use client";

import { C, fmt2 } from "./shared";

export default function TransactionsTable({ transactions }: { transactions: any[] }) {
  if (!transactions || transactions.length === 0) return null;
  return (
    <div
      className="card-surface mt-5 overflow-hidden"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      <div className="p-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)" }}
        >
          Raw Transaction Data
        </div>
      </div>
      <div className="overflow-x-auto max-h-[400px]">
        <div style={{ minWidth: "600px" }}>
          <table className="data-table">
            <thead
              className="sticky top-0 z-10"
              style={{ background: "var(--surface-secondary)" }}
            >
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const amt = parseFloat(t.amount) || 0;
                const isIncome = amt > 0;
                return (
                  <tr key={t.id}>
                    <td className="w-[120px]" style={{ color: "var(--text-tertiary)" }}>
                      {t.transaction_date}
                    </td>
                    <td className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {t.merchant_name}
                    </td>
                    <td>
                      <span
                        className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          background: "var(--surface-tertiary)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {t.category || "Uncategorized"}
                      </span>
                    </td>
                    <td
                      className="text-right font-mono font-bold"
                      style={{ color: isIncome ? C.optimal : C.textPrimary }}
                    >
                      {isIncome ? "+" : "-"}
                      ${Math.abs(amt).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
