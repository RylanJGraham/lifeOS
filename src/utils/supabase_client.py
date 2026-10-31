"""Single shared Supabase service-role client.

Everything that needs the backend's Supabase client should call
`get_supabase()` instead of `create_client(...)` so config handling lives in
one place and the client is created lazily (never at import time).
"""
import logging
import os
import threading

logger = logging.getLogger("supabase_client")

_client = None
_lock = threading.Lock()


def get_supabase():
    """Return the shared service-role client, or None if unconfigured."""
    global _client
    if _client is not None:
        return _client
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    with _lock:
        if _client is None:
            try:
                from supabase import create_client
                _client = create_client(url, key)
            except Exception as e:
                logger.warning(f"Could not create Supabase client: {e}")
                return None
    return _client


def reset_supabase() -> None:
    """Drop the cached client (tests)."""
    global _client
    _client = None
