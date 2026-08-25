"""
Price refresh worker.

Scans advisor_positions for stale current_price (updated_at older than
STALE_HOURS) and refreshes them from Finnhub. Falls back silently if no
FINNHUB_API_KEY is configured. Safe to run every few hours.
"""
import os
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from dotenv import load_dotenv

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore

load_dotenv()
logger = logging.getLogger("price_refresh")
logging.basicConfig(level=logging.INFO)

FINNHUB_KEY = os.getenv("FINNHUB_API_KEY")
STALE_HOURS = int(os.getenv("PRICE_STALE_HOURS", "24"))
FINNHUB_BASE = "https://finnhub.io/api/v1"


def _resolve_user_id(sb: Client) -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Could not resolve user_id: {e}")
    return "00000000-0000-0000-0000-000000000000"


def _get_supabase() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key or not create_client:
        logger.error("Supabase not configured or client unavailable")
        return None
    return create_client(url, key)


def _finnhub_quote(symbol: str) -> Optional[float]:
    if not FINNHUB_KEY:
        return None
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": symbol, "token": FINNHUB_KEY},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        price = data.get("c")
        if price and float(price) > 0:
            return float(price)
    except Exception as e:
        logger.warning(f"Finnhub quote failed for {symbol}: {e}")
    return None


def _is_stale(updated_at: Optional[str]) -> bool:
    if not updated_at:
        return True
    try:
        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt) > timedelta(hours=STALE_HOURS)
    except Exception:
        return True


def run(user_id: str | None = None):
    sb = _get_supabase()
    if not sb:
        return
    if not FINNHUB_KEY:
        logger.info("FINNHUB_API_KEY not set; skipping price refresh")
        return

    resolved = user_id or _resolve_user_id(sb)

    try:
        res = sb.table("advisor_positions").select(
            "id, symbol, currency, quantity, average_cost, current_price, updated_at"
        ).eq("user_id", resolved).eq("status", "open").execute()
        rows = res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch positions: {e}")
        return

    stale = [r for r in rows if _is_stale(r.get("updated_at"))]
    logger.info(f"Price refresh: {len(stale)} / {len(rows)} positions stale (> {STALE_HOURS}h)")

    updated = 0
    for row in stale:
        symbol = row.get("symbol")
        if not symbol:
            continue
        # Rate-limit: Finnhub free tier = 60/min
        time.sleep(1.1)
        price = _finnhub_quote(symbol)
        if price is None:
            continue
        try:
            qty = float(row.get("quantity") or 0)
            bep = float(row.get("average_cost") or 0)
            position_value = round(qty * price, 4)
            unrealized_pnl = round((price - bep) * qty, 4) if bep else 0
            unrealized_pnl_pct = round(((price / bep) - 1) * 100, 4) if bep else 0
            sb.table("advisor_positions").update({
                "current_price": price,
                "position_value": position_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_pct": unrealized_pnl_pct,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()
            updated += 1
            logger.info(f"Refreshed {symbol}: {price}")
        except Exception as e:
            logger.error(f"Failed to update {symbol}: {e}")

    logger.info(f"Price refresh complete: {updated} prices updated")


if __name__ == "__main__":
    run()
