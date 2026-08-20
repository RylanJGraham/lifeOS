"""
Persona insights worker: the proactive half of the Specialist pages.

Evaluates the user's live data through each care-team persona and writes an
ai_insights row (domain = doctor|nutritionist|pt) that the Specialist page and
Nexus render. Sends a Telegram message only when the persona flags something
genuinely worth attention (alert=true) — insights without alerts stay on the
dashboard, so this doesn't become notification spam.

Cadence (scripts/windows_tasks.ps1):
    python src/workers/persona_insights.py daily    # doctor + nutritionist + pt
"""
import os
import sys
import json
import logging
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("persona_insights")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

from goal_checkin import send_telegram  # noqa: E402  (same workers dir)
from persona_service import CONTEXT_BUILDERS, PERSONAS, ZERO_UUID  # noqa: E402

CADENCE_PERSONAS = {
    "daily": ["doctor", "nutritionist", "pt"],
}

EVAL_INSTRUCTIONS = {
    "doctor": (
        "Review the health data above as Dr. Ada. Set alert=true only if something genuinely "
        "needs the user's attention today: a poor-sleep streak, resting HR or HRV trending "
        "clearly off baseline, or a logged symptom with high severity. Routine variation is "
        "not an alert."
    ),
    "nutritionist": (
        "Review the logged meals above as Nora. Judge food quality (processing, protein "
        "distribution, fiber, micro gaps) against the user's targets. Set alert=true only if "
        "today's eating was genuinely off-track or a fixable pattern is repeating — not for "
        "one imperfect snack."
    ),
    "pt": (
        "Audit the recent training above as Kane: working sets per muscle group vs the "
        "10-20 sets/week hypertrophy range and the user's stated priorities in the training "
        "notes. Set alert=true if a priority muscle group is being neglected or coverage is "
        "badly imbalanced. The action_item should be concrete and forward-looking, e.g. "
        "'tomorrow: leg day — quads and calves are at 0 sets this week'."
    ),
}


def _resolve_user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _already_ran(persona: str, since: datetime) -> bool:
    try:
        res = (
            sb.table("ai_insights").select("id")
            .eq("domain", persona)
            .gte("generated_at", since.isoformat())
            .limit(1).execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Failed to check existing insights for {persona}: {e}")
        return False


def evaluate(persona: str):
    """Build context, ask the persona for a JSON evaluation, store the insight,
    and Telegram the user only on alert."""
    from graph import llm_fast  # lazy: heavy import
    from langchain_core.messages import HumanMessage

    if not llm_fast:
        logger.error("llm_fast unavailable (OPENROUTER_API_KEY missing?) — skipping")
        return

    user_id = _resolve_user_id()
    context = CONTEXT_BUILDERS[persona](sb, user_id)
    cfg = PERSONAS[persona]

    prompt = f"""You are {cfg['name']}, the user's {cfg['title']} in their Life-OS system.

{EVAL_INSTRUCTIONS[persona]}

Live data:
{context}

Today's date: {datetime.now():%Y-%m-%d}.

Return ONLY valid JSON:
{{
  "alert": true or false,
  "insight": "2-4 sentences: what the data shows, in your voice. Reference actual numbers.",
  "action_item": "one concrete thing the user should do, or null if none"
}}
The insight is shown on the dashboard either way; alert=true also pings the user on Telegram, so use it sparingly."""

    try:
        raw = llm_fast.invoke([HumanMessage(content=prompt)]).content
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            logger.warning(f"{persona}: LLM returned no JSON")
            return
        data = json.loads(match.group(0))
    except Exception as e:
        logger.error(f"{persona}: evaluation failed: {e}")
        return

    insight = (data.get("insight") or "").strip()
    if not insight:
        return
    action_item = data.get("action_item") or None
    alert = bool(data.get("alert"))

    try:
        sb.table("ai_insights").insert({
            "user_id": user_id,
            "domain": persona,
            "insight_text": insight,
            "action_item": action_item,
        }).execute()
        logger.info(f"{persona}: insight stored (alert={alert})")
    except Exception as e:
        logger.error(f"{persona}: failed to store insight: {e}")
        return

    if alert:
        text = f"{cfg['name']} ({cfg['title']}):\n\n{insight}"
        if action_item:
            text += f"\n\n→ {action_item}"
        send_telegram(text)


def run(cadence: str):
    if not sb:
        logger.error("Supabase client not initialized (check SUPABASE_URL / SUPABASE_SERVICE_KEY)")
        return
    since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    for persona in CADENCE_PERSONAS[cadence]:
        if _already_ran(persona, since):
            logger.info(f"{persona}: insight already generated this period; skipping")
            continue
        try:
            evaluate(persona)
        except Exception as e:
            logger.error(f"{persona}: run failed: {e}")


if __name__ == "__main__":
    cadences = sys.argv[1:] or ["daily"]
    for c in cadences:
        if c not in CADENCE_PERSONAS:
            logger.error(f"Unknown cadence '{c}' (expected daily|weekly)")
            continue
        logger.info(f"Running {c} persona insights for {CADENCE_PERSONAS[c]}...")
        run(c)
