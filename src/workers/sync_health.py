"""
Nightly health sync worker.

Joins health_metrics, meals, and workouts by date for the last 30/60 days,
runs the SymptomCorrelator to find statistically significant correlations,
and writes a daily health summary to ai_insights.

Schedule: LifeOS-HealthSync via pipeline_service.py run health-sync.
"""
import os
import sys
import logging
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client
from health.symptom_correlator import SymptomCorrelator
from utils.logger import SupabaseLogger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_health")


def _get_user_id(supabase):
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and res.data[0].get("user_id"):
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Could not fetch user_id: {e}")
    return "00000000-0000-0000-0000-000000000000"


def run_health_sync():
    load_dotenv()
    logger.info(f"[{datetime.now()}] Starting nightly health sync & analysis...")

    sb_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not sb_url or not sb_key:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_KEY not found. Skipping sync.")
        return

    try:
        supabase = create_client(sb_url, sb_key)
    except Exception as e:
        logger.error(f"Could not create Supabase client: {e}")
        return

    user_id = _get_user_id(supabase)
    today = datetime.now().date().isoformat()

    try:
        # Skip if already ran today
        existing = (
            supabase.table("ai_insights")
            .select("id")
            .eq("user_id", user_id)
            .eq("domain", "health_summary")
            .gte("generated_at", f"{today}T00:00:00")
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info("Health summary already generated today; skipping.")
            return

        # Aggregate recent data
        start = (datetime.now() - timedelta(days=30)).date().isoformat()
        end = (datetime.now() + timedelta(days=1)).date().isoformat()

        health_rows = (
            supabase.table("health_metrics")
            .select("recorded_at, hrv, sleep_duration_minutes, resting_heart_rate, sleeping_heart_rate, body_weight_kg, vo2_max, steps")
            .eq("user_id", user_id)
            .gte("recorded_at", f"{start}T00:00:00")
            .lte("recorded_at", f"{end}T23:59:59")
            .execute()
        ).data or []

        meal_rows = (
            supabase.table("meals")
            .select("meal_time, calories, protein, carbs, fat, micronutrients")
            .eq("user_id", user_id)
            .eq("planned", False)
            .gte("meal_time", f"{start}T00:00:00")
            .lte("meal_time", f"{end}T23:59:59")
            .execute()
        ).data or []

        workout_rows = (
            supabase.table("workouts")
            .select("workout_date, duration_minutes, calories")
            .eq("user_id", user_id)
            .gte("workout_date", f"{start}T00:00:00")
            .lte("workout_date", f"{end}T23:59:59")
            .execute()
        ).data or []

        # Daily aggregates
        days = {}
        for r in health_rows:
            d = r.get("recorded_at", "")[:10]
            if not d:
                continue
            if d not in days:
                days[d] = {"hrv": [], "sleep": [], "rhr": [], "steps": [], "workouts": 0, "workout_min": 0, "workout_cal": 0, "calories": 0, "protein": 0}
            for k, key in [("hrv", "hrv"), ("sleep_duration_minutes", "sleep"), ("resting_heart_rate", "rhr"), ("steps", "steps")]:
                v = r.get(k)
                if v is not None:
                    days[d][key].append(float(v))

        for r in meal_rows:
            d = r.get("meal_time", "")[:10]
            if not d:
                continue
            if d not in days:
                days[d] = {"hrv": [], "sleep": [], "rhr": [], "steps": [], "workouts": 0, "workout_min": 0, "workout_cal": 0, "calories": 0, "protein": 0}
            days[d]["calories"] += float(r.get("calories") or 0)
            days[d]["protein"] += float(r.get("protein") or 0)

        for r in workout_rows:
            d = r.get("workout_date", "")[:10]
            if not d:
                continue
            if d not in days:
                days[d] = {"hrv": [], "sleep": [], "rhr": [], "steps": [], "workouts": 0, "workout_min": 0, "workout_cal": 0, "calories": 0, "protein": 0}
            days[d]["workouts"] += 1
            days[d]["workout_min"] += float(r.get("duration_minutes") or 0)
            days[d]["workout_cal"] += float(r.get("calories") or 0)

        if not days:
            logger.info("No health/meal/workout data in the last 30 days; skipping summary.")
            return

        def avg(lst):
            return round(sum(lst) / len(lst), 1) if lst else None

        avg_hrv = avg([v for d in days.values() for v in d["hrv"]])
        avg_sleep = avg([v for d in days.values() for v in d["sleep"]])
        avg_rhr = avg([v for d in days.values() for v in d["rhr"]])
        avg_steps = avg([v for d in days.values() for v in d["steps"]])
        total_workouts = sum(d["workouts"] for d in days.values())
        avg_cal = avg([d["calories"] for d in days.values() if d["calories"] > 0])
        avg_protein = avg([d["protein"] for d in days.values() if d["protein"] > 0])

        summary = []
        summary.append(f"Health Summary ({start} → {today})")
        if avg_hrv is not None:
            summary.append(f"• Avg HRV: {avg_hrv} ms")
        if avg_rhr is not None:
            summary.append(f"• Avg Resting HR: {avg_rhr} bpm")
        if avg_sleep is not None:
            summary.append(f"• Avg Sleep: {int(avg_sleep // 60)}h {int(avg_sleep % 60)}m")
        if avg_steps is not None:
            summary.append(f"• Avg Steps: {int(avg_steps)}")
        if total_workouts:
            summary.append(f"• Workouts: {total_workouts} sessions")
        if avg_cal is not None:
            summary.append(f"• Avg Calories: {int(avg_cal)} kcal/day")
        if avg_protein is not None:
            summary.append(f"• Avg Protein: {int(avg_protein)} g/day")

        # Symptom correlations
        correlator = SymptomCorrelator(supabase)
        symptoms = ["headache", "dizzy", "nausea", "fatigue", "insomnia", "stomach", "sore throat", "cough", "anxiety", "brain fog"]
        all_findings = []
        for symptom in symptoms:
            try:
                result = correlator.find_triggers(user_id, symptom, lookback_days=30)
                if result.get("error"):
                    continue
                for c in result.get("correlations", {}).get("continuous", []):
                    direction = "higher" if c["correlation"] > 0 else "lower"
                    all_findings.append(f"{symptom}: {c['variable']} is {direction} (r={c['correlation']}, p={c['p_value']})")
                for c in result.get("correlations", {}).get("categorical", []):
                    all_findings.append(f"{symptom}: {c['variable']} makes it {c['odds_ratio']}x more likely (p={c['p_value']})")
            except Exception as e:
                logger.warning(f"Failed to correlate {symptom}: {e}")

        if all_findings:
            summary.append("")
            summary.append("Top statistical correlations:")
            summary.extend(f"• {f}" for f in all_findings[:10])

        insight_text = "\n".join(summary)

        supabase.table("ai_insights").insert({
            "user_id": user_id,
            "domain": "health_summary",
            "insight_text": insight_text,
            "action_item": "These are observational patterns, not medical diagnoses.",
        }).execute()

        SupabaseLogger.info("sync_health", "Generated nightly health summary", {"days": len(days), "findings": len(all_findings)})
        logger.info("Health summary written to ai_insights.")

    except Exception as e:
        logger.error(f"Health sync failed: {e}")
        SupabaseLogger.error("sync_health", "Nightly health sync failed", {"error": str(e)})


if __name__ == "__main__":
    run_health_sync()
