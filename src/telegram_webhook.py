import os
import httpx
import logging
import base64
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
            
            logger.info("Routing Image Base64 to graph...")
            result = app_graph.invoke({"input_type": "image", "content": b64_image})
            asyncio.run(send_telegram_message(chat_id, result.get("response", "Parsed!")))

    except Exception as e:
        logger.error(f"Graph execution error: {e}")
        import asyncio
        asyncio.run(send_telegram_message(chat_id, f"Error executing AI graph: {str(e)}"))

@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        update = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse Telegram update: {e}")
        return JSONResponse(status_code=400, content={"status": "invalid JSON"})

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
