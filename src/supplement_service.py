"""
Supplement lookup and management service.

- Uses the LLM to look up a supplement by brand + name and return structured
  nutrition info (calories, macros, micronutrients) for user confirmation.
- Manages the user's supplement list stored in user_profiles.supplements.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"

# Micronutrient keys the rest of the system understands. The LLM is asked to
# fill as many as apply, using % DV (daily value) where known, else 0.
MICRO_KEYS = [
    "vitamin_a_dv_pct", "vitamin_c_dv_pct", "vitamin_d_dv_pct",
    "vitamin_e_dv_pct", "vitamin_k_dv_pct", "vitamin_b1_dv_pct",
    "vitamin_b2_dv_pct", "vitamin_b3_dv_pct", "vitamin_b6_dv_pct",
    "vitamin_b12_dv_pct", "biotin_dv_pct", "folate_dv_pct",
    "pantothenic_acid_dv_pct", "calcium_dv_pct", "iron_dv_pct",
    "magnesium_dv_pct", "zinc_dv_pct", "selenium_dv_pct",
    "iodine_dv_pct", "copper_dv_pct", "manganese_dv_pct",
    "phosphorus_dv_pct", "potassium_dv_pct", "omega_3_dv_pct",
    "choline_dv_pct",
]


LOOKUP_PROMPT = """You are a supplement nutrition database. The user will give you a supplement brand and name. Return ONLY a JSON object (no markdown, no prose) with the following fields:

{
  "brand": "<brand name>",
  "product_name": "<full product name>",
  "description": "<short human-readable description, e.g. 'Supradyn Men Multivitamin'>",
  "serving_size": "<e.g. '1 tablet', '2 softgels'>",
  "calories": <number>,
  "protein": <number, grams>,
  "carbs": <number, grams>,
  "fat": <number, grams>,
  "micronutrients": {
    "<key>_dv_pct": <number 0-100>,
    ...
  },
  "notes": "<optional short note about timing/absorption, e.g. 'take with fat for absorption'>"
}

Rules:
- Use these micronutrient keys (suffix _dv_pct, value is % daily value 0-100, use 0 if unknown):
  {micro_keys}
- If the product is a multivitamin, fill each vitamin/mineral it contains.
- If it's a single nutrient (e.g. magnesium), fill that one and leave others at 0.
- Calories/macros are per serving. Most supplements have 0-20 calories.
- Be accurate. If you don't know the brand, say so in 'notes' and provide best-guess nutrition for the named supplement type.
- Return ONLY the JSON object, nothing else."""


def _normalize_user_id(supabase) -> str:
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def lookup_supplement(brand: str, name: str) -> dict[str, Any]:
    """Use the LLM to look up a supplement's nutrition info.

    Returns a dict with brand, product_name, description, serving_size,
    calories, protein, carbs, fat, micronutrients, notes.
    Raises RuntimeError if the LLM is unavailable or returns invalid JSON.
    """
    from nodes.shared import llm_cloud, llm_fast

    llm = llm_cloud or llm_fast
    if not llm:
        raise RuntimeError("LLM not configured (OPENROUTER_API_KEY missing)")

    prompt = LOOKUP_PROMPT.replace(
        "{micro_keys}",
        ", ".join(MICRO_KEYS),
    )
    user_msg = f"Brand: {brand}\nSupplement: {name}"

    try:
        resp = llm.invoke([
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_msg},
        ])
        raw = resp.content if hasattr(resp, "content") else str(resp)
        # Strip any markdown fences
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Supplement lookup returned invalid JSON: {e}\nRaw: {raw}")
        raise RuntimeError(f"LLM returned invalid JSON: {e}")
    except Exception as e:
        logger.error(f"Supplement lookup failed: {e}")
        raise RuntimeError(f"LLM lookup failed: {e}")

    # Normalize micronutrients: only keep known keys, clamp 0-100
    micros = data.get("micronutrients") or {}
    clean_micros: dict[str, float] = {}
    for k in MICRO_KEYS:
        v = micros.get(k)
        if v is None:
            continue
        try:
            f = float(v)
            clean_micros[k] = max(0.0, min(100.0, f))
        except (TypeError, ValueError):
            continue

    return {
        "brand": str(data.get("brand", brand)).strip(),
        "product_name": str(data.get("product_name", name)).strip(),
        "description": str(data.get("description", f"{brand} {name}")).strip(),
        "serving_size": str(data.get("serving_size", "1 serving")).strip(),
        "calories": int(float(data.get("calories", 0) or 0)),
        "protein": int(float(data.get("protein", 0) or 0)),
        "carbs": int(float(data.get("carbs", 0) or 0)),
        "fat": int(float(data.get("fat", 0) or 0)),
        "micronutrients": clean_micros,
        "notes": str(data.get("notes", "")).strip(),
    }


def _load_policy(supabase, user_id: str) -> dict[str, Any]:
    """Load the user's supplement policy from user_profiles.supplements."""
    try:
        res = (
            supabase.table("user_profiles")
            .select("supplements")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("supplements"):
            return res.data[0]["supplements"]
    except Exception as e:
        logger.warning(f"Failed to load supplement policy: {e}")
    return {"enabled": True, "items": []}


def _save_policy(supabase, user_id: str, policy: dict[str, Any]) -> bool:
    """Save the user's supplement policy to user_profiles.supplements."""
    try:
        supabase.table("user_profiles").update({"supplements": policy}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to save supplement policy: {e}")
        return False


def list_supplements(supabase) -> dict[str, Any]:
    """Return the user's current supplement policy."""
    user_id = _normalize_user_id(supabase)
    return _load_policy(supabase, user_id)


def add_supplement(supabase, item: dict[str, Any], time_of_day: str, hour: int) -> dict[str, Any]:
    """Add a supplement to the user's policy.

    item: the looked-up supplement dict (from lookup_supplement).
    time_of_day: 'morning' or 'evening'.
    hour: 0-23, the hour to log it at.
    """
    user_id = _normalize_user_id(supabase)
    policy = _load_policy(supabase, user_id)

    # Migrate old format (morning/evening arrays) to new items list if needed
    if "items" not in policy:
        policy = {"enabled": True, "items": []}
    if "morning" in policy and isinstance(policy["morning"], list):
        # One-time migration: convert old morning/evening arrays to items
        for s in policy.get("morning", []):
            policy["items"].append({
                "description": s.get("description", ""),
                "calories": s.get("calories", 0),
                "protein": s.get("protein", 0),
                "carbs": s.get("carbs", 0),
                "fat": s.get("fat", 0),
                "micronutrients": s.get("micronutrients", {}),
                "time_of_day": "morning",
                "hour": policy.get("morning_hour", 8),
                "brand": "",
                "serving_size": "",
                "notes": "",
            })
        for s in policy.get("evening", []):
            policy["items"].append({
                "description": s.get("description", ""),
                "calories": s.get("calories", 0),
                "protein": s.get("protein", 0),
                "carbs": s.get("carbs", 0),
                "fat": s.get("fat", 0),
                "micronutrients": s.get("micronutrients", {}),
                "time_of_day": "evening",
                "hour": policy.get("evening_hour", 21),
                "brand": "",
                "serving_size": "",
                "notes": "",
            })
        policy.pop("morning", None)
        policy.pop("evening", None)
        policy.pop("morning_hour", None)
        policy.pop("evening_hour", None)
        policy.pop("breakfast_trigger", None)
        policy.pop("dinner_trigger", None)

    entry = {
        "id": f"{item['brand']}_{item['description']}_{time_of_day}_{hour}".replace(" ", "_").lower(),
        "brand": item.get("brand", ""),
        "product_name": item.get("product_name", ""),
        "description": item.get("description", ""),
        "serving_size": item.get("serving_size", ""),
        "calories": item.get("calories", 0),
        "protein": item.get("protein", 0),
        "carbs": item.get("carbs", 0),
        "fat": item.get("fat", 0),
        "micronutrients": item.get("micronutrients", {}),
        "notes": item.get("notes", ""),
        "time_of_day": time_of_day,
        "hour": hour,
    }
    policy["items"].append(entry)
    policy["enabled"] = True

    if _save_policy(supabase, user_id, policy):
        return entry
    raise RuntimeError("Failed to save supplement")


def remove_supplement(supabase, item_id: str) -> bool:
    """Remove a supplement from the user's policy by id."""
    user_id = _normalize_user_id(supabase)
    policy = _load_policy(supabase, user_id)
    if "items" not in policy:
        return False
    before = len(policy["items"])
    policy["items"] = [i for i in policy["items"] if i.get("id") != item_id]
    if len(policy["items"]) == before:
        return False
    return _save_policy(supabase, user_id, policy)
