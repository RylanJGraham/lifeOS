"""
Market advisor worker: the in-house replacement for the removed external
"Jarvis Advisor v3" service.

Each weekday run:
  1. Revalues open positions (delegates to workers.price_refresh).
  2. Grades signals from >= SIGNAL_GRADE_DAYS ago against what actually
     happened, and rolls the results into advisor_signal_performance — the
     learning loop: past win/loss rate per (action, symbol) is fed back into
     today's prompts.
  3. Runs a small swarm of independent LLM personas over every open position
     and active watchlist candidate, each proposing BUY/SELL/HOLD/ADD/TRIM
     with a confidence and rationale.
  4. Synthesizes the swarm's votes into one advisor_signals row per symbol
     (actionable only when >= 2 personas agree; otherwise HOLD).
  5. Surfaces actionable signals as proposed advisor_orders rows. Nothing is
     ever auto-approved or auto-executed — the user acts manually (dashboard
     "Log Trade" / Telegram / mobile), same as today. This worker only
     surfaces recommendations.
  6. Writes a daily portfolio snapshot, per-position history row, and an
     HTML/JSON daily report, so the existing dashboard/mobile UI (already
     built against this schema) has something to render.
  7. On Sundays only: an extra "Scout" persona call proposes 1-5 new
     watchlist candidates.

Cadence (scripts/windows_tasks.ps1 / deploy/lifeos.cron):
    python src/workers/market_advisor.py       # Mon-Fri 3:30 PM, after IBKR sync
"""
import os
import sys
import json
import re
import logging
import time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore

load_dotenv()
logger = logging.getLogger("market_advisor")
logging.basicConfig(level=logging.INFO)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SIGNAL_GRADE_DAYS = int(os.getenv("SIGNAL_GRADE_DAYS", "5"))
ORDER_CONFIDENCE_THRESHOLD = float(os.getenv("MARKET_ADVISOR_ORDER_THRESHOLD", "0.7"))
DEFAULT_ORDER_USD = float(os.getenv("MARKET_ADVISOR_DEFAULT_ORDER_USD", "25"))
ZERO_UUID = "00000000-0000-0000-0000-000000000000"

# Fixed persona roster. Same model today (cheap + reliable on OpenRouter);
# the per-persona `model` field is the extension point for genuine model
# diversity later without touching the orchestration logic.
PERSONAS = {
    "macro": {
        "name": "Macro Strategist",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.4,
        "instructions": (
            "Weigh each symbol against the broader macro backdrop (rates, growth, sector "
            "rotation, risk appetite). You don't have live macro data feeds — reason from "
            "general knowledge of the current environment and be explicit when you're "
            "uncertain rather than inventing numbers."
        ),
    },
    "technical": {
        "name": "Technical Analyst",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.4,
        "instructions": (
            "Judge each symbol primarily on the price/P&L data given: how far it has moved "
            "from the user's average cost, whether that looks like healthy momentum or an "
            "overextended move needing a pullback."
        ),
    },
    "risk": {
        "name": "Risk Manager",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.2,
        "instructions": (
            "Prioritize capital preservation and concentration risk. Flag SELL/TRIM on "
            "anything that looks overextended or oversized relative to the rest of the "
            "portfolio. Default to HOLD when nothing looks genuinely risky — don't manufacture "
            "urgency."
        ),
    },
    "contrarian": {
        "name": "Contrarian",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.6,
        "instructions": (
            "Actively look for where the obvious read is wrong — is a loser actually a "
            "buying opportunity, or a winner actually crowded and due for profit-taking? "
            "Disagree with consensus when you have a real reason to, not for its own sake."
        ),
    },
}

ACTIONABLE = {"BUY", "SELL", "ADD", "TRIM"}


def _get_supabase() -> Optional["Client"]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key or not create_client:
        logger.error("Supabase not configured or client unavailable")
        return None
    return create_client(url, key)


def _resolve_user_id(sb) -> str:
    # Prefer whoever actually owns advisor_positions data over user_profiles:
    # this repo's single user_profiles row currently holds ZERO_UUID, while
    # all real advisor_* rows (written by ibkr_flex_sync.py / historical
    # Jarvis data) use a separate real user_id. ibkr_flex_sync.py's own
    # _resolve_user_id has the same ZERO_UUID fallback hardcoded to that real
    # id for the same reason — match it here so market_advisor.py's writes
    # land on the same account as the positions it's analyzing.
    try:
        res = sb.table("advisor_positions").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Could not resolve user_id from advisor_positions: {e}")
    try:
        res = sb.table("user_profiles").select("user_id").neq("user_id", ZERO_UUID).limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Could not resolve user_id from user_profiles: {e}")
    return "63d7792f-65b1-4c5e-85f7-91c3377c7922"


def _persona_client(cfg: dict):
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=cfg["model"],
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        temperature=cfg.get("temperature", 0.3),
    )


def _extract_json(raw: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON from LLM reply: {e}")
        return None


# ---------------------------------------------------------------------------
# Data fetch
# ---------------------------------------------------------------------------

def fetch_open_positions(sb, user_id: str) -> list:
    res = (
        sb.table("advisor_positions")
        .select("id, symbol, quantity, average_cost, current_price, position_value, "
                "unrealized_pnl_pct, currency, asset_class, sector")
        .eq("user_id", user_id).eq("status", "open").execute()
    )
    return res.data or []


def fetch_active_watchlist(sb, user_id: str) -> list:
    res = (
        sb.table("advisor_watchlist")
        .select("symbol, category, thesis, interest_state, conviction_score, signal_count")
        .eq("user_id", user_id).neq("interest_state", "dropped").execute()
    )
    return res.data or []


def fetch_performance_summary(sb, user_id: str) -> str:
    try:
        res = sb.table("advisor_signal_performance").select("*").execute()
        rows = res.data or []
    except Exception as e:
        logger.warning(f"Could not fetch signal performance: {e}")
        rows = []
    if not rows:
        return "No graded signal history yet — this is early days, weight your own reasoning fully."
    lines = ["Past signal performance (action/symbol -> win rate, from this advisor's own prior calls):"]
    for r in sorted(rows, key=lambda r: -(r.get("total_signals") or 0))[:20]:
        lines.append(
            f"  - {r.get('action')} {r.get('symbol')}: {r.get('wins', 0)}W/{r.get('losses', 0)}L "
            f"({float(r.get('win_rate') or 0):.0%} over {r.get('total_signals', 0)} signals)"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Step 2: grade past signals (the learning loop)
# ---------------------------------------------------------------------------

def grade_past_signals(sb, user_id: str, positions_by_symbol: dict):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=SIGNAL_GRADE_DAYS)).isoformat()
    try:
        res = (
            sb.table("advisor_signals")
            .select("id, symbol, action, generated_at, price_target")
            .eq("user_id", user_id).is_("outcome", "null")
            .lt("generated_at", cutoff).execute()
        )
        pending = res.data or []
    except Exception as e:
        logger.warning(f"Could not fetch signals to grade: {e}")
        return

    if not pending:
        logger.info("No signals old enough to grade")
        return

    from workers.price_refresh import _finnhub_quote  # reuse existing quote source

    rollups: dict = {}
    for sig in pending:
        symbol = sig["symbol"]
        action = (sig.get("action") or "HOLD").upper()
        pos = positions_by_symbol.get(symbol)
        current_price = float(pos["current_price"]) if pos and pos.get("current_price") else None
        if current_price is None:
            current_price = _finnhub_quote(symbol)
            time.sleep(1.1)
        if current_price is None:
            continue

        price_target = sig.get("price_target")
        direction_up = action in ("BUY", "ADD")
        if action in ("BUY", "ADD", "SELL", "TRIM") and price_target:
            hit_target = (current_price >= float(price_target)) if direction_up else (current_price <= float(price_target))
            outcome = "win" if hit_target else "loss"
        else:
            outcome = "neutral"

        try:
            sb.table("advisor_signals").update({
                "outcome": outcome,
                "outcome_price": current_price,
                "outcome_time": datetime.now(timezone.utc).isoformat(),
            }).eq("id", sig["id"]).execute()
        except Exception as e:
            logger.error(f"Failed to write outcome for signal {sig['id']}: {e}")
            continue

        key = (action, symbol)
        rollups.setdefault(key, {"wins": 0, "losses": 0, "total": 0})
        rollups[key]["total"] += 1
        if outcome == "win":
            rollups[key]["wins"] += 1
        elif outcome == "loss":
            rollups[key]["losses"] += 1

    for (action, symbol), counts in rollups.items():
        try:
            existing = (
                sb.table("advisor_signal_performance")
                .select("*").eq("action", action).eq("symbol", symbol).limit(1).execute()
            )
            total = counts["total"] + (existing.data[0]["total_signals"] if existing.data else 0)
            wins = counts["wins"] + (existing.data[0]["wins"] if existing.data else 0)
            losses = counts["losses"] + (existing.data[0]["losses"] if existing.data else 0)
            payload = {
                "action": action, "symbol": symbol,
                "total_signals": total, "wins": wins, "losses": losses,
                "win_rate": round(wins / total, 4) if total else 0,
            }
            if existing.data:
                sb.table("advisor_signal_performance").update(payload).eq("action", action).eq("symbol", symbol).execute()
            else:
                sb.table("advisor_signal_performance").insert(payload).execute()
        except Exception as e:
            logger.error(f"Failed to roll up performance for {action}/{symbol}: {e}")

    logger.info(f"Graded {len(pending)} past signals across {len(rollups)} action/symbol pairs")


# ---------------------------------------------------------------------------
# Step 3-4: build context, run the swarm
# ---------------------------------------------------------------------------

def build_context(positions: list, watchlist: list, performance_summary: str) -> str:
    lines = ["OPEN POSITIONS (the user's current holdings):"]
    total_value = sum(float(p.get("position_value") or 0) for p in positions) or 1.0
    for p in positions:
        weight = (float(p.get("position_value") or 0) / total_value) * 100
        lines.append(
            f"  - {p['symbol']}: qty {p.get('quantity')}, avg cost {p.get('average_cost')}, "
            f"current {p.get('current_price')}, P&L {float(p.get('unrealized_pnl_pct') or 0):.1f}%, "
            f"{weight:.1f}% of portfolio, sector {p.get('sector') or 'unknown'}"
        )
    if not positions:
        lines.append("  (none)")

    lines.append("\nWATCHLIST CANDIDATES (not currently held, under evaluation):")
    for w in watchlist:
        lines.append(
            f"  - {w['symbol']}: state={w.get('interest_state')}, conviction={w.get('conviction_score')}, "
            f"thesis: {w.get('thesis') or 'none recorded'}"
        )
    if not watchlist:
        lines.append("  (none)")

    lines.append(f"\n{performance_summary}")
    return "\n".join(lines)


def run_persona(persona_key: str, context: str) -> list:
    from langchain_core.messages import HumanMessage

    cfg = PERSONAS[persona_key]
    llm = _persona_client(cfg)
    prompt = f"""You are the {cfg['name']} on a small investment advisory swarm reviewing a personal portfolio.

{cfg['instructions']}

{context}

For EVERY symbol listed above (both positions and watchlist candidates), give your opinion.
Use HOLD for positions you have no strong view on. Watchlist candidates can only be BUY or HOLD
(never SELL/TRIM — they aren't held). Held positions can be BUY, ADD, HOLD, TRIM, or SELL.

Return ONLY valid JSON:
{{"signals": [
  {{"symbol": "...", "action": "BUY|ADD|HOLD|TRIM|SELL", "confidence": 0.0-1.0,
    "reasoning": "one sentence", "price_target": number or null, "stop_loss": number or null}}
]}}"""

    try:
        raw = llm.invoke([HumanMessage(content=prompt)]).content
        data = _extract_json(raw)
        if not data or not isinstance(data.get("signals"), list):
            logger.warning(f"{persona_key}: no usable signals in reply")
            return []
        return data["signals"]
    except Exception as e:
        logger.error(f"{persona_key}: LLM call failed: {e}")
        return []


def run_swarm(context: str) -> dict:
    results = {}
    with ThreadPoolExecutor(max_workers=len(PERSONAS)) as pool:
        futures = {pool.submit(run_persona, key, context): key for key in PERSONAS}
        for future in as_completed(futures):
            key = futures[future]
            results[key] = future.result()
    return results


# ---------------------------------------------------------------------------
# Step 5: synthesize swarm votes into advisor_signals rows
# ---------------------------------------------------------------------------

def synthesize(swarm_results: dict, positions_by_symbol: dict, cycle_id: str) -> list:
    by_symbol: dict = {}
    for persona_key, signals in swarm_results.items():
        for sig in signals:
            symbol = (sig.get("symbol") or "").strip().upper()
            if not symbol:
                continue
            by_symbol.setdefault(symbol, []).append((persona_key, sig))

    synthesized = []
    for symbol, votes in by_symbol.items():
        action_counts: dict = {}
        for _, sig in votes:
            action = (sig.get("action") or "HOLD").upper()
            action_counts.setdefault(action, []).append(sig)

        winning_action, winning_votes = max(action_counts.items(), key=lambda kv: len(kv[1]))
        if winning_action == "HOLD" or len(winning_votes) < 2:
            final_action = "HOLD"
            agreeing = [sig for _, sig in votes]
        else:
            final_action = winning_action
            agreeing = winning_votes

        agreeing_personas = [pk for pk, sig in votes if sig in agreeing]
        confidences = [float(s.get("confidence") or 0) for s in agreeing if s.get("confidence") is not None]
        reasonings = [s.get("reasoning") for s in agreeing if s.get("reasoning")]
        price_targets = [float(s["price_target"]) for s in agreeing if s.get("price_target")]
        stop_losses = [float(s["stop_loss"]) for s in agreeing if s.get("stop_loss")]

        synthesized.append({
            "symbol": symbol,
            "action": final_action,
            "confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
            "swarm_agents": agreeing_personas,
            "swarm_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
            "reasoning": " | ".join(reasonings[:3]) if reasonings else None,
            "price_target": round(sum(price_targets) / len(price_targets), 4) if price_targets else None,
            "stop_loss": round(sum(stop_losses) / len(stop_losses), 4) if stop_losses else None,
            "position_id": positions_by_symbol.get(symbol, {}).get("id"),
            "cycle_id": cycle_id,
        })
    return synthesized


def write_signals(sb, user_id: str, signals: list):
    written = []
    for sig in signals:
        try:
            existing = (
                sb.table("advisor_signals").select("id")
                .eq("user_id", user_id).eq("symbol", sig["symbol"]).eq("cycle_id", sig["cycle_id"])
                .limit(1).execute()
            )
            payload = {
                "user_id": user_id,
                "symbol": sig["symbol"],
                "action": sig["action"],
                "confidence": sig["confidence"],
                "swarm_agents": sig["swarm_agents"],
                "swarm_confidence": sig["swarm_confidence"],
                "reasoning": sig["reasoning"],
                "price_target": sig["price_target"],
                "stop_loss": sig["stop_loss"],
                "position_id": sig["position_id"],
                "cycle_id": sig["cycle_id"],
                "signal_type": "position" if sig["position_id"] else "discovery",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "executed": False,
            }
            if existing.data:
                row_id = existing.data[0]["id"]
                sb.table("advisor_signals").update(payload).eq("id", row_id).execute()
            else:
                row = sb.table("advisor_signals").insert(payload).execute()
                row_id = row.data[0]["id"] if row.data else None
            written.append({**sig, "id": row_id})
        except Exception as e:
            logger.error(f"Failed to write signal for {sig['symbol']}: {e}")
    return written


# ---------------------------------------------------------------------------
# Step 6: surface actionable signals as proposed orders (never executed)
# ---------------------------------------------------------------------------

def propose_orders(sb, user_id: str, signals: list, positions_by_symbol: dict, cycle_id: str):
    for sig in signals:
        action = sig["action"]
        confidence = sig.get("confidence") or 0
        if action not in ACTIONABLE or confidence < ORDER_CONFIDENCE_THRESHOLD:
            continue
        try:
            already = (
                sb.table("advisor_orders").select("id")
                .eq("linked_signal_id", sig.get("id")).limit(1).execute()
            )
            if already.data:
                continue

            pos = positions_by_symbol.get(sig["symbol"])
            price = float(pos["current_price"]) if pos and pos.get("current_price") else sig.get("price_target")
            if action in ("SELL",):
                quantity = float(pos["quantity"]) if pos else 0
            elif action == "TRIM":
                quantity = float(pos["quantity"]) / 2 if pos else 0
            else:  # BUY / ADD
                quantity = round(DEFAULT_ORDER_USD / price, 4) if price else 0

            if quantity <= 0:
                continue

            sb.table("advisor_orders").insert({
                "user_id": user_id,
                "symbol": sig["symbol"],
                "action": action,
                "order_type": "MARKET",
                "quantity": quantity,
                "tif": "DAY",
                "currency": (pos or {}).get("currency") or "USD",
                "rationale": sig.get("reasoning"),
                "confidence": confidence,
                "source": "market_advisor",
                "status": "proposed",
                "cycle_id": cycle_id,
                "linked_signal_id": sig.get("id"),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as e:
            logger.error(f"Failed to propose order for {sig['symbol']}: {e}")


# ---------------------------------------------------------------------------
# Step 7: portfolio snapshot, position history, daily report
# ---------------------------------------------------------------------------

def write_portfolio_snapshot(sb, user_id: str, positions: list, risk_policy: dict):
    today = datetime.now(timezone.utc).date().isoformat()
    total_value = sum(float(p.get("position_value") or 0) for p in positions)
    unrealized_pnl = sum(
        (float(p.get("current_price") or 0) - float(p.get("average_cost") or 0)) * float(p.get("quantity") or 0)
        for p in positions
    )

    exposure_sector: dict = {}
    for p in positions:
        sector = p.get("sector") or "Unknown"
        exposure_sector[sector] = exposure_sector.get(sector, 0) + float(p.get("position_value") or 0)
    if total_value:
        exposure_sector = {k: round(v / total_value * 100, 1) for k, v in exposure_sector.items()}

    risk_flags = []
    max_position_pct = float(risk_policy.get("max_position_pct", 15))
    max_sector_pct = float(risk_policy.get("max_sector_pct", 40))
    if total_value:
        for p in positions:
            weight = float(p.get("position_value") or 0) / total_value * 100
            if weight > max_position_pct:
                risk_flags.append(f"{p['symbol']} is {weight:.0f}% of portfolio (limit {max_position_pct:.0f}%)")
        for sector, pct in exposure_sector.items():
            if pct > max_sector_pct:
                risk_flags.append(f"{sector} sector is {pct:.0f}% of portfolio (limit {max_sector_pct:.0f}%)")

    try:
        existing = (
            sb.table("advisor_portfolio_snapshots").select("*")
            .eq("user_id", user_id).eq("record_date", today).limit(1).execute()
        )
        prev_total = float(existing.data[0]["total_value"]) if existing.data and existing.data[0].get("total_value") else None
        payload = {
            "user_id": user_id,
            "record_date": today,
            "total_value": round(total_value, 2),
            "total_return_pct": round(((total_value / prev_total) - 1) * 100, 4) if prev_total else 0,
            "unrealized_pnl": round(unrealized_pnl, 2),
            "open_positions": len(positions),
            "exposure_sector": exposure_sector,
            "risk_flags": risk_flags,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing.data:
            sb.table("advisor_portfolio_snapshots").update(payload).eq("id", existing.data[0]["id"]).execute()
        else:
            sb.table("advisor_portfolio_snapshots").insert(payload).execute()
    except Exception as e:
        logger.error(f"Failed to write portfolio snapshot: {e}")


def write_position_history(sb, user_id: str, positions: list):
    today = datetime.now(timezone.utc).date().isoformat()
    total_value = sum(float(p.get("position_value") or 0) for p in positions) or 1.0
    for p in positions:
        try:
            existing = (
                sb.table("advisor_position_history").select("id")
                .eq("user_id", user_id).eq("symbol", p["symbol"]).eq("record_date", today)
                .limit(1).execute()
            )
            payload = {
                "user_id": user_id,
                "symbol": p["symbol"],
                "record_date": today,
                "quantity": p.get("quantity") or 0,
                "price": p.get("current_price") or 0,
                "unrealized_pnl": round(
                    (float(p.get("current_price") or 0) - float(p.get("average_cost") or 0)) * float(p.get("quantity") or 0), 4
                ),
                "unrealized_pnl_pct": p.get("unrealized_pnl_pct") or 0,
                "position_value": p.get("position_value") or 0,
                "portfolio_weight": round(float(p.get("position_value") or 0) / total_value * 100, 2),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
            if existing.data:
                sb.table("advisor_position_history").update(payload).eq("id", existing.data[0]["id"]).execute()
            else:
                sb.table("advisor_position_history").insert(payload).execute()
        except Exception as e:
            logger.error(f"Failed to write position history for {p['symbol']}: {e}")


def write_daily_report(sb, user_id: str, signals: list, orders_proposed: int, positions: list):
    today = datetime.now(timezone.utc).date().isoformat()
    total_value = sum(float(p.get("position_value") or 0) for p in positions)
    actionable = [s for s in signals if s["action"] != "HOLD"]

    html_rows = "".join(
        f"<li><b>{s['action']}</b> {s['symbol']} (confidence {s.get('confidence') or 0:.0%}) — {s.get('reasoning') or ''}</li>"
        for s in actionable
    ) or "<li>No actionable signals today — everything held.</li>"
    html_content = f"""<html><body>
<h2>Market Advisor — {today}</h2>
<p>Portfolio value: {total_value:.2f} | Open positions: {len(positions)} | Orders proposed: {orders_proposed}</p>
<ul>{html_rows}</ul>
</body></html>"""

    json_content = {
        "signals_generated": len(signals),
        "actionable_signals": [{"symbol": s["symbol"], "action": s["action"], "confidence": s.get("confidence")} for s in actionable],
        "orders_proposed": orders_proposed,
        "portfolio_value": total_value,
    }

    try:
        existing = (
            sb.table("advisor_daily_reports").select("id")
            .eq("user_id", user_id).eq("report_date", today).limit(1).execute()
        )
        payload = {
            "user_id": user_id,
            "report_date": today,
            "title": f"Market Advisor Daily — {today}",
            "report_type": "daily",
            "status": "final",
            "portfolio_value": round(total_value, 2),
            "html_content": html_content,
            "json_content": json_content,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing.data:
            sb.table("advisor_daily_reports").update(payload).eq("id", existing.data[0]["id"]).execute()
        else:
            sb.table("advisor_daily_reports").insert(payload).execute()
    except Exception as e:
        logger.error(f"Failed to write daily report: {e}")


# ---------------------------------------------------------------------------
# Step 8: weekly discovery (Sundays only)
# ---------------------------------------------------------------------------

def run_weekly_discovery(sb, user_id: str, positions: list, watchlist: list):
    from langchain_core.messages import HumanMessage

    held_symbols = {p["symbol"] for p in positions}
    watchlist_symbols = {w["symbol"] for w in watchlist}
    sectors = sorted({p.get("sector") for p in positions if p.get("sector")})

    cfg = {"model": "openai/gpt-4o-mini", "temperature": 0.6}
    llm = _persona_client(cfg)
    prompt = f"""You are "Scout" on a small investment advisory swarm. The user holds: {', '.join(held_symbols) or 'nothing yet'}
(sectors: {', '.join(sectors) or 'none'}). Already-tracked watchlist candidates: {', '.join(watchlist_symbols) or 'none'}.

Propose 1-5 NEW candidate symbols worth tracking (not already held or watchlisted) that would
diversify or strengthen this portfolio. Be specific and brief.

Return ONLY valid JSON:
{{"candidates": [{{"symbol": "...", "category": "stock|etf|crypto", "thesis": "one sentence"}}]}}"""

    try:
        raw = llm.invoke([HumanMessage(content=prompt)]).content
        data = _extract_json(raw)
        candidates = data.get("candidates") if data else None
    except Exception as e:
        logger.error(f"Weekly discovery LLM call failed: {e}")
        return

    if not candidates:
        logger.info("Weekly discovery: no new candidates returned")
        return

    for c in candidates[:5]:
        symbol = (c.get("symbol") or "").strip().upper()
        if not symbol or symbol in held_symbols or symbol in watchlist_symbols:
            continue
        try:
            existing = (
                sb.table("advisor_watchlist").select("id")
                .eq("user_id", user_id).eq("symbol", symbol).limit(1).execute()
            )
            if existing.data:
                continue
            sb.table("advisor_watchlist").insert({
                "user_id": user_id,
                "symbol": symbol,
                "category": c.get("category") or "stock",
                "thesis": c.get("thesis"),
                "interest_state": "scouting",
                "conviction_score": 0,
                "in_portfolio": False,
                "tracking_since": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            logger.info(f"Weekly discovery: added {symbol} to watchlist")
        except Exception as e:
            logger.error(f"Failed to add discovery candidate {symbol}: {e}")


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def run(user_id: str | None = None):
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)")
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    resolved_user_id = user_id or _resolve_user_id(sb)
    cycle_id = f"ma-{datetime.now(timezone.utc).date().isoformat()}"

    try:
        from workers.price_refresh import run as run_price_refresh
        run_price_refresh(resolved_user_id)
    except Exception as e:
        logger.warning(f"Price refresh step failed (continuing): {e}")

    positions = fetch_open_positions(sb, resolved_user_id)
    positions_by_symbol = {p["symbol"]: p for p in positions}

    try:
        grade_past_signals(sb, resolved_user_id, positions_by_symbol)
    except Exception as e:
        logger.error(f"Signal grading step failed (continuing): {e}")

    watchlist = fetch_active_watchlist(sb, resolved_user_id)
    performance_summary = fetch_performance_summary(sb, resolved_user_id)
    context = build_context(positions, watchlist, performance_summary)

    logger.info(f"Running swarm over {len(positions)} positions + {len(watchlist)} watchlist candidates")
    swarm_results = run_swarm(context)

    synthesized = synthesize(swarm_results, positions_by_symbol, cycle_id)
    signals = write_signals(sb, resolved_user_id, synthesized)

    propose_orders(sb, resolved_user_id, signals, positions_by_symbol, cycle_id)
    orders_proposed = sum(1 for s in signals if s["action"] in ACTIONABLE and (s.get("confidence") or 0) >= ORDER_CONFIDENCE_THRESHOLD)

    try:
        risk_policy = sb.table("user_profiles").select("risk_policy").limit(1).execute()
        policy = (risk_policy.data[0].get("risk_policy") if risk_policy.data else None) or {}
    except Exception:
        policy = {}
    write_portfolio_snapshot(sb, resolved_user_id, positions, policy)
    write_position_history(sb, resolved_user_id, positions)
    write_daily_report(sb, resolved_user_id, signals, orders_proposed, positions)

    if datetime.now(timezone.utc).weekday() == 6:  # Sunday
        logger.info("Running weekly discovery scan")
        run_weekly_discovery(sb, resolved_user_id, positions, watchlist)

    logger.info(f"Market advisor run complete: {len(signals)} signals, {orders_proposed} orders proposed")


if __name__ == "__main__":
    run()
