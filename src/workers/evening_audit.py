"""
Evening audit — sent once per night before sleep if the day is incomplete.

Checks whether today has meals, health metrics, and a workout. If anything is
missing, it sends one consolidated Telegram nudge and creates an action item.
The action item is resolved automatically when the user logs the missing data.

Schedule (scripts/windows_tasks.ps1):
    python src/workers/evening_audit.py
"""
import os
import sys
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("evening_audit")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

from goal_checkin import send_telegram  # noqa: E402
from action_items import insert_insight, has_insight_today  # noqa: E402

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _has_meals_today(today: str) -> bool:
    try:
        res = (
            sb.table("meals")
            .select("id", count="exact")
            .gte("meal_time", f"{today}T00:00:00")
            .lt("meal_time", f"{today}T23:59:59.999")
            .execute()
        )
        # Supabase count metadata lives in res.count
        return (getattr(res, "count", 0) or 0) > 0
    except Exception as e:
        logger.warning(f"Meals check failed: {e}")
        return True  # be lenient if the DB call fails


def _has_health_metrics_today(today: str) -> bool:
    try:
        res = (
            sb.table("health_metrics")
            .select("id")
            .eq("recorded_at", f"{today}T00:00:00+00")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Health metrics check failed: {e}")
        return True


def _has_workout_today(today: str) -> bool:
    try:
        res = (
            sb.table("workouts")
            .select("id")
            .gte("workout_date", f"{today}T00:00:00")
            .lt("workout_date", f"{today}T23:59:59.999")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Workout check failed: {e}")
        return True


def main():
    if not sb:
        logger.error("Supabase client not initialized")
        return

    today = _today_iso()

    if has_insight_today("evening_audit"):
        logger.info("Evening audit already sent today")
        return

    missing = []
    if not _has_meals_today(today):
        missing.append("meals")
    if not _has_health_metrics_today(today):
        missing.append("sleep/health metrics")
    if not _has_workout_today(today):
        missing.append("workout")

    if not missing:
        logger.info("Day is complete — no evening audit needed")
        return

    user_id = _user_id()
    missing_str = ", ".join(missing)
    text = (
        f"🌙 Evening audit: today is missing {missing_str}.\n\n"
        "Send a screenshot or text the bot before bed so the dashboard is complete."
    )

    sent = send_telegram(text)
    insert_insight(
        domain="evening_audit",
        insight_text=f"Today is missing {missing_str}.",
        action_item="Send the missing data (meal, health screenshot, or workout) before bed.",
        resolve_previous=True,
        user_id=user_id,
    )
    if sent:
        logger.info(f"Evening audit sent: missing {missing_str}")
    else:
        logger.warning("Evening audit insight stored but Telegram send failed")


if __name__ == "__main__":
    main()
