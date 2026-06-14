import os
import json
import re
import logging
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
        return "nutrition_node"
    else:
        return "text_intent_node"

def text_intent_node(state: GraphState):
    logger.info("Executing Text Intent Node")
    text = state["content"]
    
    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

    prompt = f"""
    Analyze the following text from the user. 
    Is it a financial transaction (spending/income)?
    Is it a food/meal log (eating/drinking)?
    Or is it just general conversation?
    
    Respond with ONLY ONE WORD: 'finance', 'nutrition', or 'general'.
    
    Text: "{text}"
    """
    
    try:
        intent = llm_fast.invoke([HumanMessage(content=prompt)]).content.strip().lower()
        
        if "finance" in intent:
            # Extract transaction
            ext_prompt = f"""Extract transaction details from this text: "{text}". 
            Return ONLY JSON: {{"date": "YYYY-MM-DD", "amount": numeric (negative if spent), "merchant": "name", "category": "category"}}"""
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match and supabase:
                t = json.loads(match.group(0))
                supabase.table("transactions").insert({
                    "transaction_date": t.get("date"),
                    "amount": t.get("amount"),
                    "merchant_name": t.get("merchant"),
                    "category": t.get("category"),
                    "user_id": "00000000-0000-0000-0000-000000000000"
                }).execute()
                state["response"] = f"Logged transaction: ${abs(float(t.get('amount', 0)))} at {t.get('merchant')}."
            else:
                state["response"] = "Detected finance, but failed to parse details."
                
        elif "nutrition" in intent:
            # Extract meal
            ext_prompt = f"""Extract meal details from this text: "{text}".
            Estimate macros. Return ONLY JSON: {{"meal_name": "name", "calories": int, "protein": int, "carbs": int, "fats": int}}"""
            res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match and supabase:
                m = json.loads(match.group(0))
                supabase.table("meals").insert({
                    "description": m.get("meal_name"),
                    "calories": m.get("calories", 0),
                    "protein": m.get("protein", 0),
                    "carbs": m.get("carbs", 0),
                    "fat": m.get("fats", 0),
                    "user_id": "00000000-0000-0000-0000-000000000000"
                }).execute()
                state["response"] = f"Logged meal: {m.get('meal_name')} ({m.get('calories')} kcal, {m.get('protein')}g P)"
            else:
                state["response"] = "Detected nutrition, but failed to parse details."
                
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
    Return ONLY a valid JSON list of objects, each containing:
    - "date": YYYY-MM-DD
    - "amount": numeric (negative for expenses, positive for income)
    - "merchant": string name of merchant
    - "category": string (e.g., Dining, Gas, Groceries, Income)

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
                for t in transactions:
                    supabase.table("transactions").insert({
                        "transaction_date": t.get("date"),
                        "amount": t.get("amount"),
                        "merchant_name": t.get("merchant"),
                        "category": t.get("category"),
                        "user_id": "00000000-0000-0000-0000-000000000000"
                    }).execute()
            state["response"] = f"Successfully parsed and logged {len(transactions)} transactions from your Bank Statement!"
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
                {"type": "text", "text": "Analyze this picture of my food. Estimate the total calories, protein (g), carbs (g), and fats (g). Return ONLY a JSON object with keys: 'meal_name', 'calories', 'protein', 'carbs', 'fats'."},
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
            if supabase:
                supabase.table("meals").insert({
                    "description": meal.get("meal_name", "Meal"),
                    "calories": meal.get("calories", 0),
                    "protein": meal.get("protein", 0),
                    "carbs": meal.get("carbs", 0),
                    "fat": meal.get("fats", 0),
                    "user_id": "00000000-0000-0000-0000-000000000000"
                }).execute()
            state["response"] = f"Logged {meal.get('meal_name')}! Calories: {meal.get('calories')} kcal, P: {meal.get('protein')}g, C: {meal.get('carbs')}g, F: {meal.get('fats')}g."
        else:
            state["response"] = "Could not parse nutrition data from the image."
    except Exception as e:
        logger.error(f"Nutrition Node Error: {e}")
        state["response"] = f"Failed to process image: {str(e)}"
        
    return state

workflow = StateGraph(GraphState)
workflow.add_node("finance_node", finance_node)
workflow.add_node("nutrition_node", nutrition_node)
workflow.add_node("text_intent_node", text_intent_node)

workflow.set_conditional_entry_point(
    route_input,
    {
        "finance_node": "finance_node",
        "nutrition_node": "nutrition_node",
        "text_intent_node": "text_intent_node"
    }
)

workflow.add_edge("finance_node", END)
workflow.add_edge("nutrition_node", END)
workflow.add_edge("text_intent_node", END)

app_graph = workflow.compile()
