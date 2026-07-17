import os
import json
import re
import logging
from datetime import datetime
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

def check_supplement_overrides(text: str, m: dict) -> dict:
    t_lower = text.lower()
    if "supradyn" in t_lower:
        m["sufficient_data"] = True
        m["meal_name"] = "Supradyn Multivitamin"
        m["calories"] = 0
        m["protein"] = 0
        m["carbs"] = 0
        m["fats"] = 0
        m["fiber"] = 0
        m["sugar"] = 0
        m["micronutrients"] = {
            "vitamin_d_dv_pct": 100,
            "omega_3_dv_pct": 0,
            "magnesium_dv_pct": 21,  # 80mg Magnesium is ~21% of 380mg daily value
            "zinc_dv_pct": 100,      # 10mg Zinc is 100% DV
            "b12_dv_pct": 100,       # 2.5mcg B12 is 100% DV
            "iron_dv_pct": 100,      # 14mg Iron is 100% DV
            "sodium_mg": 0,
            "potassium_mg": 0
        }
        m["ai_analysis"] = "Supradyn multivitamin providing 100% DV of essential vitamins, 10mg Zinc, 14mg Iron, and 80mg Magnesium to support daily energy and micronutrient requirements."
    return m

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
    Is it a workout log (logging a completed exercise routine or workout template)? -> 'workout'
    Or is it just general conversation? -> 'general'
    
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
            
            # Step 1: Query construction and DDG HTML web search for supplements or brand names
            search_query_prompt = f"""
            Analyze the user's food/supplement log: "{text}".
            We want to find highly accurate nutritional facts (calories, protein, carbs, fat, fiber, and micronutrients like magnesium, zinc, iron, vitamin D, B12, etc.) for this item.
            Generate a single specific web search query to look up its nutritional values (prefer in English or Spanish as appropriate). 
            Include the word "nutrition facts" or "macros" in the query.
            ALWAYS generate a search query, even for simple foods or generic meals, to ensure we get accurate fiber and micronutrient data. Only return 'no_search' if the input is complete nonsense or not food.
            Do not output any introductory or concluding text, only the search query or 'no_search'.
            """
            search_query = llm_fast.invoke([HumanMessage(content=search_query_prompt)]).content.strip().replace('"', '').replace("'", "")
            
            search_context = ""
            if search_query.lower() != "no_search":
                logger.info(f"Nutrition query '{text}' requires web verification. Query: '{search_query}'")
                search_context = web_search(search_query)
            else:
                logger.info("Nutrition query is standard food or vague. Skipping web search.")

            # Extract meal details and validate info
            ext_prompt = f"""
            Analyze the user's meal/supplement log text: "{text}".
            Current system time: {current_time}.
            
            Web Search Verification Data (use this to override/fill exact nutritional values for brands/supplements like Supradyn, Fage, etc.):
            ---
            {search_context if search_context else "No search context requested."}
            ---
            
            Determine if there is sufficient specific detail about the food, drink, or nutritional supplements (e.g. multivitamin, vitamin D, fish oil, zinc, protein shake) in the text to reasonably identify the items and estimate their nutritional values.
            - Specific foods and supplements like "apple", "banana", "chicken and rice", "egg sandwich", "multivitamin", "omega-3 capsule", "vitamin D capsule", "whey protein shake with whole milk", "a slice of pizza" have sufficient data.
            - Nutritional supplements (like a multivitamin) are fully valid nutrition inputs. They may have 0 or negligible calories/macros, but their micronutrients (e.g. vitamin_d_dv_pct, b12_dv_pct, zinc_dv_pct, iron_dv_pct, magnesium_dv_pct, potassium_mg, sodium_mg, etc.) should be estimated based on typical dosage/values, and their calories/macros set to 0. If web search verification data is present and contains specific amounts (e.g., 80mg magnesium, 10mg zinc), use those exact proportions.
            
            - Micronutrients must be calculated and output EXCLUSIVELY as percentages of Daily Value (% DV, e.g. 0-120+) based on standard European VRN/RDA or US DV. DO NOT put absolute milligram (mg) or microgram (mcg) values in the percentage columns!
              Use this Reference Conversion Guide for 100% Daily Value (DV):
              * Vitamin D: 5 mcg (200 IU) = 100% DV. (So 5 mcg = 100).
              * Iron: 14 mg = 100% DV. (So 14 mg = 100).
              * Zinc: 10 mg = 100% DV. (So 10 mg = 100).
              * Vitamin B12: 2.5 mcg = 100% DV. (So 3 mcg = 120).
              * Magnesium: 375 mg or 400 mg = 100% DV. (So 80 mg Magnesium = 20 or 21, NOT 80!).
              * Omega-3: 1000 mg = 100% DV.
              
              CRITICAL: Double check your output! If search results say "14mg Iron", then "iron_dv_pct" is 100, NOT 14. If search results say "10mg Zinc", then "zinc_dv_pct" is 100, NOT 10. If search results say "80mg Magnesium", then "magnesium_dv_pct" is 21, NOT 80.
            - Vague descriptions like "lunch", "snack", "dinner", "eating something", or "food" do NOT have sufficient data.
            
            If there is sufficient data:
            - Parse/estimate the meal or supplement details.
            - Determine when the meal or supplement was consumed. If a time is mentioned (e.g. "at 8am", "an hour ago", "at 12:30", "yesterday at 7pm"), resolve it relative to the current system time ({current_time}) and output a valid ISO 8601 timestamp string (e.g. "2026-06-14T08:00:00+02:00"). If no time is specified, default to the current system time ({current_time}).
            
            Return ONLY a valid JSON object matching the following structure (no other text or wrapper code):
            {{
              "sufficient_data": boolean,
              "clarification_question": "A polite, friendly follow-up question asking for specific items if sufficient_data is false, otherwise null",
              "meal_name": "Brief descriptive name of the meal or supplement (e.g. 'Supradyn Multivitamin') if sufficient_data is true, otherwise null",
              "meal_time": "ISO 8601 timestamp string of the consumption time if sufficient_data is true, otherwise null",
              "calories": integer_or_null,
              "protein": integer_or_null,
              "carbs": integer_or_null,
              "fats": integer_or_null,
              "fiber": integer_grams_or_null,
              "sugar": integer_grams_or_null,
              "micronutrients": {{
                "vitamin_d_dv_pct": integer_percentage_or_null,
                "omega_3_dv_pct": integer_percentage_or_null,
                "magnesium_dv_pct": integer_percentage_or_null,
                "zinc_dv_pct": integer_percentage_or_null,
                "b12_dv_pct": integer_percentage_or_null,
                "iron_dv_pct": integer_percentage_or_null,
                "sodium_mg": integer_milligrams_or_null,
                "potassium_mg": integer_milligrams_or_null
              }},
              "ai_analysis": "A brief 1-2 sentence nutritional insight or athletic context about this meal/supplement (or null if sufficient_data is false)"
            }}
            """
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match:
                m = json.loads(match.group(0))
                # Apply static override as a safety fallback if search failed/empty
                m = check_supplement_overrides(text, m)
                if m.get("sufficient_data"):
                    if supabase:
                        user_id = "00000000-0000-0000-0000-000000000000"
                        try:
                            res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                            if res_profile.data and len(res_profile.data) > 0:
                                user_id = res_profile.data[0]["user_id"]
                        except Exception:
                            pass
                        
                        micro_payload = {
                            "fiber": m.get("fiber", 0),
                            "sugar": m.get("sugar", 0),
                            "ai_analysis": m.get("ai_analysis", ""),
                            **m.get("micronutrients", {})
                        }

                        supabase.table("meals").insert({
                            "description": m.get("meal_name"),
                            "calories": m.get("calories", 0),
                            "protein": m.get("protein", 0),
                            "carbs": m.get("carbs", 0),
                            "fat": m.get("fats", 0),
                            "meal_time": m.get("meal_time") or current_time,
                            "micronutrients": micro_payload,
                            "user_id": user_id
                        }).execute()
                    
                    search_info = f" (verified via search for '{search_query}')" if search_context else ""
                    state["response"] = f"Logged meal: {m.get('meal_name')}{search_info} ({m.get('calories')} kcal, {m.get('protein')}g P, {m.get('carbs')}g C, {m.get('fats')}g F) consumed at {m.get('meal_time') or current_time}. Insight: {m.get('ai_analysis')}"
                else:
                    state["response"] = m.get("clarification_question") or "Could you please specify what food or drink items you had for this meal?"
            else:
                state["response"] = "Detected nutrition, but failed to parse details."
                
        elif "workout" in intent:
            current_time = datetime.now().astimezone().isoformat()
            
            # Fire off Strava sync asynchronously
            try:
                import subprocess
                # Run the sync_strava.py script in the background
                subprocess.Popen(["python", "src/workers/sync_strava.py"])
            except Exception as e:
                logger.error(f"Failed to trigger async strava sync: {e}")

            ext_prompt = f"""
            Analyze the user's text: "{text}".
            They are logging a completed workout. Extract the name of the workout template or routine they did (e.g., "chest workout", "leg day", "pull session").
            Also extract any dynamic modifications:
            1. "overrides": progressive overload bumps to existing exercises, including "new_reps" if they specify volume instead of weight (e.g. bodyweight exercises).
            2. "skipped_exercises": exercises they skipped today.
            3. "added_exercises": brand new exercises they added to the routine today.
            Return ONLY a valid JSON object:
            {{
              "workout_name": "the extracted workout template name",
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
                
                # Default user_id
                user_id = "00000000-0000-0000-0000-000000000000"
                try:
                    res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res_profile.data and len(res_profile.data) > 0:
                        user_id = res_profile.data[0]["user_id"]
                except Exception:
                    pass
                
                # Find template
                try:
                    tmpl_res = supabase.table("workout_templates").select("id, name").eq("user_id", user_id).ilike("name", f"%{w_name}%").execute()
                    if tmpl_res.data and len(tmpl_res.data) > 0:
                        tmpl_id = tmpl_res.data[0]["id"]
                        actual_name = tmpl_res.data[0]["name"]
                        
                        ex_res = supabase.table("workout_template_exercises").select("*").eq("template_id", tmpl_id).execute()
                        bumped_messages = []
                        skipped_messages = []
                        added_messages = []
                        
                        logged_count = 0
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
                                
                                supabase.table("workouts").insert({
                                    "user_id": user_id,
                                    "workout_date": current_time,
                                    "exercise_name": ex.get("exercise_name"),
                                    "sets": ex.get("sets"),
                                    "reps": target_reps,
                                    "weight": target_weight,
                                    "muscle_group": ex.get("muscle_group")
                                }).execute()
                                logged_count += 1
                        
                        # Process newly added exercises
                        for a in added:
                            a_name = a.get("exercise_name")
                            a_sets = a.get("sets", 3)
                            a_weight = a.get("weight", 0)
                            a_reps = a.get("reps")
                            
                            # Add permanently to template
                            supabase.table("workout_template_exercises").insert({
                                "template_id": tmpl_id,
                                "exercise_name": a_name,
                                "sets": a_sets,
                                "reps": a_reps,
                                "weight": a_weight,
                                "sort_order": 99 # Push to end
                            }).execute()
                            
                            # Log for today
                            supabase.table("workouts").insert({
                                "user_id": user_id,
                                "workout_date": current_time,
                                "exercise_name": a_name,
                                "sets": a_sets,
                                "reps": a_reps,
                                "weight": a_weight
                            }).execute()
                            
                            added_messages.append(f"{a_name} ({a_sets} sets)")
                            logged_count += 1
                            
                        base_msg = f"Logged {logged_count} exercises for '{actual_name}'!"
                        if bumped_messages:
                            base_msg += f"\nBumped: {', '.join(bumped_messages)}."
                        if skipped_messages:
                            base_msg += f"\nSkipped: {', '.join(skipped_messages)}."
                        if added_messages:
                            base_msg += f"\nAdded to template: {', '.join(added_messages)}."
                            
                        base_msg += "\n(Strava sync triggered in background)"
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
Use this Reference Conversion Guide for 100% Daily Value (DV):
* Vitamin D: 5 mcg (200 IU) = 100% DV. (So 5 mcg = 100).
* Iron: 14 mg = 100% DV. (So 14 mg = 100).
* Zinc: 10 mg = 100% DV. (So 10 mg = 100).
* Vitamin B12: 2.5 mcg = 100% DV. (So 3 mcg = 120).
* Magnesium: 375 mg or 400 mg = 100% DV. (So 80 mg Magnesium = 20 or 21, NOT 80!).
* Omega-3: 1000 mg = 100% DV.

CRITICAL: Double check your output! If packaging/facts say "14mg Iron", then "iron_dv_pct" is 100, NOT 14. If packaging/facts say "10mg Zinc", then "zinc_dv_pct" is 100, NOT 10. If packaging/facts say "80mg Magnesium", then "magnesium_dv_pct" is 21, NOT 80.

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
                    "fiber": meal.get("fiber", 0),
                    "sugar": meal.get("sugar", 0),
                    "ai_analysis": meal.get("ai_analysis", ""),
                    **meal.get("micronutrients", {})
                }

                supabase.table("meals").insert({
                    "description": meal.get("meal_name", "Meal"),
                    "calories": meal.get("calories", 0),
                    "protein": meal.get("protein", 0),
                    "carbs": meal.get("carbs", 0),
                    "fat": meal.get("fats", 0),
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
    
    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state
        
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text", 
                    "text": "Look at this image. Is it a picture of food/meal (eating, drinking, ingredients, restaurant food) or is it a screenshot of a health/fitness tracking app dashboard (showing metrics like sleep time, steps, heart rate, workouts, weight, charts)? Respond with exactly one word: 'nutrition' or 'health'."
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
    
    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured for Vision tasks."
        return state
        
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text", 
                    "text": """Analyze this health app screenshot. Extract any available metrics such as:
- Sleep duration (minutes or hours)
- Deep sleep duration (minutes or hours)
- REM sleep duration (minutes or hours)
- Resting heart rate (bpm)
- HRV (ms)
- Steps
- Active calories (kcal)
- Body weight (kg)
- VO2 max (ml/kg/min)
- Heart Rate Zones (time spent in zones or percentages)

Estimate or default the 'date' to today's date in 'YYYY-MM-DD' format if not explicitly visible in the screenshot.

Return ONLY a valid JSON object matching this structure (use null for any values not found):
{
  "date": "YYYY-MM-DD",
  "sleep_duration_minutes": integer_or_null,
  "sleep_deep_minutes": integer_or_null,
  "sleep_rem_minutes": integer_or_null,
  "resting_heart_rate": integer_or_null,
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
  }
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
            sleep_dur = data.get("sleep_duration_minutes")
            sleep_deep = data.get("sleep_deep_minutes")
            sleep_rem = data.get("sleep_rem_minutes")
            rhr = data.get("resting_heart_rate")
            hrv = data.get("hrv")
            vo2_max = data.get("vo2_max")
            steps = data.get("steps")
            active_calories = data.get("active_calories")
            weight = data.get("body_weight_kg")
            zones = data.get("heart_rate_zones")
            
            # Formatting notes for standard schema
            notes_list = []
            if sleep_dur is not None: notes_list.append(f"Sleep: {sleep_dur} min (Deep: {sleep_deep or 0} min, REM: {sleep_rem or 0} min)")
            if rhr is not None: notes_list.append(f"RHR: {rhr} bpm")
            if hrv is not None: notes_list.append(f"HRV: {hrv} ms")
            if steps is not None: notes_list.append(f"Steps: {steps}")
            if active_calories is not None: notes_list.append(f"Active energy: {active_calories} kcal")
            if weight is not None: notes_list.append(f"Weight: {weight} kg")
            if vo2_max is not None: notes_list.append(f"VO2 Max: {vo2_max}")
            if zones is not None: notes_list.append(f"HR Zones: {json.dumps(zones)}")
            
            notes_str = "Apple Health Screenshot Parser:\n" + "\n".join(notes_list)
            
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
                try:
                    existing = supabase.table("health_metrics").select("id").eq("user_id", user_id).eq("recorded_at", date_str).execute()
                    if existing.data and len(existing.data) > 0:
                        existing_id = existing.data[0]["id"]
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
                    
                    if existing_id:
                        supabase.table("health_metrics").update(extended_payload).eq("id", existing_id).execute()
                        logger.info(f"Updated health metrics for {date_str}")
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
