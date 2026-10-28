import json
import re
from datetime import datetime

from langchain_core.messages import HumanMessage

from db.supplements import ensure_supplements_for_meal
from workers.action_items import mark_resolved
from nodes.shared import (
    GraphState, logger, llm_fast, llm_cloud, supabase, ZERO_UUID,
    MICRO_DV_GUIDE, fetch_openfoodfacts_by_barcode, search_openfoodfacts,
    check_supplement_overrides, _resolve_day_reference, _process_meal_removals,
    web_search,
)
from nodes.ui_blocks import confirmation_block


def _count_likely_food_items(text: str) -> int:
    """Very rough upper-bound count of distinct edible things in a message."""
    lower = text.lower()
    # Strip common connectors that are not food themselves
    # and split by conjunctions / separators that usually separate items
    parts = re.split(r"\b(?:and|with|plus|then|after that|followed by|,?\s+and\s+|,)\b", lower)
    # Count parts that contain at least one food-looking token
    count = 0
    for p in parts:
        tokens = re.findall(r"[a-z]{3,}", p)
        if any(t in p for t in ("food", "ate", "had", "eat", "drank", "drink", "snack", "breakfast", "lunch", "dinner", "porridge", "burger", "pizza", "salad", "nuggets", "fries", "coke", "soda", "coffee", "tea", "water", "milk", "egg", "chicken", "beef", "rice", "pasta", "bread", "fruit", "vegetable", "apple", "banana", "honey", "sugar", "salt")):
            count += 1
    return max(1, count)


def _reextract_if_incomplete(text: str, items: list, current_time: str, search_context: str) -> list:
    """Re-run extraction if the LLM appears to have dropped items."""
    if len(items) >= 3:
        return items
    expected = _count_likely_food_items(text)
    if expected <= len(items):
        return items
    if expected - len(items) <= 1 and len(items) >= 2:
        # Allow small uncertainty; only force re-check for big drops
        return items

    logger.info(f"Nutrition extraction looks incomplete: expected ~{expected} items, got {len(items)}. Re-checking.")
    re_prompt = f"""
The user sent this food log: "{text}".
Current system time: {current_time}.

Food database & web verification data:
---
{search_context if search_context else "No search context requested."}
---

A first pass extracted these items: {json.dumps([it.get("meal_name") for it in items])}.
This looks incomplete — the user clearly mentioned more foods than were extracted.

Your job now: return the COMPLETE list of every distinct food, drink, topping, or side the user mentioned. Use the same JSON schema as before, but be exhaustive.

Examples you must follow:
- "9 McDonald's nuggets and fries and a coke" MUST produce three items: "McDonald's chicken nuggets (9)", "fries", and "coke".
- "Porridge with honey and bananas" MUST produce either one item named "Porridge with honey and bananas" with calories that include honey and bananas, OR three separate items for porridge, honey, and bananas. It must NOT produce a lone "Porridge" item that ignores the honey and bananas.

Return ONLY a valid JSON object with the same structure (sufficient_data, clarification_question, items, removals). Always set sufficient_data to true here unless the input is genuinely not about food.
"""
    try:
        re_res = llm_fast.invoke([HumanMessage(content=re_prompt)]).content
        logger.info(f"Nutrition re-extraction raw response: {re_res[:2000]}")
        re_match = re.search(r"\{{.*\}}", re_res, re.DOTALL)
        if re_match:
            re_m = json.loads(re_match.group(0))
            re_items = re_m.get("items") or []
            if len(re_items) > len(items):
                logger.info(f"Nutrition re-extraction returned {len(re_items)} items: {[it.get('meal_name') for it in re_items]}")
                return re_items
    except Exception as e:
        logger.warning(f"Nutrition re-extraction failed: {e}")
    return items


def handle_nutrition_text(state: GraphState) -> GraphState:
    """Extract meals/supplements from free text and store them."""
    text = state["content"]
    current_time = datetime.now().astimezone().isoformat()

    # Resolve user id for storing meals.
    user_id = ZERO_UUID
    if supabase:
        try:
            res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
            if res_profile.data and len(res_profile.data) > 0:
                user_id = res_profile.data[0]["user_id"]
        except Exception:
            pass

    # Step 1: Barcode shortcut — if the user sends digits that look like a
    # barcode/EAN, look it up directly in OpenFoodFacts before falling back
    # to the normal extraction flow.
    barcode_match = re.search(r"\b\d{8,13}\b", text)
    barcode_context = ""
    if barcode_match:
        barcode = barcode_match.group(0)
        product = fetch_openfoodfacts_by_barcode(barcode)
        if product:
            n = product.get("nutriments") or {}
            kcal = n.get("energy-kcal_100g")
            if kcal is not None:
                name = product.get("product_name") or product.get("product_name_en") or barcode
                brand = product.get("brands") or ""
                serving = product.get("serving_size") or "unknown"
                def _fmt(g):
                    v = n.get(f"{g}_100g")
                    return f"{v:g}" if isinstance(v, (int, float)) else "?"
                barcode_context = (
                    f"Barcode {barcode} matched: {name} ({brand}), serving size {serving}. "
                    f"Per 100g: {kcal:g} kcal, P {_fmt('proteins')}g, C {_fmt('carbohydrates')}g, "
                    f"F {_fmt('fat')}g, fiber {_fmt('fiber')}g, sugars {_fmt('sugars')}g. "
                    f"Use these values and scale to the portion eaten."
                )

    # Step 2: Query construction and web search for supplements or brand names
    search_context = ""
    search_query = ""
    if barcode_context:
        search_context = barcode_context
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
            if web_context and not web_context.startswith(("No search results", "Yahoo search failed", "Web search not configured")):
                parts.append(f"Web search snippets:\n{web_context}")
            search_context = "\n\n".join(parts)
        else:
            logger.info("Nutrition query is standard food or vague. Skipping web search.")

    # Extract meal details and validate info
    ext_prompt = f"""
    Analyze the user's meal/supplement log text: "{text}".
    Current system time: {current_time}.

    Food database & web verification data (use this to override/fill exact nutritional values for brands/supplements like Supradyn, Fage, etc.; OpenFoodFacts per-100g values must be scaled to the portion eaten):
    ---
    {search_context if search_context else "No search context requested."}
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
      * CRITICAL: You MUST return every distinct food, drink, topping, side, or component the user mentions. NEVER silently drop items.
        - "porridge with honey and bananas" is NOT just "Porridge". Either return one item named "Porridge with honey and bananas" whose calories INCLUDE the honey and bananas, OR return three separate items. The calories for "Porridge with honey and bananas" must be noticeably higher than plain porridge.
        - "9 McDonald's nuggets and fries and a coke" must produce items for nuggets, fries, AND coke — never just one of them.
        - Do not strip toppings (honey, bananas, sauce, cheese, etc.) or sides (fries, salad, rice, etc.) from a meal name or its calorie estimate.
      * Same food repeated over several days ("toast for the past tues-thurs") -> ONE item with several entries in its "meal_days".
      * Different foods on different days ("tuesday a burger, wednesday tacos") -> SEPARATE items, each with its own "meal_days" and macros. NEVER copy one day's food onto another day.
    - If the saved-items context above lists an exact match for one of the items, use its exact macros for that item only. Do NOT let the saved-items context cause you to ignore the other items in the message.
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
          "caffeine_mg": integer milligrams of caffeine (0 if none, estimate for coffee/tea/energy drinks/pre-workout),
          "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | null (infer from time/description if not stated),
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
            logger.info(f"Nutrition extraction parsed {len(items)} items: {[it.get('meal_name') for it in items]}")
            if not items and m.get("meal_name"):
                items = [m]  # backward compat with single-meal output
            # If the user clearly listed multiple foods but we only got one or
            # two items back, ask the LLM to re-check and list everything.
            items = _reextract_if_incomplete(text, items, current_time, search_context)
            logged_summaries = []
            if supabase:
                user_id = ZERO_UUID
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass

                for it in items:
                    micro_payload = {
                        "fiber": it.get("fiber") or 0,
                        "sugar": it.get("sugar") or 0,
                        "ai_analysis": it.get("ai_analysis") or "",
                        **{k: v for k, v in (it.get("micronutrients") or {}).items() if v is not None},
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
                        parsed_meal_time = datetime.fromisoformat(meal_time)
                        meal_type = it.get("meal_type") or None
                        supabase.table("meals").insert({
                            "description": it.get("meal_name"),
                            "calories": it.get("calories") or 0,
                            "protein": it.get("protein") or 0,
                            "carbs": it.get("carbs") or 0,
                            "fat": it.get("fats") or 0,
                            "caffeine_mg": it.get("caffeine_mg") or 0,
                            "meal_time": meal_time,
                            "meal_type": meal_type,
                            "micronutrients": micro_payload,
                            "user_id": user_id
                        }).execute()
                        ensure_supplements_for_meal(supabase, user_id, parsed_meal_time, meal_type)

                    day_part = f" × {len(times)}d ({times[0][:10]}→{times[-1][:10]})" if len(times) > 1 else f" {times[0][:10]} {times[0][11:16]}"
                    logged_summaries.append(f"{it.get('meal_name')} ({it.get('calories')} kcal{day_part})")

            search_info = f" (verified via search for '{search_query}')" if search_context else ""
            removed_info = ("Removed " + ", ".join(removed_summaries) + ".\n") if removed_summaries else ""
            if len(logged_summaries) > 1:
                state["response"] = removed_info + f"Logged {len(logged_summaries)} items{search_info}:\n" + "\n".join(f"• {s}" for s in logged_summaries)
                state["ui"] = confirmation_block(
                    status="logged",
                    title=f"{len(logged_summaries)} items logged",
                    rows=[
                        {"label": it.get("meal_name") or "Item", "value": f"{it.get('calories') or 0} kcal"}
                        for it in items
                    ],
                    subtitle=search_info.strip(" ()") or None,
                )
            elif logged_summaries:
                insight = items[0].get('ai_analysis') if items else ''
                state["response"] = removed_info + f"**Logged:** {logged_summaries[0]}{search_info}" + (f"\n\n{insight}" if insight else "")
                logged_item = items[0] if items else {}
                state["ui"] = confirmation_block(
                    status="logged",
                    title=logged_item.get("meal_name") or "Meal",
                    subtitle=search_info.strip(" ()") or None,
                    rows=[
                        {"label": "Calories", "value": f"{logged_item.get('calories') or 0} kcal"},
                        {"label": "Protein", "value": f"{logged_item.get('protein') or 0}g"},
                        {"label": "Carbs", "value": f"{logged_item.get('carbs') or 0}g"},
                        {"label": "Fat", "value": f"{logged_item.get('fats') or 0}g"},
                    ],
                    insight=insight or None,
                )
            elif removed_summaries:
                state["response"] = removed_info.strip()
                state["ui"] = confirmation_block(status="removed", title="Removed", rows=[{"label": s, "value": ""} for s in removed_summaries])
            else:
                state["response"] = "Understood, but found no food items to log."

            if logged_summaries:
                try:
                    mark_resolved("pacing", "Meal logged")
                except Exception as e:
                    logger.warning(f"Failed to resolve pacing action item: {e}")
        else:
            if removed_summaries:
                state["response"] = "Removed " + ", ".join(removed_summaries) + "."
            else:
                state["response"] = m.get("clarification_question") or "Could you please specify what food or drink items you had for this meal?"
    else:
        state["response"] = "Detected nutrition, but failed to parse details."

    return state


def nutrition_node(state: GraphState) -> GraphState:
    logger.info("Executing Nutrition Node (Image)")
    images = state.get("images") or []
    if not images:
        images = [state["content"]] if state.get("content") else []

    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured for Vision tasks."
        return state

    is_multi = len(images) > 1
    intro_text = (
        "Analyze these pictures of my food or supplement. Identify the meal/supplement, estimate the total calories, macronutrients (protein, carbs, fat in grams), fiber (grams), sugar (grams), and micronutrients (estimated as percentage of Daily Value, except sodium and potassium in milligrams)."
        if is_multi
        else "Analyze this picture of my food or supplement. Identify the meal/supplement, estimate the total calories, macronutrients (protein, carbs, fat in grams), fiber (grams), sugar (grams), and micronutrients (estimated as percentage of Daily Value, except sodium and potassium in milligrams)."
    )

    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": intro_text + """ Also provide a brief 1-2 sentence nutritional insight or athletic context about this meal (e.g. 'Excellent lean protein for recovery').

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
  "portion_multiplier": number (estimate relative to a standard single serving; e.g. 0.5 = half portion, 1.5 = large portion, 1.0 = typical plate, 2.0 = double. Default 1.0 if unclear.),
  "calories": integer,
  "protein": integer,
  "carbs": integer,
  "fats": integer,
  "fiber": integer,
  "sugar": integer,
  "caffeine_mg": integer (estimate for coffee/tea/energy drinks/pre-workout; 0 if none),
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | null (infer from time/description if not stated),
  "micronutrients": {
    "<nutrient_name>": integer,
    "...": "Include ANY and ALL relevant micronutrients (e.g. biotin, creatine, calcium, vitamin_a) found on the label. Map nutrient names to their percentage DV or mg/mcg values."
  },
  "ai_analysis": "Brief nutritional insight statement"
}
"""
                },
                *[{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}} for img in images]
            ]
        )
    ]
    
    try:
        response = llm_cloud.invoke(prompt)
        raw_json = response.content
        json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
        if json_match:
            meal = json.loads(json_match.group(0))
            # Scale macros by portion_multiplier if present and plausible.
            portion_scale = float(meal.get("portion_multiplier") or 1.0)
            if portion_scale <= 0 or portion_scale > 5:
                portion_scale = 1.0
            if portion_scale != 1.0:
                for k in ("calories", "protein", "carbs", "fats", "fiber", "sugar", "caffeine_mg"):
                    if meal.get(k) is not None:
                        meal[k] = round(float(meal[k]) * portion_scale)
                logger.info(f"Photo portion estimation: scaled by {portion_scale}")
            
            # Enrich with web search for better accuracy on macros and fiber
            meal_name = meal.get("meal_name", "")
            if meal_name and meal_name.lower() != "unknown":
                search_query = f"{meal_name} nutrition facts macros fiber vitamins"
                search_context = web_search(search_query)
                if search_context and search_context not in ("No search results available.", "Web search not configured."):
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
                user_id = ZERO_UUID
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

                meal_type = meal.get("meal_type") or None
                parsed_meal_time = datetime.now()
                supabase.table("meals").insert({
                    "description": meal.get("meal_name") or "Meal",
                    "calories": meal.get("calories") or 0,
                    "protein": meal.get("protein") or 0,
                    "carbs": meal.get("carbs") or 0,
                    "fat": meal.get("fats") or 0,
                    "caffeine_mg": meal.get("caffeine_mg") or 0,
                    "meal_type": meal_type,
                    "micronutrients": micro_payload,
                    "user_id": user_id
                }).execute()
                ensure_supplements_for_meal(supabase, user_id, parsed_meal_time, meal_type)
            scale_note = f" (portion ×{meal.get('portion_multiplier', 1.0)})" if meal.get("portion_multiplier") not in (None, 1.0) else ""
            macros = f"**{meal.get('calories')} kcal** · P {meal.get('protein')}g · C {meal.get('carbs')}g · F {meal.get('fats')}g"
            if meal.get("caffeine_mg"):
                macros += f" · Caffeine {meal.get('caffeine_mg')}mg"
            insight = meal.get('ai_analysis')
            state["response"] = f"**Logged:** {meal.get('meal_name')}{scale_note}\n{macros}" + (f"\n\n{insight}" if insight else "")
            state["ui"] = confirmation_block(
                status="logged",
                title=f"{meal.get('meal_name')}{scale_note}",
                rows=[
                    {"label": "Calories", "value": f"{meal.get('calories') or 0} kcal"},
                    {"label": "Protein", "value": f"{meal.get('protein') or 0}g"},
                    {"label": "Carbs", "value": f"{meal.get('carbs') or 0}g"},
                    {"label": "Fat", "value": f"{meal.get('fats') or 0}g"},
                ] + ([{"label": "Caffeine", "value": f"{meal.get('caffeine_mg')}mg"}] if meal.get("caffeine_mg") else []),
                insight=insight or None,
            )
        else:
            state["response"] = "Could not parse nutrition data from the image."
    except Exception as e:
        logger.error(f"Nutrition Node Error: {e}")
        state["response"] = f"Failed to process image: {str(e)}"
        
    return state
