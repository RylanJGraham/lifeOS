"""Send push notifications to registered mobile devices via Expo's push API.

Devices register their Expo push token into `device_push_tokens` from the
mobile app (see mobile/src/lib/notifications.ts). No Expo access token is
required to send — Expo's push API is open, rate-limited per token.
"""
import logging
import os

import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _get_supabase():
    try:
        from supabase import create_client
    except ImportError:
        return None
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        logger.warning(f"Could not create Supabase client: {e}")
        return None


def send_push(title: str, body: str, data: dict | None = None) -> int:
    """Send a push notification to every registered device. Returns the
    number of devices it was sent to (0 if none registered or on failure —
    this must never raise, callers use it as a best-effort side channel)."""
    sb = _get_supabase()
    if sb is None:
        return 0
    try:
        tokens = [
            row["expo_push_token"]
            for row in sb.table("device_push_tokens").select("expo_push_token").execute().data
        ]
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
    except Exception as e:
        logger.warning(f"Failed to send push notifications: {e}")
        return 0
    return len(tokens)
