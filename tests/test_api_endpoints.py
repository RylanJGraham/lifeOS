"""Notification + calendar endpoints, through the real FastAPI app."""
import pytest
from fastapi.testclient import TestClient

import api
import auth

H = {"Authorization": "Bearer good"}


@pytest.fixture
def client(monkeypatch, fake_sb):
    monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-1" if t == "good" else None)
    return TestClient(api.app)


def seed_notifications(sb):
    sb.tables["notifications"] = [
        {"id": "n1", "user_id": "user-1", "title": "a", "read_at": None, "created_at": "2026-01-01"},
        {"id": "n2", "user_id": "user-1", "title": "b", "read_at": None, "created_at": "2026-01-02"},
        {"id": "n3", "user_id": "other", "title": "c", "read_at": None, "created_at": "2026-01-03"},
    ]


class TestNotifications:
    def test_mark_specific_ids_read(self, client, fake_sb):
        seed_notifications(fake_sb)
        res = client.post("/api/notifications/read", json=["n1"], headers=H)
        assert res.status_code == 200 and res.json()["updated"] == 1
        read = {n["id"] for n in fake_sb.rows("notifications") if n["read_at"]}
        assert read == {"n1"}

    def test_mark_all_read_never_touches_other_users(self, client, fake_sb):
        seed_notifications(fake_sb)
        client.post("/api/notifications/read", json=None, headers=H)
        by_id = {n["id"]: n for n in fake_sb.rows("notifications")}
        assert by_id["n1"]["read_at"] and by_id["n2"]["read_at"] and by_id["n3"]["read_at"] is None

    def test_cannot_mark_another_users_notification(self, client, fake_sb):
        seed_notifications(fake_sb)
        res = client.post("/api/notifications/read", json=["n3"], headers=H)
        assert res.json()["updated"] == 0

    def test_prefs_roundtrip_and_validation(self, client, fake_sb):
        default = client.get("/api/notifications/prefs", headers=H).json()["data"]
        assert default["push_enabled"] is True
        ok = client.put("/api/notifications/prefs", headers=H, json={
            "quiet_start": "22:00", "quiet_end": "07:00", "timezone": "Europe/Dublin", "kinds": {"pacing": False},
        })
        assert ok.status_code == 200 and ok.json()["data"]["quiet_start"] == "22:00"
        assert client.put("/api/notifications/prefs", headers=H, json={"quiet_start": "25:99"}).status_code == 400
        assert client.put("/api/notifications/prefs", headers=H, json={"timezone": "Mars/Base"}).status_code == 400
        cleared = client.put("/api/notifications/prefs", headers=H, json={"quiet_start": "", "quiet_end": ""})
        assert cleared.json()["data"]["quiet_start"] is None

    def test_device_registration_uses_authenticated_user(self, client, fake_sb):
        client.post("/api/notifications/devices", headers=H, json={"expo_push_token": "ExponentPushToken[abc]"})
        row = fake_sb.rows("device_push_tokens")[0]
        assert row["user_id"] == "user-1" and row["expo_push_token"] == "ExponentPushToken[abc]"


class TestCalendarEndpoints:
    EV = {"title": "Dentist", "starts_at": "2026-11-05T15:00:00Z", "reminder_offsets": [30]}

    def test_create_list_delete(self, client, fake_sb):
        created = client.post("/api/calendar/events", json=self.EV, headers=H)
        assert created.status_code == 200
        eid = created.json()["data"]["id"]
        listed = client.get("/api/calendar/events", params={"start": "2026-11-01T00:00:00Z", "end": "2026-11-30T00:00:00Z"}, headers=H)
        assert [e["title"] for e in listed.json()["data"]] == ["Dentist"]
        assert client.delete(f"/api/calendar/events/{eid}", headers=H).status_code == 200
        assert client.delete(f"/api/calendar/events/{eid}", headers=H).status_code == 404

    def test_validation_errors_are_400(self, client):
        assert client.post("/api/calendar/events", json={"title": "x"}, headers=H).status_code == 400
        bad = {**self.EV, "kind": "party"}
        assert client.post("/api/calendar/events", json=bad, headers=H).status_code == 400
        too_wide = client.get("/api/calendar/events", params={"start": "2020-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z"}, headers=H)
        assert too_wide.status_code == 400

    def test_other_users_events_are_invisible(self, client, fake_sb):
        fake_sb.tables["calendar_events"] = [
            {"id": "x", "user_id": "other", "title": "secret", "starts_at": "2026-11-05T10:00:00+00:00", "recurrence": "none"},
        ]
        listed = client.get("/api/calendar/events", params={"start": "2026-11-01T00:00:00Z", "end": "2026-11-30T00:00:00Z"}, headers=H)
        assert listed.json()["data"] == []
        assert client.patch("/api/calendar/events/x", json={"title": "mine now"}, headers=H).status_code == 404
        assert client.delete("/api/calendar/events/x", headers=H).status_code == 404
