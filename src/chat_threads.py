"""Persistent chat-thread memory for LifeOS.

Threads are keyed by (user_id, source, external_id). The agent loads recent
history before a turn and appends the new turn after responding, so context
is automatic across Telegram and web sessions.
"""
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore

logger = logging.getLogger("chat_threads")


def _get_supabase() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key or not create_client:
        return None
    return create_client(url, key)


def _coerce_messages(raw):
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    if not isinstance(raw, list):
        return []
    return raw


def load_thread(user_id: str, source: str, external_id: str, limit: int = 10) -> list:
    """Return recent messages as LangChain-style dicts {role, content}."""
    sb = _get_supabase()
    if not sb:
        return []
    try:
        res = (
            sb.table("chat_threads")
            .select("messages")
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        if res.data:
            msgs = _coerce_messages(res.data[0].get("messages"))
            return msgs[-limit:] if limit else msgs
    except Exception as e:
        logger.warning(f"Failed to load chat thread: {e}")
    return []


def save_thread(user_id: str, source: str, external_id: str, user_message: str, assistant_message: str, max_history: int = 50):
    """Append a new turn to the thread, capped at max_history messages."""
    sb = _get_supabase()
    if not sb:
        return
    try:
        existing = (
            sb.table("chat_threads")
            .select("id, messages")
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        msgs = _coerce_messages(existing.data[0].get("messages")) if existing.data else []
        msgs.append({"role": "user", "content": user_message, "ts": datetime.now(timezone.utc).isoformat()})
        msgs.append({"role": "assistant", "content": assistant_message, "ts": datetime.now(timezone.utc).isoformat()})
        if len(msgs) > max_history:
            msgs = msgs[-max_history:]
        payload = {
            "user_id": user_id,
            "source": source,
            "external_id": external_id,
            "messages": msgs,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing.data:
            sb.table("chat_threads").update(payload).eq("id", existing.data[0]["id"]).execute()
        else:
            payload["created_at"] = datetime.now(timezone.utc).isoformat()
            sb.table("chat_threads").insert(payload).execute()
    except Exception as e:
        logger.warning(f"Failed to save chat thread: {e}")


def format_history_for_prompt(messages: list) -> str:
    """Turn stored messages into a concise prompt appendix."""
    lines = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if content:
            lines.append(f"{role.capitalize()}: {content}")
    if not lines:
        return ""
    return "\n".join(["Recent context:", *lines, ""])
