"""Import external calendars from published ICS links (Outlook, Google, Apple).

Pipeline: fetch (SSRF-safe) -> parse VEVENTs -> expand recurrence into a rolling
window -> reconcile into `calendar_events` (source='import') for one
subscription. Imported events are read-only in LifeOS and are never echoed back
out through LifeOS's own iCal feed.

Deliberately dependency-free apart from python-dateutil (rrule expansion):
Outlook feeds use Windows time-zone names, RRULE, EXDATE and RECURRENCE-ID
overrides, all handled here.
"""
import ipaddress
import logging
import re
import socket
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from dateutil.rrule import rrulestr

from utils.secrets import SecretsNotConfigured, decrypt_secret, encrypt_secret
from utils.supabase_client import get_supabase

logger = logging.getLogger("calendar_import")

MAX_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
WINDOW_PAST = timedelta(days=30)
WINDOW_FUTURE = timedelta(days=180)
MAX_OCCURRENCES_PER_EVENT = 500
IMPORT_REMINDER_MINUTES = 15
BATCH = 100

# Windows time-zone names (what Outlook emits) -> IANA. Unknown names fall back
# to the user's configured zone.
WINDOWS_TZ = {
    "UTC": "UTC", "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
    "W. Europe Standard Time": "Europe/Berlin", "Central Europe Standard Time": "Europe/Budapest",
    "Central European Standard Time": "Europe/Warsaw", "Romance Standard Time": "Europe/Paris",
    "E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev",
    "GTB Standard Time": "Europe/Bucharest", "Russian Standard Time": "Europe/Moscow",
    "Turkey Standard Time": "Europe/Istanbul", "Israel Standard Time": "Asia/Jerusalem",
    "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver", "Pacific Standard Time": "America/Los_Angeles",
    "US Mountain Standard Time": "America/Phoenix", "Alaskan Standard Time": "America/Anchorage",
    "Hawaiian Standard Time": "Pacific/Honolulu", "Canada Central Standard Time": "America/Regina",
    "Atlantic Standard Time": "America/Halifax", "SA Pacific Standard Time": "America/Bogota",
    "E. South America Standard Time": "America/Sao_Paulo", "Argentina Standard Time": "America/Argentina/Buenos_Aires",
    "India Standard Time": "Asia/Kolkata", "China Standard Time": "Asia/Shanghai", "Tokyo Standard Time": "Asia/Tokyo",
    "Korea Standard Time": "Asia/Seoul", "Singapore Standard Time": "Asia/Singapore",
    "AUS Eastern Standard Time": "Australia/Sydney", "New Zealand Standard Time": "Pacific/Auckland",
    "South Africa Standard Time": "Africa/Johannesburg", "Arab Standard Time": "Asia/Riyadh",
    "Arabian Standard Time": "Asia/Dubai", "Egypt Standard Time": "Africa/Cairo",
}


class CalendarLinkError(Exception):
    """User-facing problem with a calendar link."""


# ─── Safe fetching ───────────────────────────────────────────────────────


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[9:]
    return url


def validate_public_url(url: str) -> None:
    """Reject anything but https URLs that resolve only to public addresses
    (stops the backend being used to reach localhost / internal services)."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise CalendarLinkError("The calendar link must be an https:// (or webcal://) URL.")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise CalendarLinkError("Could not find that address — check the link.")
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise CalendarLinkError("That address is not a public calendar server.")


def fetch_ics(url: str) -> str:
    url = normalize_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        validate_public_url(url)
        try:
            resp = requests.get(url, timeout=15, stream=True, allow_redirects=False,
                                headers={"User-Agent": "LifeOS-Calendar-Sync/1.0", "Accept": "text/calendar, */*"})
        except requests.RequestException as e:
            raise CalendarLinkError(f"Could not reach the calendar: {e.__class__.__name__}")
        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("Location"):
            url = urljoin(url, resp.headers["Location"])
            continue
        if resp.status_code != 200:
            raise CalendarLinkError(f"The calendar server answered {resp.status_code} — is the link still published?")
        body = b""
        for chunk in resp.iter_content(64 * 1024):
            body += chunk
            if len(body) > MAX_BYTES:
                raise CalendarLinkError("That calendar is too large to import (over 5 MB).")
        text = body.decode("utf-8", errors="replace")
        if "BEGIN:VCALENDAR" not in text:
            raise CalendarLinkError("That link is not an iCalendar (.ics) feed.")
        return text
    raise CalendarLinkError("Too many redirects.")


# ─── Parsing ─────────────────────────────────────────────────────────────

_LINE = re.compile(r"^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$")


def _unescape(v: str) -> str:
    return v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\;", ";").replace("\\\\", "\\")


def _resolve_tz(name: str | None, default: ZoneInfo) -> ZoneInfo:
    if not name:
        return default
    name = name.strip('"')
    for candidate in (name, WINDOWS_TZ.get(name)):
        if candidate:
            try:
                return ZoneInfo(candidate)
            except Exception:
                pass
    return default


def _parse_dt(value: str, params: dict, default_tz: ZoneInfo) -> tuple[datetime, bool]:
    """-> (aware datetime, is_all_day). All-day values are local midnight."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        d = datetime.strptime(value[:8], "%Y%m%d").date()
        return datetime.combine(d, time.min, tzinfo=default_tz), True
    if value.endswith("Z"):
        return datetime.strptime(value[:-1], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc), False
    naive = datetime.strptime(value, "%Y%m%dT%H%M%S")
    return naive.replace(tzinfo=_resolve_tz(params.get("TZID"), default_tz)), False


def parse_vevents(text: str, default_tz: ZoneInfo) -> list[dict]:
    """Raw VEVENTs as dicts. Nested components (VALARM) are ignored."""
    text = re.sub(r"\r?\n[ \t]", "", text)
    events, cur, depth = [], None, 0
    for raw in text.splitlines():
        line = raw.strip("\r")
        if line == "BEGIN:VEVENT":
            cur, depth = {"exdates": []}, 0
            continue
        if cur is None:
            continue
        if line.startswith("BEGIN:"):
            depth += 1
            continue
        if line.startswith("END:"):
            if depth:
                depth -= 1
                continue
            if line == "END:VEVENT":
                events.append(cur)
                cur = None
            continue
        if depth:
            continue
        m = _LINE.match(line)
        if not m:
            continue
        name, param_str, value = m.group(1).upper(), m.group(2), m.group(3)
        params = {}
        for p in param_str.split(";")[1:]:
            if "=" in p:
                k, v = p.split("=", 1)
                params[k.upper()] = v
        try:
            if name in ("DTSTART", "DTEND"):
                cur[name.lower()], cur[name.lower() + "_allday"] = _parse_dt(value, params, default_tz)
            elif name == "RECURRENCE-ID":
                cur["recurrence_id"] = _parse_dt(value, params, default_tz)[0]
            elif name == "EXDATE":
                cur["exdates"] += [_parse_dt(v, params, default_tz)[0] for v in value.split(",") if v.strip()]
            elif name in ("SUMMARY", "LOCATION", "DESCRIPTION", "UID", "STATUS"):
                cur[name.lower()] = _unescape(value)
            elif name == "RRULE":
                cur["rrule"] = value
        except ValueError:
            logger.debug(f"skipping unparsable {name}: {value}")
    return events


def _fix_rrule(rrule: str, all_day: bool, aware: bool) -> str:
    """dateutil needs UNTIL's timezone-awareness to match DTSTART's."""
    def fix(m):
        v = m.group(1)
        day = v[:8]
        return f"UNTIL={day}" if all_day or not aware else (f"UNTIL={v}" if v.endswith("Z") else f"UNTIL={day}T235959Z")
    return re.sub(r"UNTIL=([0-9TZ]+)", fix, rrule)


def expand(events: list[dict], default_tz: ZoneInfo, window_start: datetime, window_end: datetime) -> list[dict]:
    """Occurrences inside the window, with recurrence, EXDATE and overrides applied."""
    overrides = {(e.get("uid"), e["recurrence_id"].astimezone(timezone.utc)): e for e in events if e.get("recurrence_id")}
    out: list[dict] = []

    def emit(src: dict, start: datetime, end: datetime | None):
        if (src.get("status") or "").upper() == "CANCELLED":
            return
        all_day = bool(src.get("dtstart_allday"))
        if not (window_start <= start <= window_end):
            return
        out.append({
            "uid": src.get("uid") or f"{src.get('summary','')}@{start.isoformat()}",
            "title": (src.get("summary") or "(no title)").strip()[:200],
            "location": (src.get("location") or None),
            "notes": (src.get("description") or None),
            "starts_at": start.astimezone(timezone.utc).isoformat(),
            "ends_at": None if all_day or end is None else end.astimezone(timezone.utc).isoformat(),
            "all_day": all_day,
        })

    for ev in events:
        if ev.get("recurrence_id") or "dtstart" not in ev:
            continue  # overrides are applied via the master; no start = unusable
        start = ev["dtstart"]
        all_day = bool(ev.get("dtstart_allday"))
        end = ev.get("dtend")
        duration = (end - start) if end and end > start else (timedelta(days=1) if all_day else timedelta(0))
        if "rrule" in ev:
            try:
                local_start = start.astimezone(default_tz if all_day else start.tzinfo)
                rule = rrulestr(_fix_rrule(ev["rrule"], all_day, True), dtstart=local_start)
                starts = rule.between(window_start, window_end, inc=True)[:MAX_OCCURRENCES_PER_EVENT]
            except Exception as e:
                logger.warning(f"RRULE not expandable ({ev.get('summary')!r}): {e}")
                starts = [start]
            skip = {x.astimezone(timezone.utc) for x in ev["exdates"]}
            for s in starts:
                key = s.astimezone(timezone.utc)
                if key in skip:
                    continue
                ov = overrides.get((ev.get("uid"), key))
                if ov and "dtstart" in ov:
                    emit(ov, ov["dtstart"], ov.get("dtend"))
                elif ov:
                    emit({**ev, "status": ov.get("status", "")}, s, s + duration)
                else:
                    emit(ev, s, s + duration)
        else:
            emit(ev, start, start + duration)
    return out


def parse_calendar(text: str, default_tz: ZoneInfo, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    return expand(parse_vevents(text, default_tz), default_tz, now - WINDOW_PAST, now + WINDOW_FUTURE)


# ─── Sync ────────────────────────────────────────────────────────────────


def _row(user_id: str, sub_id: str, o: dict, privacy: str = "full") -> dict:
    busy = privacy == "busy"  # store only that you are busy: no title, place or notes
    return {
        "user_id": user_id, "subscription_id": sub_id, "source": "import", "kind": "event",
        "recurrence": "none", "title": "Busy" if busy else o["title"],
        "notes": None if busy else o["notes"], "location": None if busy else o["location"],
        "starts_at": o["starts_at"], "ends_at": o["ends_at"], "all_day": o["all_day"],
        "reminder_offsets": [] if o["all_day"] else [IMPORT_REMINDER_MINUTES],
        "external_uid": f"{o['uid']}|{o['starts_at']}",
    }


def reconcile(sb, user_id: str, sub_id: str, occurrences: list[dict], privacy: str = "full") -> int:
    """Make the stored import rows for one subscription match `occurrences`."""
    existing = {r["external_uid"]: r for r in (
        sb.table("calendar_events").select("*").eq("subscription_id", sub_id).execute().data or [])}
    wanted = {}
    for o in occurrences:
        r = _row(user_id, sub_id, o, privacy)
        wanted[r["external_uid"]] = r
    new_rows = []
    for uid, row in wanted.items():
        cur = existing.get(uid)
        if cur is None:
            new_rows.append(row)
        elif any(cur.get(k) != row[k] for k in ("title", "notes", "location", "ends_at", "all_day")):
            sb.table("calendar_events").update({k: row[k] for k in ("title", "notes", "location", "ends_at", "all_day")}).eq("id", cur["id"]).execute()
    # Bulk writes: a work calendar expands to hundreds of occurrences, and one
    # HTTP round trip per row made the first sync take over a minute.
    for i in range(0, len(new_rows), BATCH):
        sb.table("calendar_events").insert(new_rows[i:i + BATCH]).execute()
    stale = [cur["id"] for uid, cur in existing.items() if uid not in wanted]
    for i in range(0, len(stale), BATCH):
        sb.table("calendar_events").delete().in_("id", stale[i:i + BATCH]).execute()
    return len(wanted)


def sync_subscription(sub: dict, tz: ZoneInfo | None = None) -> dict:
    """Fetch + reconcile one subscription; records success/error on the row."""
    from calendar_service import local_tz
    sb = get_supabase()
    tz = tz or local_tz()
    now = datetime.now(timezone.utc).isoformat()
    try:
        text = fetch_ics(decrypt_secret(sub["url"]))
        count = reconcile(sb, sub["user_id"], sub["id"], parse_calendar(text, tz), sub.get("privacy") or "full")
        sb.table("calendar_subscriptions").update({"last_synced_at": now, "last_error": None, "event_count": count}).eq("id", sub["id"]).execute()
        return {"ok": True, "count": count}
    except (CalendarLinkError, SecretsNotConfigured) as e:
        sb.table("calendar_subscriptions").update({"last_error": str(e)[:300]}).eq("id", sub["id"]).execute()
        return {"ok": False, "error": str(e)}
    except Exception as e:  # never let one bad feed break the worker
        logger.exception("calendar import failed")
        sb.table("calendar_subscriptions").update({"last_error": f"Unexpected error: {e.__class__.__name__}"}).eq("id", sub["id"]).execute()
        return {"ok": False, "error": "Unexpected error while importing."}


def add_subscription(user_id: str, name: str, url: str, privacy: str = "full") -> dict:
    sb = get_supabase()
    if privacy not in ("full", "busy"):
        raise CalendarLinkError("privacy must be 'full' or 'busy'.")
    url = normalize_url(url)
    validate_public_url(url)
    encrypted = encrypt_secret(url)  # fail closed before anything is fetched or stored
    name = (name or "").strip()[:60] or "Imported calendar"
    # Prove the link works before saving it.
    from calendar_service import local_tz
    parse_calendar(fetch_ics(url), local_tz())
    sub = sb.table("calendar_subscriptions").insert(
        {"user_id": user_id, "name": name, "url": encrypted, "privacy": privacy}
    ).execute().data[0]
    result = sync_subscription(sub)
    return {"id": sub["id"], "name": name, **result}


def list_subscriptions(user_id: str) -> list[dict]:
    sb = get_supabase()
    rows = sb.table("calendar_subscriptions").select("*").eq("user_id", user_id).execute().data or []
    return [{
        "id": r["id"], "name": r["name"], "privacy": r.get("privacy") or "full",
        "host": _host_hint(r),
        "last_synced_at": r.get("last_synced_at"), "last_error": r.get("last_error"), "event_count": r.get("event_count") or 0,
    } for r in rows]


def _host_hint(r: dict) -> str | None:
    try:
        return urlparse(decrypt_secret(r["url"])).hostname
    except Exception:
        return None


def delete_subscription(user_id: str, sub_id: str) -> bool:
    sb = get_supabase()
    # Delete events explicitly too (the FK cascades in Postgres; belt and braces).
    sb.table("calendar_events").delete().eq("subscription_id", sub_id).eq("user_id", user_id).execute()
    return bool(sb.table("calendar_subscriptions").delete().eq("id", sub_id).eq("user_id", user_id).execute().data)


def encrypt_legacy_links(sb) -> int:
    """Encrypt any link saved before encryption existed (self-healing; no-op if none)."""
    n = 0
    for sub in sb.table("calendar_subscriptions").select("id,url").execute().data or []:
        if not sub["url"].startswith("enc:"):
            sb.table("calendar_subscriptions").update({"url": encrypt_secret(sub["url"])}).eq("id", sub["id"]).execute()
            n += 1
    return n


def sync_all() -> int:
    sb = get_supabase()
    if sb is None:
        return 0
    try:
        encrypt_legacy_links(sb)
    except SecretsNotConfigured as e:
        logger.error(f"Cannot encrypt stored calendar links: {e}")
    n = 0
    for sub in sb.table("calendar_subscriptions").select("*").execute().data or []:
        if sync_subscription(sub)["ok"]:
            n += 1
    return n
