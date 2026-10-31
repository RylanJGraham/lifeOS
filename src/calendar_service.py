"""Calendar: user events + derived events, recurrence expansion, chat parsing.

User-created events live in `calendar_events`. Derived events (goal
deadlines, RSU vests) are computed on read and never stored. Everything
returned to clients has the same shape — see `_occurrence`.

Date handling is deterministic Python: the LLM only extracts a day *phrase*
("thursday", "tomorrow", "2026-11-05") and a time; `resolve_day` turns that
into a real date.
"""
import calendar as _cal
import json
import logging
import os
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from utils.supabase_client import get_supabase

logger = logging.getLogger("calendar_service")

KINDS = ("event", "appointment", "bill", "reminder", "workout", "other")
RECURRENCES = ("none", "daily", "weekly", "monthly", "yearly")
MAX_OCCURRENCES = 500
_WEEKDAYS = {n: i for i, n in enumerate(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}


def local_tz(name: str | None = None) -> ZoneInfo:
    try:
        return ZoneInfo(name or os.getenv("LIFEOS_TIMEZONE") or "UTC")
    except Exception:
        return ZoneInfo("UTC")


# ─── Recurrence ──────────────────────────────────────────────────────────


def _add_months(d: datetime, months: int) -> datetime:
    month_index = d.month - 1 + months
    year, month = d.year + month_index // 12, month_index % 12 + 1
    day = min(d.day, _cal.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


def _step(start: datetime, recurrence: str, n: int) -> datetime:
    if recurrence == "daily":
        return start + timedelta(days=n)
    if recurrence == "weekly":
        return start + timedelta(weeks=n)
    if recurrence == "monthly":
        return _add_months(start, n)
    if recurrence == "yearly":
        return _add_months(start, 12 * n)
    return start


def occurrence_starts(
    starts_at: datetime,
    recurrence: str,
    window_start: datetime,
    window_end: datetime,
    until: date | None = None,
) -> list[datetime]:
    """Start times of an event's occurrences inside [window_start, window_end]."""
    if recurrence in (None, "none"):
        return [starts_at] if window_start <= starts_at <= window_end else []
    out: list[datetime] = []
    n = 0
    while len(out) < MAX_OCCURRENCES and n < 20000:
        cur = _step(starts_at, recurrence, n)
        n += 1
        if cur > window_end or (until and cur.date() > until):
            break
        if cur >= window_start:
            out.append(cur)
    return out


def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _occurrence(event: dict, start: datetime, origin: str = "user") -> dict:
    end = None
    if event.get("ends_at"):
        end = start + (_parse_dt(event["ends_at"]) - _parse_dt(event["starts_at"]))
    return {
        "id": event["id"],
        "occurrence_id": f'{event["id"]}:{start.isoformat()}',
        "title": event["title"],
        "notes": event.get("notes"),
        "location": event.get("location"),
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat() if end else None,
        "series_starts_at": _parse_dt(event["starts_at"]).isoformat(),  # first occurrence; edits apply to the series
        "all_day": bool(event.get("all_day")),
        "kind": event.get("kind") or "event",
        "recurrence": event.get("recurrence") or "none",
        "reminder_offsets": event.get("reminder_offsets") or [],
        "origin": origin,  # "user" (editable) | "goal" | "rsu" | "subscription" | "dividend" (derived, read-only)
    }


def expand_events(events: list[dict], window_start: datetime, window_end: datetime) -> list[dict]:
    out = []
    for ev in events:
        until = date.fromisoformat(ev["recurrence_until"]) if ev.get("recurrence_until") else None
        for start in occurrence_starts(
            _parse_dt(ev["starts_at"]), ev.get("recurrence") or "none", window_start, window_end, until
        ):
            out.append(_occurrence(ev, start))
    return out


# ─── Derived events ──────────────────────────────────────────────────────


def _all_day(id_: str, title: str, day: date, kind: str, origin: str, tz: ZoneInfo) -> dict:
    start = datetime.combine(day, time.min, tzinfo=tz)
    return {
        "id": id_, "occurrence_id": f"{id_}:{day.isoformat()}", "title": title, "notes": None,
        "location": None, "starts_at": start.isoformat(), "ends_at": None, "series_starts_at": start.isoformat(),
        "all_day": True, "kind": kind, "recurrence": "none", "reminder_offsets": [], "origin": origin,
    }


def derived_events(sb, user_id: str, window_start: datetime, window_end: datetime, tz: ZoneInfo) -> list[dict]:
    out: list[dict] = []
    try:
        goals = (
            sb.table("goals").select("id,title,deadline,status")
            .eq("user_id", user_id).not_.is_("deadline", "null").execute().data or []
        )
        for g in goals:
            if g.get("status") in ("achieved", "abandoned", "archived"):
                continue
            day = date.fromisoformat(str(g["deadline"])[:10])
            if window_start.date() <= day <= window_end.date():
                out.append(_all_day(f'goal:{g["id"]}', f'Goal deadline: {g["title"]}', day, "reminder", "goal", tz))
    except Exception as e:
        logger.warning(f"goal deadlines unavailable: {e}")
    try:
        rsus = sb.table("company_rsus").select("*").eq("user_id", user_id).execute().data or []
        for r in rsus:
            grant = date.fromisoformat(str(r["grant_date"])[:10])
            for n in range(1, int(r.get("vesting_years") or 0) + 1):
                day = _add_months(datetime.combine(grant, time.min), 12 * n).date()
                if window_start.date() <= day <= window_end.date():
                    out.append(_all_day(f'rsu:{r["id"]}:{n}', f'{r["ticker"]} RSU vest (est.)', day, "other", "rsu", tz))
    except Exception as e:
        logger.warning(f"RSU vests unavailable: {e}")
    return out


def project_dates(dates: list[date], window_start: date, window_end: date, monthly_only: bool = False) -> list[date]:
    """Project a regular series of past dates forward into the window.

    Needs >= 2 past dates whose gaps are consistent (within 20% / 5 days of the
    median gap). Returns only future dates (after the last observed one)."""
    ds = sorted(set(dates))
    if len(ds) < 2:
        return []
    gaps = [(b - a).days for a, b in zip(ds, ds[1:])]
    med = sorted(gaps)[len(gaps) // 2]
    monthly = 27 <= med <= 33
    if monthly_only and not monthly:
        return []
    if not (25 <= med <= 370) or any(abs(g - med) > max(5, 0.2 * med) for g in gaps):
        return []
    last, out = ds[-1], []
    for n in range(1, 61):
        nxt = _add_months(datetime.combine(last, time.min), n).date() if monthly else last + timedelta(days=med * n)
        if nxt > window_end:
            break
        if nxt >= window_start:
            out.append(nxt)
    return out


def _merchant_key(name: str | None) -> str:
    return re.sub(r"[^a-z]+", " ", (name or "").lower()).strip()


def predicted_events(sb, user_id: str, window_start: datetime, window_end: datetime, tz: ZoneInfo) -> list[dict]:
    """Estimated subscription renewals (from transactions) and dividend dates
    (from dividend history). Always labelled "(est.)" — never stored."""
    out: list[dict] = []
    ws, we = window_start.date(), window_end.date()
    try:
        rows = sb.table("transactions").select("merchant_name,amount,transaction_date").eq("user_id", user_id).execute().data or []
        by_merchant: dict[str, list[dict]] = {}
        for r in rows:
            if float(r.get("amount") or 0) < 0 and _merchant_key(r.get("merchant_name")):
                by_merchant.setdefault(_merchant_key(r["merchant_name"]), []).append(r)
        for key, group in by_merchant.items():
            amounts = [abs(float(g["amount"])) for g in group]
            if max(amounts) - min(amounts) > 0.1 * max(amounts):
                continue  # amounts vary too much to be a subscription
            dates = [date.fromisoformat(str(g["transaction_date"])[:10]) for g in group]
            name = group[-1]["merchant_name"]
            for d in project_dates(dates, ws, we, monthly_only=True):
                out.append(_all_day(f"sub:{key}:{d}", f"{name} renewal (est. {amounts[-1]:g})", d, "bill", "subscription", tz))
    except Exception as e:
        logger.warning(f"subscription renewals unavailable: {e}")
    try:
        rows = sb.table("advisor_dividends").select("symbol,dividend_date").eq("user_id", user_id).execute().data or []
        by_symbol: dict[str, list[date]] = {}
        for r in rows:
            by_symbol.setdefault(r["symbol"], []).append(date.fromisoformat(str(r["dividend_date"])[:10]))
        for symbol, dates in by_symbol.items():
            for d in project_dates(dates, ws, we):
                out.append(_all_day(f"div:{symbol}:{d}", f"{symbol} dividend (est.)", d, "other", "dividend", tz))
    except Exception as e:
        logger.warning(f"dividend dates unavailable: {e}")
    return out


# ─── Queries / mutations ─────────────────────────────────────────────────


def list_events(user_id: str, start: datetime, end: datetime, tz_name: str | None = None) -> list[dict]:
    sb = get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    tz = local_tz(tz_name)
    # Fetch single events inside the window plus every recurring series that
    # started before the window ends; expansion filters precisely.
    rows = (
        sb.table("calendar_events").select("*").eq("user_id", user_id)
        .lte("starts_at", end.isoformat()).execute().data or []
    )
    rows = [
        r for r in rows
        if (r.get("recurrence") or "none") != "none" or _parse_dt(r["starts_at"]) >= start
    ]
    items = expand_events(rows, start, end) + derived_events(sb, user_id, start, end, tz) + predicted_events(sb, user_id, start, end, tz)
    items.sort(key=lambda e: e["starts_at"])
    return items


def _clean_payload(data: dict, partial: bool = False) -> dict:
    out: dict = {}
    if "title" in data or not partial:
        title = (data.get("title") or "").strip()
        if not title:
            raise ValueError("title is required")
        out["title"] = title[:200]
    for key in ("notes", "location"):
        if key in data:
            out[key] = data[key]
    if "starts_at" in data or not partial:
        out["starts_at"] = _parse_dt(data["starts_at"]).isoformat()
    if "ends_at" in data:
        out["ends_at"] = _parse_dt(data["ends_at"]).isoformat() if data["ends_at"] else None
    if "all_day" in data:
        out["all_day"] = bool(data["all_day"])
    if "kind" in data:
        if data["kind"] not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}")
        out["kind"] = data["kind"]
    if "recurrence" in data:
        if data["recurrence"] not in RECURRENCES:
            raise ValueError(f"recurrence must be one of {RECURRENCES}")
        out["recurrence"] = data["recurrence"]
    if "recurrence_until" in data:
        out["recurrence_until"] = data["recurrence_until"] or None
    if "reminder_offsets" in data:
        offsets = [int(m) for m in (data["reminder_offsets"] or [])]
        if any(m < 0 or m > 60 * 24 * 14 for m in offsets):
            raise ValueError("reminder offsets must be 0..20160 minutes")
        out["reminder_offsets"] = sorted(set(offsets))
    if out.get("ends_at") and out.get("starts_at") and _parse_dt(out["ends_at"]) < _parse_dt(out["starts_at"]):
        raise ValueError("ends_at must be after starts_at")
    return out


def create_event(user_id: str, data: dict, source: str = "manual") -> dict:
    sb = get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    row = {**_clean_payload(data), "user_id": user_id, "source": source}
    return sb.table("calendar_events").insert(row).execute().data[0]


def update_event(user_id: str, event_id: str, data: dict) -> dict | None:
    sb = get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    row = {**_clean_payload(data, partial=True), "updated_at": datetime.now(timezone.utc).isoformat()}
    if "starts_at" in row and "ends_at" not in row:
        # Moving the start must not leave ends_at before it: keep the duration.
        cur = sb.table("calendar_events").select("starts_at,ends_at").eq("id", event_id).eq("user_id", user_id).limit(1).execute().data
        if cur and cur[0].get("ends_at"):
            shift = _parse_dt(row["starts_at"]) - _parse_dt(cur[0]["starts_at"])
            row["ends_at"] = (_parse_dt(cur[0]["ends_at"]) + shift).isoformat()
    res = sb.table("calendar_events").update(row).eq("id", event_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


def delete_event(user_id: str, event_id: str) -> bool:
    sb = get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    res = sb.table("calendar_events").delete().eq("id", event_id).eq("user_id", user_id).execute()
    return bool(res.data)


# ─── Natural-language parsing (chat) ─────────────────────────────────────


def resolve_day(phrase: str | None, today: date) -> date | None:
    """Turn a day phrase into a date. Weekday names mean the next such day
    (today counts only when the phrase is 'today')."""
    if not phrase:
        return None
    p = phrase.strip().lower()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p):
        try:
            return date.fromisoformat(p)
        except ValueError:
            return None
    if p == "today":
        return today
    if p == "tomorrow":
        return today + timedelta(days=1)
    m = re.fullmatch(r"in (\d{1,3}) days?", p)
    if m:
        return today + timedelta(days=int(m.group(1)))
    m = re.fullmatch(r"(?:next |this )?([a-z]+)", p)
    if m and m.group(1) in _WEEKDAYS:
        ahead = (_WEEKDAYS[m.group(1)] - today.weekday()) % 7
        if ahead == 0 or p.startswith("next "):
            ahead = ahead or 7
        return today + timedelta(days=ahead)
    return None


def resolve_time(value: str | None) -> time | None:
    if not value:
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", value.strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        return None
    return time(int(m.group(1)), int(m.group(2)))


def build_event_from_parse(parsed: dict, now_local: datetime) -> dict:
    """Parsed LLM fields -> create_event() payload. Raises ValueError with a
    user-facing message when the day can't be resolved."""
    title = (parsed.get("title") or "").strip()
    if not title:
        raise ValueError("I couldn't tell what the event is called.")
    day = resolve_day(parsed.get("day"), now_local.date())
    if day is None:
        raise ValueError("I couldn't work out which day you meant — try 'Thursday 3pm' or a date like 2026-11-05.")
    at = resolve_time(parsed.get("time"))
    all_day = at is None
    start = datetime.combine(day, at or time.min, tzinfo=now_local.tzinfo)
    payload = {
        "title": title,
        "starts_at": start.astimezone(timezone.utc).isoformat(),
        "all_day": all_day,
        "kind": parsed.get("kind") if parsed.get("kind") in KINDS else "event",
        "recurrence": parsed.get("recurrence") if parsed.get("recurrence") in RECURRENCES else "none",
        "location": parsed.get("location") or None,
        # Timed events: 30 min before. All-day bills: 09:00 the day before
        # (900 min before 00:00). Other all-day events: no reminder.
        "reminder_offsets": [30] if not all_day else ([900] if parsed.get("kind") == "bill" else []),
    }
    dur = parsed.get("duration_minutes")
    if isinstance(dur, (int, float)) and dur > 0 and not all_day:
        payload["ends_at"] = (start + timedelta(minutes=int(dur))).astimezone(timezone.utc).isoformat()
    return payload


def parse_event_text(text: str, llm, today: date) -> dict:
    """Ask the LLM to extract fields (never dates). Returns a dict."""
    from langchain_core.messages import HumanMessage
    prompt = f"""Extract a calendar event from the user's message. Today is {today.isoformat()} ({today.strftime('%A')}).
Return ONLY JSON with keys:
  title (string), day (one of: "today", "tomorrow", a weekday name like "thursday", "next friday", "in 3 days", or an ISO date YYYY-MM-DD),
  time (24h "HH:MM" or null if no time given), duration_minutes (number or null),
  kind (event|appointment|bill|reminder|workout|other), recurrence (none|daily|weekly|monthly|yearly), location (string or null).
Do NOT compute dates yourself; copy the day phrase the user used.

Message: "{text}"
"""
    raw = llm.invoke([HumanMessage(content=prompt)]).content
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        raise ValueError("I couldn't read that as an event.")
    return json.loads(m.group(0))


# ─── Agenda text (morning briefing) ──────────────────────────────────────


def format_agenda(occurrences: list[dict], tz: ZoneInfo) -> list[str]:
    """One line per occurrence: all-day first, then by time."""
    lines = []
    for o in sorted(occurrences, key=lambda o: (not o["all_day"], o["starts_at"])):
        when = "All day" if o["all_day"] else datetime.fromisoformat(o["starts_at"]).astimezone(tz).strftime("%H:%M")
        lines.append(f"- {when} {o['title']}")
    return lines


def todays_agenda(user_id: str, now: datetime | None = None) -> list[str]:
    tz = local_tz()
    now_local = (now or datetime.now(timezone.utc)).astimezone(tz)
    day_start = datetime.combine(now_local.date(), time.min, tzinfo=tz)
    items = list_events(user_id, day_start, day_start + timedelta(days=1) - timedelta(seconds=1))
    return format_agenda(items, tz)


# ─── iCal feed ───────────────────────────────────────────────────────────


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _ics_fold(line: str) -> str:
    """RFC 5545: lines are folded at 75 octets (continuation starts with a space)."""
    raw, out = line.encode("utf-8"), []
    while len(raw) > 75:
        cut = 75
        while cut > 0 and (raw[cut] & 0xC0) == 0x80:  # don't split a UTF-8 character
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = b" " + raw[cut:]
    out.append(raw.decode("utf-8"))
    return "\r\n".join(out)


def _ics_utc(iso: str) -> str:
    return _parse_dt(iso).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def to_ics(occurrences: list[dict], tz: ZoneInfo, now: datetime | None = None) -> str:
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LifeOS//Calendar//EN", "CALSCALE:GREGORIAN",
             "X-WR-CALNAME:LifeOS", f"X-WR-TIMEZONE:{tz.key}"]
    for o in occurrences:
        lines += ["BEGIN:VEVENT", f"UID:{o['occurrence_id']}@lifeos", f"DTSTAMP:{stamp}"]
        if o["all_day"]:
            day = _parse_dt(o["starts_at"]).astimezone(tz).date()
            lines += [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}"]
        else:
            lines.append(f"DTSTART:{_ics_utc(o['starts_at'])}")
            lines.append(f"DTEND:{_ics_utc(o['ends_at'] or o['starts_at'])}")
        lines.append(f"SUMMARY:{_ics_escape(o['title'])}")
        if o.get("location"):
            lines.append(f"LOCATION:{_ics_escape(o['location'])}")
        if o.get("notes"):
            lines.append(f"DESCRIPTION:{_ics_escape(o['notes'])}")
        for minutes in o.get("reminder_offsets") or []:
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_ics_escape(o['title'])}",
                      f"TRIGGER:-PT{int(minutes)}M", "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(l) for l in lines) + "\r\n"


def get_feed_token(user_id: str, rotate: bool = False) -> str:
    """The user's secret feed token (created on first use; rotate to revoke the old URL)."""
    import secrets
    sb = get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    existing = sb.table("calendar_feed_tokens").select("token").eq("user_id", user_id).limit(1).execute().data
    if existing and not rotate:
        return existing[0]["token"]
    token = secrets.token_urlsafe(32)
    sb.table("calendar_feed_tokens").upsert({"user_id": user_id, "token": token}, on_conflict="user_id").execute()
    return token


def user_for_feed_token(token: str) -> str | None:
    sb = get_supabase()
    if sb is None or not token:
        return None
    rows = sb.table("calendar_feed_tokens").select("user_id").eq("token", token).limit(1).execute().data
    return rows[0]["user_id"] if rows else None


def feed_ics(user_id: str, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return to_ics(list_events(user_id, now - timedelta(days=30), now + timedelta(days=365)), local_tz(), now)
