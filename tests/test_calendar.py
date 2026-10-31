from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

import calendar_service as cal

UTC = timezone.utc


def dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=UTC)


class TestRecurrence:
    def test_single_event_in_and_out_of_window(self):
        s = dt(2026, 11, 5, 15)
        assert cal.occurrence_starts(s, "none", dt(2026, 11, 1), dt(2026, 11, 30)) == [s]
        assert cal.occurrence_starts(s, "none", dt(2026, 12, 1), dt(2026, 12, 31)) == []

    def test_weekly_inside_window_only(self):
        out = cal.occurrence_starts(dt(2026, 11, 2, 9), "weekly", dt(2026, 11, 10), dt(2026, 11, 24))
        assert [o.day for o in out] == [16, 23]

    def test_monthly_clamps_to_month_end(self):
        out = cal.occurrence_starts(dt(2026, 1, 31, 8), "monthly", dt(2026, 2, 1), dt(2026, 3, 31, 23))
        assert [(o.month, o.day) for o in out] == [(2, 28), (3, 31)]

    def test_until_stops_series(self):
        out = cal.occurrence_starts(dt(2026, 11, 1), "daily", dt(2026, 11, 1), dt(2026, 11, 30), until=date(2026, 11, 3))
        assert len(out) == 3

    def test_yearly_leap_day(self):
        out = cal.occurrence_starts(dt(2024, 2, 29), "yearly", dt(2025, 1, 1), dt(2025, 12, 31))
        assert [(o.month, o.day) for o in out] == [(2, 28)]

    def test_expansion_is_capped(self):
        out = cal.occurrence_starts(dt(2020, 1, 1), "daily", dt(2020, 1, 1), dt(2030, 1, 1))
        assert len(out) == cal.MAX_OCCURRENCES

    def test_expand_preserves_duration(self):
        ev = {"id": "e1", "title": "Gym", "starts_at": "2026-11-02T09:00:00+00:00",
              "ends_at": "2026-11-02T10:30:00+00:00", "recurrence": "weekly", "reminder_offsets": [30]}
        occ = cal.expand_events([ev], dt(2026, 11, 9), dt(2026, 11, 10))[0]
        assert occ["starts_at"].startswith("2026-11-09T09:00")
        assert occ["ends_at"].startswith("2026-11-09T10:30")
        assert occ["occurrence_id"].startswith("e1:")


class TestResolveDay:
    TODAY = date(2026, 10, 31)  # Saturday

    @pytest.mark.parametrize("phrase,expected", [
        ("today", date(2026, 10, 31)),
        ("tomorrow", date(2026, 11, 1)),
        ("thursday", date(2026, 11, 5)),
        ("next monday", date(2026, 11, 2)),
        ("saturday", date(2026, 11, 7)),  # bare weekday == today -> next week
        ("in 3 days", date(2026, 11, 3)),
        ("2026-12-25", date(2026, 12, 25)),
        ("  Friday ", date(2026, 11, 6)),
    ])
    def test_phrases(self, phrase, expected):
        assert cal.resolve_day(phrase, self.TODAY) == expected

    @pytest.mark.parametrize("phrase", ["", None, "soonish", "2026-13-45", "in x days"])
    def test_unresolvable(self, phrase):
        assert cal.resolve_day(phrase, self.TODAY) is None

    def test_time(self):
        assert cal.resolve_time("15:30").hour == 15
        assert cal.resolve_time("24:00") is None
        assert cal.resolve_time(None) is None


class TestBuildEvent:
    NOW = datetime(2026, 10, 31, 12, 0, tzinfo=ZoneInfo("Europe/Dublin"))

    def test_timed_event_converts_local_to_utc(self):
        p = cal.build_event_from_parse({"title": "Dentist", "day": "thursday", "time": "15:00",
                                        "duration_minutes": 45, "kind": "appointment"}, self.NOW)
        # 5 Nov 2026 is GMT in Dublin (DST ended 25 Oct) -> 15:00 local == 15:00 UTC
        assert p["starts_at"].startswith("2026-11-05T15:00")
        assert p["ends_at"].startswith("2026-11-05T15:45")
        assert p["reminder_offsets"] == [30] and not p["all_day"]

    def test_summer_time_offset(self):
        now = datetime(2026, 7, 1, 12, 0, tzinfo=ZoneInfo("Europe/Dublin"))
        p = cal.build_event_from_parse({"title": "x", "day": "2026-07-03", "time": "15:00"}, now)
        assert p["starts_at"].startswith("2026-07-03T14:00")  # IST = UTC+1

    def test_all_day_bill_gets_day_before_reminder(self):
        p = cal.build_event_from_parse({"title": "Rent", "day": "2026-11-01", "kind": "bill",
                                        "recurrence": "monthly"}, self.NOW)
        assert p["all_day"] and p["reminder_offsets"] == [900] and p["recurrence"] == "monthly"

    def test_bad_values_fall_back(self):
        p = cal.build_event_from_parse({"title": "x", "day": "tomorrow", "time": "09:00",
                                        "kind": "nonsense", "recurrence": "hourly"}, self.NOW)
        assert p["kind"] == "event" and p["recurrence"] == "none"

    def test_unresolvable_day_raises_friendly_error(self):
        with pytest.raises(ValueError, match="which day"):
            cal.build_event_from_parse({"title": "x", "day": "whenever"}, self.NOW)

    def test_missing_title_raises(self):
        with pytest.raises(ValueError):
            cal.build_event_from_parse({"day": "today"}, self.NOW)


class TestValidation:
    def test_rejects_end_before_start(self):
        with pytest.raises(ValueError):
            cal._clean_payload({"title": "x", "starts_at": "2026-11-05T10:00:00Z", "ends_at": "2026-11-05T09:00:00Z"})

    def test_rejects_bad_kind_and_offsets(self):
        base = {"title": "x", "starts_at": "2026-11-05T10:00:00Z"}
        with pytest.raises(ValueError):
            cal._clean_payload({**base, "kind": "party"})
        with pytest.raises(ValueError):
            cal._clean_payload({**base, "reminder_offsets": [-5]})

    def test_offsets_sorted_unique(self):
        p = cal._clean_payload({"title": "x", "starts_at": "2026-11-05T10:00:00Z", "reminder_offsets": [30, 5, 30]})
        assert p["reminder_offsets"] == [5, 30]


class TestPersistence:
    def test_crud_is_scoped_to_owner(self, fake_sb, owner_id):
        row = cal.create_event(owner_id, {"title": "Dentist", "starts_at": "2026-11-05T15:00:00Z"})
        assert fake_sb.rows("calendar_events")[0]["user_id"] == owner_id
        assert cal.update_event("someone-else", row["id"], {"title": "hacked"}) is None
        assert cal.delete_event("someone-else", row["id"]) is False
        assert cal.update_event(owner_id, row["id"], {"title": "Dentist 2"})["title"] == "Dentist 2"
        assert cal.delete_event(owner_id, row["id"]) is True

    def test_list_merges_user_and_derived(self, fake_sb, owner_id):
        cal.create_event(owner_id, {"title": "Dentist", "starts_at": "2026-11-05T15:00:00Z"})
        fake_sb.tables["goals"] = [
            {"id": "g1", "user_id": owner_id, "title": "Run 10k", "deadline": "2026-11-10", "status": "active"},
            {"id": "g2", "user_id": owner_id, "title": "Done", "deadline": "2026-11-11", "status": "achieved"},
        ]
        fake_sb.tables["company_rsus"] = [
            {"id": "r1", "user_id": owner_id, "ticker": "ACME", "grant_date": "2025-11-20", "vesting_years": 4},
        ]
        items = cal.list_events(owner_id, dt(2026, 11, 1), dt(2026, 11, 30))
        titles = [i["title"] for i in items]
        assert titles == ["Dentist", "Goal deadline: Run 10k", "ACME RSU vest (est.)"]
        assert {i["origin"] for i in items} == {"user", "goal", "rsu"}
