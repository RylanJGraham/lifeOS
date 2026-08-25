"""
Deduplication helpers for cross-source data ingestion.
"""
import hashlib
from datetime import datetime


def workout_external_id(user_id: str, workout_date: str, exercise_name: str, duration_minutes=None, calories=None) -> str:
    """
    Deterministic external ID for a workout row. Used to prevent the same
    session from being inserted by multiple sources (manual log, Mi Fitness,
    Strava) or from re-running sync workers.
    """
    if not workout_date or not exercise_name or not user_id:
        return None
    name = str(exercise_name).strip().lower()
    date = str(workout_date)[:10]
    duration = round(float(duration_minutes or 0) / 10) * 10 if duration_minutes is not None else 0
    cals = round(float(calories or 0) / 50) * 50 if calories is not None else 0
    raw = f"{user_id}|{date}|{name}|{duration}|{cals}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def upsert_workout(supabase_client, payload: dict) -> dict:
    """
    Insert a workout or update the existing row if the external_id matches.
    Adds external_id to the payload automatically.
    """
    user_id = payload.get("user_id")
    workout_date = payload.get("workout_date")
    exercise_name = payload.get("exercise_name")
    duration = payload.get("duration_minutes")
    calories = payload.get("calories")
    payload["external_id"] = workout_external_id(user_id, workout_date, exercise_name, duration, calories)

    if payload.get("external_id"):
        try:
            existing = (
                supabase_client.table("workouts")
                .select("id")
                .eq("user_id", user_id)
                .eq("external_id", payload["external_id"])
                .limit(1)
                .execute()
            )
            if existing.data:
                row_id = existing.data[0]["id"]
                return supabase_client.table("workouts").update(payload).eq("id", row_id).execute()
        except Exception:
            pass

    return supabase_client.table("workouts").insert(payload).execute()
