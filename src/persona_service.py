"""
Care-team persona chat service: three AI specialists (Doctor, Nutritionist,
PT) the user can talk to from their dashboard pages. Clones the goals_service
pattern — each persona gets a live-data context, a system prompt, and can emit
ONE fenced ```persona_action JSON block per reply (only after explicit user
confirmation) which is validated and executed in Python:

- create_goal: delegates to goals_service._execute_action, so persona-created
  goals get checkin_cadence and the goal_checkin engine's Telegram check-ins.
- log_note: stores a durable fact (medical history, intolerances, target
  muscle groups) in `memories` under the persona's domain.

Proactive insights (daily/weekly evaluation + Telegram) live in
workers/persona_insights.py, not here.
"""
import json
import logging
import re
import threading
from datetime import datetime, timedelta

from utils.logger import SupabaseLogger

logger = logging.getLogger("persona_service")

# Separate lock per service, same reasoning as goals_service.
_persona_lock = threading.Lock()

ZERO_UUID = "00000000-0000-0000-0000-000000000000"
VALID_OPERATIONS = {"create_goal", "log_note"}

PROMPT_RULES = """
CURRENT CONTEXT (live data from the user's system):
{context}

Today's date is {today}.

ACTIONS — only after the user EXPLICITLY confirms (e.g. "yes, do it", "log that", "set that goal"), emit EXACTLY ONE fenced persona_action block at the end of your reply (never more than one, never show raw JSON elsewhere):

```persona_action
{{"operation": "create_goal", "goal_title": "...", "fields": {{"category": "habit", "description": "...", "target_value": 30, "unit": "days", "checkin_cadence": "daily"}}}}
```
or
```persona_action
{{"operation": "log_note", "text": "durable fact worth remembering, e.g. 'User reports recurring left knee pain when squatting'"}}
```

- create_goal fields may include: category (financial|habit|personal), description, target_value, current_value, unit, deadline (ISO date), checkin_cadence (daily|weekly). Goals with a cadence get automatic Telegram check-ins from the background engine — tell the user confidently when you've set that up.
- log_note is for durable facts about the user (conditions, injuries, intolerances, preferences, priorities). Don't log transient chatter.
- If the user hasn't confirmed yet, keep discussing — no action block.
- Raise concerns at most once; once the user confirms after hearing them, state the caveat briefly and still execute.
"""

PERSONAS = {
    "doctor": {
        "name": "Dr. Ada",
        "title": "Doctor",
        "memory_domain": "medical",
        "prompt": """You are Dr. Ada, the user's personal physician inside their Life-OS system — careful, warm but direct, and conservative in the way good doctors are. You have access to the user's live health telemetry (sleep, resting heart rate, HRV, logged symptoms) below.

Your job: discuss how the user has been feeling medically, spot trends in their data worth attention, suggest lifestyle adjustments, and keep a record of their medical context (conditions, injuries, medications) via log_note.

HARD RULES:
- You are NOT a substitute for real medical care. Never diagnose. When something could be clinically significant (chest pain, sustained elevated RHR, neurological symptoms, mental health crises, etc.), say clearly that they should see a real doctor — once, plainly, without panic-mongering.
- Reason from the data: reference actual sleep/HRV/RHR numbers when relevant. If data is missing, say so.
""" + PROMPT_RULES,
    },
    "nutritionist": {
        "name": "Nora",
        "title": "Nutritionist",
        "memory_domain": "nutrition",
        "prompt": """You are Nora, the user's nutritionist inside their Life-OS system — practical, non-preachy, and focused on food QUALITY, not just numbers. You have the user's logged meals (with macros and micronutrient estimates), their daily targets, and their biometrics below.

Your job: judge whether what the user eats is actually good for them as an active 24-year-old man working on his physique — ultra-processing, protein quality and distribution across the day, fiber, micronutrient gaps, meal timing around training. Suggest concrete swaps (specific foods, not "eat healthier"). Remember intolerances/preferences/deficiencies via log_note, and set up eating-habit goals via create_goal when the user agrees.

RULES:
- Use the real logged data: cite actual meals and numbers. Never lecture generically when you can point at Tuesday's dinner.
- Honest over nice: if the diet is mostly fast food, say so and triage the top 2-3 changes with the best payoff.
""" + PROMPT_RULES,
    },
    "pt": {
        "name": "Kane",
        "title": "Personal Trainer",
        "memory_domain": "training",
        "prompt": """You are Kane, the user's personal trainer inside their Life-OS system — direct, numbers-driven, allergic to junk volume. You have the user's recent training data: sessions, per-muscle-group working-set counts, and their workout templates, below.

Your job: discuss which muscle groups the user wants to grow, audit their actual weekly set coverage against those priorities (lagging vs overcooked), suggest concrete programming changes (exercises, sets, frequency — referencing their real templates), and remember their priorities/injuries via log_note. Set training-consistency or habit goals via create_goal when the user agrees.

RULES:
- Always ground advice in the coverage numbers below. If a muscle group they care about is getting zero weekly sets, that is the headline.
- 10-20 hard sets per muscle group per week is the evidence-based hypertrophy range; use it when auditing.
""" + PROMPT_RULES,
    },
}


def _resolve_user_id(supabase) -> str:
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _fetch_notes(supabase, domain: str, limit: int = 15) -> list:
    try:
        res = (
            supabase.table("memories").select("content, created_at")
            .eq("domain", domain).order("created_at", desc=True).limit(limit).execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch {domain} notes: {e}")
        return []


def _notes_block(supabase, domain: str, label: str) -> str:
    notes = _fetch_notes(supabase, domain)
    if not notes:
        return f"{label}: (none logged yet)"
    lines = [f"{label} (newest first):"]
    for n in notes:
        lines.append(f"  - [{str(n.get('created_at'))[:10]}] {n.get('content')}")
    return "\n".join(lines)


def _doctor_context(supabase, user_id: str) -> str:
    lines = []
    try:
        since = (datetime.now() - timedelta(days=14)).isoformat()
        res = (
            supabase.table("health_metrics")
            .select("recorded_at, hrv, resting_heart_rate, sleep_duration_minutes, sleep_deep_minutes, sleep_rem_minutes, symptom_name, symptom_severity, notes")
            .gte("recorded_at", since).order("recorded_at", desc=True).limit(30).execute()
        )
        rows = res.data or []
        if rows:
            lines.append("Health metrics, last 14 days (newest first):")
            for r in rows:
                parts = [f"  - [{str(r.get('recorded_at'))[:10]}]"]
                if r.get("sleep_duration_minutes"):
                    h = r["sleep_duration_minutes"] / 60
                    parts.append(f"sleep {h:.1f}h (deep {r.get('sleep_deep_minutes') or '?'}m, REM {r.get('sleep_rem_minutes') or '?'}m)")
                if r.get("resting_heart_rate"):
                    parts.append(f"RHR {r['resting_heart_rate']}bpm")
                if r.get("hrv"):
                    parts.append(f"HRV {r['hrv']}ms")
                if r.get("symptom_name"):
                    parts.append(f"SYMPTOM: {r['symptom_name']} (severity {r.get('symptom_severity')}/10)")
                if r.get("notes"):
                    parts.append(f"note: {r['notes'][:100]}")
                lines.append(" ".join(parts))
        else:
            lines.append("Health metrics: (no data in the last 14 days)")
    except Exception as e:
        logger.warning(f"Doctor context: health_metrics failed: {e}")
        lines.append("Health metrics: unavailable")
    lines.append(_notes_block(supabase, "medical", "Medical notes on record"))
    return "\n".join(lines)


def _nutritionist_context(supabase, user_id: str) -> str:
    lines = []
    try:
        res = (
            supabase.table("user_profiles")
            .select("daily_caloric_target, protein_target_g, carbs_target_g, fat_target_g, current_weight_kg, target_weight_kg, goal")
            .limit(1).execute()
        )
        if res.data:
            p = res.data[0]
            lines.append(
                f"Profile: {p.get('current_weight_kg')}kg -> target {p.get('target_weight_kg')}kg, goal: {p.get('goal')}. "
                f"Daily targets: {p.get('daily_caloric_target')} kcal, P {p.get('protein_target_g')}g, C {p.get('carbs_target_g')}g, F {p.get('fat_target_g')}g."
            )
    except Exception as e:
        logger.warning(f"Nutritionist context: profile failed: {e}")
    try:
        since = (datetime.now() - timedelta(days=7)).isoformat()
        res = (
            supabase.table("meals").select("meal_time, description, calories, protein, carbs, fat, micronutrients")
            .gte("meal_time", since).order("meal_time", desc=True).limit(100).execute()
        )
        rows = res.data or []
        if rows:
            by_day = {}
            for r in rows:
                by_day.setdefault(str(r.get("meal_time"))[:10], []).append(r)
            lines.append("Logged meals, last 7 days:")
            for day in sorted(by_day, reverse=True):
                meals = by_day[day]
                tot_cal = sum(float(m.get("calories") or 0) for m in meals)
                tot_p = sum(float(m.get("protein") or 0) for m in meals)
                lines.append(f"  {day} ({tot_cal:.0f} kcal, {tot_p:.0f}g protein):")
                for m in meals:
                    micro = m.get("micronutrients") or {}
                    micro_hits = [f"{k.replace('_dv_pct', '')} {v}%" for k, v in micro.items()
                                  if k.endswith("_dv_pct") and isinstance(v, (int, float)) and v >= 25]
                    line = f"    - {m.get('description')} ({m.get('calories') or '?'} kcal, P {m.get('protein') or '?'}g)"
                    if micro_hits:
                        line += f" | notable micros: {', '.join(micro_hits[:5])}"
                    lines.append(line)
        else:
            lines.append("Logged meals: (none in the last 7 days)")
    except Exception as e:
        logger.warning(f"Nutritionist context: meals failed: {e}")
        lines.append("Logged meals: unavailable")
    lines.append(_notes_block(supabase, "nutrition", "Nutrition notes on record"))
    return "\n".join(lines)


def _pt_context(supabase, user_id: str) -> str:
    lines = []
    try:
        ex_to_group = {}
        for tbl in ("workout_template_exercises", "exercise_muscles"):
            res = supabase.table(tbl).select("exercise_name, muscle_group").execute()
            for r in (res.data or []):
                ex_to_group[r["exercise_name"]] = r["muscle_group"]
        since = (datetime.now() - timedelta(days=14)).isoformat()
        res = (
            supabase.table("workouts")
            .select("workout_date, exercise_name, sets, reps, weight, activity_type, duration_minutes")
            .gte("workout_date", since).order("workout_date", desc=True).limit(200).execute()
        )
        rows = res.data or []
        groups = {}
        sessions = []
        for r in rows:
            if r.get("duration_minutes") and not (r.get("sets") or r.get("reps")):
                sessions.append(f"  - [{str(r.get('workout_date'))[:10]}] {r.get('activity_type') or r.get('exercise_name')}, {r['duration_minutes']:.0f} min")
                continue
            g = ex_to_group.get(r.get("exercise_name"))
            if g and r.get("sets"):
                groups[g] = groups.get(g, 0) + r["sets"]
        if groups:
            lines.append("Working sets per muscle group, last 14 days:")
            for g, s in sorted(groups.items(), key=lambda kv: -kv[1]):
                lines.append(f"  - {g}: {s} sets")
        else:
            lines.append("Working sets: (no lifting sets logged in the last 14 days)")
        if sessions:
            lines.append("Sessions:")
            lines.extend(sessions[:15])
    except Exception as e:
        logger.warning(f"PT context: workouts failed: {e}")
        lines.append("Training data: unavailable")
    try:
        res = supabase.table("workout_templates").select("name").execute()
        if res.data:
            lines.append("Templates: " + ", ".join(t["name"] for t in res.data))
    except Exception:
        pass
    lines.append(_notes_block(supabase, "training", "Training notes on record (priorities, injuries)"))
    return "\n".join(lines)


CONTEXT_BUILDERS = {
    "doctor": _doctor_context,
    "nutritionist": _nutritionist_context,
    "pt": _pt_context,
}


def _sanitize_history(history: list) -> list:
    msgs = []
    for h in (history or [])[-20:]:
        if not isinstance(h, dict):
            continue
        role, content = h.get("role"), h.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            msgs.append((role, content))
    return msgs


def _extract_action(reply: str):
    match = re.search(r"```persona_action\s*(\{.*?\})\s*```", reply, re.DOTALL)
    if not match:
        match = re.search(r"```persona_action\s*(.*?)```", reply, re.DOTALL)
        if match:
            inner = re.search(r"\{.*\}", match.group(1), re.DOTALL)
            if not inner:
                return None, reply
            raw = inner.group(0)
        else:
            return None, reply
    else:
        raw = match.group(1)
    cleaned = (reply[:match.start()] + reply[match.end():]).strip()
    try:
        return json.loads(raw), cleaned
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse persona_action JSON: {e}")
        return None, cleaned


def _execute_persona_action(supabase, user_id: str, persona: str, action: dict) -> str:
    """Run a validated persona_action. Returns a confirmation line, or raises
    ValueError with a user-facing reason."""
    operation = action.get("operation")

    if operation == "create_goal":
        from goals_service import _execute_action, _fetch_goals
        goals = _fetch_goals(supabase, user_id)
        goal_action = {
            "operation": "create",
            "goal_title": action.get("goal_title") or (action.get("fields") or {}).get("title"),
            "fields": action.get("fields") or {},
        }
        return _execute_action(supabase, user_id, goals, goal_action)

    if operation == "log_note":
        text = (action.get("text") or "").strip()
        if not text:
            raise ValueError("the note was empty")
        supabase.table("memories").insert({
            "user_id": user_id,
            "domain": PERSONAS[persona]["memory_domain"],
            "content": text,
            "metadata": {"source": f"persona:{persona}"},
        }).execute()
        return "\n\n📝 Noted for the record."

    raise ValueError(f"unknown operation '{operation}'")


def handle_persona_chat(persona: str, message: str, history: list = None) -> dict:
    """Run one persona-chat turn. Returns {"reply": ..., "changed": bool}."""
    from graph import llm_fast, supabase  # lazy: heavy imports (langchain, supabase)

    if persona not in PERSONAS:
        return {"reply": f"Unknown persona '{persona}'.", "changed": False}
    message = (message or "").strip()
    if not message:
        return {"reply": "Say something first.", "changed": False}
    if not llm_fast:
        return {"reply": "OpenRouter API Key not configured.", "changed": False}

    cfg = PERSONAS[persona]
    with _persona_lock:
        user_id = _resolve_user_id(supabase) if supabase else ZERO_UUID
        try:
            context = CONTEXT_BUILDERS[persona](supabase, user_id) if supabase else "Data store unavailable."
        except Exception as e:
            logger.error(f"Persona context build failed: {e}")
            context = "Live data temporarily unavailable — answer from general knowledge and say so."

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
        system = cfg["prompt"].format(context=context, today=datetime.now().strftime("%Y-%m-%d"))

        messages = [SystemMessage(content=system)]
        for role, content in _sanitize_history(history):
            messages.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
        messages.append(HumanMessage(content=message))

        try:
            raw_reply = llm_fast.invoke(messages).content
        except Exception as e:
            logger.error(f"Persona chat LLM call failed: {e}")
            SupabaseLogger.error("persona-chat", f"{persona} chat LLM call failed: {e}")
            return {"reply": "I'm having trouble thinking right now. Try again in a moment.", "changed": False}

    action, reply = _extract_action(raw_reply or "")
    if action is None:
        return {"reply": reply or "I couldn't generate a response.", "changed": False}

    if action.get("operation") not in VALID_OPERATIONS:
        logger.warning(f"Invalid persona_action operation: {action.get('operation')}")
        return {
            "reply": (reply + "\n\n(I drafted an action, but it didn't pass validation — nothing was saved.)").strip(),
            "changed": False,
        }
    if not supabase:
        return {"reply": (reply + "\n\n(I couldn't reach the database, so nothing was saved.)").strip(), "changed": False}

    try:
        confirmation = _execute_persona_action(supabase, user_id, persona, action)
        SupabaseLogger.info("persona-chat", f"{persona} action {action['operation']} executed.")
        return {"reply": (reply + confirmation).strip(), "changed": True}
    except ValueError as e:
        logger.warning(f"Persona action rejected: {e}")
        return {
            "reply": (reply + f"\n\n(To be safe, I didn't save anything: {e}.)").strip(),
            "changed": False,
        }
    except Exception as e:
        logger.error(f"Persona action failed: {e}")
        SupabaseLogger.error("persona-chat", f"{persona} action failed: {e}")
        return {
            "reply": (reply + "\n\n(The change failed to save on my side — nothing was written. Try again.)").strip(),
            "changed": False,
        }
