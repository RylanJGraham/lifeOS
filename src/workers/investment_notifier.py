import os
import re
import time
import sys
import logging
from supabase import create_client

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.notify import send_message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("investment_notifier")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")


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


def send_telegram(text: str, tx_id=None) -> bool:
    """Notify via push + Inbox (name kept for existing call sites)."""
    return send_message("investments", text, deep_link="/capital",
                        dedupe_key=f"invest:{tx_id}" if tx_id else None)


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
    txt += "\nReview it in the app."

    sent = send_telegram(txt, tx.get("id"))
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
