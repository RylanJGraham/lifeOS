"""
Pipeline service: lets the web UI trigger the data-ingest pipelines that
previously only ran via scheduled tasks or Telegram side effects.

Pipelines run in background daemon threads. State is kept in memory (the API
is a single-user, single-process service) and mirrored to system_logs via
SupabaseLogger so runs are also visible on the /system page.
"""
import asyncio
import logging
import os
import subprocess
import sys
import threading
import traceback
from datetime import datetime, timedelta

from utils.logger import SupabaseLogger
from utils.push_notifications import send_push

logger = logging.getLogger("pipeline_service")

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None  # type: ignore
    Client = None  # type: ignore

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000"


def _get_supabase() -> Client | None:
    if not create_client:
        return None
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        logger.warning(f"Could not create Supabase client: {e}")
        return None


def _insert_pipeline_run(pipeline_id: str, status: str, started_at: datetime, finished_at: datetime | None = None, error: str | None = None):
    sb = _get_supabase()
    if not sb:
        return
    duration_ms = None
    if finished_at and started_at:
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
    try:
        sb.table("pipeline_runs").insert({
            "pipeline_id": pipeline_id,
            "user_id": DEFAULT_USER_ID,
            "status": status,
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat() if finished_at else None,
            "duration_ms": duration_ms,
            "error": error,
            "metadata": {"source": "pipeline_service"},
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to insert pipeline_run: {e}")


def _write_heartbeat(worker_id: str, status: str, next_expected_at: datetime | None = None, error: str | None = None):
    sb = _get_supabase()
    if not sb:
        return
    now = datetime.utcnow()
    schedule = None
    if worker_id in PIPELINES:
        schedule = PIPELINES[worker_id].get("schedule")
    payload = {
        "worker_id": worker_id,
        "user_id": DEFAULT_USER_ID,
        "status": status,
        "last_run_at": now.isoformat(),
        "next_expected_at": next_expected_at.isoformat() if next_expected_at else None,
        "error": error,
        "metadata": {"source": "pipeline_service", "schedule": schedule},
        "updated_at": now.isoformat(),
    }
    try:
        # upsert on (worker_id, user_id)
        existing = sb.table("worker_heartbeats").select("id").eq("worker_id", worker_id).eq("user_id", DEFAULT_USER_ID).limit(1).execute()
        if existing.data:
            sb.table("worker_heartbeats").update(payload).eq("id", existing.data[0]["id"]).execute()
        else:
            payload["created_at"] = now.isoformat()
            sb.table("worker_heartbeats").insert(payload).execute()
    except Exception as e:
        logger.warning(f"Failed to write heartbeat for {worker_id}: {e}")


def _run_health_sync():
    from workers.sync_health import run_health_sync
    run_health_sync()


def _run_daily_analysis():
    from workers.daily_analyzer import run_daily_analysis
    run_daily_analysis()


def _run_investment_notifier():
    # The one-shot logic lives in the script's __main__ (NOTIFIER_MODE=once).
    env = dict(os.environ, NOTIFIER_MODE="once")
    subprocess.run(
        [sys.executable, os.path.join("workers", "investment_notifier.py")],
        cwd=SRC_DIR, env=env, check=True,
    )


def _run_morning_briefing():
    from workers.morning_briefing import main as run_morning_briefing
    run_morning_briefing()


def _run_ibkr_flex_sync():
    from workers.ibkr_flex_sync import run_sync
    run_sync()


def _run_evening_audit():
    from workers.evening_audit import main as run_evening_audit
    run_evening_audit()


def _run_goal_checkin_daily():
    from workers.goal_checkin import run as run_goal_checkin
    run_goal_checkin("daily")


def _run_goal_checkin_weekly():
    from workers.goal_checkin import run as run_goal_checkin
    run_goal_checkin("weekly")


def _run_fuel_pacing():
    from workers.fuel_pacing import main as run_fuel_pacing
    run_fuel_pacing()


def _run_persona_insights():
    from workers.persona_insights import run as run_persona_insights
    run_persona_insights("daily")


def _run_weekly_review():
    from workers.weekly_review import main as run_weekly_review
    run_weekly_review()


def _run_symptom_analysis():
    from workers.symptom_analysis import run as run_symptom_analysis
    run_symptom_analysis()


def _run_transaction_anomalies():
    from workers.transaction_anomalies import run as run_transaction_anomalies
    run_transaction_anomalies()


def _run_price_refresh():
    from workers.price_refresh import run as run_price_refresh
    run_price_refresh()


def _run_market_advisor():
    from workers.market_advisor import run as run_market_advisor
    run_market_advisor()


def _run_open_banking_sync():
    from workers.open_banking_sync import run_sync
    run_sync()


def _run_pdf_statement_sync():
    from finance.pdf_ingestion import PDFTransactionIngester
    ingester = PDFTransactionIngester()
    ingester.process_directory()


def _run_goal_metric_sync():
    from workers.goal_metric_sync import run_sync
    run_sync()


PIPELINES = {
    "health-sync": {
        "name": "Health Sync",
        "description": "Nightly aggregate of health metrics, meals, and workouts; writes a health summary to ai_insights.",
        "schedule": "Daily at 11:30 PM",
        "runner": _run_health_sync,
    },
    "daily-analysis": {
        "name": "Daily AI Analysis",
        "description": "Generate health/wealth insights with the OpenRouter cloud model.",
        "schedule": "Daily at 6:00 AM",
        "runner": _run_daily_analysis,
    },
    "investment-notifier": {
        "name": "Investment Notifier",
        "description": "Scan transactions for new investments and send a Telegram alert.",
        "schedule": "Daily at 9:00 AM",
        "runner": _run_investment_notifier,
    },
    "morning-briefing": {
        "name": "Morning Briefing",
        "description": "Generate and send the daily briefing to Telegram.",
        "schedule": "Daily at 7:00 AM",
        "runner": _run_morning_briefing,
    },
    "ibkr-flex-sync": {
        "name": "IBKR Flex Sync",
        "description": "Pull positions and trades from Interactive Brokers Flex Query into Supabase.",
        "schedule": "Mon–Fri at 3:00 PM",
        "runner": _run_ibkr_flex_sync,
    },
    "market-advisor": {
        "name": "Market Advisor",
        "description": "Revalue positions, grade past signals, and run the advisor swarm for BUY/SELL/HOLD signals, proposed orders, and the daily report. Replaces the removed Jarvis Advisor v3.",
        "schedule": "Mon–Fri at 3:30 PM",
        "runner": _run_market_advisor,
    },
    "evening-audit": {
        "name": "Evening Audit",
        "description": "Nightly nudge for missing meals/health/workout data.",
        "schedule": "Daily at 9:30 PM",
        "runner": _run_evening_audit,
    },
    "fuel-pacing": {
        "name": "Fuel Pacing",
        "description": "Midday protein/calorie pacing check and dinner suggestion.",
        "schedule": "Daily at 3:00 PM",
        "runner": _run_fuel_pacing,
    },
    "persona-insights": {
        "name": "Persona Insights",
        "description": "Doctor + nutritionist + PT daily insight evaluation.",
        "schedule": "Daily at 9:15 PM",
        "runner": _run_persona_insights,
    },
    "weekly-review": {
        "name": "Weekly Review",
        "description": "Sunday digest: body comp, cash runway, habit momentum, correlations.",
        "schedule": "Sunday at 10:00 AM",
        "runner": _run_weekly_review,
    },
    "symptom-analysis": {
        "name": "Symptom Analysis",
        "description": "Weekly statistical symptom correlation analysis.",
        "schedule": "Monday at 6:00 AM",
        "runner": _run_symptom_analysis,
    },
    "transaction-anomalies": {
        "name": "Transaction Anomalies",
        "description": "Scan recent transactions for duplicate charges, subscription price changes, and unusual amounts.",
        "schedule": "Sunday at 10:30 AM",
        "runner": _run_transaction_anomalies,
    },
    "price-refresh": {
        "name": "Price Refresh",
        "description": "Refresh stale advisor position prices via Finnhub fallback.",
        "schedule": "Daily at 10:00 AM",
        "runner": _run_price_refresh,
    },
    "open-banking-sync": {
        "name": "EU Open Banking Sync",
        "description": "Scaffold for GoCardless/Salt Edge/Plaid EU transaction pulls (requires credentials).",
        "schedule": "Sunday at 10:45 AM",
        "runner": _run_open_banking_sync,
    },
    "pdf-statement-sync": {
        "name": "PDF Statement Sync",
        "description": "Parse bank/CC PDFs from STATEMENT_DIRECTORY and insert transactions.",
        "schedule": "Daily at 8:00 AM",
        "runner": _run_pdf_statement_sync,
    },
    "goal-checkin-daily": {
        "name": "Goal Check-in (Daily)",
        "description": "Send daily habit goal check-in questions via Telegram.",
        "schedule": "Daily at 8:00 PM",
        "runner": _run_goal_checkin_daily,
    },
    "goal-checkin-weekly": {
        "name": "Goal Check-in (Weekly)",
        "description": "Send weekly financial goal progress / green-light updates via Telegram.",
        "schedule": "Sunday at 10:00 AM",
        "runner": _run_goal_checkin_weekly,
    },
    "goal-metric-sync": {
        "name": "Goal Metric Sync",
        "description": "Update active financial goals' current_value from bank_balance, net_worth, or portfolio_value.",
        "schedule": "Daily at 8:30 AM",
        "runner": _run_goal_metric_sync,
    },
}

_state_lock = threading.Lock()
_state = {
    pid: {"status": "idle", "last_started_at": None, "last_finished_at": None, "last_error": None}
    for pid in PIPELINES
}


def list_pipelines() -> list:
    with _state_lock:
        snapshot = {pid: dict(s) for pid, s in _state.items()}
    return [
        {
            "id": pid,
            "name": p["name"],
            "description": p["description"],
            "schedule": p.get("schedule"),
            **snapshot[pid],
        }
        for pid, p in PIPELINES.items()
    ]


def run_pipeline(pipeline_id: str) -> None:
    """Start a pipeline in a background thread.

    Raises KeyError for unknown ids and RuntimeError if already running.
    """
    if pipeline_id not in PIPELINES:
        raise KeyError(pipeline_id)

    with _state_lock:
        if _state[pipeline_id]["status"] == "running":
            raise RuntimeError(f"Pipeline '{pipeline_id}' is already running.")
        _state[pipeline_id].update(
            status="running",
            last_started_at=datetime.utcnow().isoformat() + "Z",
            last_error=None,
        )

    thread = threading.Thread(target=_execute, args=(pipeline_id,), daemon=True)
    thread.start()


def _execute(pipeline_id: str) -> None:
    name = PIPELINES[pipeline_id]["name"]
    runner = PIPELINES[pipeline_id]["runner"]
    started_at = datetime.utcnow()
    SupabaseLogger.info("pipelines", f"Pipeline started: {name}", {"pipeline_id": pipeline_id})
    _insert_pipeline_run(pipeline_id, "running", started_at)
    error = None
    try:
        runner()
    except Exception as e:
        error = f"{e}"
        SupabaseLogger.error(
            "pipelines", f"Pipeline failed: {name}",
            {"pipeline_id": pipeline_id, "error": error, "traceback": traceback.format_exc()[-2000:]},
        )
        send_push(f"{name} failed", error[:200], {"pipeline_id": pipeline_id})
    finally:
        finished_at = datetime.utcnow()
        with _state_lock:
            _state[pipeline_id].update(
                status="idle",
                last_finished_at=finished_at.isoformat() + "Z",
                last_error=error,
            )
        _insert_pipeline_run(pipeline_id, "failed" if error else "success", started_at, finished_at, error)
        # Heartbeat: most pipelines are expected to run daily
        next_expected = finished_at + timedelta(days=1)
        _write_heartbeat(pipeline_id, "failed" if error else "ok", next_expected, error)
    if error is None:
        SupabaseLogger.info("pipelines", f"Pipeline finished: {name}", {"pipeline_id": pipeline_id})


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run a LifeOS pipeline from the command line")
    parser.add_argument("command", choices=["run"], help="Command to execute")
    parser.add_argument("pipeline_id", help="Pipeline ID from PIPELINES")
    args = parser.parse_args()
    if args.command == "run":
        if args.pipeline_id not in PIPELINES:
            print(f"Unknown pipeline: {args.pipeline_id}", file=sys.stderr)
            print(f"Available: {', '.join(PIPELINES.keys())}", file=sys.stderr)
            sys.exit(1)
        run_pipeline(args.pipeline_id)
        # run_pipeline starts a daemon thread; wait for it to finish
        import time
        while True:
            with _state_lock:
                status = _state[args.pipeline_id]["status"]
            if status != "running":
                break
            time.sleep(0.5)
        with _state_lock:
            final = _state[args.pipeline_id]
        if final.get("last_error"):
            print(f"Pipeline failed: {final['last_error']}", file=sys.stderr)
            sys.exit(1)
        print(f"Pipeline {args.pipeline_id} completed successfully.")
