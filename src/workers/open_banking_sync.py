"""
EU Open Banking sync scaffold.

Supports GoCardless (formerly Nordigen), Salt Edge, and Plaid EU as backends.
Only the skeleton and config parsing are implemented; each provider needs
account id / secret / agreement ids set in .env before it can pull live data.

When a provider is configured, this worker fetches EUR account transactions
for the last 90 days and inserts them into the `transactions` table, skipping
duplicates by (user_id, transaction_date, amount, merchant_name).

Run manually:
    python src/workers/open_banking_sync.py
Or trigger from the dashboard pipeline: open-banking-sync.
"""
import os
import sys
import logging
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("open_banking_sync")


def _env(key: str) -> str | None:
    return os.getenv(key) or os.getenv(key.replace("_", "")) or None


def _normalize_merchant(raw: str | None) -> str:
    return (raw or "Open Banking").strip()[:120]


def _insert_transactions(rows: list[dict], user_id: str) -> int:
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            logger.error("Supabase not configured")
            return 0
        sb = create_client(url, key)
    except Exception as e:
        logger.error(f"Could not create Supabase client: {e}")
        return 0

    inserted = 0
    for r in rows:
        try:
            dup = sb.table("transactions").select("id") \
                .eq("user_id", user_id) \
                .eq("transaction_date", r["transaction_date"]) \
                .eq("amount", r["amount"]) \
                .ilike("merchant_name", r["merchant_name"]) \
                .limit(1).execute()
            if dup.data:
                continue
            sb.table("transactions").insert({**r, "user_id": user_id}).execute()
            inserted += 1
        except Exception as e:
            logger.warning(f"Failed to insert transaction {r.get('merchant_name')}: {e}")
    return inserted


def _run_gocardless() -> int:
    """Skeleton for GoCardless Bank Account Data API."""
    secret_id = _env("GOCARDLESS_SECRET_ID")
    secret_key = _env("GOCARDLESS_SECRET_KEY")
    account_id = _env("GOCARDLESS_ACCOUNT_ID")
    if not (secret_id and secret_key and account_id):
        logger.info("GoCardless not configured; skipping.")
        return 0
    logger.warning("GoCardless live fetch is not yet implemented; configure requisition id and call API here.")
    return 0


def _run_saltedge() -> int:
    """Skeleton for Salt Edge API."""
    app_id = _env("SALTEDGE_APP_ID")
    secret = _env("SALTEDGE_SECRET")
    customer_id = _env("SALTEDGE_CUSTOMER_ID")
    if not (app_id and secret and customer_id):
        logger.info("Salt Edge not configured; skipping.")
        return 0
    logger.warning("Salt Edge live fetch is not yet implemented; configure login id and call API here.")
    return 0


def _run_plaid_eu() -> int:
    """Skeleton for Plaid EU API."""
    client_id = _env("PLAID_CLIENT_ID")
    secret = _env("PLAID_SECRET")
    access_token = _env("PLAID_ACCESS_TOKEN")
    if not (client_id and secret and access_token):
        logger.info("Plaid EU not configured; skipping.")
        return 0
    logger.warning("Plaid EU live fetch is not yet implemented; use /transactions/get endpoint here.")
    return 0


def run_sync():
    user_id = os.getenv("LIFEOS_USER_ID") or "00000000-0000-0000-0000-000000000000"
    total = 0
    total += _run_gocardless()
    total += _run_saltedge()
    total += _run_plaid_eu()
    logger.info(f"Open Banking sync complete: {total} transactions inserted")


if __name__ == "__main__":
    run_sync()
