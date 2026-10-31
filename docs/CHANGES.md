# LifeOS — Recent Changes & Impact Log

> **Start here if you are a new AI joining mid-stream.** This file explains the most recent set of changes, why they were made, and what you must not break.

---

## Latest change: Telegram fallback for notifications + calendar follow-ups

What's New:
- **Telegram as a temporary notification fallback** (`src/utils/telegram.py`, `utils/notify.py`): while no mobile build can receive push, `notify()` sends outbound-only Telegram when no device accepts the push (needs `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; `push_status = "telegram"`). Quiet hours/toggles still apply. Inbound Telegram chat stays retired. Note: the droplet had no `TELEGRAM_CHAT_ID`, so Telegram sends had been silently skipped before this.
- **Calendar**: edit events (mobile + web; editing a repeating event moves the whole series, duration preserved); subscribable iCal feed (`/calendar/feed/<token>.ics`, migration 032); estimated subscription-renewal and dividend events; today's agenda appended to the morning briefing.
- Mobile push is gated off (`EXPO_PUBLIC_ENABLE_PUSH`) and the `expo-notifications` plugin removed from `app.json`, because the free Apple team can't sign the push entitlement; Telegram carries notifications meanwhile.
- **Mobile UX**: Calendar + Inbox icons top-right of every main screen header (Inbox shows an unread badge on Cockpit); Cockpit "Upcoming" card always visible; Bio range gains **Pick** (custom from/to days, any day in the last ~13 months) and Capital's Cash tab gains **Pick days** (totals, categories, daily spend and ledger for the chosen days; shared `DateRangePicker` + `lib/dateRange.ts`); Inbox got a back button.
- **Outlook/Google/Apple → LifeOS**: link a published ICS calendar (mobile "Sync Outlook / Google / Apple" sheet and web `/calendar`); events sync every 30 min, read-only, with reminders (migration 033, `src/calendar_import.py`, `workers/calendar_sync.py`). Also fixed the Calendar/Notifications/Inbox screens rendering their first row under the fixed header.
- **Linked-calendar hardening**: published links are encrypted at rest (`CALENDAR_ENCRYPTION_KEY`, fail-closed), never returned/logged; new per-calendar "hide meeting details" (busy-only) mode (migration 034). Manual setup: set `CALENDAR_ENCRYPTION_KEY` on the server (done on the droplet).
- Tests: 113 total (new `tests/test_calendar_followups.py`).

Also: `OWNER_AUTH_USER_ID` (see `docs/architecture.md` §3.9) maps the owner's login onto the legacy data owner id; found because all existing rows belong to the zero UUID while the login id differs.

Breaking changes / manual setup: apply migration 032 (`python scripts/migrate.py`); set `TELEGRAM_CHAT_ID` on the droplet. Planned workouts are not on the calendar (no data source exists).

---

## Previous: Security pass, notifications, calendar, tests, dead-code removal

What's New:
- **Auth is now enforced and fail-closed** (`src/auth.py`, `src/api.py`): every endpoint except `/status` needs a Supabase session token (`Authorization: Bearer`) or `X-API-Key` (only if `API_SECRET` is set). Previously `/api/sleep`, `/api/health-metrics`, `/api/system_stream`, `/api/correlations` had no auth at all, and an unset `API_SECRET` silently disabled all auth. CORS is an allow-list (`CORS_ORIGINS`). `/statements/upload` no longer takes `user_id` from the query string and sanitises the filename (path traversal). The user id now comes from the token instead of "first row in `user_profiles`". The duplicate `/telegram/webhook-info` route was removed.
- **Clients stop shipping a shared secret** (`mobile/src/lib/api.ts`, `frontend/utils/api.ts`, `system/page.tsx`): `EXPO_PUBLIC_API_TOKEN` / `NEXT_PUBLIC_API_TOKEN` removed; both send the Supabase session token.
- **Telegram retired**: the webhook is only mounted when `TELEGRAM_ENABLED=true`. All workers (`morning_briefing`, `fuel_pacing`, `evening_audit`, `goal_checkin`, `persona_insights`, `weekly_review`, `investment_notifier`) now call `utils/notify`.
- **Notifications** (`src/utils/notify.py`, `push_notifications.py`, migration 029, `/api/notifications*`, mobile `notifications.tsx`): one `notify()` that dedupes, applies per-kind toggles + quiet hours, pushes via Expo (dead tokens are retired), and records an Inbox history row. Push registration was never actually called before — it now runs after sign-in (`usePushSetup`) and the `expo-notifications` plugin was added to `app.json`. Tapping a notification opens its `deep_link`.
- **Calendar** (`src/calendar_service.py`, `nodes/calendar.py`, `workers/calendar_reminders.py`, migration 030, `/api/calendar/events`, mobile `calendar.tsx` + Cockpit "Upcoming", web `/calendar`): user events with recurrence + reminders, derived goal deadlines and RSU vests, chat creation ("dentist thursday 3pm", with confirm-before-save), reminders every 5 minutes.
- **Shared plumbing**: `utils/supabase_client.get_supabase()` (single lazily-created client).
- **Tests + CI**: `tests/` (96 tests: auth, positions, dates, dry-run chat, calendar, notifications, endpoints) and `.github/workflows/ci.yml` (py_compile, pytest, frontend build, mobile `tsc`).
- **Bug fixed (found by the new tests)**: adding to a *manual* position kept the first buy's average cost instead of the weighted average (`src/db/positions.py`).
- **Migration runner**: `scripts/migrate.py` + `schema_migrations` (migration 031).
- **Dead code removed** (kept on local branch `archive/dead-code`): `lib/Mi-Fitness-Sync`, `lib/SmartScaleConnect`, the Capacitor wrapper (`frontend/ios`, `capacitor.config.ts`, `NativeBridge`, `@capacitor/*`, `env-cmd`), and root scratch scripts (`scratch_test.py`, `test_webhook.py`, `apply_policies.py` — the last one created public read/write policies on `company_rsus`).

Why: the previous analysis found the public client token made auth meaningless, several open write endpoints, a push pipeline that never registered devices, no tests, and a lot of dead weight; calendar + notifications were requested features and Telegram is being dropped.

Files/modules touched: see the sections above; new tables `notifications`, `notification_prefs`, `calendar_events`, `schema_migrations`; new column `device_push_tokens.invalid_at`.

Breaking changes / manual setup:
1. **Rotate `API_SECRET`** on the droplet (the old value was in client bundles) and set `CORS_ORIGINS`, `LIFEOS_TIMEZONE`. Remove `EXPO_PUBLIC_API_TOKEN` / `NEXT_PUBLIC_API_TOKEN` from Vercel and the mobile env.
2. Update the iOS Shortcut to send `X-API-Key` (see `docs/setup-ios-shortcut.md`).
3. Apply migrations 029–031: `python scripts/migrate.py --baseline 28` once, then `python scripts/migrate.py` (needs `DATABASE_URL`). Then regenerate `docs/supabase-schema.sql` (it currently has the new tables appended by hand).
4. The mobile app needs a **new native build** (new `expo-notifications` plugin) before push works. Push does not work in the simulator.
5. Delete `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from `.env` when you are ready; the Telegram status card on `/system` will show "not configured".

---

## Previous: Confirm-before-save chat, Fuel Live Activity, habit streaks

What's New:
- **Confirm-before-save in chat** (`mobile/src/app/(app)/(tabs)/chat.tsx`, `src/api.py`, `src/chat_service.py`, `src/nodes/nutrition.py`, `src/nodes/ui_blocks.py`):
  - `/api/chat` now supports `dry_run=true`. The backend parses nutrition messages but does not persist them.
  - The mobile chat shows a preview card with parsed items and **Confirm / Edit / Cancel** buttons.
  - Confirm re-sends the message with `dry_run=false` to actually log the meal. Edit repopulates the input. Cancel discards the preview.
  - Prevents another "plain porridge at 150 kcal" bug by surfacing the parsed result before writing.
- **Fuel Live Activity** (`mobile/src/widgets/FuelActivity.tsx`, `mobile/src/hooks/useFuelActivity.ts`, `mobile/app.json`):
  - Added `expo-widgets` + `@expo/ui` Live Activity that shows today's calories/protein vs. targets on the iOS Lock Screen and Dynamic Island.
  - Starts automatically from the Cockpit screen when nutrition targets are set; updates as meals change.
- **Habit streaks + yes/no check-ins** (`src/workers/goal_checkin.py`, `src/workers/action_items.py`, `src/api.py`, `mobile/src/app/(app)/inbox.tsx`, `mobile/src/app/(app)/goals.tsx`):
  - `goal_checkin.py` now writes a `goals` domain `ai_insights` row for each habit check-in (even when Telegram is not configured), with `[yesno:<goal_id>]` in `action_item`.
  - New endpoint `POST /api/goals/checkin` records yes/no, updates streak (`current_value`), and optionally resolves the insight.
  - Inbox cards for habit goals show **Yes / No** buttons.
  - Goals screen shows a flame streak badge on habit cards.
- **Schema migration** (`docs/supabase-migrations/028-ai-insights-metadata.sql`):
  - Adds `metadata JSONB` to `ai_insights` for future structured actions. The current fallback uses the `action_item` prefix so the feature works before the migration is applied.

Why: the user wanted higher-leverage UX improvements — prevent logging errors, keep fuel pacing visible without opening the app, and turn habit goals into an active yes/no streak loop instead of passive progress reports.

Files/modules touched:
- `src/api.py` — `dry_run` on `/api/chat`; new `POST /api/goals/checkin`.
- `src/chat_service.py`, `src/nodes/shared.py`, `src/nodes/nutrition.py`, `src/nodes/ui_blocks.py` — dry-run preview flow.
- `src/workers/goal_checkin.py`, `src/workers/action_items.py` — Inbox-facing habit check-ins; optional per-insight resolution.
- `mobile/src/app/(app)/(tabs)/chat.tsx`, `mobile/src/components/ui.tsx` — preview card + Confirm/Edit/Cancel.
- `mobile/src/widgets/FuelActivity.tsx`, `mobile/src/hooks/useFuelActivity.ts`, `mobile/src/app/(app)/(tabs)/index.tsx`, `mobile/app.json` — Live Activity.
- `mobile/src/app/(app)/inbox.tsx`, `mobile/src/app/(app)/goals.tsx`, `mobile/src/lib/api.ts`, `mobile/src/lib/queries.ts` — yes/no check-ins + streak display.
- `docs/api-reference.md`, `docs/ARCHITECTURE.md`, `docs/CHANGES.md`, `docs/supabase-migrations/028-ai-insights-metadata.sql` — docs/schema.

Breaking changes / manual setup:
- Apply migration `docs/supabase-migrations/028-ai-insights-metadata.sql` in the Supabase SQL Editor to enable the `metadata` column fallback-free path. Without it, the app falls back to parsing `action_item`.
- Live Activity requires a **development/release build**; it does not run in Expo Go. iOS 16.1+ required.

---

## Previous: Supplement manager with LLM brand lookup + add/remove flow

What's New:
- **Interactive supplement manager** on the Bio tab (`mobile/src/app/(app)/(tabs)/health.tsx`):
  - Replaced the static morning/evening supplement list with an add/remove manager.
  - **Add flow**: tap "Add supplement" → enter brand + name + time of day + hour → "Look up supplement" calls the backend LLM to fetch the product's nutrition info (calories, macros, micronutrients, serving size, notes) → review the looked-up info → "Confirm & add" saves it to the schedule.
  - **Remove flow**: tap the trash icon on any supplement row to remove it.
  - Supplements are stored in `user_profiles.supplements` in a new `items` array format (each item has `id`, `brand`, `product_name`, `description`, `serving_size`, `calories`, `protein`, `carbs`, `fat`, `micronutrients`, `notes`, `time_of_day`, `hour`).
  - Legacy `morning`/`evening` array format is auto-migrated to `items` on first add.
- **New backend supplement service** (`src/supplement_service.py`):
  - `lookup_supplement(brand, name)` — uses GPT-4o via OpenRouter to look up a supplement's nutrition info and returns structured JSON.
  - `list_supplements`, `add_supplement`, `remove_supplement` — manage the user's policy in `user_profiles.supplements`.
- **New API endpoints** (`src/api.py`):
  - `POST /api/supplements/lookup` — LLM lookup by brand + name.
  - `GET /api/supplements` — list the user's current schedule.
  - `POST /api/supplements` — add a supplement to the schedule.
  - `DELETE /api/supplements` — remove a supplement by id.
- **Auto-logging updated** (`src/db/supplements.py`):
  - `ensure_supplements_for_meal` and `backfill_supplements` now support both the new `items` format and the legacy `morning`/`evening` format.
  - Each item's `time_of_day` (morning/evening/anytime) and `hour` control when it auto-logs.

Why: the user wanted to add/remove supplements from the mobile app (not the web dashboard), with LLM-powered brand lookup so the nutrition data is accurate without manual entry.

Files/modules touched:
- `src/supplement_service.py` — new service (LLM lookup + policy management).
- `src/api.py` — 4 new supplement endpoints.
- `src/db/supplements.py` — auto-logging supports new `items` format + legacy format.
- `mobile/src/lib/api.ts` — `lookupSupplement`, `listSupplements`, `addSupplement`, `removeSupplement` + `SupplementItem`/`SupplementPolicy` types.
- `mobile/src/app/(app)/(tabs)/health.tsx` — interactive supplement manager UI with add modal.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none. The old `morning`/`evening` format still works for auto-logging. The new `items` format is used when adding via the mobile app. Run `cd mobile && npx tsc --noEmit && npx expo lint` and `python3 -m py_compile src/supplement_service.py src/api.py src/db/supplements.py` to verify.

---

## Previous: Budget vs. actual, recurring subscriptions, health recommendations, haptics, dark mode selector, empty-state CTAs

What's New:
- **Budget vs. actual by category** on Capital → Cash tab (`mobile/src/app/(app)/(tabs)/capital.tsx`):
  - Default category budgets derived from monthly income × typical percentages (Food 18%, Shopping 12%, Entertainment 5%, Health 4%, Other 6%).
  - Each category row shows a progress ring (actual vs. budget), pacing bar, remaining amount, and status label (ON TRACK / PACING UP / OVER).
  - Pacing compares actual spend % to month-elapsed %.
- **Recurring subscriptions manager** on Capital → Cash tab:
  - Summary card with monthly total, yearly projection, and merchant count.
  - Per-merchant rows now show next expected charge date (last charge + 30 days) and frequency.
- **Health recommendations** on Bio tab (`mobile/src/app/(app)/(tabs)/health.tsx`):
  - Rule-based cards: sleep debt (<7h), low HRV (<30ms), elevated RHR (>65bpm), good recovery (≥80 score).
  - Each card has severity color and actionable detail.
- **Workout streak card** on Bio tab: shows consecutive days with a logged workout, with motivational detail.
- **Haptics + press animations** across the app:
  - `HapticPressable` reusable component added to `mobile/src/components/ui.tsx` (light/medium/selection haptic + scale-on-press).
  - NavRow now has haptics (was missing).
  - Cockpit nav cards and quick-log tile have scale-on-press animations.
  - Chat attach/send buttons have haptics + scale.
  - Goals priority badge has haptics + scale.
  - Settings theme toggle has haptics + scale.
- **Dark mode refinement** (`mobile/src/app/(app)/(tabs)/settings/index.tsx`):
  - 3-way theme selector (System / Light / Dark) with chips, replacing the single toggle.
  - Removed duplicate "05 // APPEARANCE" header.
- **Better empty states with log-first CTAs** on Capital tab:
  - Budget empty state: "Upload statement" CTA → routes to Ingest.
  - Portfolio empty state: "Log a trade" CTA → routes to Ingest.
- **Health image duplicate-date handling** (`src/nodes/health_image.py`):
  - Captions like "duplicate it for the 27th", "do the same for the 27th", "also for oct 27", "copy to yesterday" now parse extra dates and insert copies of the metrics.
  - Skips dates that already have data.

Why: the user wanted budget pacing visibility, recurring spend management, health recommendations, and more tactile feedback across the app.

Files/modules touched:
- `mobile/src/app/(app)/(tabs)/capital.tsx` — budget vs. actual, recurring subscriptions, empty-state CTAs.
- `mobile/src/app/(app)/(tabs)/health.tsx` — recommendations, workout streak card.
- `mobile/src/app/(app)/(tabs)/index.tsx` — press animations on nav cards and quick-log tile.
- `mobile/src/app/(app)/(tabs)/chat.tsx` — haptics + scale on attach/send buttons.
- `mobile/src/app/(app)/goals.tsx` — haptics + scale on priority badge.
- `mobile/src/app/(app)/(tabs)/settings/index.tsx` — 3-way theme selector, haptics.
- `mobile/src/components/ui.tsx` — `HapticPressable` reusable component, NavRow haptics.
- `src/nodes/health_image.py` — duplicate-date caption parsing.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none. Run `cd mobile && npx tsc --noEmit && npx expo lint` to verify.

---

## Previous: Multi-image/PDF attachments in Ingest chat + backend multi-image support

What's New:
- **Multi-image and multi-PDF selection** in Ingest chat (`mobile/src/app/(app)/(tabs)/chat.tsx`):
  - Image library picker now allows `allowsMultipleSelection`.
  - Document picker now allows `multiple: true` for PDFs.
  - Attachments are stored as an array; each preview has its own remove button in a horizontal scroll.
- **Multiple images per chat prompt** flow through the backend:
  - `mobile/src/lib/api.ts` `sendChat` now sends `images?: string[]`.
  - `/api/chat` accepts `images` (list) while keeping backward-compatible `image` (single).
  - `chat_service.handle_chat` accepts `images` and passes them into the graph state.
  - `GraphState` gains an `images` field.
  - `graph.route_input` routes `"multi_image"` to the image dispatcher.
  - `image_dispatcher_node` defaults multi-image prompts to nutrition and uses single-image classification otherwise.
  - `nutrition_node` now passes all images to the vision prompt (useful for multi-angle meal photos).
  - `health_image_node` supports multiple screenshots as well.
- **Multiple PDFs per prompt**: mobile uploads each PDF via `/statements/upload` in parallel, collects upload references, and includes them all in the chat message text.
- **PDF statements now update `user_profiles.bank_balance` from the statement's `saldo` column**: after parsing transactions, the latest running balance (saldo) is written back to the profile so net worth reflects the actual account balance.
- **New `goal-metric-sync` pipeline** (`src/workers/goal_metric_sync.py`): runs daily at 8:30 AM to update active financial goals' `current_value` from their `linked_metric` (`bank_balance`, `net_worth`, or `portfolio_value`). Registered in `src/pipeline_service.py`, `deploy/lifeos.cron`, and `scripts/windows_tasks.ps1`.
- **Mobile Capital Portfolio tab upgrade** (`mobile/src/app/(app)/(tabs)/capital.tsx`):
  - Portfolio summary grid: total value, total P&L, cash, invested, position count, currencies.
  - Asset-class allocation bar + list.
  - Sector allocation bar + list (when sector data exists).
  - Top gainers / top losers cards.
  - Risk flags from the latest `advisor_portfolio_snapshots`.
- **Mobile Capital Intel tab upgrade** (`mobile/src/app/(app)/(tabs)/capital.tsx`):
  - Market regime card with latest report summary, VIX, and portfolio value.
  - Report archive list (last 6 briefings).
  - Tap any report card or archive row to open the new **report detail screen** (`mobile/src/app/(app)/report/[id].tsx`) with full HTML briefing text and actionable signals.
  - Live signals grouped by symbol.
  - Candidate radar cards with thesis and latest-signal metadata.
- **Mobile query support** (`mobile/src/lib/queries.ts`): added `useLatestSnapshot`, extended `Position` with `current_price`, `sector`, `asset_class`, and added `byField`/`topMovers` aggregation helpers.
- **Chat UI fixes from previous iteration kept**: keyboard offset `0`, input bar margin `insets.bottom + 56`, reduced input padding.

Why: the user couldn't see attachment previews clearly and wanted to send several images or PDFs in one prompt (e.g., a meal from multiple angles or multiple statement pages).

Files/modules touched:
- `mobile/src/app/(app)/(tabs)/chat.tsx` — attachments array, pickers, preview row, send logic.
- `mobile/src/lib/api.ts` — `sendChat` signature updated to `images?: string[]`.
- `src/api.py` — `ChatRequest` accepts `images`.
- `src/chat_service.py` — `handle_chat` accepts `images`.
- `src/nodes/shared.py` — `GraphState.images` added.
- `src/graph.py` — route `"multi_image"`.
- `src/nodes/image_dispatcher.py`, `src/nodes/nutrition.py`, `src/nodes/health_image.py` — multi-image handling.
- `src/finance/pdf_ingestion.py` — parse statement `saldo` column and update `user_profiles.bank_balance`.
- `src/workers/goal_metric_sync.py` — new daily worker.
- `src/pipeline_service.py` — registered `goal-metric-sync` pipeline.
- `deploy/lifeos.cron` and `scripts/windows_tasks.ps1` — daily 8:30 AM schedule.
- `mobile/src/app/(app)/(tabs)/capital.tsx` — Portfolio/Intel tab upgrades.
- `mobile/app.json` — new app icon (`assets/icon.png`) and splash screen (`assets/splash.png`) matching the dark blue "Human Engine" brand.
- `mobile/src/app/(app)/report/[id].tsx` — report detail screen.
- `src/workers/market_advisor.py` — top 3 actionable advisor signals are now inserted as `ai_insights` with `domain = 'advisor_action'` so they surface on the Cockpit action queue.
- `mobile/src/app/(app)/(tabs)/index.tsx` — added `advisor_action` to Cockpit insight domains.
- `src/workers/morning_briefing.py`, `evening_audit.py`, `fuel_pacing.py`, `persona_insights.py`, `weekly_review.py` — fixed relative imports (`workers.*` instead of bare module names) so daily pipelines stop failing.
- `src/pipeline_service.py` — corrected `morning-briefing` runner to call the existing `main()` function.
- `mobile/src/app/(app)/goals.tsx` — added monthly free-funds card: income minus detected recurring spend, plus suggested proportional allocation across active financial goals.
- `docs/supabase-migrations/026-goals-priority.sql` — migration to add `priority INTEGER DEFAULT 3` to `goals` (applied via Supabase SQL Editor).
- `mobile/src/app/(app)/goals.tsx` — priority badges on goals, tap to cycle P1–P5, priority-weighted free-fund allocation.
- `mobile/src/app/(app)/(tabs)/index.tsx` — Cockpit now shows:
  - Daily market briefing card that opens the report.
  - "Left to spend this month" widget based on income, savings target, and actual spend.
  - Inline "DONE" button on compact insight rows to resolve them.
- `mobile/src/lib/queries.ts` — new hooks and aggregation helpers.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none for existing flows. Single-image messages still work exactly as before. Run `cd mobile && npx tsc --noEmit && npx expo lint` and `python3 -m py_compile src/graph.py src/nodes/shared.py src/nodes/image_dispatcher.py src/nodes/nutrition.py src/nodes/health_image.py src/chat_service.py src/api.py src/finance/pdf_ingestion.py` to verify.

---

## Previous: Physical iPhone install via Xcode personal team; push notifications temporarily disabled

What's New:
- **Removed Push Notifications capability** from the iOS build (`mobile/app.json`, `mobile/ios/*` regenerated via `npx expo prebuild --clean`). This was required so the app can be signed and installed with a free Apple Developer personal team (`Rylan Graham (Personal Team)`); paid Apple Developer Program membership is required for push.
- **Removed the push opt-in row** from Settings (`mobile/src/app/(app)/(tabs)/settings/index.tsx`) and the automatic token registration in the root layout (`mobile/src/app/_layout.tsx`).
- **Kept `mobile/src/lib/notifications.ts`** as a stub so push can be re-enabled later by reverting these changes and re-adding the `expo-notifications` plugin to `app.json`.
- **Verified the build** with `npx tsc --noEmit && npx expo lint`, regenerated the iOS project, and installed on a physical iPhone via Xcode automatic signing after registering the device.

Why: the user wanted the app on a real iPhone via Xcode without EAS. Free personal teams cannot use Push Notifications, so the capability and related UI were removed for now.

Files/modules touched:
- `mobile/app.json` — removed `expo-notifications` plugin.
- `mobile/src/app/(app)/(tabs)/settings/index.tsx` — removed 04 // Notifications row and related state.
- `mobile/src/app/_layout.tsx` — removed `registerForPushNotifications` call and import.
- `mobile/ios/*` — regenerated by `npx expo prebuild --clean`.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none for the user-facing app; push notifications are simply unavailable until the paid Apple Developer Program is active. No schema or API changes.

---

## Previous: Health date-range switches are now instant (no loading flash)

What's New:
- **Fetch once, filter client-side** (`mobile/src/app/(app)/(tabs)/health.tsx`): the Health screen now fetches the full YTD dataset once for health metrics, workouts, and meals. Switching between Today / 7D / Month / YTD filters the already-loaded data in JavaScript, so the charts and lists update instantly with no network request and no spinner flash.
- **`filterByDays` helper** added to slice the YTD arrays by the selected number of days while preserving sort order.
- **Removed `useTodayMeals`** and the "Updating…" pill; all ranges now share the same data source and update synchronously.
- **Hero/latest metric stays absolute**: the top vital-signs hero and recovery score still use the most recent metric regardless of selected range.
- **Calendar strip stays fixed**: the 7-day activity dots still look at the last 7 days independent of the selected range.

Why: the user reported that tapping a different date range flashed the full loading spinner. The first fix removed the spinner but still fired a new Supabase query on every switch; this follow-up makes the switch truly instantaneous.

Files/modules touched:
- `mobile/src/app/(app)/(tabs)/health.tsx` — YTD fetches, `filterByDays`, filtered datasets, removed `useTodayMeals`, removed updating pill.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes. Run `cd mobile && npx tsc --noEmit && npx expo lint` to verify.

---

## Previous: Fix multi-item meal extraction dropping toppings and sides

What's New:
- **Meal extraction now logs every distinct food/drink/topping/side** (`src/nodes/nutrition.py`): previously, messages like "porridge with honey and bananas" and "9 McDonald's nuggets and fries and a coke" were being collapsed into one or two items because the saved-items context biased the LLM, and the per-item known-item override was matching on substring (so a saved "Porridge" overrode "Porridge with honey and bananas" down to plain porridge calories).
- **Prompt tightened** to explicitly forbid dropping toppings/sides and to require combined dishes to include all components in both the name and calorie total.
- **Saved-items context changed to reference-only names** (no calorie values shown to the LLM), removing the calorie-estimate bias.
- **Known-item override made exact-match only**: a saved item now only overrides an extracted item if the extracted name matches the saved name exactly (case-insensitive). "Porridge with honey and bananas" no longer gets replaced by a plain "Porridge" known item.
- **Re-extraction fallback added** (`_reextract_if_incomplete`): if the LLM returns suspiciously few items for a message that clearly lists multiple foods, a second pass explicitly asks for the complete item list.
- **Verbose extraction logging added** so future meal-extraction issues can be diagnosed from the backend logs.
- **Deployed to production VPS** and verified with the exact message from the bug report. The same input now logs 4 items: "porridge with honey and bananas", "McDonald's Chicken McNuggets (9 pieces)", "Fries", and "Coke". Test duplicates created during verification were cleaned up.

Why: a user logged a multi-item meal via chat and only 2 of 4+ items were recorded. The root cause was the saved-items shortcut dominating the LLM extraction plus a too-loose substring override, not an inability of the LLM to parse the sentence.

Files/modules touched:
- `src/nodes/nutrition.py` — extraction prompt, reference-only saved-items context, exact-match override guard, `_reextract_if_incomplete`, `_count_likely_food_items`.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes. The fix is live on the production droplet; `systemctl restart lifeos-api` applied.

---

## Previous: Mobile feature batch #2 — system status, push opt-in, insight resolve, subscriptions, readiness, body trend, photo log, briefing, supplements, correlations

What's New:
- **System status strip on Cockpit** (`mobile/src/app/(app)/(tabs)/index.tsx`): surfaces backend services health (`getBackendStatus`) and pipeline errors (`getPipelines`), with a tap-to-open System screen. New hooks: `useBackendStatus`, `usePipelines`, `useSystemLogs`.
- **Push notification opt-in** (`mobile/src/app/(app)/(tabs)/settings/index.tsx`): new 04 // Notifications row shows current permission status and lets the user request/refresh the Expo push token. `mobile/src/lib/notifications.ts` gained `getPushPermissionStatus()`; root `_layout.tsx` already registers the token on sign-in.
- **Resolve AI insights from mobile** (`mobile/src/app/(app)/(tabs)/index.tsx` + `specialist.tsx`): top action-queue insights and Specialist cards now have a "Mark resolved" button that writes `resolved_at` to `ai_insights`. New `resolveInsight()` helper in `queries.ts`; `Insight` interface now includes `resolved_at`.
- **Recurring/subscription spend card in Capital** (`mobile/src/app/(app)/(tabs)/capital.tsx`): estimates monthly recurring merchants from transaction patterns and lists average amount + frequency.
- **Readiness score on Cockpit hero**: composite 0-100 score from sleep, HRV, and resting HR, shown as an "RDY XX" pill next to the status badge.
- **Body composition trend card in Health** (`mobile/src/app/(app)/(tabs)/health.tsx`): shows current weight, 7-day change, 30-day change, and distance to target from `health_metrics.body_weight_kg` + `profile.target_weight_kg`.
- **Photo-first logging shortcut** (`mobile/src/app/(app)/(tabs)/index.tsx` + `chat.tsx`): new "Log photo" quick-action tile on Cockpit opens the Ingest tab and auto-launches the camera (`camera=1` param). Useful for one-tap meal/workout logging.
- **Daily briefing teaser on Cockpit**: latest `advisor_daily_report` surfaced as a card that opens Capital Intel.
- **Supplements schedule card in Health** (`mobile/src/app/(app)/(tabs)/health.tsx`): reads `user_profiles.supplements` JSONB and lists morning/evening supplements with empty-state CTA.
- **Correlation / pattern card on Cockpit**: shows the latest unresolved `domain = 'correlations'` insight with a tap-to-open Specialist action.

Why: the previous batch covered advisor data, anomalies, goals, training, and theme/haptics. This batch continues surfacing underused backend state (system health, correlations, daily reports, supplement schedule) and adds mobile-native UX (push opt-in, photo shortcut, insight resolution, readiness score) while staying read-only except for insight resolution and goal check-ins.

Files/modules touched:
- `mobile/src/lib/queries.ts` — `useBackendStatus`, `usePipelines`, `useSystemLogs`, `resolveInsight`, `Insight.resolved_at`, `Profile.supplements`.
- `mobile/src/lib/notifications.ts` — `getPushPermissionStatus()`.
- `mobile/src/app/(app)/(tabs)/index.tsx` — system status strip, readiness score, daily briefing teaser, correlation card, photo log shortcut, insight resolve button.
- `mobile/src/app/(app)/(tabs)/capital.tsx` — recurring/subscription spend card.
- `mobile/src/app/(app)/(tabs)/health.tsx` — body composition trend card, supplements schedule card.
- `mobile/src/app/(app)/(tabs)/chat.tsx` — auto-open camera from `camera=1` param.
- `mobile/src/app/(app)/(tabs)/settings/index.tsx` — push notifications row.
- `mobile/src/app/(app)/specialist.tsx` — insight resolve button.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes. Run `cd mobile && npx tsc --noEmit && npx expo lint && npx expo-doctor` to verify.

---

## Previous: Mobile feature batch — Capital Intelligence, goal check-ins, training insights, dark mode, haptics, empty-state CTAs

What's New:
- **Capital Intelligence tab** (`mobile/src/app/(app)/(tabs)/capital.tsx`): new "Intel" segmented tab surfaces `advisor_daily_reports` (latest market briefing), `advisor_signals` + `advisor_signal_performance` (live signals with win-rate), and `advisor_watchlist` (Scout candidates by conviction). Adds `useDailyReports`, `useSignals`, `useSignalPerformance`, `useWatchlist` to `mobile/src/lib/queries.ts`.
- **Transaction anomaly card** in Capital: queries `ai_insights` where `domain = 'finance_anomaly'` (output of `src/workers/transaction_anomalies.py`) and renders duplicates, subscription price changes, and unusual amounts with severity badges. New `useTransactionAnomalies` + `parseAnomaly` helpers in `queries.ts`.
- **Goal check-ins in Cockpit action queue** (`mobile/src/app/(app)/(tabs)/index.tsx`): queries active `goals` and `goal_checkins`, surfaces pending daily/weekly habit check-ins above telemetry, and lets the user log "Yes"/"No" directly (writes to `goal_checkins`, bumps `goals.current_value`). New hooks: `useGoals`, `useGoalCheckins`, helpers `isCheckinPending`, `logGoalCheckin`, `updateGoalCurrentValue`.
- **Health training insights** (`mobile/src/app/(app)/(tabs)/health.tsx`): computes workout streak and muscle-group set volume from `exercise_muscles` + workouts, rendered as a new "Training insights" row with streak counter and top muscle groups.
- **Branded empty states + CTAs**: `EmptyState` in `mobile/src/components/ui.tsx` now accepts `icon` and `action` props. Applied to Goals (focus chat input), Specialist insights/memories, and the new Capital Intelligence empty states.
- **Consistent haptics**: tab bar tab presses use `Haptics.selectionAsync`; Cockpit nav cards and goal check-in buttons use impact/notification feedback; Ingest quick-prompt chips and `EmptyState` action buttons also trigger haptics.
- **Dark mode foundation** (`mobile/src/theme/ThemeProvider.tsx`, `mobile/src/theme/index.ts`): system or manual light/dark theme via `useTheme`, persisted in `AsyncStorage`. `app.json` `userInterfaceStyle` set to `automatic`; root `StatusBar`, tab bar `BlurView` tint, `ScreenHeader` blur tint, and the main tab screens (Cockpit, Bio, Capital, Ingest, Settings) plus shared `Surface`/`ScreenHeader` colors now react to the selected theme. Settings has a new 04 // Appearance "Dark mode" toggle.

Why: the diagnosis surfaced several high-impact data-underuse opportunities (advisor output, anomaly insights, goal check-ins, workout muscle mapping) and UI/UX gaps (plain empty states, missing haptics, no dark mode). This batch turns existing backend data into actionable mobile UI without changing schemas or scheduled tasks.

Files/modules touched:
- `mobile/src/lib/queries.ts` — `useDailyReports`, `useSignals`, `useSignalPerformance`, `useWatchlist`, `useTransactionAnomalies`, `useGoals`, `useGoalCheckins`, `useExerciseMuscles`, `isCheckinPending`, `logGoalCheckin`, `updateGoalCurrentValue`, `parseAnomaly`.
- `mobile/src/app/(app)/(tabs)/capital.tsx` — Capital Intelligence tab + anomaly card.
- `mobile/src/app/(app)/(tabs)/index.tsx` — pending goal check-ins in action queue.
- `mobile/src/app/(app)/(tabs)/health.tsx` — training insights (streak + muscle volume).
- `mobile/src/app/(app)/(tabs)/chat.tsx` — haptics on quick prompts.
- `mobile/src/app/(app)/(tabs)/_layout.tsx` — tab bar haptics + dynamic blur tint.
- `mobile/src/app/(app)/(tabs)/settings/index.tsx` — dark mode toggle.
- `mobile/src/app/(app)/goals.tsx` + `mobile/src/app/(app)/specialist.tsx` — branded `EmptyState` usage.
- `mobile/src/components/ui.tsx` — enhanced `EmptyState`, theme-aware `Surface` + `ScreenHeader`.
- `mobile/src/app/_layout.tsx` — `ThemeProvider`, dynamic `StatusBar`.
- `mobile/src/theme/index.ts` — `ThemeColors` type + `darkColors` palette.
- `mobile/src/theme/ThemeProvider.tsx` — new.
- `mobile/app.json` — `userInterfaceStyle: "automatic"`.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none — all changes are read-only except goal check-in writes (which use the existing `goal_checkins`/`goals` tables and match the Telegram webhook format `mobile:<yes|no>`). Run `cd mobile && npx tsc --noEmit && npx expo lint && npx expo-doctor` to verify.

---

## Previous: Mobile app lint hygiene, Expo SDK patch upgrade, useAsync refactor

What's New:
- **All `mobile/` lint errors and warnings fixed** — `npx expo lint` now exits clean. Removed unused imports/variables across `capital.tsx`, `health.tsx`, `index.tsx`, `settings/index.tsx`, and `components/ui.tsx`. Escaped unescaped quotes in the Capital recommendations hint. Imported `AndroidImportance` directly from `expo-notifications` instead of accessing it as a namespace property.
- **Expo SDK patch versions aligned** — upgraded `expo`, `expo-blur`, `expo-font`, and `expo-router` to the versions expected by SDK 58. `npx expo-doctor` now passes all 20 checks.
- **`useAsync` hook refactored** (`mobile/src/lib/queries.ts`): replaced the non-literal `useCallback` dependency array and synchronous `setState` calls inside the effect body. The hook now keeps the latest fetcher in a ref, uses a stable `run` callback, defers the initial fetch one tick to satisfy the `set-state-in-effect` rule, and returns a memoized stable object so consuming screens can safely depend on it in `useCallback`.
- **Fixed ref-during-render in Cockpit and Health** (`mobile/src/app/(app)/(tabs)/index.tsx`, `health.tsx`): moved the `refetchAll.current = onRefresh` assignment into a `useEffect`, and wrapped `onRefresh` in `useCallback` with stable hook-object dependencies thanks to the `useAsync` memoization.

Why: the mobile build pipeline was blocked by lint errors and Expo SDK patch mismatches. The `useAsync` hook was also using React patterns that the stricter hooks lint rules flagged as risky (non-literal deps, setState in effect, unstable return object), which made focus-based refetch and screen-level `useCallback`s unreliable.

Files/modules touched:
- `mobile/src/lib/queries.ts` — `useAsync` refactor.
- `mobile/src/lib/notifications.ts` — direct `AndroidImportance` import.
- `mobile/src/components/ui.tsx` — removed unused `Line` import.
- `mobile/src/app/(app)/(tabs)/index.tsx` — ref-during-render fix, removed unused imports/vars, `onRefresh` memoized.
- `mobile/src/app/(app)/(tabs)/health.tsx` — ref-during-render fix, removed unused imports/vars, restored `totalWorkouts`/`totalMeals` counts used in JSX, `onRefresh` memoized.
- `mobile/src/app/(app)/(tabs)/capital.tsx` — removed unused imports, escaped quotes.
- `mobile/src/app/(app)/(tabs)/settings/index.tsx` — removed unused `Surface` import.
- `mobile/package.json` / `package-lock.json` — Expo patch upgrades.
- `docs/CHANGES.md` — this entry.

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes. Run `cd mobile && npx expo-doctor && npx expo lint && npx tsc --noEmit` to verify.

---

## Previous: Fix meal ingestion losing multi-item meals to empty known-item match

What's New:
- **Known-item short-circuit no longer fires for items with 0/null calories** (`src/nodes/nutrition.py`): when a user logs a meal like "vicio burger with fries and a coke", if "vicio burger" matched a `known_items` row with null calories (saved without nutritional data), the known-item shortcut would skip web search, tell the LLM to use the known item's "EXACT values verbatim" (all zeros), override the LLM's estimates with 0s, and treat the entire message as one item — losing the fries and coke. Now: known items with 0/null calories don't short-circuit; the LLM estimates from web search normally.
- **Per-item known-item override also checks for nutritional data**: the per-item override at line ~254 now requires `calories > 0` before replacing LLM estimates, so empty known items can't zero out good estimates.
- **New known items are only learned if they have real nutritional data** (calories > 0): prevents the cycle from repeating.
- **Data cleanup**: deleted the "Vicio burger with fries" known item (null calories, use_count 4) and 5 other known items with null calories that would have caused the same bug. Deleted 2 zero-calorie "Vicio burger with fries" meals that were logged by the bug.
- **Missing `src/nodes/ui_blocks.py` committed**: was untracked locally, caused API startup failure on the VPS after deploy.

Why: the user logged "i had a vicio burger with fries and a coke" and only got "Vicio burger with fries (0 kcal)" — the known item with no data short-circuited everything. The root cause was known items saved without nutritional data being treated as authoritative overrides.

Files touched: `src/nodes/nutrition.py`, `src/nodes/ui_blocks.py` (new), `docs/CHANGES.md`.

---

## Previous: Mobile Ingest screen supports PDF file uploads (reuses /statements/upload)

What's New:
- **Mobile Ingest/chat screen now accepts PDF attachments** (`mobile/src/app/(app)/(tabs)/chat.tsx`): the attach action sheet adds a "Choose PDF" option (via `expo-document-picker`, `type: "application/pdf`) alongside the existing camera/library image picker. Picking a PDF shows a file-card preview (icon + filename) in the input bar and a file chip in the user's chat bubble. On send, the PDF is uploaded via the existing `POST /statements/upload` endpoint (which records it in `statement_uploads` and triggers the `pdf-statement-sync` pipeline), then a chat message is sent to `/api/chat` referencing the upload (filename + `upload_id`) so the agent knows what was just ingested and can answer follow-ups. Image attachments keep their existing base64 → `/api/chat` `image` field path unchanged.
- **`uploadStatement()` return type widened** (`mobile/src/lib/api.ts`): now returns `{ status, message?, upload_id?, path? }` instead of just `{ message? }`, matching the actual backend response. The existing System screen caller still works (it only reads `message`).
- **No backend code changes.** `POST /statements/upload` (`src/api.py`) already accepts PDFs, returns `upload_id`, and triggers `pdf-statement-sync`; `src/pipeline_service.py` already registers that pipeline. Verified both compile.

Why: the user wanted to attach PDFs (e.g. bank/CC statements) from the Ingest chat flow on mobile, the same place they already log meals/workouts/trades via photos. Reusing the existing statement-upload endpoint (rather than adding a new chat-attachment endpoint) keeps a single ingest path for PDFs and lets the agent reason about the upload by reference.

Files/modules touched:
- `mobile/src/app/(app)/(tabs)/chat.tsx` — added `expo-document-picker` import, `Attachment` discriminated union (`image | file`), `pickFile()`, "Choose PDF" action-sheet option, file-aware `send()` (upload then chat), file chip in bubbles, file-card attachment preview, `uploading` state, new styles.
- `mobile/src/lib/api.ts` — `uploadStatement()` return type widened; added `StatementUploadResponse` interface.

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes. The backend endpoint and pipeline are unchanged.

---

## Previous change: Mobile app rebuilt to match the "Human Engine" Stitch design; chat reply formatting

What's New:
- **Mobile app visual rebuild** (`mobile/`): all 9 screens (`Cockpit`, `Bio`/health, `Capital`, `Goals`, `Specialist Advisors`, `System`, `Settings` + its 4 sub-screens, `Ingest`/chat) restructured to match the Stitch "Human Engine Personal Cockpit" design. `src/components/ui.tsx` gained new shared primitives: `PacingBar` (segmented progress track), `AccentCard` (severity-tiered card with left accent stripe), `PodDetailed` (telemetry pod with a secondary metric "well"), `MetaRow`, and `FormattedText` (lightweight `**bold**` + paragraph-break renderer for backend reply text). `ScreenHeader` was reworked from an inline scrolling page title into a fixed, blurred top bar (`HEADER_BAR_HEIGHT` exported for screens to pad against), and `Surface`/`AccentCard` gained soft drop-shadow elevation to match the design's "Instrument Pod" spec. No data-fetching, routes, or business logic changed — this was a layout/composition pass; screens deliberately omit any Stitch widget with no real backing data (fake live clocks, invented uptime/runway figures, broker order-flow UI) rather than fabricating values.
- **Fixed a real bug found during this pass**: `mobile/src/app/(app)/chat.tsx`'s message list/empty-state `ScrollView`/`FlatList` had no `flex: 1`, so on a tall empty state (header + 4 quick-prompt rows) the input bar could be pushed off-screen entirely. Also widened the input bar's bottom clearance so it doesn't render under the floating blurred tab bar.
- **Nutrition chat replies now use light markdown** (`src/nodes/nutrition.py`, both the text-logged and photo-logged meal response paths): `**Logged:** <summary>` + a macros line, blank-line-separated from the AI insight, instead of one run-on sentence. Renders correctly via the new `FormattedText` component; other node handlers (trade/workout/general) are unchanged.

Why: the mobile app's colors/fonts already matched the Stitch design system, but screen layouts didn't — flat bordered cards instead of elevated "instrument pods," an oversized scrolling page title instead of Stitch's compact pinned header bar, and plain-paragraph chat replies that were hard to scan.

Files/modules touched:
- `mobile/src/components/ui.tsx`, all files under `mobile/src/app/(app)/` (and its `settings/` subfolder), `mobile/src/lib/pacing.ts` (exported `DAY_START_HOUR`/`DAY_END_HOUR`).
- `src/nodes/nutrition.py` (chat response string formatting only — no new fields, no schema change).

Breaking changes / manual setup: none — no schema, API contract, or scheduled-task changes.

---

## Previous change: In-house market advisor (`market_advisor.py`) replaces the removed Jarvis Advisor v3

What's New:
- **New worker `src/workers/market_advisor.py`**, registered as the `market-advisor` pipeline, scheduled Mon-Fri 3:30 PM (after `ibkr-flex-sync` at 3:00 PM). Each run: revalues positions (calls `price_refresh.run()` directly), grades signals from ≥5 days ago against actual price moves and rolls wins/losses into `advisor_signal_performance` (the learning loop — this performance summary is fed into every persona prompt), runs a 4-persona LLM swarm (Macro Strategist, Technical Analyst, Risk Manager, Contrarian — all via OpenRouter `openai/gpt-4o-mini`, run concurrently) over every open position and active watchlist candidate, synthesizes votes into one `advisor_signals` row per symbol (actionable only when ≥2 personas agree, otherwise HOLD), surfaces actionable signals above a 0.7 confidence threshold as proposed `advisor_orders` rows, and writes `advisor_portfolio_snapshots` + `advisor_position_history` + an `advisor_daily_reports` HTML/JSON digest. On Sundays only, an extra "Scout" persona call proposes 1-5 new `advisor_watchlist` candidates.
- **The app only ever surfaces recommendations — it never auto-approves or executes orders.** Proposed `advisor_orders` rows go through the existing manual approve/reject flow (`OrdersPanel.tsx` on web; read-only advisory cards on mobile); the user acts manually via broker/Telegram/Log Trade, same as before.
- **Fixed a real Jarvis-era data bug**: `advisor_watchlist` had silent duplicate rows per symbol (Jarvis's select-then-update dedup was failing — e.g. ORCL/Fraport/SOXX each had 3 rows, all `conviction_score=0`). New migration `025-advisor-watchlist-dedupe-and-orders-source.sql` deletes the duplicates (keeping the highest-conviction row) and adds a real `UNIQUE (user_id, symbol)` constraint.
- **Dashboard empty-state copy updated** (`OrdersPanel.tsx`, `RiskPanel.tsx`) — no longer references Jarvis by name.
- `docs/architecture.md` §3.3, `docs/daily-finance-flow.md`, `docs/jarvis-v3-supabase-positions-sync.md`, and `docs/research-bot-command.md` updated to describe the in-house worker as implemented rather than planned, and to mark the Jarvis-era docs as historical reference only.

Why: Jarvis Advisor v3 (external, its own cron, its own Supabase service-role key, invisible to LifeOS's `pipeline_service.py` observability) was removed from the user's setup. The tables and UI it fed (`advisor_signals`, `advisor_watchlist`, `advisor_daily_reports`, `advisor_orders`) were already fully wired up on both the dashboard and mobile app — they just had no writer. This closes that gap in-house, and additionally closes a gap Jarvis itself never closed: `advisor_orders` and `advisor_signal_performance` were both empty even while Jarvis was running (461 signals generated, zero ever became an order, zero performance rollups ever computed).

Files/modules touched:
- New: `src/workers/market_advisor.py`, `docs/supabase-migrations/025-advisor-watchlist-dedupe-and-orders-source.sql`.
- Modified: `src/pipeline_service.py` (new `market-advisor` pipeline entry), `scripts/windows_tasks.ps1` (new `LifeOS-MarketAdvisor` task), `deploy/lifeos.cron` (new weekday 15:30 line), `frontend/app/components/investments/OrdersPanel.tsx`, `frontend/app/components/investments/RiskPanel.tsx`, `AGENTS.md` (testing checklist).
- Docs: `docs/architecture.md`, `docs/daily-finance-flow.md`, `docs/jarvis-v3-supabase-positions-sync.md`, `docs/research-bot-command.md`.

Breaking changes / manual setup:
- **Migration required**: `docs/supabase-migrations/025-advisor-watchlist-dedupe-and-orders-source.sql` must be run in the Supabase SQL Editor before `market_advisor.py`'s weekly discovery step or any order proposal can write successfully — it adds a `UNIQUE (user_id, symbol)` constraint on `advisor_watchlist` and widens the `advisor_orders.source` CHECK constraint to allow `'market_advisor'` (previously only `'jarvis'`/`'manual'`).
- `docs/supabase-schema.sql` should be regenerated (`python scripts/introspect_supabase_schema.py`) after that migration is applied.
- No new environment variables — reuses existing `OPENROUTER_API_KEY`, `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, `FINNHUB_API_KEY`.
- If Jarvis v3 is still running externally anywhere, it should be decommissioned — it is no longer the intended writer of these tables.

---

## Previous change: Mobile app rebuilt on a Stitch-designed light theme, Capital screen merges cash+investments, Orders simplified to read-only recommendations

What's New:
- **New design system implemented from a Stitch design**, replacing the hand-built dark theme from the previous pass. `mobile/src/theme/index.ts` and `mobile/src/components/ui.tsx` now match the "Human Engine Personal Cockpit" Stitch project exactly: light Swiss-functionalism/glass-cockpit palette (Slate surfaces, six semantic status colors), Space Grotesk headings, Geist body text, JetBrains Mono for all numeric data (via `@expo-google-fonts/*`, loaded in `mobile/src/app/_layout.tsx`).
- **Navigation restructured to 5 tabs**: Cockpit, Ingest, Bio, Capital, Settings — down from 8. Goals and Advisors are no longer tab-bar items (would clutter a 5-icon bar); they're reachable via quick-access cards on Cockpit instead, still at most one tap away. `mobile/src/app/(app)/capital.tsx` is new — merges what were separate Finance and Investments screens into one Cash/Portfolio segmented view, matching how the design was actually drawn.
- **Orders simplified to read-only recommendations — a real product-model correction, not just styling.** The previous pass over-built this: a full proposed→approved→sent→filled lifecycle with an in-app fill-entry form, mirroring the web dashboard's `OrdersPanel`. The actual model: an advisor process (planned, not yet built — see below) only *suggests*; the user acts on a suggestion by telling Ingest what they actually did ("bought 50 NVDA at 230"), which is the existing trade-logging path, not a new UI action. Removed `mobile/src/lib/positions.ts` (fill math) and the Approve/Reject/Log Fill UI entirely; Capital's Portfolio tab now shows plain advisory cards (symbol, direction, rationale, confidence, a "tell Ingest" hint).
- **Cockpit's action queue now has real hierarchy**: the single most urgent item renders as a visually dominant card; everything else is a compact secondary row. The first version gave every item equal weight, which undercut the "glance and know what's wrong" goal.
- **Jarvis Advisor v3 confirmed removed** from the user's production setup (not just a docs note this time — verified no external service is running). The in-house replacement (`src/workers/market_advisor.py`: daily market analysis + recommendation generation + a learning loop that feeds `advisor_signal_performance` back into the generation prompt) is designed but **not yet built** — next piece of work. `price_refresh.py` (mark-to-market via Finnhub) already works independently and doesn't depend on it.
- **Two backend bugs fixed and deployed** (found while confirming the data layer could support live pacing): `src/nodes/nutrition.py` had a `NameError` on `llm_cloud` that broke all photo-based meal logging; `src/nodes/workout.py` couldn't resolve relative weight phrases ("went up 3kg on bench") since the extraction prompt never saw the current logged weight. Both fixed — see prior entry below for detail.
- **New production droplet + Finnhub key**: covered in the entry below — the droplet was lost and replaced, a new `API_SECRET` propagated everywhere, Finnhub confirmed live.

Why: the first mobile rebuild was functionally real but visually generic ("looks like the web dashboard ported into an app," per direct feedback) and the Orders flow was built against an assumption (an external swarm agent handling trade proposals) that no longer holds now that Jarvis v3 is gone and advisor logic is moving in-house. Iterated the visual design through several rounds in Stitch (an AI UI design tool, connected via its MCP server) before implementing — each round reviewed against the actual data model to catch fabricated features (invented wearable-sync/brokerage-API settings rows, a fake water-target field) before they reached code.

Files/modules touched:
- Rewritten: `mobile/src/theme/index.ts`, `mobile/src/components/ui.tsx`, every screen in `mobile/src/app/(app)/`.
- New: `mobile/src/app/(app)/capital.tsx`.
- Removed: `mobile/src/app/(app)/finance.tsx`, `mobile/src/app/(app)/investments.tsx`, `mobile/src/lib/positions.ts`.
- Docs: `docs/ARCHITECTURE.md` §3.7.

Breaking changes / manual setup:
- None to data contracts — no schema changes this pass.
- Mobile app needs a fresh `npx expo run:ios` to pick up the new font packages (`@expo-google-fonts/space-grotesk`, `@expo-google-fonts/geist`, `@expo-google-fonts/jetbrains-mono`, `expo-font`) added since the last build.
- Any bookmarked deep link to `/finance` or `/investments` in the mobile app is now dead — both routes were removed in favor of `/capital`.

---

## Previous change: Native visual/data rework of the mobile app, Orders flow, live pacing recommendations, Jarvis v3 removed

What's New:
- **Full visual rework of `mobile/`** — replaced the initial build (which read as "the web dashboard ported into an app") with a real native-first presentation system: dark-first theme (`mobile/src/theme/index.ts`), new primitives (`Surface`, `Stat`, `Ring` radial progress, `Pill`, `Dot`, `ListRow`, `SegmentedControl`, `NavRow`, `FormField`, `ScreenTitle`) in `mobile/src/components/ui.tsx`, haptics on key interactions, a floating blurred tab bar, and — since bottom-tabs has no native large-title support — Settings converted into a real nested Stack (`mobile/src/app/(app)/settings/`) so it gets a genuine native large title with drill-down edit screens (Body / Daily Targets / Capital Flow).
- **Data layer refactor**: `mobile/src/lib/queries.ts` consolidates every screen's Supabase fetch logic into shared hooks on one `useAsync` primitive (loading/refreshing/error/refetch) instead of copy-pasted fetch blocks per screen.
- **New: live, time-of-day-aware recommendations** (`mobile/src/lib/pacing.ts`) — distinct from the batch-generated `ai_insights` table. Computes on-device whether you're behind pace on protein/calories (given the time of day), whether last night's sleep was low, whether monthly spending is ahead of pace, and detects workout PRs (today's logged weight beating prior history for that exercise). Surfaced in a new Nexus "Needs Attention" section (merged with top `ai_insights` rows, severity-sorted) and a new Health "Today's fuel" section (macro progress + a micronutrient coverage slice for priority nutrients).
- **Investments Orders flow, built in full** (not deferred): `Overview`/`Orders` segmented toggle; Approve/Reject/Mark Sent/Log Fill/Cancel actions against `advisor_orders`, with Log Fill inserting `advisor_order_fills` and upserting `advisor_positions` via a new shared position-math module (`mobile/src/lib/positions.ts`, ported from the web app's `LogTradeModal`/`OrdersPanel` — which duplicate this math in two places there; here it's one function). Fixed a real bug caught during this work: the ported math didn't set `user_id` (`NOT NULL`, no default on `advisor_positions`) — a first fill on a brand-new symbol would have failed the insert.
- **Settings/targets now wires `calculateTargets()`** (existed in `api.ts`, never had a mobile UI) — goal/activity pickers → AI-calculated BMR/TDEE/macros → apply to targets.
- **Two backend bugs fixed** (found while investigating whether the DB/backend needed restructuring to support live pacing — verdict: schema was fine, these were real write-path bugs):
  - `src/nodes/nutrition.py` — photo-based meal logging (`nutrition_node`) referenced `llm_cloud` without importing it, raising `NameError` before any insert. Text-only meal logging was unaffected. Fixed with a one-line import.
  - `src/nodes/workout.py` — weight-delta phrases ("went up 3kg on bench") had no way to resolve correctly, since the extraction prompt never saw the current logged weight; the LLM had to guess an absolute number. Now the prompt asks for `weight_delta` when the user speaks relatively, and the existing template weight (already fetched server-side) resolves it.
- **Jarvis Advisor v3 removed** from the user's setup — the external swarm-analysis service this system was built around is gone. `advisor_signals`/`advisor_watchlist`/`advisor_daily_reports` currently have no active writer. Replacement plan: an in-house `src/workers/market_advisor.py` (not built yet — next piece of work) will generate daily signals/orders/reports via OpenRouter, with a learning loop that feeds `advisor_signal_performance` (past win-rate) back into the generation prompt. Targets the same schema Jarvis used, so nothing else needs to change once it exists.
- **New production droplet + Finnhub key**: the prior droplet was lost and replaced (`lifeos-prod`, 104.248.161.4, DuckDNS repointed); new `API_SECRET` generated and propagated to the droplet, `frontend/.env.ios`, and `mobile/.env`; Finnhub API key added, confirmed live (`price_refresh.py` now actually mark-to-markets `advisor_positions` instead of silently skipping).
- **Push notifications**: `device_push_tokens` table (migration 024) + `mobile/src/lib/notifications.ts` registers the Expo push token on sign-in; `src/utils/push_notifications.py` sends via Expo's push API, wired to one trigger so far (pipeline failures).

Why: the first mobile build was functionally real but visually and conceptually just a port. The product's actual job — monitor health/finance, surface specific actionable gaps ("you need a protein-rich lunch," "low sleep, go to bed earlier"), support real trade decisions, and look like a native app — needed a presentation rework, a live-status computation layer, and the Orders decision flow actually built, not stubbed. The Jarvis removal is unrelated but happened mid-session — the user is bringing that capability in-house.

Files/modules touched:
- Rewritten: every screen in `mobile/src/app/(app)/`, `mobile/src/theme/index.ts`, `mobile/src/components/ui.tsx`.
- New: `mobile/src/lib/queries.ts`, `mobile/src/lib/pacing.ts`, `mobile/src/lib/positions.ts`, `mobile/src/app/(app)/settings/` (nested Stack).
- Backend: `src/nodes/nutrition.py`, `src/nodes/workout.py` (bug fixes, deployed).
- Infra: new droplet, new `API_SECRET`, Finnhub key added.
- Docs: `docs/ARCHITECTURE.md` §3.3 and §3.7, `AGENTS.md`, `README.md` (Jarvis references updated to reflect removal + in-house replacement plan).

Breaking changes / manual setup:
- None to data contracts — `advisor_*` tables are unchanged, just currently unwritten by any advisor process until `market_advisor.py` exists.
- Mobile app needs a fresh `npx expo run:ios` to pick up the new native modules (`expo-blur`, `expo-haptics`, `expo-linear-gradient`, `expo-document-picker`, `expo-notifications`, `expo-device`) added since the last build.
- Settings is now a nested route (`/settings/body`, `/settings/targets`, `/settings/capital`) instead of one flat screen — no external links reference the old flat route, so no redirect needed.

---

## Previous change: Native iOS app (Expo/React Native rewrite), push notifications, new production droplet

What's New:
- **Native mobile app at `mobile/`**: a real Expo/React Native app (not a WebView) — supersedes the Capacitor wrapper below as the primary mobile app, though that wrapper is left in place. Own UI per screen via Expo Router (`mobile/src/app/`), talking to the same backend/`Supabase` project as the web dashboard (same `/api/*` contracts, same tables). Full parity: Chat (text + photo via `expo-image-picker`, same `/api/chat` pipeline), Goals (chat + goal cards), Specialist (3 personas). Functional-but-simplified (real data/writes, basic charts via `react-native-gifted-charts` for sleep/HR/spend/portfolio trends, not full visual parity yet): Nexus, Health, Finance, Investments, Settings, System. Not built yet: Investments Orders tab, Budgets panel, Daily Report viewer. Full inventory in `docs/ARCHITECTURE.md` §3.7.
- **Push notifications**: new `device_push_tokens` table (migration 024) + `mobile/src/lib/notifications.ts` registers the device's Expo push token on sign-in. `src/utils/push_notifications.py` sends via Expo's push API; currently wired to one trigger (pipeline failures, from `pipeline_service.py`). Best-effort — a failed send never fails the pipeline.
- **New production droplet**: the old DigitalOcean droplet was lost; provisioned a new one (`lifeos-prod`, 104.248.161.4, $6/mo 1GB) via `deploy/setup.sh`, repointed DuckDNS (`life-os-rylang.duckdns.org`) at it. **New `API_SECRET`** generated (the old one is gone) — propagated to the droplet's `.env`, `frontend/.env.ios`, and `mobile/.env`. **Vercel's `NEXT_PUBLIC_API_TOKEN` still needs manually updating to the new secret** or the web dashboard's API calls will 401.
- **Docs**: `docs/ARCHITECTURE.md` §3.7 (new), Components table, DB schema table; `docs/supabase-schema.sql` regenerated.

Why: the Capacitor wrapper was a fast first pass, but the goal was a genuinely native app (real navigation, real camera/photo picker, real push notifications) — not achievable from a WebView, hence the separate native rewrite. The droplet work was unplanned — the original production droplet was lost and had to be replaced from scratch.

Files/modules touched:
- New: `mobile/` (full Expo project), `docs/supabase-migrations/024-device-push-tokens.sql`, `src/utils/push_notifications.py`.
- Modified: `src/pipeline_service.py` (push on pipeline failure), `docs/supabase-schema.sql`, `docs/ARCHITECTURE.md`, `README.md`.
- Infra: new droplet `lifeos-prod`, DuckDNS repoint, new `API_SECRET`.

Breaking changes / manual setup:
- **The old `API_SECRET` no longer works anywhere.** Update Vercel's `NEXT_PUBLIC_API_TOKEN` to the new value or the web dashboard breaks.
- Run `docs/supabase-migrations/024-device-push-tokens.sql` if not already applied (it was applied directly via the Supabase connection pooler as part of this change, so should already be live — verify with `select 1 from device_push_tokens limit 1;`).
- Mobile app build requires `mobile/.env` filled in (not committed) — see `mobile/.env.example`.
- iOS native build to a physical device needs a one-time manual Xcode signing step (free or paid Apple ID) — see `docs/ARCHITECTURE.md` §3.7. Building to the iOS Simulator needs no Apple ID at all.

---

## Previous change: iOS app (Capacitor wrapper around the existing frontend, debug build first, TestFlight later)

What's New:
- **No new UI code**: the iOS app is the existing `frontend/` Next.js app, built as a static export and wrapped with Capacitor 6 into a native Xcode project at `frontend/ios/`. Chat + photo logging on the app already worked over `/api/chat` (same LangGraph pipeline as Telegram) — nothing backend-side changed.
- **New build path**: `npm run build:ios` (sets `BUILD_TARGET=capacitor`, which flips on `output: "export"` in `next.config.js`) → `npm run ios:sync` (export + `cap sync` + `pod install`) → `npm run ios:open` (opens Xcode). The normal `npm run build` used by Vercel is untouched.
- **New env file**: `frontend/.env.ios` (gitignored) holds build-time `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — baked into the static bundle since there's no server at runtime on-device.
- **Mobile polish**: `NativeBridge.tsx` sets iOS status bar style + native keyboard resize; `viewportFit: "cover"` + `env(safe-area-inset-*)` CSS so content clears the notch/home indicator in the fixed sidebar; `Info.plist` camera/photo-library usage strings added for the existing image-attach flow in `ChatPanel.tsx`.
- Full detail: `docs/ARCHITECTURE.md` §3.6.

Why: run LifeOS on iOS as a real app instead of Telegram, reusing the same backend and the same chat/photo pipeline, without maintaining a second frontend.

Files/modules touched:
- New: `frontend/next.config.js`, `frontend/capacitor.config.ts`, `frontend/app/components/NativeBridge.tsx`, `frontend/ios/` (Xcode project; `Pods/`, `build/`, `App/public/` gitignored), `frontend/.env.ios` (gitignored, not committed).
- Modified: `frontend/package.json` (Capacitor deps + `build:ios`/`ios:sync`/`ios:open` scripts), `frontend/app/layout.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/globals.css`, root `.gitignore`.
- Docs: `docs/ARCHITECTURE.md`, `docs/CHANGES.md`.

Breaking changes / manual setup:
- None to the backend or web dashboard — this is additive.
- To build: fill in `NEXT_PUBLIC_API_TOKEN` in `frontend/.env.ios` (must match `API_SECRET` on the droplet), then `npm run ios:sync && npm run ios:open`, pick your signing team in Xcode, and run to a device over USB (free Apple ID, 7-day provisioning).
- TestFlight is not wired up yet — needs a paid Apple Developer account + App Store Connect record for `com.humanengine.lifeos` + an Xcode Archive/upload.

---

## Previous change: Fix broken JSON extraction regex in all agent nodes

What's New:
- **Critical bug fix**: `re.search(r'\{{.*}}', ...)` in `src/nodes/health_image.py`, `src/nodes/finance.py`, and `src/nodes/nutrition.py` (5 call sites) matched literal `{{`/`}}` double braces, which valid JSON never contains — so every LLM JSON extraction in those nodes silently failed (e.g. "Could not extract structured health metrics from the screenshot"). All now use `r'\{.*\}'` like the other nodes. Introduced during the graph.py → src/nodes/ refactor; not VPS-related.

---

## Previous change: VPS production deployment (DigitalOcean + Caddy + cron, frontend on Vercel)

What's New:
- **Linux-compatible dependencies**: `requirements.txt` regenerated from the known-good local venv — it now actually contains `langchain-openai`, `langchain-ollama`, and `PyMuPDF` (imported but previously missing), drops unused `redis` and the editable `mi_fitness_sync` install (dead integration), and gates `pywin32` behind a `sys_platform == "win32"` marker so `pip install` works on Linux. **Install with `pip install --no-deps -r requirements.txt`**: plain resolution fails on a fresh venv because `realtime` (unused supabase sub-package) and `langsmith` have mutually exclusive `websockets` version constraints; the freeze already pins every transitive dep, so resolution is skipped.
- **Ollama no longer required**: `src/workers/daily_analyzer.py` (the last hard dependency) now uses OpenRouter `gpt-4o-mini`. `src/nodes/general.py` already fell back to OpenRouter. The `/status` endpoint now reports `openrouter` instead of `ollama`; the `/system` dashboard tile is renamed accordingly.
- **`PUBLIC_DOMAIN` env var**: the Telegram webhook registration and `/telegram/webhook-info` use `PUBLIC_DOMAIN` with `NGROK_DOMAIN` as fallback, so ngrok is only needed for local dev.
- **New `deploy/` directory**: `lifeos-api.service` (systemd), `lifeos.cron` (all 15 schedules mirrored from `scripts/windows_tasks.ps1`), `Caddyfile` (auto-HTTPS reverse proxy), `setup.sh` (idempotent droplet provisioning), `update.sh` (git pull + restart deploys).
- **Docs**: new `docs/deployment.md` runbook (droplet creation, DuckDNS, secrets, verification, rollback); README + AGENTS.md updated.

Why: move the backend and scheduled workers off the Windows machine onto a $6 DigitalOcean droplet, with the dashboard on Vercel.

Files/modules touched:
- `requirements.txt`, `src/workers/daily_analyzer.py`, `src/api.py`, `src/pipeline_service.py`, `.env.example`.
- `frontend/utils/api.ts`, `frontend/app/(app)/system/page.tsx` (status tile rename).
- New: `deploy/` (5 files), `docs/deployment.md`.
- Docs: `README.md`, `AGENTS.md`, `docs/CHANGES.md`.

Breaking changes / manual setup:
- The `/status` response now returns `services.openrouter` instead of `services.ollama` (frontend updated to match).
- Production cutover requires following `docs/deployment.md`: provision the droplet, copy `.env` (with `PUBLIC_DOMAIN` set), then **disable the local `LifeOS-*` Windows tasks and local API** so workers don't run twice and the webhook isn't stolen back.
- No schema changes; no migrations to apply.

---

## Previous change: Wire all scheduled tasks through pipeline_service and clean up unconnected paths

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
