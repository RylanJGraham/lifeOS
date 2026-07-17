import os
import json
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from telegram_webhook import router as telegram_router
from utils.logger import SupabaseLogger

# Load environment variables
load_dotenv()

app = FastAPI(title="Life-OS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the telegram webhook router
app.include_router(telegram_router)

@app.on_event("startup")
async def startup_event():
    SupabaseLogger.info("api", "Life-OS Backend API started successfully.")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    ngrok_domain = os.getenv("NGROK_DOMAIN")
    if bot_token and ngrok_domain:
        webhook_url = f"https://{ngrok_domain}/webhook"
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                res = await client.get(f"https://api.telegram.org/bot{bot_token}/setWebhook?url={webhook_url}")
                if res.status_code == 200:
                    print(f"Telegram webhook successfully registered to: {webhook_url}")
                    SupabaseLogger.info("api", f"Telegram webhook registered to {webhook_url}")
                else:
                    print(f"Failed to register Telegram webhook: {res.text}")
                    SupabaseLogger.error("api", f"Failed to register Telegram webhook: {res.text}")
        except Exception as e:
            print(f"Error registering Telegram webhook: {e}")
            SupabaseLogger.error("api", f"Error registering Telegram webhook: {e}")

@app.get("/status")
async def status_check():
    """Health check endpoint to verify service connectivity."""
    # Check Ollama
    ollama_status = "error"
    try:
        import httpx
        with httpx.Client(timeout=2.0) as client:
            resp = client.get(os.getenv("OLLAMA_HOST", "http://localhost:11434") + "/api/tags")
            if resp.status_code == 200:
                ollama_status = "ok"
    except Exception:
        pass
        
    # Check Supabase
    supabase_status = "error"
    try:
        from supabase import create_client
        sb_url = os.getenv("SUPABASE_URL")
        sb_key = os.getenv("SUPABASE_SERVICE_KEY")
        if sb_url and sb_key:
            sb = create_client(sb_url, sb_key)
            # A lightweight query to verify auth
            sb.table("health_metrics").select("id").limit(1).execute()
            supabase_status = "ok"
    except Exception:
        pass

    # Note: Ngrok tunnel status is implicit if we can reach this from the public URL.
    # We report it as ok assuming the process is running locally.

    return {
        "status": "online",
        "services": {
            "ollama": ollama_status,
            "supabase": supabase_status,
            "ngrok": "ok"
        }
    }

@app.post("/api/sleep")
async def receive_sleep_data(request: Request):
    """Receives sleep data from Xiaomi Mi Fitness sync script"""
    try:
        data = await request.json()
        
        # Save to supabase logic goes here
        # Example structure:
        # {
        #   "date": "2026-06-13",
        #   "deep_sleep_time": 120,
        #   "light_sleep_time": 240,
        #   ...
        # }
        
        # Returns 200 to acknowledge
        SupabaseLogger.info("api", f"Received sleep data payload: {len(data) if isinstance(data, list) else 1} items")
        return JSONResponse(content={"status": "received", "count": len(data) if isinstance(data, list) else 1})
    except Exception as e:
        SupabaseLogger.error("api", f"Failed to process sleep data: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/health-metrics")
async def receive_health_metrics(request: Request):
    """
    Receives daily health metrics pushed from an iOS Shortcut (Apple Health).
    """
    try:
        data = await request.json()
        SupabaseLogger.info("api", "Received Apple Health metrics payload.")
        
        from utils.logger import get_supabase_client
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured.")
            
        # Get user_id
        user_id = "00000000-0000-0000-0000-000000000000"
        try:
            res = supabase.table("user_profiles").select("user_id").limit(1).execute()
            if res.data and len(res.data) > 0:
                user_id = res.data[0]["user_id"]
        except Exception:
            pass
            
        # Parse fields from the JSON payload (default to None)
        date_str = data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
        
        # Values from payload
        sleep_dur = data.get("sleep_duration_minutes")
        sleep_deep = data.get("sleep_deep_minutes")
        sleep_rem = data.get("sleep_rem_minutes")
        rhr = data.get("resting_heart_rate")
        hrv = data.get("hrv")
        vo2_max = data.get("vo2_max")
        steps = data.get("steps")
        active_calories = data.get("active_calories")
        weight = data.get("body_weight_kg")
        zones = data.get("heart_rate_zones") # dict or JSON
        
        # Build a text summary for the notes field
        notes_list = []
        if sleep_dur is not None: notes_list.append(f"Sleep: {sleep_dur} min (Deep: {sleep_deep or 0} min, REM: {sleep_rem or 0} min)")
        if rhr is not None: notes_list.append(f"RHR: {rhr} bpm")
        if hrv is not None: notes_list.append(f"HRV: {hrv} ms")
        if steps is not None: notes_list.append(f"Steps: {steps}")
        if active_calories is not None: notes_list.append(f"Active energy: {active_calories} kcal")
        if weight is not None: notes_list.append(f"Weight: {weight} kg")
        if vo2_max is not None: notes_list.append(f"VO2 Max: {vo2_max}")
        if zones is not None: notes_list.append(f"HR Zones: {json.dumps(zones)}")
        
        notes_str = "Apple Health Sync:\n" + "\n".join(notes_list)
        
        # Prepare the base insertion record
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
        
        # Check for existing record for this date and user
        existing_id = None
        try:
            existing = supabase.table("health_metrics").select("id").eq("user_id", user_id).eq("recorded_at", date_str).execute()
            if existing.data and len(existing.data) > 0:
                existing_id = existing.data[0]["id"]
        except Exception as e:
            SupabaseLogger.warning("api", f"Failed to check existing health metrics: {e}")

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
                SupabaseLogger.info("api", f"Successfully updated health metrics with custom columns for {date_str}.")
            else:
                supabase.table("health_metrics").insert(extended_payload).execute()
                SupabaseLogger.info("api", "Successfully inserted health metrics with custom columns.")
        except Exception as e:
            # Fallback to standard columns if migration hasn't been run
            SupabaseLogger.warning("api", f"Extended columns write failed (check if migration ran): {e}")
            try:
                if existing_id:
                    supabase.table("health_metrics").update(payload).eq("id", existing_id).execute()
                    SupabaseLogger.info("api", f"Successfully updated health metrics (standard columns fallback) for {date_str}.")
                else:
                    supabase.table("health_metrics").insert(payload).execute()
                    SupabaseLogger.info("api", "Successfully inserted health metrics (standard columns fallback).")
            except Exception as ex:
                SupabaseLogger.error("api", f"Failed to write health metrics record: {ex}")
                raise HTTPException(status_code=500, detail=f"Database write failed: {ex}")
                
        # Update current_weight_kg in user_profiles if weight is provided
        if weight is not None:
            try:
                supabase.table("user_profiles").update({"current_weight_kg": weight}).eq("user_id", user_id).execute()
                SupabaseLogger.info("api", f"Successfully updated user profile weight to {weight} kg.")
            except Exception as e:
                SupabaseLogger.error("api", f"Failed to update profile weight: {e}")
                
        return JSONResponse(content={"status": "success", "message": "Metrics recorded."})
    except Exception as e:
        SupabaseLogger.error("api", f"Error in receive_health_metrics: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/system_stream")
async def get_system_stream(limit: int = 20):
    """Fetches the latest system logs and ai insights for the anomaly stream."""
    try:
        from utils.logger import get_supabase_client
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured.")
        
        # Fetch logs
        logs_res = supabase.table("system_logs").select("*").order("timestamp", desc=True).limit(limit).execute()
        
        # Fetch insights
        insights_res = supabase.table("ai_insights").select("*").order("generated_at", desc=True).limit(limit).execute()
        
        # Combine and sort
        combined = []
        if logs_res.data:
            for l in logs_res.data:
                combined.append({
                    "id": l["id"],
                    "timestamp": l["timestamp"],
                    "type": "log",
                    "level": l.get("level", "info"),
                    "service": l.get("service", "system"),
                    "message": l.get("message", ""),
                    "details": l.get("details", {})
                })
        
        if insights_res.data:
            for i in insights_res.data:
                combined.append({
                    "id": i["id"],
                    "timestamp": i["generated_at"],
                    "type": "insight",
                    "level": "insight",
                    "service": i.get("domain", "general"),
                    "message": i.get("insight_text", ""),
                    "action": i.get("action_item", "")
                })
                
        # Sort by timestamp desc
        combined.sort(key=lambda x: x["timestamp"], reverse=True)
        return JSONResponse(content={"status": "success", "data": combined[:limit]})
    except Exception as e:
        SupabaseLogger.error("api", f"Error in get_system_stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/correlations")
async def get_correlations():
    """Generates a dummy correlation matrix for P0 feature demo"""
    # Note: In a real system we would pull data from supabase and run pd.corr()
    # For now we'll return a static/dummy correlation matrix
    try:
        correlations = [
            {"domain_x": "Sleep Duration", "domain_y": "Trading PnL", "correlation": 0.65, "significance": "high"},
            {"domain_x": "Stress (HRV)", "domain_y": "Spending Velocity", "correlation": -0.72, "significance": "high"},
            {"domain_x": "Workout Intensity", "domain_y": "Focus/Productivity", "correlation": 0.45, "significance": "medium"},
            {"domain_x": "Protein Intake", "domain_y": "Recovery Score", "correlation": 0.81, "significance": "high"},
            {"domain_x": "Market Volatility", "domain_y": "Stress (HRV)", "correlation": -0.55, "significance": "medium"},
        ]
        return JSONResponse(content={"status": "success", "data": correlations})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
