# LifeOS

LifeOS is a personal operating system that aggregates health, finance, and goal data into a single AI-augmented dashboard. It is split into a Python backend/FastAPI service, a Next.js frontend, Supabase for persistence, and a set of scheduled workers. In production, the backend and workers run on a Linux VPS (see `docs/deployment.md`); Windows is the local-dev runtime.

## What it does

- **Health OS**: sleep, workouts, nutrition, recovery, health insights.
- **Finance OS**: transactions, spending analysis, cashflow, net worth, budget envelopes, transaction anomaly detection.
- **Investments**: portfolio tracking, advisor signals, watchlist, orders, risk guardrails, P&L, IBKR sync, price-freshness badges, Finnhub fallback.
- **Goals**: habit tracking, check-ins, streaks, milestones, weekly targets, rest days.
- **Chat**: Telegram bot and web chat that route messages through a LangGraph agent with persistent thread memory.
- **AI**: OpenRouter cloud models for insights, classification, and recommendations (optional local Ollama fallback for general chat in dev).
- **Observability**: pipeline run history, worker heartbeats, system logs, and one-click pipeline controls.

## High-level architecture

```
User (Telegram / Web)
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  FastAPI Backend│────▶│   Supabase DB   │────▶│  Next.js Dash │
│  src/api.py     │     │  PostgreSQL     │     │  frontend/    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Scheduled      │
│  Workers          │
│  src/workers/     │
└─────────────────┘
```

External systems:

- **Supabase**: database, auth, storage, realtime.
- **Telegram**: chat input/output.
- **OpenRouter**: cloud LLM for routing, extraction, and reasoning (used for everything in production).
- **Ollama**: optional local LLM; only `general` chat tries it, with OpenRouter fallback.
- **IBKR**: broker read-only Flex Query sync for positions, trades, options, and dividends.
- **Jarvis Advisor v3**: external cron advisor that reads/writes Supabase.
- **Dead/legacy integrations**: Strava API, Xiaomi/Mi Fitness OAuth, Google Fit.

## Repository layout

```
.
├── frontend/              # Next.js 14 + Tailwind dashboard
├── src/                   # Python backend and workers
│   ├── api.py             # FastAPI entry point
│   ├── graph.py           # LangGraph orchestrator (routes to src/nodes/)
│   ├── nodes/             # Intent handlers: finance, nutrition, trade, workout, health_image
│   ├── chat_service.py    # Web chat wrapper
│   ├── pipeline_service.py# Pipeline runner
│   ├── workers/           # Scheduled workers (health, finance, IBKR, etc.)
│   └── utils/             # Shared helpers
├── scripts/               # PowerShell installers and task schedulers (Windows local dev)
├── deploy/                # VPS production: systemd unit, crontab, Caddyfile, setup/update scripts
├── docs/                  # Architecture, migrations, API reference
│   ├── supabase-migrations/
│   ├── api-reference.md
│   ├── architecture.md
│   ├── daily-finance-flow.md
│   ├── jarvis-v3-supabase-positions-sync.md
│   └── research-bot-command.md
├── requirements.txt       # Python dependencies
├── .env.example           # Environment variables
└── README.md              # This file
```

## Setup on a new Windows PC

### 1. Prerequisites

- Python 3.11+
- Node.js 18+
- npm or pnpm
- Git
- Supabase project
- Telegram bot token (from BotFather)
- OpenRouter API key
- (Optional) IBKR account + Flex Query token
- (Optional) Ollama for local models

### 2. Clone and create environment

```powershell
git clone <repo-url>
cd lifeOS
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --no-deps -r requirements.txt   # --no-deps is required, see header of requirements.txt
```

### 3. Install frontend dependencies

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 4. Configure environment

Copy `.env.example` to `.env` and fill in all required variables:

```powershell
copy .env.example .env
```

Key variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENROUTER_API_KEY=sk-or-v1-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=your_chat_id
OLLAMA_HOST=http://localhost:11434
API_SECRET=change-me
IBKR_FLEX_TOKEN=your_flex_token
IBKR_FLEX_QUERY_ID=your_query_id
```

### 5. Run Supabase migrations

Open the Supabase SQL Editor and run the migrations in order:

```sql
docs/supabase-migrations/006-rls-authenticated-lockdown.sql
docs/supabase-migrations/008-split-sleep-cardio.sql
docs/supabase-migrations/012-goals.sql
docs/supabase-migrations/013-revert-sleep-cardio-split.sql
docs/supabase-migrations/014-company-rsus.sql
docs/supabase-migrations/015-action-items-resolution.sql
docs/supabase-migrations/016-advisor-purchases-sync.sql
docs/supabase-migrations/017-advisor-orders-and-risk.sql
docs/supabase-migrations/018-workout-external-id-and-budgets.sql
docs/supabase-migrations/019-dividends-goal-links-and-asset-class.sql
docs/supabase-migrations/020-user-identities.sql
docs/supabase-migrations/021-remaining-features.sql
docs/supabase-migrations/022-advisor-dividends.sql
```

### 6. Install Windows scheduled tasks

Open PowerShell as Administrator:

```powershell
.\scripts\windows_tasks.ps1
```

This creates tasks for:

| Task | Schedule | Purpose |
|---|---|---|
| `LifeOS-IBKRFlexSync` | Mon–Fri 15:00 CET | Pulls IBKR positions/trades into Supabase |
| `LifeOS-MorningBriefing` | Daily 07:00 | Sends morning Telegram briefing |
| `LifeOS-HealthSync` | Daily 23:30 | Runs nightly health aggregate and writes summary to `ai_insights` |
| `LifeOS-GoalCheckinDaily` | Daily 20:00 | Sends habit check-in questions |
| `LifeOS-GoalCheckinWeekly` | Sunday 10:00 | Weekly goal review |
| `LifeOS-PersonaInsightsDaily` | Daily 21:15 | Daily doctor/nutritionist/PT insights |
| `LifeOS-FuelPacing` | Daily 15:00 | Midday calorie/protein pacing check |
| `LifeOS-EveningAudit` | Daily 21:30 | Pre-sleep missing-data nudge |
| `LifeOS-WeeklyReview` | Sunday 10:00 | Weekly digest |
| `LifeOS-PriceRefresh` | Daily 10:00 | Refresh stale advisor position prices via Finnhub fallback |
| `LifeOS-TransactionAnomalies` | Sunday 10:30 | Scan transactions for duplicates/subscription changes |
| `LifeOS-SymptomAnalysis` | Monday 06:00 | Weekly statistical symptom correlation analysis |
| `LifeOS-PDFStatementSync` | Daily 08:00 | Parse bank/CC PDF statements and insert transactions |
| `LifeOS-OpenBankingSync` | Sunday 10:45 | Scaffold: pull EU bank transactions via GoCardless/Salt Edge/Plaid |

### 7. Start the backend and frontend

```powershell
# Terminal 1
python src/api.py

# Terminal 2
cd frontend
npm run dev
```

Or use `start_services.bat`.

### 8. Configure Telegram webhook

With ngrok or a public domain:

```powershell
ngrok http 8000
```

Then set `NGROK_DOMAIN` in `.env` and restart the backend. The backend auto-registers the Telegram webhook on startup.

## Production deployment (VPS + Vercel)

The backend and all scheduled workers run on a DigitalOcean droplet (Ubuntu 24.04,
systemd + cron, Caddy HTTPS, no ngrok/Ollama); the dashboard deploys to Vercel.
Full runbook: [`docs/deployment.md`](docs/deployment.md). Deploy new code with
`ssh root@<droplet-ip> "bash /opt/lifeos/deploy/update.sh"`.

## Investment / finance setup

See detailed docs:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — authoritative system reference (read this first).
- [`docs/CHANGES.md`](docs/CHANGES.md) — recent changes, impacts, IBKR setup, and Windows task verification.
- [`docs/daily-finance-flow.md`](docs/daily-finance-flow.md) — daily IBKR → LifeOS → Jarvis → dashboard flow.
- [`docs/jarvis-v3-supabase-positions-sync.md`](docs/jarvis-v3-supabase-positions-sync.md) — patch Jarvis v3 to read positions from Supabase.
- [`docs/research-bot-command.md`](docs/research-bot-command.md) — contract for the external Jarvis advisor bot.
- [`docs/api-reference.md`](docs/api-reference.md) — live API endpoints.

## Contributing / pushing changes

Every push must explain **"What's New"**. See [`AGENTS.md`](AGENTS.md) for the rule and the docs-update checklist.

Quick summary:

1. Jarvis v3 runs Mon–Fri at 15:30 CET and writes signals, snapshots, reports, and orders to Supabase.
2. LifeOS pulls real IBKR positions at 15:00 CET.
3. The dashboard shows real positions + advisor recommendations.
4. You text trades to the bot or use the Log Trade modal; positions update in Supabase.
5. Jarvis reads the updated positions the next day.

## Pipelines

The backend exposes pipeline triggers via `/api/pipelines/{id}/run`. Current pipelines:

- `health-sync`
- `daily-analysis`
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
- `pdf-statement-sync`
- `open-banking-sync`

You can also trigger a pipeline from the `/system` page in the dashboard.

## Adding new features

1. If you touch the database, add a numbered migration in `docs/supabase-migrations/`.
2. If you add a new worker, register it in `src/pipeline_service.py` and add its schedule to both `scripts/windows_tasks.ps1` (local dev) and `deploy/lifeos.cron` (production).
3. If you add new frontend pages/components, run `npm run build` in `frontend/` before committing.
4. If you change the Telegram/web chat behavior, test `src/graph.py` with `python -m py_compile src/graph.py`.

## Testing

```powershell
python -m py_compile src/graph.py src/nodes/*.py src/workers/ibkr_flex_sync.py src/pipeline_service.py src/workers/goal_checkin.py src/workers/transaction_anomalies.py src/workers/price_refresh.py src/workers/weekly_review.py src/workers/sync_health.py src/chat_threads.py src/db/supplements.py src/db/positions.py

cd frontend
npm run build
```

## Notes

- Windows is the primary local runtime for scheduled tasks and the backend.
- Jarvis v3 lives in a separate workspace/server and is not part of this repo.
- Supabase is the single source of truth for positions; both LifeOS and Jarvis read/write it.
