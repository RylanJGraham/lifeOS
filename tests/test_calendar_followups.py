from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

import api
import auth
import calendar_service as cal

UTC = timezone.utc
DUBLIN = ZoneInfo("Europe/Dublin")


def dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=UTC)


class TestProjectDates:
    W0, W1 = date(2026, 11, 1), date(2027, 2, 28)

    def test_monthly_series_projects_forward(self):
        out = cal.project_dates([date(2026, 8, 15), date(2026, 9, 15), date(2026, 10, 15)], self.W0, self.W1, monthly_only=True)
        assert out[:3] == [date(2026, 11, 15), date(2026, 12, 15), date(2027, 1, 15)]

    def test_month_end_clamps(self):
        out = cal.project_dates([date(2026, 8, 31), date(2026, 9, 30), date(2026, 10, 31)], date(2026, 11, 1), date(2026, 12, 31), monthly_only=True)
        assert out == [date(2026, 11, 30), date(2026, 12, 31)]

    def test_irregular_or_single_does_not_project(self):
        assert cal.project_dates([date(2026, 10, 1)], self.W0, self.W1) == []
        assert cal.project_dates([date(2026, 7, 1), date(2026, 7, 9), date(2026, 10, 20)], self.W0, self.W1) == []

    def test_quarterly_only_when_not_monthly_only(self):
        q = [date(2026, 1, 10), date(2026, 4, 10), date(2026, 7, 10)]
        assert cal.project_dates(q, self.W0, self.W1, monthly_only=True) == []
        assert cal.project_dates(q, self.W0, self.W1)  # projected by median gap


class TestPredictedEvents:
    def test_subscription_and_dividend(self, fake_sb, owner_id):
        fake_sb.tables["transactions"] = [
            {"user_id": owner_id, "merchant_name": "Netflix", "amount": -12.99, "transaction_date": d}
            for d in ("2026-08-12", "2026-09-12", "2026-10-12")
        ] + [  # variable amounts + one-off: not subscriptions
            {"user_id": owner_id, "merchant_name": "Glovo", "amount": -10, "transaction_date": "2026-09-12"},
            {"user_id": owner_id, "merchant_name": "Glovo", "amount": -40, "transaction_date": "2026-10-12"},
            {"user_id": owner_id, "merchant_name": "Salary", "amount": 3000, "transaction_date": "2026-09-01"},
            {"user_id": owner_id, "merchant_name": "Salary", "amount": 3000, "transaction_date": "2026-10-01"},
        ]
        fake_sb.tables["advisor_dividends"] = [
            {"user_id": owner_id, "symbol": "VOO", "dividend_date": d} for d in ("2026-03-27", "2026-06-26", "2026-09-25")
        ]
        items = cal.list_events(owner_id, dt(2026, 11, 1), dt(2026, 12, 31, 23))
        by_origin = {i["origin"]: i["title"] for i in items}
        assert by_origin["subscription"] == "Netflix renewal (est. 12.99)"
        assert by_origin["dividend"] == "VOO dividend (est.)"
        assert not any("Glovo" in i["title"] or "Salary" in i["title"] for i in items)


class TestEditing:
    def test_moving_start_keeps_duration(self, fake_sb, owner_id):
        ev = cal.create_event(owner_id, {"title": "Gym", "starts_at": "2026-11-05T09:00:00Z", "ends_at": "2026-11-05T10:00:00Z"})
        row = cal.update_event(owner_id, ev["id"], {"starts_at": "2026-11-06T18:00:00Z"})
        assert row["starts_at"].startswith("2026-11-06T18:00") and row["ends_at"].startswith("2026-11-06T19:00")

    def test_explicit_end_wins(self, fake_sb, owner_id):
        ev = cal.create_event(owner_id, {"title": "Gym", "starts_at": "2026-11-05T09:00:00Z", "ends_at": "2026-11-05T10:00:00Z"})
        row = cal.update_event(owner_id, ev["id"], {"starts_at": "2026-11-05T09:00:00Z", "ends_at": "2026-11-05T11:30:00Z"})
        assert row["ends_at"].startswith("2026-11-05T11:30")

    def test_occurrences_expose_series_start(self, fake_sb, owner_id):
        cal.create_event(owner_id, {"title": "Gym", "starts_at": "2026-11-02T09:00:00Z", "recurrence": "weekly"})
        occ = cal.list_events(owner_id, dt(2026, 11, 9), dt(2026, 11, 10))[0]
        assert occ["starts_at"].startswith("2026-11-09") and occ["series_starts_at"].startswith("2026-11-02")


class TestAgenda:
    def test_all_day_first_then_time(self):
        occ = [
            {"title": "Dentist", "all_day": False, "starts_at": "2026-11-05T15:00:00+00:00"},
            {"title": "Rent due", "all_day": True, "starts_at": "2026-11-05T00:00:00+00:00"},
            {"title": "Gym", "all_day": False, "starts_at": "2026-11-05T08:30:00+00:00"},
        ]
        assert cal.format_agenda(occ, DUBLIN) == ["- All day Rent due", "- 08:30 Gym", "- 15:00 Dentist"]

    def test_todays_agenda_only_includes_today(self, fake_sb, owner_id, monkeypatch):
        monkeypatch.setenv("LIFEOS_TIMEZONE", "Europe/Dublin")
        cal.create_event(owner_id, {"title": "Today thing", "starts_at": "2026-11-05T15:00:00Z"})
        cal.create_event(owner_id, {"title": "Tomorrow thing", "starts_at": "2026-11-06T15:00:00Z"})
        assert cal.todays_agenda(owner_id, dt(2026, 11, 5, 7)) == ["- 15:00 Today thing"]


class TestIcs:
    OCC = [{
        "occurrence_id": "e1:2026-11-05T15:00:00+00:00", "title": "Dentist, Dr. Smith; room 2", "location": "Main St",
        "notes": "bring forms\nand ID", "starts_at": "2026-11-05T15:00:00+00:00", "ends_at": "2026-11-05T15:45:00+00:00",
        "all_day": False, "reminder_offsets": [30],
    }, {
        "occurrence_id": "goal:g1:2026-11-10", "title": "Goal deadline", "location": None, "notes": None,
        "starts_at": "2026-11-10T00:00:00+00:00", "ends_at": None, "all_day": True, "reminder_offsets": [],
    }]

    def test_structure_and_escaping(self):
        ics = cal.to_ics(self.OCC, DUBLIN, dt(2026, 11, 1))
        assert ics.startswith("BEGIN:VCALENDAR\r\n") and ics.endswith("END:VCALENDAR\r\n")
        assert ics.count("BEGIN:VEVENT") == 2
        assert "SUMMARY:Dentist\\, Dr. Smith\; room 2" in ics
        assert "DESCRIPTION:bring forms\\nand ID" in ics
        assert "DTSTART:20261105T150000Z" in ics and "DTEND:20261105T154500Z" in ics
        assert "DTSTART;VALUE=DATE:20261110" in ics and "DTEND;VALUE=DATE:20261111" in ics
        assert "TRIGGER:-PT30M" in ics

    def test_lines_are_folded_and_utf8_safe(self):
        occ = [{**self.OCC[1], "title": "é" * 80}]
        for line in cal.to_ics(occ, DUBLIN).split("\r\n"):
            assert len(line.encode()) <= 75
        assert "é" * 80 in cal.to_ics(occ, DUBLIN).replace("\r\n ", "")


class TestFeedEndpoint:
    @pytest.fixture
    def client(self, monkeypatch, fake_sb):
        monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-1" if t == "good" else None)
        monkeypatch.setenv("PUBLIC_DOMAIN", "lifeos.example.org")
        return TestClient(api.app)

    H = {"Authorization": "Bearer good"}

    def test_url_is_stable_and_rotation_revokes(self, client, fake_sb):
        url1 = client.get("/api/calendar/feed", headers=self.H).json()["url"]
        assert url1.startswith("https://lifeos.example.org/calendar/feed/") and url1.endswith(".ics")
        assert client.get("/api/calendar/feed", headers=self.H).json()["url"] == url1
        path = url1.replace("https://lifeos.example.org", "")
        assert client.get(path).status_code == 200
        url2 = client.post("/api/calendar/feed/rotate", headers=self.H).json()["url"]
        assert url2 != url1
        assert client.get(path).status_code == 404

    def test_feed_serves_only_that_users_events(self, client, fake_sb):
        cal.create_event("user-1", {"title": "Mine", "starts_at": (datetime.now(UTC) + timedelta(days=3)).isoformat()})
        cal.create_event("other", {"title": "Secret", "starts_at": (datetime.now(UTC) + timedelta(days=3)).isoformat()})
        url = client.get("/api/calendar/feed", headers=self.H).json()["url"].replace("https://lifeos.example.org", "")
        res = client.get(url)
        assert res.headers["content-type"].startswith("text/calendar") and res.headers["cache-control"] == "no-store"
        assert "SUMMARY:Mine" in res.text and "Secret" not in res.text

    def test_unknown_token_and_management_need_auth(self, client):
        assert client.get("/calendar/feed/nope.ics").status_code == 404
        assert client.get("/api/calendar/feed").status_code == 401
        assert client.post("/api/calendar/feed/rotate").status_code == 401
