import json
import re
from datetime import datetime

from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast, llm_cloud, supabase


def handle_finance_text(state: GraphState) -> GraphState:
    """Extract finance transactions from free text and store them."""
    text = state["content"]
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

    return state


def finance_node(state: GraphState) -> GraphState:
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
