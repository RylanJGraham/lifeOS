import os
import httpx
import logging
import base64
from datetime import datetime, timezone
import fitz  # PyMuPDF
from fastapi import APIRouter, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from graph import app_graph

load_dotenv()

router = APIRouter()
logger = logging.getLogger("telegram_webhook")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
TELEGRAM_FILE_URL = f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}"

async def send_telegram_message(chat_id: int, text: str):
    async with httpx.AsyncClient() as client:
        payload = {
            "chat_id": chat_id,
            "text": text
        }
        await client.post(f"{TELEGRAM_API_URL}/sendMessage", json=payload)

async def get_telegram_file(file_id: str) -> bytes:
    async with httpx.AsyncClient() as client:
        # Get file path
        res = await client.get(f"{TELEGRAM_API_URL}/getFile?file_id={file_id}")
        data = res.json()
        if not data.get("ok"):
            logger.error(f"Failed to get file path: {data}")
            return None
            
        file_path = data["result"]["file_path"]
        
        # Download file
        file_res = await client.get(f"{TELEGRAM_FILE_URL}/{file_path}")
        return file_res.content

def process_telegram_message(chat_id: int, message: dict):
    try:
        # Check text
        if "text" in message:
            text = message["text"]
            if text.startswith("/start"):
                # Already handled in webhook sync
                return
            
            logger.info("Routing text to graph...")
            result = app_graph.invoke({"input_type": "text", "content": text})
            
            import asyncio
            asyncio.run(send_telegram_message(chat_id, result.get("response", "Done!")))
            
        elif "document" in message:
            doc = message["document"]
            file_name = doc.get("file_name", "").lower()
            if file_name.endswith(".pdf"):
                logger.info("Downloading PDF...")
                import asyncio
                file_bytes = asyncio.run(get_telegram_file(doc["file_id"]))
                
                if not file_bytes:
                    asyncio.run(send_telegram_message(chat_id, "Failed to download PDF."))
                    return
                
                # Extract text
                logger.info("Extracting PDF text...")
                try:
                    pdf = fitz.open(stream=file_bytes, filetype="pdf")
                    pdf_text = ""
                    for page in pdf:
                        pdf_text += page.get_text()
                    pdf.close()
                    
                    if not pdf_text.strip():
                        asyncio.run(send_telegram_message(chat_id, "Extracted PDF is empty or could not be parsed."))
                        return
                        
                    logger.info("Routing PDF text to graph...")
                    result = app_graph.invoke({"input_type": "pdf", "content": pdf_text})
                    asyncio.run(send_telegram_message(chat_id, result.get("response", "Parsed!")))
                    
                except Exception as e:
                    logger.error(f"PDF Parsing error: {e}")
                    asyncio.run(send_telegram_message(chat_id, "Error parsing PDF."))
            else:
                import asyncio
                asyncio.run(send_telegram_message(chat_id, "Unsupported document type. Only PDFs are supported for now."))

        elif "photo" in message:
            photos = message["photo"]
            # Get highest resolution photo (last in the array)
            best_photo = photos[-1]
            logger.info("Downloading photo...")
            
            import asyncio
            file_bytes = asyncio.run(get_telegram_file(best_photo["file_id"]))
            if not file_bytes:
                asyncio.run(send_telegram_message(chat_id, "Failed to download photo."))
                return
                
            b64_image = base64.b64encode(file_bytes).decode('utf-8')
            caption = message.get("caption")

            logger.info("Routing Image Base64 to graph...")
            result = app_graph.invoke({"input_type": "image", "content": b64_image, "caption": caption})
            asyncio.run(send_telegram_message(chat_id, result.get("response", "Parsed!")))

    except Exception as e:
        logger.error(f"Graph execution error: {e}")
        import asyncio
        asyncio.run(send_telegram_message(chat_id, f"Error executing AI graph: {str(e)}"))

async def answer_callback_query(callback_query_id: str, text: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{TELEGRAM_API_URL}/answerCallbackQuery",
            json={"callback_query_id": callback_query_id, "text": text},
        )


def process_goal_checkin_callback(chat_id: int, callback_query: dict):
    """Records a Yes/No answer from a goal_checkin inline button (sent by
    workers/goal_checkin.py) as a goal_checkins row and updates the streak."""
    import asyncio
    try:
        _, goal_id, answer = callback_query["data"].split(":", 2)
    except (ValueError, KeyError):
        logger.error(f"Malformed goal_checkin callback: {callback_query.get('data')}")
        return

    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        sb = create_client(url, os.getenv("SUPABASE_SERVICE_KEY"))

        res = sb.table("goals").select("*").eq("id", goal_id).limit(1).execute()
        if not res.data:
            asyncio.run(answer_callback_query(callback_query["id"], "Goal not found."))
            return
        goal = res.data[0]

        stayed_on_track = answer == "yes"
        current = float(goal.get("current_value") or 0)
        new_value = current + 1 if stayed_on_track else 0
        note = (
            f"Check-in ({goal.get('checkin_cadence') or 'manual'}): "
            f"stayed on track (streak {new_value:g})" if stayed_on_track
            else f"Check-in ({goal.get('checkin_cadence') or 'manual'}): slipped — streak reset"
        )

        sb.table("goal_checkins").insert({
            "goal_id": goal_id,
            "user_id": goal.get("user_id"),
            "note": note,
            "value": new_value,
        }).execute()

        update_fields = {"current_value": new_value, "updated_at": datetime.now(timezone.utc).isoformat()}
        target = goal.get("target_value")
        achieved = stayed_on_track and target is not None and new_value >= float(target)
        if achieved:
            update_fields["status"] = "achieved"
        sb.table("goals").update(update_fields).eq("id", goal_id).execute()

        if achieved:
            reply = f"🟢 Goal achieved: {goal.get('title')} — target of {float(target):g} {goal.get('unit') or ''} reached. Well done."
        elif stayed_on_track:
            reply = f"Logged ✅ {goal.get('title')}: streak now {new_value:g} {goal.get('unit') or 'days'}."
        else:
            reply = f"Logged. {goal.get('title')} streak reset — tomorrow is a new day."

        asyncio.run(answer_callback_query(callback_query["id"], "Check-in logged."))
        asyncio.run(send_telegram_message(chat_id, reply))
    except Exception as e:
        logger.error(f"Goal check-in callback error: {e}")
        asyncio.run(answer_callback_query(callback_query["id"], "Failed to log check-in."))


@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        update = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse Telegram update: {e}")
        return JSONResponse(status_code=400, content={"status": "invalid JSON"})

    if "callback_query" in update:
        cq = update["callback_query"]
        chat_id = cq["message"]["chat"]["id"]
        if (cq.get("data") or "").startswith("goal_checkin:"):
            background_tasks.add_task(process_goal_checkin_callback, chat_id, cq)
        else:
            await answer_callback_query(cq["id"], "Noted.")
        return JSONResponse(content={"status": "ok"})

    if "message" in update:
        message = update["message"]
        chat_id = message["chat"]["id"]
        
        if "text" in message and message["text"].startswith("/start"):
            await send_telegram_message(chat_id, "Life-OS AI Core online. Ready for multimodal input.")
            return JSONResponse(content={"status": "ok"})
            
        await send_telegram_message(chat_id, "Received. Sending to LangGraph AI pipeline...")
        
        # Process in background so Telegram gets a quick 200 OK
        background_tasks.add_task(process_telegram_message, chat_id, message)

    return JSONResponse(content={"status": "ok"})
