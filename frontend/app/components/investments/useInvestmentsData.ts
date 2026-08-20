"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../utils/supabaseClient";
import type {
  Position, Signal, Snapshot, WatchlistEntry, DailyReport,
  SignalPerformance, Purchase, PositionHistoryRow, CompanyRSU
} from "./types";

export interface InvestmentsData {
  positions: Position[];
  snapshots: Snapshot[];          // ascending by record_date
  signals: Signal[];              // latest 200, descending by generated_at
  watchlist: WatchlistEntry[];
  performance: SignalPerformance[];
  purchases: Purchase[];          // latest 50
  positionHistory: PositionHistoryRow[]; // 90d, ascending
  reports: DailyReport[];         // metadata only, newest first
  rsus: CompanyRSU[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function useInvestmentsData(): InvestmentsData {
  const [positions, setPositions] = useState<Position[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [performance, setPerformance] = useState<SignalPerformance[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [positionHistory, setPositionHistory] = useState<PositionHistoryRow[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [rsus, setRsus] = useState<CompanyRSU[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cutoff90 = daysAgoISO(90);

    const [
      positionsRes,
      snapshotsRes,
      signalsRes,
      watchlistRes,
      performanceRes,
      purchasesRes,
      historyRes,
      reportsRes,
      rsusRes,
    ] = await Promise.all([
      supabase
        .from("advisor_positions_with_signals")
        .select("*")
        .eq("status", "open")
        .order("position_value", { ascending: false }),
      supabase
        .from("advisor_portfolio_snapshots")
        .select("*")
        .gte("record_date", cutoff90)
        .order("record_date", { ascending: true }),
      supabase
        .from("advisor_signals")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(200),
      supabase
        .from("advisor_watchlist")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("advisor_signal_performance")
        .select("*"),
      supabase
        .from("advisor_purchase_history")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(50),
      supabase
        .from("advisor_position_history")
        .select("*")
        .gte("record_date", cutoff90)
        .order("record_date", { ascending: true }),
      supabase
        .from("advisor_daily_reports")
        .select("id, report_date, title, status, report_type, market_regime, vix_level, portfolio_value, generated_at")
        .order("report_date", { ascending: false })
        .limit(14),
      supabase
        .from("company_rsus")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

    const failures: string[] = [];
    const check = (label: string, err: { message: string } | null) => {
      if (err) failures.push(`${label}: ${err.message}`);
    };
    check("positions", positionsRes.error);
    check("snapshots", snapshotsRes.error);
    check("signals", signalsRes.error);
    check("watchlist", watchlistRes.error);
    check("signal performance", performanceRes.error);
    check("purchase history", purchasesRes.error);
    check("position history", historyRes.error);
    check("daily reports", reportsRes.error);
    check("rsus", rsusRes.error);

    setPositions((positionsRes.data as Position[]) || []);
    setSnapshots((snapshotsRes.data as Snapshot[]) || []);
    setSignals((signalsRes.data as Signal[]) || []);

    const wl = (watchlistRes.data as WatchlistEntry[]) || [];
    const hasConviction = wl.some(w => w.conviction_score != null);
    if (hasConviction) {
      wl.sort((a, b) => {
        const as = typeof a.conviction_score === "number" ? a.conviction_score : parseFloat(String(a.conviction_score ?? "0")) || 0;
        const bs = typeof b.conviction_score === "number" ? b.conviction_score : parseFloat(String(b.conviction_score ?? "0")) || 0;
        return bs - as;
      });
    }
    setWatchlist(wl);

    setPerformance((performanceRes.data as SignalPerformance[]) || []);
    setPurchases((purchasesRes.data as Purchase[]) || []);
    setPositionHistory((historyRes.data as PositionHistoryRow[]) || []);
    setReports((reportsRes.data as DailyReport[]) || []);
    setRsus((rsusRes.data as CompanyRSU[]) || []);

    setError(failures.length > 0 ? failures.join(" · ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    positions, snapshots, signals, watchlist, performance, purchases,
    positionHistory, reports, rsus, loading, error, refetch: load,
  };
}
