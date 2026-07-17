Investment Notifier
-------------------

Purpose
 - Detect investment-related transactions in `transactions` and notify via Telegram.

Setup
1. Apply the DB migration: run `docs/supabase-migrations/001-add-investment-flags.sql` in your Supabase SQL editor.
2. Ensure these env vars are set (in `.env` or environment):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID` (chat ID to send messages to)

Run
 - To run continuously (recommended under a process manager):
```bash
python src/workers/investment_notifier.py
```

 - To run once (for cron):
```bash
NOTIFIER_MODE=once python src/workers/investment_notifier.py
```

Behavior
 - Polls `transactions` where `notified = false` and applies basic heuristics to detect investment purchases.
 - Sends a Telegram message with date, merchant, amount and inferred ticker (if any).
 - Marks the transaction `notified = true` when message is successfully sent.

Customization
 - Tweak `looks_like_investment()` in `src/workers/investment_notifier.py` to add brokers, patterns or stricter rules.
 - Add additional actions (create/update `portfolio_holdings`) when purchases are detected.
