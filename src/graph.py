import os
import json
import re
import logging
from datetime import datetime, timedelta
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
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
    input_type: str # "text", "image", "pdf"
    content: str # raw text, base64 image, or pdf text
    response: Optional[str]
    caption: Optional[str] # optional user text accompanying an image

# Cloud Model (OpenRouter) for complex routing and vision
openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
llm_cloud = ChatOpenAI(
    model="openai/gpt-4o", # Using GPT-4o for high capability
    api_key=openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.0
) if openrouter_api_key else None

llm_fast = ChatOpenAI(
    model="openai/gpt-4o-mini", # Fast model for routing
    api_key=openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.0
) if openrouter_api_key else None

def route_input(state: GraphState) -> str:
    input_type = state.get("input_type")
    if input_type == "pdf":
        return "finance_node"
    elif input_type == "image":
        return "image_dispatcher_node"
    else:
        return "text_intent_node"

def route_image(state: GraphState) -> str:
    input_type = state.get("input_type")
    if input_type == "health_image":
        return "health_image_node"
    else:
        return "nutrition_node"

def web_search(query: str) -> str:
    import httpx
    from lxml import html
    url = "https://search.yahoo.com/search"
    params = {"q": query}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    logger.info(f"Performing Yahoo search for: '{query}'")
    try:
        resp = httpx.get(url, params=params, headers=headers, timeout=8.0)
        if resp.status_code == 200:
            tree = html.fromstring(resp.text)
            results = tree.xpath('//div[contains(@class, "compText")]')
            snippets = [r.text_content().strip() for r in results[:4]]
            if len(snippets) > 0:
                logger.info(f"Web search success. Found {len(snippets)} results from Yahoo.")
                return "\n\n".join(snippets)
        logger.warning(f"Yahoo search failed with status: {resp.status_code}")
        return "No search results available."
    except Exception as e:
        logger.error(f"Yahoo search failed: {e}")
        return f"Yahoo search failed: {e}"

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


def _get_known_items(supabase_client, user_id) -> list:
    """Fetch the user's saved habit foods/supplements (known_items table)."""
    try:
        res = supabase_client.table("known_items").select("*").eq("user_id", user_id).execute()
        return res.data or []
    except Exception:
        return []


def _match_known_item(text: str, items: list):
    """Return the known item whose name/alias appears in the user's text.
    Longest matching name wins ('magnesium bisglycinate' beats 'magnesium')."""
    t = text.lower()
    best, best_len = None, 0
    for item in items:
        names = [item.get("name", "")] + (item.get("aliases") or [])
        for n in names:
            n = (n or "").lower().strip()
            if n and n in t and len(n) > best_len:
                best, best_len = item, len(n)
    return best


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


def text_intent_node(state: GraphState):
    logger.info("Executing Text Intent Node")
    text = state["content"]
    
    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

    prompt = f"""
    Analyze the following text from the user. 
    Is it a financial transaction (everyday spending/income)? -> 'finance'
    Is it an investment trade (buying, selling, adding, or trimming stock/crypto positions)? -> 'trade'
    Is it a food/meal log (eating/drinking)? -> 'nutrition'
    Is it a correction or removal of previously logged food (e.g. "remove the toast from monday", "for august 10th, instead of the salad it was tacos")? -> 'nutrition'
    Is it a body-weight log (e.g. "weighed 68.5 this morning", "weight: 68.2kg")? -> 'weight'
    Is it a workout log (logging a completed exercise routine, gym session, or workout template)? -> 'workout'
    Or is it just general conversation? -> 'general'

    Workout logs can be terse and use gym slang, e.g.: "did push today", "pull session yesterday",
    "smashed legs this morning", "did pull on tuesday" — these are all 'workout', NOT 'general'.
    
    Respond with ONLY ONE WORD: 'finance', 'trade', 'nutrition', 'workout', or 'general'.
    
    Text: "{text}"
    """
    
    try:
        intent = llm_fast.invoke([HumanMessage(content=prompt)]).content.strip().lower()
        
        if "trade" in intent:
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
                
                if not symbol or qty is None or price is None:
                    state["response"] = "To log a trade, please provide the quantity and price. For example: 'Bought 10 NVDA at $195'."
                else:
                    total_cost = float(qty) * float(price)
                    fees_val = float(t.get("fees") or 0)
                    currency_val = t.get("currency", "USD")

                    try:
                        supabase.table("advisor_purchases").insert({
                            "user_id": user_id,
                            "symbol": symbol.upper() if symbol else "UNKNOWN",
                            "action": action,
                            "quantity": qty,
                            "price": price,
                            "total_cost": total_cost,
                            "direction": direction,
                            "reason": reason,
                            "fees": fees_val,
                            "currency": currency_val,
                            "processed": False
                        }).execute()
                        state["response"] = f"Logged trade: {action.capitalize()} {qty} {symbol.upper()} at {currency_val} {price} (Total: {currency_val} {total_cost}). Financials sync queued."
                    except Exception as e:
                        logger.error(f"Failed to insert trade: {e}")
                        state["response"] = f"Failed to log trade in database."
            else:
                state["response"] = "Detected trade, but failed to parse details."
                
        elif "finance" in intent:
            current_date = datetime.now().strftime("%Y-%m-%d")
            # Extract transaction
            ext_prompt = f"""
            Extract transaction details from this text: "{text}". 
            Current date: {current_date}.
            
            Resolve any relative date mentions (like "today", "yesterday", "last Friday") relative to the current date ({current_date}).
            
            Classify the transaction into one of these strict categories:
            - "Housing & Utilities"
            - "Food & Dining"
            - "Transportation"
            - "Health & Fitness"
            - "Entertainment & Subscriptions"
            - "Shopping & Goods"
            - "Travel & Lodging"
            - "Personal Care"
            - "Education & Career"
            - "Financial & Investment"
            - "Income"
            - "Other"
            
            Return ONLY a valid JSON object matching this structure (no other text or code blocks):
            {{
              "transactions": [
                {{
                  "date": "YYYY-MM-DD",
                  "amount": numeric (negative value for expenses/spending, positive value for income/deposits),
                  "merchant": "merchant name (clean and normalized)",
                  "category": "must be one of the exact category strings listed above",
                  "confidence_score": numeric (between 0.0 and 1.0 representing classification confidence),
                  "notes": "brief 1-sentence description or subcategory detail (e.g., 'Groceries at Mercadona')"
                }}
              ]
            }}
            """
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match and supabase:
                data = json.loads(match.group(0))
                transactions = data.get("transactions", [])
                
                # Fetch default user_id if possible
                user_id = "00000000-0000-0000-0000-000000000000"
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass

                added_count = 0
                skipped_count = 0

                for t in transactions:
                    merchant = t.get("merchant")
                    amount = t.get("amount")
                    t_date = t.get("date")
                    
                    # Check for duplicate
                    is_duplicate = False
                    try:
                        dup_check = supabase.table("transactions") \
                            .select("id") \
                            .eq("user_id", user_id) \
                            .eq("transaction_date", t_date) \
                            .eq("amount", amount) \
                            .ilike("merchant_name", merchant) \
                            .execute()
                        if dup_check.data and len(dup_check.data) > 0:
                            is_duplicate = True
                    except Exception as e:
                        logger.warning(f"Failed to check duplicate transaction: {e}")
                    
                    if is_duplicate:
                        skipped_count += 1
                    else:
                        try:
                            supabase.table("transactions").insert({
                                "transaction_date": t_date,
                                "amount": amount,
                                "merchant_name": merchant,
                                "category": t.get("category"),
                                "confidence_score": t.get("confidence_score"),
                                "notes": t.get("notes"),
                                "user_id": user_id
                            }).execute()
                            added_count += 1
                        except Exception as e:
                            logger.error(f"Failed to insert transaction: {e}")

                if len(transactions) == 1:
                    if added_count == 1:
                        state["response"] = f"Logged transaction: ${abs(float(transactions[0].get('amount')))} at {transactions[0].get('merchant')} under '{transactions[0].get('category')}'."
                    else:
                        state["response"] = f"Transaction of ${abs(float(transactions[0].get('amount')))} at {transactions[0].get('merchant')} on {transactions[0].get('date')} is already logged. Skipping to prevent duplicate."
                else:
                    state["response"] = f"Bulk processed: Logged {added_count} new transactions, skipped {skipped_count} duplicates."
            else:
                state["response"] = "Detected finance, but failed to parse details."
                
        elif "nutrition" in intent:
            current_time = datetime.now().astimezone().isoformat()

            # Resolve user + known items up front (habit matching)
            user_id = "00000000-0000-0000-0000-000000000000"
            known_items, known_match = [], None
            if supabase:
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass
                known_items = _get_known_items(supabase, user_id)
                known_match = _match_known_item(text, known_items)

            # Step 1: Query construction and DDG HTML web search for supplements or brand names
            # (skipped entirely when the text matches a saved known item)
            search_context = ""
            search_query = ""
            if known_match:
                logger.info(f"Nutrition text matched known item '{known_match.get('name')}' — skipping web search.")
            else:
                search_query_prompt = f"""
            Analyze the user's food/supplement log: "{text}".
            We want to find highly accurate nutritional facts (calories, protein, carbs, fat, fiber, and micronutrients like magnesium, zinc, iron, vitamin D, B12, etc.) for this item.
            Generate a single specific web search query to look up its nutritional values (prefer in English or Spanish as appropriate). 
            Include the word "nutrition facts" or "macros" in the query.
            ALWAYS generate a search query, even for simple foods or generic meals, to ensure we get accurate fiber and micronutrient data. Only return 'no_search' if the input is complete nonsense or not food.
            Do not output any introductory or concluding text, only the search query or 'no_search'.
            """
                search_query = llm_fast.invoke([HumanMessage(content=search_query_prompt)]).content.strip().replace('"', '').replace("'", "")

                if search_query.lower() != "no_search":
                    logger.info(f"Nutrition query '{text}' requires verification. Query: '{search_query}'")
                    # OpenFoodFacts gives structured nutriments for packaged/branded
                    # foods; web search covers restaurant/homemade items OFF lacks.
                    off_context = search_openfoodfacts(search_query)
                    web_context = web_search(search_query)
                    parts = []
                    if off_context:
                        parts.append(off_context)
                    if web_context and not web_context.startswith(("No search results", "Yahoo search failed")):
                        parts.append(f"Web search snippets:\n{web_context}")
                    search_context = "\n\n".join(parts)
                else:
                    logger.info("Nutrition query is standard food or vague. Skipping web search.")

            # Known items context: exact macros for the user's habit foods
            if known_match:
                known_block = (
                    f'MATCHED SAVED ITEM — use these EXACT values verbatim, do not estimate or ask for clarification:\n'
                    f'"{known_match.get("name")}": {known_match.get("calories") or 0} kcal, '
                    f'P {known_match.get("protein") or 0}g, C {known_match.get("carbs") or 0}g, F {known_match.get("fat") or 0}g'
                    + (f', micronutrients: {json.dumps(known_match.get("micronutrients"))}' if known_match.get("micronutrients") else "")
                )
            elif known_items:
                lines = [
                    f'- "{i.get("name")}" (aliases: {", ".join(i.get("aliases") or [])}): '
                    f'{i.get("calories") or 0} kcal, P {i.get("protein") or 0}g, C {i.get("carbs") or 0}g, F {i.get("fat") or 0}g'
                    for i in known_items[:30]
                ]
                known_block = "The user's saved items (if the text clearly matches one, use its exact values):\n" + "\n".join(lines)
            else:
                known_block = ""

            # Extract meal details and validate info
            ext_prompt = f"""
            Analyze the user's meal/supplement log text: "{text}".
            Current system time: {current_time}.
            
            Food database & web verification data (use this to override/fill exact nutritional values for brands/supplements like Supradyn, Fage, etc.; OpenFoodFacts per-100g values must be scaled to the portion eaten):
            ---
            {search_context if search_context else "No search context requested."}
            ---
            
            Saved items context:
            ---
            {known_block if known_block else "None."}
            ---
           
            Determine if there is sufficient specific detail about the food, drink, or nutritional supplements (e.g. multivitamin, vitamin D, fish oil, zinc, protein shake) in the text to reasonably identify the items and estimate their nutritional values.
            - Specific foods and supplements like "apple", "banana", "chicken and rice", "egg sandwich", "multivitamin", "omega-3 capsule", "vitamin D capsule", "whey protein shake with whole milk", "a slice of pizza" have sufficient data.
            - Nutritional supplements (like a multivitamin) are fully valid nutrition inputs. They may have 0 or negligible calories/macros, but their micronutrients (e.g. vitamin_d_dv_pct, b12_dv_pct, zinc_dv_pct, iron_dv_pct, magnesium_dv_pct, potassium_mg, sodium_mg, etc.) should be estimated based on typical dosage/values, and their calories/macros set to 0. If web search verification data is present and contains specific amounts (e.g., 80mg magnesium, 10mg zinc), use those exact proportions.
            
            - Micronutrients must be calculated and output EXCLUSIVELY as percentages of Daily Value (% DV, e.g. 0-120+). DO NOT put absolute milligram (mg) or microgram (mcg) values in the percentage columns! (sodium_mg and potassium_mg are the only exceptions — raw mg.)
              {MICRO_DV_GUIDE}
              CRITICAL: Double check your output using the table above! If data says "10mg Zinc", then "zinc_dv_pct" is 91 (10/11), NOT 10. If it says "80mg Magnesium", then "magnesium_dv_pct" is 20, NOT 80. If it says "14mg Iron", then "iron_dv_pct" is 175, NOT 14.
            - Estimate %DV for every nutrient the food plausibly provides (dairy -> calcium; red meat -> iron/zinc/b12; fish -> omega_3/vitamin D; fruit -> vitamin C; nuts/seeds -> magnesium/vitamin E; whole grains -> manganese/phosphorus; eggs -> biotin/selenium). Use null only when the food contains essentially none.
            - Vague descriptions like "lunch", "snack", "dinner", "eating something", or "food" do NOT have sufficient data.
            
            If there is sufficient data:
            - ALWAYS output numeric estimates for calories/protein/carbs/fats/fiber/sugar — from the database/web data when available, otherwise from standard nutritional knowledge for a typical portion. A rough estimate is far more useful than a null; nulls are forbidden for these fields.
            - The user may log MULTIPLE foods across MULTIPLE days in one message. Return ONE item per distinct food/dish.
              * Same food repeated over several days ("toast for the past tues-thurs") -> ONE item with several entries in its "meal_days".
              * Different foods on different days ("tuesday a burger, wednesday tacos") -> SEPARATE items, each with its own "meal_days" and macros. NEVER copy one day's food onto another day.
            - For each item, report days EXACTLY as the user said them (no date math):
              * "meal_days": raw day references, e.g. ["today"], ["yesterday"], ["tuesday"], or per-day for a range: ["tuesday", "wednesday", "thursday"].
              * "meal_clock": the clock time "HH:MM" if mentioned for that item (e.g. "at 1pm" -> "13:00"), otherwise null. A time stated for all items applies to each.
            - CORRECTIONS: if the user asks to remove, replace, or correct previously logged food (e.g. "remove the toast from august 10", "for the tenth of august, instead of X it was Y", "I didn't eat Z on monday"), put the items to delete under "removals" with the day reference EXACTLY as the user said it, and put any replacement foods in "items" with that SAME day reference. An item being removed must NOT also appear in "items". A correction is still sufficient_data even when there is nothing new to log.
            
            Return ONLY a valid JSON object matching the following structure (no other text or wrapper code):
            {{
              "sufficient_data": boolean,
              "clarification_question": "A polite, friendly follow-up question asking for specific items if sufficient_data is false, otherwise null",
              "items": [
                {{
                  "meal_name": "Brief descriptive name of the meal or supplement",
                  "meal_days": ["raw day reference strings as the user said them"],
                  "meal_clock": "HH:MM_or_null",
                  "calories": integer (best estimate for the portion eaten — NEVER null),
                  "protein": integer grams (estimate — NEVER null),
                  "carbs": integer grams (estimate — NEVER null),
                  "fats": integer grams (estimate — NEVER null),
                  "fiber": integer grams (estimate — NEVER null, 0 only if truly none),
                  "sugar": integer grams (estimate — NEVER null, 0 only if truly none),
                  "micronutrients": {{
                    "vitamin_a_dv_pct": integer_percentage_or_null,
                    "vitamin_c_dv_pct": integer_percentage_or_null,
                    "vitamin_d_dv_pct": integer_percentage_or_null,
                    "vitamin_e_dv_pct": integer_percentage_or_null,
                    "vitamin_k_dv_pct": integer_percentage_or_null,
                    "b6_dv_pct": integer_percentage_or_null,
                    "b12_dv_pct": integer_percentage_or_null,
                    "biotin_dv_pct": integer_percentage_or_null,
                    "folic_acid_dv_pct": integer_percentage_or_null,
                    "magnesium_dv_pct": integer_percentage_or_null,
                    "zinc_dv_pct": integer_percentage_or_null,
                    "iron_dv_pct": integer_percentage_or_null,
                    "calcium_dv_pct": integer_percentage_or_null,
                    "selenium_dv_pct": integer_percentage_or_null,
                    "iodine_dv_pct": integer_percentage_or_null,
                    "copper_dv_pct": integer_percentage_or_null,
                    "manganese_dv_pct": integer_percentage_or_null,
                    "phosphorus_dv_pct": integer_percentage_or_null,
                    "omega_3_dv_pct": integer_percentage_or_null,
                    "sodium_mg": integer_milligrams_or_null,
                    "potassium_mg": integer_milligrams_or_null
                  }},
                  "ai_analysis": "A brief 1-sentence nutritional insight about this item"
                }}
              ],
              "removals": [
                {{"meal_name": "previously logged item to delete", "meal_days": ["raw day reference as the user said it"]}}
              ]
            }}
            """
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match:
                m = json.loads(match.group(0))
                # Apply static override as a safety fallback if search failed/empty
                m = check_supplement_overrides(text, m)
                # Corrections first: delete what the user asked to remove (works
                # even when there are no new items to log).
                removed_summaries = _process_meal_removals(supabase, m) if supabase else []
                if m.get("sufficient_data"):
                    items = m.get("items") or []
                    if not items and m.get("meal_name"):
                        items = [m]  # backward compat with single-meal output
                    logged_summaries = []
                    if supabase:
                        user_id = "00000000-0000-0000-0000-000000000000"
                        try:
                            res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                            if res_profile.data and len(res_profile.data) > 0:
                                user_id = res_profile.data[0]["user_id"]
                        except Exception:
                            pass

                        for it in items:
                            # Known-item override: a saved item's canonical values
                            # always win over LLM estimates (macros + micronutrients).
                            it_name = it.get("meal_name") or ""
                            it_match = known_match if (known_match and len(items) == 1) else _match_known_item(it_name, known_items)
                            if it_match:
                                for field in ("calories", "protein", "carbs"):
                                    if it_match.get(field) is not None:
                                        it[field] = it_match.get(field)
                                if it_match.get("fat") is not None:
                                    it["fats"] = it_match.get("fat")
                                it["meal_name"] = it_match.get("name")

                            known_micros = (it_match or {}).get("micronutrients") or {}
                            micro_payload = {
                                **known_micros,
                                "fiber": it.get("fiber") or known_micros.get("fiber", 0),
                                "sugar": it.get("sugar") or known_micros.get("sugar", 0),
                                "ai_analysis": it.get("ai_analysis") or "",
                                **{k: v for k, v in (it.get("micronutrients") or {}).items() if v is not None},
                                **known_micros,  # canonical values win over LLM
                            }

                            # Resolve day references in Python (never trust LLM date math).
                            # Each item carries its own days/clock: ranges fan out per day,
                            # different-day foods stay separate items.
                            clock = it.get("meal_clock")
                            days = it.get("meal_days") or []
                            if isinstance(days, str):
                                days = [days]
                            times = []
                            for d in days:
                                t = _resolve_day_reference(str(d))
                                if t:
                                    times.append(t)
                            if not times:
                                times = [current_time]
                            if clock:
                                try:
                                    hh, mm = str(clock).split(":")[:2]
                                    times = [
                                        datetime.fromisoformat(t).replace(hour=int(hh), minute=int(mm), second=0, microsecond=0).isoformat()
                                        for t in times
                                    ]
                                except (ValueError, TypeError):
                                    pass

                            for meal_time in times:
                                supabase.table("meals").insert({
                                    "description": it.get("meal_name"),
                                    "calories": it.get("calories") or 0,
                                    "protein": it.get("protein") or 0,
                                    "carbs": it.get("carbs") or 0,
                                    "fat": it.get("fats") or 0,
                                    "meal_time": meal_time,
                                    "micronutrients": micro_payload,
                                    "user_id": user_id
                                }).execute()

                            # Track habit usage: bump the matching known item, or
                            # learn this item as a new known item for next time.
                            try:
                                it_name = it.get("meal_name") or ""
                                it_match = known_match if (known_match and len(items) == 1) else _match_known_item(it_name, known_items)
                                if it_match:
                                    supabase.table("known_items").update({
                                        "use_count": (it_match.get("use_count") or 0) + 1,
                                        "last_used_at": current_time
                                    }).eq("id", it_match["id"]).execute()
                                elif it_name:
                                    supabase.table("known_items").insert({
                                        "user_id": user_id,
                                        "name": it_name,
                                        "calories": it.get("calories") or 0,
                                        "protein": it.get("protein") or 0,
                                        "carbs": it.get("carbs") or 0,
                                        "fat": it.get("fats") or 0,
                                        "micronutrients": micro_payload,
                                        "use_count": 1,
                                        "last_used_at": current_time
                                    }).execute()
                            except Exception as e:
                                logger.warning(f"known_items learn/bump failed: {e}")

                            day_part = f" × {len(times)}d ({times[0][:10]}→{times[-1][:10]})" if len(times) > 1 else f" {times[0][:10]} {times[0][11:16]}"
                            logged_summaries.append(f"{it.get('meal_name')} ({it.get('calories')} kcal{day_part})")

                    search_info = f" (verified via search for '{search_query}')" if search_context else ""
                    known_info = " ✓ saved item" if known_match else ""
                    removed_info = ("Removed " + ", ".join(removed_summaries) + ".\n") if removed_summaries else ""
                    if len(logged_summaries) > 1:
                        state["response"] = removed_info + f"Logged {len(logged_summaries)} items{search_info}:\n" + "\n".join(f"• {s}" for s in logged_summaries)
                    elif logged_summaries:
                        state["response"] = removed_info + f"Logged meal: {logged_summaries[0]}{search_info}{known_info}. Insight: {items[0].get('ai_analysis') if items else ''}"
                    elif removed_summaries:
                        state["response"] = removed_info.strip()
                    else:
                        state["response"] = "Understood, but found no food items to log."
                else:
                    if removed_summaries:
                        state["response"] = "Removed " + ", ".join(removed_summaries) + "."
                    else:
                        state["response"] = m.get("clarification_question") or "Could you please specify what food or drink items you had for this meal?"
            else:
                state["response"] = "Detected nutrition, but failed to parse details."
                
        elif "weight" in intent:
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
                except Exception as e:
                    logger.error(f"Weight log failed: {e}")
                    state["response"] = f"Failed to save weight: {str(e)}"

        elif "workout" in intent:
            current_time = datetime.now().astimezone().isoformat()
            
            # Fire off Strava sync asynchronously
            try:
                import subprocess, sys
                # Run the sync_strava.py script in the background
                sync_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workers", "sync_strava.py")
                subprocess.Popen([sys.executable, sync_script])
            except Exception as e:
                logger.error(f"Failed to trigger async strava sync: {e}")

            ext_prompt = f"""
            Analyze the user's text: "{text}".
            They are logging a completed workout. Extract the name of the workout template or routine they did (e.g., "chest workout", "leg day", "pull session").
            Today is {datetime.now().astimezone().strftime("%A, %Y-%m-%d")}. If the user says when they did the workout, capture it EXACTLY as said (e.g. "monday", "yesterday", "last friday", or an explicit "2026-07-13") — do NOT convert it yourself.
            Also extract any dynamic modifications:
            1. "overrides": progressive overload bumps to existing exercises, including "new_reps" if they specify volume instead of weight (e.g. bodyweight exercises).
            2. "skipped_exercises": exercises they skipped today.
            3. "added_exercises": brand new exercises they added to the routine today.
            Return ONLY a valid JSON object:
            {{
              "workout_name": "the extracted workout template name",
              "workout_date": "the raw day reference exactly as the user said it, or null if not mentioned",
              "overrides": [ {{"exercise_name": "incline curls", "new_weight": 35, "new_reps": 12}} ],
              "skipped_exercises": [ "bench press" ],
              "added_exercises": [ {{"exercise_name": "crunches", "sets": 3, "weight": 0, "reps": 50}} ]
            }}
            (If no overrides/skips/adds are mentioned, return empty lists).
            """
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match and supabase:
                w_data = json.loads(match.group(0))
                w_name = w_data.get("workout_name", "").lower()
                overrides = w_data.get("overrides", [])
                skipped = [s.lower() for s in w_data.get("skipped_exercises", [])]
                added = w_data.get("added_exercises", [])

                # Resolve the workout date if the user mentioned one
                workout_time = current_time
                w_date_str = w_data.get("workout_date")
                resolved_date = None
                if w_date_str:
                    workout_time = _resolve_day_reference(str(w_date_str)) or current_time
                    if workout_time != current_time:
                        resolved_date = workout_time[:10]
                
                # Default user_id
                user_id = "00000000-0000-0000-0000-000000000000"
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass
                
                # Find template: token-overlap match against the user's templates,
                # so "pull session" still matches the "Pull Day" template.
                try:
                    tmpl_res = supabase.table("workout_templates").select("id, name").eq("user_id", user_id).execute()
                    name_tokens = set(re.findall(r"[a-z]+", w_name))
                    best_tmpl, best_score = None, 0
                    for tmpl in (tmpl_res.data or []):
                        tmpl_tokens = set(re.findall(r"[a-z]+", tmpl.get("name", "").lower()))
                        score = len(name_tokens & tmpl_tokens)
                        if score > best_score:
                            best_tmpl, best_score = tmpl, score
                    if best_tmpl:
                        tmpl_id = best_tmpl["id"]
                        actual_name = best_tmpl["name"]
                        
                        ex_res = supabase.table("workout_template_exercises").select("*").eq("template_id", tmpl_id).execute()
                        bumped_messages = []
                        skipped_messages = []
                        added_messages = []
                        
                        logged_count = 0
                        logged_ids = []
                        if ex_res.data:
                            for ex in ex_res.data:
                                ex_name_lower = ex.get("exercise_name").lower()
                                
                                # Check if skipped
                                is_skipped = any(s in ex_name_lower for s in skipped)
                                if is_skipped:
                                    skipped_messages.append(ex.get("exercise_name"))
                                    continue
                                
                                target_weight = ex.get("weight")
                                target_reps = ex.get("reps")
                                # Check for overrides
                                for ov in overrides:
                                    if ov.get("exercise_name") and ov.get("exercise_name").lower() in ex_name_lower:
                                        if "new_weight" in ov:
                                            target_weight = ov.get("new_weight")
                                        if "new_reps" in ov:
                                            target_reps = ov.get("new_reps")
                                        
                                        supabase.table("workout_template_exercises").update({"weight": target_weight, "reps": target_reps}).eq("id", ex.get("id")).execute()
                                        
                                        bump_str = []
                                        if "new_weight" in ov: bump_str.append(f"{target_weight}lbs")
                                        if "new_reps" in ov: bump_str.append(f"{target_reps} reps")
                                        bumped_messages.append(f"{ex.get('exercise_name')} to {' '.join(bump_str)}")
                                        break
                                
                                ins = supabase.table("workouts").insert({
                                    "user_id": user_id,
                                    "workout_date": workout_time,
                                    "exercise_name": ex.get("exercise_name"),
                                    "sets": ex.get("sets"),
                                    "reps": target_reps,
                                    "weight": target_weight
                                }).execute()
                                if ins.data:
                                    logged_ids.append(ins.data[0].get("id"))
                                logged_count += 1
                        
                        # Process newly added exercises
                        for a in added:
                            a_name = a.get("exercise_name")
                            a_sets = a.get("sets", 3)
                            a_weight = a.get("weight", 0)
                            a_reps = a.get("reps")
                            a_muscle = _resolve_muscle_group(supabase, user_id, a_name)

                            # Add permanently to template
                            supabase.table("workout_template_exercises").insert({
                                "template_id": tmpl_id,
                                "exercise_name": a_name,
                                "sets": a_sets,
                                "reps": a_reps,
                                "weight": a_weight,
                                "muscle_group": a_muscle,
                                "sort_order": 99 # Push to end
                            }).execute()
                            
                            # Log for today
                            ins = supabase.table("workouts").insert({
                                "user_id": user_id,
                                "workout_date": workout_time,
                                "exercise_name": a_name,
                                "sets": a_sets,
                                "reps": a_reps,
                                "weight": a_weight
                            }).execute()
                            if ins.data:
                                logged_ids.append(ins.data[0].get("id"))
                            
                            added_messages.append(f"{a_name} ({a_sets} sets)")
                            logged_count += 1
                            
                        # Enrich with watch stats (HR, calories, duration): Mi Fitness
                        # (Xiaomi cloud) first, Strava as fallback.
                        strava_note = ""
                        if logged_ids:
                            activity = None
                            try:
                                from workers.sync_mifitness import get_activity_for_date as mf_activity_for_date
                                activity = mf_activity_for_date(workout_time[:10])
                            except Exception as e:
                                logger.warning(f"Mi Fitness enrichment lookup failed: {e}")
                            if activity is None:
                                try:
                                    from workers.sync_strava import get_activity_for_date
                                    activity = get_activity_for_date(workout_time[:10])
                                except Exception as e:
                                    logger.warning(f"Strava enrichment lookup failed: {e}")
                            if activity:
                                try:
                                    def _int(val):
                                        try:
                                            return int(float(val)) if val is not None else None
                                        except (ValueError, TypeError):
                                            return None
                                    stats = {
                                        "strava_id": str(activity.get("id")),
                                        "activity_type": activity.get("type"),
                                        "duration_minutes": round(activity["moving_time"] / 60.0, 1) if activity.get("moving_time") else None,
                                        "distance_km": round(activity["distance"] / 1000.0, 2) if activity.get("distance") else None,
                                        "average_heartrate": _int(activity.get("average_heartrate")),
                                        "max_heartrate": _int(activity.get("max_heartrate")),
                                        "calories": _int(activity.get("calories") or activity.get("kilojoules")),
                                        "suffer_score": _int(activity.get("suffer_score")),
                                    }
                                    stats = {k: v for k, v in stats.items() if v is not None}
                                    for rid in logged_ids:
                                        supabase.table("workouts").update(stats).eq("id", rid).execute()
                                    hr = stats.get("average_heartrate")
                                    dur = stats.get("duration_minutes")
                                    if hr:
                                        strava_note = f"\nWatch stats attached (avg HR {hr} bpm, {dur} min)."
                                    else:
                                        strava_note = "\nWatch stats attached."
                                except Exception as e:
                                    logger.warning(f"Workout stat enrichment failed: {e}")
                                    strava_note = "\n(Found a watch recording but failed to attach stats.)"
                            else:
                                strava_note = "\n(No watch recording found for this date.)"

                        date_note = f" on {resolved_date}" if resolved_date else ""
                        base_msg = f"Logged {logged_count} exercises for '{actual_name}'{date_note}!"
                        if bumped_messages:
                            base_msg += f"\nBumped: {', '.join(bumped_messages)}."
                        if skipped_messages:
                            base_msg += f"\nSkipped: {', '.join(skipped_messages)}."
                        if added_messages:
                            base_msg += f"\nAdded to template: {', '.join(added_messages)}."

                        base_msg += strava_note
                        state["response"] = base_msg
                    else:
                        state["response"] = f"Could not find a workout template matching '{w_name}'."
                except Exception as e:
                    logger.error(f"Workout log error: {e}")
                    state["response"] = f"Error logging workout: {e}"
            else:
                state["response"] = "Detected workout, but failed to parse details."
                
        else:
            # General Chat (using local Ollama to save money!)
            try:
                llm_local = ChatOllama(model="llama3.1:8b", temperature=0.6)
                state["response"] = llm_local.invoke([HumanMessage(content=text)]).content
            except Exception as local_e:
                # Fallback to cloud if local fails
                state["response"] = llm_fast.invoke([HumanMessage(content=text)]).content
                
    except Exception as e:
        logger.error(f"Text Intent Error: {e}")
        state["response"] = f"Error processing text: {str(e)}"
        
    return state

def finance_node(state: GraphState):
    logger.info("Executing Finance Node (PDF)")
    pdf_text = state["content"]
    
    prompt = f"""
    You are an expert financial assistant. I am providing you with the text extracted from a bank statement.
    Your job is to extract all the transactions into a structured JSON list.
    
    Classify each transaction into one of these strict categories:
    - "Housing & Utilities"
    - "Food & Dining"
    - "Transportation"
    - "Health & Fitness"
    - "Entertainment & Subscriptions"
    - "Shopping & Goods"
    - "Travel & Lodging"
    - "Personal Care"
    - "Education & Career"
    - "Financial & Investment"
    - "Income"
    - "Other"
    
    Return ONLY a valid JSON list of objects, each containing:
    - "date": "YYYY-MM-DD"
    - "amount": numeric (negative value for expenses/spending, positive value for income/deposits)
    - "merchant": "clean, normalized merchant name"
    - "category": "must be one of the exact category strings listed above"
    - "confidence_score": numeric (between 0.0 and 1.0 representing classification confidence)
    - "notes": "brief description of transaction or subcategory detail (e.g., 'Weekly grocery shopping')"
    
    Text snippet:
    {pdf_text[:15000]}
    """
    
    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured."
        return state
        
    try:
        response = llm_cloud.invoke([HumanMessage(content=prompt)])
        raw_json = response.content
        
        json_match = re.search(r'\[.*\]', raw_json, re.DOTALL)
        if json_match:
            transactions = json.loads(json_match.group(0))
            if supabase:
                user_id = "00000000-0000-0000-0000-000000000000"
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass

                inserted_count = 0
                duplicate_count = 0
                for t in transactions:
                    merchant = t.get("merchant")
                    amount = t.get("amount")
                    t_date = t.get("date")
                    
                    is_duplicate = False
                    try:
                        dup_check = supabase.table("transactions") \
                            .select("id") \
                            .eq("user_id", user_id) \
                            .eq("transaction_date", t_date) \
                            .eq("amount", amount) \
                            .ilike("merchant_name", merchant) \
                            .execute()
                        if dup_check.data and len(dup_check.data) > 0:
                            is_duplicate = True
                    except Exception as e:
                        logger.warning(f"Duplicate check failed for PDF transaction: {e}")
                        
                    if is_duplicate:
                        duplicate_count += 1
                        continue
                        
                    supabase.table("transactions").insert({
                        "transaction_date": t_date,
                        "amount": amount,
                        "merchant_name": merchant,
                        "category": t.get("category"),
                        "confidence_score": t.get("confidence_score"),
                        "notes": t.get("notes"),
                        "user_id": user_id
                    }).execute()
                    inserted_count += 1
                
                state["response"] = f"Processed PDF statement: logged {inserted_count} new transactions (skipped {duplicate_count} duplicates)."
            else:
                state["response"] = f"Parsed {len(transactions)} transactions, but Supabase is not connected."
        else:
            state["response"] = "Could not extract valid JSON transactions from the PDF."
    except Exception as e:
        logger.error(f"Finance Node Error: {e}")
        state["response"] = f"Failed to process PDF: {str(e)}"
        
    return state

def nutrition_node(state: GraphState):
    logger.info("Executing Nutrition Node (Image)")
    base64_image = state["content"]
    
    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured for Vision tasks."
        return state
        
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text", 
                    "text": """Analyze this picture of my food or supplement. Identify the meal/supplement, estimate the total calories, macronutrients (protein, carbs, fat in grams), fiber (grams), sugar (grams), and micronutrients (estimated as percentage of Daily Value, except sodium and potassium in milligrams).
Also provide a brief 1-2 sentence nutritional insight or athletic context about this meal (e.g. 'Excellent lean protein for recovery').

Micronutrients must be calculated and output EXCLUSIVELY as percentages of Daily Value (% DV, e.g. 0-120+) based on standard European VRN/RDA or US DV. DO NOT put absolute milligram (mg) or microgram (mcg) values in the percentage columns!
Use this Reference Conversion Guide for 100% Daily Value (adult male 19-50; mirror of MICRO_DV_GUIDE):
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
* Iron: 8 mg = 100% DV
* Magnesium: 400 mg = 100% DV (so 80 mg = 20, NOT 80!)
* Zinc: 11 mg = 100% DV
* Selenium: 55 mcg = 100% DV
* Iodine: 150 mcg = 100% DV
* Copper: 0.9 mg = 100% DV
* Manganese: 2.3 mg = 100% DV
* Phosphorus: 700 mg = 100% DV
* Omega-3 (EPA+DHA): 1000 mg = 100% DV
* Potassium: 3400 mg = 100% DV (but potassium_mg outputs raw mg, not a %)
* Sodium: 2300 mg = upper LIMIT, not a goal (sodium_mg outputs raw mg, not a %)

CRITICAL: Double check your output! If packaging/facts say "14mg Iron", then "iron_dv_pct" is 175, NOT 14. If packaging/facts say "11mg Zinc", then "zinc_dv_pct" is 100, NOT 11. If packaging/facts say "80mg Magnesium", then "magnesium_dv_pct" is 20, NOT 80.

Return ONLY a valid JSON object matching the following structure (no other text or code blocks):
{
  "meal_name": "Brief descriptive name of the meal",
  "calories": integer,
  "protein": integer,
  "carbs": integer,
  "fats": integer,
  "fiber": integer,
  "sugar": integer,
  "micronutrients": {
    "<nutrient_name>": integer,
    "...": "Include ANY and ALL relevant micronutrients (e.g. biotin, creatine, calcium, vitamin_a) found on the label. Map nutrient names to their percentage DV or mg/mcg values."
  },
  "ai_analysis": "Brief nutritional insight statement"
}
"""
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        )
    ]
    
    try:
        response = llm_cloud.invoke(prompt)
        raw_json = response.content
        json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
        if json_match:
            meal = json.loads(json_match.group(0))
            
            # Enrich with web search for better accuracy on macros and fiber
            meal_name = meal.get("meal_name", "")
            if meal_name and meal_name.lower() != "unknown":
                search_query = f"{meal_name} nutrition facts macros fiber vitamins"
                search_context = web_search(search_query)
                if search_context and search_context != "No search results available.":
                    # Let the LLM refine the parsed values with the search context
                    refine_prompt = f"""
                    We analyzed an image and got this initial nutrition payload:
                    {json.dumps(meal, indent=2)}
                    
                    We searched the web for "{search_query}" and found these facts:
                    ---
                    {search_context}
                    ---
                    
                    Refine the micronutrients (% DV or mg) and calories/macros in the payload to match the search facts.
                    Return ONLY the corrected/refined JSON matching the original structure.
                    """
                    try:
                        refine_res = llm_fast.invoke([HumanMessage(content=refine_prompt)]).content
                        refine_match = re.search(r'\{.*\}', refine_res, re.DOTALL)
                        if refine_match:
                            meal = json.loads(refine_match.group(0))
                            logger.info("Successfully refined image parsed nutrition data with search results.")
                    except Exception as e:
                        logger.error(f"Failed to refine image nutrition data: {e}")

            # Apply static overrides as safety fallback
            meal = check_supplement_overrides(meal_name, meal)

            if supabase:
                user_id = "00000000-0000-0000-0000-000000000000"
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass

                micro_payload = {
                    "fiber": meal.get("fiber") or 0,
                    "sugar": meal.get("sugar") or 0,
                    "ai_analysis": meal.get("ai_analysis") or "",
                    **{k: v for k, v in (meal.get("micronutrients") or {}).items() if v is not None}
                }

                supabase.table("meals").insert({
                    "description": meal.get("meal_name") or "Meal",
                    "calories": meal.get("calories") or 0,
                    "protein": meal.get("protein") or 0,
                    "carbs": meal.get("carbs") or 0,
                    "fat": meal.get("fats") or 0,
                    "micronutrients": micro_payload,
                    "user_id": user_id
                }).execute()
            state["response"] = f"Logged {meal.get('meal_name')}! Calories: {meal.get('calories')} kcal, P: {meal.get('protein')}g, C: {meal.get('carbs')}g, F: {meal.get('fats')}g. Insight: {meal.get('ai_analysis')}"
        else:
            state["response"] = "Could not parse nutrition data from the image."
    except Exception as e:
        logger.error(f"Nutrition Node Error: {e}")
        state["response"] = f"Failed to process image: {str(e)}"
        
    return state

def image_dispatcher_node(state: GraphState):
    logger.info("Executing Image Dispatcher Node")
    base64_image = state["content"]
    caption = state.get("caption")

    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

    caption_hint = f'\nThe user also says about this image: "{caption}"' if caption else ""
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": "Look at this image. Is it a picture of food/meal (eating, drinking, ingredients, restaurant food) or is it a screenshot of a health/fitness tracking app dashboard (showing metrics like sleep time, steps, heart rate, workouts, weight, charts)? Respond with exactly one word: 'nutrition' or 'health'." + caption_hint
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        )
    ]
    
    try:
        classification = llm_fast.invoke(prompt).content.strip().lower()
        logger.info(f"Image classification: {classification}")
        
        if "health" in classification:
            state["input_type"] = "health_image"
        else:
            state["input_type"] = "nutrition_image"
            
    except Exception as e:
        logger.error(f"Image dispatch error: {e}")
        state["input_type"] = "nutrition_image" # fallback
        
    return state

def health_image_node(state: GraphState):
    logger.info("Executing Health Image Node")
    base64_image = state["content"]
    caption = state.get("caption")
    
    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured for Vision tasks."
        return state
        
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": """Analyze this health/fitness app screenshot (e.g. Mi Fitness, Apple Health).

First decide the screenshot type:
- "workout": a single workout/activity summary (shows one session with duration, calories, avg/max heart rate, HR zones, sport name like "Strength Training" or "Outdoor Running")
- "daily_metrics": a daily dashboard (sleep, steps, resting HR, daily HR range, weight, etc.)

Extract any available metrics:
- Sleep duration / deep / light / REM (convert hours to MINUTES)
- Bedtime and wake time (HH:MM, 24h) if shown
- Resting heart rate (bpm), sleeping heart rate (bpm), daily average/min/max heart rate
- HRV (ms), Steps, Active calories (kcal), Body weight (kg), VO2 max
- For workouts: sport name, date, start time, duration (minutes), calories, avg/max HR, HR zone minutes

Use the date visible in the screenshot if any, else today's date, in 'YYYY-MM-DD' format.
Today is @@TODAY@@. Screenshots often show only day+month (e.g. "Jul 17") WITHOUT a year — in that case you MUST use today's year, never a year from your training data.
@@CAPTION@@

Return ONLY a valid JSON object (null for values not found):
{
  "screenshot_type": "workout" or "daily_metrics",
  "date": "YYYY-MM-DD",
  "sleep_duration_minutes": integer_or_null,
  "sleep_deep_minutes": integer_or_null,
  "sleep_light_minutes": integer_or_null,
  "sleep_rem_minutes": integer_or_null,
  "sleep_bed_time": "HH:MM_or_null",
  "sleep_wake_time": "HH:MM_or_null",
  "resting_heart_rate": integer_or_null,
  "sleeping_heart_rate": integer_or_null,
  "average_heart_rate": integer_or_null,
  "min_heart_rate": integer_or_null,
  "max_heart_rate": integer_or_null,
  "hrv": integer_or_null,
  "steps": integer_or_null,
  "active_calories": integer_or_null,
  "body_weight_kg": numeric_or_null,
  "vo2_max": numeric_or_null,
  "heart_rate_zones": {
    "zone1": integer_minutes_or_null,
    "zone2": integer_minutes_or_null,
    "zone3": integer_minutes_or_null,
    "zone4": integer_minutes_or_null,
    "zone5": integer_minutes_or_null
  },
  "workout": null_or_{
    "name": "sport name string",
    "start_time": "HH:MM or null",
    "duration_minutes": numeric_or_null,
    "calories": integer_or_null,
    "average_heartrate": integer_or_null,
    "max_heartrate": integer_or_null
  }
}
""".replace("@@TODAY@@", datetime.now().strftime("%Y-%m-%d")).replace(
                    "@@CAPTION@@",
                    (f'The user says about this image: "{caption}". If they say when it was (e.g. "on thursday", "yesterday", "last monday"), that overrides the screenshot date — resolve it relative to today and use it as "date". If they name the workout type, use it as the workout name.' if caption else "")
                )
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        )
    ]
    
    try:
        response = llm_cloud.invoke(prompt)
        raw_json = response.content
        json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            
            # Write to Supabase using similar logic as API endpoint
            user_id = "00000000-0000-0000-0000-000000000000"
            if supabase:
                try:
                    res = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res.data and len(res.data) > 0:
                        user_id = res.data[0]["user_id"]
                except Exception:
                    pass
            
            date_str = data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
            # Guard against year-misparsed dates: screenshots rarely show a year,
            # and the model sometimes defaults to its training-era year (2023).
            try:
                parsed_date = datetime.fromisoformat(str(date_str)[:10]).date()
                today = datetime.now().date()
                if parsed_date > today or (today - parsed_date).days > 45:
                    logger.warning(f"Screenshot date {date_str} implausible; using today ({today})")
                    date_str = today.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                date_str = datetime.now().strftime("%Y-%m-%d")
            sleep_dur = data.get("sleep_duration_minutes")
            sleep_deep = data.get("sleep_deep_minutes")
            sleep_light = data.get("sleep_light_minutes")
            sleep_rem = data.get("sleep_rem_minutes")
            bed_time = data.get("sleep_bed_time")
            wake_time = data.get("sleep_wake_time")
            rhr = data.get("resting_heart_rate")
            sleeping_hr = data.get("sleeping_heart_rate")
            avg_hr = data.get("average_heart_rate")
            min_hr = data.get("min_heart_rate")
            max_hr = data.get("max_heart_rate")
            hrv = data.get("hrv")
            vo2_max = data.get("vo2_max")
            steps = data.get("steps")
            active_calories = data.get("active_calories")
            weight = data.get("body_weight_kg")
            zones = data.get("heart_rate_zones")

            # Workout summary screenshots (duration, calories, HR zones) belong
            # in the workouts table, not the daily health_metrics row.
            w = data.get("workout") or {}
            if data.get("screenshot_type") == "workout" and (w.get("name") or caption) and supabase:
                w_name = w.get("name") or caption
                _resolve_muscle_group(supabase, user_id, w_name)  # learn for the muscle map
                duration = w.get("duration_minutes")
                start_time = w.get("start_time") or "12:00"
                workout_date = f"{date_str}T{start_time}:00"

                def _session_stats():
                    s = {
                        "duration_minutes": duration,
                        "calories": w.get("calories"),
                        "average_heartrate": w.get("average_heartrate"),
                        "max_heartrate": w.get("max_heartrate"),
                    }
                    if zones:
                        s["streams"] = {"heart_rate_zones": zones}
                    return {k: v for k, v in s.items() if v is not None}

                # If the caption names a routine (e.g. "leg day"), log the full
                # template's exercises and attach the session stats to each row.
                if caption:
                    tmpl = _match_workout_template(supabase, user_id, caption)
                    if tmpl:
                        ex_res = supabase.table("workout_template_exercises").select("*").eq("template_id", tmpl["id"]).execute()
                        exercises = ex_res.data or []
                        if exercises:
                            try:
                                dup = supabase.table("workouts").select("id").eq("user_id", user_id).eq("exercise_name", exercises[0].get("exercise_name")).gte("workout_date", f"{date_str}T00:00:00").lte("workout_date", f"{date_str}T23:59:59").execute()
                            except Exception:
                                dup = None
                            if dup and dup.data:
                                state["response"] = f"'{tmpl['name']}' on {date_str} is already logged — skipped duplicate."
                                return state
                            stats = _session_stats()
                            for ex in exercises:
                                supabase.table("workouts").insert({
                                    "user_id": user_id,
                                    "workout_date": workout_date,
                                    "exercise_name": ex.get("exercise_name"),
                                    "sets": ex.get("sets"),
                                    "reps": ex.get("reps"),
                                    "weight": ex.get("weight"),
                                    "activity_type": tmpl["name"],
                                    **stats,
                                }).execute()
                            bits = [
                                f"{duration} min" if duration else None,
                                f"{w.get('calories')} kcal" if w.get("calories") else None,
                                f"avg HR {w.get('average_heartrate')} bpm" if w.get("average_heartrate") else None,
                                f"max HR {w.get('max_heartrate')} bpm" if w.get("max_heartrate") else None,
                            ]
                            detail = ", ".join(b for b in bits if b) or "no stats visible"
                            state["response"] = f"Logged {len(exercises)} exercises for '{tmpl['name']}' on {date_str} with watch stats ({detail})."
                            return state

                try:
                    dup = supabase.table("workouts").select("id").eq("user_id", user_id).eq("exercise_name", w_name).gte("workout_date", f"{date_str}T00:00:00").lte("workout_date", f"{date_str}T23:59:59").execute()
                except Exception:
                    dup = None
                if dup and dup.data:
                    state["response"] = f"Workout '{w_name}' on {date_str} is already logged — skipped duplicate."
                    return state
                w_payload = {
                    "user_id": user_id,
                    "workout_date": workout_date,
                    "exercise_name": w_name,
                    "activity_type": w_name,
                    **_session_stats(),
                }
                supabase.table("workouts").insert(w_payload).execute()
                bits = [
                    f"{duration} min" if duration else None,
                    f"{w.get('calories')} kcal" if w.get("calories") else None,
                    f"avg HR {w.get('average_heartrate')} bpm" if w.get("average_heartrate") else None,
                    f"max HR {w.get('max_heartrate')} bpm" if w.get("max_heartrate") else None,
                ]
                detail = ", ".join(b for b in bits if b) or "no stats visible"
                state["response"] = f"Logged workout from screenshot: {w_name} on {date_str} ({detail})."
                return state

            # Formatting notes for standard schema
            notes_list = []
            if sleep_dur is not None: notes_list.append(f"Sleep: {sleep_dur} min (Deep: {sleep_deep or 0} min, Light: {sleep_light or 0} min, REM: {sleep_rem or 0} min)")
            if bed_time or wake_time: notes_list.append(f"Bed: {bed_time or '?'}, Wake: {wake_time or '?'}")
            if rhr is not None: notes_list.append(f"RHR: {rhr} bpm")
            if sleeping_hr is not None: notes_list.append(f"Sleeping HR: {sleeping_hr} bpm")
            if avg_hr is not None or min_hr is not None or max_hr is not None:
                notes_list.append(f"Daily HR: avg {avg_hr or '?'} bpm, min {min_hr or '?'} bpm, max {max_hr or '?'} bpm")
            if hrv is not None: notes_list.append(f"HRV: {hrv} ms")
            if steps is not None: notes_list.append(f"Steps: {steps}")
            if active_calories is not None: notes_list.append(f"Active energy: {active_calories} kcal")
            if weight is not None: notes_list.append(f"Weight: {weight} kg")
            if vo2_max is not None: notes_list.append(f"VO2 Max: {vo2_max}")
            if zones is not None: notes_list.append(f"HR Zones: {json.dumps(zones)}")
            
            notes_str = "Health screenshot import:\n" + "\n".join(notes_list)
            
            payload = {
                "user_id": user_id,
                "recorded_at": date_str,
                "sleep_duration_minutes": sleep_dur,
                "sleep_deep_minutes": sleep_deep,
                "sleep_rem_minutes": sleep_rem,
                "resting_heart_rate": rhr,
                "hrv": hrv,
                "notes": notes_str
            }
            
            if supabase:
                # Check for existing record for this date and user
                existing_id = None
                existing_notes = None
                try:
                    existing = supabase.table("health_metrics").select("id, notes").eq("user_id", user_id).eq("recorded_at", date_str).execute()
                    if existing.data and len(existing.data) > 0:
                        existing_id = existing.data[0]["id"]
                        existing_notes = existing.data[0].get("notes")
                except Exception as e:
                    logger.warning(f"Failed to check existing health metrics: {e}")

                # Try inserting/updating with custom columns
                try:
                    extended_payload = payload.copy()
                    extended_payload["vo2_max"] = vo2_max
                    extended_payload["steps"] = steps
                    extended_payload["active_calories"] = active_calories
                    extended_payload["body_weight_kg"] = weight
                    extended_payload["heart_rate_zones"] = zones
                    extended_payload["sleep_bed_time"] = bed_time
                    extended_payload["sleep_wake_time"] = wake_time
                    extended_payload["sleeping_heart_rate"] = sleeping_hr
                    extended_payload["average_heart_rate"] = avg_hr
                    extended_payload["min_heart_rate"] = min_hr
                    extended_payload["max_heart_rate"] = max_hr

                    if existing_id:
                        # MERGE, don't overwrite: only write fields this screenshot
                        # actually provided, so a sleep screenshot never wipes HR
                        # data from the same day (and vice versa).
                        merged = {k: v for k, v in extended_payload.items() if v is not None}
                        header = "Health screenshot import:"
                        prev_lines = [l for l in (existing_notes or "").split("\n") if l.strip() and not l.startswith(header)]
                        new_lines = [l for l in notes_str.split("\n") if l.strip() and not l.startswith(header)]
                        combined = new_lines + [l for l in prev_lines if l not in new_lines]
                        merged["notes"] = header + "\n" + "\n".join(combined)
                        supabase.table("health_metrics").update(merged).eq("id", existing_id).execute()
                        logger.info(f"Merged health metrics into existing row for {date_str}")
                    else:
                        supabase.table("health_metrics").insert(extended_payload).execute()
                        logger.info(f"Inserted health metrics for {date_str}")
                except Exception as e:
                    # Fallback
                    logger.warning(f"Extended write failed in health image node: {e}")
                    try:
                        if existing_id:
                            supabase.table("health_metrics").update(payload).eq("id", existing_id).execute()
                        else:
                            supabase.table("health_metrics").insert(payload).execute()
                    except Exception as ex:
                        logger.error(f"Failed fallback write in health image node: {ex}")
                        state["response"] = f"Parsed metrics, but failed to write to database: {ex}"
                        return state
                
                # Update current_weight_kg in user_profiles if weight is provided
                if weight is not None:
                    try:
                        supabase.table("user_profiles").update({"current_weight_kg": weight}).eq("user_id", user_id).execute()
                    except Exception as e:
                        logger.error(f"Failed to update profile weight: {e}")
            
            # Format success message
            parsed_summary = ", ".join(notes_list) if notes_list else "no metrics found"
            state["response"] = f"Processed health screenshot. Logged metrics: {parsed_summary}."
        else:
            state["response"] = "Could not extract structured health metrics from the screenshot."
    except Exception as e:
        logger.error(f"Health Image Node Error: {e}")
        state["response"] = f"Failed to process health screenshot: {str(e)}"
        
    return state

workflow = StateGraph(GraphState)
workflow.add_node("finance_node", finance_node)
workflow.add_node("nutrition_node", nutrition_node)
workflow.add_node("text_intent_node", text_intent_node)
workflow.add_node("image_dispatcher_node", image_dispatcher_node)
workflow.add_node("health_image_node", health_image_node)

workflow.set_conditional_entry_point(
    route_input,
    {
        "finance_node": "finance_node",
        "image_dispatcher_node": "image_dispatcher_node",
        "text_intent_node": "text_intent_node"
    }
)

workflow.add_conditional_edges(
    "image_dispatcher_node",
    route_image,
    {
        "health_image_node": "health_image_node",
        "nutrition_node": "nutrition_node"
    }
)

workflow.add_edge("finance_node", END)
workflow.add_edge("nutrition_node", END)
workflow.add_edge("health_image_node", END)
workflow.add_edge("text_intent_node", END)

app_graph = workflow.compile()
