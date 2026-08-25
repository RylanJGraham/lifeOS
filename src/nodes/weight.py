import re

from workers.action_items import mark_resolved
from nodes.shared import GraphState, logger, supabase


def handle_weight(state: GraphState) -> GraphState:
    """Extract a body-weight value from free text and log it."""
    text = state["content"]
    # Body-weight log: "weighed 68.5 this morning" -> memories domain
    # 'weight' (the weekly body-comp review reads these) + profile sync.
    mkg = re.search(r"(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg|kilo)?", text.lower())
    kg = None
    if mkg:
        try:
            candidate = float(mkg.group(1).replace(",", "."))
            if 35 <= candidate <= 250:
                kg = candidate
        except ValueError:
            kg = None
    if kg is None:
        state["response"] = "I heard a weight log but couldn't find the number — try e.g. '68.5kg'."
    elif not supabase:
        state["response"] = "Database unavailable — weight not saved."
    else:
        try:
            user_id = "00000000-0000-0000-0000-000000000000"
            try:
                res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                if res_profile.data and len(res_profile.data) > 0:
                    user_id = res_profile.data[0]["user_id"]
            except Exception:
                pass
            supabase.table("memories").insert({
                "user_id": user_id,
                "domain": "weight",
                "content": text,
                "metadata": {"kg": kg},
            }).execute()
            supabase.table("user_profiles").update({
                "current_weight_kg": kg,
            }).eq("user_id", user_id).execute()
            state["response"] = f"Logged weight: {kg:g} kg. Profile updated — the weekly body-comp review will track the trend."
            try:
                mark_resolved("bodycomp", f"Weight logged: {kg:g} kg")
            except Exception as e:
                logger.warning(f"Failed to resolve bodycomp action item: {e}")
        except Exception as e:
            logger.error(f"Weight log failed: {e}")
            state["response"] = f"Failed to save weight: {str(e)}"

    return state
