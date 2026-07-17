import os
import re
import time
import logging
import requests
from supabase import create_client

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


def send_telegram(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram not configured; skipping send")
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text}
    try:
        r = requests.post(url, json=payload, timeout=8.0)
        r.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


def poll_and_notify(poll_interval: int = 30):
    if not sb:
        logger.error("Supabase client not initialized")
        return
    logger.info("Starting investment notifier loop")
    while True:
        try:
            res = sb.table("transactions").select("id, transaction_date, merchant_name, amount, category, notes, is_investment, ticker, notified").eq("notified", False).limit(200).order("created_at", {"ascending": False}).execute()
            rows = res.data or []
            logger.debug(f"Fetched {len(rows)} candidate transactions")
            to_notify = []
            for tx in rows:
                if looks_like_investment(tx):
                    tx_ticker = tx.get("ticker") or infer_ticker(tx) or ""
                    to_notify.append((tx, tx_ticker))

            for tx, tkr in to_notify:
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
        except Exception as e:
            logger.error(f"Error polling transactions: {e}")

        time.sleep(poll_interval)


if __name__ == "__main__":
    # Run once (for cron) or long-running loop
    mode = os.getenv("NOTIFIER_MODE", "loop")
    if mode == "once":
        # single run
        try:
            res = sb.table("transactions").select("id, transaction_date, merchant_name, amount, category, notes, is_investment, ticker, notified").eq("notified", False).limit(200).order("created_at", {"ascending": False}).execute()
            rows = res.data or []
            to_notify = []
            for tx in rows:
                if looks_like_investment(tx):
                    tkr = tx.get("ticker") or infer_ticker(tx) or ""
                    txt = (
                        f"📈 Investment detected:\nDate: {tx.get('transaction_date')}\nMerchant: {tx.get('merchant_name')}\nAmount: ${abs(float(tx.get('amount') or 0)):,}\n"
                    )
                    if tkr:
                        txt += f"Ticker: {tkr}\n"
                    send_telegram(txt)
        except Exception as e:
            logger.error(f"One-shot run failed: {e}")
    else:
        poll_and_notify()
