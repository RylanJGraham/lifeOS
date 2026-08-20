"""
Goals chat service: an AI goal-strategist ("Jarvis") that theorycrafts goals
with the user and, once the user explicitly confirms, creates / updates /
deletes / checks-in goals in Supabase from the conversation.

The LLM emits one fenced ```goal_action JSON block per reply at most, and only
after explicit user confirmation. The block is stripped from the visible reply
and executed here in Python — date math and goal-title matching are never
trusted to the model.
"""
import json
import logging
import re
import threading
from datetime import datetime, timedelta

from utils.logger import SupabaseLogger

logger = logging.getLogger("goals_service")

# Separate from chat_service's lock: goal chats don't go through the graph.
_goals_lock = threading.Lock()

ZERO_UUID = "00000000-0000-0000-0000-000000000000"
VALID_OPERATIONS = {"create", "update", "delete", "checkin"}
VALID_CATEGORIES = {"financial", "habit", "personal"}
VALID_STATUSES = {"active", "achieved", "abandoned"}
VALID_LINKED_METRICS = {"net_worth", "bank_balance", "portfolio_value"}
VALID_CADENCES = {"daily", "weekly"}
GOAL_FIELDS = {
    "title", "category", "status", "description", "target_value",
    "current_value", "unit", "currency", "deadline", "linked_metric",
    "checkin_cadence", "plan",
}

SYSTEM_PROMPT_TEMPLATE = """You are Jarvis, the user's personal goal strategist inside their Life-OS system — precise, dry-witted, direct, and genuinely invested in the user's long-term outcomes. You talk like a trusted chief of staff, not a cheerleader.

Your job is to theorycraft goals with the user: big purchases (cars, gear, travel), savings plans, quitting or building habits, personal projects — anything. Discuss freely, challenge assumptions, and ask clarifying questions BEFORE committing anything to the database. Do not rush to create goals.

CRITICAL: You are the configuration layer for the LifeOS background engine.
Once you create a goal in the system, the background engine cross-references the user's live metrics (bank balance, portfolio, etc.) against the goal's target.
Goals with checkin_cadence "daily" get a Telegram check-in question every evening (the user's Yes/No answer updates their streak automatically); goals with "weekly" get a weekly Telegram progress review. When a target is met, the engine messages the user that they have the "Green Light".
DO NOT talk like a generic ChatGPT assistant asking "Would you like to set a check-in?". Instead, tell the user confidently: "I will configure a background monitor for this. The engine will track your progress and message you on Telegram when you're ready."

CURRENT CONTEXT (live data from the user's system):
{context}

RULES:
- You HAVE full access to the live internet, market data, and the user's database. The system automatically searches the web behind the scenes for you when needed. Never claim your knowledge is cut off or that you cannot access live data.
- When discussing affordability, use the finance numbers above and reason concretely: monthly savings needed, months to target, impact on the current bank balance. If a number is missing, say so instead of inventing one.
- Today's date is {today}. Never do date arithmetic yourself in the action block — write deadlines as ISO dates (YYYY-MM-DD) if you are certain, otherwise describe them in words (e.g. "in 6 months") and the system will resolve them.
- Only after the user EXPLICITLY confirms an operation (e.g. "yes, create it", "go ahead", "delete it"), emit EXACTLY ONE fenced goal_action block at the end of your reply, and never more than one:

```goal_action
{{"operation": "create|update|delete|checkin", "goal_title": "...", "fields": {{...}}}}
```

- fields may include: category (financial|habit|personal), description, target_value, current_value, unit, currency, deadline (ISO date), linked_metric (net_worth|bank_balance|portfolio_value), checkin_cadence (daily|weekly), plan (array of milestones [{{"label": "...", "value": 123, "date": "YYYY-MM-DD", "done": false}}]). For checkin, fields use "note" and optional "value" (the new current value).
- Never show raw JSON anywhere else in your reply. The block is hidden from the user; write your visible reply as normal prose.
- If the user hasn't confirmed yet, keep discussing — no action block.
- Raise feasibility concerns at most once. Once the user explicitly confirms after hearing them, respect the decision: state your caveat briefly in the visible reply, then still emit the block and execute. Never refuse or re-litigate an explicit confirmation.
"""


def _resolve_user_id(supabase) -> str:
    """Same convention as graph.py: first user_profiles row, fallback zero UUID."""
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _fetch_goals(supabase, user_id: str) -> list:
    try:
        res = (
            supabase.table("goals").select("*")
            .eq("user_id", user_id).neq("status", "abandoned")
            .order("created_at", desc=False).execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch goals: {e}")
        return []


def _fetch_latest_checkins(supabase, goal_ids: list) -> dict:
    """Latest check-in (note/value) per goal id."""
    latest = {}
    if not goal_ids:
        return latest
    try:
        res = (
            supabase.table("goal_checkins").select("goal_id, note, value, created_at")
            .in_("goal_id", goal_ids).order("created_at", desc=True).execute()
        )
        for row in (res.data or []):
            if row["goal_id"] not in latest:
                latest[row["goal_id"]] = row
    except Exception as e:
        logger.warning(f"Failed to fetch goal check-ins: {e}")
    return latest


def _fetch_finance_context(supabase, user_id: str) -> str:
    lines = []
    try:
        res = (
            supabase.table("user_profiles")
            .select("bank_balance, bank_balance_updated_at, base_salary")
            .eq("user_id", user_id).limit(1).execute()
        )
        if not res.data:
            res = supabase.table("user_profiles").select("bank_balance, bank_balance_updated_at, base_salary").limit(1).execute()
        if res.data:
            row = res.data[0]
            bal = row.get("bank_balance")
            ts = row.get("bank_balance_updated_at")
            salary = row.get("base_salary")
            if bal is not None:
                note = f" (as of {ts})" if ts else " (timestamp unknown — treat as approximate)"
                lines.append(f"- Bank balance: {bal}{note}")
            if salary is not None:
                lines.append(f"- Base Salary (Annual): {salary}")
    except Exception as e:
        logger.warning(f"Failed to fetch bank balance: {e}")
    try:
        res = (
            supabase.table("advisor_portfolio_snapshots")
            .select("total_value, record_date")
            .order("record_date", desc=True).limit(1).execute()
        )
        if res.data:
            row = res.data[0]
            lines.append(f"- Portfolio value: {row.get('total_value')} (as of {row.get('record_date')})")
    except Exception as e:
        # Tolerate the table being empty or missing entirely.
        logger.warning(f"Failed to fetch portfolio snapshot: {e}")
    return "\n".join(lines) if lines else "- Finance data unavailable."


def _build_context(supabase, user_id: str, goals: list) -> str:
    lines = ["Active goals:"]
    if goals:
        checkins = _fetch_latest_checkins(supabase, [g["id"] for g in goals])
        for g in goals:
            parts = [f'  - "{g["title"]}" [{g.get("category", "personal")}, status={g.get("status", "active")}]']
            if g.get("target_value") is not None:
                progress = f"{g.get('current_value', 0)}/{g['target_value']}"
                if g.get("unit"):
                    progress += f" {g['unit']}"
                if g.get("currency"):
                    progress += f" {g['currency']}"
                parts.append(f"progress={progress}")
            if g.get("deadline"):
                parts.append(f"deadline={g['deadline']}")
            if g.get("description"):
                parts.append(f"desc: {g['description']}")
            c = checkins.get(g["id"])
            if c:
                note = c.get("note") or ""
                val = f" (value={c['value']})" if c.get("value") is not None else ""
                parts.append(f'last check-in{val}: "{note[:120]}"')
            lines.append("; ".join(parts))
    else:
        lines.append("  (none yet)")
    lines.append("Finances:")
    lines.append(_fetch_finance_context(supabase, user_id))
    return "\n".join(lines)


def _sanitize_history(history: list) -> list:
    """Keep only user/assistant string messages, capped at the last 20."""
    msgs = []
    for h in (history or [])[-20:]:
        if not isinstance(h, dict):
            continue
        role, content = h.get("role"), h.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            msgs.append((role, content))
    return msgs


def _extract_action(reply: str):
    """Pull the fenced goal_action block out of the reply. Returns (action_dict, cleaned_reply)."""
    match = re.search(r"```goal_action\s*(\{.*?\})\s*```", reply, re.DOTALL)
    if not match:
        # Fall back to a looser hunt in case the model botched the fence.
        match = re.search(r"```goal_action\s*(.*?)```", reply, re.DOTALL)
        if match:
            inner = re.search(r"\{.*\}", match.group(1), re.DOTALL)
            if inner:
                raw = inner.group(0)
            else:
                return None, reply
        else:
            return None, reply
    else:
        raw = match.group(1)
    cleaned = (reply[:match.start()] + reply[match.end():]).strip()
    try:
        return json.loads(raw), cleaned
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse goal_action JSON: {e}")
        return None, cleaned


def _resolve_deadline(value):
    """Resolve a deadline to an ISO date string. Accepts ISO dates directly;
    resolves common relative phrasing in Python (never trust LLM date math).
    Returns None if unresolvable."""
    if not value or not isinstance(value, str):
        return None
    ref = value.strip().lower()
    try:
        return datetime.fromisoformat(ref[:10]).date().isoformat()
    except (ValueError, TypeError):
        pass
    now = datetime.now()
    if ref in ("today",):
        return now.date().isoformat()
    if ref == "tomorrow":
        return (now + timedelta(days=1)).date().isoformat()
    if "end of year" in ref or "end of the year" in ref:
        return now.date().replace(month=12, day=31).isoformat()
    if "next year" in ref:
        return now.date().replace(year=now.year + 1).isoformat()
    m = re.search(r"in\s+(\d+)\s+(day|week|month|year)s?", ref)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        days = {"day": n, "week": n * 7, "month": n * 30, "year": n * 365}[unit]
        return (now + timedelta(days=days)).date().isoformat()
    return None


def _match_goal(goals: list, title: str):
    """Token-overlap fuzzy match (spirit of graph.py's _match_workout_template).
    Confident only on a unique best match with real overlap; substring matches
    always count as confident."""
    if not title:
        return None
    needle = title.strip().lower()
    for g in goals:
        if g.get("title", "").strip().lower() == needle:
            return g
    tokens = set(re.findall(r"[a-z0-9]+", needle))
    best, best_score, tied = None, 0, False
    for g in goals:
        g_title = g.get("title", "").lower()
        if needle in g_title or g_title in needle:
            return g
        g_tokens = set(re.findall(r"[a-z0-9]+", g_title))
        score = len(tokens & g_tokens)
        if score > best_score:
            best, best_score, tied = g, score, False
        elif score == best_score and score > 0:
            tied = True
    if best and best_score >= max(1, (len(tokens) + 1) // 2) and not tied:
        return best
    return None


def _validate_fields(operation: str, fields: dict) -> dict:
    """Whitelist and coerce fields for the given operation."""
    out = {}
    if operation == "checkin":
        if isinstance(fields.get("note"), str):
            out["note"] = fields["note"]
        if fields.get("value") is not None:
            out["value"] = float(fields["value"])
        return out
    for key, value in (fields or {}).items():
        if key not in GOAL_FIELDS or value is None:
            continue
        if key == "category":
            if value in VALID_CATEGORIES:
                out[key] = value
        elif key == "status":
            if value in VALID_STATUSES:
                out[key] = value
        elif key == "linked_metric":
            if value in VALID_LINKED_METRICS:
                out[key] = value
        elif key == "checkin_cadence":
            if value in VALID_CADENCES:
                out[key] = value
        elif key in ("target_value", "current_value"):
            out[key] = float(value)
        elif key == "deadline":
            resolved = _resolve_deadline(str(value))
            if resolved:
                out[key] = resolved
            else:
                logger.warning(f"Unresolvable deadline '{value}' — dropping field")
        elif key == "plan":
            if isinstance(value, list):
                out[key] = value
        elif isinstance(value, str):
            out[key] = value
    return out


def _execute_action(supabase, user_id: str, goals: list, action: dict) -> str:
    """Run a validated goal_action against Supabase. Returns a short
    confirmation line, or raises ValueError with a user-facing reason."""
    operation = action.get("operation")
    title = action.get("goal_title") or (action.get("fields") or {}).get("title")
    fields = _validate_fields(operation, action.get("fields") or {})

    if operation == "create":
        if not title:
            raise ValueError("the goal had no title")
        row = {"user_id": user_id, "title": title.strip(), **fields}
        supabase.table("goals").insert(row).execute()
        return f"\n\n✅ Goal created: \"{title.strip()}\"."

    # update / delete / checkin all need a confident goal match
    goal = _match_goal(goals, title or "")
    if not goal:
        raise ValueError(f'I couldn\'t confidently match "{title}" to one of your existing goals')

    if operation == "update":
        if not fields:
            raise ValueError("there was nothing valid to update")
        fields["updated_at"] = datetime.now().astimezone().isoformat()
        supabase.table("goals").update(fields).eq("id", goal["id"]).execute()
        return f"\n\n✅ Goal updated: \"{goal['title']}\"."

    if operation == "delete":
        supabase.table("goals").delete().eq("id", goal["id"]).execute()
        return f"\n\n✅ Goal deleted: \"{goal['title']}\"."

    if operation == "checkin":
        checkin = {"goal_id": goal["id"], "user_id": user_id}
        if fields.get("note"):
            checkin["note"] = fields["note"]
        if fields.get("value") is not None:
            checkin["value"] = fields["value"]
        supabase.table("goal_checkins").insert(checkin).execute()
        if fields.get("value") is not None:
            supabase.table("goals").update({
                "current_value": fields["value"],
                "updated_at": datetime.now().astimezone().isoformat(),
            }).eq("id", goal["id"]).execute()
        return f"\n\n✅ Check-in logged for \"{goal['title']}\"."

    raise ValueError(f"unknown operation '{operation}'")


def handle_goals_chat(message: str, history: list = None) -> dict:
    """Run one goals-chat turn and return {"reply": ..., "goals_changed": bool}."""
    from graph import llm_fast, supabase  # lazy: heavy imports (langchain, supabase)

    message = (message or "").strip()
    if not message:
        return {"reply": "Say something first and we'll build a plan around it.", "goals_changed": False}
    if not llm_fast:
        return {"reply": "OpenRouter API Key not configured.", "goals_changed": False}

    with _goals_lock:
        user_id = _resolve_user_id(supabase) if supabase else ZERO_UUID
        goals = _fetch_goals(supabase, user_id) if supabase else []
        context = _build_context(supabase, user_id, goals) if supabase else "Data store unavailable."

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
        
        # Check if we need to search the web for live data
        search_prompt = f"""
        Does the following user message ask about or require looking up real-world prices, specifications, or facts (e.g. buying a specific car, phone, or travel destination)?
        If yes, reply ONLY with a concise search query (e.g., 'BYD Dolphin Surf price').
        If no, reply ONLY with 'no_search'.
        
        User message: "{message}"
        """
        try:
            search_query = llm_fast.invoke([HumanMessage(content=search_prompt)]).content.strip().replace('"', '').replace("'", "")
            if search_query.lower() not in ("no_search", "no search", ""):
                from graph import web_search
                logger.info(f"Goals chat requires web verification. Query: '{search_query}'")
                search_results = web_search(search_query)
                if search_results and search_results != "No search results available.":
                    context += f"\n\n[Web Search Results for '{search_query}']:\n{search_results}\n(Use these search results to answer the user's questions about prices/specs.)"
        except Exception as e:
            logger.warning(f"Failed to generate search query for goals chat: {e}")

        system = SYSTEM_PROMPT_TEMPLATE.format(
            context=context, today=datetime.now().strftime("%Y-%m-%d")
        )

        messages = [SystemMessage(content=system)]
        for role, content in _sanitize_history(history):
            messages.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
        messages.append(HumanMessage(content=message))

        try:
            raw_reply = llm_fast.invoke(messages).content
        except Exception as e:
            logger.error(f"Goals chat LLM call failed: {e}")
            SupabaseLogger.error("goals-chat", f"Goals chat LLM call failed: {e}")
            return {
                "reply": "I'm having trouble reaching my planning brain right now. Try again in a moment.",
                "goals_changed": False,
            }

    action, reply = _extract_action(raw_reply or "")

    if action is None:
        return {"reply": reply or "I couldn't generate a response.", "goals_changed": False}

    operation = action.get("operation")
    if operation not in VALID_OPERATIONS:
        logger.warning(f"Invalid goal_action operation: {operation}")
        return {
            "reply": (reply + "\n\n(I drafted a change, but it didn't pass validation — nothing was saved.)").strip(),
            "goals_changed": False,
        }

    if not supabase:
        return {
            "reply": (reply + "\n\n(I couldn't reach the database, so nothing was saved.)").strip(),
            "goals_changed": False,
        }

    try:
        confirmation = _execute_action(supabase, user_id, goals, action)
        SupabaseLogger.info("goals-chat", f"Goal {operation} executed.", {"goal_title": action.get("goal_title")})
        return {"reply": (reply + confirmation).strip(), "goals_changed": True}
    except ValueError as e:
        # User-facing mismatch/validation problem — nothing written.
        logger.warning(f"Goal action rejected: {e}")
        return {
            "reply": (reply + f"\n\n(To be safe, I didn't save anything: {e}. Tell me which goal you mean and I'll apply it.)").strip(),
            "goals_changed": False,
        }
    except Exception as e:
        logger.error(f"Goal action failed: {e}")
        SupabaseLogger.error("goals-chat", f"Goal action failed: {e}")
        return {
            "reply": (reply + "\n\n(The change failed to save on my side — nothing was written. We can try again.)").strip(),
            "goals_changed": False,
        }
