"""Send push notifications to registered mobile devices via Expo's push API.

Devices register their Expo push token into `device_push_tokens` from the
mobile app (see mobile/src/lib/notifications.ts). No Expo access token is
required to send — Expo's push API is open, rate-limited per token.

Most callers should use `utils.notify.notify()`, which also records the
notification in the Inbox history and applies preferences. `send_push` is the
raw transport.
"""
import logging

import requests

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _fetch_tokens(sb, user_id: str | None) -> list[str]:
    query = sb.table("device_push_tokens").select("expo_push_token").is_("invalid_at", "null")
    if user_id:
        query = query.eq("user_id", user_id)
    return [row["expo_push_token"] for row in query.execute().data or []]


def _retire_dead_tokens(sb, tokens: list[str], tickets: list[dict]) -> None:
    """Expo reports unregistered devices per ticket; stop sending to them."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for token, ticket in zip(tokens, tickets):
        if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
            try:
                sb.table("device_push_tokens").update({"invalid_at": now}).eq("expo_push_token", token).execute()
            except Exception as e:
                logger.warning(f"Could not retire push token: {e}")


def send_push(title: str, body: str, data: dict | None = None, user_id: str | None = None) -> int:
    """Send a push notification to the user's registered devices (all devices
    if `user_id` is None). Returns the number of devices accepted by Expo
    (0 if none registered or on failure — this must never raise, callers use
    it as a best-effort side channel)."""
    sb = get_supabase()
    if sb is None:
        return 0
    try:
        tokens = _fetch_tokens(sb, user_id)
    except Exception as e:
        logger.warning(f"Could not fetch push tokens: {e}")
        return 0
    if not tokens:
        return 0

    messages = [
        {"to": token, "title": title, "body": body, "data": data or {}, "sound": "default"}
        for token in tokens
    ]
    try:
        resp = requests.post(EXPO_PUSH_URL, json=messages, timeout=10)
        resp.raise_for_status()
        tickets = (resp.json() or {}).get("data") or []
    except Exception as e:
        logger.warning(f"Failed to send push notifications: {e}")
        return 0

    _retire_dead_tokens(sb, tokens, tickets)
    return sum(1 for t in tickets if t.get("status") == "ok") if tickets else len(tokens)
