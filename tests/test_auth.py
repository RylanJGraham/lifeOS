import pytest
from fastapi.testclient import TestClient

import api
import auth


@pytest.fixture
def client():
    return TestClient(api.app)


# /calendar/feed/{token}.ics authenticates by its unguessable URL token (calendar apps cannot send headers).
PUBLIC = {"/status", "/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect", "/calendar/feed/{token}.ics"}


def test_every_route_requires_auth_except_health():
    """Guard against a new endpoint shipping unauthenticated."""
    unprotected = []
    for route in api.app.routes:
        if getattr(route, "path", None) in PUBLIC or not hasattr(route, "dependant"):
            continue
        calls = {d.call for d in route.dependant.dependencies}
        if auth.require_auth not in calls:
            unprotected.append(route.path)
    assert unprotected == []


def test_no_credentials_rejected(client):
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 401


def test_api_key_fails_closed_when_secret_unset(client, monkeypatch):
    monkeypatch.delenv("API_SECRET", raising=False)
    assert client.get("/api/pipelines", headers={"X-API-Key": ""}).status_code == 401
    assert client.get("/api/pipelines", headers={"X-API-Key": "anything"}).status_code == 401


def test_wrong_api_key_rejected(client, monkeypatch):
    monkeypatch.setenv("API_SECRET", "s3cret")
    assert client.get("/api/pipelines", headers={"X-API-Key": "nope"}).status_code == 401


def test_valid_api_key_accepted(client, monkeypatch, fake_sb, owner_id):
    monkeypatch.setenv("API_SECRET", "s3cret")
    res = client.get("/api/pipelines", headers={"X-API-Key": "s3cret"})
    assert res.status_code == 200


def test_valid_jwt_accepted_and_scoped_to_user(client, monkeypatch, fake_sb):
    monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-123" if t == "good" else None)
    fake_sb.tables["notifications"] = [
        {"id": "a", "user_id": "user-123", "title": "mine", "read_at": None, "created_at": "2026-01-02"},
        {"id": "b", "user_id": "someone-else", "title": "theirs", "read_at": None, "created_at": "2026-01-03"},
    ]
    ok = client.get("/api/notifications", headers={"Authorization": "Bearer good"})
    assert ok.status_code == 200
    assert [n["id"] for n in ok.json()["data"]] == ["a"]
    assert client.get("/api/notifications", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_cors_is_not_wildcard():
    assert auth.allowed_origins() != ["*"]


def test_owner_login_maps_to_legacy_profile_id_but_other_logins_do_not(client, monkeypatch, fake_sb, owner_id):
    """The owner's data lives under the user_profiles id, not their login id."""
    fake_sb.tables["notifications"] = [
        {"id": "mine", "user_id": owner_id, "title": "owner data", "read_at": None, "created_at": "2026-01-01"},
    ]
    monkeypatch.setenv("OWNER_AUTH_USER_ID", "Login-AAA")
    monkeypatch.setattr(auth, "_verify_jwt", lambda t: {"owner": "login-aaa", "stranger": "login-bbb"}.get(t))
    owner = client.get("/api/notifications", headers={"Authorization": "Bearer owner"})
    stranger = client.get("/api/notifications", headers={"Authorization": "Bearer stranger"})
    assert [n["id"] for n in owner.json()["data"]] == ["mine"]
    assert stranger.json()["data"] == []


def test_without_owner_mapping_login_id_is_used_as_is(client, monkeypatch, fake_sb, owner_id):
    monkeypatch.delenv("OWNER_AUTH_USER_ID", raising=False)
    fake_sb.tables["notifications"] = [
        {"id": "mine", "user_id": owner_id, "title": "x", "read_at": None, "created_at": "2026-01-01"},
    ]
    monkeypatch.setattr(auth, "_verify_jwt", lambda t: "some-login")
    assert client.get("/api/notifications", headers={"Authorization": "Bearer t"}).json()["data"] == []
