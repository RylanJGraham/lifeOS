"""
IBKR Flex Query sync worker.
Pulls positions, trades, and cash transactions from Interactive Brokers
via the read-only Flex Query API and writes them into Supabase.

Setup:
1. In IBKR Account Management go to Reports > Flex Queries.
2. Create an Activity Flex Query with at least these sections:
   - Open Positions
   - Trades
   - Cash Transactions
   - Corporate Actions
   - Statement of Funds
3. Generate a Flex Web Service token and note the query ID.
4. Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID in your .env.
5. Run this worker manually or schedule it daily after market close.
"""

import os
import sys
import re
import time
import logging
from datetime import datetime, timezone
from typing import Optional
from xml.etree import ElementTree as ET

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.retry import with_retry

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore

load_dotenv()
logger = logging.getLogger("ibkr_flex_sync")
logging.basicConfig(level=logging.INFO)

FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService"
FLEX_VERSION = "3"

# IBKR XML tag names mapped to the fields we care about.
# The report often wraps rows in <Trade>, <OpenPosition>, <CashTransaction>, etc.
SECTION_TAGS = {
    "OpenPosition": "OpenPositions",
    "Trade": "Trades",
    "CashTransaction": "CashTransactions",
    "CorporateAction": "CorporateActions",
    "StatementOfFundsLine": "StatementOfFunds",
}


def _parse_number(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _norm_symbol(symbol: str) -> str:
    if not symbol:
        return "UNKNOWN"
    symbol = symbol.strip().upper()
    # Strip common IBKR suffix noise for US listings
    symbol = re.sub(r"\s+(NASDAQ|NYSE|ARCA|AMEX|BATS|IEX)\s*$", "", symbol)
    return symbol


def _get_supabase() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key or not create_client:
        logger.error("Supabase not configured or client unavailable")
        return None
    return create_client(url, key)


@with_retry(max_retries=3, base_delay=2.0, exceptions=(requests.RequestException, RuntimeError))
def _send_request(token: str, query_id: str) -> str:
    """Send the initial request and return the ReferenceCode."""
    url = f"{FLEX_BASE}/SendRequest"
    params = {"t": token, "q": query_id, "v": FLEX_VERSION}
    headers = {"User-Agent": "LifeOS/1.0 (Python/3.x)"}
    logger.info(f"Sending IBKR Flex request for query {query_id}")
    resp = requests.get(url, params=params, headers=headers, timeout=60)
    resp.raise_for_status()

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as e:
        raise RuntimeError(f"Invalid SendRequest response: {resp.text[:500]}") from e

    status = root.findtext("Status", default="").strip()
    if status != "Success":
        error_code = root.findtext("ErrorCode", default="")
        error_msg = root.findtext("ErrorMessage", default="")
        raise RuntimeError(f"IBKR Flex SendRequest failed: {error_code} {error_msg}")

    ref = root.findtext("ReferenceCode", default="").strip()
    if not ref:
        raise RuntimeError(f"No ReferenceCode in IBKR response: {resp.text[:500]}")
    logger.info(f"IBKR Flex reference code: {ref}")
    return ref


@with_retry(max_retries=3, base_delay=2.0, exceptions=(requests.RequestException,))
def _get_statement(token: str, reference_code: str) -> str:
    """Fetch the actual Flex statement XML."""
    url = f"{FLEX_BASE}/GetStatement"
    params = {"t": token, "q": reference_code, "v": FLEX_VERSION}
    headers = {"User-Agent": "LifeOS/1.0 (Python/3.x)"}
    logger.info(f"Fetching IBKR Flex statement for reference {reference_code}")
    resp = requests.get(url, params=params, headers=headers, timeout=120)
    resp.raise_for_status()
    return resp.text


def fetch_flex_report(token: str, query_id: str) -> str:
    """Download the Flex Query report as a string (two-step IBKR flow)."""
    ref = _send_request(token, query_id)
    # IBKR needs a moment to generate the report; docs recommend waiting.
    time.sleep(3)
    return _get_statement(token, ref)


def _extract_xml_sections(xml_text: str) -> dict[str, list[dict]]:
    """Parse the Flex Query XML and return rows grouped by section name."""
    sections: dict[str, list[dict]] = {
        "OpenPositions": [],
        "Trades": [],
        "CashTransactions": [],
        "CorporateActions": [],
        "StatementOfFunds": [],
    }
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.error(f"Failed to parse Flex XML: {e}")
        return sections

    for elem in root.iter():
        section = SECTION_TAGS.get(elem.tag)
        if not section:
            continue
        attrs = {k: v for k, v in elem.attrib.items() if v is not None and v != ""}
        if attrs:
            sections[section].append(attrs)
    return sections


def _map_trade_action(action: str) -> str:
    a = (action or "").upper()
    if "BUY" in a:
        return "BUY"
    if "SELL" in a:
        return "SELL"
    return a


def _parse_ibkr_datetime(raw: str | None) -> Optional[str]:
    if not raw:
        return None
    raw = raw.strip()
    # IBKR Activity Flex Query default: yyyymmdd;HHmmss or yyyymmdd HHmmss
    for fmt in ("%Y%m%d;%H%M%S", "%Y%m%d %H%M%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def _resolve_user_id(supabase: Client) -> str:
    try:
        res = supabase.table("user_profiles").select("user_id").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["user_id"]
    except Exception as e:
        logger.warning(f"Could not resolve user_id: {e}")
    return "63d7792f-65b1-4c5e-85f7-91c3377c7922"


def _map_asset_class(category: str | None) -> str:
    cat = (category or "").upper()
    if "OPT" in cat:
        return "option"
    if "CRYPTO" in cat or "CFD" in cat:
        return "crypto"
    if "ETF" in cat or "FUND" in cat:
        return "etf"
    if "BOND" in cat:
        return "bond"
    if "CASH" in cat:
        return "cash"
    return "equity"


def sync_positions(supabase: Client, rows: list[dict], user_id: str) -> int:
    """Reconcile open positions from IBKR. Returns number of rows touched."""
    from db.positions import update_position_from_fill

    touched = 0
    for r in rows:
        symbol = _norm_symbol(r.get("symbol"))
        qty = _parse_number(r.get("position") or r.get("quantity"))
        price = _parse_number(r.get("markPrice") or r.get("price") or r.get("closePrice"))
        currency = (r.get("currency") or "USD").upper()
        if qty is None or qty == 0:
            continue

        try:
            existing = supabase.table("advisor_positions") \
                .select("id, source, average_cost, options") \
                .eq("user_id", user_id) \
                .eq("symbol", symbol) \
                .eq("status", "open") \
                .limit(1) \
                .execute()

            cost_basis = _parse_number(r.get("costBasisPrice") or r.get("costBasis"))
            avg_cost = cost_basis if cost_basis is not None else price
            source = "manual" if (existing.data and existing.data[0].get("source") == "manual") else "jarvis"

            # Detect asset class and option/derivatives metadata from IBKR attributes.
            category = r.get("assetCategory") or r.get("subCategory")
            asset_class = _map_asset_class(category)
            options = None
            if asset_class == "option":
                expiry_raw = _parse_ibkr_datetime(r.get("expiry"))
                options = {
                    "strike": _parse_number(r.get("strike")),
                    "expiry": expiry_raw[:10] if expiry_raw else None,
                    "put_call": (r.get("putCall") or "").upper() or None,
                    "multiplier": _parse_number(r.get("multiplier")),
                    "underlying_symbol": _norm_symbol(r.get("underlyingSymbol")),
                }
                options = {k: v for k, v in options.items() if v is not None}

            # Use the shared helper for buy/add math (IBKR only reports open
            # long positions, so we treat an open position as an add).
            update_position_from_fill(
                supabase,
                user_id=user_id,
                symbol=symbol,
                action="add" if qty > 0 else "buy",
                qty=abs(qty),
                price=price or avg_cost,
                fees=0,
                currency=currency,
                source=source,
                asset_class=asset_class,
                options=options,
                reason="IBKR Flex Query sync",
            )
            touched += 1
        except Exception as e:
            logger.error(f"Failed to sync position {symbol}: {e}")
    return touched


def sync_trades(supabase: Client, rows: list[dict], user_id: str) -> int:
    """Insert IBKR executions as advisor_purchases. Skip duplicates."""
    touched = 0
    for r in rows:
        symbol = _norm_symbol(r.get("symbol"))
        action = _map_trade_action(r.get("buySell") or r.get("transactionType"))
        qty = _parse_number(r.get("quantity"))
        price = _parse_number(r.get("price") or r.get("tradePrice"))
        fees = _parse_number(r.get("commission") or r.get("commFee") or r.get("ibCommission")) or 0
        proceeds = _parse_number(r.get("proceeds"))
        currency = (r.get("currency") or "USD").upper()
        trade_date = _parse_ibkr_datetime(r.get("dateTime") or r.get("tradeDate") or r.get("date"))
        direction = "in" if action in ("BUY", "ADD") else "out"

        if qty is None or price is None or not symbol:
            continue

        executed_at = trade_date or datetime.now(timezone.utc).isoformat()
        total_cost = abs(proceeds) if proceeds is not None else qty * price

        try:
            # Dedup by symbol/date/qty/price
            dup = supabase.table("advisor_purchases") \
                .select("id") \
                .eq("user_id", user_id) \
                .eq("symbol", symbol) \
                .eq("action", action.lower()) \
                .eq("quantity", qty) \
                .eq("price", price) \
                .eq("executed_at", executed_at) \
                .limit(1) \
                .execute()
            if dup.data and len(dup.data) > 0:
                logger.debug(f"Skipping duplicate trade {symbol} {action} {qty}@{price}")
                continue

            supabase.table("advisor_purchases").insert({
                "user_id": user_id,
                "symbol": symbol,
                "action": action.lower(),
                "quantity": qty,
                "price": price,
                "total_cost": total_cost,
                "direction": direction,
                "fees": fees,
                "currency": currency,
                "reason": "IBKR Flex Query sync",
                "processed": True,
                "executed_at": executed_at,
            }).execute()
            touched += 1
        except Exception as e:
            logger.error(f"Failed to insert trade {symbol}: {e}")
    return touched


def sync_cash(supabase: Client, rows: list[dict], user_id: str) -> None:
    """Update cash in the latest portfolio snapshot from IBKR cash transactions."""
    if not rows:
        return
    # Look for ending cash or dividend records
    cash_by_currency: dict[str, float] = {}
    for r in rows:
        t = (r.get("type") or "").upper()
        amt = _parse_number(r.get("amount"))
        cur = (r.get("currency") or "USD").upper()
        if amt is None:
            continue
        if "ENDING CASH" in t or "TOTAL" in t or "CASH BALANCE" in t:
            cash_by_currency[cur] = amt

    if not cash_by_currency:
        return

    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for cur, cash in cash_by_currency.items():
            supabase.table("advisor_portfolio_snapshots").upsert({
                "user_id": user_id,
                "record_date": today,
                "cash": cash,
                "currency": cur,
            }).execute()
            logger.info(f"Synced cash: {cash} {cur}")
    except Exception as e:
        logger.error(f"Failed to sync cash: {e}")


def _is_dividend_type(t: str, description: str) -> bool:
    t = (t or "").upper()
    desc = (description or "").upper()
    return any(k in t or k in desc for k in [
        "DIVIDEND", "DIV", "DISTRIBUTION", "COUPON", "INTEREST", "PAYMENT IN LIEU"
    ])


def _extract_dividend_symbol(description: str) -> str:
    """Try to extract the underlying symbol from an IBKR cash description.
    Examples: 'DIVIDEND AAPL(US0378331005) CASH IN LIEU USD 0.50/SHR' -> AAPL
    """
    desc = description or ""
    # Look for a ticker-like token before an ISIN/CUSIP parenthetical
    m = re.search(r"\b([A-Z]{1,5})\s*\(", desc)
    if m:
        return m.group(1)
    # Fallback: first all-caps token up to 5 chars after known keywords
    m = re.search(r"\b(?:DIV|DIVIDEND|DISTRIBUTION)\s+([A-Z]{1,5})\b", desc, re.I)
    if m:
        return m.group(1).upper()
    return "UNKNOWN"


def sync_dividends(supabase: Client, rows: list[dict], user_id: str) -> int:
    """Insert dividend/distribution cash transactions into advisor_dividends."""
    if not rows:
        return 0
    inserted = 0
    for r in rows:
        t = r.get("type") or ""
        desc = r.get("description") or ""
        dividend_type = r.get("dividendType") or r.get("DividendType")
        if not (_is_dividend_type(t, desc) or (dividend_type and str(dividend_type).strip())):
            continue
        amt = _parse_number(r.get("amount"))
        if amt is None or amt <= 0:
            continue
        symbol = _norm_symbol(_extract_dividend_symbol(desc))
        currency = (r.get("currency") or "USD").upper()
        date_raw = r.get("dateTime") or r.get("reportDate") or r.get("date")
        div_date = _parse_ibkr_datetime(date_raw)
        if div_date:
            div_date = div_date[:10]
        else:
            div_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        ex_date_raw = _parse_ibkr_datetime(r.get("exDate") or r.get("exDateTime"))
        record_date_raw = _parse_ibkr_datetime(r.get("recordDate") or r.get("recordDateTime"))

        try:
            # Dedupe by the natural key the dashboard uses for matching.
            dup = supabase.table("advisor_dividends") \
                .select("id") \
                .eq("user_id", user_id) \
                .eq("symbol", symbol) \
                .eq("dividend_date", div_date) \
                .eq("amount", amt) \
                .limit(1).execute()
            if dup.data:
                continue
            payload = {
                "user_id": user_id,
                "symbol": symbol,
                "dividend_date": div_date,
                "amount": amt,
                "currency": currency,
                "source": "ibkr",
                "raw_description": desc,
            }
            if ex_date_raw:
                payload["ex_date"] = ex_date_raw[:10]
            if record_date_raw:
                payload["record_date"] = record_date_raw[:10]
            supabase.table("advisor_dividends").insert(payload).execute()
            inserted += 1
        except Exception as e:
            logger.warning(f"Failed to insert dividend {symbol}: {e}")
    logger.info(f"Synced {inserted} dividends")
    return inserted


def _debug_xml_tags(xml_text: str) -> None:
    """Log XML tag names and attribute keys without values (for diagnostics)."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return
    tags: dict[str, set[str]] = {}
    for elem in root.iter():
        tags.setdefault(elem.tag, set()).update(elem.attrib.keys())
    logger.info("DEBUG XML tags found:")
    for tag in sorted(tags):
        logger.info(f"  <{tag}> attrs={sorted(tags[tag])}")


def run_sync():
    token = os.getenv("IBKR_FLEX_TOKEN")
    query_id = os.getenv("IBKR_FLEX_QUERY_ID")
    if not token or not query_id:
        logger.error("IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID must be set")
        return

    supabase = _get_supabase()
    if not supabase:
        return

    user_id = _resolve_user_id(supabase)
    xml_text = fetch_flex_report(token, query_id)
    sections = _extract_xml_sections(xml_text)

    pos_count = sync_positions(supabase, sections["OpenPositions"], user_id)
    trade_count = sync_trades(supabase, sections["Trades"], user_id)
    div_count = sync_dividends(supabase, sections["CashTransactions"], user_id)
    sync_cash(supabase, sections["CashTransactions"], user_id)

    if pos_count == 0 and trade_count == 0 and div_count == 0:
        logger.warning("Parsed zero positions and trades; dumping XML structure for debugging")
        _debug_xml_tags(xml_text)

    logger.info(f"IBKR Flex sync complete: positions={pos_count}, trades={trade_count}")


if __name__ == "__main__":
    run_sync()
