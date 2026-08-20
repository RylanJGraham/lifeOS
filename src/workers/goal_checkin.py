"""
Goal check-in worker: the proactive half of the Goals feature.

Reads each active goal's `checkin_cadence` and, when a check-in is due,
messages the user on Telegram:

- daily  (habit goals, e.g. quitting something): asks "did you stay on track
  today?" with inline Yes/No buttons. The answer is recorded by the webhook
  (`telegram_webhook.py`, callback_data "goal_checkin:<goal_id>:<yes|no>"),
  which bumps/resets the goal's current_value streak.
- weekly (financial goals): resolves the goal's `linked_metric` against live
  data (bank balance / portfolio value / net worth), compares it to
  `target_value`, and sends a progress assessment — a clear GREEN LIGHT when
  the target is met.

Every send also writes an "auto:" row to goal_checkins so re-runs within the
same period don't spam, and so the goals chat can see what was sent.

Usage (mirrors the Windows Scheduled Tasks in scripts/windows_tasks.ps1):
    python src/workers/goal_checkin.py daily
    python src/workers/goal_checkin.py weekly
    python src/workers/goal_checkin.py          # both
"""
import os
import sys
import logging
from datetime import datetime, timedelta

# Allow `python src/workers/goal_checkin.py` from the repo root: puts src/ on
# the path so the lazy `from graph import llm_fast` resolves.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("goal_checkin")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def send_telegram(text: str, reply_markup: dict | None = None) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram not configured; skipping send")
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        r = requests.post(url, json=payload, timeout=8.0)
        r.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


def _period_start(cadence: str) -> datetime:
    """Start of the current check-in period (local time)."""
    now = datetime.now()
    if cadence == "weekly":
        monday = now - timedelta(days=now.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _already_checked_in(goal_id: str, since: datetime) -> bool:
    """True if any check-in (manual, auto-sent, or answered) exists this period."""
    try:
        res = (
            sb.table("goal_checkins").select("id")
            .eq("goal_id", goal_id)
            .gte("created_at", since.isoformat())
            .limit(1).execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Failed to check existing check-ins for goal {goal_id}: {e}")
        return False


def _log_auto_checkin(goal: dict, note: str, value: float | None = None):
    try:
        row = {"goal_id": goal["id"], "user_id": goal.get("user_id"), "note": note}
        if value is not None:
            row["value"] = value
        sb.table("goal_checkins").insert(row).execute()
    except Exception as e:
        logger.error(f"Failed to log check-in for goal {goal.get('id')}: {e}")


def _resolve_linked_metric(metric: str | None) -> tuple[float | None, str]:
    """Live value for net_worth | bank_balance | portfolio_value."""
    bank = None
    portfolio = None
    try:
        res = sb.table("user_profiles").select("bank_balance").limit(1).execute()
        if res.data and res.data[0].get("bank_balance") is not None:
            bank = float(res.data[0]["bank_balance"])
    except Exception as e:
        logger.warning(f"Failed to fetch bank balance: {e}")
    try:
        res = (
            sb.table("advisor_portfolio_snapshots").select("total_value")
            .order("record_date", desc=True).limit(1).execute()
        )
        if res.data and res.data[0].get("total_value") is not None:
            portfolio = float(res.data[0]["total_value"])
    except Exception as e:
        logger.warning(f"Failed to fetch portfolio snapshot: {e}")

    if metric == "bank_balance":
        return bank, "bank balance"
    if metric == "portfolio_value":
        return portfolio, "portfolio value"
    if metric == "net_worth":
        if bank is None and portfolio is None:
            return None, "net worth"
        return (bank or 0) + (portfolio or 0), "net worth"
    return None, "value"


def _llm_assessment(goal: dict, metric_label: str, value: float, target: float) -> str | None:
    """Short progress assessment from the fast cloud model; None if unavailable."""
    try:
        from graph import llm_fast  # lazy: avoids loading the graph for plain runs
        if not llm_fast:
            return None
        from langchain_core.messages import HumanMessage
        pct = (value / target * 100) if target else 0
        prompt = (
            "You are Jarvis, the user's dry-witted personal chief of staff. "
            "Write a 2-3 sentence Telegram check-in about this financial goal. "
            "Be concrete: current value vs target, percentage, and what remains. "
            "No emojis except at most one. No questions.\n\n"
            f'Goal: "{goal.get("title")}"'
            + (f' — {goal.get("description")}' if goal.get("description") else "")
            + f"\nDeadline: {goal.get('deadline') or 'none'}"
            f"\nCurrent {metric_label}: {value:,.0f} {goal.get('currency') or ''}"
            f"\nTarget: {target:,.0f} {goal.get('currency') or ''} ({pct:.0f}% funded)"
        )
        return llm_fast.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        logger.warning(f"LLM assessment failed, using template: {e}")
        return None


def checkin_habit_goal(goal: dict):
    """Daily/weekly habit question with inline Yes/No buttons."""
    title = goal.get("title", "Untitled goal")
    current = goal.get("current_value") or 0
    unit = goal.get("unit") or "days"
    period = "today" if goal.get("checkin_cadence") == "daily" else "this week"

    text = f"🎯 Goal check-in: {title}\n"
    if goal.get("description"):
        text += f"{goal['description']}\n"
    text += f"Current streak: {current} {unit}\n\nDid you stay on track {period}?"
    keyboard = {"inline_keyboard": [[
        {"text": "✅ Yes", "callback_data": f"goal_checkin:{goal['id']}:yes"},
        {"text": "❌ Slipped", "callback_data": f"goal_checkin:{goal['id']}:no"},
    ]]}

    if send_telegram(text, reply_markup=keyboard):
        _log_auto_checkin(goal, f"auto:{goal.get('checkin_cadence')} question sent")
        logger.info(f"Sent habit check-in for goal '{title}'")


def _log_goal_insight(goal: dict, insight_text: str, action_item: str | None = None):
    """Mirror a financial-goal update into ai_insights (domain 'goals') so the
    Nexus action-items panel can surface it."""
    try:
        sb.table("ai_insights").insert({
            "user_id": goal.get("user_id"),
            "domain": "goals",
            "insight_text": insight_text,
            "action_item": action_item,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to log goal insight: {e}")


def checkin_financial_goal(goal: dict):
    """Weekly financial progress assessment / green light."""
    title = goal.get("title", "Untitled goal")
    target = goal.get("target_value")
    currency = goal.get("currency") or ""

    value, metric_label = _resolve_linked_metric(goal.get("linked_metric"))
    if value is None:
        # No live metric — fall back to the stored current_value.
        if goal.get("current_value") is not None:
            value, metric_label = float(goal["current_value"]), "recorded value"
        else:
            logger.info(f"Goal '{title}' has no resolvable metric; skipping")
            return

    green_light = bool(target and value >= float(target))
    if green_light:
        text = (
            f"🟢 GREEN LIGHT: {title}\n\n"
            f"Your {metric_label} is {value:,.0f} {currency} — "
            f"target of {float(target):,.0f} {currency} reached."
        )
        if goal.get("description"):
            text += f"\n\n{goal['description']}"
    else:
        assessment = _llm_assessment(goal, metric_label, value, float(target)) if target else None
        if assessment:
            text = f"📊 Weekly goal update: {title}\n\n{assessment}"
        elif target:
            pct = value / float(target) * 100
            text = (
                f"📊 Weekly goal update: {title}\n"
                f"{metric_label.capitalize()}: {value:,.0f} / {float(target):,.0f} {currency} ({pct:.0f}%)"
            )
        else:
            text = f"📊 Weekly goal update: {title}\n{metric_label.capitalize()}: {value:,.0f} {currency}"

    if send_telegram(text):
        _log_auto_checkin(goal, f"auto:weekly update sent ({metric_label}={value:,.0f})", value)
        _log_goal_insight(
            goal,
            text.split("\n\n", 1)[-1] if "\n\n" in text else text,  # strip the emoji header for the dashboard card
            action_item="You're clear to proceed — review the plan and pull the trigger." if green_light else None,
        )
        logger.info(f"Sent financial check-in for goal '{title}'")


def run(cadence: str):
    if not sb:
        logger.error("Supabase client not initialized (check SUPABASE_URL / SUPABASE_SERVICE_KEY)")
        return
    since = _period_start(cadence)
    try:
        res = (
            sb.table("goals").select("*")
            .eq("status", "active").eq("checkin_cadence", cadence).execute()
        )
        goals = res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch {cadence} goals: {e}")
        return

    logger.info(f"{len(goals)} active goal(s) with {cadence} cadence")
    for goal in goals:
        if _already_checked_in(goal["id"], since):
            logger.info(f"Goal '{goal.get('title')}' already checked in this period; skipping")
            continue
        try:
            if goal.get("category") == "financial" or goal.get("linked_metric"):
                checkin_financial_goal(goal)
            else:
                checkin_habit_goal(goal)
        except Exception as e:
            logger.error(f"Check-in failed for goal '{goal.get('title')}': {e}")


if __name__ == "__main__":
    cadences = sys.argv[1:] or ["daily", "weekly"]
    for c in cadences:
        if c not in ("daily", "weekly"):
            logger.error(f"Unknown cadence '{c}' (expected daily|weekly)")
            continue
        logger.info(f"Running {c} goal check-ins...")
        run(c)
