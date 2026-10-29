"""
Shared action-items helpers.

All insight workers write to ai_insights through this module so the dashboard's
"Action Items" panel stays coherent:
- insert_insight() supersedes the previous unresolved insight for the same domain.
- mark_resolved() lets user-facing code clear an action item when the user acts.

Pending action items are simply ai_insights rows where resolved_at IS NULL and
action_item IS NOT NULL.
"""
import os
import sys
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logger = logging.getLogger("action_items")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mark_resolved(domain: str, resolution: str, insight_id: str | None = None) -> int:
    """Mark unresolved ai_insights rows for a domain as resolved.

    If insight_id is provided, only that row is resolved; otherwise all
    unresolved rows for the domain are resolved.

    Returns the number of rows resolved.
    """
    if not sb:
        logger.warning(f"Cannot resolve {domain}: Supabase not configured")
        return 0
    try:
        query = (
            sb.table("ai_insights")
            .update({"resolved_at": _now_iso(), "resolution": resolution})
            .is_("resolved_at", "null")
            .eq("domain", domain)
        )
        if insight_id:
            query = query.eq("id", insight_id)
        res = query.execute()
        # Supabase REST returns the updated rows in res.data
        data = getattr(res, "data", None) or res.get("data") if isinstance(res, dict) else []
        count = len(data) if isinstance(data, list) else 0
        if count:
            logger.info(f"Resolved {count} pending '{domain}' insight(s): {resolution}")
        return count
    except Exception as e:
        logger.warning(f"Failed to resolve {domain} insights: {e}")
        return 0


def insert_insight(
    domain: str,
    insight_text: str,
    action_item: str | None = None,
    resolve_previous: bool = True,
    user_id: str | None = None,
) -> bool:
    """Insert a new ai_insights row and optionally resolve previous ones.

    Workers call this instead of writing to ai_insights directly.
    """
    if not sb:
        logger.warning(f"Cannot insert {domain} insight: Supabase not configured")
        return False

    uid = user_id or _user_id()
    if resolve_previous:
        mark_resolved(domain, "superseded by newer insight")

    try:
        sb.table("ai_insights").insert({
            "user_id": uid,
            "domain": domain,
            "insight_text": insight_text,
            "action_item": action_item,
        }).execute()
        logger.info(f"Inserted '{domain}' insight")
        return True
    except Exception as e:
        logger.error(f"Failed to insert {domain} insight: {e}")
        return False


def get_pending(domains: list[str] | None = None):
    """Return unresolved insights (action items), optionally filtered by domain."""
    if not sb:
        return []
    q = sb.table("ai_insights").select("*").is_("resolved_at", "null")
    if domains:
        q = q.in_("domain", domains)
    try:
        res = q.order("generated_at", desc=True).limit(100).execute()
        return res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch pending insights: {e}")
        return []


def has_insight_today(domain: str) -> bool:
    """True if an insight already exists for this domain today (resolved or not)."""
    if not sb:
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        res = (
            sb.table("ai_insights")
            .select("id")
            .eq("domain", domain)
            .gte("generated_at", f"{today}T00:00:00+00")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Failed to check today's {domain} insight: {e}")
        return False
