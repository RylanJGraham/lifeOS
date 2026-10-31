"""The one way to notify the user.

    notify("calendar", "Dentist in 30 min", "Thu 15:00", deep_link="/calendar",
           dedupe_key="cal:<event>:<start>:30")

Every call is recorded in `notifications` (the Inbox history) and then pushed
to the user's devices, subject to their preferences (per-kind toggles, quiet
hours). If no device accepts the push, it falls back to Telegram (outbound
only) when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. Never raises — callers are workers that must not fail because a
notification could not be delivered.
"""
import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from utils.push_notifications import send_push
from utils.telegram import send_telegram
from utils.supabase_client import get_supabase

logger = logging.getLogger("notify")

DEDUPE_WINDOW = timedelta(hours=24)


def _owner_id() -> str:
    from utils.resolve_user_id import resolve_user_id
    return resolve_user_id("api_key", "owner")


def _parse_time(value) -> time | None:
    if not value:
        return None
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        return None


def in_quiet_hours(prefs: dict, now_utc: datetime) -> bool:
    start, end = _parse_time(prefs.get("quiet_start")), _parse_time(prefs.get("quiet_end"))
    if not start or not end or start == end:
        return False
    try:
        tz = ZoneInfo(prefs.get("timezone") or "UTC")
    except Exception:
        tz = timezone.utc
    local = now_utc.astimezone(tz).time()
    if start < end:
        return start <= local < end
    return local >= start or local < end  # window wraps midnight


def push_allowed(prefs: dict | None, kind: str, now_utc: datetime) -> str | None:
    """Return None if a push may be sent, else the skip reason."""
    prefs = prefs or {}
    if prefs.get("push_enabled") is False:
        return "skipped_prefs"
    if (prefs.get("kinds") or {}).get(kind) is False:
        return "skipped_prefs"
    if in_quiet_hours(prefs, now_utc):
        return "skipped_quiet"
    return None


def notify(
    kind: str,
    title: str,
    body: str = "",
    *,
    deep_link: str | None = None,
    dedupe_key: str | None = None,
    data: dict | None = None,
    user_id: str | None = None,
    push: bool = True,
    external: tuple[str, str] | None = None,
) -> bool:
    """Record + push a notification. Returns True if a new row was created.

    `external` = (title, body) to use for third-party channels (Expo/Apple push and
    Telegram) instead of the real text. The Inbox row always keeps the real text.
    Use it for anything private (e.g. work-meeting titles) — neither Telegram nor
    push is end-to-end encrypted."""
    sb = get_supabase()
    if sb is None:
        logger.warning("Supabase not configured; notification dropped")
        return False
    try:
        user_id = user_id or _owner_id()
        now = datetime.now(timezone.utc)

        if dedupe_key:
            since = (now - DEDUPE_WINDOW).isoformat()
            dup = (
                sb.table("notifications").select("id")
                .eq("user_id", user_id).eq("dedupe_key", dedupe_key).gte("created_at", since)
                .limit(1).execute()
            )
            if dup.data:
                return False

        row = {
            "user_id": user_id,
            "kind": kind,
            "title": title,
            "body": body,
            "deep_link": deep_link,
            "dedupe_key": dedupe_key,
            "data": data or {},
        }

        push_status = "skipped_prefs"
        if push:
            prefs_res = sb.table("notification_prefs").select("*").eq("user_id", user_id).limit(1).execute()
            prefs = prefs_res.data[0] if prefs_res.data else None
            reason = push_allowed(prefs, kind, now)
            if reason:
                push_status = reason
            else:
                payload = {**(data or {}), "kind": kind}
                if deep_link:
                    payload["deep_link"] = deep_link
                out_title, out_body = external if external else (title, body)
                sent = send_push(out_title, out_body, payload, user_id=user_id)
                if sent:
                    push_status = "sent"
                    row["pushed_at"] = now.isoformat()
                elif send_telegram(f"{out_title}\n{out_body}" if out_body else out_title):
                    # Fallback channel while no device can receive push.
                    push_status = "telegram"
                    row["pushed_at"] = now.isoformat()
                else:
                    push_status = "no_devices"
        row["push_status"] = push_status

        sb.table("notifications").insert(row).execute()
        return True
    except Exception as e:
        logger.warning(f"notify({kind!r}) failed: {e}")
        return False


def _split(text: str) -> tuple[str, str]:
    first, _, rest = text.strip().partition("\n")
    return first.strip()[:80] or "LifeOS", rest.strip()[:500]


def send_message(kind: str, text: str, *, deep_link: str | None = "/inbox", external_text: str | None = None, **kwargs) -> bool:
    """notify() for workers that compose one block of text: the first line
    becomes the title, the rest the body. `external_text` is the redacted
    version sent to Telegram/push (the Inbox keeps `text`)."""
    title, body = _split(text)
    external = _split(external_text) if external_text else None
    return notify(kind, title, body, deep_link=deep_link, external=external, **kwargs)
