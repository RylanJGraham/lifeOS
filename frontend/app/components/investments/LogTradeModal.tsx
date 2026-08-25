"use client";

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import { C, num } from "./shared";

interface LogTradeModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function LogTradeModal({ open, onClose, onSaved }: LogTradeModalProps) {
  const [symbol, setSymbol] = useState("");
  const [action, setAction] = useState<"buy" | "sell" | "add" | "trim">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fees, setFees] = useState("0");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSymbol("");
    setAction("buy");
    setQuantity("");
    setPrice("");
    setCurrency("USD");
    setFees("0");
    setReason("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNum = parseFloat(quantity);
    const priceNum = parseFloat(price);
    const feesNum = parseFloat(fees) || 0;

    if (!symbol.trim() || !quantity.trim() || !price.trim()) {
      setError("Symbol, quantity, and price are required.");
      return;
    }
    if (Number.isNaN(qtyNum) || qtyNum <= 0 || Number.isNaN(priceNum) || priceNum <= 0) {
      setError("Quantity and price must be positive numbers.");
      return;
    }

    setLoading(true);
    try {
      const totalCost = qtyNum * priceNum;
      const direction = action === "buy" || action === "add" ? "in" : "out";
      const executedAt = new Date().toISOString();
      const symbolClean = symbol.trim().toUpperCase();

      const { error: insertErr } = await supabase.from("advisor_purchases").insert({
        symbol: symbolClean,
        action,
        quantity: qtyNum,
        price: priceNum,
        total_cost: totalCost,
        direction,
        fees: feesNum,
        currency: currency.toUpperCase(),
        reason: reason.trim() || null,
        processed: true,
        executed_at: executedAt,
      });

      if (insertErr) throw insertErr;

      // Mirror the backend position math so the UI reflects the trade immediately.
      const { data: existing } = await supabase
        .from("advisor_positions")
        .select("*")
        .eq("symbol", symbolClean)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      const upsertPayload: Record<string, unknown> = {
        symbol: symbolClean,
        currency: currency.toUpperCase(),
        current_price: priceNum,
        latest_signal_action: action.toUpperCase(),
        source: "manual",
      };

      if (action === "buy" || action === "add") {
        const oldQty = num(existing?.quantity) || 0;
        const oldCost = num(existing?.average_cost) || 0;
        const newQty = oldQty + qtyNum;
        const newAvgCost = newQty > 0 ? (oldQty * oldCost + qtyNum * priceNum + feesNum) / newQty : priceNum;
        upsertPayload.quantity = newQty;
        upsertPayload.average_cost = Number(newAvgCost.toFixed(6));
        upsertPayload.position_value = Number((newQty * priceNum).toFixed(4));
        upsertPayload.unrealized_pnl = Number(((priceNum - newAvgCost) * newQty).toFixed(4));
        upsertPayload.unrealized_pnl_pct = newAvgCost > 0 ? Number((((priceNum / newAvgCost) - 1) * 100).toFixed(4)) : 0;
        upsertPayload.status = "open";
        upsertPayload.side = "long";
      } else {
        const oldQty = num(existing?.quantity) || 0;
        const oldCost = num(existing?.average_cost) || 0;
        const newQty = Math.max(0, oldQty - qtyNum);
        upsertPayload.quantity = newQty;
        upsertPayload.position_value = Number((newQty * priceNum).toFixed(4));
        upsertPayload.unrealized_pnl = Number(((priceNum - oldCost) * newQty).toFixed(4));
        upsertPayload.unrealized_pnl_pct = oldCost > 0 ? Number((((priceNum / oldCost) - 1) * 100).toFixed(4)) : 0;
        upsertPayload.status = newQty === 0 ? "closed" : "open";
        upsertPayload.side = newQty === 0 ? null : "long";
        if (newQty > 0) upsertPayload.average_cost = oldCost;
      }

      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from("advisor_positions")
          .update(upsertPayload)
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      } else {
        upsertPayload.average_cost = upsertPayload.average_cost ?? priceNum;
        const { error: upsertErr } = await supabase.from("advisor_positions").insert(upsertPayload);
        if (upsertErr) throw upsertErr;
      }

      if (onSaved) onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to log trade.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={handleClose}>
      <div className="card-surface w-full max-w-md p-6" style={{ borderRadius: "var(--radius-xl)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
            Log Manual Trade
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg transition-colors hover:opacity-70">
            <X size={18} style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="NVDA"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Action</label>
              <select
                value={action}
                onChange={e => setAction(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}>
                <option value="buy">Buy</option>
                <option value="add">Add</option>
                <option value="sell">Sell</option>
                <option value="trim">Trim</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Quantity</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Price</label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Currency</label>
              <input
                type="text"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                placeholder="USD"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Fees</label>
              <input
                type="number"
                step="any"
                value={fees}
                onChange={e => setFees(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold"
                style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>Reason (optional)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Jarvis buy signal, earnings play"
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-xs resize-none"
              style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
              style={{ background: "rgba(220,38,38,0.08)", color: C.alert, border: "1px solid rgba(220,38,38,0.3)" }}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
              style={{ background: "var(--surface-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
              style={{ background: C.equity, color: "white", opacity: loading ? 0.6 : 1 }}>
              {loading ? "Saving..." : "Save Trade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
