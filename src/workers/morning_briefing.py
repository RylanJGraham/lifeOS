import os
import asyncio
import httpx
import logging
from datetime import datetime
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("morning_briefing")

load_dotenv()

async def fetch_sleep_data():
    """Stub to fetch last 24h sleep from health_metrics via Supabase."""
    # Implement actual DB query here
    return {"duration": "6h 12m", "hrv": "38ms"}

async def fetch_calendar():
    """Stub to fetch today's calendar events from Supabase memory (Voice Memos)."""
    # In full implementation, we query the `memories` table for domain="calendar" 
    # where the extracted date matches today.
    return ["10:00 AM - Standup (from Voice Memo)", "2:00 PM - Design Review (from Voice Memo)"]

async def fetch_finnhub_watchlist():
    """Stub to fetch watchlist prices via Finnhub."""
    # Implement Finnhub API call
    return {"AAPL": 150.0, "TSLA": 200.0}

async def generate_and_send_briefing():
    """
    1. Fetch last 24h sleep from health_metrics
    2. Fetch today's calendar from local voice memo memories
    3. Fetch watchlist prices via Finnhub
    4. Fetch recent symptom patterns
    5. Call Claude 3.5 Sonnet with structured prompt
    6. Send to Telegram with inline buttons (👍/👎 for feedback)
    """
    logger.info("Generating morning briefing...")
    
    sleep_data = await fetch_sleep_data()
    calendar = await fetch_calendar()
    stocks = await fetch_finnhub_watchlist()
    
    # In a full implementation, we pass these to Claude via OpenRouter
    prompt = f"""
    Generate a morning briefing based on:
    Sleep: {sleep_data}
    Calendar: {calendar}
    Stocks: {stocks}
    """
    
    # Mock LLM Response
    briefing_text = "Good morning! Your HRV is slightly lower today. Consider a light workout. You have 2 meetings."
    
    # Send to Telegram
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "123456789") # Hardcoded for now, should pull from DB/env
    
    if bot_token and bot_token != "123456:ABC-DEF":
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        # Include inline keyboard for feedback
        keyboard = {
            "inline_keyboard": [[
                {"text": "👍 Accurate", "callback_data": "briefing_feedback_good"},
                {"text": "👎 Inaccurate", "callback_data": "briefing_feedback_bad"}
            ]]
        }
        
        payload = {
            "chat_id": chat_id,
            "text": briefing_text,
            "reply_markup": keyboard
        }
        
        async with httpx.AsyncClient() as client:
            try:
                await client.post(url, json=payload)
                logger.info("Briefing sent to Telegram successfully.")
            except Exception as e:
                logger.error(f"Failed to send to Telegram: {e}")
    else:
        logger.warning("TELEGRAM_BOT_TOKEN not configured. Skipping sending.")
        logger.info(f"Briefing content: {briefing_text}")

if __name__ == "__main__":
    asyncio.run(generate_and_send_briefing())
