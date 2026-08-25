"""Shared position math for LifeOS.

This module centralises the BUY/ADD vs SELL/TRIM calculation so that the
LangGraph trade handler, the IBKR Flex Query worker, and any dashboard order UI
all behave identically. It is the single source of truth for how fills mutate
`advisor_positions`.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

try:
    from supabase import Client
except ImportError:
    Client = None  # type: ignore

logger = logging.getLogger("positions")


def _to_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def update_position_from_fill(
    supabase: Client,
    user_id: str,
    symbol: str,
    action: str,
    qty: float,
    price: float,
    fees: float = 0.0,
    currency: str = "USD",
    source: str = "manual",
    asset_class: str | None = None,
    options: dict | None = None,
    reason: str | None = None,
) -> dict | None:
    """Apply a fill to `advisor_positions`.

    BUY/ADD increase quantity and recalc average cost using weighted average.
    SELL/TRIM decrease quantity; the position is closed when quantity hits zero.
    Manual rows preserve their source='manual' flag and average cost even on
    subsequent price refreshes.

    `options` is merged into the stored row and is intended for option/derivatives
    metadata (strike, expiry, putCall, multiplier, underlyingSymbol, etc.).

    Returns the upserted position dict, or None if Supabase is unavailable.
    """
    if not supabase:
        logger.error("Supabase not available; cannot update position.")
        return None

    action = (action or "buy").lower()
    symbol = symbol.upper().strip()
    currency = (currency or "USD").upper()
    qty = _to_float(qty, 0.0)
    price = _to_float(price, 0.0)
    fees = _to_float(fees, 0.0)
    if qty <= 0 or price <= 0 or not symbol:
        logger.warning(f"Invalid fill data: symbol={symbol}, qty={qty}, price={price}")
        return None

    try:
        pos_res = supabase.table("advisor_positions") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("symbol", symbol) \
            .eq("status", "open") \
            .limit(1) \
            .execute()
        existing = (pos_res.data or [])[0] if pos_res.data else None
    except Exception as e:
        logger.error(f"Failed to load existing position for {symbol}: {e}")
        return None

    row: dict = {
        "user_id": user_id,
        "symbol": symbol,
        "currency": currency,
        "source": source,
        "latest_signal_action": action.upper(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if asset_class:
        row["asset_class"] = asset_class

    if options is not None:
        existing_options = existing.get("options") if existing else None
        if isinstance(existing_options, dict):
            row["options"] = {**existing_options, **options}
        else:
            row["options"] = options

    if action in ("buy", "add"):
        old_qty = _to_float(existing.get("quantity") if existing else 0)
        old_cost = _to_float(existing.get("average_cost") if existing else 0)
        new_qty = old_qty + qty
        if new_qty <= 0:
            new_qty = qty
        old_basis = old_qty * old_cost
        new_basis = qty * price + fees
        new_avg_cost = (old_basis + new_basis) / new_qty if new_qty > 0 else price
        position_value = new_qty * price
        unrealized_pnl = (price - new_avg_cost) * new_qty
        unrealized_pnl_pct = ((price / new_avg_cost) - 1) * 100 if new_avg_cost > 0 else 0

        row.update({
            "quantity": round(new_qty, 6),
            "average_cost": round(new_avg_cost, 6),
            "current_price": price,
            "position_value": round(position_value, 4),
            "unrealized_pnl": round(unrealized_pnl, 4),
            "unrealized_pnl_pct": round(unrealized_pnl_pct, 4),
            "status": "open",
            "side": "long",
        })
    elif action in ("sell", "trim"):
        old_qty = _to_float(existing.get("quantity") if existing else 0)
        old_cost = _to_float(existing.get("average_cost") if existing else 0)
        new_qty = max(0.0, old_qty - qty)
        position_value = new_qty * price
        unrealized_pnl = (price - old_cost) * new_qty
        unrealized_pnl_pct = ((price / old_cost) - 1) * 100 if old_cost > 0 else 0

        row.update({
            "quantity": round(new_qty, 6),
            "current_price": price,
            "position_value": round(position_value, 4),
            "unrealized_pnl": round(unrealized_pnl, 4),
            "unrealized_pnl_pct": round(unrealized_pnl_pct, 4),
            "currency": currency,
            "status": "closed" if new_qty == 0 else "open",
            "side": "long" if new_qty > 0 else None,
        })
        if new_qty > 0:
            row["average_cost"] = old_cost
        if new_qty == 0:
            row["unrealized_pnl"] = 0
            row["unrealized_pnl_pct"] = 0
            row["position_value"] = 0
    else:
        logger.warning(f"Unknown trade action '{action}'; skipping position update.")
        return None

    # Preserve manual source/average_cost if an existing manual row exists.
    if existing and existing.get("source") == "manual":
        row["source"] = "manual"
        manual_avg = _to_float(existing.get("average_cost"), price)
        row["average_cost"] = manual_avg
        if manual_avg and price:
            row["unrealized_pnl"] = round((price - manual_avg) * row["quantity"], 4)
            row["unrealized_pnl_pct"] = round(((price / manual_avg) - 1) * 100, 4)

    try:
        if existing:
            supabase.table("advisor_positions").update(row).eq("id", existing["id"]).execute()
            logger.info(f"Updated position for {symbol}: qty {existing.get('quantity')} -> {row['quantity']}")
        else:
            row.setdefault("average_cost", price)
            row.setdefault("asset_class", asset_class or "equity")
            supabase.table("advisor_positions").insert(row).execute()
            logger.info(f"Created new position for {symbol}: qty {row['quantity']}")
        return row
    except Exception as e:
        logger.error(f"Failed to upsert position for {symbol}: {e}")
        return None
