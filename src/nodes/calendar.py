from datetime import datetime

import calendar_service as cal
from nodes.shared import GraphState, logger, llm_fast
from nodes.ui_blocks import confirmation_block


def _fmt(payload: dict, tz) -> str:
    start = datetime.fromisoformat(payload["starts_at"]).astimezone(tz)
    return start.strftime("%a %d %b") + ("" if payload.get("all_day") else start.strftime(" %H:%M"))


def handle_calendar(state: GraphState) -> GraphState:
    """Create a calendar event from free text ("dentist thursday 3pm")."""
    tz = cal.local_tz()
    now_local = datetime.now(tz)
    try:
        parsed = cal.parse_event_text(state["content"], llm_fast, now_local.date())
        payload = cal.build_event_from_parse(parsed, now_local)
    except Exception as e:
        logger.warning(f"Calendar parse failed: {e}")
        state["response"] = str(e) if isinstance(e, ValueError) else "I couldn't read that as a calendar event."
        return state

    when = _fmt(payload, tz)
    rows = [{"label": "When", "value": when}]
    if payload.get("location"):
        rows.append({"label": "Where", "value": payload["location"]})
    if payload["recurrence"] != "none":
        rows.append({"label": "Repeats", "value": payload["recurrence"]})
    if payload.get("reminder_offsets"):
        rows.append({"label": "Reminder", "value": f'{payload["reminder_offsets"][0]} min before'})

    if state.get("dry_run"):
        state["response"] = f"Preview: {payload['title']} — {when}."
        state["ui"] = confirmation_block(
            status="preview", title=f"Add '{payload['title']}'?", rows=rows,
            metadata={"intent": "confirm_calendar"},
        )
        return state

    try:
        cal.create_event(state.get("user_id"), payload, source="chat")
    except Exception as e:
        logger.error(f"Calendar create failed: {e}")
        state["response"] = f"Failed to save event: {e}"
        return state
    state["response"] = f"Added '{payload['title']}' — {when}."
    state["ui"] = confirmation_block(status="logged", title=f"Added '{payload['title']}'", rows=rows)
    return state
