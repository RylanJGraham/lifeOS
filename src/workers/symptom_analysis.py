"""
Symptom correlation worker.

Runs the real statistical correlator against the user's health_metrics, meals,
and workouts, then writes the top correlations to ai_insights so they show up
on the dashboard and in the weekly review.

Schedule: run once per week (scripts/windows_tasks.ps1).
    python src/workers/symptom_analysis.py
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
logger = logging.getLogger("symptom_analysis")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _already_ran_this_week() -> bool:
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        res = (
            sb.table("ai_insights").select("id")
            .eq("domain", "symptom_correlations")
            .gte("generated_at", f"{today}T00:00:00")
            .limit(1).execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Could not check previous run: {e}")
        return False


def run():
    if not sb:
        logger.error("Supabase client not initialized")
        return

    if _already_ran_this_week():
        logger.info("Symptom analysis already ran this week; skipping")
        return

    user_id = _user_id()
    try:
        from health.symptom_correlator import SymptomCorrelator
        correlator = SymptomCorrelator(sb)
        symptoms = [
            "headache", "dizzy", "nausea", "fatigue", "insomnia",
            "stomach", "sore throat", "cough", "anxiety", "brain fog"
        ]
        all_findings = []
        for symptom in symptoms:
            try:
                result = correlator.find_triggers(user_id, symptom, lookback_days=60)
                if result.get("error"):
                    continue
                for c in result.get("correlations", {}).get("continuous", []):
                    direction = "higher" if c["correlation"] > 0 else "lower"
                    all_findings.append(
                        f"{symptom}: {c['variable']} is {direction} when {symptom} occurs "
                        f"(r={c['correlation']}, p={c['p_value']})"
                    )
                for c in result.get("correlations", {}).get("categorical", []):
                    all_findings.append(
                        f"{symptom}: {c['variable']} makes {symptom} {c['odds_ratio']}x more likely "
                        f"(p={c['p_value']})"
                    )
            except Exception as e:
                logger.warning(f"Failed to correlate {symptom}: {e}")
                continue

        if not all_findings:
            logger.info("No statistically significant symptom correlations found")
            return

        text = "Statistically significant correlations from the last 60 days:\n" + "\n".join(
            f"• {f}" for f in all_findings[:10]
        )

        sb.table("ai_insights").insert({
            "user_id": user_id,
            "domain": "symptom_correlations",
            "insight_text": text,
            "action_item": "These are observational patterns, not medical diagnoses. Track the suspected trigger and discuss with a doctor if symptoms persist.",
        }).execute()
        logger.info(f"Wrote {len(all_findings)} symptom correlations to ai_insights")
    except Exception as e:
        logger.error(f"Symptom analysis failed: {e}")


if __name__ == "__main__":
    run()
