# LifeOS — Recent Changes & Impact Log

> **Start here if you are a new AI joining mid-stream.** This file explains the most recent set of changes, why they were made, and what you must not break.

---

## Latest change: Mobile app rebuilt to match the "Human Engine" Stitch design; chat reply formatting

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
