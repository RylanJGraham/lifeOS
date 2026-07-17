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
A comprehensive financial dashboard mapping to the `transactions` and `advisor_positions` database tables.
* **Top Navigation:** 
  * Features a "Live" pulsating badge.
  * Time filters (`Day, Week, Month, Quarter, Year`) built as active toggle buttons that globally filter data states using date boundary calculations.
* **Tab Ecosystem:**
  * **Capital Outflow:** Renders a gradient Area Chart showing net spending over time. Below the chart, it renders a dense `TransactionsTable` component containing 100+ rows of raw categorized bank expenses, featuring badge-colored categories and confidence scores.
  * **Net Worth:** Visualizes aggregate historical asset growth using a stacked or area chart.
  * **Financials:** The primary investment hub. Displays active stock/crypto positions in a detailed grid. Calculates Unrealized and Realized PnL locally in React, and maps to the `advisor_positions` table. Includes micro-sparklines or localized price charts.
  * **Cash Flow:** Uses compound bar charts (Income vs Expenses) allowing the user to see exactly where cash is moving. Highlights the "Highest Category" (e.g., 'Housing & Utilities') and renders an AI anomaly detection card using a glassmorphic tooltip.
  * **Trends:** Provides mathematical linear regression or runway forecasts based on past spending velocity.

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
