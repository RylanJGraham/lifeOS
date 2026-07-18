# API Reference

Life-OS exposes a FastAPI backend for internal services and webhooks.

## Endpoints

### `POST /webhook`
Handles incoming Telegram messages.
- **Payload**: Standard Telegram Update JSON.
- **Returns**: `200 OK` on success. (Processing happens asynchronously via LangGraph).

### `GET /status`
Health check endpoint.
- **Returns**: 
  ```json
  {
    "status": "online",
    "services": {
      "ollama": "ok",
      "supabase": "ok",
      "ngrok": "ok"
    },
    "timestamp": "2026-06-13T07:00:00Z"
  }
  ```

### `POST /health/apple-sync`
Endpoint for Apple Health Shortcuts to push data.
- **Payload**:
  ```json
  {
    "steps": 5000,
    "hrv": 45,
    "sleep_duration": 420
  }
  ```
- **Returns**: `200 OK`

### `POST /workers/morning-briefing`
Triggers the morning briefing generation (usually called by Windows Task Scheduler).
- **Returns**: `202 Accepted`

### `GET /api/transactions`
Used by the Next.js frontend to fetch transactions.
- **Query Params**: `limit`, `offset`
- **Returns**: List of transaction objects.

---

## Web Chat & Pipeline Control (implemented)

> Note: several endpoints documented above (`/health/apple-sync`, `/workers/morning-briefing`, `/api/transactions`) are aspirational and do not exist in code. The endpoints below are live in `src/api.py`.

### `POST /api/chat`
Send a text message to the LangGraph agent (same pipeline as Telegram) and get the reply.
- **Payload**: `{ "message": "What did I eat today?" }`
- **Returns**: `{ "reply": "..." }`
- **Errors**: `400` empty message, `500` agent failure.

### `GET /api/pipelines`
List available data-ingest pipelines and their run status.
- **Returns**: `{ "status": "success", "data": [{ "id", "name", "description", "status": "idle|running", "last_started_at", "last_finished_at", "last_error" }] }`
- Pipeline ids: `strava-sync`, `xiaomi-sleep-sync`, `health-sync`, `daily-analysis`, `investment-notifier`, `morning-briefing`.

### `POST /api/pipelines/{pipeline_id}/run`
Trigger a pipeline run in a background thread.
- **Returns**: `{ "status": "started", "pipeline_id": "..." }`
- **Errors**: `404` unknown pipeline, `409` already running.
