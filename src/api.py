import os
import json
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, Depends, Header, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from pydantic import BaseModel

from telegram_webhook import router as telegram_router
from utils.logger import SupabaseLogger
from chat_service import handle_chat
from pipeline_service import list_pipelines, run_pipeline
from workers.action_items import mark_resolved

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

# Shared-secret guard for the money endpoints (chat + pipelines).
# The ngrok URL is public; without this anyone could burn LLM credits.
API_SECRET = os.getenv("API_SECRET")

async def require_api_key(x_api_key: str = Header(None)):
    if API_SECRET and x_api_key != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")

@app.on_event("startup")
async def startup_event():
    SupabaseLogger.info("api", "Life-OS Backend API started successfully.")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    ngrok_domain = os.getenv("NGROK_DOMAIN")
    if bot_token and ngrok_domain:
        webhook_url = f"https://{ngrok_domain}/webhook"
        import asyncio
        import httpx
        # Retry with backoff: at boot the service can start before the network
        # (DNS) is up, and a single failed attempt leaves the bot unreachable.
        for attempt in range(1, 6):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(f"https://api.telegram.org/bot{bot_token}/setWebhook?url={webhook_url}")
                if res.status_code == 200:
                    print(f"Telegram webhook successfully registered to: {webhook_url}")
                    SupabaseLogger.info("api", f"Telegram webhook registered to {webhook_url}")
                    break
                print(f"Failed to register Telegram webhook: {res.text}")
                SupabaseLogger.error("api", f"Failed to register Telegram webhook: {res.text}")
                break
            except Exception as e:
                print(f"Error registering Telegram webhook (attempt {attempt}/5): {e}")
                if attempt < 5:
                    await asyncio.sleep(10 * attempt)
                else:
                    SupabaseLogger.error("api", f"Error registering Telegram webhook after 5 attempts: {e}")

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

ZERO_UUID = "00000000-0000-0000-0000-000000000000"

@app.get("/telegram/webhook-info")
async def telegram_webhook_info(_=Depends(require_api_key)):
    """Fetches Telegram webhook info, persists a health snapshot, and returns it."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        raise HTTPException(status_code=500, detail="Telegram bot token not configured.")

    import httpx
    url = f"https://api.telegram.org/bot{bot_token}/getWebhookInfo"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("description", "Telegram API returned ok=false"))
    except Exception as e:
        SupabaseLogger.error("telegram-webhook", f"Failed to fetch webhook info: {e}")
        raise HTTPException(status_code=502, detail=f"Telegram API error: {e}")

    result = data.get("result", {})
    webhook_url = result.get("url", "")
    pending_update_count = result.get("pending_update_count", 0)
    last_error_date = result.get("last_error_date")
    last_synchronization_error_date = result.get("last_synchronization_error_date")
    error_message = result.get("last_error_message") or result.get("last_synchronization_error_message") or ""

    # Parse the most recent error timestamp we can find.
    last_update_at = None
    for ts in (last_synchronization_error_date, last_error_date):
        if ts:
            try:
                last_update_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                break
            except Exception:
                pass

    if not webhook_url:
        webhook_status = "not_set"
    elif last_error_date or last_synchronization_error_date:
        webhook_status = "failing"
    else:
        webhook_status = "ok"

    # Persist the snapshot to Supabase.
    from utils.logger import get_supabase_client
    supabase = get_supabase_client()
    if supabase:
        try:
            user_id = ZERO_UUID
            try:
                profile_res = supabase.table("user_profiles").select("user_id").limit(1).execute()
                if profile_res.data:
                    user_id = profile_res.data[0]["user_id"]
            except Exception:
                pass

            payload = {
                "user_id": user_id,
                "webhook_url": webhook_url,
                "last_update_at": last_update_at,
                "pending_update_count": pending_update_count,
                "status": webhook_status,
                "error": error_message,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            existing = supabase.table("telegram_webhook_health").select("id").limit(1).execute()
            if existing.data:
                supabase.table("telegram_webhook_health").update(payload).eq("id", existing.data[0]["id"]).execute()
            else:
                supabase.table("telegram_webhook_health").insert(payload).execute()
        except Exception as e:
            SupabaseLogger.error("telegram-webhook", f"Failed to persist webhook health: {e}")

    return {
        "status": "success",
        "webhook_url": webhook_url,
        "last_update_at": last_update_at,
        "pending_update_count": pending_update_count,
        "webhook_status": webhook_status,
        "error": error_message,
    }

@app.post("/api/sleep")
async def receive_sleep_data(request: Request):
    """Receives sleep data (single object or list) and upserts into health_metrics.

    Accepted fields per record (all optional except date):
      date (YYYY-MM-DD), sleep_duration_minutes, deep_sleep_time / sleep_deep_minutes,
      light_sleep_time / sleep_light_minutes, rem_sleep_time / sleep_rem_minutes,
      sleep_bed_time, sleep_wake_time, sleeping_heart_rate
    If no explicit duration is given, total = deep + light + rem.
    """
    try:
        data = await request.json()
        records = data if isinstance(data, list) else [data]

        from utils.logger import get_supabase_client
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured.")

        user_id = "00000000-0000-0000-0000-000000000000"
        try:
            res = supabase.table("user_profiles").select("user_id").limit(1).execute()
            if res.data:
                user_id = res.data[0]["user_id"]
        except Exception:
            pass

        def pick(d, *keys):
            for k in keys:
                if d.get(k) is not None:
                    return d.get(k)
            return None

        saved, skipped = 0, 0
        for rec in records:
            if not isinstance(rec, dict):
                skipped += 1
                continue
            date_str = rec.get("date") or rec.get("recorded_at")
            if not date_str:
                skipped += 1
                continue
            date_str = str(date_str)[:10]

            deep = pick(rec, "sleep_deep_minutes", "deep_sleep_time", "deep")
            rem = pick(rec, "sleep_rem_minutes", "rem_sleep_time", "rem")
            light = pick(rec, "sleep_light_minutes", "light_sleep_time", "light")
            total = pick(rec, "sleep_duration_minutes", "total_sleep_time", "duration")
            if total is None:
                parts = [p for p in (deep, light, rem) if p is not None]
                total = sum(parts) if parts else None

            bed = pick(rec, "sleep_bed_time", "bed_time")
            wake = pick(rec, "sleep_wake_time", "wake_time")
            sleeping_hr = pick(rec, "sleeping_heart_rate")

            notes = f"Sleep sync: total {total} min (deep {deep or 0}, light {light or 0}, REM {rem or 0})"

            payload = {
                "user_id": user_id,
                "recorded_at": date_str,
                "sleep_duration_minutes": total,
                "sleep_deep_minutes": deep,
                "sleep_light_minutes": light,
                "sleep_rem_minutes": rem,
                "sleep_bed_time": bed,
                "sleep_wake_time": wake,
                "sleeping_heart_rate": sleeping_hr,
                "notes": notes,
            }
            payload = {k: v for k, v in payload.items() if v is not None}

            existing_id = None
            try:
                existing = supabase.table("health_metrics").select("id").eq("user_id", user_id).eq("recorded_at", date_str).execute()
                if existing.data:
                    existing_id = existing.data[0]["id"]
            except Exception as e:
                SupabaseLogger.warning("api", f"Sleep upsert lookup failed for {date_str}: {e}")

            try:
                if existing_id:
                    supabase.table("health_metrics").update(payload).eq("id", existing_id).execute()
                else:
                    supabase.table("health_metrics").insert(payload).execute()
                saved += 1
            except Exception as e:
                SupabaseLogger.error("api", f"Failed to save sleep record for {date_str}: {e}")
                skipped += 1

        SupabaseLogger.info("api", f"Sleep data ingested: {saved} saved, {skipped} skipped.")
        return JSONResponse(content={"status": "received", "saved": saved, "skipped": skipped})
    except HTTPException:
        raise
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
        sleep_light = data.get("sleep_light_minutes")
        sleep_rem = data.get("sleep_rem_minutes")
        sleep_bed_time = data.get("sleep_bed_time")
        sleep_wake_time = data.get("sleep_wake_time")
        sleeping_hr = data.get("sleeping_heart_rate")
        rhr = data.get("resting_heart_rate")
        avg_hr = data.get("average_heart_rate")
        min_hr = data.get("min_heart_rate")
        max_hr = data.get("max_heart_rate")
        hrv = data.get("hrv")
        vo2_max = data.get("vo2_max")
        steps = data.get("steps")
        active_calories = data.get("active_calories")
        weight = data.get("body_weight_kg")
        zones = data.get("heart_rate_zones") # dict or JSON

        # Build a text summary for the notes field
        notes_list = []
        if sleep_dur is not None: notes_list.append(f"Sleep: {sleep_dur} min (Deep: {sleep_deep or 0} min, Light: {sleep_light or 0} min, REM: {sleep_rem or 0} min)")
        if sleep_bed_time or sleep_wake_time: notes_list.append(f"Bed: {sleep_bed_time or '?'}, Wake: {sleep_wake_time or '?'}")
        if sleeping_hr is not None: notes_list.append(f"Sleeping HR: {sleeping_hr} bpm")
        if rhr is not None: notes_list.append(f"RHR: {rhr} bpm")
        if avg_hr is not None or min_hr is not None or max_hr is not None:
            notes_list.append(f"Daily HR: avg {avg_hr or '?'} bpm, min {min_hr or '?'} bpm, max {max_hr or '?'} bpm")
        if hrv is not None: notes_list.append(f"HRV: {hrv} ms")
        if steps is not None: notes_list.append(f"Steps: {steps}")
        if active_calories is not None: notes_list.append(f"Active energy: {active_calories} kcal")
        if weight is not None: notes_list.append(f"Weight: {weight} kg")
        if vo2_max is not None: notes_list.append(f"VO2 Max: {vo2_max}")
        if zones is not None: notes_list.append(f"HR Zones: {json.dumps(zones)}")

        notes_str = "Apple Health Sync:\n" + "\n".join(notes_list)

        # Prepare the unified health_metrics record.
        payload = {
            "user_id": user_id,
            "recorded_at": date_str,
            "sleep_duration_minutes": sleep_dur,
            "sleep_deep_minutes": sleep_deep,
            "sleep_light_minutes": sleep_light,
            "sleep_rem_minutes": sleep_rem,
            "sleep_bed_time": sleep_bed_time,
            "sleep_wake_time": sleep_wake_time,
            "sleeping_heart_rate": sleeping_hr,
            "resting_heart_rate": rhr,
            "average_heart_rate": avg_hr,
            "min_heart_rate": min_hr,
            "max_heart_rate": max_hr,
            "hrv": hrv,
            "vo2_max": vo2_max,
            "steps": steps,
            "active_calories": active_calories,
            "body_weight_kg": weight,
            "heart_rate_zones": zones,
            "notes": notes_str,
        }

        # Check for existing record for this date and user
        existing_id = None
        existing_notes = None
        try:
            existing = supabase.table("health_metrics").select("id, notes").eq("user_id", user_id).eq("recorded_at", date_str).execute()
            if existing.data and len(existing.data) > 0:
                existing_id = existing.data[0]["id"]
                existing_notes = existing.data[0].get("notes")
        except Exception as e:
            SupabaseLogger.warning("api", f"Failed to check existing health metrics: {e}")

        try:
            extended_payload = {k: v for k, v in payload.items() if v is not None}
            # Merge notes with any existing notes to avoid losing earlier imports.
            header = "Apple Health Sync:"
            prev_lines = [l for l in (existing_notes or "").split("\n") if l.strip() and not l.startswith(header)]
            new_lines = [l for l in notes_str.split("\n") if l.strip() and not l.startswith(header)]
            combined = new_lines + [l for l in prev_lines if l not in new_lines]
            extended_payload["notes"] = header + "\n" + "\n".join(combined)

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
                fallback_payload = {
                    "user_id": user_id,
                    "recorded_at": date_str,
                    "sleep_duration_minutes": sleep_dur,
                    "sleep_deep_minutes": sleep_deep,
                    "sleep_rem_minutes": sleep_rem,
                    "resting_heart_rate": rhr,
                    "hrv": hrv,
                    "notes": notes_str,
                }
                fallback_payload = {k: v for k, v in fallback_payload.items() if v is not None}
                if existing_id:
                    supabase.table("health_metrics").update(fallback_payload).eq("id", existing_id).execute()
                    SupabaseLogger.info("api", f"Successfully updated health metrics (standard columns fallback) for {date_str}.")
                else:
                    supabase.table("health_metrics").insert(fallback_payload).execute()
                    SupabaseLogger.info("api", "Successfully inserted health metrics (standard columns fallback).")
            except Exception as ex:
                SupabaseLogger.error("api", f"Failed to write health metrics record: {ex}")
                raise HTTPException(status_code=500, detail=f"Database write failed: {ex}")

        # Update current_weight_kg in user_profiles if weight is provided
        if weight is not None:
            try:
                supabase.table("user_profiles").update({"current_weight_kg": weight}).eq("user_id", user_id).execute()
                SupabaseLogger.info("api", f"Successfully updated user profile weight to {weight} kg.")
                mark_resolved("bodycomp", f"Weight logged: {weight:g} kg")
            except Exception as e:
                SupabaseLogger.error("api", f"Failed to update profile weight: {e}")

        # Health metrics from Apple Health satisfy the evening audit.
        try:
            mark_resolved("evening_audit", "Apple Health metrics received")
        except Exception as e:
            SupabaseLogger.warning("api", f"Failed to resolve evening_audit action item: {e}")

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

class ChatRequest(BaseModel):
    message: str = ""
    image: str | None = None  # optional base64-encoded image (no data: prefix)
    session_id: str | None = None  # optional web session id for persistent threads

@app.post("/api/chat")
async def chat(req: ChatRequest, _=Depends(require_api_key)):
    """Send a text message (optionally with an image) to the LangGraph agent."""
    if not (req.message or "").strip() and not (req.image or "").strip():
        raise HTTPException(status_code=400, detail="Message or image is required.")
    from fastapi.concurrency import run_in_threadpool
    try:
        from utils.resolve_user_id import resolve_user_id, ensure_identity
        session_id = req.session_id or "anonymous"
        user_id = resolve_user_id("web", session_id)
        # If the session is not anonymous and we resolved a real user, cache the mapping
        if session_id != "anonymous" and user_id != "00000000-0000-0000-0000-000000000000":
            ensure_identity("web", session_id, user_id)
        return await run_in_threadpool(
            handle_chat,
            req.message,
            req.image,
            user_id=user_id,
            source="web",
            external_id=session_id,
        )
    except Exception as e:
        SupabaseLogger.error("web-chat", f"Chat request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class GoalsChatRequest(BaseModel):
    message: str = ""
    history: list[dict] = []

@app.post("/api/goals/chat")
async def goals_chat(req: GoalsChatRequest, _=Depends(require_api_key)):
    """Chat with the goal strategist; may create/update/delete/check-in goals."""
    if not (req.message or "").strip():
        raise HTTPException(status_code=400, detail="Message is required.")
    from fastapi.concurrency import run_in_threadpool
    from goals_service import handle_goals_chat
    try:
        return await run_in_threadpool(handle_goals_chat, req.message, (req.history or [])[-20:])
    except Exception as e:
        SupabaseLogger.error("goals-chat", f"Goals chat request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BudgetCoachRequest(BaseModel):
    message: str = ""
    history: list[dict] = []

@app.post("/api/budget-coach")
async def budget_coach(req: BudgetCoachRequest, _=Depends(require_api_key)):
    """Chat with the budget coach using salary, rent, bank balance, transactions,
    budgets, and goals."""
    if not (req.message or "").strip():
        raise HTTPException(status_code=400, detail="Message is required.")
    from fastapi.concurrency import run_in_threadpool
    from budget_service import handle_budget_chat
    try:
        reply = await run_in_threadpool(handle_budget_chat, req.message, (req.history or [])[-20:])
        return JSONResponse(content={"status": "success", **reply})
    except Exception as e:
        SupabaseLogger.error("budget-coach", f"Budget coach request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class PersonaChatRequest(BaseModel):
    persona: str = ""
    message: str = ""
    history: list[dict] = []

@app.post("/api/personas/chat")
async def personas_chat(req: PersonaChatRequest, _=Depends(require_api_key)):
    """Chat with a care-team specialist (doctor | nutritionist | pt);
    may create goals (with check-in cadences) or log durable notes."""
    if req.persona not in ("doctor", "nutritionist", "pt"):
        raise HTTPException(status_code=400, detail="persona must be one of: doctor, nutritionist, pt")
    if not (req.message or "").strip():
        raise HTTPException(status_code=400, detail="Message is required.")
    from fastapi.concurrency import run_in_threadpool
    from persona_service import handle_persona_chat
    try:
        return await run_in_threadpool(handle_persona_chat, req.persona, req.message, (req.history or [])[-20:])
    except Exception as e:
        SupabaseLogger.error("persona-chat", f"Persona chat request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pipelines")
async def get_pipelines(_=Depends(require_api_key)):
    """List available data-ingest pipelines with their current run status."""
    return JSONResponse(content={"status": "success", "data": list_pipelines()})

@app.post("/api/pipelines/{pipeline_id}/run")
async def trigger_pipeline(pipeline_id: str, _=Depends(require_api_key)):
    """Trigger a pipeline run in the background."""
    try:
        from fastapi.concurrency import run_in_threadpool
        await run_in_threadpool(run_pipeline, pipeline_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown pipeline: {pipeline_id}")
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return JSONResponse(content={"status": "started", "pipeline_id": pipeline_id})

class TargetsRequest(BaseModel):
    height_cm: float
    age: int
    sex: str = "male"
    physique_description: str = ""
    goal: str = "maintain"              # cut | lean_bulk | bulk | maintain
    activity_level: str = "moderate"    # sedentary | light | moderate | athlete
    current_weight_kg: float | None = None

_ACTIVITY_MULTIPLIERS = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "athlete": 1.725}
_GOAL_ADJUSTMENTS = {"cut": -500, "lean_bulk": 250, "bulk": 500, "maintain": 0}
_PROTEIN_PER_KG = {"cut": 2.2, "lean_bulk": 2.0, "bulk": 1.8, "maintain": 1.8}

@app.post("/api/calculate-targets")
async def calculate_targets(req: TargetsRequest, _=Depends(require_api_key)):
    """AI-assisted TDEE + macro targets. Weight is estimated by the LLM from a
    free-text physique description when the user doesn't know it; the energy
    math itself is deterministic (Mifflin-St Jeor)."""
    from fastapi.concurrency import run_in_threadpool

    def _compute():
        weight = req.current_weight_kg
        weight_estimated = False
        if not weight:
            # LLM estimate from the physique description
            from graph import llm_fast
            from langchain_core.messages import HumanMessage
            if not llm_fast:
                raise RuntimeError("LLM not configured and no weight provided.")
            prompt = (
                f'Estimate the body weight in kg of a {req.age}-year-old {req.sex}, '
                f'{req.height_cm} cm tall, described as: "{req.physique_description}". '
                f'Return ONLY a JSON object like {{"weight_kg": 76}} with your single best estimate.'
            )
            import re as _re, json as _json
            res = llm_fast.invoke([HumanMessage(content=prompt)]).content
            match = _re.search(r'\{.*\}', res, _re.DOTALL)
            weight = float(_json.loads(match.group(0))["weight_kg"])
            weight_estimated = True

        bmr = 10 * weight + 6.25 * req.height_cm - 5 * req.age + (5 if req.sex == "male" else -161)
        tdee = bmr * _ACTIVITY_MULTIPLIERS.get(req.activity_level, 1.55)
        calories = round(tdee + _GOAL_ADJUSTMENTS.get(req.goal, 0))
        protein_g = round(_PROTEIN_PER_KG.get(req.goal, 1.8) * weight)
        fat_g = round(0.9 * weight)
        carbs_g = round(max(0, (calories - protein_g * 4 - fat_g * 9) / 4))
        return {
            "estimated_weight_kg": round(weight, 1),
            "weight_was_estimated": weight_estimated,
            "bmr": round(bmr),
            "tdee": round(tdee),
            "calories": calories,
            "protein_g": protein_g,
            "carbs_g": carbs_g,
            "fat_g": fat_g,
        }

    try:
        return await run_in_threadpool(_compute)
    except Exception as e:
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

@app.get("/telegram/webhook-info")
async def telegram_webhook_info(_=Depends(require_api_key)):
    """Return the current Telegram webhook status from Telegram's API and
    persist a snapshot in Supabase for the /system dashboard."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    ngrok_domain = os.getenv("NGROK_DOMAIN")
    if not bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN not configured")

    import httpx
    webhook_url = f"https://{ngrok_domain}/webhook" if ngrok_domain else "not set"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"https://api.telegram.org/bot{bot_token}/getWebhookInfo")
        data = res.json().get("result", {}) if res.status_code == 200 else {}
    except Exception as e:
        data = {}
        res = None

    last_error_ts = data.get("last_error_date")
    last_sync_ts = data.get("last_synchronization_error_date")
    last_update_ts = last_sync_ts or last_error_ts
    try:
        last_update_at = datetime.fromtimestamp(int(last_update_ts), tz=timezone.utc).isoformat() if last_update_ts else None
    except Exception:
        last_update_at = None

    pending = data.get("pending_update_count") or 0
    url = data.get("url") or webhook_url
    error = data.get("last_error_message") or data.get("last_synchronization_error_message")
    status = "ok"
    if not url or url == "not set":
        status = "not_set"
    elif pending > 5 or error:
        status = "failing"

    # Persist snapshot for dashboard history
    try:
        from utils.logger import get_supabase_client
        sb = get_supabase_client()
        if sb:
            payload = {
                "user_id": "00000000-0000-0000-0000-000000000000",
                "webhook_url": url,
                "last_update_at": last_update_at,
                "last_update_id": data.get("last_update_id"),
                "pending_update_count": pending,
                "status": status,
                "error": error,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            existing = sb.table("telegram_webhook_health").select("id").limit(1).execute()
            if existing.data:
                sb.table("telegram_webhook_health").update(payload).eq("id", existing.data[0]["id"]).execute()
            else:
                sb.table("telegram_webhook_health").insert(payload).execute()
    except Exception as e:
        SupabaseLogger.warning("api", f"Failed to persist webhook health: {e}")

    return JSONResponse(content={
        "status": "success",
        "data": {
            "webhook_url": url,
            "status": status,
            "pending_update_count": pending,
            "last_update_at": last_update_at,
            "error": error,
        },
    })


@app.post("/statements/upload")
async def upload_statement(
    file: UploadFile = File(...),
    user_id: str = "00000000-0000-0000-0000-000000000000",
    _=Depends(require_api_key),
):
    """Accept a bank/CC PDF statement, save it to disk, record it in
    statement_uploads, and queue a PDF-statement-sync pipeline run."""
    import shutil
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF statements are supported.")

    statement_dir = os.environ.get("STATEMENT_DIRECTORY", "./data/statements")
    os.makedirs(statement_dir, exist_ok=True)
    dest_path = os.path.join(statement_dir, f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{file.filename}")

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    try:
        from utils.logger import get_supabase_client
        sb = get_supabase_client()
        if sb:
            upload = sb.table("statement_uploads").insert({
                "user_id": user_id,
                "file_name": file.filename,
                "file_size_bytes": os.path.getsize(dest_path),
                "mime_type": file.content_type or "application/pdf",
                "storage_path": dest_path,
                "status": "pending",
            }).execute()
            upload_id = upload.data[0]["id"] if upload.data else None
        else:
            upload_id = None
    except Exception as e:
        upload_id = None
        SupabaseLogger.warning("api", f"Failed to record statement upload: {e}")

    # Trigger the pipeline in the background
    try:
        from fastapi.concurrency import run_in_threadpool
        await run_in_threadpool(run_pipeline, "pdf-statement-sync")
    except Exception as e:
        SupabaseLogger.warning("api", f"Failed to trigger pdf-statement-sync: {e}")

    return JSONResponse(content={
        "status": "success",
        "message": "Statement uploaded and queued for processing.",
        "upload_id": upload_id,
        "path": dest_path,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
