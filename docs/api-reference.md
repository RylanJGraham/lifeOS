# API Reference

Life-OS exposes a FastAPI backend in `src/api.py`. The endpoints below are live in the current codebase.

> **Do not document aspirational endpoints.** If an endpoint does not exist in `src/api.py`, it must not appear in this file. Update this file whenever `src/api.py` changes.

---

## Webhook

### `POST /webhook`

Receives incoming Telegram updates and routes them into the LangGraph agent pipeline (`src/graph.py`). Processing is asynchronous.

- **Payload**: Standard Telegram Update JSON.
- **Returns**: `200 OK` if the update was accepted.
- **Errors**: `500` if the Telegram payload is invalid or the agent fails.

---

## Chat

### `POST /api/chat`

Sends a text message to the LangGraph agent (same pipeline as Telegram) and returns the reply.

- **Payload**:
  ```json
  {
    "message": "What did I eat today?",
    "image": null,
    "session_id": "web-123...",
    "dry_run": false
  }
  ```
- `session_id` is optional. When provided, the conversation is persisted to `chat_threads` and loaded as context on the next turn.
- `dry_run` (optional, default `false`) runs the intent/parser but does **not** persist nutrition/workout/health entries. When `true` and the backend recognizes a logging intent, the response `ui` block has `status: "preview"` with parsed rows and a `metadata.intent` field. The client should render a confirmation card and re-send with `dry_run: false` to commit.
- **Returns**:
  ```json
  {
    "reply": "...",
    "ui": {
      "type": "confirmation",
      "status": "preview",
      "title": "Log 1 item?",
      "rows": [{"label": "Porridge", "value": "350 kcal"}],
      "metadata": {"intent": "confirm_nutrition", "items": [...]}
    }
  }
  ```
- **Errors**: `400` empty message, `500` agent failure.

### `POST /api/goals/checkin`

Records a Yes/No answer for a habit goal and updates its streak.

- **Payload**:
  ```json
  {
    "goal_id": "...",
    "answer": "yes",
    "insight_id": "..."
  }
  ```
- `insight_id` is optional; when provided, the matching `ai_insights` row is marked resolved.
- **Returns**:
  ```json
  {
    "status": "success",
    "streak": 12,
    "achieved": false
  }
  ```
- **Errors**: `400` invalid answer, `404` goal not found, `500` database failure.

### `POST /api/goals/chat`

Talks to the goal strategist (`src/goals_service.py`). It can create/update/delete/check-in goals when the user confirms an action.

- **Payload**:
  ```json
  {
    "message": "I want to save €5000 for a trip by June",
    "history": []
  }
  ```
- **Returns**:
  ```json
  {
    "reply": "...",
    "goals_changed": true
  }
  ```

### `POST /api/budget-coach`

Talks to the budget coach (`src/budget_service.py`). It reads the user's profile, recent transactions, budget envelopes, and active goals to give spending advice. It does **not** modify the database.

- **Payload**:
  ```json
  {
    "message": "What am I spending most on?",
    "history": []
  }
  ```
- `history` is optional; last 20 sanitized messages are sent as context.
- **Returns**:
  ```json
  {
    "reply": "..."
  }
  ```
- **Errors**: `400` empty message, `500` if the LLM client is not configured or the service errors.

---

## Observability

### `GET /telegram/webhook-info`

Returns the current Telegram webhook URL, status, pending update count, and last error. Also persists a snapshot to `telegram_webhook_health`.

- **Returns**:
  ```json
  {
    "status": "success",
    "data": {
      "webhook_url": "https://lifeos-you.duckdns.org/webhook",
      "status": "ok",
      "pending_update_count": 0,
      "last_update_at": "2026-08-23T18:00:00+00:00",
      "error": null
    }
  }
  ```

## Statement uploads

### `POST /statements/upload`

Accepts a PDF bank/CC statement, saves it to `STATEMENT_DIRECTORY`, records it in `statement_uploads`, and triggers the `pdf-statement-sync` pipeline.

- **Payload**: `multipart/form-data` with a `file` field.
- **Returns**:
  ```json
  {
    "status": "success",
    "message": "Statement uploaded and queued for processing.",
    "upload_id": "uuid",
    "path": "./data/statements/20260823_180000_statement.pdf"
  }
  ```

## Pipelines

### `GET /api/pipelines`

Lists available data-ingest pipelines and their run status.

- **Returns**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "strava-sync",
        "name": "Strava Sync",
        "description": "Pull recent activities from Strava into the workouts table.",
        "status": "idle",
        "last_started_at": null,
        "last_finished_at": null,
        "last_error": null
      }
    ]
  }
  ```
- **Pipeline ids**:
  - `strava-sync`
  - `xiaomi-sleep-sync`
  - `mifitness-sync`
  - `health-sync`
  - `investment-notifier`
  - `morning-briefing`
  - `ibkr-flex-sync`
  - `evening-audit`
  - `fuel-pacing`
  - `persona-insights`
  - `weekly-review`
  - `symptom-analysis`
  - `transaction-anomalies`
  - `price-refresh`
  - `open-banking-sync`
  - `pdf-statement-sync`

### `POST /api/pipelines/{pipeline_id}/run`

Triggers a pipeline run in a background thread.

- **Returns**:
  ```json
  {
    "status": "started",
    "pipeline_id": "..."
  }
  ```
- **Errors**: `404` unknown pipeline, `409` already running.

---

## System

### `GET /status`

Health check endpoint.

- **Returns**:
  ```json
  {
    "status": "online",
    "services": {
      "openrouter": "ok",
      "supabase": "ok",
      "ngrok": "ok"
    },
    "timestamp": "2026-06-13T07:00:00Z"
  }
  ```

### `GET /system`

Renders the system dashboard page (Next.js). Not a JSON API.

---

## Frontend routes

The Next.js frontend lives in `frontend/app/(app)/`.

| Route | Purpose |
|---|---|
| `/` | Dashboard home |
| `/finance` | Wealth OS: spending, net worth, cash flow |
| `/investments` | Portfolio positions, signals, orders, radar, reports |
| `/health` | Health metrics, workouts, nutrition |
| `/goals` | Goal list and check-ins |
| `/system` | Pipelines, system logs, scheduled tasks |
| `/settings` | User profile, bank balance, risk policy |

---

## Notes

- The backend runs on `http://localhost:8000` by default.
- The frontend expects `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Update this file whenever a new route is added to `src/api.py` or the Next.js router.
