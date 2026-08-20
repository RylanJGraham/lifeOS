"""
Midday fuel pacing — fires at 15:00, only when the day is actually off-pace.

The evening nutritionist review is an autopsy; this is the steering wheel:
if protein or calories are materially behind by mid-afternoon, the user still
has time to fix dinner. When the day is on pace, it stays silent (and writes
no insight) — silence means on track.

    python src/workers/fuel_pacing.py
"""
import os
import sys
import logging
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fuel_pacing")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

from goal_checkin import send_telegram  # noqa: E402  (same workers dir)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"

# By 15:00 a reasonably paced day should have cleared these fractions of target.
PROTEIN_FRACTION = 0.45
CALORIE_FRACTION = 0.50


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def main():
    if not sb:
        logger.error("Supabase client not initialized")
        return

    prof = (
        sb.table("user_profiles")
        .select("daily_caloric_target, protein_target_g").limit(1).execute()
    ).data
    if not prof or not prof[0].get("protein_target_g"):
        logger.info("No protein target set — pacing check skipped")
        return
    p_target = float(prof[0]["protein_target_g"])
    cal_target = float(prof[0].get("daily_caloric_target") or 0)

    today = datetime.now().date().isoformat()
    meals = (
        sb.table("meals").select("description, calories, protein")
        .gte("meal_time", f"{today}T00:00:00").lt("meal_time", f"{today}T23:59:59.999").execute()
    ).data or []
    kcal = sum(float(m.get("calories") or 0) for m in meals)
    protein = sum(float(m.get("protein") or 0) for m in meals)
    logger.info(f"Today so far: {kcal:.0f} kcal, {protein:.0f}g protein ({len(meals)} meals)")

    if not meals:
        logger.info("Nothing logged yet today — not pacing's job to nag about logging")
        return

    protein_behind = protein < p_target * PROTEIN_FRACTION
    calories_behind = bool(cal_target) and kcal < cal_target * CALORIE_FRACTION
    if not (protein_behind or calories_behind):
        logger.info("On pace — staying silent")
        return

    # Suggestions from the user's own saved items, highest protein first
    suggestions = []
    try:
        items = (
            sb.table("known_items").select("name, calories, protein")
            .order("protein", desc=True).limit(4).execute()
        ).data or []
        suggestions = [f"{i['name']} ({i.get('protein') or 0}g P)" for i in items if (i.get("protein") or 0) >= 15]
    except Exception as e:
        logger.warning(f"known_items fetch failed: {e}")

    p_gap = round(p_target - protein)
    lines = [f"🍽️ Fuel pacing check: at {datetime.now():%H:%M} you're at {protein:.0f}g of {p_target:.0f}g protein"]
    if cal_target:
        lines.append(f"and {kcal:.0f} of {cal_target:.0f} kcal")
    lines.append(f"— dinner needs to carry ~{p_gap}g protein.")
    if suggestions:
        lines.append("Easy closers from your saved items: " + "; ".join(suggestions[:3]))

    text = "\n".join(lines)
    send_telegram(text)
    try:
        sb.table("ai_insights").insert({
            "user_id": _user_id(),
            "domain": "pacing",
            "insight_text": text,
            "action_item": f"Plan a ~{p_gap}g-protein dinner tonight.",
        }).execute()
        logger.info("Pacing insight stored")
    except Exception as e:
        logger.error(f"Failed to store pacing insight: {e}")


if __name__ == "__main__":
    main()
