"""
Sync financial goal progress against live metrics.

Runs on a schedule and updates goals.current_value for any active financial
goal that has a linked_metric (bank_balance, net_worth, portfolio_value).
"""
import logging
import os
from datetime import datetime, timezone

from supabase import create_client

logger = logging.getLogger("goal_metric_sync")
logging.basicConfig(level=logging.INFO)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _get_supabase():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.error("Supabase credentials missing")
        return None
    return create_client(url, key)


def _resolve_user_id(supabase):
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Failed to resolve user_id: {e}")
    return ZERO_UUID


def _fetch_metrics(supabase, user_id: str) -> dict:
    metrics = {"bank_balance": None, "portfolio_value": None, "net_worth": None}

    try:
        res = supabase.table("user_profiles").select("bank_balance").eq("user_id", user_id).limit(1).execute()
        if res.data:
            metrics["bank_balance"] = float(res.data[0].get("bank_balance") or 0)
    except Exception as e:
        logger.warning(f"Failed to fetch bank_balance: {e}")

    try:
        res = (
            supabase.table("advisor_portfolio_snapshots")
            .select("total_value")
            .order("record_date", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            metrics["portfolio_value"] = float(res.data[0].get("total_value") or 0)
    except Exception as e:
        logger.warning(f"Failed to fetch portfolio_value: {e}")

    if metrics["bank_balance"] is not None and metrics["portfolio_value"] is not None:
        metrics["net_worth"] = metrics["bank_balance"] + metrics["portfolio_value"]

    return metrics


def run_sync():
    supabase = _get_supabase()
    if not supabase:
        logger.error("Supabase unavailable; aborting goal metric sync")
        return

    user_id = _resolve_user_id(supabase)
    metrics = _fetch_metrics(supabase, user_id)
    logger.info(f"Metrics for goal sync: {metrics}")

    try:
        res = (
            supabase.table("goals")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "active")
            .not_.is_("linked_metric", "null")
            .execute()
        )
        goals = res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch goals: {e}")
        return

    updated = 0
    for goal in goals:
        metric = goal.get("linked_metric")
        value = metrics.get(metric)
        if value is None:
            logger.warning(f"No live value for linked_metric={metric}; skipping goal '{goal.get('title')}'")
            continue

        try:
            supabase.table("goals").update({
                "current_value": value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", goal["id"]).execute()
            logger.info(f"Updated goal '{goal.get('title')}' current_value to {value} from {metric}")
            updated += 1
        except Exception as e:
            logger.error(f"Failed to update goal '{goal.get('title')}': {e}")

    logger.info(f"Goal metric sync complete: {updated}/{len(goals)} goals updated")


if __name__ == "__main__":
    run_sync()
