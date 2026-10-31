"""Send reminders for upcoming calendar events.

Runs every 5 minutes (cron calls this script directly — it is not routed
through pipeline_service on a schedule, to avoid 288 pipeline_runs rows a
day; it is registered there so it can still be triggered from the dashboard).

An event's reminder fires when `start - offset` falls inside the last
LOOKBACK window. Duplicate sends are prevented by notify()'s dedupe_key, so
overlapping runs and retries are safe.
"""
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

import calendar_service as cal  # noqa: E402
from utils.notify import notify  # noqa: E402
from utils.supabase_client import get_supabase  # noqa: E402

logger = logging.getLogger("calendar_reminders")

LOOKBACK = timedelta(minutes=10)
HORIZON = timedelta(days=15)


def _human_offset(minutes: int) -> str:
    if minutes <= 0:
        return "now"
    if minutes % 1440 == 0:
        d = minutes // 1440
        return f"in {d} day{'s' if d > 1 else ''}"
    if minutes >= 60 and minutes % 60 == 0:
        return f"in {minutes // 60} h"
    return f"in {minutes} min"


def due_reminders(occurrences: list[dict], now: datetime, lookback: timedelta = LOOKBACK) -> list[tuple[dict, int]]:
    """(occurrence, offset_minutes) pairs whose reminder time is in (now-lookback, now]."""
    out = []
    for occ in occurrences:
        start = datetime.fromisoformat(occ["starts_at"])
        for offset in occ.get("reminder_offsets") or []:
            fire_at = start - timedelta(minutes=offset)
            if now - lookback < fire_at <= now:
                out.append((occ, offset))
    return out


def run(now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    sb = get_supabase()
    if sb is None:
        logger.error("Supabase not configured")
        return 0
    sent = 0
    users = [r["user_id"] for r in (sb.table("user_profiles").select("user_id").execute().data or [])]
    for user_id in users:
        try:
            tz = cal.local_tz()
            occs = [
                o for o in cal.list_events(user_id, now - LOOKBACK, now + HORIZON)
                if o["origin"] == "user"
            ]
            for occ, offset in due_reminders(occs, now):
                start = datetime.fromisoformat(occ["starts_at"]).astimezone(tz)
                when = start.strftime("%a %d %b") if occ["all_day"] else start.strftime("%H:%M")
                body = when + (f" · {occ['location']}" if occ.get("location") else "")
                if notify(
                    "calendar",
                    f"{occ['title']} {_human_offset(offset)}",
                    body,
                    deep_link="/calendar",
                    dedupe_key=f"cal:{occ['occurrence_id']}:{offset}",
                    user_id=user_id,
                ):
                    sent += 1
        except Exception as e:
            logger.error(f"Reminder run failed for user {user_id}: {e}")
    logger.info(f"Calendar reminders sent: {sent}")
    return sent


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
