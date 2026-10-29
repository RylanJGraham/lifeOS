"""
Web chat service: exposes the LangGraph agent to the frontend over HTTP.

The graph invocation is blocking sync code and is shared with the Telegram
webhook flow, so all web chat runs are serialized behind a module-level lock.
"""
import json
import threading

from utils.logger import SupabaseLogger

_graph_lock = threading.Lock()


def handle_chat(
    message: str,
    image_b64: str | None = None,
    images: list[str] | None = None,
    user_id: str | None = None,
    source: str = "web",
    external_id: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Send a text message (or one or more images) through the agent graph and return its reply."""
    from graph import app_graph  # lazy: heavy imports (langchain, supabase)

    message = (message or "").strip()
    all_images = list(images or [])
    if image_b64:
        all_images.insert(0, image_b64)
    all_images = [i.strip() for i in all_images if i.strip()]
    if not message and not all_images:
        raise ValueError("Message or image is required.")

    payload: dict = {
        "user_id": user_id,
        "thread_source": source,
        "thread_external_id": external_id or user_id,
        "dry_run": dry_run,
    }
    if all_images:
        payload.update({
            "input_type": "image" if len(all_images) == 1 else "multi_image",
            "content": all_images[0] if len(all_images) == 1 else json.dumps(all_images),
            "caption": message or None,
            "images": all_images,
        })
    else:
        payload.update({"input_type": "text", "content": message})

    with _graph_lock:
        result = app_graph.invoke(payload)

    reply = (result or {}).get("response") or "I couldn't generate a response."
    ui = (result or {}).get("ui")
    SupabaseLogger.info("web-chat", "Web chat message processed.", {
        "preview": message[:120] if message else "[image]",
        "image_count": len(all_images),
    })
    return {"reply": reply, "ui": ui}
