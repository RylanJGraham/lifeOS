import os
import json
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

try:
    from supabase import create_client, Client
except ImportError:
    pass

load_dotenv()
logger = logging.getLogger("daily_analyzer")
logging.basicConfig(level=logging.INFO)

def run_daily_analysis():
    logger.info("Starting Daily AI Analysis Process...")
    
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    
    if not supabase_url or not supabase_key:
        logger.error("Supabase credentials missing.")
        return
        
    supabase: Client = create_client(supabase_url, supabase_key)
    
    # 0. Fetch User Profile
    profile_res = supabase.table("user_profiles").select("*").limit(1).execute()
    user_context = "User Profile: 24M, 190cm, Bulking. Base Salary: $85k"
    if profile_res.data and len(profile_res.data) > 0:
        p = profile_res.data[0]
        user_context = f"""
        User Profile:
        - Height: {p.get('height_cm')}cm
        - Current Weight: {p.get('current_weight_kg')}kg
        - Target Weight: {p.get('target_weight_kg')}kg
        - Daily Caloric Target: {p.get('daily_caloric_target')} kcal
        """

    llm = ChatOllama(model="llama3.1:8b", temperature=0.2)
    
    # --- HEALTH INSIGHTS ---
    health_prompt = f"""
    {user_context}
    
    Generate detailed, multi-tab AI insights for a Health OS dashboard. 
    You must provide insights for:
    1. Cardiovascular Health (rhr_insight)
    2. Sleep Architecture (sleep_insight)
    3. Fuel Injector / Nutrition (fuel_insight)
    4. Kinematic Load / Workouts (load_insight)
    
    Respond ONLY in JSON format: 
    {{
        "system_health_score": 85,
        "recovery_index": 92,
        "insights": [
            {{"tab": "cardio", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "spike in HR"}},
            {{"tab": "sleep", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "drop in REM"}},
            {{"tab": "fuel", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "missing vitamins"}},
            {{"tab": "load", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "excess volume"}}
        ]
    }}
    """
    
    try:
        logger.info("Generating Health Insights...")
        health_response = llm.invoke([HumanMessage(content=health_prompt)]).content
        import re
        match = re.search(r'\{.*\}', health_response, re.DOTALL)
        if match:
            h_data = json.loads(match.group(0))
            
            # Store general insights (In a real app, we'd map this directly to the frontend's specific tables/points)
            for insight in h_data.get("insights", []):
                supabase.table("ai_insights").insert({
                    "user_id": "00000000-0000-0000-0000-000000000000",
                    "domain": f"health_{insight.get('tab')}",
                    "insight_text": insight.get("text"),
                    "action_item": f"Marker: {insight.get('visual_marker_metric')} on {insight.get('visual_marker_date')}"
                }).execute()
            
            supabase.table("system_health_scores").insert({
                "user_id": "00000000-0000-0000-0000-000000000000",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "score": h_data.get("system_health_score", 80),
                "recovery_index": h_data.get("recovery_index", 90)
            }).execute()
            logger.info("Health insights saved.")
    except Exception as e:
        logger.error(f"Health Insight Error: {e}")

    # --- WEALTH INSIGHTS ---
    finance_prompt = f"""
    {user_context}
    
    Generate detailed, multi-tab AI insights for a Wealth OS dashboard.
    Provide insights for:
    1. Capital Outflow / Spending (spending_insight)
    2. Net Worth Trajectory (networth_insight)
    3. Asset Allocation (allocation_insight)
    
    Respond ONLY in JSON format: 
    {{
        "insights": [
            {{"tab": "spending", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "infra spike", "anomaly_category": "Infrastructure"}},
            {{"tab": "networth", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "market drop"}},
            {{"tab": "allocation", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "underweight equities"}}
        ]
    }}
    """
    
    try:
        logger.info("Generating Wealth Insights...")
        wealth_response = llm.invoke([HumanMessage(content=finance_prompt)]).content
        match = re.search(r'\{.*\}', wealth_response, re.DOTALL)
        if match:
            w_data = json.loads(match.group(0))
            
            for insight in w_data.get("insights", []):
                supabase.table("ai_insights").insert({
                    "user_id": "00000000-0000-0000-0000-000000000000",
                    "domain": f"wealth_{insight.get('tab')}",
                    "insight_text": insight.get("text"),
                    "action_item": f"Marker: {insight.get('visual_marker_metric')} on {insight.get('visual_marker_date')}"
                }).execute()
            logger.info("Wealth insights saved.")
    except Exception as e:
        logger.error(f"Wealth Insight Error: {e}")

    logger.info("Daily Analysis Complete.")

if __name__ == "__main__":
    run_daily_analysis()
