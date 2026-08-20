"""
Morning readiness briefing — the daily steering message.

Runs at 7:00 (LifeOS-MorningBriefing scheduled task). Computes facts in
Python, uses the LLM only for phrasing, sends ONE Telegram message, and
mirrors the headline into ai_insights (domain "readiness") so the Nexus
action-items panel can show it.

Facts computed:
- Last night's sleep vs 8h + 7-day sleep debt (hours behind)
- RHR vs 14-day baseline (HRV used when present — it's often null)
- Illness flag: RHR >= baseline + 5 with poor sleep -> deload advice
- Training pick: most-neglected muscle group this ISO week vs the 10-20
  sets/week range (priorities from training memories win)
- Yesterday's nutrition close-out vs targets
"""
import os
import sys
import json
import logging
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("morning_briefing")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

from goal_checkin import send_telegram  # noqa: E402  (same workers dir)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def gather_facts() -> dict:
    facts = {}
    now = datetime.now()

    # --- sleep & recovery ---
    try:
        since = (now - timedelta(days=14)).isoformat()
        rows = (
            sb.table("health_metrics")
            .select("recorded_at, hrv, resting_heart_rate, sleep_duration_minutes, sleep_deep_minutes")
            .gte("recorded_at", since).order("recorded_at", desc=True).execute()
        ).data or []
        sleep_rows = [r for r in rows if r.get("sleep_duration_minutes")]
        rhr_rows = [r for r in rows if r.get("resting_heart_rate")]
        if sleep_rows:
            last = sleep_rows[0]
            facts["last_sleep_h"] = round(last["sleep_duration_minutes"] / 60, 1)
            facts["last_deep_min"] = last.get("sleep_deep_minutes")
            week = sleep_rows[:7]
            debt = sum(max(0, 480 - r["sleep_duration_minutes"]) for r in week)
            facts["sleep_debt_h"] = round(debt / 60, 1)
            facts["sleep_avg_h"] = round(sum(r["sleep_duration_minutes"] for r in week) / len(week) / 60, 1)
        if rhr_rows:
            facts["rhr_latest"] = rhr_rows[0]["resting_heart_rate"]
            if len(rhr_rows) > 2:
                base = [r["resting_heart_rate"] for r in rhr_rows[1:]]
                facts["rhr_baseline"] = round(sum(base) / len(base))
    except Exception as e:
        logger.warning(f"health_metrics fetch failed: {e}")

    # --- readiness verdict (rules, not vibes) ---
    score = 0
    reasons = []
    if facts.get("last_sleep_h") is not None:
        if facts["last_sleep_h"] >= 7:
            score += 1
        elif facts["last_sleep_h"] < 6:
            score -= 1
            reasons.append(f"short sleep ({facts['last_sleep_h']}h)")
    if facts.get("sleep_debt_h") is not None and facts["sleep_debt_h"] >= 4:
        score -= 1
        reasons.append(f"{facts['sleep_debt_h']}h sleep debt this week")
    if facts.get("rhr_latest") and facts.get("rhr_baseline"):
        delta = facts["rhr_latest"] - facts["rhr_baseline"]
        facts["rhr_delta"] = delta
        if delta >= 5:
            score -= 2
            reasons.append(f"RHR {facts['rhr_latest']} vs {facts['rhr_baseline']} baseline (+{delta})")
        elif delta >= 3:
            score -= 1
            reasons.append(f"RHR slightly elevated (+{delta})")
    illness = bool(facts.get("rhr_delta", 0) >= 5 and facts.get("last_sleep_h", 8) < 6.5)
    facts["readiness"] = "red" if illness or score <= -2 else "yellow" if score < 0 else "green"
    facts["readiness_reasons"] = reasons
    facts["illness_flag"] = illness

    # --- training pick: most neglected muscle group this ISO week ---
    try:
        monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        ex_to_group = {}
        for tbl in ("workout_template_exercises", "exercise_muscles"):
            for r in (sb.table(tbl).select("exercise_name, muscle_group").execute()).data or []:
                ex_to_group[r["exercise_name"]] = r["muscle_group"]
        wrows = (
            sb.table("workouts").select("exercise_name, sets, reps, weight")
            .gte("workout_date", monday.isoformat()).execute()
        ).data or []
        groups = {}
        for r in wrows:
            g = ex_to_group.get(r.get("exercise_name"))
            if g and (r.get("sets") or r.get("reps") or r.get("weight")):
                groups[g] = groups.get(g, 0) + (r.get("sets") or 0)
        facts["sets_this_week"] = groups
        ALL = ["Chest", "Back", "Front Delts", "Rear Delts", "Biceps", "Triceps", "Abs", "Quads", "Hamstrings", "Glutes", "Calves"]
        neglected = sorted(ALL, key=lambda g: groups.get(g, 0))
        facts["most_neglected"] = [g for g in neglected if groups.get(g, 0) < 10][:3]
    except Exception as e:
        logger.warning(f"training coverage fetch failed: {e}")

    # --- yesterday's nutrition close-out ---
    try:
        prof = (sb.table("user_profiles")
                .select("daily_caloric_target, protein_target_g, goal").limit(1).execute()).data
        if prof:
            facts["cal_target"] = prof[0].get("daily_caloric_target")
            facts["protein_target"] = prof[0].get("protein_target_g")
            facts["goal"] = prof[0].get("goal")
        yesterday = (now - timedelta(days=1)).date().isoformat()
        mrows = (
            sb.table("meals").select("calories, protein")
            .gte("meal_time", f"{yesterday}T00:00:00").lt("meal_time", f"{yesterday}T23:59:59.999").execute()
        ).data or []
        if mrows:
            facts["y_kcal"] = round(sum(float(m.get("calories") or 0) for m in mrows))
            facts["y_protein"] = round(sum(float(m.get("protein") or 0) for m in mrows))
    except Exception as e:
        logger.warning(f"nutrition close-out failed: {e}")

    return facts


def compose(facts: dict) -> tuple[str, str | None]:
    """Returns (telegram_text, action_item). LLM for voice, template fallback."""
    action_item = None
    if facts.get("illness_flag"):
        action_item = "Likely getting sick — rest or light walk only today, no training."
    elif facts.get("readiness") == "red":
        action_item = "Recovery day — easy movement only."
    elif facts.get("most_neglected"):
        action_item = f"Train today: {', '.join(facts['most_neglected'][:2])} — most neglected this week."

    try:
        from graph import llm_fast
        from langchain_core.messages import HumanMessage
        if llm_fast:
            prompt = f"""You are Jarvis, the user's dry-witted chief of staff. Write the morning briefing
Telegram message from these computed facts (JSON). Rules: 4-7 short lines, plain text,
no headers, no markdown bullets with asterisks (use simple dashes), at most 2 emojis.
Lead with the readiness verdict (green/yellow/red) and why. Include the training pick
and yesterday's nutrition close-out when present. If illness_flag is true, be firm:
no training today. Never invent numbers.

Facts: {json.dumps(facts)}"""
            return llm_fast.invoke([HumanMessage(content=prompt)]).content.strip(), action_item
    except Exception as e:
        logger.warning(f"LLM compose failed, using template: {e}")

    lines = [f"Readiness: {facts.get('readiness', '?').upper()}" + (f" ({'; '.join(facts['readiness_reasons'])})" if facts.get("readiness_reasons") else "")]
    if facts.get("last_sleep_h"):
        lines.append(f"Sleep: {facts['last_sleep_h']}h last night, {facts.get('sleep_debt_h', 0)}h debt this week")
    if action_item:
        lines.append(f"→ {action_item}")
    if facts.get("y_kcal") is not None:
        lines.append(f"Yesterday: {facts['y_kcal']} kcal, {facts['y_protein']}g protein")
    return "\n".join(lines), action_item


def main():
    if not sb:
        logger.error("Supabase client not initialized")
        return
    facts = gather_facts()
    if not facts:
        logger.warning("No facts gathered — skipping briefing")
        return
    logger.info(f"Facts: {json.dumps(facts)}")
    text, action_item = compose(facts)
    send_telegram(f"☀️ Morning briefing\n\n{text}")
    try:
        insight = text if len(text) < 500 else text[:497] + "..."
        sb.table("ai_insights").insert({
            "user_id": _user_id(),
            "domain": "readiness",
            "insight_text": insight,
            "action_item": action_item,
        }).execute()
        logger.info("Readiness insight stored")
    except Exception as e:
        logger.error(f"Failed to store readiness insight: {e}")


if __name__ == "__main__":
    main()
