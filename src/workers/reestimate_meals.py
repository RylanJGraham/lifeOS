"""Re-estimate recent meals' calories/macros using web search, with your ORIGINAL messages for portions.

Meal rows only keep a short name ("KFC Chicken Breasts with Fries and Coke"); the quantity you typed
("5 breasts") lives in the chat history, so both are given to the model together with search results.

    python workers/reestimate_meals.py --days 7                      # dry run: writes logs/reestimate_<ts>.json
    python workers/reestimate_meals.py --apply logs/reestimate_<ts>.json   # apply a reviewed file

The proposal file also holds each row's OLD values, so it doubles as the backup/undo record.
Supplements, water, coffee and tea are skipped. Changes under MIN_CHANGE_PCT are left alone.
"""
import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("reestimate_meals")

MIN_CHANGE_PCT = 8.0
SKIP = re.compile(r"supradyn|omega|magnesium|multivitamin|vitamin|supplement|zinc|creatine|\bwater\b|\bcoffee\b|\btea\b", re.I)


def is_target(row: dict) -> bool:
    """A real food worth re-estimating (not a supplement/drink with ~0 kcal)."""
    return (row.get("calories") or 0) > 20 and not SKIP.search(row.get("description") or "")


def kcal_from_macros(p: float, c: float, f: float) -> float:
    return 4 * p + 4 * c + 9 * f


def sanity(new: dict) -> str | None:
    """None if the estimate is plausible, else why it was rejected."""
    try:
        cal, p, c, f = (float(new[k]) for k in ("calories", "protein", "carbs", "fat"))
    except (KeyError, TypeError, ValueError):
        return "missing numbers"
    if min(cal, p, c, f) < 0 or cal > 5000 or cal < 5:
        return "out of range"
    if abs(kcal_from_macros(p, c, f) - cal) > 0.3 * cal:
        return "calories don't match macros"
    return None


def change_pct(old: float, new: float) -> float:
    return abs(new - old) / old * 100 if old else 100.0


def _json_object(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text or "", re.DOTALL)
    try:
        return json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        return None


def estimate(row: dict, messages_text: str, llm, search_fn, off_fn) -> dict:
    query = re.sub(r"\s+", " ", f"{row['description']} nutrition facts calories protein carbs fat")
    context = []
    try:
        off = off_fn(query)
        if off:
            context.append(off)
        web = search_fn(query)
        if web and not web.startswith(("No search results", "Web search not configured", "Yahoo search failed")):
            context.append("Web search results:\n" + web)
    except Exception as e:
        logger.warning(f"search failed for {row['description']!r}: {e}")
    search_text = "\n\n".join(context)[:3500]
    prompt = f"""Estimate the nutrition of ONE logged meal item as the user actually ate it.

Logged item: "{row['description']}" (logged for {row.get('when', '')}, type: {row.get('meal_type')})

The user's own messages (use them to find the QUANTITY/portion for this item, e.g. "5 chicken breasts", "a large pizza"):
---
{messages_text[:4000] or "(none available)"}
---

Reference data (restaurant/brand/product facts — prefer these over guessing; scale per-100g values to the portion):
---
{search_text or "(no search data)"}
---

Rules: the numbers cover the WHOLE logged item including every component in its name (sides, drinks, toppings).
Use a realistic portion for the stated quantity. Return ONLY JSON:
{{"calories": number, "protein": number, "carbs": number, "fat": number, "basis": "one short sentence: portion assumed + source (e.g. 'KFC breast 390 kcal x5 + fries + Coke')", "confidence": 0.0-1.0}}"""
    out = _json_object(llm.invoke(prompt).content) or {}
    out["used_search"] = bool(search_text)
    return out


def run(days: int, apply_file: str | None) -> str:
    from nodes.shared import supabase, llm_cloud, web_search, search_openfoodfacts

    if supabase is None or llm_cloud is None:
        raise SystemExit("Supabase or the LLM is not configured")

    if apply_file:
        return apply(supabase, apply_file)

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = supabase.table("meals").select("id,description,calories,protein,carbs,fat,meal_time,meal_type").gte("meal_time", since).order("meal_time").execute().data or []
    threads = supabase.table("chat_threads").select("messages").execute().data or []
    msgs = []
    for t in threads:
        for m in (t["messages"] if isinstance(t["messages"], list) else json.loads(t["messages"] or "[]")):
            if m.get("role") == "user" and (m.get("ts") or "") >= since:
                msgs.append(f"[{m['ts'][:10]}] {m.get('content', '')}")
    messages_text = "\n".join(msgs)

    proposals = []
    for r in rows:
        r["when"] = str(r["meal_time"])[:16]
        if not is_target(r):
            continue
        new = estimate(r, messages_text, llm_cloud, web_search, search_openfoodfacts)
        problem = sanity(new)
        old = {k: float(r[k] or 0) for k in ("calories", "protein", "carbs", "fat")}
        status = problem or ("unchanged" if change_pct(old["calories"], float(new["calories"])) < MIN_CHANGE_PCT else "change")
        proposals.append({
            "id": r["id"], "description": r["description"], "when": r["when"], "old": old,
            "new": {k: round(float(new[k]), 1) for k in ("calories", "protein", "carbs", "fat")} if not problem else None,
            "basis": new.get("basis"), "confidence": new.get("confidence"), "used_search": new.get("used_search"), "status": status,
        })
        logger.info(f"{r['description'][:40]:40} {old['calories']:>6.0f} -> {new.get('calories')} [{status}]")

    os.makedirs("../logs", exist_ok=True)
    path = f"../logs/reestimate_{datetime.now():%Y%m%d_%H%M%S}.json"
    json.dump({"created": datetime.now().isoformat(), "proposals": proposals}, open(path, "w"), indent=1)
    return path


def apply(supabase, path: str) -> str:
    data = json.load(open(path))
    n = 0
    for p in data["proposals"]:
        if p["status"] != "change" or not p.get("new"):
            continue
        supabase.table("meals").update({k: p["new"][k] for k in ("calories", "protein", "carbs", "fat")}).eq("id", p["id"]).execute()
        n += 1
    logger.info(f"Applied {n} changes from {path}")
    return f"applied {n}"


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--apply", metavar="FILE")
    a = ap.parse_args()
    print(run(a.days, a.apply))
