"""API authentication.

Two accepted credentials, both fail-closed:

1. `Authorization: Bearer <supabase access token>` — verified against Supabase
   Auth. Gives a real `user_id`. This is what the mobile app and dashboard send.
2. `X-API-Key: <API_SECRET>` — a server-side shared secret for non-interactive
   callers (iOS Shortcut, scripts). Never ship it in a client bundle.

If neither is valid the request is rejected. If `API_SECRET` is unset the
API-key path is disabled (it used to silently disable *all* auth).
"""
import hmac
import logging
import os
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException

logger = logging.getLogger("auth")

_TOKEN_TTL_SECONDS = 60
_token_cache: dict[str, tuple[float, str]] = {}


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    method: str  # "jwt" | "api_key"


def _verify_jwt(token: str) -> str | None:
    """Return the Supabase user id for an access token, or None."""
    now = time.time()
    cached = _token_cache.get(token)
    if cached and cached[0] > now:
        return cached[1]

    from utils.supabase_client import get_supabase
    sb = get_supabase()
    if sb is None:
        return None
    try:
        resp = sb.auth.get_user(token)
        user = getattr(resp, "user", None)
        user_id = getattr(user, "id", None)
    except Exception as e:
        logger.info(f"JWT verification failed: {e}")
        return None
    if not user_id:
        return None
    if len(_token_cache) > 256:
        _token_cache.clear()
    _token_cache[token] = (now + _TOKEN_TTL_SECONDS, str(user_id))
    return str(user_id)


def _owner_user_id() -> str:
    """The single owner's id, for API-key callers (which carry no identity)."""
    from utils.resolve_user_id import resolve_user_id
    return resolve_user_id("api_key", "owner")


def _api_key_ok(provided: str | None) -> bool:
    secret = os.getenv("API_SECRET")
    if not secret or not provided:
        return False
    return hmac.compare_digest(provided.encode(), secret.encode())


async def require_auth(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None),
) -> AuthContext:
    if authorization and authorization.lower().startswith("bearer "):
        user_id = _verify_jwt(authorization[7:].strip())
        if user_id:
            return AuthContext(user_id=user_id, method="jwt")
    if _api_key_ok(x_api_key):
        return AuthContext(user_id=_owner_user_id(), method="api_key")
    raise HTTPException(status_code=401, detail="Invalid or missing credentials.")


def allowed_origins() -> list[str]:
    """CORS allow-list from CORS_ORIGINS (comma separated)."""
    raw = os.getenv("CORS_ORIGINS", "")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["http://localhost:3000", "http://localhost:8081"]
