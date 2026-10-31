"""Encrypted link storage, fail-closed behaviour and busy-only privacy for imported calendars."""
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

import api
import auth
import calendar_import as ci
from utils import secrets as sec

SECRET_URL = "https://outlook.office365.com/owa/calendar/abc123@corp.example/TOPSECRETTOKEN999/calendar.ics"
_START = (datetime.now(timezone.utc) + timedelta(days=10)).replace(hour=15, minute=0, second=0, microsecond=0)
FEED = (
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:m1\r\nSUMMARY:Layoff planning\r\n"
    f"LOCATION:Boardroom 4\r\nDESCRIPTION:agenda secrets\r\nDTSTART:{_START:%Y%m%dT%H%M%SZ}\r\n"
    f"DTEND:{(_START + timedelta(hours=1)):%Y%m%dT%H%M%SZ}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
)
H = {"Authorization": "Bearer good"}


class TestSecrets:
    def test_roundtrip_and_no_plaintext(self):
        enc = sec.encrypt_secret(SECRET_URL)
        assert enc.startswith("enc:v1:") and "TOPSECRETTOKEN999" not in enc and "outlook" not in enc
        assert sec.decrypt_secret(enc) == SECRET_URL
        assert sec.encrypt_secret(SECRET_URL) != enc  # random IV: ciphertexts differ

    def test_legacy_plaintext_passes_through(self):
        assert sec.decrypt_secret("https://x.example/a.ics") == "https://x.example/a.ics"

    def test_fails_closed_without_or_with_bad_key(self, monkeypatch):
        monkeypatch.delenv("CALENDAR_ENCRYPTION_KEY")
        with pytest.raises(sec.SecretsNotConfigured):
            sec.encrypt_secret("x")
        monkeypatch.setenv("CALENDAR_ENCRYPTION_KEY", "not-a-key")
        with pytest.raises(sec.SecretsNotConfigured):
            sec.encrypt_secret("x")

    def test_changed_key_is_reported_not_crashed(self, monkeypatch):
        enc = sec.encrypt_secret("x")
        monkeypatch.setenv("CALENDAR_ENCRYPTION_KEY", Fernet.generate_key().decode())
        with pytest.raises(sec.SecretsNotConfigured, match="re-add"):
            sec.decrypt_secret(enc)

    def test_tampered_ciphertext_rejected(self):
        enc = sec.encrypt_secret("x")
        with pytest.raises(sec.SecretsNotConfigured):
            sec.decrypt_secret(enc[:-4] + "AAAA")


class TestEndpoints:
    @pytest.fixture
    def client(self, monkeypatch, fake_sb):
        monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-1" if t == "good" else None)
        monkeypatch.setattr(ci, "get_supabase", lambda: fake_sb)
        monkeypatch.setattr(ci, "validate_public_url", lambda u: None)
        self.fetched = []
        monkeypatch.setattr(ci, "fetch_ics", lambda url: self.fetched.append(url) or FEED)
        return TestClient(api.app)

    def test_link_stored_encrypted_never_returned_and_used_decrypted(self, client, fake_sb):
        added = client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL})
        assert added.status_code == 200
        row = fake_sb.rows("calendar_subscriptions")[0]
        assert row["url"].startswith("enc:v1:") and "TOPSECRETTOKEN999" not in str(row)
        assert self.fetched and all(u == SECRET_URL for u in self.fetched)  # fetched with the real URL
        everything = client.get("/api/calendar/subscriptions", headers=H).text + added.text
        assert "TOPSECRETTOKEN999" not in everything and "abc123" not in everything
        assert client.get("/api/calendar/subscriptions", headers=H).json()["data"][0]["host"] == "outlook.office365.com"

    def test_no_key_means_503_and_nothing_stored(self, client, fake_sb, monkeypatch):
        monkeypatch.delenv("CALENDAR_ENCRYPTION_KEY")
        res = client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL})
        assert res.status_code == 503
        assert fake_sb.rows("calendar_subscriptions") == [] and fake_sb.rows("calendar_events") == [] and self.fetched == []

    def test_busy_mode_stores_no_details(self, client, fake_sb):
        client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL, "privacy": "busy"})
        ev = fake_sb.rows("calendar_events")[0]
        assert ev["title"] == "Busy" and ev["location"] is None and ev["notes"] is None
        assert "Layoff" not in str(fake_sb.tables) and "Boardroom" not in str(fake_sb.tables) and "agenda secrets" not in str(fake_sb.tables)
        assert client.get("/api/calendar/subscriptions", headers=H).json()["data"][0]["privacy"] == "busy"

    def test_full_mode_keeps_details(self, client, fake_sb):
        client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL})
        ev = fake_sb.rows("calendar_events")[0]
        assert ev["title"] == "Layoff planning" and ev["location"] == "Boardroom 4"

    def test_bad_privacy_value_rejected(self, client, fake_sb):
        res = client.post("/api/calendar/subscriptions", headers=H, json={"url": SECRET_URL, "privacy": "everything"})
        assert res.status_code == 400 and fake_sb.rows("calendar_subscriptions") == []

    def test_resync_keeps_busy_mode_and_errors_do_not_leak_url(self, client, fake_sb, monkeypatch):
        client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL, "privacy": "busy"})
        sid = fake_sb.rows("calendar_subscriptions")[0]["id"]
        assert client.post(f"/api/calendar/subscriptions/{sid}/sync", headers=H).status_code == 200
        assert fake_sb.rows("calendar_events")[0]["title"] == "Busy"
        def boom(url): raise ci.CalendarLinkError("The calendar server answered 404 — is the link still published?")
        monkeypatch.setattr(ci, "fetch_ics", boom)
        res = client.post(f"/api/calendar/subscriptions/{sid}/sync", headers=H)
        assert res.status_code == 502 and "TOPSECRETTOKEN999" not in res.text
        assert "TOPSECRETTOKEN999" not in str(fake_sb.rows("calendar_subscriptions"))

    def test_sync_with_lost_key_records_clear_error(self, client, fake_sb, monkeypatch):
        client.post("/api/calendar/subscriptions", headers=H, json={"name": "Work", "url": SECRET_URL})
        monkeypatch.setenv("CALENDAR_ENCRYPTION_KEY", Fernet.generate_key().decode())
        out = ci.sync_subscription(fake_sb.rows("calendar_subscriptions")[0])
        assert out["ok"] is False and "re-add" in out["error"]
        assert len(fake_sb.rows("calendar_events")) == 1  # existing events kept
