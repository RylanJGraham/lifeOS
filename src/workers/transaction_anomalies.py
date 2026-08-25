import os
import re
import json
import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta
from dotenv import load_dotenv

from utils.logger import SupabaseLogger

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore
    Client = None  # type: ignore

load_dotenv()
logger = logging.getLogger("transaction_anomalies")
logging.basicConfig(level=logging.INFO)

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000"
LOOKBACK_DAYS = 90
DUPLICATE_WINDOW_DAYS = 2
SUBSCRIPTION_CADENCE_DAYS = 28
Z_SCORE_THRESHOLD = 2.5


def _get_supabase():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key or not create_client:
        logger.error("Supabase credentials missing or client unavailable.")
        return None
    return create_client(url, key)


def _already_ran_today(sb) -> bool:
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        res = (
            sb.table("ai_insights")
            .select("id")
            .eq("domain", "finance_anomaly")
            .gte("generated_at", f"{today}T00:00:00")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Could not check prior anomaly run: {e}")
        return False


def _normalize_merchant(name: str) -> str:
    """Strip common suffixes/prefixes so subscription duplicates are easier to spot."""
    if not name:
        return ""
    n = name.lower().strip()
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    n = re.sub(r"\s+", " ", n)
    # Remove common payment descriptors
    n = re.sub(r"\b(pay pal|paypal|stripe|square|google \*|apple \*|www\.)\b", "", n)
    return n.strip()


def _fetch_transactions(sb, user_id: str):
    since = (datetime.now() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    try:
        res = (
            sb.table("transactions")
            .select("id, transaction_date, merchant_name, amount, category, notes")
            .eq("user_id", user_id)
            .gte("transaction_date", since)
            .order("transaction_date", {"ascending": False})
            .limit(2000)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch transactions: {e}")
        return []


def _detect_duplicates(txs):
    """Same normalized merchant + same absolute amount within DUPLICATE_WINDOW_DAYS."""
    findings = []
    by_key = defaultdict(list)
    for tx in txs:
        key = (_normalize_merchant(tx.get("merchant_name")), abs(float(tx.get("amount") or 0)))
        by_key[key].append(tx)

    for key, group in by_key.items():
        if len(group) < 2:
            continue
        # Sort by date descending
        group_sorted = sorted(group, key=lambda x: x.get("transaction_date") or "", reverse=True)
        for i in range(len(group_sorted) - 1):
            a = group_sorted[i]
            b = group_sorted[i + 1]
            da = datetime.strptime(a["transaction_date"], "%Y-%m-%d")
            db = datetime.strptime(b["transaction_date"], "%Y-%m-%d")
            if (da - db).days <= DUPLICATE_WINDOW_DAYS:
                findings.append({
                    "type": "duplicate_charge",
                    "merchant": a.get("merchant_name"),
                    "amount": abs(float(a.get("amount") or 0)),
                    "dates": [a["transaction_date"], b["transaction_date"]],
                    "tx_ids": [str(a["id"]), str(b["id"])],
                    "severity": "high" if (da - db).days == 0 else "medium",
                })
    return findings


def _detect_subscription_changes(txs):
    """Group by normalized merchant; flag if amount changed between months."""
    findings = []
    by_merchant = defaultdict(list)
    for tx in txs:
        merchant = _normalize_merchant(tx.get("merchant_name"))
        if merchant:
            by_merchant[merchant].append(tx)

    for merchant, group in by_merchant.items():
        if len(group) < 2:
            continue
        # Keep only plausible subscriptions: monthly-ish recurring charges
        monthly = []
        group_sorted = sorted(group, key=lambda x: x.get("transaction_date") or "")
        for i in range(len(group_sorted) - 1):
            d1 = datetime.strptime(group_sorted[i]["transaction_date"], "%Y-%m-%d")
            d2 = datetime.strptime(group_sorted[i + 1]["transaction_date"], "%Y-%m-%d")
            delta = (d2 - d1).days
            if 25 <= delta <= 35:
                monthly.extend([group_sorted[i], group_sorted[i + 1]])
        if len(monthly) < 2:
            continue
        amounts = [float(t.get("amount") or 0) for t in monthly]
        if len(set(round(a, 2) for a in amounts)) == 1:
            continue
        latest = monthly[-1]
        previous = monthly[-2]
        change = abs(float(latest.get("amount") or 0)) - abs(float(previous.get("amount") or 0))
        pct = (change / abs(float(previous.get("amount") or 1))) * 100 if previous.get("amount") else 0
        findings.append({
            "type": "subscription_change",
            "merchant": latest.get("merchant_name"),
            "latest_amount": abs(float(latest.get("amount") or 0)),
            "previous_amount": abs(float(previous.get("amount") or 0)),
            "change_pct": round(pct, 1),
            "latest_date": latest["transaction_date"],
            "severity": "high" if abs(pct) > 20 else "medium",
        })
    return findings


def _detect_unusual_amounts(txs):
    """Per-merchant z-score of absolute amounts; flag scores above threshold."""
    findings = []
    by_merchant = defaultdict(list)
    for tx in txs:
        merchant = _normalize_merchant(tx.get("merchant_name"))
        if merchant:
            by_merchant[merchant].append(tx)

    for merchant, group in by_merchant.items():
        if len(group) < 4:
            continue
        amounts = [abs(float(t.get("amount") or 0)) for t in group]
        mean = sum(amounts) / len(amounts)
        variance = sum((a - mean) ** 2 for a in amounts) / len(amounts)
        std = math.sqrt(variance) if variance > 0 else 0
        if std == 0:
            continue
        for tx in group:
            a = abs(float(tx.get("amount") or 0))
            z = (a - mean) / std
            if z >= Z_SCORE_THRESHOLD:
                findings.append({
                    "type": "unusual_amount",
                    "merchant": tx.get("merchant_name"),
                    "amount": a,
                    "z_score": round(z, 2),
                    "avg_amount": round(mean, 2),
                    "date": tx["transaction_date"],
                    "severity": "high" if z >= 3.5 else "medium",
                })
    return findings


def _persist_findings(sb, findings, user_id: str):
    inserted = 0
    for f in findings:
        try:
            title = {
                "duplicate_charge": "Possible duplicate charge",
                "subscription_change": "Subscription price changed",
                "unusual_amount": "Unusual transaction amount",
            }.get(f["type"], "Transaction anomaly")
            insight_text = f"{title}: {f.get('merchant', '')} — {json.dumps(f)}"
            sb.table("ai_insights").insert({
                "user_id": user_id,
                "domain": "finance_anomaly",
                "insight_text": insight_text,
                "action_item": json.dumps(f),
                "generated_at": datetime.utcnow().isoformat(),
            }).execute()
            inserted += 1
        except Exception as e:
            logger.error(f"Failed to persist anomaly insight: {e}")
    return inserted


def run(user_id: str = DEFAULT_USER_ID):
    sb = _get_supabase()
    if not sb:
        return
    if _already_ran_today(sb):
        logger.info("Transaction anomaly scan already ran today; skipping")
        return

    txs = _fetch_transactions(sb, user_id)
    logger.info(f"Anomaly scan: {len(txs)} transactions in last {LOOKBACK_DAYS} days")

    findings = []
    findings.extend(_detect_duplicates(txs))
    findings.extend(_detect_subscription_changes(txs))
    findings.extend(_detect_unusual_amounts(txs))

    inserted = _persist_findings(sb, findings, user_id)
    logger.info(f"Anomaly scan complete: {len(findings)} anomalies, {inserted} insights inserted")
    SupabaseLogger.info(
        "transaction_anomalies",
        f"Scanned {len(txs)} transactions; found {len(findings)} anomalies, persisted {inserted}",
        {"anomalies": findings},
    )


if __name__ == "__main__":
    run()
