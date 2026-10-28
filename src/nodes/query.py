"""Answers questions about data that already exists (sleep, meals eaten today,
macros vs targets, training load, cash, portfolio, goals) — grounded in real
Supabase rows, never fabricated. Distinct from the nutrition/trade/workout
handlers, which LOG new data; this only reads.

Falls back to handle_general (free chat, no data) whenever the question
isn't about one of these domains or the underlying data isn't there.
"""
from datetime import datetime, timedelta, timezone

from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast, supabase, ZERO_UUID
from nodes.ui_blocks import stat_grid_block, stat
from nodes.general import handle_general

DOMAINS = ["sleep", "nutrition_today", "macros", "training_load", "cash", "portfolio", "goals", "none"]


def _classify_domain(text: str) -> str:
    prompt = f"""Classify what EXISTING DATA this question is asking about. Respond with ONLY ONE WORD from this list:
    sleep - sleep duration/quality (e.g. "how did I sleep", "how much sleep last night")
    nutrition_today - what/how much they've eaten today (e.g. "what did I eat today", "calories so far")
    macros - macro breakdown vs daily targets (e.g. "what's my macros", "am I hitting my protein target")
    training_load - recent workouts/training volume (e.g. "how's my training load", "what did I train this week")
    cash - bank balance / spending (e.g. "how much cash do I have", "what's my spending like")
    portfolio - investment positions/portfolio value (e.g. "portfolio summary", "how are my stocks doing")
    goals - active goals / progress (e.g. "how are my goals going")
    none - not a question about existing data (general chat, logging something new, anything else)

    Question: "{text}"
    """
    try:
        return (llm_fast.invoke([HumanMessage(content=prompt)]).content or "").strip().lower()
    except Exception as e:
        logger.warning(f"Query domain classification failed: {e}")
        return "none"


def _answer_sleep(state: GraphState, user_id: str) -> bool:
    res = supabase.table("health_metrics").select("*").eq("user_id", user_id).order("recorded_at", desc=True).limit(1).execute()
    row = (res.data or [None])[0]
    if not row or not row.get("sleep_duration_minutes"):
        return False
    hours = row["sleep_duration_minutes"] / 60
    target = 8.0
    severity = "good" if hours >= target * 0.9 else "warn" if hours >= target * 0.75 else "bad"
    state["response"] = (
        f"**{hours:.1f}h** of sleep last night (target {target:.0f}h)"
        + (f", RHR {row['resting_heart_rate']} bpm" if row.get("resting_heart_rate") else "")
        + (f", HRV {row['hrv']} ms" if row.get("hrv") else "") + "."
    )
    stats = [stat("Sleep", f"{hours:.1f}", unit="h", caption=f"Target {target:.0f}h", severity=severity)]
    if row.get("resting_heart_rate"):
        stats.append(stat("Resting HR", str(row["resting_heart_rate"]), unit="bpm"))
    if row.get("hrv"):
        stats.append(stat("HRV", str(row["hrv"]), unit="ms"))
    if row.get("sleep_deep_minutes"):
        stats.append(stat("Deep sleep", str(row["sleep_deep_minutes"]), unit="min"))
    if row.get("sleep_rem_minutes"):
        stats.append(stat("REM", str(row["sleep_rem_minutes"]), unit="min"))
    state["ui"] = stat_grid_block("Last night's sleep", stats)
    return True


def _answer_nutrition(state: GraphState, user_id: str, with_targets: bool) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = supabase.table("meals").select("*").eq("user_id", user_id).gte("meal_time", f"{today}T00:00:00").lte("meal_time", f"{today}T23:59:59").execute()
    meals = res.data or []
    if not meals:
        state["response"] = "No meals logged yet today."
        state["ui"] = stat_grid_block("Today so far", [stat("Calories", "0", unit="kcal")])
        return True
    cals = sum(m.get("calories") or 0 for m in meals)
    protein = sum(m.get("protein") or 0 for m in meals)
    carbs = sum(m.get("carbs") or 0 for m in meals)
    fat = sum(m.get("fat") or 0 for m in meals)

    targets = {}
    if with_targets:
        prof = supabase.table("user_profiles").select("daily_caloric_target,protein_target_g,carbs_target_g,fat_target_g").limit(1).execute()
        if prof.data:
            targets = prof.data[0]

    names = ", ".join(m.get("description") or "meal" for m in meals[:6])
    state["response"] = (
        f"Today: **{cals} kcal** · P {protein}g · C {carbs}g · F {fat}g across {len(meals)} item(s) ({names})."
    )
    stats = [
        stat("Calories", str(cals), unit="kcal", caption=f"Target {targets['daily_caloric_target']}" if targets.get("daily_caloric_target") else None),
        stat("Protein", str(protein), unit="g", caption=f"Target {targets['protein_target_g']}g" if targets.get("protein_target_g") else None),
        stat("Carbs", str(carbs), unit="g", caption=f"Target {targets['carbs_target_g']}g" if targets.get("carbs_target_g") else None),
        stat("Fat", str(fat), unit="g", caption=f"Target {targets['fat_target_g']}g" if targets.get("fat_target_g") else None),
    ]
    state["ui"] = stat_grid_block("Today's macros" if with_targets else "Eaten today", stats)
    return True


def _answer_training_load(state: GraphState, user_id: str) -> bool:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    res = supabase.table("workouts").select("exercise_name,sets,created_at").eq("user_id", user_id).gte("created_at", since).execute()
    rows = res.data or []
    if not rows:
        state["response"] = "No workouts logged in the last 7 days."
        state["ui"] = stat_grid_block("Training load (7d)", [stat("Sessions", "0")])
        return True
    sessions = len({r["created_at"][:10] for r in rows})
    total_sets = sum(r.get("sets") or 0 for r in rows)
    exercises = len(rows)
    state["response"] = f"**{sessions} session(s)** in the last 7 days — {exercises} exercises, {total_sets} total sets logged."
    state["ui"] = stat_grid_block("Training load (7d)", [
        stat("Sessions", str(sessions)),
        stat("Exercises", str(exercises)),
        stat("Total sets", str(total_sets)),
    ])
    return True


def _answer_cash(state: GraphState, user_id: str) -> bool:
    prof = supabase.table("user_profiles").select("bank_balance,bank_balance_updated_at").limit(1).execute()
    if not prof.data or prof.data[0].get("bank_balance") is None:
        return False
    balance = prof.data[0]["bank_balance"]
    month_start = datetime.now(timezone.utc).strftime("%Y-%m-01")
    tx = supabase.table("transactions").select("amount").eq("user_id", user_id).gte("transaction_date", month_start).execute()
    spend = sum(abs(t["amount"]) for t in (tx.data or []) if t.get("amount") and t["amount"] < 0)
    state["response"] = f"**€{balance:,.0f}** in the bank, €{spend:,.0f} spent so far this month."
    state["ui"] = stat_grid_block("Cash", [
        stat("Balance", f"{balance:,.0f}", unit="EUR"),
        stat("Spent this month", f"{spend:,.0f}", unit="EUR"),
    ])
    return True


def _answer_portfolio(state: GraphState, user_id: str) -> bool:
    res = supabase.table("advisor_positions").select("symbol,quantity,position_value,unrealized_pnl,currency").eq("user_id", user_id).eq("status", "open").execute()
    positions = res.data or []
    if not positions:
        return False
    by_currency: dict[str, dict] = {}
    for p in positions:
        c = p.get("currency") or "USD"
        d = by_currency.setdefault(c, {"value": 0.0, "pnl": 0.0, "count": 0})
        d["value"] += p.get("position_value") or 0
        d["pnl"] += p.get("unrealized_pnl") or 0
        d["count"] += 1
    parts = [f"{v['value']:,.0f} {c} ({v['pnl']:+,.0f} P&L, {v['count']} positions)" for c, v in by_currency.items()]
    state["response"] = "Portfolio: " + "; ".join(parts) + "."
    state["ui"] = stat_grid_block("Portfolio", [
        stat(f"{c} value", f"{v['value']:,.0f}", unit=c, severity="good" if v["pnl"] >= 0 else "bad", caption=f"{v['pnl']:+,.0f} P&L · {v['count']} positions")
        for c, v in by_currency.items()
    ])
    return True


def _answer_goals(state: GraphState, user_id: str) -> bool:
    res = supabase.table("goals").select("title,status,current_value,target_value,unit").eq("user_id", user_id).eq("status", "active").execute()
    goals = res.data or []
    if not goals:
        state["response"] = "No active goals right now."
        state["ui"] = stat_grid_block("Goals", [stat("Active", "0")])
        return True
    lines = []
    stats = []
    for g in goals[:6]:
        if g.get("target_value") and g.get("current_value") is not None:
            pct = min(999, round((g["current_value"] / g["target_value"]) * 100))
            lines.append(f"{g['title']} ({pct}%)")
            stats.append(stat(g["title"], f"{pct}", unit="%"))
        else:
            lines.append(g["title"])
            stats.append(stat(g["title"], "—"))
    state["response"] = f"**{len(goals)} active goal(s)**: " + ", ".join(lines) + "."
    state["ui"] = stat_grid_block("Active goals", stats)
    return True


_HANDLERS = {
    "sleep": _answer_sleep,
    "nutrition_today": lambda s, u: _answer_nutrition(s, u, with_targets=False),
    "macros": lambda s, u: _answer_nutrition(s, u, with_targets=True),
    "training_load": _answer_training_load,
    "cash": _answer_cash,
    "portfolio": _answer_portfolio,
    "goals": _answer_goals,
}


def handle_query_text(state: GraphState) -> GraphState:
    text = state["content"]
    user_id = state.get("user_id") or ZERO_UUID

    if not supabase:
        return handle_general(state)

    raw = _classify_domain(text)
    domain = next((d for d in DOMAINS if d in raw), "none")
    handler = _HANDLERS.get(domain)
    if not handler:
        return handle_general(state)

    try:
        answered = handler(state, user_id)
    except Exception as e:
        logger.error(f"Query node error ({domain}): {e}")
        answered = False

    if not answered or not state.get("response"):
        return handle_general(state)
    return state
