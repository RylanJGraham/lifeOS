"""Importing Outlook/Google/Apple published calendars into LifeOS."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

import api
import auth
import calendar_import as ci
import calendar_service as cal

UTC = timezone.utc
MADRID = ZoneInfo("Europe/Madrid")
NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


def ics(*events: str) -> str:
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Microsoft Corporation//Outlook//EN\r\n" + "".join(events) + "END:VCALENDAR\r\n"


def vevent(*lines: str) -> str:
    return "BEGIN:VEVENT\r\n" + "".join(l + "\r\n" for l in lines) + "END:VEVENT\r\n"


def parse(text, now=NOW):
    return ci.parse_calendar(text, MADRID, now)


class TestParsing:
    def test_outlook_windows_timezone_name(self):
        out = parse(ics(vevent("UID:a1", "SUMMARY:Standup", "DTSTART;TZID=W. Europe Standard Time:20261105T150000",
                               "DTEND;TZID=W. Europe Standard Time:20261105T153000")))
        assert out[0]["starts_at"] == "2026-11-05T14:00:00+00:00"  # CET = UTC+1 in November
        assert out[0]["ends_at"] == "2026-11-05T14:30:00+00:00" and not out[0]["all_day"]

    def test_utc_floating_and_iana(self):
        out = parse(ics(
            vevent("UID:u", "SUMMARY:utc", "DTSTART:20261105T150000Z", "DTEND:20261105T160000Z"),
            vevent("UID:f", "SUMMARY:floating", "DTSTART:20261105T150000"),
            vevent("UID:i", "SUMMARY:iana", "DTSTART;TZID=America/New_York:20261105T150000"),
        ))
        by = {o["title"]: o["starts_at"] for o in out}
        assert by["utc"] == "2026-11-05T15:00:00+00:00"
        assert by["floating"] == "2026-11-05T14:00:00+00:00"   # default tz (Madrid, UTC+1)
        assert by["iana"] == "2026-11-05T20:00:00+00:00"       # EST = UTC-5

    def test_unknown_timezone_falls_back_to_default(self):
        out = parse(ics(vevent("UID:x", "SUMMARY:x", "DTSTART;TZID=Nowhere Standard Time:20261105T150000")))
        assert out[0]["starts_at"] == "2026-11-05T14:00:00+00:00"

    def test_all_day(self):
        out = parse(ics(vevent("UID:d", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261111")))
        assert out[0]["all_day"] and out[0]["ends_at"] is None
        assert out[0]["starts_at"] == "2026-11-09T23:00:00+00:00"  # local midnight Madrid

    def test_folding_escaping_and_alarms_ignored(self):
        text = ics(vevent("UID:e", "SUMMARY:Dentist\\, Dr. Smith\; room 2", "DTSTART:20261105T150000Z",
                          "DESCRIPTION:line one\\nline two that is long enough to need fold", " ing across lines",
                          "BEGIN:VALARM", "TRIGGER:-PT15M", "DESCRIPTION:ignore me", "END:VALARM", "LOCATION:Main St"))
        o = parse(text)[0]
        assert o["title"] == "Dentist, Dr. Smith; room 2"
        assert o["notes"] == "line one\nline two that is long enough to need folding across lines"
        assert o["location"] == "Main St"

    def test_cancelled_and_out_of_window_skipped(self):
        out = parse(ics(
            vevent("UID:c", "SUMMARY:cancelled", "STATUS:CANCELLED", "DTSTART:20261105T150000Z"),
            vevent("UID:old", "SUMMARY:ancient", "DTSTART:20250105T150000Z"),
            vevent("UID:far", "SUMMARY:far future", "DTSTART:20291105T150000Z"),
            vevent("UID:ok", "SUMMARY:ok", "DTSTART:20261105T150000Z"),
        ))
        assert [o["title"] for o in out] == ["ok"]

    def test_garbage_is_not_fatal(self):
        out = parse(ics(vevent("UID:bad", "SUMMARY:bad", "DTSTART:not-a-date"), vevent("UID:ok", "SUMMARY:ok", "DTSTART:20261105T150000Z")))
        assert [o["title"] for o in out] == ["ok"]


class TestRecurrence:
    WEEKLY = ("UID:w", "SUMMARY:Gym", "DTSTART;TZID=W. Europe Standard Time:20261102T180000",
              "DTEND;TZID=W. Europe Standard Time:20261102T190000", "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4")

    def test_weekly_with_count(self):
        out = parse(ics(vevent(*self.WEEKLY)))
        assert [o["starts_at"][:10] for o in out] == ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]
        assert out[1]["ends_at"] == "2026-11-09T18:00:00+00:00"  # duration preserved (1h)

    def test_exdate_removes_one_occurrence(self):
        out = parse(ics(vevent(*self.WEEKLY, "EXDATE;TZID=W. Europe Standard Time:20261109T180000")))
        assert "2026-11-09" not in [o["starts_at"][:10] for o in out] and len(out) == 3

    def test_override_moves_one_and_cancel_drops_one(self):
        moved = vevent("UID:w", "SUMMARY:Gym (moved)", "RECURRENCE-ID;TZID=W. Europe Standard Time:20261116T180000",
                       "DTSTART;TZID=W. Europe Standard Time:20261117T080000", "DTEND;TZID=W. Europe Standard Time:20261117T090000")
        gone = vevent("UID:w", "SUMMARY:Gym", "STATUS:CANCELLED", "RECURRENCE-ID;TZID=W. Europe Standard Time:20261123T180000",
                      "DTSTART;TZID=W. Europe Standard Time:20261123T180000")
        out = parse(ics(vevent(*self.WEEKLY), moved, gone))
        titles = {o["starts_at"][:13]: o["title"] for o in out}
        assert titles["2026-11-17T07"] == "Gym (moved)"
        assert not any(o["starts_at"].startswith("2026-11-16") for o in out)
        assert not any(o["starts_at"].startswith("2026-11-23") for o in out)

    def test_until_date_only_and_utc(self):
        for until in ("20261116", "20261116T235959Z"):
            out = parse(ics(vevent("UID:u", "SUMMARY:x", "DTSTART;TZID=W. Europe Standard Time:20261102T180000", f"RRULE:FREQ=WEEKLY;UNTIL={until}")))
            assert [o["starts_at"][:10] for o in out] == ["2026-11-02", "2026-11-09", "2026-11-16"]

    def test_all_day_recurrence_keeps_local_midnight_across_dst(self):
        out = parse(ics(vevent("UID:b", "SUMMARY:Bin day", "DTSTART;VALUE=DATE:20261020", "RRULE:FREQ=WEEKLY;COUNT=3")),
                    now=datetime(2026, 10, 15, tzinfo=UTC))
        assert [o["starts_at"] for o in out] == ["2026-10-19T22:00:00+00:00", "2026-10-26T23:00:00+00:00", "2026-11-02T23:00:00+00:00"]

    def test_unbounded_rule_is_capped_to_window(self):
        out = parse(ics(vevent("UID:d", "SUMMARY:daily", "DTSTART:20261101T090000Z", "RRULE:FREQ=DAILY")))
        assert 150 < len(out) <= ci.MAX_OCCURRENCES_PER_EVENT

    def test_unexpandable_rule_degrades_to_single(self):
        out = parse(ics(vevent("UID:r", "SUMMARY:weird", "DTSTART:20261105T150000Z", "RRULE:FREQ=NONSENSE")))
        assert len(out) == 1


class TestUrlSafety:
    @pytest.fixture(autouse=True)
    def dns(self, monkeypatch):
        table = {"outlook.office365.com": "52.96.0.1", "localhost": "127.0.0.1", "internal.corp": "10.0.0.5", "meta.local": "169.254.169.254"}
        def fake(host, port, proto=0, **k):
            if host in table:
                return [(2, 1, 6, "", (table[host], port))]
            import socket
            raise socket.gaierror("nope")
        monkeypatch.setattr(ci.socket, "getaddrinfo", fake)

    def test_accepts_public_https_and_webcal(self):
        ci.validate_public_url("https://outlook.office365.com/owa/calendar/x/reachcalendar.ics")
        assert ci.normalize_url("webcal://outlook.office365.com/a.ics") == "https://outlook.office365.com/a.ics"

    @pytest.mark.parametrize("url", [
        "http://outlook.office365.com/a.ics", "https://localhost/a.ics", "https://internal.corp/a.ics",
        "https://meta.local/latest", "ftp://outlook.office365.com/a.ics", "https://unknown.example/a.ics", "not a url", "",
    ])
    def test_rejects_unsafe(self, url):
        with pytest.raises(ci.CalendarLinkError):
            ci.validate_public_url(url)

    def test_literal_private_ip_rejected(self, monkeypatch):
        monkeypatch.setattr(ci.socket, "getaddrinfo", lambda h, p, proto=0, **k: [(2, 1, 6, "", (h, p))])
        with pytest.raises(ci.CalendarLinkError):
            ci.validate_public_url("https://192.168.1.10/a.ics")


class TestFetch:
    @pytest.fixture(autouse=True)
    def dns(self, monkeypatch):
        monkeypatch.setattr(ci, "validate_public_url", lambda u: (_ for _ in ()).throw(ci.CalendarLinkError("private")) if "internal" in u else None)

    def resp(self, status=200, body=b"BEGIN:VCALENDAR\r\nEND:VCALENDAR", headers=None):
        return SimpleNamespace(status_code=status, headers=headers or {}, iter_content=lambda n: iter([body[i:i + n] for i in range(0, len(body), n)] or [b""]))

    def test_success(self, monkeypatch):
        monkeypatch.setattr(ci.requests, "get", lambda *a, **k: self.resp())
        assert "BEGIN:VCALENDAR" in ci.fetch_ics("https://x.example/a.ics")

    def test_redirect_to_private_host_is_blocked(self, monkeypatch):
        calls = []
        def fake(url, **k):
            calls.append(url)
            return self.resp(302, headers={"Location": "https://internal.corp/secret"})
        monkeypatch.setattr(ci.requests, "get", fake)
        with pytest.raises(ci.CalendarLinkError, match="private"):
            ci.fetch_ics("https://x.example/a.ics")
        assert calls == ["https://x.example/a.ics"]  # never requested the internal host

    def test_redirect_loop_and_errors(self, monkeypatch):
        monkeypatch.setattr(ci.requests, "get", lambda *a, **k: self.resp(302, headers={"Location": "https://x.example/b"}))
        with pytest.raises(ci.CalendarLinkError, match="redirects"):
            ci.fetch_ics("https://x.example/a.ics")
        monkeypatch.setattr(ci.requests, "get", lambda *a, **k: self.resp(404))
        with pytest.raises(ci.CalendarLinkError, match="404"):
            ci.fetch_ics("https://x.example/a.ics")
        monkeypatch.setattr(ci.requests, "get", lambda *a, **k: self.resp(body=b"<html>login</html>"))
        with pytest.raises(ci.CalendarLinkError, match="not an iCalendar"):
            ci.fetch_ics("https://x.example/a.ics")

    def test_size_cap(self, monkeypatch):
        monkeypatch.setattr(ci.requests, "get", lambda *a, **k: self.resp(body=b"BEGIN:VCALENDAR" + b"x" * (ci.MAX_BYTES + 10)))
        with pytest.raises(ci.CalendarLinkError, match="too large"):
            ci.fetch_ics("https://x.example/a.ics")


FEED_V1 = ics(
    vevent("UID:m1", "SUMMARY:Planning", "DTSTART:20261105T150000Z", "DTEND:20261105T160000Z"),
    vevent("UID:m2", "SUMMARY:Offsite", "DTSTART;VALUE=DATE:20261110"),
)


class TestSync:
    @pytest.fixture
    def sub(self, fake_sb, owner_id, monkeypatch):
        monkeypatch.setenv("LIFEOS_TIMEZONE", "Europe/Madrid")
        monkeypatch.setattr(ci, "get_supabase", lambda: fake_sb)
        monkeypatch.setattr(ci, "fetch_ics", lambda url: self.feed)
        self.feed = FEED_V1
        fake_sb.tables["calendar_subscriptions"] = [{"id": "s1", "user_id": owner_id, "name": "Outlook", "url": "https://x.example/a.ics"}]
        return fake_sb.tables["calendar_subscriptions"][0]

    def imported(self, fake_sb):
        return {r["title"]: r for r in fake_sb.rows("calendar_events") if r.get("source") == "import"}

    def test_first_sync_inserts_readonly_rows(self, sub, fake_sb, owner_id):
        assert ci.sync_subscription(sub, MADRID) == {"ok": True, "count": 2}
        rows = self.imported(fake_sb)
        assert rows["Planning"]["reminder_offsets"] == [15] and rows["Offsite"]["reminder_offsets"] == []
        assert rows["Planning"]["user_id"] == owner_id and rows["Planning"]["subscription_id"] == "s1"
        assert fake_sb.rows("calendar_subscriptions")[0]["event_count"] == 2

    def test_resync_is_idempotent_updates_and_removes(self, sub, fake_sb):
        ci.sync_subscription(sub, MADRID)
        ci.sync_subscription(sub, MADRID)
        assert len(fake_sb.rows("calendar_events")) == 2
        self.feed = ics(vevent("UID:m1", "SUMMARY:Planning v2", "DTSTART:20261105T150000Z", "DTEND:20261105T160000Z"))
        ci.sync_subscription(sub, MADRID)
        assert list(self.imported(fake_sb)) == ["Planning v2"]  # renamed in place, Offsite deleted upstream -> gone

    def test_failure_is_recorded_and_events_kept(self, sub, fake_sb, monkeypatch):
        ci.sync_subscription(sub, MADRID)
        def boom(url): raise ci.CalendarLinkError("The calendar server answered 404")
        monkeypatch.setattr(ci, "fetch_ics", boom)
        assert ci.sync_subscription(sub, MADRID)["ok"] is False
        assert "404" in fake_sb.rows("calendar_subscriptions")[0]["last_error"]
        assert len(self.imported(fake_sb)) == 2  # a flaky link must not wipe your calendar

    def test_imported_events_listed_readonly_and_not_exported(self, sub, fake_sb, owner_id):
        ci.sync_subscription(sub, MADRID)
        cal.create_event(owner_id, {"title": "Mine", "starts_at": "2026-11-06T10:00:00Z"})
        items = cal.list_events(owner_id, datetime(2026, 11, 1, tzinfo=UTC), datetime(2026, 11, 30, tzinfo=UTC))
        assert {i["title"]: i["origin"] for i in items if i["title"] in ("Planning", "Offsite", "Mine")} == {"Planning": "import", "Offsite": "import", "Mine": "user"}
        feed = cal.feed_ics(owner_id, datetime(2026, 11, 1, tzinfo=UTC))
        assert "SUMMARY:Mine" in feed and "Planning" not in feed  # no echo loop back into Outlook

    def test_cannot_edit_or_delete_imported(self, sub, fake_sb, owner_id):
        ci.sync_subscription(sub, MADRID)
        eid = self.imported(fake_sb)["Planning"]["id"]
        with pytest.raises(PermissionError):
            cal.update_event(owner_id, eid, {"title": "x"})
        with pytest.raises(PermissionError):
            cal.delete_event(owner_id, eid)

    def test_imported_meeting_triggers_reminder(self, sub, fake_sb, owner_id, monkeypatch):
        from workers import calendar_reminders as cr
        self.feed = ics(vevent("UID:soon", "SUMMARY:Standup", "DTSTART:20261105T150000Z", "DTEND:20261105T153000Z"))
        ci.sync_subscription(sub, MADRID)
        sent = []
        monkeypatch.setattr(cr, "get_supabase", lambda: fake_sb)
        monkeypatch.setattr(cr, "notify", lambda *a, **k: sent.append(a[1]) or True)
        assert cr.run(datetime(2026, 11, 5, 14, 45, tzinfo=UTC)) == 1
        assert sent == ["Standup in 15 min"]


class TestEndpoints:
    H = {"Authorization": "Bearer good"}

    @pytest.fixture
    def client(self, monkeypatch, fake_sb):
        monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-1" if t == "good" else None)
        monkeypatch.setattr(ci, "get_supabase", lambda: fake_sb)
        monkeypatch.setattr(ci, "validate_public_url", lambda u: None)
        monkeypatch.setattr(ci, "fetch_ics", lambda url: FEED_V1)
        return TestClient(api.app)

    def test_add_list_resync_delete(self, client, fake_sb):
        added = client.post("/api/calendar/subscriptions", headers=self.H, json={"name": "Outlook", "url": "webcal://outlook.example/a.ics"})
        assert added.status_code == 200 and added.json()["data"]["count"] == 2
        listed = client.get("/api/calendar/subscriptions", headers=self.H).json()["data"]
        assert listed[0]["name"] == "Outlook" and listed[0]["host"] == "outlook.example" and "url" not in listed[0]
        sid = listed[0]["id"]
        assert client.post(f"/api/calendar/subscriptions/{sid}/sync", headers=self.H).status_code == 200
        assert client.delete(f"/api/calendar/subscriptions/{sid}", headers=self.H).status_code == 200
        assert fake_sb.rows("calendar_events") == [] and fake_sb.rows("calendar_subscriptions") == []

    def test_bad_link_is_400_and_saves_nothing(self, client, fake_sb, monkeypatch):
        def bad(url): raise ci.CalendarLinkError("That link is not an iCalendar (.ics) feed.")
        monkeypatch.setattr(ci, "fetch_ics", bad)
        res = client.post("/api/calendar/subscriptions", headers=self.H, json={"url": "https://x.example/page"})
        assert res.status_code == 400 and "iCalendar" in res.json()["detail"]
        assert fake_sb.rows("calendar_subscriptions") == []

    def test_other_users_cannot_touch_my_subscription(self, client, fake_sb):
        fake_sb.tables["calendar_subscriptions"] = [{"id": "s9", "user_id": "other", "name": "x", "url": "https://x.example/a.ics"}]
        assert client.post("/api/calendar/subscriptions/s9/sync", headers=self.H).status_code == 404
        assert client.delete("/api/calendar/subscriptions/s9", headers=self.H).status_code == 404
        assert client.get("/api/calendar/subscriptions", headers=self.H).json()["data"] == []

    def test_edit_and_delete_imported_event_are_403(self, client, fake_sb):
        client.post("/api/calendar/subscriptions", headers=self.H, json={"name": "O", "url": "https://x.example/a.ics"})
        eid = fake_sb.rows("calendar_events")[0]["id"]
        assert client.patch(f"/api/calendar/events/{eid}", headers=self.H, json={"title": "x"}).status_code == 403
        assert client.delete(f"/api/calendar/events/{eid}", headers=self.H).status_code == 403

    def test_requires_auth(self, client):
        assert client.get("/api/calendar/subscriptions").status_code == 401
        assert client.post("/api/calendar/subscriptions", json={"url": "https://x"}).status_code == 401


class TestBulkAndLegacy:
    def test_large_calendar_uses_batched_writes(self, fake_sb, owner_id, monkeypatch):
        calls = {"insert": 0, "delete": 0}
        real = fake_sb.table
        def counting(name):
            q = real(name)
            if name == "calendar_events":
                oi, od = q.insert, q.delete
                q.insert = lambda row: (calls.__setitem__("insert", calls["insert"] + 1), oi(row))[1]
                q.delete = lambda: (calls.__setitem__("delete", calls["delete"] + 1), od())[1]
            return q
        monkeypatch.setattr(fake_sb, "table", counting)
        occ = [{"uid": f"u{i}", "title": f"m{i}", "notes": None, "location": None,
                "starts_at": f"2026-11-{1 + i % 28:02d}T{8 + i % 10:02d}:00:00+00:00", "ends_at": None, "all_day": False} for i in range(550)]
        assert ci.reconcile(fake_sb, owner_id, "s1", occ) == 550
        assert len(fake_sb.rows("calendar_events")) == 550
        assert calls["insert"] == 6  # 550 rows / batches of 100, not 550 round trips
        assert ci.reconcile(fake_sb, owner_id, "s1", occ[:100]) == 100
        assert len(fake_sb.rows("calendar_events")) == 100 and calls["delete"] == 5

    def test_legacy_plaintext_links_get_encrypted(self, fake_sb, owner_id, monkeypatch):
        monkeypatch.setattr(ci, "get_supabase", lambda: fake_sb)
        monkeypatch.setattr(ci, "fetch_ics", lambda u: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")
        fake_sb.tables["calendar_subscriptions"] = [
            {"id": "s1", "user_id": owner_id, "name": "Old", "url": "https://x.example/SECRET/a.ics"}]
        assert ci.sync_all() == 1
        stored = fake_sb.rows("calendar_subscriptions")[0]["url"]
        assert stored.startswith("enc:v1:") and "SECRET" not in stored
        assert ci.encrypt_legacy_links(fake_sb) == 0  # idempotent
