"""
Web chat service: exposes the LangGraph agent to the frontend over HTTP.

The graph invocation is blocking sync code and is shared with the Telegram
webhook flow, so all web chat runs are serialized behind a module-level lock.
"""
import threading

from utils.logger import SupabaseLogger

_graph_lock = threading.Lock()


def handle_chat(
    message: str,
    image_b64: str | None = None,
    user_id: str | None = None,
    source: str = "web",
    external_id: str | None = None,
) -> dict:
    """Send a text message (or image) through the agent graph and return its reply."""
    from graph import app_graph  # lazy: heavy imports (langchain, supabase)

    message = (message or "").strip()
    image_b64 = (image_b64 or "").strip() or None
    if not message and not image_b64:
        raise ValueError("Message or image is required.")

    payload: dict = {
        "user_id": user_id,
        "thread_source": source,
        "thread_external_id": external_id or user_id,
    }
    if image_b64:
        payload.update({"input_type": "image", "content": image_b64, "caption": message or None})
    else:
        payload.update({"input_type": "text", "content": message})

    with _graph_lock:
        result = app_graph.invoke(payload)

    reply = (result or {}).get("response") or "I couldn't generate a response."
    SupabaseLogger.info("web-chat", "Web chat message processed.", {
        "preview": message[:120] if message else "[image]",
        "has_image": bool(image_b64),
    })
    return {"reply": reply}
