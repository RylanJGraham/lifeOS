# Frontend Architecture & Design System

The LifeOS frontend is built with Next.js 14 (App Router), React, and TailwindCSS. The UI architecture prioritizes a highly premium, "glassmorphism" aesthetic with dynamic data visualization and real-time state management.

## 1. Design System & Aesthetics
* **Theme & Colors:** Operates on an ultra-modern dark mode setup relying on deep background gradients. Uses specific semantic colors for data (e.g., `#00E676` for Optimal/Growth, `#FF3B30` for Alerts).
* **Typography:** Utilizes `Inter` for primary text and a monospaced font for numerical data (metrics, timestamps) to enhance the dashboard feel.
* **Component Styling:**
  * **Cards:** Glassmorphic translucent surfaces (`rgba(255, 255, 255, 0.03)`) with subtle borders (`1px solid var(--border-subtle)`).
  * **Animations:** Powered by `framer-motion`. Includes staggered tab reveals, smooth height expansions for dropdowns, and dynamic bezier curves (`easeOut`).
* **Visual Data:** Uses custom SVG gradient definitions embedded in Recharts components to give area charts and bar charts a premium "glowing" effect.

## 2. Wealth OS (`/finance/page.tsx`)
A comprehensive financial dashboard mapping to the `transactions` table (spending/cash flow). Investment positions, signals, and research live on the dedicated Investments page (see 2a), linked via a banner under the page header.
* **Top Navigation:** 
  * Features a "Live" pulsating badge.
  * Time filters (`Day, Week, Month, Quarter, Year`) built as active toggle buttons that globally filter data states using date boundary calculations.
* **Tab Ecosystem:**
  * **Capital Outflow:** Renders a gradient Area Chart showing net spending over time. Below the chart, it renders a dense `TransactionsTable` component containing 100+ rows of raw categorized bank expenses, featuring badge-colored categories and confidence scores.
  * **Net Worth:** Visualizes aggregate historical asset growth using an area chart fed by `advisor_portfolio_snapshots`.
  * **Cash Flow:** Uses compound bar charts (Income vs Expenses) allowing the user to see exactly where cash is moving. Highlights the "Highest Category" (e.g., 'Housing & Utilities') and renders an AI anomaly detection card using a glassmorphic tooltip.
* **Daily Report Modal:** `DailyReportModal.tsx` fetches the latest 14 rows of `advisor_daily_reports` (metadata only; `html_content` is lazy-fetched per selected report), offers date-chip switching, and renders the bot's self-contained `html_content` in a fully sandboxed `<iframe srcdoc>`.

## 2a. Investments (`/investments/page.tsx`)
Dedicated investment & research hub (components in `app/components/investments/`, typed via `types.ts`, single data hook `useInvestmentsData.ts` with explicit loading/error states).
* **Portfolio Overview:** KPI cards (value, unrealized P&L, cash, daily P&L, beta, `risk_flags` badges) from `advisor_portfolio_snapshots` + `advisor_positions_with_signals`; allocation donut; net-worth area chart; `PortfolioConstellation` hero visual.
* **Positions Table:** Open positions with AI action badges and per-currency formatting; expandable rows show price/weight history (`advisor_position_history`) and the trade ledger (`advisor_purchase_history`).
* **Candidate Radar:** Watchlist candidates from `advisor_watchlist` with conviction score bars, conviction-over-time charts (`conviction_history`, falling back to `advisor_signals` confidence history), interest-state badges (`scouting → warming → convinced`, `cooling → dropped`), theses, and a promoted-proposals strip (conviction ≥ 70) with entry/target/stop.
* **Signal Intelligence:** Full `advisor_signals` history grouped per symbol with confidence-trend charts and win-rate bars from `advisor_signal_performance`.
* **Advisor Reports:** Report metadata list opening the shared `DailyReportModal`.

## 2b. Goals (`/goals/page.tsx`)
Chat-driven goal planning hub (components in `app/components/goals/`, typed via `types.ts`, single data hook `useGoalsData.ts` with explicit loading/error states; chat panel in `app/(app)/goals/components/`). Goals and check-ins live in the `goals` / `goal_checkins` tables (migration 009) — a missing table degrades to the empty state rather than an error.
* **Goals Architect Chat:** Slim variant of the main chat panel (localStorage history `lifeos_goals_chat_history`, quick-action chips, thinking indicator) talking to `POST /api/goals/chat`. Goal CRUD happens agent-side; when the backend replies `goals_changed: true` the page refetches.
* **Goal Cards:** Category icon/accent (financial / habit / personal), status badge, animated progress bar, pace chip (expected % from elapsed time between `created_at`→`deadline` vs actual %: ahead / behind / on track), deadline countdown, and a milestones checklist rendered from the `plan` jsonb. Achieve / Delete act directly on Supabase.
* **Linked Live Progress:** Goals with `linked_metric` (`net_worth` / `bank_balance` / `portfolio_value`) compute progress from live feeds — the finance-page live-balance formula (`user_profiles.bank_balance` + `transactions` after `bank_balance_updated_at`) and the latest `advisor_portfolio_snapshots.total_value`. Unlinked goals track progress via the latest `goal_checkins.value`.
* **Habit Streaks:** Habit goals show a consecutive-day check-in streak (ending today/yesterday) and a "last check-in Xd ago" nudge.

## 3. Health OS (`/health/page.tsx`)
An autonomous health command center fetching from `workouts`, `meals`, and `health_metrics`.
* **System Banner:** A top-level HUD showing overall readiness across 4 pillars: CV (Cardiovascular), Sleep, Nutrition, and Recovery, utilizing `optimal`, `warning`, or `alert` color statuses.
* **Tab Ecosystem:**
  * **Cardio:** Maps `workouts` data. Shows `avgHR`, `duration`, and `distance_km`. Contains an interactive heart-rate zone distribution bar (Zones 1-5).
  * **Sleep:** Plots `health_metrics` data. Shows total sleep duration, sleep onset drift, and sleep phase breakdowns (Deep, REM, Light) using custom Recharts bar components.
  * **Fuel (Nutrition):** Maps `meals` data. Displays a 4-card grid for macros: Calories, Protein, Carbs, Fat. The layout responds to the global time filter (Day/Week/Month).
  * **Kinematic:** For strength/hypertrophy workouts. Shows sets, reps, load, and fatigue levels based on the `workout_templates` and `workouts` tables.

## 4. LangGraph Copilot
* **UI Implementation:** A persistent collapsible bar or bottom-sheet using `AnimatePresence`. 
* **State Management:** Manages an array of real-time server events (websocket/postgres_changes) rendered as a terminal-style stream of text (e.g., `[21:30:21] action_engine: Recalculating dynamic baseline...`).
* **Interaction:** Contains an input field (`"Ask: How has my sleep changed..."`) mapping directly to the Python backend API for complex RAG queries against the database.
