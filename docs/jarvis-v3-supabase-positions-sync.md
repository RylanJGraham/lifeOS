# Jarvis v3 Patch — Read Positions from Supabase

**Historical — Jarvis Advisor v3 has been removed from the user's setup.** This document is kept only because it describes the exact read/write contract (tables, columns, cadence) that the in-house replacement, `src/workers/market_advisor.py`, now implements against the same schema. See `docs/architecture.md` §3.3 for the live implementation and `docs/daily-finance-flow.md` for the current daily sequence. Do not apply this patch or resurrect the external Jarvis service.

This patch made Jarvis Advisor v3 treat Supabase `advisor_positions` as the source of truth for current holdings, instead of its local `config/user_config.json`. Apply these changes in the Jarvis workspace:

```
/root/.openclaw/workspace/Jarvis_Trading/advisor/
```

## Goal

- LifeOS (Telegram/web chat + dashboard) and Jarvis share one position book.
- When you text a trade to LifeOS, `advisor_positions` is updated in Supabase.
- The next Jarvis daily run reads those positions, revalues them with live prices, and continues its normal swarm/signal workflow.

## Step 1 — Load positions from Supabase at run start

Edit `v3/portfolio_tracker.py`. Replace the position-loading logic so it reads open positions from Supabase first, then falls back to `user_config.json` only if Supabase has no rows.

```python
from supabase import create_client
import os

def _load_positions_from_supabase(user_id: str, base_currency: str):
    """Load open positions from Supabase. Returns a list of dicts matching
    the internal portfolio tracker format."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return []
    try:
        sb = create_client(url, key)
        res = sb.table("advisor_positions").select("*").eq("user_id", user_id).eq("status", "open").execute()
        rows = res.data or []
        positions = []
        for r in rows:
            positions.append({
                "symbol": r["symbol"],
                "qty": float(r.get("quantity") or 0),
                "bep": float(r.get("average_cost") or 0),
                "tags": [r.get("currency", base_currency).upper()] + (r.get("sector") and [r["sector"]] or []),
            })
        return positions
    except Exception as e:
        logger.warning(f"Could not load positions from Supabase: {e}")
        return []

# In PortfolioTracker.__init__ or wherever positions are currently loaded from JSON:
positions_from_db = _load_positions_from_supabase(user_id, base_currency)
if positions_from_db:
    self.positions = positions_from_db
else:
    self.positions = config.get("positions", [])
```

## Step 2 — Preserve Supabase `source` metadata

Edit `v3/supabase_client.py`. When Jarvis upserts `advisor_positions`, it should preserve the `source` column for rows that came from `manual`. This prevents Jarvis from stamping every row as `jarvis` and losing the manual badge.

Locate the upsert block for `advisor_positions` and change it from a blind upsert to a select-then-update/insert, or add `source` handling:

```python
# Before upsert, check if an existing open manual row exists.
existing = sb.table("advisor_positions").select("source").eq("user_id", user_id).eq("symbol", symbol).eq("status", "open").execute()
source = "jarvis"
if existing.data and existing.data[0].get("source") == "manual":
    source = "manual"  # Preserve user-logged trades

row = {
    "user_id": user_id,
    "symbol": symbol,
    "quantity": qty,
    "average_cost": bep,
    "current_price": price,
    "position_value": value,
    "unrealized_pnl": pnl,
    "unrealized_pnl_pct": pnl_pct,
    "currency": currency,
    "status": "open",
    "source": source,
}
```

## Step 3 — Skip overwriting config positions on writeback (optional)

If Jarvis currently writes its revalued positions back to `config/user_config.json`, consider removing that step. Supabase is now the source of truth; the JSON config only provides initial fallback data.

## Step 4 — Run the migration in Supabase

Run `docs/supabase-migrations/012-advisor-purchases-sync.sql` in the Supabase SQL editor before restarting Jarvis.

## Verification

1. Text a manual trade to the LifeOS bot.
2. Check Supabase: `advisor_positions` should have a new/modified row with `source = 'manual'`.
3. Trigger Jarvis v3 manually: `cd /root/.openclaw/workspace/Jarvis_Trading/advisor && python3 v3/run_daily.py`
4. Check that Jarvis still generates signals, snapshots, and reports using the updated position quantities.
5. Refresh the LifeOS Investments page — the position row should remain, with the "Manual" badge.
