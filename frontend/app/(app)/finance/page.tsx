"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../../utils/supabaseClient";
import { getFilteredData, tabVariants } from "../../components/finance/shared";
import { dedupePositions } from "../../components/investments/shared";
import FinanceHeader from "../../components/finance/FinanceHeader";
import SpendingPanel from "../../components/finance/SpendingPanel";
import NetWorthPanel from "../../components/finance/NetWorthPanel";
import CashflowPanel from "../../components/finance/CashflowPanel";
import BudgetPanel from "../../components/finance/BudgetPanel";
import DailyReportModal from "../../components/finance/DailyReportModal";

export default function WealthOS() {
  const [activeTab, setActiveTab] = useState("spending");
  const [positions, setPositions] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    supabase
      .from("advisor_positions_with_signals")
      .select("*")
      .eq("status", "open")
      .order("position_value", { ascending: false })
      .then((res) => {
        if (res.data) setPositions(dedupePositions(res.data));
      });

    supabase
      .from("advisor_portfolio_snapshots")
      .select("*")
      .order("record_date", { ascending: false })
      .limit(30)
      .then((res) => {
        if (res.data) setSnapshots(res.data);
      });

    supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .limit(5000)
      .then((res) => {
        if (res.data) setTransactions(res.data);
      });

    supabase
      .from("user_profiles")
      .select("bank_balance, bank_balance_updated_at, base_salary, target_savings_rate")
      .limit(1)
      .then((res) => {
        if (res.data && res.data.length > 0) setProfile(res.data[0]);
      });
  }, []);

  const [timeFilter, setTimeFilter] = useState("month");
  const [reportOpen, setReportOpen] = useState(false);

  const filteredTransactions = getFilteredData(transactions, timeFilter, "transaction_date");
  const latestTxDate = transactions.length > 0 ? transactions[0].transaction_date : null;

  // Live bank balance: stored balance + net transaction change since it was set
  let liveBalance: number | null = null;
  if (profile?.bank_balance != null) {
    const stored = parseFloat(profile.bank_balance);
    if (Number.isFinite(stored)) {
      const since = profile.bank_balance_updated_at
        ? new Date(profile.bank_balance_updated_at).toISOString().slice(0, 10)
        : null;
      const net = transactions.reduce((a, t) => {
        if (!t.transaction_date) return a;
        if (since && t.transaction_date <= since) return a;
        return a + (parseFloat(t.amount) || 0);
      }, 0);
      liveBalance = stored + net;
    }
  }

  const savingsTarget =
    profile?.target_savings_rate != null ? parseFloat(profile.target_savings_rate) : null;

  return (
    <div style={{ background: "var(--surface-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <FinanceHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        latestTxDate={latestTxDate}
        onOpenReport={() => setReportOpen(true)}
      />

      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible" exit="exit">
            {activeTab === "spending" && (
              <SpendingPanel
                transactions={filteredTransactions}
                allTransactions={transactions}
                timeFilter={timeFilter}
              />
            )}
            {activeTab === "networth" && (
              <NetWorthPanel
                snapshots={getFilteredData(snapshots, timeFilter, "record_date")}
                bankBalance={liveBalance}
                positions={positions}
              />
            )}
            {activeTab === "cashflow" && (
              <CashflowPanel
                transactions={filteredTransactions}
                timeFilter={timeFilter}
                bankBalance={liveBalance}
                bankBalanceStored={profile?.bank_balance ?? null}
                bankBalanceAt={profile?.bank_balance_updated_at ?? null}
                savingsTarget={savingsTarget}
              />
            )}
            {activeTab === "budgets" && <BudgetPanel transactions={transactions} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <DailyReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
