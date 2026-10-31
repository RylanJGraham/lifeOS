# LifeOS — Authoritative Architecture Reference

> **Read this first when extending the codebase.** This doc covers the complete system: data flows, database schema, API contracts, scheduled tasks, subsystem details, external integrations, and breaking-change guardrails.

---

## 1. Overview

LifeOS is a personal operating system that aggregates health, finance, investments, and goals into an AI-augmented dashboard.

### Components

| Layer | Technology | Key Files |
|---|---|---|
| Frontend | Next.js 14 + Tailwind CSS + Recharts + Framer Motion | `frontend/app/(app)/` |
| Mobile app (iOS, native — current) | Expo / React Native, own UI, same backend contracts | `mobile/src/app/`, `mobile/src/lib/` |
| Backend | FastAPI + Python 3.11+ | `src/api.py`, `src/chat_service.py`, `src/pipeline_service.py` |
| Agent | LangGraph + LangChain (OpenRouter cloud / Ollama local) | `src/graph.py` (orchestrator), `src/nodes/*.py` (handlers), `src/goals_service.py` |
| Database | Supabase / PostgreSQL + pgvector | `docs/supabase-schema.sql` |
| Local runtime | Windows PowerShell + Python venv | `scripts/windows_tasks.ps1`, `start_services.bat` |
| Advisor (in-house) | `market_advisor.py` — replaces the removed Jarvis Advisor v3 | `src/workers/market_advisor.py`, §3.3 |

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
| `known_items` | **Legacy / frozen.** Was used for frequent-food shortcuts; the shortcut logic has been removed and the table is no longer written to. Kept for data archaeology only. | `user_id`, `name`, `calories`, `protein`, `carbs`, `fat`, `micronutrients`, `aliases` |
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
| `device_push_tokens` | Registered Expo push tokens for the native mobile app | `user_id`, `expo_push_token`, `platform`, `last_seen_at`, `invalid_at` |
| `notifications` | Inbox history of every notification sent (one row per `notify()` call) | `user_id`, `kind`, `title`, `body`, `deep_link`, `dedupe_key`, `push_status`, `read_at` |
| `notification_prefs` | Per-user push settings | `user_id`, `push_enabled`, `kinds` (jsonb), `quiet_start`, `quiet_end`, `timezone` |
| `calendar_events` | User-created calendar events (derived events are computed, not stored) | `user_id`, `title`, `starts_at`, `ends_at`, `all_day`, `kind`, `recurrence`, `recurrence_until`, `reminder_offsets` (int[] minutes) |
| `calendar_feed_tokens` | Secret token per user for the iCal subscription URL (RLS on, no policies: backend only) | `user_id`, `token` |
| `schema_migrations` | Which numbered migrations have been applied (`scripts/migrate.py`) | `version`, `applied_at` |

### Investment / advisor tables

| Table | Purpose | Key Columns |
|---|---|---|
| `advisor_positions` | **Source of truth for current holdings.** Owned by `ibkr_flex_sync.py`/`price_refresh.py`; read (not written) by `market_advisor.py`. | `user_id`, `symbol`, `quantity`, `average_cost`, `current_price`, `position_value`, `unrealized_pnl`, `currency`, `status`, `source`, `side`, `sector`, `tags`, `asset_class`, `options` |
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
- `027-worker-heartbeats-and-views.sql` — adds `worker_heartbeats.created_at` and sets advisor views to `SECURITY INVOKER` to address Supabase security warnings.
- `029-notifications.sql` — `notifications`, `notification_prefs`, `device_push_tokens.invalid_at` (own-row RLS).
- `030-calendar-events.sql` — `calendar_events` (own-row RLS).
- `032-calendar-feed-tokens.sql` — `calendar_feed_tokens`.
- `031-schema-migrations.sql` — `schema_migrations`. Apply pending migrations with `python scripts/migrate.py` (`--status` to preview, `--baseline 28` once on an existing database to record 001–028 as applied). Needs `DATABASE_URL`.

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
- Nutrition extraction uses web search + OpenFoodFacts; every mentioned topping/side must be included in the meal estimate (no silent drops). The old `known_items` shortcut has been removed.
- Barcode shortcut: digit strings in nutrition messages are looked up in OpenFoodFacts before LLM estimation.
- Supplement auto-logging reads `user_profiles.supplements.items` (managed interactively in the mobile app under Bio → Supplements) and logs matching supplements when meals are entered. Hardcoded defaults and the legacy `morning`/`evening` list format have been removed.
- Meals and health metrics are embedded into `vector(768)` for semantic search.
- `src/workers/symptom_analysis.py` runs weekly statistical correlation between symptoms, meals, and workouts and writes to `ai_insights`.

**Frontend**

- `frontend/app/(app)/health/page.tsx` orchestrates data fetching and tab switching.
- Tab content is componentized into `frontend/app/components/health/`: `ReadinessPanel` (cardio/HRV), `SleepPanel` (sleep architecture + schedule), `BodyTab` (weight check-ins, BMI, trend), `NutritionPanel` (trends/metric explorer), `WorkoutsPanel` (volume + muscle map + sessions), and `FuelTab` (nutrition detail).
- Shared helpers and the `DayLens` control live in `frontend/app/components/health/shared.tsx`.
- Meals in `FuelTab` expose a "Save as frequent item" button that upserts into `known_items`.

**Tables**

- `meals`, `health_metrics`, `workouts`, `exercise_muscles`. (`known_items` is legacy/frozen.)

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

**Jarvis Advisor v3 (the external swarm-analysis service this section originally described) has been removed from the user's setup.** LifeOS now takes over that role in-house via `src/workers/market_advisor.py`, registered as the `market-advisor` pipeline (`src/pipeline_service.py`), scheduled weekdays at 3:30 PM (after `ibkr-flex-sync`). It runs a small fixed roster of independent LLM personas (Macro Strategist, Technical Analyst, Risk Manager, Contrarian — `src/workers/market_advisor.py`'s `PERSONAS` dict) concurrently over every open position and active watchlist candidate; an action is only written as actionable (BUY/SELL/ADD/TRIM) when **≥2 personas agree**, otherwise the synthesized signal is HOLD — same consensus rule Jarvis used. Before generating new signals each run, it also **grades signals from ≥5 days ago** against what actually happened and rolls the result into `advisor_signal_performance` (win rate per action/symbol), which is fed back into every persona's prompt — the learning loop. Actionable signals above a confidence threshold are surfaced as `advisor_orders` rows (`status='proposed'`, `source='market_advisor'`) — **never auto-approved or executed**; the user acts manually, same as the existing Log Trade flow. `price_refresh.py` (mark-to-market via Finnhub) is unaffected and is called directly as the worker's first step so revaluation and analysis run atomically.

The rest of this section describes the schema/contract as designed — it holds regardless of whether Jarvis or `market_advisor.py` is the writer, since both target the same tables.

**Daily flow**

```
15:00  LifeOS-IBKRFlexSync → pull real IBKR positions/trades → Supabase
15:30  market_advisor.py   → revalue (price_refresh) → grade past signals (learning loop)
                            → swarm analysis (OpenRouter, 4 personas) → synthesize
                            → write signals, snapshots, position history, reports, proposed orders
        User reviews/decides in the dashboard Orders panel or mobile Capital tab (§3.7)

Sunday  market_advisor.py also runs an extra "Scout" persona call proposing 1-5 new
        watchlist candidates (symbols not already held or tracked).
```

**Position source of truth**

- `advisor_positions` is the shared source of truth — any future advisor worker and the mobile app both read/write it.
- Manual trades from Telegram/UI or the Log Trade / Log Fill flow set `source = 'manual'`.
- IBKR sync sets `source = 'jarvis'` (field name predates the Jarvis removal — still means "broker-synced," not written by the Jarvis service specifically).
- An advisor worker updating positions should preserve `source = 'manual'` rows, same contract as before.
- If a manual row exists, IBKR sync preserves its `average_cost` and `source`.

**Trade lifecycle**

1. An advisor worker (planned) or the user creates a proposal in `advisor_orders` with `status = 'proposed'`.
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
- Daily/weekly habit check-ins are generated by `src/workers/goal_checkin.py`. Even when Telegram is not configured, the worker now writes a `goals` domain `ai_insights` row with a `[yesno:<goal_id>]` prefix in `action_item`.
- The mobile Inbox detects these rows and renders **Yes / No** buttons; tapping either calls `POST /api/goals/checkin`, which bumps or resets `goals.current_value` (the streak) and resolves the insight.
- Habit goal cards on the mobile Goals screen show a flame streak badge from `current_value`.
- `goals.plan` JSONB supports milestones (with `done` flag) and habit weekly targets via `weekly_target` and `rest_days`.
- Milestones are editable checkboxes in `/goals`; the weekly-target logic skips rest days and sends a recovery note once the target is met.

**Tables**

- `goals`, `goal_checkins`, `ai_insights` (for Inbox check-in prompts, via `metadata JSONB` or `action_item` fallback).

### 3.5 Chat / Agent

- `src/graph.py` is the thin LangGraph orchestrator; handlers live in `src/nodes/`.
- `route_input` classifies messages into intents: nutrition, workout, health, trade, finance, goal, general.
- `src/nodes/text_intent.py` dispatches to dedicated handler modules that read/write Supabase.
- Trade handler now asks one clarifying question when symbol, quantity, or price is missing instead of dropping the message.
- `/api/chat` supports a `dry_run=true` preview mode: the agent parses nutrition (and, in future, workout/health) messages but does not persist them. When a logging intent is detected, the response `ui` block has `status: "preview"` with parsed rows + `metadata.intent`. The mobile chat renders a confirmation card with **Confirm / Edit / Cancel**; Confirm re-sends with `dry_run=false`. This prevents silent mis-extractions like "Porridge" at 150 kcal dropping the bananas/honey.
- `/chat` is labelled "Tasks & Chat" and combines conversation with observability: `ScheduledTasksPanel` reads `worker_heartbeats` to show last run, next expected run, and errors; `PipelinesPanel` lets the user trigger pipelines manually.
- `src/chat_threads.py` loads and persists recent conversation turns in `chat_threads` so Telegram and web sessions keep context.
- `src/chat_service.py` is the web chat wrapper around `graph.py`; it now accepts `session_id` and passes `thread_source`/`thread_external_id` into the graph state, plus `dry_run` for preview mode.
- Telegram is retired (the `/webhook` route is only mounted when `TELEGRAM_ENABLED=true`). Chat comes from the mobile app and web dashboard via `POST /api/chat`.
- `text_intent_node` also routes to a `calendar` handler (`src/nodes/calendar.py`) for "dentist thursday 3pm"-style messages.

### 3.6 Mobile App (iOS, Capacitor wrapper) — removed

The first iOS attempt (the Next.js app wrapped with Capacitor) was removed along with `frontend/ios/`, `capacitor.config.ts`, `NativeBridge.tsx` and the `@capacitor/*` dependencies. It is preserved on the local git branch `archive/dead-code` (push it if you want it on the remote). All mobile work happens in `mobile/` (§3.7).

### 3.7 Mobile App (iOS, native — Expo/React Native) — current

**This is the primary mobile app.** Unlike §3.6, this is a real native rewrite, not a WebView: `mobile/` is a separate Expo (React Native) project with its own UI per screen, built with [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routes under `mobile/src/app/`). It talks to the same backend and Supabase project as the web dashboard — same contracts, same tables, same `/api/*` endpoints — just with native screens instead of reusing the Next.js frontend.

**Why a second mobile app exists**: the Capacitor wrapper (§3.6) was built first as a faster path to "something on your phone," but the user wanted a genuinely native app, which requires a UI rewrite. **The Capacitor wrapper is superseded and its files (`frontend/capacitor.config.ts`, `frontend/ios/`) are kept only for reference.** New mobile work happens in `mobile/`.

**Design system**: ported from a Stitch-generated design ("Human Engine Personal Cockpit" — Swiss functionalism + aviation glass-cockpit, light). `mobile/src/theme/index.ts` holds the exact token values (Slate 50/100/200 surfaces, six functional status colors — crimson/cobalt/emerald/amber/cyan/violet, each semantic not decorative — Space Grotesk for headings, Geist for body, JetBrains Mono for all numeric/tabular data). `mobile/src/components/ui.tsx` implements the component language as native primitives: `Surface` ("Telemetry Pod"), `Stat` (hero numeric readout), `Ring` (radial progress), `Pill` (status chip), `Dot`, `ListRow`, `SegmentedControl` (recessed tray), `NavRow`, `FormField`, `PrimaryButton`, `ScreenTitle`, `ErrorBanner`. Haptics on primary interactions via `expo-haptics`. Bottom-tabs has no native large-title header support (that's Stack-only) — every top-level screen renders its own `<ScreenTitle>`; the one exception is Settings, a real nested Stack with the genuine native large title.

**Navigation — 5 primary tabs, 2 secondary screens reached from Cockpit**: Cockpit (home), Ingest (chat), Bio (health), Capital (cash + investments, merged), Settings. Goals and Advisors are deliberately **not** tab-bar items (7 tabs would clutter a 5-icon bar) — they're reachable via quick-access cards on the Cockpit screen instead, at most one tap away. `system` is a hidden route (`href: null`) reached from a row inside Settings.

**Structure**:
- `mobile/src/app/_layout.tsx` — root stack; redirects between `/login` and the `(app)` group based on Supabase auth state, loads the three Google Fonts families via `expo-font`, and registers for push notifications once signed in.
- `mobile/src/app/(app)/_layout.tsx` — the 5-tab bottom navigator (Cockpit/Ingest/Bio/Capital/Settings), floating/blurred (`expo-blur`, light tint). Goals, Advisors, and System are registered as hidden routes (`href: null`).
- `mobile/src/app/(app)/capital.tsx` — merges what were separate Finance and Investments screens into one, matching how the design was actually drawn: a segmented **Cash**/**Portfolio** toggle in a single screen, not two tabs.
- `mobile/src/app/(app)/settings/` — nested Stack (drill-down edit screens): `index.tsx` (grouped nav list) → `body.tsx`, `targets.tsx` (includes the AI target calculator), `capital.tsx` (salary/bank balance/savings rate — distinct from the top-level Capital tab). Each saves independently.
- `mobile/src/lib/supabase.ts` — same Supabase project, using `@react-native-async-storage/async-storage` as the session storage adapter.
- `mobile/src/lib/api.ts` — line-for-line port of `frontend/utils/api.ts` (same backend, same `X-API-Key` auth, same endpoints), plus `uploadStatement()`.
- `mobile/src/lib/queries.ts` — shared data hooks (`useInsights`, `useHealthMetrics`, `useWorkouts`, `useMeals`, `useTodayMeals`, `useProfile`, `useTransactions`, `usePositions`, `usePortfolioSnapshots`, `useOrders`) built on one internal `useAsync` (loading/refreshing/error/refetch).
- `mobile/src/lib/finance.ts` — the live-bank-balance formula (`stored_balance + Σ(transactions since bank_balance_updated_at)`), centralized once instead of duplicated per-screen like the web app does.
- `mobile/src/lib/pacing.ts` — **live, time-of-day-aware status computation** (distinct from the `ai_insights` table, which is LLM-generated/batch). `paceStatus(target, actual, dayFraction)` is the core primitive; `nutritionStatus()`, `sleepStatus()`, `spendStatus()` build on it, plus `detectPRs()` (pure comparison over recent `workouts` — flags a logged weight beating every prior occurrence of the same exercise, case-insensitive). This answers "do I need more protein right now" / "go to bed earlier" on Cockpit and Bio — computed on-device from today's actual data vs. profile targets.
- `mobile/src/lib/notifications.ts` — registers the device's Expo push token into `device_push_tokens` (migration 024) on sign-in.
- `mobile/src/widgets/FuelActivity.tsx` — iOS Live Activity layout (SwiftUI via `@expo/ui/swift-ui`), rendered in the widget-extension runtime by `expo-widgets`.
- `mobile/src/hooks/useFuelActivity.ts` — starts/updates the Fuel Live Activity from the Cockpit screen with today's calories and protein vs. targets.
- `mobile/.env` (gitignored) — `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, baked in at build/bundle time.

**Capital's recommendations are read-only — the app never executes or tracks order state.** This was a deliberate simplification after the first pass over-built it (a full proposed→approved→sent→filled lifecycle with in-app fill-entry forms, mirroring the web dashboard's `OrdersPanel`). The actual product model: `market_advisor.py` (see §3.3) writes rows to `advisor_orders`; Capital's Portfolio tab shows them as plain advisory cards (symbol, direction, rationale, confidence) with a "tell Ingest when you act on this" hint; the user's only way to act is to tell the chat what they actually did ("bought 50 NVDA at 230"), which updates `advisor_purchases`/`advisor_positions` through the existing trade-logging path in `src/nodes/trade.py` — not through any UI action in the mobile app. `mobile/src/lib/positions.ts` (the weighted-average-cost fill math) was removed along with the Approve/Reject/Log Fill UI it supported.

**Feature coverage vs. the web dashboard**:
- **Full parity**: Ingest (text + photo via an action-sheet attach flow — camera or library — same `/api/chat` pipeline, same localStorage-equivalent history via AsyncStorage; **PDF attachments** via `expo-document-picker` are uploaded through the existing `POST /statements/upload` endpoint and trigger `pdf-statement-sync`, then a chat message referencing the upload is sent to `/api/chat` so the agent can answer follow-ups), Goals (chat + goal cards with the same progress/pace logic, radial-progress presentation), Advisors (3 personas, chat + insights + memories).
- **Cockpit "Ranked Action Queue"**: merges live-computed status (`pacing.ts`) with the top unresolved `ai_insights` rows, severity-sorted, with the single most urgent item rendered as a visually dominant card — not a flat list where everything has equal weight.
- **Bio**: real nutrition depth beyond vitals — today's calorie/macro progress (pace-aware), a micronutrient coverage section (priority subset: Vitamin D, Magnesium, Zinc, Omega-3, Calcium, Iron, from `meals.micronutrients` jsonb, expandable to the full ~18-nutrient set), sleep/HR vitals and trend charts.
- **Settings**: includes the "Calculate with AI" target flow (`calculateTargets()` — existed in `api.ts`, was never wired into any mobile UI until now).
- **Simplified vs. web** (real data, real writes, no bespoke charts/animations): the web app's dual-axis composed charts, custom sleep-schedule timeline, muscle body-map, portfolio "orbiting planets" visualization, FIFO realized P&L, RSU vesting, risk-policy checks, Budgets panel, candidate radar, and signal feed are not ported. Daily Report viewer also not built (web sandboxes HTML in an iframe — no direct RN equivalent, needs a WebView). Order execution tracking is intentionally *not* ported — see above.

**Push notifications**: `src/utils/push_notifications.py` sends via Expo's push API (`https://exp.host/--/api/v2/push/send`, no Expo access token needed) to every token in `device_push_tokens`. Currently wired to one trigger — pipeline failures, from `pipeline_service.py`'s `_execute()` — as a best-effort side channel that never raises (a failed push send does not fail the pipeline). Daily-report-ready and goal-check-in-due triggers are not wired yet.

**Building**:
```
cd mobile
npx expo start              # Metro only — requires Expo Go, and Expo Go may lag behind the newest SDK
npx expo run:ios             # builds + installs to the iOS Simulator (no Apple ID needed)
npx expo run:ios --device "<name or UDID>"   # builds + installs to a physical iPhone (needs free/paid Apple ID signing — see expo.fyi/setup-xcode-signing)
```
`ios/` and `android/` are gitignored (Expo's Continuous Native Generation regenerates them from `app.json` + installed plugins — never hand-edit them).

**TestFlight**: not set up yet — same requirement as §3.6 (paid Apple Developer account), but for this project the natural path is `eas build --platform ios` + `eas submit` (no local Xcode needed) rather than a manual Archive.

---

### 3.8 Notifications & Calendar

**One way to notify:** `src/utils/notify.py` → `notify(kind, title, body, deep_link=…, dedupe_key=…)`. It (1) skips duplicates with the same `dedupe_key` within 24 h, (2) applies `notification_prefs` (master switch, per-kind toggle, quiet hours in the user's timezone), (3) sends an Expo push via `utils/push_notifications.send_push` (tokens Expo reports as `DeviceNotRegistered` get `invalid_at` set and are skipped), and (3b) if no device accepts the push, falls back to **outbound-only Telegram** (`utils/telegram.py`, needs `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) — temporary, until a mobile build can receive push; it stops being used automatically once a device registers, and (4) records a `notifications` row with the `push_status` (`sent | telegram | no_devices | skipped_prefs | skipped_quiet`). It never raises. Every worker (`morning_briefing`, `fuel_pacing`, `evening_audit`, `goal_checkin`, `persona_insights`, `weekly_review`, `investment_notifier`, `calendar_reminders`) calls it; **Telegram is no longer a delivery channel**. `notify.send_message(kind, text)` is the helper for workers that compose one text block (first line = title).

**Mobile:** `mobile/src/lib/notifications.ts` registers the device with `POST /api/notifications/devices` after sign-in (requires the `expo-notifications` plugin in `app.json` → needs a new native build) and opens `data.deep_link` when a notification is tapped. `notifications.tsx` shows history, quiet hours, per-category toggles and a test button; reachable from the Inbox.

**Calendar:** `src/calendar_service.py` holds recurrence expansion (`none|daily|weekly|monthly|yearly`, month-end clamping, `recurrence_until`), derived events (goal deadlines, RSU vests), CRUD scoped by `user_id`, and the chat parser. `src/workers/calendar_reminders.py` runs every 5 minutes (cron/Task Scheduler call it directly, not via `pipeline_service`, to avoid 288 `pipeline_runs` rows a day; it is also registered as the `calendar-reminders` pipeline for manual runs). A reminder fires when `start − offset` falls in the last 10 minutes; `dedupe_key = cal:<occurrence_id>:<offset>` makes retries safe. UI: mobile `calendar.tsx` (month agenda + add sheet; "Upcoming" card on Cockpit) and web `/calendar`.

**Calendar extras:** events are editable (mobile tap-to-edit, web pencil icon); derived events also include estimated **subscription renewals** and **dividend dates** (`calendar_service.predicted_events`/`project_dates` — need ≥2 regular past occurrences, so they appear as history accumulates); `GET /calendar/feed/<token>.ics` is a subscribable iCal feed; the morning briefing appends today's agenda verbatim (`calendar_service.todays_agenda`, not LLM-written). There is no source for *planned workouts* yet, so they are not shown.

**Timezone:** calendar phrases are interpreted in `LIFEOS_TIMEZONE`; quiet hours use `notification_prefs.timezone`. Set both.

### 3.9 Auth & tests

`src/auth.py` — `require_auth` dependency (Supabase JWT or `X-API-Key`, fail-closed; see `docs/api-reference.md`). `src/utils/supabase_client.py` — the one shared service-role client (`get_supabase()`); new code should not call `create_client` directly. `tests/` (pytest, run `python -m pytest`) covers auth, position math, date resolution, the dry-run chat flow, calendar and notifications with an in-memory fake Supabase (`tests/conftest.py`). CI (`.github/workflows/ci.yml`) runs `py_compile`, pytest, the frontend build and the mobile `tsc`.

---

## 4. API / Contracts

Live endpoints are documented in `docs/api-reference.md`. Key contracts:

| Endpoint | Purpose |
|---|---|
| `POST /webhook` | Telegram updates — retired, only mounted when `TELEGRAM_ENABLED=true` |
| `GET/POST /api/notifications…` | Inbox history, read state, prefs, device registration |
| `GET/POST/PATCH/DELETE /api/calendar/events` | Calendar |
| `POST /api/chat` | Web chat through LangGraph |
| `POST /api/goals/chat` | Goal strategist |
| `POST /api/budget-coach` | Budget coach (read-only spending advice) |
| `GET /api/pipelines` | List pipelines |
| `POST /api/pipelines/{id}/run` | Trigger a pipeline |
| `POST /api/supplements/lookup` | Look up a supplement by brand/name (LLM + web search) |
| `GET /api/supplements` | List user's supplement policy |
| `POST /api/supplements` | Add/replace a supplement item |
| `DELETE /api/supplements/{id}` | Remove a supplement item |
| `GET /status` | Health check |

Frontend routes are also part of the public contract. Do not rename or remove routes without updating `docs/api-reference.md` and checking inbound links.

---

## 5. Scheduled Tasks

Production uses the `lifeos` user's crontab (`deploy/lifeos.cron`). The cron file is installed by `deploy/setup.sh` into `/var/spool/cron/crontabs/lifeos`. **Important**: cron does not source `.env` automatically, so every line loads `/opt/lifeos/.env` via `set -a; . /opt/lifeos/.env; set +a` before invoking `pipeline_service.py`.

Local Windows development uses `scripts/windows_tasks.ps1`. All times are local Windows time (Central European for this deployment).

Every scheduled task invokes `python src/pipeline_service.py run <pipeline-id>`. This keeps each worker runnable as a standalone script, but ensures every run is recorded in `pipeline_runs` and `worker_heartbeats` so the **Tasks & Chat** panel and `/system` page show real status.

| Task | Schedule | Purpose |
|---|---|---|
| `LifeOS-MorningBriefing` | Daily 07:00 | Telegram morning briefing |
| `LifeOS-InvestmentNotifier` | Daily 09:00 | Scan transactions for new investments and alert |
| `LifeOS-PriceRefresh` | Daily 10:00 | Refresh stale position prices via Finnhub |
| `LifeOS-IBKRFlexSync` | Mon–Fri 15:00 | Pull IBKR positions/trades before the market advisor run |
| `LifeOS-MarketAdvisor` | Mon–Fri 15:30 | Revalue positions, run advisor swarm, propose orders/report (Sunday: also weekly discovery) |
| `LifeOS-FuelPacing` | Daily 15:00 | Midday calorie/protein pacing |
| `LifeOS-GoalCheckinDaily` | Daily 20:00 | Daily habit check-in questions |
| `LifeOS-EveningAudit` | Daily 21:30 | Missing-data nudge |
| `LifeOS-PersonaInsightsDaily` | Daily 21:15 | Doctor/nutritionist/PT insights |
| `LifeOS-HealthSync` | Daily 23:30 | Nightly health aggregate and summary |
| `LifeOS-GoalCheckinWeekly` | Sunday 10:00 | Weekly goal review |
| `LifeOS-WeeklyReview` | Sunday 10:00 | Weekly digest |
| `LifeOS-TransactionAnomalies` | Sunday 10:30 | Duplicate/subscription/anomaly scan |
| `LifeOS-OpenBankingSync` | Sunday 10:45 | Scaffold: EU Open Banking transaction pull (requires credentials) |
| `LifeOS-SymptomAnalysis` | Monday 06:00 | Weekly symptom/behavior correlation |

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

### Jarvis Advisor v3 — removed

- Was an external advisor that read/wrote Supabase (`advisor_positions`, `advisor_signals`, `advisor_portfolio_snapshots`, `advisor_daily_reports`, `advisor_watchlist`, `advisor_orders`). The user has removed it from their setup and it has been fully superseded by `src/workers/market_advisor.py` going forward; if it is still running externally anywhere, it should be decommissioned rather than treated as a second writer of these tables.
- `docs/jarvis-v3-supabase-positions-sync.md` is now historical — it documents the contract those tables were built against, which `market_advisor.py` (§3.3) now implements.
- Do not resurrect or recommend re-integrating the external Jarvis service.

### Telegram — retired

Replaced by Expo push + the in-app Inbox (§3.8). Legacy code (`src/telegram_webhook.py`) remains but is only mounted with `TELEGRAM_ENABLED=true`.

### OpenRouter

- Cloud LLM for routing, extraction, and reasoning.
- Models used: `openai/gpt-4o` (complex/vision), `openai/gpt-4o-mini` (fast routing).

### Ollama

- Local LLM for offline insights.
- Endpoint configured by `OLLAMA_HOST`.

---

## 7. Breaking Changes & Guardrails

### Database breaking changes

- Renaming a table/column that the frontend, mobile app, or `market_advisor.py` reads requires:
  1. A migration that preserves the old name with a compatibility view or column alias.
  2. Updating `docs/supabase-schema.sql`.
  3. Updating all backend/frontend/mobile references.
- Dropping `advisor_positions`, `advisor_purchases`, `advisor_signals`, or `advisor_portfolio_snapshots` will break the frontend, mobile app, and `market_advisor.py`. Do not drop without a migration plan.
- Changing the `source` enum or semantics breaks the manual-vs-advisor contract (currently manual-only, since no advisor worker is writing yet).

### API breaking changes

- **Auth (this release):** every endpoint except `/status` needs `Authorization: Bearer <Supabase token>` or `X-API-Key`. `NEXT_PUBLIC_API_TOKEN` / `EXPO_PUBLIC_API_TOKEN` are gone — those values were embedded in client bundles, so treat the old `API_SECRET` as public and **rotate it**. The iOS Shortcut posting to `/api/sleep` or `/api/health-metrics` must send `X-API-Key`. `POST /statements/upload` no longer accepts a `user_id` query parameter. CORS is an allow-list (`CORS_ORIGINS`); set it to your Vercel domain.
- `device_push_tokens` rows are now written by the API (`POST /api/notifications/devices`), not by a client-side Supabase upsert.
- Do not remove or rename `/webhook`, `/api/chat`, `/api/pipelines`, or `/status` without a compatibility shim.
- Frontend route changes must update `docs/api-reference.md` and all internal `href` links.

### Finance breaking changes

- `advisor_positions` is the single source of truth. No other file or config may override it for current holdings.
- Advisor views (`advisor_latest_portfolio`, `advisor_position_performance`, etc.) are `SECURITY INVOKER` so they respect the row-level security of the caller.
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
├── mobile/                # Expo/React Native iOS app (current primary mobile client)
│   ├── src/app/            # Expo Router file-based screens
│   ├── src/lib/            # API client, queries, pacing logic, notifications
│   ├── src/components/     # Native UI primitives
│   └── src/theme/          # Design tokens
├── frontend/              # Next.js dashboard (web). Capacitor wrapper files are superseded.
│   ├── app/(app)/          # Pages: finance, health, investments, goals, system, settings
│   └── app/components/     # Reusable React components
├── src/                   # Python backend
│   ├── api.py             # FastAPI entry point
│   ├── graph.py           # LangGraph agent
│   ├── chat_service.py    # Web chat wrapper
│   ├── goals_service.py   # Goal strategist
│   ├── pipeline_service.py# Pipeline runner
│   ├── supplement_service.py # Supplement LLM lookup + CRUD
│   ├── db/                # DB helpers (supplements, positions, etc.)
│   ├── workers/           # Scheduled workers
│   ├── nodes/             # LangGraph handler nodes
│   └── utils/             # Shared helpers
├── scripts/               # PowerShell installers + schema introspection
│   ├── windows_tasks.ps1
│   └── introspect_supabase_schema.py
├── deploy/                # Production VPS files
│   ├── lifeos.cron        # Cron schedule for the lifeos user
│   ├── lifeos-api.service # systemd unit
│   ├── setup.sh           # First-time provisioning
│   └── update.sh          # Pull + restart
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
- Production runs on an Ubuntu VPS: `lifeos-api` systemd service + `lifeos` user crontab (`deploy/lifeos.cron`).
- Supabase is remote; all data flows through it.
- Jarvis v3 has been removed from the user's setup — do not resurrect or recommend it. The in-house `market_advisor.py` (§3.3) is its replacement.
- The system is intentionally manual for broker actions: it suggests orders, but the user executes them in IBKR and either texts the bot, logs a fill in the mobile Orders screen (§3.7), or lets the Flex Query sync pick them up.
- The `known_items` shortcut system is removed; the table is frozen. Nutrition extraction now always uses the LLM + web search path.
