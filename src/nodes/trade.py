import json
import re
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast, supabase, _upsert_position_from_trade


def handle_trade(state: GraphState) -> GraphState:
    """Extract a trade from free text and update advisor_purchases / advisor_positions."""
    text = state["content"]
    ext_prompt = f"""
    Extract trade details from this text: "{text}". 
    
    Return ONLY a valid JSON object matching this strict structure (no other text or code blocks).
    If the user did not explicitly state the quantity OR price, you MUST return null for them so we know they are missing.
    
    {{
      "symbol": "ticker symbol (e.g. NVDA, BTC, VOO)",
      "action": "buy" or "sell" or "trim" or "add",
      "quantity": numeric (or null if not provided),
      "price": numeric (or null if not provided),
      "direction": "in" (if buying/adding) or "out" (if selling/trimming),
      "currency": "3-letter currency code, default to 'USD'",
      "fees": numeric (or 0 if not provided),
      "reason": "brief note or null"
    }}
    """
    res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
    match = re.search(r'\{.*\}', res, re.DOTALL)
    if match and supabase:
        t = json.loads(match.group(0))
        
        # Fetch default user_id if possible
        user_id = "00000000-0000-0000-0000-000000000000"
        try:
            res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
            if res_profile.data and len(res_profile.data) > 0:
                user_id = res_profile.data[0]["user_id"]
        except Exception:
            pass

        symbol = t.get("symbol")
        action = t.get("action")
        qty = t.get("quantity")
        price = t.get("price")
        direction = t.get("direction")
        reason = t.get("reason")
        
        if not symbol:
            state["response"] = "I need the ticker symbol to log a trade. For example: 'Bought 10 NVDA at $195'."
            return state
        if qty is None:
            state["response"] = f"Got it — {symbol.upper()}. How many shares/units did you trade?"
            return state
        if price is None:
            state["response"] = f"Got it — {action or 'bought'} {qty} {symbol.upper()}. What price did you pay/receive?"
            return state
        total_cost = float(qty) * float(price)
        fees_val = float(t.get("fees") or 0)
        currency_val = t.get("currency", "USD")
        executed_at = datetime.now(timezone.utc).isoformat()
        symbol_clean = symbol.upper() if symbol else "UNKNOWN"

        try:
            purchase_res = supabase.table("advisor_purchases").insert({
                "user_id": user_id,
                "symbol": symbol_clean,
                "action": action,
                "quantity": qty,
                "price": price,
                "total_cost": total_cost,
                "direction": direction,
                "reason": reason,
                "fees": fees_val,
                "currency": currency_val,
                "processed": True,
                "executed_at": executed_at,
            }).execute()

            position_ok = _upsert_position_from_trade(
                user_id=user_id,
                symbol=symbol_clean,
                action=action,
                qty=float(qty),
                price=float(price),
                fees=fees_val,
                currency=currency_val,
                reason=reason,
            )

            if position_ok:
                state["response"] = f"Logged trade and updated position: {action.capitalize()} {qty} {symbol_clean} at {currency_val} {price}."
            else:
                state["response"] = f"Logged trade: {action.capitalize()} {qty} {symbol_clean} at {currency_val} {price}, but position update failed."
        except Exception as e:
            logger.error(f"Failed to insert trade: {e}")
            state["response"] = "Failed to log trade in database."
    else:
        state["response"] = "Detected trade, but failed to parse details."

    return state
