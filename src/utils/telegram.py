"""Outbound-only Telegram delivery, used as notify()'s fallback channel while
push is unavailable (no registered devices). Inbound Telegram chat stays
retired — see TELEGRAM_ENABLED in api.py."""
import logging
import os

import requests

logger = logging.getLogger("telegram")


def telegram_configured() -> bool:
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID"))


def send_telegram(text: str) -> bool:
    """Send plain text to the owner's chat. Never raises."""
    token, chat_id = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text[:4000]},
            timeout=8,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Telegram send failed: {e}")
        return False
