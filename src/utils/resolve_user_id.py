"""Resolve a real Supabase user_id from Telegram chat ID, web session id, etc.

Falls back to the first user_profiles row or the zero UUID. The idea is to stop
hardcoding ZERO_UUID in every handler and instead thread identity through the
inbound source/external_id pair.
"""
import os
import logging
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore
    Client = None  # type: ignore

logger = logging.getLogger("resolve_user_id")

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def get_supabase() -> Optional[Client]:
    if not create_client:
        return None
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        logger.warning(f"Could not create Supabase client: {e}")
        return None


def resolve_user_id(source: str, external_id: str) -> str:
    """Return the real user_id for the given source/external_id pair.

    Looks up user_identities first, then falls back to user_profiles.first().
    Returns ZERO_UUID only as last resort.
    """
    sb = get_supabase()
    if not sb:
        return ZERO_UUID

    try:
        res = sb.table("user_identities").select("user_id").eq("source", source).eq("external_id", external_id).limit(1).execute()
        if res.data and res.data[0].get("user_id"):
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"user_identities lookup failed: {e}")

    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and res.data[0].get("user_id"):
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"user_profiles fallback failed: {e}")

    return ZERO_UUID


def ensure_identity(source: str, external_id: str, user_id: str) -> None:
    """Record or update an identity mapping. Safe to call repeatedly."""
    sb = get_supabase()
    if not sb or not source or not external_id or not user_id:
        return
    try:
        existing = sb.table("user_identities").select("id").eq("source", source).eq("external_id", external_id).limit(1).execute()
        if existing.data:
            sb.table("user_identities").update({"user_id": user_id, "updated_at": "now()"}).eq("id", existing.data[0]["id"]).execute()
        else:
            sb.table("user_identities").insert({
                "user_id": user_id,
                "source": source,
                "external_id": external_id,
            }).execute()
    except Exception as e:
        logger.warning(f"Failed to ensure identity {source}/{external_id}: {e}")
