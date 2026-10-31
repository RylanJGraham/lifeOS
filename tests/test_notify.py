from datetime import datetime, timezone

import pytest

from utils import notify as notify_mod
from utils.notify import in_quiet_hours, notify, push_allowed, send_message
from workers.calendar_reminders import due_reminders

UTC = timezone.utc


def at(h, m=0):
    return datetime(2026, 11, 5, h, m, tzinfo=UTC)


class TestQuietHours:
    def test_wraps_midnight(self):
        p = {"quiet_start": "22:00", "quiet_end": "07:00", "timezone": "UTC"}
        assert in_quiet_hours(p, at(23)) and in_quiet_hours(p, at(3))
        assert not in_quiet_hours(p, at(7)) and not in_quiet_hours(p, at(12))

    def test_same_day_window(self):
        p = {"quiet_start": "13:00", "quiet_end": "14:00", "timezone": "UTC"}
        assert in_quiet_hours(p, at(13, 30)) and not in_quiet_hours(p, at(14))

    def test_uses_user_timezone(self):
        p = {"quiet_start": "22:00", "quiet_end": "07:00", "timezone": "America/New_York"}
        assert in_quiet_hours(p, at(3))        # 22:00 previous evening in NY (EST)
        assert not in_quiet_hours(p, at(15))   # 10:00 in NY

    def test_unset_or_invalid_means_never_quiet(self):
        assert not in_quiet_hours({}, at(3))
        assert not in_quiet_hours({"quiet_start": "22:00", "quiet_end": "22:00"}, at(23))
        assert not in_quiet_hours({"quiet_start": "bad", "quiet_end": "07:00"}, at(3))


class TestPushAllowed:
    def test_defaults_allow(self):
        assert push_allowed(None, "calendar", at(12)) is None

    def test_master_switch_and_kind_toggle(self):
        assert push_allowed({"push_enabled": False}, "calendar", at(12)) == "skipped_prefs"
        assert push_allowed({"kinds": {"pacing": False}}, "pacing", at(12)) == "skipped_prefs"
        assert push_allowed({"kinds": {"pacing": False}}, "calendar", at(12)) is None


class TestNotify:
    @pytest.fixture
    def pushes(self, monkeypatch, fake_sb):
        sent = []
        monkeypatch.setattr(notify_mod, "send_push", lambda t, b, d=None, user_id=None: sent.append((t, b, d, user_id)) or 1)
        return sent

    def test_records_and_pushes(self, fake_sb, pushes, owner_id):
        assert notify("calendar", "Dentist in 30 min", "15:00", deep_link="/calendar")
        row = fake_sb.rows("notifications")[0]
        assert row["user_id"] == owner_id and row["push_status"] == "sent" and row["pushed_at"]
        assert pushes[0][2]["deep_link"] == "/calendar" and pushes[0][2]["kind"] == "calendar"

    def test_dedupe_key_sends_once(self, fake_sb, pushes):
        assert notify("calendar", "a", dedupe_key="k1") is True
        assert notify("calendar", "a", dedupe_key="k1") is False
        assert len(fake_sb.rows("notifications")) == 1 and len(pushes) == 1

    def test_prefs_off_records_but_does_not_push(self, fake_sb, pushes, owner_id):
        fake_sb.tables["notification_prefs"] = [{"user_id": owner_id, "kinds": {"pacing": False}}]
        assert notify("pacing", "x")
        assert pushes == []
        assert fake_sb.rows("notifications")[0]["push_status"] == "skipped_prefs"

    def test_falls_back_to_telegram_when_no_device(self, fake_sb, monkeypatch):
        sent = []
        monkeypatch.setattr(notify_mod, "send_push", lambda *a, **k: 0)
        monkeypatch.setattr(notify_mod, "send_telegram", lambda t: sent.append(t) or True)
        notify("calendar", "Dentist in 30 min", "15:00")
        assert sent == ["Dentist in 30 min\n15:00"]
        assert fake_sb.rows("notifications")[0]["push_status"] == "telegram"

    def test_telegram_not_used_when_push_succeeds_or_prefs_off(self, fake_sb, pushes, monkeypatch, owner_id):
        sent = []
        monkeypatch.setattr(notify_mod, "send_telegram", lambda t: sent.append(t) or True)
        notify("calendar", "a")
        fake_sb.tables["notification_prefs"] = [{"user_id": owner_id, "kinds": {"pacing": False}}]
        notify("pacing", "b")
        assert sent == []

    def test_no_devices_status(self, fake_sb, monkeypatch):
        monkeypatch.setattr(notify_mod, "send_push", lambda *a, **k: 0)
        monkeypatch.setattr(notify_mod, "send_telegram", lambda t: False)
        notify("system", "x")
        assert fake_sb.rows("notifications")[0]["push_status"] == "no_devices"

    def test_never_raises_without_supabase(self, monkeypatch):
        monkeypatch.setattr(notify_mod, "get_supabase", lambda: None)
        assert notify("system", "x") is False

    def test_send_message_splits_title_and_body(self, fake_sb, pushes):
        send_message("briefing", "Morning briefing\nSlept 7h.\nTrain legs.")
        row = fake_sb.rows("notifications")[0]
        assert row["title"] == "Morning briefing" and row["body"] == "Slept 7h.\nTrain legs."


class TestDueReminders:
    NOW = at(14, 30)

    def occ(self, start, offsets):
        return {"starts_at": start.isoformat(), "reminder_offsets": offsets}

    def test_fires_inside_lookback_only(self):
        due = due_reminders([self.occ(at(15), [30])], self.NOW)       # fire_at 14:30 == now
        assert len(due) == 1
        assert due_reminders([self.occ(at(15, 5), [30])], self.NOW) == []   # not yet (14:35)
        assert due_reminders([self.occ(at(14, 35), [30])], self.NOW) == []  # fired 25 min ago: too old
        assert len(due_reminders([self.occ(at(14, 45), [30])], self.NOW)) == 0  # fires at 14:15, 15 min ago
        assert len(due_reminders([self.occ(at(14, 35), [30])], at(14, 10) + (self.NOW - at(14, 10)))) == 0

    def test_multiple_offsets(self):
        occ = self.occ(at(15), [30, 0])
        assert [o for _, o in due_reminders([occ], at(14, 30))] == [30]
        assert [o for _, o in due_reminders([occ], at(15, 0))] == [0]

    def test_no_offsets_never_fires(self):
        assert due_reminders([self.occ(at(15), [])], self.NOW) == []


class TestExternalRedaction:
    def test_telegram_and_push_get_generic_text_but_inbox_keeps_real_text(self, fake_sb, monkeypatch):
        tg, pushed = [], []
        monkeypatch.setattr(notify_mod, "send_push", lambda t, b, d=None, user_id=None: pushed.append((t, b)) or 0)
        monkeypatch.setattr(notify_mod, "send_telegram", lambda t: tg.append(t) or True)
        notify("calendar", "Layoff planning in 15 min", "14:00 · Boardroom 4", external=("Meeting in 15 min", "14:00"))
        assert pushed == [("Meeting in 15 min", "14:00")] and tg == ["Meeting in 15 min\n14:00"]
        row = fake_sb.rows("notifications")[0]
        assert row["title"] == "Layoff planning in 15 min" and "Boardroom" in row["body"]

    def test_send_message_external_text(self, fake_sb, monkeypatch):
        tg = []
        monkeypatch.setattr(notify_mod, "send_push", lambda *a, **k: 0)
        monkeypatch.setattr(notify_mod, "send_telegram", lambda t: tg.append(t) or True)
        send_message("briefing", "Morning briefing\nToday:\n- 14:00 Layoff planning", external_text="Morning briefing\nToday:\n- 14:00 Work meeting")
        assert "Layoff" not in tg[0] and "Work meeting" in tg[0]
        assert "Layoff planning" in fake_sb.rows("notifications")[0]["body"]
