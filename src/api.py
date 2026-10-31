import os
import re
import json
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from pydantic import BaseModel

from auth import require_auth, allowed_origins, AuthContext
from utils.secrets import SecretsNotConfigured
from utils.logger import SupabaseLogger
from chat_service import handle_chat
from pipeline_service import list_pipelines, run_pipeline
from workers.action_items import mark_resolved

# Load environment variables
load_dotenv()

app = FastAPI(title="Life-OS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

# Telegram is being retired: the webhook is only mounted when explicitly
# re-enabled with TELEGRAM_ENABLED=true. Push + the in-app Inbox are the
# notification channels (see utils/notify.py).
TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "").lower() in ("1", "true", "yes")
if TELEGRAM_ENABLED:
    from telegram_webhook import router as telegram_router
    app.include_router(telegram_router)

@app.on_event("startup")
async def startup_event():
    SupabaseLogger.info("api", "Life-OS Backend API started successfully.")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    public_domain = os.getenv("PUBLIC_DOMAIN") or os.getenv("NGROK_DOMAIN")
    if TELEGRAM_ENABLED and bot_token and public_domain:
        webhook_url = f"https://{public_domain}/webhook"
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
    # Check OpenRouter (cloud LLM — the backend no longer requires local Ollama)
    openrouter_status = "ok" if os.getenv("OPENROUTER_API_KEY") else "error"

    # Check Supabase
    supabase_status = "error"
    try:
        from utils.supabase_client import get_supabase
        sb = get_supabase()
        if sb:
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
            "openrouter": openrouter_status,
            "supabase": supabase_status,
            "ngrok": "ok"
        }
    }

@app.get("/telegram/webhook-info")
async def telegram_webhook_info(auth: AuthContext = Depends(require_auth)):
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
    from utils.supabase_client import get_supabase
    supabase = get_supabase()
    if supabase:
        try:
            user_id = auth.user_id

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
async def receive_sleep_data(request: Request, auth: AuthContext = Depends(require_auth)):
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

        from utils.supabase_client import get_supabase
        supabase = get_supabase()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured.")

        user_id = auth.user_id

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
async def receive_health_metrics(request: Request, auth: AuthContext = Depends(require_auth)):
    """
    Receives daily health metrics pushed from an iOS Shortcut (Apple Health).
    """
    try:
        data = await request.json()
        SupabaseLogger.info("api", "Received Apple Health metrics payload.")

        from utils.supabase_client import get_supabase
        supabase = get_supabase()
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured.")

        user_id = auth.user_id

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
async def get_system_stream(limit: int = 20, _: AuthContext = Depends(require_auth)):
    """Fetches the latest system logs and ai insights for the anomaly stream."""
    try:
        from utils.supabase_client import get_supabase
        supabase = get_supabase()
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
    image: str | None = None  # deprecated: single base64-encoded image (no data: prefix)
    images: list[str] | None = None  # multiple base64-encoded images (no data: prefix)
    session_id: str | None = None  # optional web session id for persistent threads
    dry_run: bool = False  # if true, parse but do not persist (preview mode)

@app.post("/api/chat")
async def chat(req: ChatRequest, auth: AuthContext = Depends(require_auth)):
    """Send a text message (optionally with one or more images) to the LangGraph agent."""
    images = list(req.images or [])
    if req.image:
        images.insert(0, req.image)
    if not (req.message or "").strip() and not images:
        raise HTTPException(status_code=400, detail="Message or image is required.")
    from fastapi.concurrency import run_in_threadpool
    try:
        session_id = req.session_id or "anonymous"
        user_id = auth.user_id
        return await run_in_threadpool(
            handle_chat,
            req.message,
            images=images,
            user_id=user_id,
            source="web",
            external_id=session_id,
            dry_run=req.dry_run,
        )
    except Exception as e:
        SupabaseLogger.error("web-chat", f"Chat request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class GoalsChatRequest(BaseModel):
    message: str = ""
    history: list[dict] = []

@app.post("/api/goals/chat")
async def goals_chat(req: GoalsChatRequest, _=Depends(require_auth)):
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


class GoalCheckinRequest(BaseModel):
    goal_id: str
    answer: str  # "yes" or "no"
    insight_id: str | None = None


@app.post("/api/goals/checkin")
async def goals_checkin(req: GoalCheckinRequest, _=Depends(require_auth)):
    """Record a Yes/No habit check-in and update the goal streak."""
    from datetime import datetime, timezone
    from workers.action_items import mark_resolved
    if req.answer not in ("yes", "no"):
        raise HTTPException(status_code=400, detail="answer must be 'yes' or 'no'.")
    try:
        from utils.supabase_client import get_supabase
        sb = get_supabase()
        if sb is None:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        res = sb.table("goals").select("*").eq("id", req.goal_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Goal not found")
        goal = res.data[0]

        stayed_on_track = req.answer == "yes"
        current = float(goal.get("current_value") or 0)
        new_value = current + 1 if stayed_on_track else 0
        note = (
            f"Check-in ({goal.get('checkin_cadence') or 'manual'}): "
            f"stayed on track (streak {new_value:g})" if stayed_on_track
            else f"Check-in ({goal.get('checkin_cadence') or 'manual'}): slipped — streak reset"
        )

        sb.table("goal_checkins").insert({
            "goal_id": req.goal_id,
            "user_id": goal.get("user_id"),
            "note": note,
            "value": new_value,
        }).execute()

        update_fields = {"current_value": new_value, "updated_at": datetime.now(timezone.utc).isoformat()}
        target = goal.get("target_value")
        achieved = stayed_on_track and target is not None and new_value >= float(target)
        if achieved:
            update_fields["status"] = "achieved"
        sb.table("goals").update(update_fields).eq("id", req.goal_id).execute()

        if req.insight_id:
            try:
                mark_resolved("goals", "Check-in answered", insight_id=req.insight_id)
            except Exception:
                pass

        return {"status": "success", "streak": new_value, "achieved": achieved}
    except HTTPException:
        raise
    except Exception as e:
        SupabaseLogger.error("goals-checkin", f"Goal check-in failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BudgetCoachRequest(BaseModel):
    message: str = ""
    history: list[dict] = []

@app.post("/api/budget-coach")
async def budget_coach(req: BudgetCoachRequest, _=Depends(require_auth)):
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
async def personas_chat(req: PersonaChatRequest, _=Depends(require_auth)):
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
async def get_pipelines(_=Depends(require_auth)):
    """List available data-ingest pipelines with their current run status."""
    return JSONResponse(content={"status": "success", "data": list_pipelines()})

@app.post("/api/pipelines/{pipeline_id}/run")
async def trigger_pipeline(pipeline_id: str, _=Depends(require_auth)):
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
async def calculate_targets(req: TargetsRequest, _=Depends(require_auth)):
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
async def get_correlations(_: AuthContext = Depends(require_auth)):
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

@app.post("/statements/upload")
async def upload_statement(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
):
    """Accept a bank/CC PDF statement, save it to disk, record it in
    statement_uploads, and queue a PDF-statement-sync pipeline run."""
    import shutil
    user_id = auth.user_id
    safe_name = os.path.basename((file.filename or "").replace("\\", "/"))
    if not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF statements are supported.")

    statement_dir = os.environ.get("STATEMENT_DIRECTORY", "./data/statements")
    os.makedirs(statement_dir, exist_ok=True)
    dest_path = os.path.join(statement_dir, f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{safe_name}")

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    try:
        from utils.supabase_client import get_supabase
        sb = get_supabase()
        if sb:
            upload = sb.table("statement_uploads").insert({
                "user_id": user_id,
                "file_name": safe_name,
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


# ─── Supplements ───────────────────────────────────────────────
class SupplementLookupRequest(BaseModel):
    brand: str
    name: str

class SupplementAddRequest(BaseModel):
    item: dict  # the looked-up supplement dict
    time_of_day: str  # "morning" | "evening" | "anytime"
    hour: int  # 0-23

class SupplementRemoveRequest(BaseModel):
    item_id: str

@app.post("/api/supplements/lookup")
async def supplement_lookup(req: SupplementLookupRequest, _=Depends(require_auth)):
    """Use the LLM to look up a supplement's nutrition info by brand + name."""
    from supplement_service import lookup_supplement
    try:
        result = lookup_supplement(req.brand, req.name)
        return JSONResponse(content={"status": "success", "supplement": result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/supplements")
async def supplement_list(_=Depends(require_auth)):
    """List the user's current supplement schedule."""
    from supplement_service import list_supplements
    from nodes.shared import supabase
    try:
        policy = list_supplements(supabase)
        return JSONResponse(content={"status": "success", "policy": policy})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/supplements")
async def supplement_add(req: SupplementAddRequest, _=Depends(require_auth)):
    """Add a supplement to the user's schedule."""
    from supplement_service import add_supplement
    from nodes.shared import supabase
    try:
        entry = add_supplement(supabase, req.item, req.time_of_day, req.hour)
        return JSONResponse(content={"status": "success", "supplement": entry})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/supplements")
async def supplement_remove(req: SupplementRemoveRequest, _=Depends(require_auth)):
    """Remove a supplement from the user's schedule."""
    from supplement_service import remove_supplement
    from nodes.shared import supabase
    try:
        ok = remove_supplement(supabase, req.item_id)
        return JSONResponse(content={"status": "success" if ok else "not_found"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ─── Notifications ─────────────────────────────────────────────
class NotificationPrefsRequest(BaseModel):
    push_enabled: bool | None = None
    kinds: dict[str, bool] | None = None
    quiet_start: str | None = None  # "HH:MM" or "" to clear
    quiet_end: str | None = None
    timezone: str | None = None


@app.get("/api/notifications")
async def notifications_list(limit: int = 50, unread_only: bool = False, auth: AuthContext = Depends(require_auth)):
    """Notification history for the Inbox, newest first, plus the unread count."""
    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    q = sb.table("notifications").select("*").eq("user_id", auth.user_id)
    if unread_only:
        q = q.is_("read_at", "null")
    rows = q.order("created_at", desc=True).limit(max(1, min(limit, 200))).execute().data or []
    unread = sb.table("notifications").select("id", count="exact").eq("user_id", auth.user_id).is_("read_at", "null").execute()
    return {"status": "success", "data": rows, "unread": unread.count or 0}


@app.post("/api/notifications/read")
async def notifications_mark_read(ids: list[str] | None = None, auth: AuthContext = Depends(require_auth)):
    """Mark the given notification ids read, or all of them when no ids are sent."""
    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    q = sb.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("user_id", auth.user_id).is_("read_at", "null")
    if ids:
        q = q.in_("id", ids)
    res = q.execute()
    return {"status": "success", "updated": len(res.data or [])}


@app.get("/api/notifications/prefs")
async def notification_prefs_get(auth: AuthContext = Depends(require_auth)):
    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    res = sb.table("notification_prefs").select("*").eq("user_id", auth.user_id).limit(1).execute()
    prefs = res.data[0] if res.data else {
        "user_id": auth.user_id, "push_enabled": True, "kinds": {},
        "quiet_start": None, "quiet_end": None, "timezone": "UTC",
    }
    return {"status": "success", "data": prefs}


@app.put("/api/notifications/prefs")
async def notification_prefs_put(req: NotificationPrefsRequest, auth: AuthContext = Depends(require_auth)):
    from zoneinfo import ZoneInfo
    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    row: dict = {"user_id": auth.user_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if req.push_enabled is not None:
        row["push_enabled"] = req.push_enabled
    if req.kinds is not None:
        row["kinds"] = req.kinds
    for field in ("quiet_start", "quiet_end"):
        value = getattr(req, field)
        if value is not None:
            if value and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
                raise HTTPException(status_code=400, detail=f"{field} must be HH:MM")
            row[field] = value or None
    if req.timezone:
        try:
            ZoneInfo(req.timezone)
        except Exception:
            raise HTTPException(status_code=400, detail="Unknown timezone.")
        row["timezone"] = req.timezone
    sb.table("notification_prefs").upsert(row, on_conflict="user_id").execute()
    return await notification_prefs_get(auth)


class PushTokenRequest(BaseModel):
    expo_push_token: str
    platform: str = "ios"


@app.post("/api/notifications/devices")
async def register_device(req: PushTokenRequest, auth: AuthContext = Depends(require_auth)):
    """Register this device's Expo push token for the authenticated user."""
    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    sb.table("device_push_tokens").upsert({
        "user_id": auth.user_id,
        "expo_push_token": req.expo_push_token,
        "platform": req.platform,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "invalid_at": None,
    }, on_conflict="expo_push_token").execute()
    return {"status": "success"}


@app.post("/api/notifications/test")
async def notification_test(auth: AuthContext = Depends(require_auth)):
    """Send a test notification to this user's devices."""
    from fastapi.concurrency import run_in_threadpool
    from utils.notify import notify
    ok = await run_in_threadpool(
        notify, "system", "LifeOS test notification", "Push is working.",
        deep_link="/inbox", user_id=auth.user_id,
    )
    return {"status": "success" if ok else "failed"}


# ─── Calendar ──────────────────────────────────────────────────
class CalendarEventRequest(BaseModel):
    title: str | None = None
    notes: str | None = None
    location: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    all_day: bool | None = None
    kind: str | None = None
    recurrence: str | None = None
    recurrence_until: str | None = None
    reminder_offsets: list[int] | None = None


@app.get("/api/calendar/events")
async def calendar_events(start: str, end: str, tz: str | None = None, auth: AuthContext = Depends(require_auth)):
    """Events (user + derived goal deadlines / RSU vests) between two ISO datetimes."""
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    try:
        s, e = cal._parse_dt(start), cal._parse_dt(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="start/end must be ISO datetimes.")
    if e < s or (e - s).days > 400:
        raise HTTPException(status_code=400, detail="Window must be 0-400 days.")
    data = await run_in_threadpool(cal.list_events, auth.user_id, s, e, tz)
    return {"status": "success", "data": data}


@app.post("/api/calendar/events")
async def calendar_create(req: CalendarEventRequest, auth: AuthContext = Depends(require_auth)):
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    if not req.starts_at:
        raise HTTPException(status_code=400, detail="starts_at is required.")
    try:
        row = await run_in_threadpool(cal.create_event, auth.user_id, req.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "data": row}


@app.patch("/api/calendar/events/{event_id}")
async def calendar_update(event_id: str, req: CalendarEventRequest, auth: AuthContext = Depends(require_auth)):
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    try:
        row = await run_in_threadpool(cal.update_event, auth.user_id, event_id, req.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if row is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return {"status": "success", "data": row}


@app.delete("/api/calendar/events/{event_id}")
async def calendar_delete(event_id: str, auth: AuthContext = Depends(require_auth)):
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    try:
        deleted = await run_in_threadpool(cal.delete_event, auth.user_id, event_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found.")
    return {"status": "success"}


def _feed_url(request: Request, token: str) -> str:
    domain = os.getenv("PUBLIC_DOMAIN")
    base = f"https://{domain}" if domain else str(request.base_url).rstrip("/")
    return f"{base}/calendar/feed/{token}.ics"


@app.get("/api/calendar/feed")
async def calendar_feed_url(request: Request, auth: AuthContext = Depends(require_auth)):
    """The secret iCal subscription URL (created on first use)."""
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    token = await run_in_threadpool(cal.get_feed_token, auth.user_id)
    return {"status": "success", "url": _feed_url(request, token)}


@app.post("/api/calendar/feed/rotate")
async def calendar_feed_rotate(request: Request, auth: AuthContext = Depends(require_auth)):
    """Issue a new feed URL; the previous one stops working."""
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    token = await run_in_threadpool(cal.get_feed_token, auth.user_id, True)
    return {"status": "success", "url": _feed_url(request, token)}


@app.get("/calendar/feed/{token}.ics")
async def calendar_feed(token: str):
    """Public iCal feed. Authenticated by the unguessable token in the URL
    (calendar apps cannot send headers); 404 for an unknown token."""
    import calendar_service as cal
    from fastapi.concurrency import run_in_threadpool
    user_id = await run_in_threadpool(cal.user_for_feed_token, token)
    if not user_id:
        raise HTTPException(status_code=404, detail="Not found.")
    body = await run_in_threadpool(cal.feed_ics, user_id)
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-store"})


# ─── Calendar imports (Outlook / Google / Apple published links → LifeOS) ─
class CalendarSubscriptionRequest(BaseModel):
    name: str = ""
    url: str
    privacy: str = "full"  # "full" | "busy" (store only that you are busy)


@app.get("/api/calendar/subscriptions")
async def calendar_subscriptions(auth: AuthContext = Depends(require_auth)):
    import calendar_import
    from fastapi.concurrency import run_in_threadpool
    return {"status": "success", "data": await run_in_threadpool(calendar_import.list_subscriptions, auth.user_id)}


@app.post("/api/calendar/subscriptions")
async def calendar_subscription_add(req: CalendarSubscriptionRequest, auth: AuthContext = Depends(require_auth)):
    """Subscribe to a published .ics link. The link is fetched and validated
    first; a bad link returns 400 with a reason and nothing is saved."""
    import calendar_import
    from fastapi.concurrency import run_in_threadpool
    try:
        result = await run_in_threadpool(calendar_import.add_subscription, auth.user_id, req.name, req.url, req.privacy)
    except calendar_import.CalendarLinkError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SecretsNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "success", "data": result}


@app.post("/api/calendar/subscriptions/{sub_id}/sync")
async def calendar_subscription_sync(sub_id: str, auth: AuthContext = Depends(require_auth)):
    import calendar_import
    from fastapi.concurrency import run_in_threadpool
    from utils.supabase_client import get_supabase
    rows = get_supabase().table("calendar_subscriptions").select("*").eq("id", sub_id).eq("user_id", auth.user_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Calendar not found.")
    result = await run_in_threadpool(calendar_import.sync_subscription, rows[0])
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=result["error"])
    return {"status": "success", "data": result}


@app.delete("/api/calendar/subscriptions/{sub_id}")
async def calendar_subscription_delete(sub_id: str, auth: AuthContext = Depends(require_auth)):
    """Unsubscribe and remove all events imported from that calendar."""
    import calendar_import
    from fastapi.concurrency import run_in_threadpool
    if not await run_in_threadpool(calendar_import.delete_subscription, auth.user_id, sub_id):
        raise HTTPException(status_code=404, detail="Calendar not found.")
    return {"status": "success"}
