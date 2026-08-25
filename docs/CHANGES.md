# LifeOS — Recent Changes & Impact Log

> **Start here if you are a new AI joining mid-stream.** This file explains the most recent set of changes, why they were made, and what you must not break.

---

## Latest change: Wire all scheduled tasks through pipeline_service and clean up unconnected paths

What's New:
- **Scheduled tasks are now fully connected**: `scripts/windows_tasks.ps1` routes every Windows Scheduled Task through `python src/pipeline_service.py run <id>` instead of calling worker scripts directly. This guarantees every run writes to `pipeline_runs` and `worker_heartbeats`, so the **Tasks & Chat** panel always reflects real status.
- **Pipeline registry cleanup**: removed dead `_run_strava`, `_run_xiaomi_sleep`, and `_run_mifitness_workouts` runners from `src/pipeline_service.py`; added `goal-checkin-daily` and `goal-checkin-weekly` pipelines so the goal check-in tasks go through the same path.
- **Pipeline metadata**: each `PIPELINES` entry now carries a `schedule` string; `pipeline_service` writes it into `worker_heartbeats.metadata` and exposes it via `GET /api/pipelines` so the UI can show when each job is supposed to run.
- **Bug fix**: `src/workers/sync_health.py` selected a non-existent `weight_kg` column; it now uses `body_weight_kg`.
- **Docs**: updated `docs/ARCHITECTURE.md` scheduled-tasks section and `docs/CHANGES.md`. `AGENTS.md` already contains the push-discipline reminder.

Why: eliminate “dark” scheduled tasks that ran without observable status, remove dead integration code, and make the heartbeat panel truthful.

Files/modules touched:
- `src/pipeline_service.py` (dead runners removed, goal-checkin pipelines, schedule metadata, heartbeat wiring).
- `scripts/windows_tasks.ps1` (rewritten to use `pipeline_service.py run`).
- `src/workers/sync_health.py` (fixed weight column).
- `frontend/utils/api.ts` and `frontend/app/(app)/chat/components/PipelinesPanel.tsx` (display schedule).
- `docs/ARCHITECTURE.md`, `docs/CHANGES.md`.

Breaking changes / manual setup:
- Re-run `scripts/windows_tasks.ps1` from an elevated PowerShell prompt so the old direct-script tasks are replaced with the new `pipeline_service` tasks.
- The `daily-analysis` (06:00) and `investment-notifier` (09:00) pipelines are now scheduled alongside the other daily tasks.

---

## Latest change: Dashboard bug fixes, budget coach, Body tab, and Tasks & Chat rename

What's New:
- **Investments bug fix**: duplicate `advisor_positions` rows (manual zero-UUID vs broker rows) are now deduplicated in the UI; `frontend/app/components/investments/shared.tsx::dedupePositions` keeps the broker/Jarvis row and merges manual notes. `advisor_positions_with_signals` view now falls back to `COALESCE(p.sector, p.tags->>1, 'Unknown')` so sector concentration is no longer 90% Unknown. `src/workers/price_refresh.py` resolves the real user_id and recalculates `position_value`/`unrealized_pnl` after price updates.
- **Health UI bug fixes**: `FuelTab` fiber average now sums fiber from logged meals instead of returning a hardcoded value; a `CaffeinePanel` timeline has been added; the `FavoritesBar` hook-order crash ("Rendered fewer hooks than expected") is fixed.
- **Goals bug fix**: portfolio-% goals (e.g., "Increase portfolio by 15%") now use `metric_basis.baseline_value` to compute real progress; `src/workers/goal_checkin.py` defaults missing financial metrics to `bank_balance`.
- **Budget coach**: new `POST /api/budget-coach` endpoint (`src/budget_service.py`) and chat UI in `BudgetPanel.tsx`. The coach reasons over salary, rent, bank balance, recent spending, budgets, and active goals. Rent falls back to recent `Housing & Utilities` / `Enso` transactions when `user_profiles.monthly_rent` is unset.
- **Body tab**: new `BodyTab` on `/health` shows height, current/target weight, BMI, weight trend chart, and a check-in list. Weight check-ins are stored in `health_metrics.body_weight_kg`; the UI can log a new check-in directly.
- **Tasks & Chat**: `/chat` is renamed "Tasks & Chat" in navigation. A new `ScheduledTasksPanel` shows `worker_heartbeats` (last run, next expected, status/errors) and pipelines stay runnable from the side panel.
- **Schema cleanup**: migration `023-bugs-coach-and-position-cleanup.sql` adds `monthly_rent` to `user_profiles`, `metric_basis` JSONB to `goals`, recreates the position signals view, and removes zero-UUID duplicate positions.

Why: fix visible data bugs that were making the dashboard confusing, give the user a lightweight budget advisor that is separate from goals, and make body-weight tracking a first-class health metric.

Files/modules touched:
- Backend: `src/budget_service.py`, `src/workers/price_refresh.py`, `src/workers/goal_checkin.py`, `src/workers/ibkr_flex_sync.py`.
- Frontend: `frontend/app/components/finance/BudgetPanel.tsx`, `frontend/app/components/investments/shared.tsx`, `frontend/app/components/investments/useInvestmentsData.ts`, `frontend/app/components/investments/types.ts`, `frontend/app/(app)/finance/page.tsx`, `frontend/app/components/health/FuelTab.tsx`, `frontend/app/components/health/BodyTab.tsx`, `frontend/app/(app)/health/page.tsx`, `frontend/app/(app)/chat/components/ChatPanel.tsx`, `frontend/app/(app)/chat/components/ScheduledTasksPanel.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/components/goals/GoalCard.tsx`, `frontend/app/components/goals/useGoalsData.ts`, `frontend/app/(app)/goals/page.tsx`.
- Schema: `docs/supabase-migrations/023-bugs-coach-and-position-cleanup.sql`.
- Docs: `docs/CHANGES.md`, `docs/api-reference.md`, `AGENTS.md`.

Breaking changes / manual setup:
- Apply migration `023` in the Supabase SQL Editor. It has already been run against the production project.
- Regenerate `docs/supabase-schema.sql` with `python scripts/introspect_supabase_schema.py` after applying `023`.
- `SERPER_API_KEY` must remain in `.env`; the budget coach relies on the same OpenRouter/Serper stack as the rest of the agent.

---

## Latest change: Remaining overhaul batch — finance componentization, nutrition UI, agent refactor, docs discipline

What's New:
- **Agent**: `src/graph.py` is now a thin orchestrator; all handlers moved to `src/nodes/` (`shared`, `finance`, `nutrition`, `trade`, `workout`, `weight`, `general`, `health_image`, `image_dispatcher`, `text_intent`).
- **Cleanup**: deleted orphaned `src/workers/scheduler.py`.
- **Finance UI**: split `frontend/app/(app)/finance/page.tsx` (~967 lines) into components under `frontend/app/components/finance/`; added mobile horizontal-scroll wrappers to charts and tables.
- **Investments**: `src/workers/ibkr_flex_sync.py` now parses options/derivatives metadata and dividend cash transactions; `src/db/positions.py::update_position_from_fill` accepts `options`; `frontend/app/components/investments/PnLPanel.tsx` shows trailing 12-month dividend yield; `PositionsTable.tsx` badges `asset_class` and option metadata.
- **Nutrition UI**: added a configurable **Supplement Policy** section in `/settings`; added a **Favorites** quick-add bar and `planned` meal toggle in `FuelTab`; planned meals are included in macro totals and in `src/workers/fuel_pacing.py`.
- **Pipeline**: removed dead Strava/Xiaomi/Mi Fitness pipeline entries from `src/pipeline_service.py` and `scripts/windows_tasks.ps1`; updated `LifeOS-HealthSync` to run `sync_health.py` only.
- **Docs**: updated `README.md`, `AGENTS.md`, and `docs/ARCHITECTURE.md` to reflect the node architecture, dead integrations, planned meals, supplement policy UI, options/dividends, and finance componentization.

Why: lower friction for food logging, make the investment dashboard richer (options + dividends), make the chat agent modular and maintainable, and document the system so the next AI can get oriented quickly.

Files/modules touched:
- Backend: `src/graph.py`, `src/nodes/*.py`, `src/pipeline_service.py`, `src/workers/ibkr_flex_sync.py`, `src/workers/fuel_pacing.py`, `src/db/supplements.py`, `src/db/positions.py`, `scripts/windows_tasks.ps1`.
- Frontend: `frontend/app/(app)/finance/page.tsx`, `frontend/app/components/finance/*.tsx`, `frontend/app/components/health/FuelTab.tsx`, `frontend/app/(app)/settings/page.tsx`, `frontend/app/components/investments/PnLPanel.tsx`, `frontend/app/components/investments/PositionsTable.tsx`, `frontend/app/components/investments/types.ts`.
- Schema: `docs/supabase-migrations/021-remaining-features.sql` (planned meals, options JSONB, onboarding JSONB), `docs/supabase-migrations/022-advisor-dividends.sql` (ex_date/record_date/index on top of 019), `docs/supabase-migrations/_apply_all_remaining.sql` (concatenated 019–022 for easy copy/paste).
- Docs: `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CHANGES.md`.

Breaking changes / manual setup:
- **Apply migrations `019`, `020`, `021`, and `022` in the Supabase SQL Editor** before running the new workers. A convenience file `docs/supabase-migrations/_apply_all_remaining.sql` contains all four in order.
- After migrations are applied, regenerate `docs/supabase-schema.sql` with `python scripts/introspect_supabase_schema.py`.
- Re-run `scripts/windows_tasks.ps1` to update `LifeOS-HealthSync`.

---

## Latest change: Nutrition supplement policy UI, favorites quick-add, and planned meals

What's New:
- **Settings UI**: new "Supplement Policy" section on `/settings`. Loads `user_profiles.supplements`, falls back to the hardcoded defaults from `src/db/supplements.py`, and lets the user toggle auto-logging, breakfast/dinner triggers, morning/evening hours, and edit the morning/evening supplement lists (description + macros). Saved via the existing `saveProfile` flow.
- **Backend**: `src/db/supplements.py::_load_supplement_policy` now normalizes UI-shaped policies and fills missing fields from the hardcoded defaults without changing those defaults or breaking existing callers.
- **Fuel UI**: added a "Favorites" quick-add bar in `FuelTab`; fetches top `known_items` by `use_count`, lets the user set a quantity/portion, inserts a `meals` row for today with scaled macros, and bumps `known_items.use_count` defensively.
- **Fuel UI**: added an inline meal add/edit form with a `planned` toggle. Planned meals render with a dashed border, lighter background, and a "planned" badge; day summary totals include both logged and planned meals.
- **Fuel UI**: wide charts and meal gallery are wrapped in `overflow-x-auto` containers with `min-width` guards for narrow viewports.
- **Worker**: `src/workers/fuel_pacing.py` now fetches `planned` meals for today and projects `actual + planned` calories/protein before checking the 15:00 pacing thresholds; warnings only fire when the projected total is still behind.

Why: reduce friction for recurring supplement configuration, make frequent meals one-tap loggable from the dashboard, and let users plan upcoming meals without triggering false pacing alerts.

Files/modules touched:
- Frontend: `frontend/app/(app)/settings/page.tsx`, `frontend/app/components/health/FuelTab.tsx`.
- Backend: `src/db/supplements.py`, `src/workers/fuel_pacing.py`.
- Docs: `docs/CHANGES.md`.

Breaking changes / manual setup:
- Migration `021-remaining-features.sql` adds `meals.planned BOOLEAN DEFAULT FALSE`; apply it in Supabase before planned meals are used.
- No changes to `src/graph.py` or `src/nodes/*`.

---

## Previous change: Componentize `finance/page.tsx` and render position option metadata

What's New:
- **Frontend**: Split the monolithic `frontend/app/(app)/finance/page.tsx` (~967 lines) into focused components under `frontend/app/components/finance/`:
  - `FinanceHeader.tsx` — page header, time-filter pills, tab nav, Daily Report button, Insights banner, and Investments cross-link.
  - `SpendingPanel.tsx` — capital outflow KPIs, daily trend chart, merchant leaderboard, category donut, and recent expenses.
  - `NetWorthPanel.tsx` — cash/investment/net-worth cards and net-worth history area chart.
  - `CashflowPanel.tsx` — income/expense KPIs, savings-rate chip, income-vs-expenses composed chart, and cashflow waterfall.
  - `BudgetPanel.tsx` — budget envelopes with CRUD controls.
  - `TransactionsTable.tsx` and `shared.tsx` — reusable transaction table and shared helpers/colors.
- **Frontend**: Wrapped wide tables and Recharts charts in `overflow-x-auto` containers with `min-width` guards for mobile viewports.
- **Investments UI**: `frontend/app/components/investments/PositionsTable.tsx` now renders small badges for non-equity `asset_class` and for option metadata (`strike`, `expiry`, `put_call`/`putCall`/`right`/`side`/`type`) when `p.options` is present.

Why: make the finance page maintainable, keep each tab self-contained, improve mobile responsiveness, and surface options/derivatives metadata on positions so the dashboard reflects the full portfolio.

Files/modules touched:
- Frontend: `frontend/app/(app)/finance/page.tsx` (thin composition now), `frontend/app/components/finance/FinanceHeader.tsx`, `frontend/app/components/finance/SpendingPanel.tsx`, `frontend/app/components/finance/NetWorthPanel.tsx`, `frontend/app/components/finance/CashflowPanel.tsx`, `frontend/app/components/finance/BudgetPanel.tsx`, `frontend/app/components/finance/TransactionsTable.tsx`, `frontend/app/components/finance/shared.tsx`.
- Investments UI: `frontend/app/components/investments/PositionsTable.tsx`.
- Docs: `docs/CHANGES.md`.

Breaking changes / manual setup:
- No public API, database, or scheduled-task changes.
- No new dependencies.

---

## Previous change: Refactor monolithic `src/graph.py` into modular `src/nodes/`

What's New:
- **Agent**: `src/graph.py` is now a thin orchestrator (~60 lines) that only defines `GraphState`, `route_input`, `route_image`, wires the `StateGraph`, and re-exports `supabase`, `llm_fast`, `llm_cloud`, `web_search`, `app_graph`.
- **Agent**: All node logic moved to `src/nodes/`: `shared.py` for helpers/state; `finance.py`, `nutrition.py`, `health_image.py`, `image_dispatcher.py`, `trade.py`, `workout.py`, `weight.py`, `general.py`, and `text_intent.py`.
- **Agent**: `text_intent_node` now classifies intent and dispatches to the dedicated handler modules.
- **Cleanup**: Deleted orphaned `src/workers/scheduler.py` (Windows tasks + `pipeline_service.py` cover scheduling).

Why: improve maintainability and testability of the chat/agent pipeline; make it safer for future AI agents to extend individual intents without touching the graph wiring.

Files/modules touched:
- Backend: `src/graph.py`, `src/nodes/shared.py`, `src/nodes/finance.py`, `src/nodes/nutrition.py`, `src/nodes/health_image.py`, `src/nodes/image_dispatcher.py`, `src/nodes/trade.py`, `src/nodes/workout.py`, `src/nodes/weight.py`, `src/nodes/general.py`, `src/nodes/text_intent.py`.
- Removed: `src/workers/scheduler.py`.
- Docs: `docs/CHANGES.md`.

Breaking changes / manual setup:
- No public API changes; existing imports from `graph` (`app_graph`, `supabase`, `llm_fast`, `llm_cloud`, `web_search`) continue to work.
- No database changes.
- If any custom code imports internal helpers from `graph.py`, update those imports to `nodes.shared`.

---

## Previous change: Investment dividend tracking and option/derivatives metadata

What's New:
- **Investments**: added `ex_date` and `record_date` columns to `advisor_dividends` and a deduplication index on `(user_id, symbol, dividend_date, amount)` via migration `022-advisor-dividends.sql`.
- **Investments**: `src/workers/ibkr_flex_sync.py` now parses `<CashTransactions>` dividend rows using `type`/`DividendType`, stores `ex_date`/`record_date` when available, and deduplicates before insert.
- **Investments**: `src/workers/ibkr_flex_sync.py` detects options/derivatives from IBKR `assetCategory`/`subCategory`, stores `asset_class='option'`, and persists option metadata (strike, expiry, putCall, multiplier, underlyingSymbol) in the `options` JSONB column.
- **Investments**: `src/db/positions.py::update_position_from_fill` now accepts an optional `options` dict and merges it into the upserted `advisor_positions` row.
- **Investments UI**: `frontend/app/components/investments/PnLPanel.tsx` fetches `advisor_dividends` for the user, computes trailing 12-month dividend yield, and displays it plus a recent-dividends table with a mobile horizontal-scroll wrapper.
- **Investments UI**: `frontend/app/components/investments/types.ts` updated with `asset_class`, `options` on `Position` and a new `Dividend` interface.

Why: enrich the investment module with dividend income visibility and proper handling of options/derivatives so the dashboard reflects the full portfolio.

Files/modules touched:
- Schema: `docs/supabase-migrations/022-advisor-dividends.sql`.
- Backend: `src/workers/ibkr_flex_sync.py`, `src/db/positions.py`.
- Frontend: `frontend/app/components/investments/PnLPanel.tsx`, `frontend/app/components/investments/types.ts`.
- Docs: `docs/CHANGES.md`.

Breaking changes / manual setup:
- Apply migration `022` in Supabase before the next IBKR Flex sync run.
- No breaking API changes; existing `advisor_dividends` rows are preserved.

---

## Previous change: Smarter logging, finance automation, and observability

What's New:
- **Nutrition**: frequent-items shortcut in Telegram/web chat (top 20 from `known_items`) and photo-based portion estimation via `portion_multiplier`.
- **Finance**: real bank/CC PDF ingestion with OpenRouter vision (`src/finance/pdf_ingestion.py`); drag-and-drop statement upload on `/system`; EU Open Banking scaffold worker (`src/workers/open_banking_sync.py`).
- **Investments**: new `advisor_dividends` table synced from IBKR cash transactions; shared `src/db/positions.py` helper used by `graph.py` and `ibkr_flex_sync.py`; `asset_class` column on `advisor_positions`.
- **Goals**: cross-goal impact links via new `goal_links` table; weekly review correlates habit streaks with financial/health metrics.
- **Agent**: replaced Yahoo scraping with Brave/Bing/Serper search APIs; goals chat uses function-calling tool for `goal_action`; Telegram/web chat now resolves real `user_id` via new `user_identities` mapping.
- **Pipeline**: Supabase query timeout wrapper (`src/utils/supabase_timeout.py`); Telegram webhook health panel on `/system`; `pipeline_service.py` now has a CLI (`python src/pipeline_service.py run <id>`) so scheduled tasks can call pipelines directly.
- **UX**: horizontal-scroll wrappers added to `/health` charts for narrow viewports; `/health` split into `ReadinessPanel`, `SleepPanel`, `NutritionPanel`, and `WorkoutsPanel`.
- **Nutrition UI**: "Save as frequent item" star button on every meal card in `FuelTab`; one-click upsert into `known_items`.

Why: lower friction for food/finance data entry, close the dividend/position-math loop, make the agent more reliable, and improve observability.

Files/modules touched:
- Schema: `docs/supabase-migrations/019-dividends-goal-links-and-asset-class.sql`, `020-user-identities.sql`.
- Backend: `src/graph.py`, `src/goals_service.py`, `src/telegram_webhook.py`, `src/api.py`, `src/workers/ibkr_flex_sync.py`, `src/workers/weekly_review.py`, `src/workers/open_banking_sync.py`, `src/finance/pdf_ingestion.py`, `src/pipeline_service.py`, `src/utils/supabase_timeout.py`, `src/utils/resolve_user_id.py`, `src/db/positions.py`.
- Frontend: `frontend/app/(app)/system/page.tsx`, `frontend/app/(app)/health/page.tsx`, `frontend/app/components/health/shared.tsx`, `frontend/app/components/health/ReadinessPanel.tsx`, `frontend/app/components/health/SleepPanel.tsx`, `frontend/app/components/health/NutritionPanel.tsx`, `frontend/app/components/health/WorkoutsPanel.tsx`, `frontend/app/components/health/FuelTab.tsx`, `frontend/utils/api.ts`.
- Docs: `docs/ARCHITECTURE.md`, `docs/api-reference.md`, `docs/supabase-schema.sql`, `docs/CHANGES.md`, `AGENTS.md`.

Breaking changes / manual setup:
- Apply migrations `019` and `020` in Supabase before running new workers.
- `SERPER_API_KEY` is already in `.env` and is the preferred web-search provider (only Serper is used; Brave/Bing are supported as fallbacks but not required).
- Rerun `scripts/windows_tasks.ps1` to register `LifeOS-PDFStatementSync` and `LifeOS-OpenBankingSync`.
- Health page is now fully componentized into `ReadinessPanel/SleepPanel/NutritionPanel/WorkoutsPanel`; shared helpers live in `frontend/app/components/health/shared.tsx`.

---


## Previous change: Cross-domain reliability + UX upgrade

What's New:
- **Health**: real symptom correlation worker (`src/workers/symptom_analysis.py`); workout cross-source deduplication via `external_id`.
- **Nutrition**: supplement config moved to `user_profiles.supplements` JSONB; barcode shortcut in chat.
- **Finance**: budget envelope UI in `/finance` backed by new `budgets` table; transaction anomaly worker for duplicates/subscription changes/unusual amounts.
- **Investments**: risk policy editable in `/settings`; price freshness badge on positions; Finnhub fallback worker for stale prices.
- **Goals**: milestone checkboxes in `/goals`; weekly-target and rest-day logic in `goal_checkin.py`.
- **Agent**: trade handler asks one clarifying question for missing symbol/qty/price; persistent chat threads via `chat_threads`.
- **Pipeline reliability**: `pipeline_runs` and `worker_heartbeats` tables; `pipeline_service.py` persists every run; retry wrapper on IBKR/Telegram/Strava.
- **UX**: pipeline controls on `/system`; onboarding banner on `/`; web chat passes `session_id`.

Why: lower friction for data entry, close finance/investment data loops, and make the system observable and resilient.

Files/modules touched:
- Schema: migration `018-workout-external-id-and-budgets.sql` (renumbered from duplicate `014`).
- Backend: `src/graph.py`, `src/chat_threads.py`, `src/pipeline_service.py`, `src/utils/retry.py`, `src/workers/*`.
- Frontend: `frontend/app/(app)/finance/page.tsx`, `frontend/app/(app)/settings/page.tsx`, `frontend/app/(app)/system/page.tsx`, `frontend/app/(app)/page.tsx`, `frontend/app/components/investments/PositionsTable.tsx`, `frontend/app/components/goals/GoalCard.tsx`, `frontend/app/(app)/chat/components/ChatPanel.tsx`.
- Docs: `docs/ARCHITECTURE.md`, `docs/api-reference.md`, `docs/supabase-schema.sql`, `docs/CHANGES.md`.

Breaking changes / manual setup:
- Migration `018-workout-external-id-and-budgets.sql` must be applied in Supabase before the new workers run.
- Rerun `scripts/windows_tasks.ps1` to register `LifeOS-PriceRefresh` and `LifeOS-TransactionAnomalies`.
- `FINNHUB_API_KEY` is required for price refresh fallback.

---

## Current state of the repo

The investment page has been upgraded to a full **manual-only advisory workflow**. The system can suggest orders, but it **never** places trades. The user executes trades in IBKR and either:

1. Lets the IBKR Flex Query sync pick them up automatically, or
2. Texts the bot / uses the dashboard Log Trade modal to record them manually.

The goal is: **AI suggests, human executes, Supabase is the single source of truth, Jarvis v3 and LifeOS share the same position book.**

---

## 1. Investment / advisor upgrade

### What changed

- Added `advisor_orders` and `advisor_order_fills` tables (migration `013-advisor-orders-and-risk.sql`).
- Added `user_profiles.risk_policy` JSONB column for position/sector/cash guardrails.
- Added `advisor_positions.source` column to distinguish manual trades from Jarvis/IBKR.
- Updated `advisor_purchases` schema and created a compatibility view `advisor_purchase_history` (migration `012-advisor-purchases-sync.sql`).
- Built `src/workers/ibkr_flex_sync.py` to pull positions, trades, and cash from IBKR via Flex Query v3.
- Added IBKR Flex Sync to `src/pipeline_service.py` and `scripts/windows_tasks.ps1`.
- Added to the `/investments` page:
  - `OrdersPanel` — proposed → approved → sent → filled / rejected / cancelled.
  - `RiskPanel` — concentration, sector, cash, daily loss guardrails.
  - `PnLPanel` — realized and unrealized P&L.
  - `ManualTrades` + `LogTradeModal` — log a trade without broker integration.
- Updated `src/graph.py` trade handler to upsert `advisor_positions` and `advisor_purchases` together, marking `source = 'manual'`.
