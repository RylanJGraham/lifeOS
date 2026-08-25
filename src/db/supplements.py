"""
Auto-supplement logging.

The user takes the same supplements every day:
  - Morning (with breakfast): Supradyn Men multivitamin + Omega-3 D3 K2
  - Evening (after dinner): Magnesium Bisglycinate

When a meal is logged we use the meal_type / meal_time to decide which
supplements to add for that day, idempotently (skip if already logged).
"""
from datetime import datetime, time
from typing import Optional
import logging

logger = logging.getLogger(__name__)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"

MORNING_SUPPS = [
    {
        "description": "Supradyn Men Multivitamin",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "micronutrients": {
            "vitamin_a_dv_pct": 100,
            "vitamin_c_dv_pct": 100,
            "vitamin_d_dv_pct": 100,
            "vitamin_e_dv_pct": 100,
            "vitamin_k_dv_pct": 100,
            "vitamin_b6_dv_pct": 100,
            "vitamin_b12_dv_pct": 100,
            "biotin_dv_pct": 100,
            "folate_dv_pct": 100,
            "calcium_dv_pct": 15,
            "iron_dv_pct": 100,
            "magnesium_dv_pct": 25,
            "zinc_dv_pct": 100,
            "selenium_dv_pct": 100,
            "iodine_dv_pct": 100,
            "copper_dv_pct": 100,
            "manganese_dv_pct": 100,
        },
    },
    {
        "description": "Omega-3 D3 K2 Supplement",
        "calories": 20,
        "protein": 0,
        "carbs": 0,
        "fat": 2,
        "micronutrients": {
            "omega_3_dv_pct": 100,
            "vitamin_d_dv_pct": 100,
            "vitamin_k_dv_pct": 100,
        },
    },
]

EVENING_SUPPS = [
    {
        "description": "Magnesium Bisglycinate",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "micronutrients": {
            "magnesium_dv_pct": 50,
        },
    },
]


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
    if 17 <= h < 23:
        return "dinner"
    return None


def _already_logged(supabase, user_id: str, day: str, description: str) -> bool:
    """Detect whether a supplement of this category is already logged for the day.

    We match by category keywords rather than exact name because the user may
    log the same supplement under different descriptions (e.g. "Vitamin D3 K2",
    "Fish Oil", or "Omega-3 D3 K2 Supplement").
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
            "calories": supp["calories"],
            "protein": supp["protein"],
            "carbs": supp["carbs"],
            "fat": supp["fat"],
            "micronutrients": supp["micronutrients"],
            "caffeine_mg": 0,
        }).execute()
        logger.info(f"Auto-logged supplement {supp['description']} for {day}")
        return True
    except Exception as e:
        logger.error(f"Failed to auto-log supplement {supp['description']} for {day}: {e}")
        return False


def _normalize_item(item: dict) -> dict:
    """Ensure every supplement item carries the expected macro fields."""
    if not item or not isinstance(item, dict):
        return None
    return {
        "description": str(item.get("description") or "").strip(),
        "calories": int(item.get("calories", 0) or 0),
        "protein": int(item.get("protein", 0) or 0),
        "carbs": int(item.get("carbs", 0) or 0),
        "fat": int(item.get("fat", 0) or 0),
        "micronutrients": item.get("micronutrients") if isinstance(item.get("micronutrients"), dict) else {},
    }


def _normalize_supplement_policy(policy: dict) -> dict:
    """Return a fully populated policy dict, filling missing fields from defaults."""
    if not policy or not isinstance(policy, dict):
        policy = {}
    defaults = {
        "enabled": True,
        "morning": MORNING_SUPPS,
        "evening": EVENING_SUPPS,
        "morning_hour": 8,
        "evening_hour": 21,
        "breakfast_trigger": True,
        "dinner_trigger": True,
    }
    merged = {**defaults, **policy}

    def norm_list(key: str):
        arr = merged.get(key)
        if not isinstance(arr, list):
            arr = defaults[key]
        return [it for it in (_normalize_item(it) for it in arr) if it and it["description"]]

    return {
        "enabled": bool(merged.get("enabled", True)),
        "morning": norm_list("morning"),
        "evening": norm_list("evening"),
        "morning_hour": int(merged.get("morning_hour", defaults["morning_hour"]) or defaults["morning_hour"]),
        "evening_hour": int(merged.get("evening_hour", defaults["evening_hour"]) or defaults["evening_hour"]),
        "breakfast_trigger": bool(merged.get("breakfast_trigger", defaults["breakfast_trigger"])),
        "dinner_trigger": bool(merged.get("dinner_trigger", defaults["dinner_trigger"])),
    }


def _load_supplement_policy(supabase, user_id: str) -> dict:
    """Load the user's supplement policy from user_profiles.supplements.
    Falls back to hardcoded defaults if missing."""
    try:
        res = supabase.table("user_profiles").select("supplements").eq("user_id", user_id).limit(1).execute()
        if res.data and res.data[0].get("supplements"):
            policy = res.data[0]["supplements"]
            normalized = _normalize_supplement_policy(policy)
            if normalized["enabled"] and (normalized["morning"] or normalized["evening"]):
                return normalized
    except Exception as e:
        logger.warning(f"Failed to load supplement policy: {e}")
    return _normalize_supplement_policy({})


def ensure_supplements_for_meal(
    supabase,
    user_id: str,
    meal_time: datetime,
    meal_type: Optional[str] = None,
) -> list[str]:
    """
    After a meal is logged, ensure the day's mandatory supplements are present.
    Returns a list of descriptions that were added.
    """
    if not supabase:
        return []

    policy = _load_supplement_policy(supabase, user_id)
    if not policy.get("enabled", True):
        return []

    day = _iso_day(meal_time)
    effective_type = meal_type or _meal_type_from_time(meal_time)
    added = []

    morning = policy.get("morning", MORNING_SUPPS)
    evening = policy.get("evening", EVENING_SUPPS)
    morning_hour = policy.get("morning_hour", 8)
    evening_hour = policy.get("evening_hour", 21)

    if effective_type == "breakfast" and policy.get("breakfast_trigger", True):
        for supp in morning:
            if not _already_logged(supabase, user_id, day, supp["description"]):
                if _insert_supplement(supabase, user_id, day, supp, morning_hour):
                    added.append(supp["description"])

    if effective_type == "dinner" and policy.get("dinner_trigger", True):
        for supp in evening:
            if not _already_logged(supabase, user_id, day, supp["description"]):
                if _insert_supplement(supabase, user_id, day, supp, evening_hour):
                    added.append(supp["description"])

    return added


def backfill_supplements(supabase, start_date: str, end_date: str) -> dict:
    """
    Backfill mandatory supplements for all days in [start_date, end_date]
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

    days_with_breakfast = set()
    days_with_dinner = set()

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
        if mt == "breakfast":
            days_with_breakfast.add(day)
        if mt == "dinner":
            days_with_dinner.add(day)

    morning = policy.get("morning", MORNING_SUPPS)
    evening = policy.get("evening", EVENING_SUPPS)
    morning_hour = policy.get("morning_hour", 8)
    evening_hour = policy.get("evening_hour", 21)

    for day in sorted(days_with_breakfast):
        if policy.get("breakfast_trigger", True):
            for supp in morning:
                if not _already_logged(supabase, user_id, day, supp["description"]):
                    if _insert_supplement(supabase, user_id, day, supp, morning_hour):
                        added_total += 1

    for day in sorted(days_with_dinner):
        if policy.get("dinner_trigger", True):
            for supp in evening:
                if not _already_logged(supabase, user_id, day, supp["description"]):
                    if _insert_supplement(supabase, user_id, day, supp, evening_hour):
                        added_total += 1

    return {"added": added_total, "errors": errors}
