# Daily Finance Flow

This is the end-to-end daily flow between IBKR, LifeOS, Jarvis v3, and the LifeOS dashboard.

## Schedule

| Time (CET) | System | Action |
|---|---|---|
| **15:00** | LifeOS (Windows) | `LifeOS-IBKRFlexSync` pulls positions/trades from IBKR into Supabase `advisor_positions` and `advisor_purchases`. |
| **15:30** | Jarvis v3 (Linux) | Reads `advisor_positions` from Supabase, fetches live prices, runs swarm intelligence, writes signals/snapshots/reports/orders. |
| **15:35** | LifeOS dashboard | Refreshes to show real positions, advisor signals, proposed orders, and daily report. |
| Anytime | User | Texts a trade to Telegram / uses Log Trade modal → LifeOS updates `advisor_positions` and `advisor_purchases`. |
| Next day | Jarvis v3 | Picks up the manual position changes and continues research on the real book. |

## How the data flows

```
IBKR ──► LifeOS ibkr_flex_sync ──► Supabase advisor_positions
                                          ▲
                                          │ (manual trades)
User ──► Telegram / Web / UI ──────────────┘
                                          │
                                          ▼
                                   Jarvis v3 daily run
                                          │
                                          ▼
       Supabase advisor_signals, advisor_portfolio_snapshots,
              advisor_daily_reports, advisor_orders
                                          │
                                          ▼
                                   LifeOS dashboard
```

## What each system owns

| System | Owns |
|---|---|
| **IBKR** | Truth for cash, actual positions, executed fills. |
| **LifeOS** | Manual trade logging, IBKR sync, dashboard, order workflow, risk/P&L. |
| **Jarvis v3** | Market research, swarm signals, order recommendations, snapshots, reports. |
| **Supabase** | Single source of truth for `advisor_positions`. |

## Windows scheduled task

Created by `scripts/windows_tasks.ps1`:

```powershell
LifeOS-IBKRFlexSync
  Run: Mon–Fri at 3:00 PM
  Command: venv python src/workers/ibkr_flex_sync.py
```

If your local timezone is not CET, adjust the time so it runs before Jarvis (15:30 CET). To change the time later:

```powershell
Set-ScheduledTask -TaskName "LifeOS-IBKRFlexSync" -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 2:30PM)
```

## Jarvis v3 dependency

Jarvis must be patched to read `advisor_positions` from Supabase instead of only `config/user_config.json`. The patch is documented in `docs/jarvis-v3-supabase-positions-sync.md`. Once patched, Jarvis will:

1. Load positions from Supabase.
2. Revalue with live prices.
3. Generate signals, snapshots, reports, and orders.
4. Write everything back to Supabase.
5. Preserve `source = 'manual'` for any rows created by LifeOS.

## Troubleshooting

### IBKR sync returns 0 positions
- Check that the Flex Query token is still valid (tokens expire ~180 days).
- Verify the query has **Open Positions** section selected.
- Run `python src/workers/ibkr_flex_sync.py` manually and inspect the debug XML tags.

### Jarvis does not see manual trades
- Confirm the Jarvis patch is applied.
- Check that `advisor_positions` rows have `source = 'manual'`.
- Verify Jarvis logs show it loaded positions from Supabase.

### Dashboard shows stale positions
- Run the IBKR sync pipeline from `/system` or the scheduled task.
- Wait for the next Jarvis run, or trigger it manually.
