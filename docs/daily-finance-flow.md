# Daily Finance Flow

This is the end-to-end daily flow between IBKR, LifeOS, the in-house market advisor, and the LifeOS dashboard.

**Jarvis Advisor v3 (external) has been removed.** `src/workers/market_advisor.py` now owns the role this doc used to describe for Jarvis — see `docs/jarvis-v3-supabase-positions-sync.md` for the historical contract it was built against, and `docs/architecture.md` §3.3 for the full design.

## Schedule

| Time (CET) | System | Action |
|---|---|---|
| **15:00** | LifeOS (`ibkr-flex-sync` pipeline) | Pulls positions/trades from IBKR into Supabase `advisor_positions` and `advisor_purchases`. |
| **15:30** | LifeOS (`market-advisor` pipeline) | Revalues positions (Finnhub), grades signals from ≥5 days ago into `advisor_signal_performance`, runs a 4-persona LLM swarm, writes signals/snapshots/position history/report, and surfaces actionable signals as proposed `advisor_orders`. |
| **15:35** | LifeOS dashboard | Refreshes to show real positions, advisor signals, proposed orders, and the daily report. |
| Anytime | User | Texts a trade to Telegram / uses the Log Trade modal → LifeOS updates `advisor_positions` and `advisor_purchases`. |
| Next weekday | `market_advisor.py` | Picks up the manual position changes and continues analysis on the real book. |
| Sunday | `market_advisor.py` | Also runs an extra "Scout" persona proposing 1-5 new watchlist candidates. |

## How the data flows

```
IBKR ──► LifeOS ibkr_flex_sync ──► Supabase advisor_positions
                                          ▲
                                          │ (manual trades)
User ──► Telegram / Web / UI ──────────────┘
                                          │
                                          ▼
                              market_advisor.py daily run
                                          │
                                          ▼
       Supabase advisor_signals, advisor_portfolio_snapshots,
      advisor_position_history, advisor_daily_reports, advisor_orders,
                    advisor_signal_performance
                                          │
                                          ▼
                                   LifeOS dashboard
```

## What each system owns

| System | Owns |
|---|---|
| **IBKR** | Truth for cash, actual positions, executed fills. |
| **LifeOS** | Manual trade logging, IBKR sync, dashboard, order workflow, risk/P&L. |
| **`market_advisor.py`** | Market analysis swarm, signals, proposed orders (never executed), snapshots, reports, signal-performance learning loop. |
| **Supabase** | Single source of truth for `advisor_positions`. |

## Windows scheduled tasks

Created by `scripts/windows_tasks.ps1`:

```powershell
LifeOS-IBKRFlexSync
  Run: Mon–Fri at 3:00 PM
  Command: venv python src/workers/ibkr_flex_sync.py

LifeOS-MarketAdvisor
  Run: Mon–Fri at 3:30 PM
  Command: venv python src/workers/market_advisor.py
```

If your local timezone is not CET, adjust both times proportionally so the advisor still runs after the IBKR sync.

## Troubleshooting

### IBKR sync returns 0 positions
- Check that the Flex Query token is still valid (tokens expire ~180 days).
- Verify the query has **Open Positions** section selected.
- Run `python src/workers/ibkr_flex_sync.py` manually and inspect the debug XML tags.

### Market advisor produces no signals
- Confirm `OPENROUTER_API_KEY` is set.
- Check there are open positions and/or active watchlist rows to evaluate.
- Run `python src/workers/market_advisor.py` manually and check the log output.

### Dashboard shows stale positions
- Run the IBKR sync pipeline from `/system` or the scheduled task.
- Wait for the next market advisor run, or trigger `market-advisor` manually from `/system`.
