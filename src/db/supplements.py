"""
Auto-supplement logging.

Supplements are configured interactively in the mobile app under Bio → Supplements.
Each item has a description, time_of_day (morning/evening/anytime), hour,
and macros/micronutrients. When a meal is logged we add the matching
supplements for that day, idempotently (skip if already logged).
"""
from datetime import datetime, time
from typing import Optional
import logging

logger = logging.getLogger(__name__)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _normalize_user_id(supabase) -> str:
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _iso_day(meal_time: datetime) -> str:
    return meal_time.strftime("%Y-%m-%d")


def _meal_type_from_time(meal_time: datetime) -> Optional[str]:
    """Classify a meal by time of day if not explicitly tagged."""
    h = meal_time.hour
    if 4 <= h < 11:
        return "breakfast"
    if 11 <= h < 15:
        return "lunch"
    if 15 <= h < 23:
        return "dinner"
    return None


def _already_logged(supabase, user_id: str, day: str, description: str) -> bool:
    """Detect whether a supplement of this category is already logged for the day.

    We match by category keywords rather than exact name because the user may
    log the same supplement under different descriptions.
    """
    category_keywords = {
        "Supradyn Men Multivitamin": ["multivitamin", "supradyn", "vitan", "vitans"],
        "Omega-3 D3 K2 Supplement": ["omega", "fish oil"],
        "Magnesium Bisglycinate": ["magnesium"],
    }
    keywords = category_keywords.get(description, [description.lower()])

    try:
        res = (
            supabase.table("meals")
            .select("description")
            .eq("user_id", user_id)
            .gte("meal_time", f"{day}T00:00:00")
            .lt("meal_time", f"{day}T23:59:59.999")
            .execute()
        )
        for row in (res.data or []):
            desc = (row.get("description") or "").lower()
            for kw in keywords:
                if kw in desc:
                    return True
        return False
    except Exception as e:
        logger.warning(f"Failed to check existing supplement {description} for {day}: {e}")
        return False


def _insert_supplement(supabase, user_id: str, day: str, supp: dict, hour: int):
    try:
        meal_time = datetime.combine(datetime.strptime(day, "%Y-%m-%d").date(), time(hour, 0))
        supabase.table("meals").insert({
            "user_id": user_id,
            "meal_time": meal_time.isoformat(),
            "description": supp["description"],
            "calories": supp.get("calories", 0),
            "protein": supp.get("protein", 0),
            "carbs": supp.get("carbs", 0),
            "fat": supp.get("fat", 0),
            "micronutrients": supp.get("micronutrients", {}),
            "caffeine_mg": 0,
        }).execute()
        logger.info(f"Auto-logged supplement {supp['description']} for {day}")
        return True
    except Exception as e:
        logger.error(f"Failed to auto-log supplement {supp['description']} for {day}: {e}")
        return False


def _load_supplement_policy(supabase, user_id: str) -> dict:
    """Load the user's supplement policy from user_profiles.supplements.

    Expected format: { enabled: bool, items: [{ description, time_of_day, hour, ... }] }
    """
    try:
        res = supabase.table("user_profiles").select("supplements").eq("user_id", user_id).limit(1).execute()
        if res.data and res.data[0].get("supplements"):
            policy = res.data[0]["supplements"]
            if isinstance(policy, dict) and "items" in policy and isinstance(policy["items"], list):
                return {
                    "enabled": bool(policy.get("enabled", True)),
                    "items": [it for it in policy["items"] if it.get("description")],
                }
    except Exception as e:
        logger.warning(f"Failed to load supplement policy: {e}")
    return {"enabled": True, "items": []}


def _item_triggers_at(supp: dict, meal_type: str) -> bool:
    """Whether a supplement should be logged when a meal of this type is logged."""
    tod = supp.get("time_of_day", "")
    if tod == "anytime":
        return True
    if tod == "morning":
        return meal_type == "breakfast"
    if tod == "evening":
        return meal_type == "dinner"
    return False


def ensure_supplements_for_meal(
    supabase,
    user_id: str,
    meal_time: datetime,
    meal_type: Optional[str] = None,
) -> list[str]:
    """
    After a meal is logged, ensure the day's matching supplements are present.
    Returns a list of descriptions that were added.
    """
    if not supabase:
        return []

    policy = _load_supplement_policy(supabase, user_id)
    if not policy.get("enabled", True):
        return []

    day = _iso_day(meal_time)
    effective_type = meal_type or _meal_type_from_time(meal_time)
    if not effective_type:
        return []
    added = []

    for item in policy.get("items", []):
        if not _item_triggers_at(item, effective_type):
            continue
        if not _already_logged(supabase, user_id, day, item["description"]):
            hour = int(item.get("hour", 8))
            if _insert_supplement(supabase, user_id, day, item, hour):
                added.append(item["description"])

    return added


def backfill_supplements(supabase, start_date: str, end_date: str) -> dict:
    """
    Backfill matching supplements for all days in [start_date, end_date]
    that already have meals logged. Returns a summary of added rows.
    """
    if not supabase:
        return {"added": 0, "errors": ["Supabase not available"]}

    user_id = _normalize_user_id(supabase)
    added_total = 0
    errors = []

    try:
        meals = (
            supabase.table("meals")
            .select("meal_time, meal_type")
            .eq("user_id", user_id)
            .gte("meal_time", f"{start_date}T00:00:00")
            .lt("meal_time", f"{end_date}T23:59:59.999")
            .execute()
        ).data or []
    except Exception as e:
        logger.error(f"Failed to fetch meals for backfill: {e}")
        return {"added": 0, "errors": [str(e)]}

    policy = _load_supplement_policy(supabase, user_id)
    if not policy.get("enabled", True):
        return {"added": 0, "errors": ["Supplement auto-logging is disabled"]}

    # Map day -> set of meal types logged that day
    days_with_meals: dict[str, set[str]] = {}
    for m in meals:
        ts = m.get("meal_time")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        day = _iso_day(dt)
        mt = m.get("meal_type") or _meal_type_from_time(dt)
        if mt:
            days_with_meals.setdefault(day, set()).add(mt)

    for item in policy.get("items", []):
        hour = int(item.get("hour", 8))
        for day, meal_types in days_with_meals.items():
            if not any(_item_triggers_at(item, mt) for mt in meal_types):
                continue
            if not _already_logged(supabase, user_id, day, item["description"]):
                if _insert_supplement(supabase, user_id, day, item, hour):
                    added_total += 1

    return {"added": added_total, "errors": errors}
