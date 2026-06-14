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
