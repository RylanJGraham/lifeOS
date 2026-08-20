"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { numOrNull } from "../investments/shared";
import type { Goal, GoalCheckin } from "./types";

export interface GoalsData {
  goals: Goal[];                 // active first, then achieved — abandoned excluded
  checkins: GoalCheckin[];       // last 90 days, ascending by created_at
  liveBankBalance: number | null;
  latestPortfolioValue: number | null;
  netWorth: number | null;       // sum of the two, null only if both missing
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// PostgREST reports a missing table as 42P01 (404 "relation does not
// exist"). Migration 009 may not be applied yet — treat it as empty
// state instead of an error banner.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || (err.message ?? "").includes("does not exist");
}

// Active goals first, then achieved, newest first within each group.
function sortGoals(goals: Goal[]): Goal[] {
  const rank = (s: string | null | undefined) =>
    s === "active" ? 0 : s === "achieved" ? 1 : 2;
  return [...goals].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function useGoalsData(): GoalsData {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkins, setCheckins] = useState<GoalCheckin[]>([]);
  const [liveBankBalance, setLiveBankBalance] = useState<number | null>(null);
  const [latestPortfolioValue, setLatestPortfolioValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [goalsRes, checkinsRes, profileRes, snapshotRes] = await Promise.all([
      // status column may hold anything on legacy rows — exclude abandoned
      // in the query, sort the rest client-side.
      supabase
        .from("goals")
        .select("*")
        .neq("status", "abandoned"),
      supabase
        .from("goal_checkins")
        .select("*")
        .gte("created_at", daysAgoISO(90))
        .order("created_at", { ascending: true }),
      supabase
        .from("user_profiles")
        .select("bank_balance, bank_balance_updated_at")
        .limit(1),
      supabase
        .from("advisor_portfolio_snapshots")
        .select("record_date, total_value")
        .order("record_date", { ascending: false })
        .limit(1),
    ]);

    const failures: string[] = [];
    const check = (label: string, err: { message: string } | null) => {
      if (err) failures.push(`${label}: ${err.message}`);
    };
    if (!isMissingTable(goalsRes.error)) check("goals", goalsRes.error);
    if (!isMissingTable(checkinsRes.error)) check("check-ins", checkinsRes.error);
    check("profile", profileRes.error);
    check("portfolio snapshot", snapshotRes.error);

    setGoals(sortGoals((goalsRes.data as Goal[]) || []));
    setCheckins((checkinsRes.data as GoalCheckin[]) || []);

    // Live bank balance (same formula as finance/page.tsx): stored
    // balance + net transaction change since it was set.
    const profile = Array.isArray(profileRes.data) && profileRes.data.length > 0
      ? (profileRes.data[0] as { bank_balance: number | string | null; bank_balance_updated_at: string | null })
      : null;
    const stored = numOrNull(profile?.bank_balance);
    const since = profile?.bank_balance_updated_at
      ? String(profile.bank_balance_updated_at).slice(0, 10)
      : null;

    let liveBalance: number | null = stored;
    if (stored != null) {
      let txQuery = supabase
        .from("transactions")
        .select("amount, transaction_date")
        .order("transaction_date", { ascending: false });
      if (since) txQuery = txQuery.gt("transaction_date", since);
      const txRes = await txQuery.limit(5000);
      check("transactions", txRes.error);
      const net = ((txRes.data as { amount: number | string | null }[]) || [])
        .reduce((a, t) => a + (numOrNull(t.amount) ?? 0), 0);
      liveBalance = stored + net;
    }
    setLiveBankBalance(liveBalance);

    const snapshot = Array.isArray(snapshotRes.data) && snapshotRes.data.length > 0
      ? (snapshotRes.data[0] as { total_value: number | string | null })
      : null;
    setLatestPortfolioValue(numOrNull(snapshot?.total_value));

    setError(failures.length > 0 ? failures.join(" · ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const netWorth =
    liveBankBalance == null && latestPortfolioValue == null
      ? null
      : (liveBankBalance ?? 0) + (latestPortfolioValue ?? 0);

  return {
    goals, checkins, liveBankBalance, latestPortfolioValue, netWorth,
    loading, error, refetch: load,
  };
}
