from datetime import date

from workers.morning_briefing import sleep_facts

TODAY = date(2026, 10, 31)


def row(day, minutes=474):
    return {"recorded_at": f"{day}T00:00:00+00:00", "sleep_duration_minutes": minutes, "sleep_deep_minutes": 150}


def test_todays_record_counts_as_last_night():
    f = sleep_facts([row("2026-10-31", 420), row("2026-10-30", 480)], TODAY)
    assert f["last_sleep_h"] == 7.0 and "sleep_not_logged_days" not in f


def test_old_record_is_never_reported_as_last_night():
    f = sleep_facts([row("2026-10-28"), row("2026-10-27")], TODAY)
    assert "last_sleep_h" not in f
    assert f["sleep_not_logged_days"] == 3 and f["last_sleep_logged_on"] == "2026-10-28"


def test_yesterdays_record_is_stale_too():
    f = sleep_facts([row("2026-10-30")], TODAY)
    assert "last_sleep_h" not in f and f["sleep_not_logged_days"] == 1


def test_no_rows_gives_no_facts():
    assert sleep_facts([], TODAY) == {}


def test_week_stats_still_computed_from_available_rows():
    f = sleep_facts([row("2026-10-28", 360), row("2026-10-27", 480)], TODAY)
    assert f["sleep_debt_h"] == 2.0 and f["sleep_avg_h"] == 7.0
