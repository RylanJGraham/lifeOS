# Agent Guide — LifeOS

This file is for AI agents (and humans) working on the LifeOS repository. Read it before making changes.

## Project overview

LifeOS is a personal operating system with a Next.js dashboard, a Python FastAPI backend, Supabase persistence, and scheduled workers. In production the backend runs on a Linux VPS (systemd + cron, see `deploy/` and `docs/deployment.md`); Windows scheduled tasks are the local-dev scheduler. It tracks health, finance, investments, and goals, and uses LangGraph for chat/Telegram processing.

Key external dependencies:

- **Supabase** — PostgreSQL, auth, realtime.
- **OpenRouter** — cloud LLM for routing/extraction.
- **Expo push + in-app Inbox** — all user notifications go through `src/utils/notify.py`. **Telegram is retired** (route only mounted with `TELEGRAM_ENABLED=true`); do not add new Telegram sends.
- **IBKR** — read-only broker sync via Flex Query.
- **Jarvis Advisor v3** — external daily advisor that reads/writes Supabase.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, Tailwind CSS, Recharts, Framer Motion |
| Backend | FastAPI, Python 3.11+ |
| Agent | LangGraph + LangChain (OpenRouter; optional local Ollama fallback in dev) |
| DB | Supabase / PostgreSQL |
| Local runtime | Windows PowerShell + Python venv |
| Production runtime | Linux VPS (systemd + cron + Caddy), dashboard on Vercel |

## Repository conventions

### Directories

- `frontend/app/(app)/` — dashboard pages.
- `frontend/app/components/` — reusable React components.
- `src/` — Python backend and workers.
- `src/workers/` — scheduled scripts and data sync pipelines.
- `docs/` — architecture, migrations, and reference docs.
- `docs/supabase-migrations/` — numbered SQL migrations.
- `scripts/` — PowerShell installers and schedulers (Windows local dev).
- `deploy/` — VPS production: systemd unit, crontab (`lifeos.cron`), Caddyfile, `setup.sh`, `update.sh`.

### Naming

- Components use PascalCase.
- Python modules and functions use snake_case.
- Database tables are snake_case.
- Advisor-related tables are prefixed with `advisor_`.

### Environment variables

All secrets live in `.env`. The template is `.env.example`. Never commit `.env`.

### Database

- Use `IF NOT EXISTS` in migrations to make them idempotent.
- Add RLS policies for authenticated access.
- Numeric columns should be `NUMERIC`, not `FLOAT`.
- Dates in the database are ISO strings or `TIMESTAMP WITH TIME ZONE`.

## How to make changes

### AI agent notice: docs and "What's New" are mandatory

Every code change that touches data models, public interfaces, scheduled behavior, or user-facing features must leave a trail:
1. Update the relevant docs listed in the table below before you say the task is done.
2. Be ready to write a concise **"What's New:"** summary covering what changed, why, which files/modules/tables were touched, and any breaking changes or manual setup steps.
3. If the user says **"push changes"**, **"commit"**, or **"prepare a PR"**, stop and verify `docs/CHANGES.md`, `docs/ARCHITECTURE.md`, `docs/api-reference.md`, and `docs/supabase-schema.sql` are current before proceeding. Do not push undocumented work.

### Documentation is not optional

**Every code change that touches data models, public interfaces, scheduled behavior, or user-facing features must be accompanied by a docs update.** If you cannot update the relevant docs in the same commit, do not finish the task.

### Every push must explain "What's New"

When you finish work — whether committing, pushing, or opening a PR — you must leave a concise **"What's New"** summary that answers:

1. What changed?
2. Why did it change?
3. What files/modules/tables were touched?
4. Are there any breaking changes or manual setup steps?

**Where to put it:**

- **For a single commit:** add a `What's New:` block in the commit body.
- **For ongoing work:** append a short entry to `docs/CHANGES.md`.
- **When the user asks you to push/commit changes:** verify docs are up to date **before** assisting with the push. If `docs/CHANGES.md`, `docs/ARCHITECTURE.md`, `docs/api-reference.md`, or `docs/supabase-schema.sql` are stale, update them first.

A good entry looks like:

```text
What's New:
- Added advisor_orders table + order fills for manual-only order workflow.
- Updated /investments with OrdersPanel and RiskPanel.
- New Windows task LifeOS-IBKRFlexSync pulls IBKR positions at 15:00 Mon-Fri.
- Breaking: advisor_positions now requires source column (manual/jarvis).
```

If you cannot write a clear "What's New" summary, the change is not ready to push.

| What you changed | Required doc update |
|---|---|
| Database schema (tables, columns, views, indexes, policies) | Regenerate `docs/supabase-schema.sql` via `scripts/introspect_supabase_schema.py` and add a numbered migration in `docs/supabase-migrations/` |
| API endpoint or request/response shape | Update `docs/api-reference.md` |
| Finance/investment advisor flow, positions, trades, orders, or risk | Update `docs/daily-finance-flow.md` and `docs/jarvis-v3-supabase-positions-sync.md` if relevant |
| Telegram/web chat command or intent routing | Update `docs/research-bot-command.md` or add a new feature doc in `docs/` |
| New worker, pipeline, or scheduled task | Update `README.md`, `AGENTS.md` scheduled-task list, `scripts/windows_tasks.ps1` comments, and `deploy/lifeos.cron` |
| New dashboard page, tab, or component contract | Update `docs/ARCHITECTURE.md` frontend section and add a component note |
| Breaking change (anything that would break another AI, the frontend, Jarvis, or a scheduled task) | Document it in `docs/ARCHITECTURE.md` under **Breaking Changes & Guardrails** with migration steps |

### Database changes

1. Create a new numbered migration in `docs/supabase-migrations/`.
2. Apply it with `python scripts/migrate.py` (or paste it in the Supabase SQL Editor; `scripts/migrate.py --status` shows what is pending).
3. **Regenerate `docs/supabase-schema.sql`** by running `python scripts/introspect_supabase_schema.py`.
4. Update frontend types in `frontend/app/components/<module>/types.ts`.
5. Update backend code that reads/writes the table.
6. Update `docs/ARCHITECTURE.md` schema section if the table is part of a documented subsystem.

### Frontend changes

1. Components are client components unless they only render static data.
2. Use the shared theme/colors in `frontend/app/components/<module>/shared.tsx`.
3. Fetch data via the Supabase client in `frontend/utils/supabaseClient.ts`.
4. Run `npm run build` before finishing.

### Backend/worker changes

1. Workers should be runnable as scripts (`python src/workers/<name>.py`).
2. If a worker should be triggerable from the dashboard, register it in `src/pipeline_service.py`.
3. Add a Windows scheduled task in `scripts/windows_tasks.ps1` and a cron line in `deploy/lifeos.cron` if it should run on a schedule.
4. Use `logger` for output, not `print`.
5. Get the database client from `utils.supabase_client.get_supabase()` (never `create_client` directly) and send user notifications with `utils.notify.notify()` / `send_message()`.
6. Every new API route must depend on `auth.require_auth` and scope data by `auth.user_id` — `tests/test_auth.py` fails otherwise.

### Chat/agent changes

1. `src/graph.py` is the thin LangGraph orchestrator; the actual handlers live in `src/nodes/` (`finance.py`, `nutrition.py`, `trade.py`, `workout.py`, `health_image.py`, `general.py`).
2. `src/nodes/shared.py` holds shared state (`GraphState`), LLM clients, Supabase client, search helpers, and position math.
3. The `text_intent_node` routes messages to finance, trade, nutrition, workout, or general handlers.
4. Trade messages should update both `advisor_purchases` and `advisor_positions`.

## Critical architecture rules

### Positions are the single source of truth

**Jarvis Advisor v3 has been removed from the user's setup** — do not resurrect or recommend it. `advisor_positions` is still the single source of truth; it's just read/written today by LifeOS, the frontend, and the mobile app only. A planned in-house `src/workers/market_advisor.py` (see `docs/ARCHITECTURE.md` §3.3) will eventually take over Jarvis's role (daily signals/orders/reports) against this same schema — not built yet.

- Manual trades from Telegram/UI/mobile set `source = 'manual'`.
- IBKR sync sets `source = 'jarvis'` (field value predates the removal — still means "broker-synced").
- Any future advisor worker must preserve `source = 'manual'` when it updates positions, same contract Jarvis followed.

### Orders vs. positions vs. trades

| Table | Purpose |
|---|---|
| `advisor_positions` | Current holdings (source of truth). |
| `advisor_purchases` | Immutable trade history (events). |
| `advisor_orders` | Proposed/approved/sent/filled orders. |
| `advisor_order_fills` | Broker fill records for orders. |

### Currency

- Do not FX-convert in the backend unless explicitly requested.
- Store currency per position/trade.
- Mixed-currency portfolios are shown per-currency in the UI.

## Common tasks

### Add a new scheduled worker

1. Create `src/workers/my_worker.py`.
2. Add a runner function to `src/pipeline_service.py`.
3. Add a pipeline entry to `PIPELINES`.
4. Add a scheduled task in `scripts/windows_tasks.ps1` and a cron line in `deploy/lifeos.cron`.
5. Document it in `README.md`.

### Deploy changes to production

1. Push to `main` (with updated docs — see the "What's New" rules above).
2. Backend: `ssh root@<droplet-ip> "bash /opt/lifeos/deploy/update.sh"` — pulls, installs deps (`pip install --no-deps`), refreshes systemd unit + crontab, restarts the API.
3. Frontend: Vercel redeploys automatically on push; nothing to do.

### Add a new dashboard tab

1. Create component in `frontend/app/components/<module>/`.
2. Add route/page in `frontend/app/(app)/<page>/page.tsx`.
3. Update navigation in `frontend/app/(app)/layout.tsx` if needed.

### Update the IBKR parser

1. Run the worker manually to see the XML tags.
2. Map IBKR attributes to Supabase columns in `src/workers/ibkr_flex_sync.py`.
3. Test with `python src/workers/ibkr_flex_sync.py`.

## Testing checklist

Before calling a task done:

- [ ] `python -m pytest` passes (backend tests live in `tests/`; add one for new logic — dates, money math, auth)
- [ ] `python -m py_compile src/graph.py src/nodes/*.py src/workers/ibkr_flex_sync.py src/pipeline_service.py src/workers/goal_checkin.py src/workers/transaction_anomalies.py src/workers/price_refresh.py src/workers/weekly_review.py src/workers/sync_health.py src/workers/market_advisor.py src/chat_threads.py src/db/supplements.py src/db/positions.py`
- [ ] `cd frontend && npm run build` passes
- [ ] New migrations are applied in Supabase
- [ ] `docs/supabase-schema.sql` regenerated if any schema changed (`python scripts/introspect_supabase_schema.py`)
- [ ] `docs/api-reference.md` updated if any endpoint changed
- [ ] `docs/ARCHITECTURE.md` updated if any subsystem, flow, or contract changed
- [ ] Windows task is registered (if scheduled)

## Important docs

- `README.md` — setup and high-level architecture.
- `docs/daily-finance-flow.md` — finance/IBKR/Jarvis daily flow.
- `docs/jarvis-v3-supabase-positions-sync.md` — Jarvis patch instructions.
- `docs/research-bot-command.md` — external advisor contract.
- `docs/api-reference.md` — API endpoints.
- `docs/supabase-migrations/` — all SQL schema changes.

## Onboarding for a new AI agent

If you are reading this for the first time, do these checks before touching code:

1. Read `README.md` for setup and runtime overview.
2. Read `docs/ARCHITECTURE.md` for subsystem contracts and current data flow.
3. Read `docs/CHANGES.md` to see the latest "What's New" entries and breaking changes.
4. Run `git status` and `git diff --stat` to see what is in flight; do not overwrite uncommitted work.
5. Check `.env.example` against `.env` for any missing new variables introduced by recent work.
6. Check `docs/supabase-migrations/` for the highest-numbered migration; that is the current schema target.
7. If you are asked to add a feature, first read the files the previous agent would have touched (listed in `docs/CHANGES.md`).

### Mandatory "What's New" discipline

Before you tell the user a task is finished, you MUST be able to write a concise `What's New:` summary. If you cannot, the task is not ready. This applies to pushes, PRs, and any handoff to another agent.

When the user says **"push changes"**, **"commit"**, or **"prepare a PR"**, stop and verify that `docs/CHANGES.md`, `docs/ARCHITECTURE.md`, `docs/api-reference.md`, and `docs/supabase-schema.sql` reflect your changes. Update them first. Then add the `What's New:` block to the commit body or to `docs/CHANGES.md`.

## Notes for AI agents

- Windows is the local runtime; use PowerShell syntax for task scheduling.
- The backend and frontend both run on the same machine in development.
- Supabase is remote; all data flows through it.
- **Dead integrations — do not resurrect or recommend these unless the user explicitly asks:** Strava API, Xiaomi/Mi Fitness OAuth, Google Fit, **Jarvis Advisor v3** (external advisor service — removed; replaced by the planned in-house `market_advisor.py`, see §3.3 in `docs/ARCHITECTURE.md`). The current health data path is manual screenshots/chat + the iOS shortcut (see `docs/setup-ios-shortcut.md`).
- When in doubt, prefer explicit manual flows over broker automation.
- **Never treat a plan, summary, or partial result as finished work.** Verify builds and tests before declaring completion.
