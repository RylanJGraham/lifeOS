"""
Sync workouts from Mi Fitness (Xiaomi watch) via the unofficial
mi_fitness_sync library (lib/Mi-Fitness-Sync). This replaces Strava as the
source of heart-rate / duration stats after Strava made its API
subscriber-only.

Auth: XIAOMI_EMAIL / XIAOMI_PASSWORD from .env. The session state is cached
in .mi_fitness_auth.json at the repo root (no refresh token flow exists in
the library; on 401 we re-login with the password).
"""
import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Add parent directory to path so we can import utils
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.logger import SupabaseLogger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_mifitness")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
AUTH_STATE_PATH = os.path.join(REPO_ROOT, ".mi_fitness_auth.json")
DEVICE_ID_PATH = os.path.join(REPO_ROOT, ".mi_fitness_device_id")

MF_ID_PREFIX = "mf:"

# Mi Fitness sport_type int -> human-readable workout name
# (mirrors the mapping in mi_fitness_sync/strava/sport_mapping.py comments)
SPORT_TYPE_NAMES = {
    1: "Outdoor Running", 2: "Outdoor Walking", 3: "Indoor Running",
    4: "Mountaineering", 5: "Trail Running", 6: "Outdoor Cycling",
    7: "Indoor Cycling", 8: "Free Training", 9: "Pool Swimming",
    10: "Open Water Swimming", 11: "Elliptical", 12: "Yoga",
    13: "Rowing Machine", 14: "Jump Rope", 15: "Hiking", 16: "HIIT",
    17: "Triathlon", 19: "Basketball", 20: "Golf", 21: "Skiing",
    100: "Sailing", 101: "Paddle Board", 105: "Kayaking", 106: "Kayak Rafting",
    113: "Kite Surfing", 114: "Indoor Surfing", 200: "Rock Climbing",
    202: "Roller Skating", 207: "Nordic Walking", 301: "Stair Climbing",
    302: "Stepper", 305: "Pilates", 308: "Strength Training",
    313: "Dumbbell Training", 314: "Barbell Training", 315: "Weight Lifting",
    316: "Deadlift", 320: "Upper Limb Training", 321: "Lower Limb Training",
    322: "Waist & Abdomen", 323: "Back Training", 324: "Spinning",
    333: "Indoor Walking", 600: "Football", 609: "Tennis",
    700: "Outdoor Skating", 707: "Indoor Skating", 708: "Snowboarding",
    709: "Skiing", 710: "Cross-Country Skiing",
    1000: "Indoor Rock Climbing", 1001: "Outdoor Rock Climbing",
}


def sport_type_name(sport_type) -> str:
    try:
        st = int(sport_type)
    except (ValueError, TypeError):
        return "Workout"
    return SPORT_TYPE_NAMES.get(st, f"Workout (type {st})")


def _get_device_id() -> str:
    """Stable device id: Xiaomi trusts a device after one verification, but
    only if subsequent logins reuse the SAME device id."""
    from mi_fitness_sync.auth.client import MiFitnessAuthClient
    if os.path.exists(DEVICE_ID_PATH):
        with open(DEVICE_ID_PATH) as f:
            device_id = f.read().strip()
            if device_id:
                return device_id
    device_id = MiFitnessAuthClient.generate_device_id()
    with open(DEVICE_ID_PATH, "w") as f:
        f.write(device_id)
    return device_id


def _login():
    """Password login against the Xiaomi account; returns a fresh AuthState."""
    from mi_fitness_sync.auth.client import MiFitnessAuthClient

    email = os.getenv("XIAOMI_EMAIL")
    password = os.getenv("XIAOMI_PASSWORD")
    if not email or not password:
        raise RuntimeError("Missing XIAOMI_EMAIL or XIAOMI_PASSWORD in .env")
    auth = MiFitnessAuthClient()
    session = auth.login_with_password(
        email=email,
        password=password,
        device_id=_get_device_id(),
    )
    return session.to_auth_state()


def get_client():
    """Build an activities client, logging in (or re-logging in) as needed."""
    from mi_fitness_sync.auth.store import load_state, save_state
    from mi_fitness_sync.activity.client import MiFitnessActivitiesClient

    state = load_state(AUTH_STATE_PATH)
    if state is None:
        logger.info("No cached Mi Fitness auth state; logging in with password...")
        state = _login()
        save_state(state, AUTH_STATE_PATH)
        logger.info("Mi Fitness login OK, state cached.")
    return MiFitnessActivitiesClient(state)


def _reset_and_relogin():
    from mi_fitness_sync.auth.store import save_state
    if os.path.exists(AUTH_STATE_PATH):
        os.remove(AUTH_STATE_PATH)
    state = _login()
    save_state(state, AUTH_STATE_PATH)
    from mi_fitness_sync.activity.client import MiFitnessActivitiesClient
    return MiFitnessActivitiesClient(state)


def _list_activities(days: int):
    """List activities for the last N days, re-logging in once on 401."""
    from mi_fitness_sync.exceptions import XiaomiApiError

    since = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    client = get_client()
    try:
        return client.list_activities(start_time=since, end_time=None, limit=100)
    except XiaomiApiError as e:
        if "401" in str(e):
            logger.warning("Mi Fitness session expired (401); re-logging in...")
            client = _reset_and_relogin()
            return client.list_activities(start_time=since, end_time=None, limit=100)
        raise


def _local_date_str(activity) -> str:
    """Local calendar date (YYYY-MM-DD) of an activity, using the record's
    zone offset. Falls back to UTC if no offset is present."""
    offset = 0
    try:
        offset = int((activity.raw_record or {}).get("zone_offset") or 0)
    except (ValueError, TypeError):
        offset = 0
    return datetime.fromtimestamp(activity.start_time + offset, tz=timezone.utc).strftime("%Y-%m-%d")


def _normalize(activity) -> dict:
    """Normalize an Activity into the plain dict shape the rest of LifeOS
    uses (same keys as the Strava API response where possible)."""
    report = activity.raw_report or {}
    return {
        "id": f"{MF_ID_PREFIX}{activity.activity_id}",
        "type": sport_type_name(activity.sport_type),
        "start_date_local": _local_date_str(activity),
        "moving_time": activity.duration_seconds,
        "distance": activity.distance_meters,
        "calories": activity.calories,
        "average_heartrate": report.get("avg_hrm"),
        "max_heartrate": report.get("max_hrm"),
        "suffer_score": None,
    }


def get_activity_for_date(target_date: str):
    """Return the normalized Mi Fitness activity whose LOCAL date matches
    target_date (YYYY-MM-DD), or None. Used to enrich template-logged gym
    sessions. Multiple activities same day: the longest one wins."""
    day = datetime.fromisoformat(target_date[:10]).replace(tzinfo=timezone.utc)
    since = int((day - timedelta(days=2)).timestamp())
    client = get_client()
    activities = client.list_activities(start_time=since, end_time=None, limit=50)
    matches = [a for a in activities if _local_date_str(a) == target_date[:10]]
    if not matches:
        return None
    best = max(matches, key=lambda a: a.duration_seconds or 0)
    return _normalize(best)


def sync_mifitness_activities(days: int = 30):
    """Pull recent Mi Fitness workouts into the workouts table."""
    load_dotenv()

    from utils.logger import get_supabase_client
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase client not configured.")

    user_id = "00000000-0000-0000-0000-000000000000"
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            user_id = res.data[0]["user_id"]
    except Exception:
        pass

    activities = _list_activities(days)
    logger.info(f"Found {len(activities)} Mi Fitness activities in the last {days} days.")

    synced = 0
    for activity in activities:
        n = _normalize(activity)
        mf_id = n["id"]

        dup = supabase.table("workouts").select("id").eq("strava_id", mf_id).execute()
        if dup.data:
            continue

        workout_date = datetime.fromtimestamp(activity.start_time, tz=timezone.utc).isoformat()
        payload = {
            "user_id": user_id,
            "strava_id": mf_id,  # external-activity id column; prefixed 'mf:'
            "exercise_name": n["type"],
            "activity_type": n["type"],
            "workout_date": workout_date,
            "duration_minutes": round((activity.duration_seconds or 0) / 60.0, 1),
            "distance_km": round((activity.distance_meters or 0) / 1000.0, 2),
            "calories": activity.calories,
            "average_heartrate": n["average_heartrate"],
            "max_heartrate": n["max_heartrate"],
        }
        supabase.table("workouts").insert(payload).execute()
        synced += 1
        logger.info(f"Synced: {n['type']} on {n['start_date_local']} (avg HR {n['average_heartrate']})")

    if synced:
        SupabaseLogger.info("sync_mifitness", f"Synced {synced} workouts from Mi Fitness.")
    else:
        logger.info("No new Mi Fitness activities to sync.")
    return synced


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Sync workouts from Mi Fitness.")
    parser.add_argument("--days", type=int, default=30, help="Days of history to sync")
    args = parser.parse_args()
    sync_mifitness_activities(days=args.days)
