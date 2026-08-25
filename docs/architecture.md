# LifeOS — Authoritative Architecture Reference

> **Read this first when extending the codebase.** This doc covers the complete system: data flows, database schema, API contracts, scheduled tasks, subsystem details, external integrations, and breaking-change guardrails.

---

## 1. Overview

LifeOS is a personal operating system that aggregates health, finance, investments, and goals into an AI-augmented dashboard.

### Components

| Layer | Technology | Key Files |
|---|---|---|
| Frontend | Next.js 14 + Tailwind CSS + Recharts + Framer Motion | `frontend/app/(app)/` |
| Backend | FastAPI + Python 3.11+ | `src/api.py`, `src/chat_service.py`, `src/pipeline_service.py` |
| Agent | LangGraph + LangChain (OpenRouter cloud / Ollama local) | `src/graph.py` (orchestrator), `src/nodes/*.py` (handlers), `src/goals_service.py` |
| Database | Supabase / PostgreSQL + pgvector | `docs/supabase-schema.sql` |
| Local runtime | Windows PowerShell + Python venv | `scripts/windows_tasks.ps1`, `start_services.bat` |
| External advisor | Jarvis Advisor v3 (separate repo/server) | `docs/jarvis-v3-supabase-positions-sync.md` |

### High-level data flow

```
User (Telegram / Web / Dashboard)
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  FastAPI Backend│────▶│   Supabase DB   │────▶│  Next.js Dash   │
│  src/api.py     │     │  PostgreSQL     │     │  frontend/      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Scheduled      │
│  Workers        │
│  src/workers/   │
└─────────────────┘
```

External systems (active): Supabase, Telegram, OpenRouter, Ollama, IBKR (read-only Flex Query), Apple Health (via iOS shortcut).
External systems (dead/legacy): Strava API, Xiaomi/Mi Fitness OAuth, Google Fit. Do not build new features against them.

---

## 2. Database Schema

The source of truth for the schema is `docs/supabase-schema.sql`, which is regenerated from the live database by running `python scripts/introspect_supabase_schema.py`.

### Core tables

| Table | Purpose | Key Columns |
|---|---|---|
| `user_profiles` | User-level config: height, weight, targets, salary, bank balance, risk policy | `user_id`, `bank_balance`, `base_salary`, `target_savings_rate`, `risk_policy` (jsonb), `daily_caloric_target` |
| `health_metrics` | Daily health snapshot: sleep, HR, HRV, steps, symptoms | `user_id`, `recorded_at`, `sleep_*`, `resting_heart_rate`, `hrv`, `steps`, `embedding` |
| `workouts` | Individual workout records (strength + cardio) | `user_id`, `workout_date`, `exercise_name`, `weight`, `reps`, `sets`, `duration_minutes`, `strava_id` |
| `meals` | Meal records with macros and micronutrients | `user_id`, `meal_time`, `description`, `calories`, `protein`, `carbs`, `fat`, `micronutrients`, `planned`, `embedding` |
| `transactions` | Bank transactions and expenses | `user_id`, `transaction_date`, `merchant_name`, `amount`, `category`, `is_investment`, `linked_trade_id` |
| `known_items` | Canonical food items with macros and aliases | `user_id`, `name`, `calories`, `protein`, `carbs`, `fat`, `micronutrients`, `aliases` |
| `memories` | Episodic memory with embeddings | `user_id`, `domain`, `content`, `metadata`, `embedding` |
| `ai_insights` | Generated insights/action items | `user_id`, `domain`, `insight_text`, `action_item`, `resolved_at`, `resolution` |
| `automations` | User-defined trigger/action rules | `user_id`, `name`, `trigger_condition`, `action_payload`, `is_active` |
| `goals` | Goal definitions and progress | `user_id`, `title`, `category`, `target_value`, `current_value`, `deadline`, `linked_metric`, `plan` |
| `goal_checkins` | Goal check-in events | `goal_id`, `user_id`, `note`, `value` |
| `company_rsus` | Equity grant tracking | `user_id`, `ticker`, `grant_date`, `initial_grant_value_usd`, `vesting_years` |
| `portfolio_holdings` | Legacy coarse portfolio buckets | `user_id`, `asset_class`, `ticker`, `value_usd` |
| `system_logs` | Centralized logs from workers and API | `timestamp`, `level`, `service`, `message`, `details` |
| `chat_threads` | Persistent conversation memory across Telegram/web | `user_id`, `source`, `external_id`, `messages` (jsonb) |
| `budgets` | Monthly category spending limits | `user_id`, `category`, `monthly_limit`, `currency` |
| `pipeline_runs` | Observability: status/duration/error for every pipeline run | `pipeline_id`, `status`, `started_at`, `finished_at`, `duration_ms`, `error` |
| `worker_heartbeats` | Scheduler health: last run and next expected run per worker | `worker_id`, `status`, `last_run_at`, `next_expected_at`, `error` |
| `advisor_dividends` | Dividend/distribution records from IBKR cash transactions | `user_id`, `symbol`, `dividend_date`, `amount`, `currency`, `source` |
| `goal_links` | Cross-goal impact links (habit → financial/health goal) | `user_id`, `source_goal_id`, `target_goal_id`, `link_type`, `weight` |
| `user_identities` | Maps Telegram chat IDs / web sessions to real `user_id` | `user_id`, `source`, `external_id` |
| `telegram_webhook_health` | Latest Telegram webhook status snapshot | `webhook_url`, `status`, `pending_update_count`, `last_update_at`, `error` |
| `statement_uploads` | PDF bank/CC statements queued for processing | `user_id`, `file_name`, `storage_path`, `status` |

### Investment / advisor tables

| Table | Purpose | Key Columns |
|---|---|---|
| `advisor_positions` | **Source of truth for current holdings.** Shared with Jarvis v3. | `user_id`, `symbol`, `quantity`, `average_cost`, `current_price`, `position_value`, `unrealized_pnl`, `currency`, `status`, `source`, `side`, `sector`, `tags`, `asset_class`, `options` |
| `advisor_position_history` | Daily per-position history | `user_id`, `symbol`, `record_date`, `quantity`, `price`, `position_value`, `unrealized_pnl` |
| `advisor_purchases` | Immutable trade history (events) | `user_id`, `symbol`, `action`, `quantity`, `price`, `total_cost`, `direction`, `fees`, `currency`, `executed_at`, `processed` |
| `advisor_purchase_history` | Compatibility view over `advisor_purchases` | mirrors `advisor_purchases` |
| `advisor_orders` | Proposed/approved/sent/filled orders | `user_id`, `symbol`, `action`, `order_type`, `quantity`, `limit_price`, `stop_price`, `trailing_pct`, `tif`, `status`, `source`, `rationale`, `confidence` |
| `advisor_order_fills` | Broker fill records for orders | `order_id`, `fill_qty`, `fill_price`, `fees`, `filled_at`, `broker_order_id` |
| `advisor_signals` | Daily swarm signals and price targets | `user_id`, `symbol`, `action`, `confidence`, `price_target`, `stop_loss`, `reasoning`, `swarm_agents`, `cycle_id` |
| `advisor_watchlist` | Candidate radar with conviction scoring | `user_id`, `symbol`, `interest_state`, `conviction_score`, `conviction_history`, `thesis`, `in_portfolio` |
| `advisor_portfolio_snapshots` | Daily portfolio value and exposures | `user_id`, `record_date`, `total_value`, `unrealized_pnl`, `cash`, `exposure_sector`, `exposure_geo`, `exposure_currency`, `risk_flags` |
| `advisor_daily_reports` | HTML/JSON advisor reports | `user_id`, `report_date`, `html_content`, `json_content`, `portfolio_value`, `vix_level`, `market_regime` |
| `advisor_positions_with_signals` | View joining positions with latest signal | `position fields + latest_signal_action`, `latest_signal_confidence`, `latest_price_target` |
| `advisor_signal_performance` | Aggregated signal win/loss stats | `symbol`, `total_signals`, `wins`, `losses`, `win_rate` |
| `advisor_position_performance` | Position-level performance view | mirrors `advisor_position_history` |
| `advisor_latest_portfolio` | Latest portfolio snapshot view | latest snapshot fields |

### Schema evolution

Migrations live in `docs/supabase-migrations/`. They are applied manually in the Supabase SQL Editor. Important migrations:

- `006-rls-authenticated-lockdown.sql` — replaces all policies with authenticated-only access.
- `008-split-sleep-cardio.sql` / `013-revert-sleep-cardio-split.sql` — split and later merged sleep/cardio tables.
- `014-company-rsus.sql` — creates `company_rsus`.
- `015-action-items-resolution.sql` — adds `resolved_at`/`resolution` to `ai_insights`.
- `016-advisor-purchases-sync.sql` — links manual trades to positions and adds `source` column.
- `017-advisor-orders-and-risk.sql` — creates `advisor_orders`, `advisor_order_fills`, and `user_profiles.risk_policy`.
- `019-dividends-goal-links-and-asset-class.sql` — creates `advisor_dividends`, `goal_links`, adds `advisor_positions.asset_class`, and creates `telegram_webhook_health` / `statement_uploads`.
- `020-user-identities.sql` — creates `user_identities` to map Telegram chat IDs / web sessions to real `user_id`.
- `018-workout-external-id-and-budgets.sql` — adds `workouts.external_id`, `user_profiles.supplements`, `budgets`, `chat_threads`, `pipeline_runs`, `worker_heartbeats`.

### Row Level Security

- All data tables have RLS enabled.
- `006-rls-authenticated-lockdown.sql` dropped all old policies and recreated one `authenticated full access` policy per table.
- The Python backend uses `SUPABASE_SERVICE_KEY`, which bypasses RLS.
- The Next.js frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` and must authenticate as a Supabase Auth user.

### Regenerating schema docs

```powershell
python scripts/introspect_supabase_schema.py
```

This updates `docs/supabase-schema.sql` from the live database. Do this after every migration.

---

## 3. Subsystems

### 3.1 Health / Nutrition / Workouts

**Data entry**

- Telegram/web chat routes food, workouts, sleep, symptoms, weight, and trades through the LangGraph agent (`src/graph.py` → `src/nodes/*.py`).
- Apple Health data is pushed via the iOS shortcut (see `docs/setup-ios-shortcut.md`).
- Sleep and cardio screenshots are parsed by the vision path in `src/nodes/health_image.py`.
- Strava, Xiaomi/Mi Fitness, and Google Fit integrations are **legacy/dead** and remain only as frozen files; do not rely on them.
- Workout cross-source deduplication uses `external_id` hashes via `src/utils/dedup.py`.
- Frequent items are shown in `FuelTab` as quick-add chips; clicking one inserts a meal from `known_items` and scales macros by portion.
- Meals can be marked `planned = true`; planned macros are included in FuelTab totals and in the `fuel_pacing.py` projection.

**Processing**

- `src/graph.py` parses natural language into structured records using an LLM, then resolves dates in Python (never trust LLM date math).
- Nutrition data is enriched with known-item canonical macros; unknown items are estimated by the LLM and stored with `ai_analysis`.
- Barcode shortcut: digit strings in nutrition messages are looked up in OpenFoodFacts before LLM estimation.
- Supplement auto-logging reads `user_profiles.supplements` JSONB; fallbacks are hardcoded in `src/db/supplements.py`.
- The supplement policy (which supplements, trigger meals, hours, on/off switch) is editable in `/settings` under the **Supplement Policy** section.
- Meals and health metrics are embedded into `vector(768)` for semantic search.
- `src/workers/symptom_analysis.py` runs weekly statistical correlation between symptoms, meals, and workouts and writes to `ai_insights`.

**Frontend**

- `frontend/app/(app)/health/page.tsx` orchestrates data fetching and tab switching.
- Tab content is componentized into `frontend/app/components/health/`: `ReadinessPanel` (cardio/HRV), `SleepPanel` (sleep architecture + schedule), `BodyTab` (weight check-ins, BMI, trend), `NutritionPanel` (trends/metric explorer), `WorkoutsPanel` (volume + muscle map + sessions), and `FuelTab` (nutrition detail).
- Shared helpers and the `DayLens` control live in `frontend/app/components/health/shared.tsx`.
- Meals in `FuelTab` expose a "Save as frequent item" button that upserts into `known_items`.

**Tables**

- `meals`, `health_metrics`, `workouts`, `known_items`, `exercise_muscles`.

**Workers**

- `sync_xiaomi.py` — sleep.
- `sync_mifitness.py` — workouts.
- `sync_strava.py` — Strava activities.
- `sync_health.py` — nightly aggregate (partially stubbed).
- `fuel_pacing.py` — midday calorie/protein pacing check.
- `persona_insights.py` — doctor/nutritionist/PT daily insights.
- `evening_audit.py` — missing-data nudge before bed.
- `weekly_review.py` — Sunday digest.
- `symptom_analysis.py` — weekly symptom correlation worker.

### 3.2 Finance

**Data entry**

- Transactions are logged via Telegram/web chat, imported from PDF statements (drag-and-drop on `/system`), or pulled via the EU Open Banking scaffold worker.
- Bank balance is set in `/settings` and stored in `user_profiles`.

**Processing**

- `frontend/app/(app)/finance/page.tsx` is a thin composition of components under `frontend/app/components/finance/`.
- It computes live bank balance as `stored_balance + net transaction change since stored_at`.
- Spending is categorized, aggregated by merchant/category, and compared month-over-month.
- Cashflow charts use real transaction amounts only; no estimated data is backfilled.
- Wide finance tables and charts are wrapped in horizontal-scroll containers for mobile viewports.

**Tables**

- `transactions`, `user_profiles`, `budgets`, `statement_uploads`.

**Workers**

- `investment_notifier.py` — scans un-notified transactions for investment markers and alerts via Telegram.
- `transaction_anomalies.py` — weekly scan for duplicate charges, subscription price changes, and unusual amounts (z-score).
- `pdf_ingestion.py` — parses bank/CC PDFs via OpenRouter vision and inserts transactions (triggered by `pdf-statement-sync` pipeline).
- `open_banking_sync.py` — scaffold for GoCardless/Salt Edge/Plaid EU transaction pulls.

### 3.3 Investments / Advisor

This is the most tightly integrated subsystem. LifeOS and Jarvis v3 share `advisor_positions` as the single source of truth.

**Daily flow (weekdays, Central European time)**

```
15:00  LifeOS-IBKRFlexSync   → pull real IBKR positions/trades → Supabase
15:30  Jarvis v3 daily run  → read positions from Supabase
                         → run swarm intelligence / P&L / watchlist
                         → write signals, snapshots, reports, orders to Supabase
        User views dashboard / gets Telegram brief
```

**Position source of truth**

- `advisor_positions` is read by both LifeOS and Jarvis.
- Manual trades from Telegram/UI or the Log Trade modal set `source = 'manual'`.
- IBKR sync sets `source = 'jarvis'`.
- Jarvis v3 preserves `source = 'manual'` when it updates positions.
- If a manual row exists, IBKR sync preserves its `average_cost` and `source`.

**Trade lifecycle**

1. Jarvis or the user creates a proposal in `advisor_orders` with `status = 'proposed'`.
2. User approves in the dashboard → `status = 'approved'`.
3. User executes manually in IBKR (no broker integration).
4. IBKR Flex Query sync creates a fill record in `advisor_order_fills` or a trade event in `advisor_purchases`.
5. `advisor_positions` is reconciled from IBKR open positions.
6. User can also text the bot: "bought 50 shares of NVDA at 230" → `advisor_purchases` + `advisor_positions` updated directly.

**Order types supported**

`MARKET`, `LIMIT`, `STOP`, `STOP_LIMIT`, `TRAILING_STOP` with `tif` values `DAY`, `GTC`, `IOC`, `FOK`.

**Risk policy**

Stored in `user_profiles.risk_policy` (JSONB, defaults from migration 017):

```json
{
  "max_position_pct": 15,
  "max_sector_pct": 40,
  "min_cash_pct": 5,
  "daily_loss_guardrail_pct": 5,
  "approval_threshold_usd": 1000
}
```

The `RiskPanel` in the dashboard reads this policy and warns on concentration, cash, or daily loss.

**Tables**

- `advisor_positions`, `advisor_purchases`, `advisor_orders`, `advisor_order_fills`, `advisor_signals`, `advisor_watchlist`, `advisor_portfolio_snapshots`, `advisor_daily_reports`, `advisor_position_history`, `advisor_dividends`, `company_rsus`.

**Position attributes**

- `asset_class` column stores `equity`, `option`, `crypto`, `etf`, `bond`, `cash`, or `other`.
- For options/derivatives, `options` JSONB stores `strike`, `expiry`, `put_call`, `multiplier`, and `underlying_symbol` from IBKR.
- `advisor_dividends` records cash distributions from IBKR `<CashTransactions>` and manual entries; `PnLPanel` shows trailing 12-month dividend yield.

**Workers / scripts**

- `src/workers/ibkr_flex_sync.py` — Flex Query v3 XML parser (positions, trades, dividends, options metadata).
- `src/workers/price_refresh.py` — Finnhub fallback for stale position prices.
- `src/pipeline_service.py` — exposes `ibkr-flex-sync` and `price-refresh` pipelines.
- `scripts/windows_tasks.ps1` — `LifeOS-IBKRFlexSync` at 15:00 Mon–Fri; `LifeOS-PriceRefresh` daily at 10:00.

### 3.4 Goals

- `src/goals_service.py` runs goal chats via OpenRouter.
- The LLM emits a fenced `goal_action` block only after explicit user confirmation.
- Valid operations: `create`, `update`, `delete`, `checkin`.
- Goal deadline math is done in Python, never by the LLM.
- Daily/weekly check-ins are sent by `src/workers/goal_checkin.py`.
- `goals.plan` JSONB supports milestones (with `done` flag) and habit weekly targets via `weekly_target` and `rest_days`.
- Milestones are editable checkboxes in `/goals`; the weekly-target logic skips rest days and sends a recovery note once the target is met.

**Tables**

- `goals`, `goal_checkins`.

### 3.5 Chat / Agent

- `src/graph.py` is the thin LangGraph orchestrator; handlers live in `src/nodes/`.
- `route_input` classifies messages into intents: nutrition, workout, health, trade, finance, goal, general.
- `src/nodes/text_intent.py` dispatches to dedicated handler modules that read/write Supabase.
- Trade handler now asks one clarifying question when symbol, quantity, or price is missing instead of dropping the message.
- `/chat` is labelled "Tasks & Chat" and combines conversation with observability: `ScheduledTasksPanel` reads `worker_heartbeats` to show last run, next expected run, and errors; `PipelinesPanel` lets the user trigger pipelines manually.
- `src/chat_threads.py` loads and persists recent conversation turns in `chat_threads` so Telegram and web sessions keep context.
- `src/chat_service.py` is the web chat wrapper around `graph.py`; it now accepts `session_id` and passes `thread_source`/`thread_external_id` into the graph state.
- Telegram messages hit `POST /webhook` and are routed the same way, using the Telegram `chat_id` as the thread key.

---

## 4. API / Contracts

Live endpoints are documented in `docs/api-reference.md`. Key contracts:

| Endpoint | Purpose |
|---|---|
| `POST /webhook` | Telegram updates |
| `POST /api/chat` | Web chat through LangGraph |
| `POST /api/goals/chat` | Goal strategist |
| `POST /api/budget-coach` | Budget coach (read-only spending advice) |
| `GET /api/pipelines` | List pipelines |
| `POST /api/pipelines/{id}/run` | Trigger a pipeline |
| `GET /status` | Health check |

Frontend routes are also part of the public contract. Do not rename or remove routes without updating `docs/api-reference.md` and checking inbound links.

---

## 5. Scheduled Tasks

Configured by `scripts/windows_tasks.ps1`. All times are local Windows time (Central European for this deployment).

Every scheduled task now invokes `python src/pipeline_service.py run <pipeline-id>`. This keeps each worker runnable as a standalone script, but ensures every run is recorded in `pipeline_runs` and `worker_heartbeats` so the **Tasks & Chat** panel shows real status and the `/system` page shows history.

| Task | Schedule | Purpose |
|---|---|---|
| `LifeOS-DailyAnalysis` | Daily 06:00 | Generate health/wealth insights with local Ollama |
| `LifeOS-MorningBriefing` | Daily 07:00 | Telegram morning briefing |
| `LifeOS-InvestmentNotifier` | Daily 09:00 | Scan transactions for new investments and alert |
| `LifeOS-IBKRFlexSync` | Mon–Fri 15:00 | Pull IBKR positions/trades before Jarvis run |
| `LifeOS-PriceRefresh` | Daily 10:00 | Refresh stale position prices via Finnhub |
| `LifeOS-HealthSync` | Daily 23:30 | Runs nightly health aggregate and writes summary to `ai_insights` |
| `LifeOS-GoalCheckinDaily` | Daily 20:00 | Daily habit check-in questions |
| `LifeOS-GoalCheckinWeekly` | Sunday 10:00 | Weekly goal review |
| `LifeOS-PersonaInsightsDaily` | Daily 21:15 | Doctor/nutritionist/PT insights |
| `LifeOS-FuelPacing` | Daily 15:00 | Midday calorie/protein pacing |
| `LifeOS-EveningAudit` | Daily 21:30 | Missing-data nudge |
| `LifeOS-WeeklyReview` | Sunday 10:00 | Weekly digest |
| `LifeOS-SymptomAnalysis` | Monday 06:00 | Weekly symptom/behavior correlation |
| `LifeOS-TransactionAnomalies` | Sunday 10:30 | Duplicate/subscription/anomaly scan |
| `LifeOS-PDFStatementSync` | Daily 08:00 | Parse bank/CC PDF statements into transactions |
| `LifeOS-OpenBankingSync` | Sunday 10:45 | Scaffold: EU Open Banking transaction pull (requires credentials) |

### Verifying and running tasks

Install or reinstall tasks from an elevated PowerShell prompt, running from the repo root:

```powershell
.\scripts\windows_tasks.ps1
```

The script uses `$PWD` and the local venv, so the repo must not be moved without rerunning this script.

List all LifeOS tasks:

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like "LifeOS-*" }
```

Run a task manually and inspect the result:

```powershell
Start-ScheduledTask -TaskName "LifeOS-IBKRFlexSync"
Get-ScheduledTaskInfo -TaskName "LifeOS-IBKRFlexSync"
```

Check task output in the repository logs directory (`logs/`) or Windows Event Viewer if a task fails silently.

---

## 6. IBKR Flex Query Setup Checklist

This is the read-only broker sync. The system never places orders.

1. In IBKR Account Management → Reports → Flex Queries, create an **Activity Flex Query** named `LifeOS Daily Sync`.
2. Include these sections and columns:
   - **Open Positions**: Account ID, Currency, Asset Class, Symbol, Description, Quantity, Mark Price, Position Value, Cost Basis Price, Cost Basis Money, Unrealized P/L, Side.
   - **Trades**: Account ID, Currency, Asset Class, Symbol, Trade ID, Date/Time, Transaction Type, Quantity, Trade Price, Proceeds, IB Commission, Buy/Sell, Transaction ID.
   - **Cash Transactions**: Account ID, Currency, Symbol, Date/Time, Amount, Type, Dividend Type, Transaction ID, Report Date.
3. Set delivery to **Flex Web Service**, format **XML**, period **Last Business Day**.
4. General config: Date Format `yyyyMMdd`, Time Format `HHmmss`, separator `;`.
5. Profit and Loss: `Include Offsetting Trade/Cancel Pairs = No`, `Include Currency Rates = No`, `Include Audit Trail Fields = No`.
6. In Account Management → Settings → Access Tokens, create a **Flex Web Service Token**.
7. Copy token and Query ID into `.env`:
   ```bash
   IBKR_FLEX_TOKEN=your_token
   IBKR_FLEX_QUERY_ID=your_query_id
   ```
8. Test:
   ```powershell
   .\venv\Scripts\Activate.ps1
   python src/workers/ibkr_flex_sync.py
   ```
9. Expected output: `IBKR Flex sync complete: positions=N, trades=M` where N/M are non-zero if you have open positions/recent trades. If both are zero, the worker dumps XML tags for debugging.

---

## 7. External Integrations

### IBKR Flex Query (read-only)

- Endpoint: `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService`
- Flow: `SendRequest` → `ReferenceCode` → `GetStatement` → XML.
- Required Flex Query sections: `Open Positions`, `Trades`, `Cash Transactions`, `Corporate Actions`, `Statement of Funds`.
- Env vars: `IBKR_FLEX_TOKEN`, `IBKR_FLEX_QUERY_ID`.
- No trading API access. The system never places orders.

### Jarvis Advisor v3

- External advisor that reads/writes Supabase.
- Writes to: `advisor_positions`, `advisor_signals`, `advisor_portfolio_snapshots`, `advisor_daily_reports`, `advisor_watchlist`, `advisor_orders`.
- Reads `advisor_positions` as the source of truth for holdings.
- See `docs/jarvis-v3-supabase-positions-sync.md` for the integration patch.

### Telegram

- Bot token from BotFather.
- Webhook registered automatically by `src/api.py` when `NGROK_DOMAIN` is set.
- User chat ID stored in `TELEGRAM_CHAT_ID`.

### OpenRouter

- Cloud LLM for routing, extraction, and reasoning.
- Models used: `openai/gpt-4o` (complex/vision), `openai/gpt-4o-mini` (fast routing).

### Ollama

- Local LLM for offline insights.
- Endpoint configured by `OLLAMA_HOST`.

---

## 7. Breaking Changes & Guardrails

### Database breaking changes

- Renaming a table/column that the frontend or Jarvis reads requires:
  1. A migration that preserves the old name with a compatibility view or column alias.
  2. Updating `docs/supabase-schema.sql`.
  3. Updating all backend/frontend references.
  4. Communicating the change to Jarvis v3 (external repo).
- Dropping `advisor_positions`, `advisor_purchases`, `advisor_signals`, or `advisor_portfolio_snapshots` will break both LifeOS and Jarvis. Do not drop without a migration plan.
- Changing the `source` enum or semantics breaks the manual-vs-Jarvis contract.

### API breaking changes

- Do not remove or rename `/webhook`, `/api/chat`, `/api/pipelines`, or `/status` without a compatibility shim.
- Frontend route changes must update `docs/api-reference.md` and all internal `href` links.

### Finance breaking changes

- `advisor_positions` is the single source of truth. No other file or config may override it for current holdings.
- Orders are manual-only. Never add broker order placement code without explicit user approval and a separate environment.
- Currency values are stored per-row. Do not FX-convert in the backend unless explicitly requested and documented.

### Health breaking changes

- `health_metrics` combines sleep and cardiovascular data (the split/revert is history). Do not re-split without a migration and frontend updates.
- Date resolution for meals/workouts/health records happens in Python; do not trust LLM date math.

### Adding a new feature

1. Add migration if schema changes.
2. Regenerate `docs/supabase-schema.sql`.
3. Update `docs/ARCHITECTURE.md` and `docs/api-reference.md`.
4. Add worker to `src/pipeline_service.py` and `scripts/windows_tasks.ps1` if scheduled.
5. Add frontend component/page and run `npm run build`.
6. Run `python -m py_compile src/graph.py src/workers/ibkr_flex_sync.py src/pipeline_service.py`.
7. Update `README.md` if setup steps change.

---

## 8. Onboarding for New AIs

If you are a new AI working on this repo:

1. Read `AGENTS.md` first — it has the conventions and mandatory checklist.
2. Read this file second to understand the system.
3. Read `docs/api-reference.md` for live API contracts.
4. Read `docs/supabase-schema.sql` for the current database shape.
5. Read `README.md` for setup and Windows task scheduling.
6. When changing anything, update the relevant docs in the same task. **Docs are not optional.**
7. Run the tests/builds in `AGENTS.md` before finishing.
8. If you are unsure whether a change is breaking, assume it is and document it in this file under **Breaking Changes & Guardrails**.

---

## 9. File Map

```
.
├── frontend/              # Next.js dashboard
│   ├── app/(app)/          # Pages: finance, health, investments, goals, system, settings
│   └── app/components/     # Reusable React components
├── src/                   # Python backend
│   ├── api.py             # FastAPI entry point
│   ├── graph.py           # LangGraph agent
│   ├── chat_service.py    # Web chat wrapper
│   ├── goals_service.py   # Goal strategist
│   ├── pipeline_service.py# Pipeline runner
│   ├── workers/           # Scheduled workers
│   └── utils/             # Shared helpers
├── scripts/               # PowerShell installers + schema introspection
│   ├── windows_tasks.ps1
│   └── introspect_supabase_schema.py
├── docs/                  # Architecture, migrations, API reference
│   ├── ARCHITECTURE.md    # this file
│   ├── api-reference.md
│   ├── supabase-schema.sql
│   ├── supabase-migrations/
│   ├── daily-finance-flow.md
│   ├── jarvis-v3-supabase-positions-sync.md
│   └── research-bot-command.md
├── requirements.txt
├── .env.example
└── README.md
```

---

## 10. Notes

- Windows is the primary local runtime. PowerShell is used for scheduled tasks.
- Supabase is remote; all data flows through it.
- Jarvis v3 is external and cannot be edited from this repo.
- The system is intentionally manual for broker actions: it suggests orders, but the user executes them in IBKR and either texts the bot or lets the Flex Query sync pick them up.
