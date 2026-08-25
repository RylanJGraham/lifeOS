import os
import re
import time
import sys
import logging
import requests
from supabase import create_client

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.retry import with_retry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("investment_notifier")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")  # required

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")

if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
    logger.warning("Telegram not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable notifications.")

sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def looks_like_investment(tx: dict) -> bool:
    cat = (tx.get("category") or "").lower()
    m = (tx.get("merchant_name") or "").lower()
    notes = (tx.get("notes") or "").lower()
    if tx.get("is_investment"):
        return True
    if "investment" in cat:
        return True
    # common broker names
    brokers = ["vanguard", "fidelity", "schwab", "robinhood", "interactive", "coinbase", "binance", "etrade", "td ameritrade"]
    if any(b in m for b in brokers):
        return True
    if any(b in notes for b in ["dca", "purchase", "buy", "trade", "invest"]):
        return True
    # Ticker pattern: uppercase 1-5 letters possibly with dot
    if re.search(r"\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b", tx.get("notes" or "") or ""):
        return True
    return False


def infer_ticker(tx: dict) -> str | None:
    notes = tx.get("notes") or ""
    m = tx.get("merchant_name") or ""
    # Try to find bracketed tickers or obvious patterns
    match = re.search(r"\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b", notes)
    if match:
        return match.group(1)
    # merchant contains ticker (e.g., 'Vanguard — VOO Purchase')
    match = re.search(r"VOO|QQQ|BTC|ETH|[A-Z]{1,5}", m)
    if match:
        return match.group(0)
    return None


@with_retry(max_retries=2, base_delay=2.0, exceptions=(Exception,))
def _send_telegram_once(text: str) -> requests.Response:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text}
    r = requests.post(url, json=payload, timeout=8.0)
    r.raise_for_status()
    return r


def send_telegram(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram not configured; skipping send")
        return False
    try:
        _send_telegram_once(text)
        return True
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


def _fetch_candidates():
    if not sb:
        logger.error("Supabase client not initialized")
        return []
    try:
        res = sb.table("transactions").select("id, transaction_date, merchant_name, amount, category, notes, is_investment, ticker, notified").eq("notified", False).limit(200).order("created_at", {"ascending": False}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching transactions: {e}")
        return []


def _process_tx(tx: dict) -> bool:
    """Notify for a single transaction and mark it notified. Returns True if sent."""
    if not looks_like_investment(tx):
        return False
    tkr = tx.get("ticker") or infer_ticker(tx) or ""
    txt = (
        f"📈 Investment detected:\n"
        f"Date: {tx.get('transaction_date')}\n"
        f"Merchant: {tx.get('merchant_name')}\n"
        f"Amount: ${abs(float(tx.get('amount') or 0)):,}\n"
    )
    if tkr:
        txt += f"Ticker: {tkr}\n"
    txt += "\nActions: Reply in Telegram to confirm or review in the dashboard."

    sent = send_telegram(txt)
    if sent:
        try:
            sb.table("transactions").update({"notified": True}).eq("id", tx.get("id")).execute()
            logger.info(f"Notified and marked tx {tx.get('id')}")
        except Exception as e:
            logger.error(f"Failed to mark transaction notified: {e}")
    return sent


def run_once():
    """One-shot notifier run. Safe for Task Scheduler / pipeline."""
    candidates = _fetch_candidates()
    logger.info(f"Investment notifier: scanning {len(candidates)} un-notified transactions")
    sent = 0
    for tx in candidates:
        if _process_tx(tx):
            sent += 1
    logger.info(f"Investment notifier: sent {sent} notifications")
    return sent


def poll_and_notify(poll_interval: int = 30):
    if not sb:
        logger.error("Supabase client not initialized")
        return
    logger.info("Starting investment notifier loop")
    while True:
        run_once()
        time.sleep(poll_interval)


if __name__ == "__main__":
    mode = os.getenv("NOTIFIER_MODE", "loop")
    if mode == "once":
        run_once()
    else:
        poll_and_notify()
