import os
import json
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import TypedDict, Optional
import concurrent.futures

from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("langgraph_pipeline")

try:
    from supabase import create_client, Client
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None
except Exception as e:
    logger.error(f"Could not initialize Supabase: {e}")
    supabase = None


class GraphState(TypedDict):
    input_type: str  # "text", "image", "multi_image", "pdf"
    content: str  # raw text, base64 image, JSON list of images, or pdf text
    images: Optional[list[str]]  # one or more base64 images (used by vision nodes)
    response: Optional[str]
    ui: Optional[dict]  # optional structured block for UI clients — see nodes/ui_blocks.py
    caption: Optional[str]  # optional user text accompanying an image
    date_override: Optional[str]  # YYYY-MM-DD override for catch-up screenshots
    user_id: Optional[str]  # Supabase user id; ZERO_UUID fallback is allowed
    thread_source: Optional[str]  # 'telegram' | 'web'
    thread_external_id: Optional[str]  # telegram chat_id or web session id
    dry_run: Optional[bool]  # if true, parse but do not persist (preview mode)


ZERO_UUID = "00000000-0000-0000-0000-000000000000"


# Timeout wrapper for heavy Supabase queries. Uses a thread so it works on
# Windows (which lacks signal.SIGALRM). Callers receive the same APIResponse.
def _supabase_execute_with_timeout(query_builder, timeout: float = 15.0):
    """Run a Supabase .execute() call with a hard timeout.

    Raises concurrent.futures.TimeoutError on timeout; otherwise returns the
    APIResponse from query_builder.execute().
    """
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(query_builder.execute)
            return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        logger.warning(f"Supabase query timed out after {timeout}s")
        raise


# Cloud Model (OpenRouter) for complex routing and vision
openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
llm_cloud = ChatOpenAI(
    model="openai/gpt-4o",  # Using GPT-4o for high capability
    api_key=openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.0
) if openrouter_api_key else None

llm_fast = ChatOpenAI(
    model="openai/gpt-4o-mini",  # Fast model for routing
    api_key=openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.0
) if openrouter_api_key else None


def _upsert_position_from_trade(
    user_id: str,
    symbol: str,
    action: str,
    qty: float,
    price: float,
    fees: float,
    currency: str,
    reason: str | None = None
) -> bool:
    """Update or create an advisor_positions row from a manual trade.

    Delegates to the shared helper in db.positions so manual trades, IBKR sync,
    and dashboard orders all use the same position math.
    """
    from db.positions import update_position_from_fill
    if not supabase:
        logger.error("Supabase not available; cannot update position.")
        return False

    result = update_position_from_fill(
        supabase=supabase,
        user_id=user_id,
        symbol=symbol,
        action=action,
        qty=qty,
        price=price,
        fees=fees,
        currency=currency,
        source="manual",
        asset_class=None,
        reason=reason,
    )
    return result is not None


def _format_snippets(snippets: list[str]) -> str:
    if snippets:
        return "\n\n".join(snippets[:4])
    return ""


def _brave_search(query: str, api_key: str) -> str:
    import httpx
    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
    }
    params = {"q": query, "count": 4}
    resp = httpx.get(url, params=params, headers=headers, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("web", {}).get("results", [])
    snippets = [f"{r.get('title', '')}: {r.get('description', '')}".strip(": ") for r in results]
    return _format_snippets(snippets)


def _bing_search(query: str, api_key: str) -> str:
    import httpx
    url = "https://api.bing.microsoft.com/v7.0/search"
    headers = {"Ocp-Apim-Subscription-Key": api_key}
    params = {"q": query, "count": 4}
    resp = httpx.get(url, params=params, headers=headers, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("webPages", {}).get("value", [])
    snippets = [f"{r.get('name', '')}: {r.get('snippet', '')}".strip(": ") for r in results]
    return _format_snippets(snippets)


def _serper_search(query: str, api_key: str) -> str:
    import httpx
    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json",
    }
    payload = {"q": query, "num": 4}
    resp = httpx.post(url, json=payload, headers=headers, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("organic", [])
    snippets = [f"{r.get('title', '')}: {r.get('snippet', '')}".strip(": ") for r in results]
    return _format_snippets(snippets)


def web_search(query: str) -> str:
    """Search the web using configured search APIs, in preferred order.

    Tries Brave -> Bing -> Serper.dev, then falls back gracefully.
    """
    logger.info(f"Performing web search for: '{query}'")

    brave_key = os.getenv("BRAVE_API_KEY")
    if brave_key:
        try:
            result = _brave_search(query, brave_key)
            if result:
                logger.info("Web search success via Brave Search.")
                return result
        except Exception as e:
            logger.warning(f"Brave Search failed: {e}")

    bing_key = os.getenv("BING_SEARCH_API_KEY")
    if bing_key:
        try:
            result = _bing_search(query, bing_key)
            if result:
                logger.info("Web search success via Bing Search.")
                return result
        except Exception as e:
            logger.warning(f"Bing Search failed: {e}")

    serper_key = os.getenv("SERPER_API_KEY")
    if serper_key:
        try:
            result = _serper_search(query, serper_key)
            if result:
                logger.info("Web search success via Serper.dev.")
                return result
        except Exception as e:
            logger.warning(f"Serper.dev search failed: {e}")

    logger.info("Web search not configured: no search API key available.")
    return "Web search not configured."


# 100% Daily Value reference for an adult male (19-50). Used by the nutrition
# extraction prompts to convert mg/mcg amounts into %DV. Keep in sync with the
# copy inside the image-nutrition prompt (plain string, can't interpolate).
MICRO_DV_GUIDE = """Use this Reference Conversion Guide for 100% Daily Value (adult male 19-50):
* Vitamin A: 900 mcg RAE = 100% DV
* Vitamin C: 90 mg = 100% DV
* Vitamin D: 15 mcg (600 IU) = 100% DV
* Vitamin E: 15 mg = 100% DV
* Vitamin K: 120 mcg = 100% DV
* Vitamin B6: 1.3 mg = 100% DV
* Vitamin B12: 2.4 mcg = 100% DV
* Biotin: 30 mcg = 100% DV
* Folate (folic acid): 400 mcg DFE = 100% DV
* Calcium: 1000 mg = 100% DV
* Iron: 8 mg = 100% DV (so 8 mg = 100)
* Magnesium: 400 mg = 100% DV (so 80 mg = 20, NOT 80!)
* Zinc: 11 mg = 100% DV (so 11 mg = 100)
* Selenium: 55 mcg = 100% DV
* Iodine: 150 mcg = 100% DV
* Copper: 0.9 mg = 100% DV
* Manganese: 2.3 mg = 100% DV
* Phosphorus: 700 mg = 100% DV
* Omega-3 (EPA+DHA): 1000 mg = 100% DV
* Potassium: 3400 mg = 100% DV (but potassium_mg outputs raw mg, not a %)
* Sodium: 2300 mg = upper LIMIT, not a goal (sodium_mg outputs raw mg, not a %)"""

# Micronutrients worth extracting from OpenFoodFacts nutriments (key, label).
# Values come with a sibling "<key>_unit" field (mg/µg/g) that we pass through
# so the LLM can convert to %DV.
OFF_MICRO_FIELDS = [
    ("vitamin-d", "vitamin D"), ("vitamin-b12", "vitamin B12"),
    ("vitamin-c", "vitamin C"), ("vitamin-a", "vitamin A"),
    ("vitamin-e", "vitamin E"), ("vitamin-b6", "vitamin B6"),
    ("iron", "iron"), ("magnesium", "magnesium"), ("zinc", "zinc"),
    ("calcium", "calcium"), ("potassium", "potassium"),
    ("selenium", "selenium"), ("iodine", "iodine"),
]


def fetch_openfoodfacts_by_barcode(barcode: str) -> dict | None:
    """Fetch a single product by barcode from OpenFoodFacts. Returns nutriments
    dict or None if not found / no nutrition data."""
    import httpx
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    contact = os.getenv("OFF_CONTACT_EMAIL", "personal use, no bulk traffic")
    headers = {"User-Agent": f"LifeOS/1.0 ({contact})"}
    try:
        resp = httpx.get(url, headers=headers, timeout=8.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") != 1:
            return None
        return data.get("product") or None
    except Exception as e:
        logger.warning(f"OpenFoodFacts barcode lookup failed for {barcode}: {e}")
        return None


def search_openfoodfacts(query: str, limit: int = 3) -> str:
    """Query the OpenFoodFacts v2 search API (no key needed) and return a
    compact text block of structured nutriments for the top matches.
    Returns "" when nothing usable is found (caller falls back to web search).

    OFF rate limits (10 search req/min/IP) and returns 503 when their global
    crawl limiter trips — so retry once with a short backoff before giving up.
    """
    import time
    import httpx
    url = "https://world.openfoodfacts.org/api/v2/search"
    params = {
        "search_terms": query,
        "fields": "product_name,brands,serving_size,nutriments",
        "page_size": limit,
        "json": 1,
    }
    # OFF asks for AppName/Version (contact) so they don't mistake us for a bot
    contact = os.getenv("OFF_CONTACT_EMAIL", "personal use, no bulk traffic")
    headers = {"User-Agent": f"LifeOS/1.0 ({contact})"}
    logger.info(f"Querying OpenFoodFacts for: '{query}'")
    resp = None
    for attempt in range(2):
        try:
            resp = httpx.get(url, params=params, headers=headers, timeout=8.0)
            if resp.status_code == 200:
                break
            logger.warning(f"OpenFoodFacts returned status {resp.status_code}")
        except Exception as e:
            logger.error(f"OpenFoodFacts query failed: {e}")
        if attempt == 0:
            time.sleep(3)
    if resp is None or resp.status_code != 200:
        return ""
    try:
        products = resp.json().get("products") or []
        blocks = []
        for p in products:
            n = p.get("nutriments") or {}
            kcal = n.get("energy-kcal_100g")
            if kcal is None:
                continue  # no nutrition data — useless match
            name = p.get("product_name") or "Unknown"
            brand = p.get("brands") or ""
            serving = p.get("serving_size") or "unknown"
            def g(key):
                v = n.get(f"{key}_100g")
                return f"{v:g}" if isinstance(v, (int, float)) else "?"
            block = (
                f"- {name} ({brand}), serving size {serving}. Per 100g: "
                f"{kcal:g} kcal, P {g('proteins')}g, C {g('carbohydrates')}g, "
                f"F {g('fat')}g, fiber {g('fiber')}g, sugars {g('sugars')}g, "
                f"sodium {g('sodium')}g."
            )
            sk = n.get("energy-kcal_serving")
            if isinstance(sk, (int, float)):
                block += f" Per serving: {sk:g} kcal."
            micros = []
            for key, label in OFF_MICRO_FIELDS:
                v = n.get(f"{key}_100g")
                if isinstance(v, (int, float)) and v > 0:
                    unit = n.get(f"{key}_unit") or "mg"
                    micros.append(f"{label} {v:g}{unit}")
            if micros:
                block += " Micros per 100g: " + ", ".join(micros) + "."
            blocks.append(block)
        if blocks:
            logger.info(f"OpenFoodFacts: {len(blocks)} product(s) with nutrition data.")
            return "OpenFoodFacts database matches (structured, authoritative for packaged foods — scale per-100g values to the portion eaten):\n" + "\n".join(blocks)
        logger.info("OpenFoodFacts: no products with nutrition data.")
        return ""
    except Exception as e:
        logger.error(f"OpenFoodFacts query failed: {e}")
        return ""


def check_supplement_overrides(text: str, m: dict) -> dict:
    t_lower = text.lower()
    if "supradyn" in t_lower:
        m["sufficient_data"] = True
        override = {
            "meal_name": "Supradyn Multivitamin",
            "calories": 0, "protein": 0, "carbs": 0, "fats": 0,
            "fiber": 0, "sugar": 0,
            "micronutrients": {
                "vitamin_d_dv_pct": 100,
                "omega_3_dv_pct": 0,
                "magnesium_dv_pct": 21,  # 80mg Magnesium is ~21% of 380mg daily value
                "zinc_dv_pct": 100,      # 10mg Zinc is 100% DV
                "b12_dv_pct": 100,       # 2.5mcg B12 is 100% DV
                "iron_dv_pct": 100,      # 14mg Iron is 100% DV
                "sodium_mg": 0,
                "potassium_mg": 0
            },
            "ai_analysis": "Supradyn multivitamin providing 100% DV of essential vitamins, 10mg Zinc, 14mg Iron, and 80mg Magnesium to support daily energy and micronutrient requirements."
        }
        # The extraction result carries items in m["items"] — patch those,
        # not the top level, so the insert loop actually sees the override.
        if isinstance(m.get("items"), list) and m["items"]:
            m["items"][0].update(override)
        else:
            m.update(override)
    return m


def _resolve_day_reference(ref: str):
    """Resolve a raw day reference ('monday', 'yesterday', '2026-07-13') to an
    ISO timestamp. Weekday names map to their most recent past occurrence.
    Returns None if unparseable. Never trust an LLM to do this date math."""
    now = datetime.now().astimezone()
    ref = ref.strip().lower()
    day = None
    if ref == "today":
        day = now.date()
    elif ref == "yesterday":
        day = (now - timedelta(days=1)).date()
    else:
        weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for i, name in enumerate(weekdays):
            if name in ref:
                delta = (now.weekday() - i) % 7
                if delta == 0:
                    delta = 7  # "on friday" said on a friday means last friday
                day = (now - timedelta(days=delta)).date()
                break
        if day is None:
            try:
                day = datetime.fromisoformat(ref[:10]).date()
            except (ValueError, TypeError):
                pass
        if day is None:
            # Month-name dates: "august 10", "10th august", "the tenth of august".
            tokens = [t.strip(".,") for t in ref.replace(",", " ").split()]
            month = next((_MONTH_NAMES[t] for t in tokens if t in _MONTH_NAMES), None)
            if month:
                daynum = None
                for t in tokens:
                    if t in _ORDINAL_WORDS:
                        daynum = _ORDINAL_WORDS[t]
                        break
                    t2 = re.sub(r"(st|nd|rd|th)$", "", t)
                    if t2.isdigit() and 1 <= int(t2) <= 31:
                        daynum = int(t2)
                        break
                if daynum:
                    try:
                        candidate = datetime(now.year, month, daynum).date()
                        # "december 5" said in January almost surely means last year
                        if candidate > now.date() + timedelta(days=1):
                            candidate = datetime(now.year - 1, month, daynum).date()
                        day = candidate
                    except ValueError:
                        pass
        if day is None:
            return None
    return datetime(day.year, day.month, day.day, now.hour, now.minute, tzinfo=now.tzinfo).isoformat()


_MONTH_NAMES = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}
_MONTH_NAMES.update({m[:3]: i for m, i in list(_MONTH_NAMES.items())})

_ORDINAL_WORDS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11,
    "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
    "twentieth": 20, "twenty-first": 21, "twenty-second": 22, "twenty-third": 23,
    "twenty-fourth": 24, "twenty-fifth": 25, "twenty-sixth": 26,
    "twenty-seventh": 27, "twenty-eighth": 28, "twenty-ninth": 29,
    "thirtieth": 30, "thirty-first": 31,
}


def _fuzzy_match_meal(rows: list, name: str):
    """Token-overlap match of a removal target against a day's meal rows.
    Confident only on a unique best match with real overlap; substring matches
    always count as confident. Mirrors goals_service._match_goal."""
    needle = name.strip().lower()
    if not needle:
        return None
    for r in rows:
        if (r.get("description") or "").strip().lower() == needle:
            return r
    tokens = set(re.findall(r"[a-z0-9]+", needle))
    best, best_score, tied = None, 0, False
    for r in rows:
        desc = (r.get("description") or "").lower()
        if needle in desc or desc in needle:
            return r
        r_tokens = set(re.findall(r"[a-z0-9]+", desc))
        score = len(tokens & r_tokens)
        if score > best_score:
            best, best_score, tied = r, score, False
        elif score == best_score and score > 0:
            tied = True
    if best and best_score >= max(1, (len(tokens) + 1) // 2) and not tied:
        return best
    return None


def _process_meal_removals(supabase, m: dict) -> list:
    """Delete previously logged meals the user asked to remove or correct.
    Day references are resolved in Python (never by the LLM). Returns a list of
    human-readable confirmations like 'Macaroni Salad (2026-08-10)'."""
    removed = []
    for rem in (m.get("removals") or []):
        if not isinstance(rem, dict):
            continue
        name = (rem.get("meal_name") or "").strip()
        days = rem.get("meal_days") or []
        if isinstance(days, str):
            days = [days]
        if not name or not days:
            continue
        for d in days:
            t = _resolve_day_reference(str(d))
            if not t:
                continue
            day = t[:10]
            try:
                rows = (
                    supabase.table("meals").select("id, description")
                    .gte("meal_time", f"{day}T00:00:00")
                    .lt("meal_time", f"{day}T23:59:59.999999").execute()
                ).data or []
            except Exception as e:
                logger.warning(f"Meal removal: failed to fetch meals for {day}: {e}")
                continue
            match = _fuzzy_match_meal(rows, name)
            if match:
                try:
                    supabase.table("meals").delete().eq("id", match["id"]).execute()
                    removed.append(f"{match['description']} ({day})")
                    logger.info(f"Removed meal '{match['description']}' on {day}")
                except Exception as e:
                    logger.error(f"Meal removal delete failed: {e}")
            else:
                logger.info(f"Meal removal: no confident match for '{name}' on {day}")
    return removed


MUSCLE_GROUPS = ["Chest", "Back", "Front Delts", "Rear Delts", "Biceps", "Triceps",
                 "Abs", "Quads", "Hamstrings", "Glutes", "Calves"]

_EXERCISE_MUSCLE_HINTS = [
    # specific multi-word/exception cases first — order matters
    (("nordic",), "Hamstrings"),
    (("face pull", "rear delt", "reverse fly", "reverse flye"), "Rear Delts"),
    (("shoulder press", "overhead press", "ohp", "lateral raise", "military press"), "Front Delts"),
    (("leg curl", "hamstring", "good morning"), "Hamstrings"),
    (("glute", "hip thrust", "kickback"), "Glutes"),
    (("calf",), "Calves"),
    (("tricep", "pushdown", "skullcrusher", "dip"), "Triceps"),
    (("bench", "chest press", "chest fly", "fly", "push-up", "pushup"), "Chest"),
    (("row", "pulldown", "pull-up", "pullup", "pull up", "deadlift", "rdl"), "Back"),
    (("squat", "leg extension", "leg press", "lunge", "hack"), "Quads"),
    (("crunch", "ab ", "abs", "plank", "leg raise", "sit-up", "situp", "leg kicks"), "Abs"),
    (("curl",), "Biceps"),
]


def _resolve_muscle_group(supabase_client, user_id: str, exercise_name: str):
    """Figure out which muscle group an exercise hits, once, and cache it in
    exercise_muscles. Order: template value -> learned cache -> name
    heuristics -> LLM classification."""
    name = (exercise_name or "").strip()
    if not name or not supabase_client:
        return None

    # 1. template exercises with a group set
    try:
        t = supabase_client.table("workout_template_exercises").select("muscle_group").ilike("exercise_name", name).limit(1).execute()
        if t.data and t.data[0].get("muscle_group"):
            return t.data[0]["muscle_group"]
    except Exception:
        pass

    # 2. learned cache
    try:
        c = supabase_client.table("exercise_muscles").select("muscle_group").eq("user_id", user_id).ilike("exercise_name", name).limit(1).execute()
        if c.data:
            return c.data[0]["muscle_group"]
    except Exception:
        pass

    # 3. name heuristics
    lower = name.lower()
    for keywords, group in _EXERCISE_MUSCLE_HINTS:
        if any(k in lower for k in keywords):
            _cache_muscle_group(supabase_client, user_id, name, group, "heuristic")
            return group

    # 4. LLM classification
    if llm_fast:
        try:
            prompt = (
                f'Classify the gym exercise "{name}" into exactly one muscle group. '
                f'Answer with ONLY one of: {", ".join(MUSCLE_GROUPS)}.'
            )
            answer = llm_fast.invoke([HumanMessage(content=prompt)]).content.strip()
            for group in MUSCLE_GROUPS:
                if group.lower() in answer.lower():
                    _cache_muscle_group(supabase_client, user_id, name, group, "llm")
                    return group
        except Exception as e:
            logger.warning(f"LLM muscle classification failed for '{name}': {e}")
    return None


def _cache_muscle_group(supabase_client, user_id: str, exercise_name: str, group: str, source: str):
    try:
        supabase_client.table("exercise_muscles").upsert(
            {"user_id": user_id, "exercise_name": exercise_name, "muscle_group": group, "source": source},
            on_conflict="user_id,exercise_name",
        ).execute()
    except Exception as e:
        logger.warning(f"exercise_muscles cache write failed: {e}")


def _match_workout_template(supabase_client, user_id: str, text: str):
    """Token-overlap match of free text (e.g. a caption saying 'leg day')
    against the user's workout templates. Returns the template row or None."""
    try:
        res = supabase_client.table("workout_templates").select("id, name").eq("user_id", user_id).execute()
    except Exception:
        return None
    tokens = set(re.findall(r"[a-z]+", (text or "").lower()))
    best, best_score = None, 0
    for tmpl in (res.data or []):
        tmpl_tokens = set(re.findall(r"[a-z]+", tmpl.get("name", "").lower()))
        score = len(tokens & tmpl_tokens)
        if score > best_score:
            best, best_score = tmpl, score
    return best
