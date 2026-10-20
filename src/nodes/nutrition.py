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
    _get_known_items, _get_frequent_items, _match_known_item,
    _match_frequent_item_shortcut, web_search,
)
from nodes.ui_blocks import confirmation_block


def handle_nutrition_text(state: GraphState) -> GraphState:
    """Extract meals/supplements from free text and store them."""
    text = state["content"]
    current_time = datetime.now().astimezone().isoformat()

    # Resolve user + known items up front (habit matching)
    user_id = ZERO_UUID
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

    # Step 1: Barcode shortcut — if the user sends digits that look like a
    # barcode/EAN, look it up directly in OpenFoodFacts before falling back
    # to the normal extraction flow.
    barcode_match = re.search(r"\b\d{8,13}\b", text)
    barcode_context = ""
    if barcode_match and not known_match:
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

    # Step 1b: Frequent-items shortcut. If the message matches one of the
    # user's top 20 habit items, short-circuit to its canonical macros.
    # BUT only short-circuit if the known item actually has nutritional data
    # (calories > 0) — otherwise let the LLM estimate from web search.
    frequent_items = _get_frequent_items(supabase, user_id, limit=20) if supabase else []
    shortcut_match = _match_frequent_item_shortcut(text, frequent_items) if not known_match else known_match
    if shortcut_match and not known_match:
        # Only use the shortcut if the known item has real nutritional data
        if (shortcut_match.get("calories") or 0) > 0:
            known_match = shortcut_match
            logger.info(f"Nutrition text matched frequent item '{shortcut_match.get('name')}' — using canonical macros.")
        else:
            logger.info(f"Nutrition text matched frequent item '{shortcut_match.get('name')}' but it has no nutritional data — falling through to LLM estimation.")

    # If the known item has no nutritional data, don't use it as a shortcut
    if known_match and not (known_match.get("calories") or 0) > 0:
        logger.info(f"Known item '{known_match.get('name')}' has no nutritional data — not short-circuiting.")
        known_match = None

    # Step 2: Query construction and web search for supplements or brand names
    # (skipped entirely when the text matches a saved known item / frequent shortcut)
    search_context = ""
    search_query = ""
    if barcode_context:
        search_context = barcode_context
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
            if web_context and not web_context.startswith(("No search results", "Yahoo search failed", "Web search not configured")):
                parts.append(f"Web search snippets:\n{web_context}")
            search_context = "\n\n".join(parts)
        else:
            logger.info("Nutrition query is standard food or vague. Skipping web search.")

    # Known/frequent items context: exact macros for the user's habit foods.
    # Frequent items (top 20 by use_count) are shown first so shorthand like
    # "usual breakfast" resolves without a web search.
    if known_match:
        known_block = (
            f'MATCHED SAVED ITEM — use these EXACT values verbatim, do not estimate or ask for clarification:\n'
            f'"{known_match.get("name")}": {known_match.get("calories") or 0} kcal, '
            f'P {known_match.get("protein") or 0}g, C {known_match.get("carbs") or 0}g, F {known_match.get("fat") or 0}g'
            + (f', micronutrients: {json.dumps(known_match.get("micronutrients"))}' if known_match.get("micronutrients") else "")
        )
    elif frequent_items:
        freq_lines = [
            f'- "{i.get("name")}" (aliases: {", ".join(i.get("aliases") or [])}): '
            f'{i.get("calories") or 0} kcal, P {i.get("protein") or 0}g, C {i.get("carbs") or 0}g, F {i.get("fat") or 0}g'
            for i in frequent_items[:20]
        ]
        other = [i for i in known_items if i["id"] not in {j["id"] for j in frequent_items[:20]}]
        extra_lines = [
            f'- "{i.get("name")}" (aliases: {", ".join(i.get("aliases") or [])}): '
            f'{i.get("calories") or 0} kcal, P {i.get("protein") or 0}g, C {i.get("carbs") or 0}g, F {i.get("fat") or 0}g'
            for i in other[:10]
        ]
        known_block = "The user's frequent items (if the text matches one, use its exact values):\n" + "\n".join(freq_lines)
        if extra_lines:
            known_block += "\nOther saved items:\n" + "\n".join(extra_lines)
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
            if not items and m.get("meal_name"):
                items = [m]  # backward compat with single-meal output
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
                    # Known-item override: a saved item's canonical values
                    # win over LLM estimates — but only if the known item
                    # actually has nutritional data (calories > 0). A known
                    # item with 0/null values means it was saved without
                    # nutrition info, so let the LLM estimates stand.
                    it_name = it.get("meal_name") or ""
                    it_match = known_match if (known_match and len(items) == 1) else _match_known_item(it_name, known_items)
                    if it_match and (it_match.get("calories") or 0) > 0:
                        for field in ("calories", "protein", "carbs"):
                            if it_match.get(field) is not None:
                                it[field] = it_match.get(field)
                        if it_match.get("fat") is not None:
                            it["fats"] = it_match.get("fat")
                        it["meal_name"] = it_match.get("name")
                    else:
                        it_match = None  # don't use empty known item for micros either

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

                    # Track habit usage: bump the matching known item, or
                    # learn this item as a new known item for next time.
                    # Only learn if the item has real nutritional data (calories > 0).
                    try:
                        it_name = it.get("meal_name") or ""
                        it_match = known_match if (known_match and len(items) == 1) else _match_known_item(it_name, known_items)
                        if it_match:
                            supabase.table("known_items").update({
                                "use_count": (it_match.get("use_count") or 0) + 1,
                                "last_used_at": current_time
                            }).eq("id", it_match["id"]).execute()
                        elif it_name and (it.get("calories") or 0) > 0:
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
                state["response"] = removed_info + f"**Logged:** {logged_summaries[0]}{search_info}{known_info}" + (f"\n\n{insight}" if insight else "")
                logged_item = items[0] if items else {}
                state["ui"] = confirmation_block(
                    status="logged",
                    title=logged_item.get("meal_name") or "Meal",
                    subtitle=(search_info or known_info or "").strip(" ()") or None,
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
