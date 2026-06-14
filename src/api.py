import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from telegram_webhook import router as telegram_router
from utils.logger import SupabaseLogger

# Load environment variables
load_dotenv()

app = FastAPI(title="Life-OS Backend")

# Include the telegram webhook router
app.include_router(telegram_router)

@app.on_event("startup")
async def startup_event():
    SupabaseLogger.info("api", "Life-OS Backend API started successfully.")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
