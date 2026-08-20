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
        - Bank Balance: ${p.get('bank_balance', 0)}
        - Base Salary: ${p.get('base_salary', 0)}
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
    rsu_res = supabase.table("company_rsus").select("*").execute()
    rsu_context = ""
    if rsu_res.data:
        rsu_context = "\nUser has the following unvested Company RSUs:\n"
        for rsu in rsu_res.data:
            rsu_context += f"- ${rsu.get('initial_grant_value_usd')} worth of {rsu.get('ticker')} granted on {rsu.get('grant_date')}. Vesting over {rsu.get('vesting_years')} years ({rsu.get('vest_percent_per_year')}% per year).\n"
        rsu_context += "Evaluate the market for these stocks, estimate their current vesting status, and track how their value is changing.\n"

    finance_prompt = f"""
    {user_context}
    {rsu_context}
    
    Generate detailed, multi-tab AI insights for a Wealth OS dashboard.
    Provide insights for:
    1. Capital Outflow / Spending (spending_insight)
    2. Net Worth Trajectory (networth_insight)
    3. Asset Allocation (allocation_insight)
    4. Company RSUs (rsu_insight)
    
    Respond ONLY in JSON format: 
    {{
        "insights": [
            {{"tab": "spending", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "infra spike", "anomaly_category": "Infrastructure"}},
            {{"tab": "networth", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "market drop"}},
            {{"tab": "allocation", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "underweight equities"}},
            {{"tab": "rsus", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "Upcoming vest"}}
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

    # --- GOAL INSIGHTS ---
    goals_res = supabase.table("goals").select("*").eq("status", "active").execute()
    if goals_res.data:
        goal_context = "\nUser has the following active goals:\n"
        for g in goals_res.data:
            goal_context += f"- Title: {g.get('title')}. Target: {g.get('target_value')} {g.get('unit', '')}. Linked Metric: {g.get('linked_metric')}. Deadline: {g.get('deadline')}.\n"
        
        goal_prompt = f"""
        {user_context}
        {goal_context}
        
        Generate AI insights for the active goals based on the user's current live metrics (like bank balance or salary).
        If the user has met the target (e.g. bank balance >= target), give them a "GREEN LIGHT" insight. Otherwise, estimate progress.
        
        Respond ONLY in JSON format: 
        {{
            "insights": [
                {{"tab": "green_light", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "Goal met!"}},
                {{"tab": "progress", "text": "...", "visual_marker_date": "2026-06-12", "visual_marker_metric": "85% funded"}}
            ]
        }}
        """
        try:
            logger.info("Generating Goal Insights...")
            goal_response = llm.invoke([HumanMessage(content=goal_prompt)]).content
            match = re.search(r'\{.*\}', goal_response, re.DOTALL)
            if match:
                g_data = json.loads(match.group(0))
                for insight in g_data.get("insights", []):
                    supabase.table("ai_insights").insert({
                        "user_id": "00000000-0000-0000-0000-000000000000",
                        "domain": f"goals_{insight.get('tab')}",
                        "insight_text": insight.get("text"),
                        "action_item": f"Marker: {insight.get('visual_marker_metric')} on {insight.get('visual_marker_date')}"
                    }).execute()
                logger.info("Goal insights saved.")
        except Exception as e:
            logger.error(f"Goal Insight Error: {e}")

    logger.info("Daily Analysis Complete.")

if __name__ == "__main__":
    run_daily_analysis()
