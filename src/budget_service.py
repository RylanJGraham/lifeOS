"""
Budget coach service: an AI that helps the user understand their spending and
build realistic budgets from their actual salary, rent, bank balance, and
recent transactions.

Called by /api/budget-coach.
"""
import json
import logging
import threading
from datetime import datetime, timedelta

from utils.logger import SupabaseLogger

logger = logging.getLogger("budget_service")
_budget_lock = threading.Lock()

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _resolve_user_id(supabase) -> str:
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _profile_context(supabase, user_id: str) -> dict:
    try:
        res = (
            supabase.table("user_profiles")
            .select("bank_balance, monthly_rent, base_salary, target_savings_rate, currency")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]
    except Exception as e:
        logger.warning(f"Failed to fetch user profile: {e}")
    return {}


def _spending_by_period(supabase, user_id: str, days: int) -> list:
    since = (datetime.now() - timedelta(days=days)).date().isoformat()
    try:
        res = (
            supabase.table("transactions")
            .select("category, amount")
            .eq("user_id", user_id)
            .gte("transaction_date", since)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch transactions: {e}")
        return []

    cats: dict[str, float] = {}
    for r in rows:
        amt = float(r.get("amount") or 0)
        if amt >= 0:
            continue
        cat = (r.get("category") or "Uncategorized").strip()
        cats[cat] = cats.get(cat, 0.0) + abs(amt)
    return sorted([{"category": k, "spent": round(v, 2)} for k, v in cats.items()], key=lambda x: x["spent"], reverse=True)


def _budgets(supabase, user_id: str) -> list:
    try:
        res = supabase.table("budgets").select("category, monthly_limit").eq("user_id", user_id).order("category").execute()
        return res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch budgets: {e}")
        return []


def _goals(supabase, user_id: str) -> list:
    try:
        res = (
            supabase.table("goals")
            .select("title, target_value, current_value, unit, currency, deadline")
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch goals: {e}")
        return []


def _build_context(supabase, user_id: str) -> str:
    prof = _profile_context(supabase, user_id)
    salary = prof.get("base_salary")
    rent = prof.get("monthly_rent")
    bank = prof.get("bank_balance")
    savings_rate = prof.get("target_savings_rate")
    currency = prof.get("currency") or "EUR"

    monthly_income = None
    if salary:
        monthly_income = round(float(salary) / 12, 2)

    lines = [
        f"Currency: {currency}",
        f"Current bank balance: {bank if bank is not None else 'unknown'} {currency}",
        f"Annual salary: {salary if salary is not None else 'unknown'} {currency}",
    ]
    if monthly_income is not None:
        lines.append(f"Monthly income (salary/12): {monthly_income} {currency}")
    if rent is not None:
        lines.append(f"Monthly rent/mortgage: {rent} {currency}")
    if savings_rate is not None:
        lines.append(f"Target savings rate: {savings_rate}%")

    spend_30 = _spending_by_period(supabase, user_id, 30)
    spend_90 = _spending_by_period(supabase, user_id, 90)

    lines.append("\nSpending by category (last 30 days):")
    if spend_30:
        for s in spend_30[:12]:
            lines.append(f"- {s['category']}: {s['spent']:.2f}")
    else:
        lines.append("- no transactions logged")

    lines.append("\nSpending by category (last 90 days):")
    if spend_90:
        for s in spend_90[:12]:
            lines.append(f"- {s['category']}: {s['spent']:.2f}")
    else:
        lines.append("- no transactions logged")

    budgets = _budgets(supabase, user_id)
    lines.append("\nCurrent budget envelopes:")
    if budgets:
        for b in budgets:
            lines.append(f"- {b.get('category')}: {b.get('monthly_limit')} {currency}")
    else:
        lines.append("- none set")

    goals = _goals(supabase, user_id)
    lines.append("\nActive financial goals:")
    if goals:
        for g in goals:
            target = g.get("target_value")
            unit = g.get("unit") or ""
            cur = g.get("currency") or ""
            lines.append(f"- {g['title']}: target {target} {unit or cur}, deadline {g.get('deadline') or 'none'}")
    else:
        lines.append("- none")

    return "\n".join(lines)


SYSTEM_PROMPT = """You are Jarvis, the user's dry-witted personal finance chief of staff inside LifeOS.

You are embedded in the Budgets dashboard. Your job is to help the user understand their spending, set realistic budget envelopes, and decide whether they can afford things — using ONLY the live financial data in the context below. Do not invent numbers. If a key number (salary, rent, transactions) is missing, say so and ask for it.

RULES:
- Be concise: 3-6 sentences unless the user asks for detail.
- Use the monthly income, rent, bank balance, recent spending, current budgets, and goals to reason.
- Suggest specific budget envelope limits as percentages of income (e.g. "Food & Dining: €400/month").
- Flag overspend clearly and name the categories that blew the budget.
- For "can I afford X?" questions, consider fixed obligations + average monthly spend + emergency buffer; do not just look at the bank balance.
- If the user asks how to save more, propose 1-2 concrete, low-friction moves tied to their real spending.
- Do not offer to create or edit anything in the database yourself; just give advice.
- Today's date is {today}.

CURRENT FINANCIAL CONTEXT:
{context}
"""


def _sanitize_history(history: list) -> list:
    msgs = []
    for h in (history or [])[-20:]:
        if not isinstance(h, dict):
            continue
        role, content = h.get("role"), h.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            msgs.append((role, content))
    return msgs


def handle_budget_chat(message: str, history: list = None) -> dict:
    """Run one budget-coach turn and return {"reply": str}."""
    from graph import llm_fast, supabase

    message = (message or "").strip()
    if not message:
        return {"reply": "Ask me about your spending, budgets, or whether you can afford something."}
    if not llm_fast:
        return {"reply": "OpenRouter API Key not configured."}

    with _budget_lock:
        user_id = _resolve_user_id(supabase) if supabase else ZERO_UUID
        context = _build_context(supabase, user_id) if supabase else "Data store unavailable."

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        system = SYSTEM_PROMPT.format(
            today=datetime.now().strftime("%Y-%m-%d"),
            context=context,
        )

        messages = [SystemMessage(content=system)]
        for role, content in _sanitize_history(history):
            messages.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
        messages.append(HumanMessage(content=message))

        try:
            reply = llm_fast.invoke(messages).content.strip()
        except Exception as e:
            logger.error(f"Budget coach LLM call failed: {e}")
            SupabaseLogger.error("budget-coach", f"Budget coach LLM call failed: {e}")
            return {"reply": "I'm having trouble reaching my planning brain right now. Try again in a moment."}

    SupabaseLogger.info("budget-coach", "Budget coach turn completed.", {"preview": message[:120]})
    return {"reply": reply}
