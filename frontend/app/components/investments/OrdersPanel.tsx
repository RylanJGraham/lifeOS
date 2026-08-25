"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Check, X, Send, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../../../utils/supabaseClient";
import type { AdvisorOrder, Position } from "./types";
import { C, num, fmtMoney, actionStyle, EmptyState } from "./shared";

type OrderStatus = AdvisorOrder["status"];

const STATUS_COLORS: Record<OrderStatus, { color: string; bg: string; border: string; label: string }> = {
  proposed: { color: C.equity, bg: "rgba(91,66,232,0.1)", border: "rgba(91,66,232,0.3)", label: "Proposed" },
  approved: { color: C.optimal, bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)", label: "Approved" },
  rejected: { color: C.alert, bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.3)", label: "Rejected" },
  sent: { color: C.growth, bg: "rgba(14,165,233,0.1)", border: "rgba(14,165,233,0.3)", label: "Sent" },
  filled: { color: C.wealth, bg: "rgba(5,150,105,0.12)", border: "rgba(5,150,105,0.35)", label: "Filled" },
  cancelled: { color: C.textTertiary, bg: "var(--surface-tertiary)", border: "var(--border-subtle)", label: "Cancelled" },
  expired: { color: C.warning, bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.3)", label: "Expired" },
};

function orderDetailLine(order: AdvisorOrder) {
  const parts: string[] = [];
  parts.push(`${order.order_type}`);
  if (order.limit_price != null) parts.push(`limit ${fmtMoney(num(order.limit_price), null)}`);
  if (order.stop_price != null) parts.push(`stop ${fmtMoney(num(order.stop_price), null)}`);
  if (order.trailing_pct != null) parts.push(`trail ${num(order.trailing_pct).toFixed(1)}%`);
  parts.push(`TIF ${order.tif}`);
  return parts.join(" · ");
}

function OrderRow({
  order,
  position,
  onUpdate,
}: {
  order: AdvisorOrder;
  position?: Position;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fillPrice, setFillPrice] = useState("");
  const [fillQty, setFillQty] = useState(String(order.quantity));
  const [fillFees, setFillFees] = useState("0");
  const [busy, setBusy] = useState(false);
  const st = STATUS_COLORS[order.status];
  const actionSt = actionStyle(order.action);

  async function setStatus(status: OrderStatus) {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { status };
      if (status === "approved") patch.approved_at = new Date().toISOString();
      if (status === "filled") patch.executed_at = new Date().toISOString();
      await supabase.from("advisor_orders").update(patch).eq("id", order.id);
      onUpdate();
    } finally {
      setBusy(false);
    }
  }

  async function recordFill() {
    const qty = parseFloat(fillQty);
    const price = parseFloat(fillPrice);
    const fees = parseFloat(fillFees) || 0;
    if (!qty || qty <= 0 || !price || price <= 0) return;
    setBusy(true);
    try {
      await supabase.from("advisor_order_fills").insert({
        order_id: order.id,
        fill_qty: qty,
        fill_price: price,
        fees,
        filled_at: new Date().toISOString(),
      });
      await supabase.from("advisor_orders").update({ status: "filled", executed_at: new Date().toISOString() }).eq("id", order.id);

      // Update position from fill
      const { data: existing } = await supabase
        .from("advisor_positions")
        .select("*")
        .eq("symbol", order.symbol)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        symbol: order.symbol,
        currency: order.currency ?? existing?.currency ?? "USD",
        current_price: price,
        latest_signal_action: order.action,
        source: "manual",
      };

      if (order.action === "BUY" || order.action === "ADD") {
        const oldQty = num(existing?.quantity) || 0;
        const oldCost = num(existing?.average_cost) || 0;
        const newQty = oldQty + qty;
        const newAvgCost = newQty > 0 ? (oldQty * oldCost + qty * price + fees) / newQty : price;
        payload.quantity = newQty;
        payload.average_cost = Number(newAvgCost.toFixed(6));
        payload.position_value = Number((newQty * price).toFixed(4));
        payload.unrealized_pnl = Number(((price - newAvgCost) * newQty).toFixed(4));
        payload.unrealized_pnl_pct = newAvgCost > 0 ? Number((((price / newAvgCost) - 1) * 100).toFixed(4)) : 0;
        payload.status = "open";
        payload.side = "long";
      } else {
        const oldQty = num(existing?.quantity) || 0;
        const oldCost = num(existing?.average_cost) || 0;
        const newQty = Math.max(0, oldQty - qty);
        payload.quantity = newQty;
        payload.position_value = Number((newQty * price).toFixed(4));
        payload.unrealized_pnl = Number(((price - oldCost) * newQty).toFixed(4));
        payload.unrealized_pnl_pct = oldCost > 0 ? Number((((price / oldCost) - 1) * 100).toFixed(4)) : 0;
        payload.status = newQty === 0 ? "closed" : "open";
        payload.side = newQty === 0 ? null : "long";
        if (newQty > 0) payload.average_cost = oldCost;
      }

      if (existing?.id) {
        await supabase.from("advisor_positions").update(payload).eq("id", existing.id);
      } else {
        payload.average_cost = payload.average_cost ?? price;
        await supabase.from("advisor_positions").insert(payload);
      }

      onUpdate();
    } finally {
      setBusy(false);
    }
  }

  const isOpen = order.status === "proposed" || order.status === "approved";

  return (
    <div className="border-b border-[var(--border-subtle)] last:border-b-0">
      <div
        className="flex items-center py-2 px-3 cursor-pointer hover:bg-[var(--surface-tertiary)] transition-colors gap-3 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="font-bold font-mono text-[11px] w-12 shrink-0" style={{ color: "var(--text-primary)" }}>
          {order.symbol}
        </div>
        <span className="text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest text-center shrink-0 w-12"
          style={{ background: actionSt.bg, color: actionSt.color, border: `1px solid ${actionSt.border}` }}>
          {order.action}
        </span>
        <span className="text-[9px] px-1 py-[1px] rounded-sm font-bold uppercase tracking-widest text-center shrink-0 w-14"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          {st.label}
        </span>
        <div className="flex-1 text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
          {num(order.quantity).toFixed(4)} · {orderDetailLine(order)}
        </div>
        {order.confidence != null && (
          <div className="text-[10px] font-bold font-mono shrink-0" style={{ color: C.equity }}>
            {(num(order.confidence) <= 1 ? num(order.confidence) * 100 : num(order.confidence)).toFixed(0)}%
          </div>
        )}
        <ChevronDown size={12} style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 bg-[var(--surface-secondary)] border-t border-[var(--border-subtle)] space-y-3">
              {order.rationale && (
                <div className="text-[11px]" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {order.rationale}
                </div>
              )}

              {position && (
                <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                  Current position: {num(position.quantity).toFixed(4)} @ {fmtMoney(num(position.average_cost), position.currency)}
                </div>
              )}

              {isOpen && (
                <div className="flex flex-wrap items-center gap-2">
                  {order.status === "proposed" && (
                    <>
                      <button disabled={busy} onClick={() => setStatus("approved")}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                        style={{ background: C.optimal, color: "white", opacity: busy ? 0.6 : 1 }}>
                        <Check size={10} /> Approve
                      </button>
                      <button disabled={busy} onClick={() => setStatus("rejected")}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                        style={{ background: C.alert, color: "white", opacity: busy ? 0.6 : 1 }}>
                        <X size={10} /> Reject
                      </button>
                    </>
                  )}
                  {order.status === "approved" && (
                    <button disabled={busy} onClick={() => setStatus("sent")}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                      style={{ background: C.growth, color: "white", opacity: busy ? 0.6 : 1 }}>
                      <Send size={10} /> Mark Sent
                    </button>
                  )}
                </div>
              )}

              {(order.status === "approved" || order.status === "sent") && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                    Record Fill
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" step="any" placeholder="Qty" value={fillQty}
                      onChange={e => setFillQty(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-mono"
                      style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }} />
                    <input type="number" step="any" placeholder="Fill price" value={fillPrice}
                      onChange={e => setFillPrice(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-mono"
                      style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }} />
                    <input type="number" step="any" placeholder="Fees" value={fillFees}
                      onChange={e => setFillFees(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-mono"
                      style={{ background: "var(--surface-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }} />
                  </div>
                  <button disabled={busy} onClick={recordFill}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                    style={{ background: C.wealth, color: "white", opacity: busy ? 0.6 : 1 }}>
                    <Check size={10} /> Log Fill
                  </button>
                </div>
              )}

              {order.status === "filled" && (
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: C.wealth }}>
                  <Check size={10} /> Filled
                </div>
              )}

              {(order.status === "proposed" || order.status === "approved") && (
                <button disabled={busy} onClick={() => setStatus("cancelled")}
                  className="text-[10px] font-bold uppercase tracking-widest transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-tertiary)" }}>
                  Cancel order
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OrdersPanel({
  orders,
  positions,
  onUpdate,
}: {
  orders: AdvisorOrder[];
  positions: Position[];
  onUpdate: () => void;
}) {
  const positionsBySymbol = new Map(positions.map(p => [p.symbol, p]));
  const groups: Record<OrderStatus, AdvisorOrder[]> = {
    proposed: [],
    approved: [],
    sent: [],
    filled: [],
    rejected: [],
    cancelled: [],
    expired: [],
  };
  orders.forEach(o => groups[o.status].push(o));

  const active = [...groups.proposed, ...groups.approved, ...groups.sent];
  const history = [...groups.filled, ...groups.rejected, ...groups.cancelled, ...groups.expired];

  if (orders.length === 0) {
    return (
      <EmptyState
        message="No advisor orders yet. Jarvis will propose orders here after you update it to write to advisor_orders."
        icon={ClipboardList}
      />
    );
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.equity }}>
            Active Orders · {active.length}
          </div>
          <div className="flex flex-col border border-[rgba(91,66,232,0.3)] rounded-md overflow-hidden bg-[rgba(91,66,232,0.03)]">
            {active.map(o => (
              <OrderRow key={o.id} order={o} position={positionsBySymbol.get(o.symbol)} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
          History · {history.length}
        </div>
        <div className="flex flex-col border border-[var(--border-subtle)] rounded-md overflow-hidden bg-[var(--surface-primary)]">
          {history.map(o => (
            <OrderRow key={o.id} order={o} position={positionsBySymbol.get(o.symbol)} onUpdate={onUpdate} />
          ))}
        </div>
      </div>
    </div>
  );
}
