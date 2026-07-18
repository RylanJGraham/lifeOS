import os
import sys
import json
import logging
from datetime import datetime, timedelta
import httpx
from dotenv import load_dotenv

# Add parent directory to path so we can import utils
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.logger import SupabaseLogger

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_strava")

TOKEN_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".strava_tokens.json")

def load_tokens():
    if not os.path.exists(TOKEN_FILE):
        logger.error(f"Strava token file not found at {TOKEN_FILE}. Run setup_strava.py first.")
        return None
    with open(TOKEN_FILE, "r") as f:
        return json.load(f)

def save_tokens(tokens):
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f, indent=4)

def refresh_strava_tokens(tokens):
    """Refreshes the access token if it has expired."""
    expires_at = tokens.get("expires_at", 0)
    now_ts = int(datetime.utcnow().timestamp())
    
    # Refresh if within 5 minutes of expiration
    if expires_at - now_ts > 300:
        return tokens["access_token"]
        
    logger.info("Strava access token expired or close to expiring. Refreshing...")
    url = "https://www.strava.com/oauth/token"
    payload = {
        "client_id": tokens["client_id"],
        "client_secret": tokens["client_secret"],
        "refresh_token": tokens["refresh_token"],
        "grant_type": "refresh_token"
    }
    
    try:
        response = httpx.post(url, data=payload)
        response.raise_for_status()
        data = response.json()
        
        tokens["access_token"] = data["access_token"]
        tokens["refresh_token"] = data["refresh_token"]
        tokens["expires_at"] = data["expires_at"]
        save_tokens(tokens)
        logger.info("Strava tokens refreshed and saved successfully.")
        return tokens["access_token"]
    except Exception as e:
        logger.error(f"Failed to refresh Strava tokens: {e}")
        SupabaseLogger.error("sync_strava", f"Token refresh failed: {e}")
        return None

def get_supabase_client():
    from utils.logger import get_supabase_client as get_client
    return get_client()

def get_user_id(supabase):
    # Retrieve the default user_id or use the placeholder
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return "00000000-0000-0000-0000-000000000000"

def get_activity_for_date(target_date: str):
    """Return the Strava activity whose LOCAL start date matches target_date
    (YYYY-MM-DD), or None. Used to enrich template-logged gym sessions with
    heart-rate/duration stats recorded on the watch."""
    load_dotenv()
    tokens = load_tokens()
    if not tokens:
        return None
    access_token = refresh_strava_tokens(tokens)
    if not access_token:
        return None

    day = datetime.fromisoformat(target_date[:10])
    after = int((day - timedelta(days=2)).timestamp())
    before = int((day + timedelta(days=2)).timestamp())
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = httpx.get(
        f"https://www.strava.com/api/v3/athlete/activities?after={after}&before={before}&per_page=20",
        headers=headers, timeout=15.0)
    resp.raise_for_status()
    activities = resp.json()
    if not isinstance(activities, list):
        return None
    for a in activities:
        local = a.get("start_date_local") or a.get("start_date") or ""
        if local[:10] == target_date[:10]:
            return a
    return None


def sync_strava_activities():
    load_dotenv()
    
    tokens = load_tokens()
    if not tokens:
        raise RuntimeError(f"Strava token file not found at {TOKEN_FILE}. Run setup_strava.py first.")

    access_token = refresh_strava_tokens(tokens)
    if not access_token:
        raise RuntimeError("Strava token refresh failed.")

    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase client not configured.")
        
    user_id = get_user_id(supabase)
    logger.info(f"Using user_id: {user_id}")
    
    # Parse command line arguments for days to sync
    import argparse
    parser = argparse.ArgumentParser(description="Sync workouts from Strava.")
    parser.add_argument("--days", type=int, default=90, help="Number of days of history to sync")
    args = parser.parse_known_args()[0]
    days_to_sync = args.days
    
    # Get activities from the last N days
    after_timestamp = int((datetime.utcnow() - timedelta(days=days_to_sync)).timestamp())
    activities_url = f"https://www.strava.com/api/v3/athlete/activities?after={after_timestamp}"
    headers = {"Authorization": f"Bearer {access_token}"}
    
    logger.info(f"Fetching activities from Strava for the last {days_to_sync} days...")
    try:
        response = httpx.get(activities_url, headers=headers)
        response.raise_for_status()
        activities = response.json()
    except Exception as e:
        logger.error(f"Failed to fetch Strava activities: {e}")
        SupabaseLogger.error("sync_strava", f"Failed to fetch Strava activities: {e}")
        raise
        
    logger.info(f"Found {len(activities)} activities in the last {days_to_sync} days.")
    
    synced_count = 0
    for activity in activities:
        activity_id = str(activity["id"])
        start_date = activity["start_date"] # UTC format
        
        # Check if activity already exists in workouts table
        is_duplicate = False
        
        # 1. Check by unique Strava Activity ID
        try:
            dup_check = supabase.table("workouts").select("id").eq("strava_id", activity_id).execute()
            if dup_check.data and len(dup_check.data) > 0:
                is_duplicate = True
        except Exception as e:
            logger.warning(f"Could not query workouts by strava_id: {e}")

        # 2. Check by exact workout date/time (timestamp) for absolute safety
        if not is_duplicate:
            try:
                dup_check = supabase.table("workouts").select("id").eq("workout_date", start_date).execute()
                if dup_check.data and len(dup_check.data) > 0:
                    is_duplicate = True
            except Exception as e:
                logger.error(f"Error checking duplicate workout_date in workouts table: {e}")
                
        if is_duplicate:
            logger.info(f"Activity {activity_id} ({activity['name']}) starting on {start_date} is already synced. Skipping.")
            continue
            
        logger.info(f"Syncing activity: {activity['name']} ({activity['type']}) starting on {start_date}")
        
        # Optionally fetch streams (Heart rate, etc)
        streams_data = None
        try:
            streams_url = f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys=heartrate,time,watts,cadence&key_by_type=true"
            stream_res = httpx.get(streams_url, headers=headers)
            if stream_res.status_code == 200:
                streams_data = stream_res.json()
        except Exception as e:
            logger.warning(f"Failed to fetch streams for {activity_id}: {e}")

        # Parse fields
        duration_min = round(activity["moving_time"] / 60.0, 1) if "moving_time" in activity else None
        distance_km = round(activity["distance"] / 1000.0, 2) if "distance" in activity else None
        avg_hr = activity.get("average_heartrate")
        max_hr = activity.get("max_heartrate")
        suffer_score = activity.get("suffer_score")
        
        # New fields
        total_elevation_gain = activity.get("total_elevation_gain")
        calories = activity.get("kilojoules") or activity.get("calories") # Strava sometimes provides kilojoules instead of calories
        average_speed = activity.get("average_speed")
        max_speed = activity.get("max_speed")
        average_watts = activity.get("average_watts")
        max_watts = activity.get("max_watts")
        average_cadence = activity.get("average_cadence")
        pr_count = activity.get("pr_count")
        
        def to_int(val):
            if val is None:
                return None
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return None

        # Prepare workouts payload
        payload = {
            "user_id": user_id,
            "strava_id": activity_id,
            "exercise_name": activity["name"],
            "activity_type": activity["type"],
            "workout_date": start_date,
            "duration_minutes": duration_min,
            "distance_km": distance_km,
            "average_heartrate": to_int(avg_hr),
            "max_heartrate": to_int(max_hr),
            "suffer_score": to_int(suffer_score),
            "total_elevation_gain": total_elevation_gain,
            "calories": to_int(calories),
            "average_speed": average_speed,
            "max_speed": max_speed,
            "average_watts": average_watts,
            "max_watts": max_watts,
            "average_cadence": average_cadence,
            "pr_count": to_int(pr_count),
            "streams": streams_data
        }
        
        try:
            supabase.table("workouts").insert(payload).execute()
            logger.info(f"Successfully inserted activity {activity_id} into workouts table.")
            synced_count += 1
        except Exception as e:
            logger.error(f"Failed to insert activity {activity_id} into workouts table: {e}")
            SupabaseLogger.error("sync_strava", f"Failed to insert activity {activity_id}: {e}")
            continue
            
    if synced_count > 0:
        SupabaseLogger.info("sync_strava", f"Synced {synced_count} workouts from Strava into workouts table.")
    else:
        logger.info("No new activities to sync.")

if __name__ == "__main__":
    sync_strava_activities()
