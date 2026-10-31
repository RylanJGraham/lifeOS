# API Reference

Life-OS exposes a FastAPI backend in `src/api.py`. The endpoints below are live in the current codebase.

> **Do not document aspirational endpoints.** If an endpoint does not exist in `src/api.py`, it must not appear in this file. Update this file whenever `src/api.py` changes.

---

## Authentication

Every endpoint except `GET /status` requires one of:

- `Authorization: Bearer <Supabase access token>` — what the mobile app and dashboard send. The backend verifies it with Supabase Auth and scopes all data to that user (`src/auth.py`).
- `X-API-Key: <API_SECRET>` — for non-interactive callers (iOS Shortcut, scripts). The key acts as the single owner. If `API_SECRET` is unset this path is disabled (auth **fails closed**).

Anything else returns `401`. CORS only allows the origins in `CORS_ORIGINS` (default `http://localhost:3000,http://localhost:8081`); native mobile does not use CORS. `tests/test_auth.py` fails if a new route is added without auth.

---

## Webhook (retired)

### `POST /webhook`

**Retired.** Telegram is no longer used; the route is only mounted when `TELEGRAM_ENABLED=true`. Notifications go through push + the Inbox (see Notifications below). When enabled, it receives incoming Telegram updates and routes them into the LangGraph agent pipeline (`src/graph.py`). Processing is asynchronous.

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

## Notifications

All routes below are scoped to the authenticated user. Rows live in `notifications` / `notification_prefs`; workers create them through `utils/notify.notify()`.

### `GET /api/notifications?limit=50&unread_only=false`
Newest first. Returns `{ "status": "success", "data": [ { id, kind, title, body, deep_link, push_status, read_at, created_at } ], "unread": 3 }`.

### `POST /api/notifications/read`
Body: a JSON array of ids to mark read, or `null`/empty for all. Returns `{ "updated": n }`. Ids belonging to other users are ignored.

### `GET /api/notifications/prefs` · `PUT /api/notifications/prefs`
Preferences: `push_enabled` (master switch), `kinds` (`{"pacing": false}`; missing kinds default on), `quiet_start` / `quiet_end` (`"HH:MM"`, `""` clears), `timezone` (IANA name). `400` on a bad time or timezone. Quiet hours and toggles suppress the **push** only; the notification is still recorded for the Inbox.

### `POST /api/notifications/devices`
Body `{ "expo_push_token": "...", "platform": "ios" }`. Registers the device for the authenticated user (replaces the old client-side upsert that used the zero UUID).

### `POST /api/notifications/test`
Sends a test notification to the caller's devices.

---

## Calendar

User events are stored in `calendar_events`. The list endpoint also returns **derived, read-only** events (`origin: "goal"` for active goal deadlines, `"rsu"` for estimated RSU vest anniversaries).

### `GET /api/calendar/events?start=<ISO>&end=<ISO>`
Occurrences in the window (max 400 days), recurrence expanded. Each item: `id`, `occurrence_id`, `title`, `notes`, `location`, `starts_at`, `ends_at`, `all_day`, `kind` (`event|appointment|bill|reminder|workout|other`), `recurrence` (`none|daily|weekly|monthly|yearly`), `reminder_offsets` (minutes before start), `origin`.

### `POST /api/calendar/events`
Body: `title`, `starts_at` (required) plus any of `ends_at`, `all_day`, `kind`, `recurrence`, `recurrence_until`, `location`, `notes`, `reminder_offsets`. `400` on invalid values.

### `PATCH /api/calendar/events/{id}` · `DELETE /api/calendar/events/{id}`
`404` if the event does not exist or belongs to someone else. Both act on the whole series of a recurring event. Occurrences carry `series_starts_at` (the series' first start): to move a series from one occurrence, send `series_starts_at + (new_start − occurrence_start)`. If only `starts_at` is sent, `ends_at` moves with it so the duration is kept.

### `GET /api/calendar/feed` · `POST /api/calendar/feed/rotate`
Returns `{ "url": "https://<PUBLIC_DOMAIN>/calendar/feed/<token>.ics" }` — the secret subscription link (created on first use). `rotate` issues a new token and the old URL stops working.

### `GET /calendar/feed/{token}.ics` (public)
iCalendar feed of the last 30 days to next 365 days (events, alarms for reminder offsets, derived events). **Authenticated by the unguessable token in the URL only** — calendar apps cannot send headers. `404` for an unknown token; responses are `Cache-Control: no-store`.

### `GET/POST /api/calendar/subscriptions` · `POST …/{id}/sync` · `DELETE …/{id}`
Link an external calendar's **published ICS link** (Outlook, Google, Apple) so its events appear in LifeOS (`origin: "import"`, read-only; `PATCH`/`DELETE` on them return `403`). `POST` body `{name, url, privacy}` (`privacy`: `full` or `busy` — `busy` stores only "Busy": no title, location or notes ever reach the database); the link must be `https://` or `webcal://` and resolve to a public address (private/loopback hosts and redirects to them are refused); it is fetched and parsed first, and a bad link returns `400` with a reason and saves nothing. The URL is stored **encrypted** (Fernet, key in the server's `CALENDAR_ENCRYPTION_KEY`; `503` and nothing stored if the key isn't configured) and is never returned or logged. Imported events refresh every 30 minutes (`calendar-sync` worker), recurring events are expanded for 30 days back to 180 days ahead, and a failing refresh keeps the previously imported events and records `last_error`. Imported events are **not** included in LifeOS's own iCal feed (no echo loop).

`origin` values: `user` (editable), `import` (linked calendar, read-only) and the read-only derived `goal`, `rsu`, `subscription` (estimated renewals: ≥2 monthly charges of near-equal amount from `transactions`) and `dividend` (estimated from `advisor_dividends` history).

### Chat
"dentist thursday 3pm" in chat is routed to the `calendar` intent (`src/nodes/calendar.py`). The LLM only extracts a day phrase and a time; Python resolves the date (in `LIFEOS_TIMEZONE`). `dry_run=true` returns a preview card without saving.

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
| `/calendar` | Month agenda: user events + goal deadlines + RSU vests; add/delete events |
| `/system` | Pipelines, system logs, scheduled tasks |
| `/settings` | User profile, bank balance, risk policy |

---

## Notes

- The backend runs on `http://localhost:8000` by default.
- The frontend expects `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Update this file whenever a new route is added to `src/api.py` or the Next.js router.
