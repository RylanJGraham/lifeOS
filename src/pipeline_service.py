"""
Pipeline service: lets the web UI trigger the data-ingest pipelines that
previously only ran via scheduled tasks or Telegram side effects.

Pipelines run in background daemon threads. State is kept in memory (the API
is a single-user, single-process service) and mirrored to system_logs via
SupabaseLogger so runs are also visible on the /system page.
"""
import asyncio
import os
import subprocess
import sys
import threading
import traceback
from datetime import datetime

from utils.logger import SupabaseLogger

SRC_DIR = os.path.dirname(os.path.abspath(__file__))


def _run_strava():
    from workers.sync_strava import sync_strava_activities
    sync_strava_activities()


def _run_xiaomi_sleep():
    from workers.sync_xiaomi import ensure_repo_exists, run_sync
    ensure_repo_exists()
    run_sync()


def _run_mifitness_workouts():
    from workers.sync_mifitness import sync_mifitness_activities
    sync_mifitness_activities(days=30)


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
    from workers.morning_briefing import generate_and_send_briefing
    asyncio.run(generate_and_send_briefing())


PIPELINES = {
    "strava-sync": {
        "name": "Strava Sync",
        "description": "Pull recent activities from Strava into the workouts table.",
        "runner": _run_strava,
    },
    "xiaomi-sleep-sync": {
        "name": "Xiaomi Sleep Sync",
        "description": "Sync sleep records from Mi Fitness via SmartScaleConnect.",
        "runner": _run_xiaomi_sleep,
    },
    "mifitness-sync": {
        "name": "Mi Fitness Workout Sync",
        "description": "Pull workouts (HR, calories, duration) from your Xiaomi watch via Mi Fitness cloud.",
        "runner": _run_mifitness_workouts,
    },
    "health-sync": {
        "name": "Health Sync",
        "description": "Nightly aggregate of health metrics (partially stubbed).",
        "runner": _run_health_sync,
    },
    "daily-analysis": {
        "name": "Daily AI Analysis",
        "description": "Generate health/wealth insights with the local Ollama model.",
        "runner": _run_daily_analysis,
    },
    "investment-notifier": {
        "name": "Investment Notifier",
        "description": "Scan transactions for new investments and send a Telegram alert.",
        "runner": _run_investment_notifier,
    },
    "morning-briefing": {
        "name": "Morning Briefing",
        "description": "Generate and send the daily briefing to Telegram.",
        "runner": _run_morning_briefing,
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
    SupabaseLogger.info("pipelines", f"Pipeline started: {name}", {"pipeline_id": pipeline_id})
    error = None
    try:
        runner()
    except Exception as e:
        error = f"{e}"
        SupabaseLogger.error(
            "pipelines", f"Pipeline failed: {name}",
            {"pipeline_id": pipeline_id, "error": error, "traceback": traceback.format_exc()[-2000:]},
        )
    finally:
        with _state_lock:
            _state[pipeline_id].update(
                status="idle",
                last_finished_at=datetime.utcnow().isoformat() + "Z",
                last_error=error,
            )
    if error is None:
        SupabaseLogger.info("pipelines", f"Pipeline finished: {name}", {"pipeline_id": pipeline_id})
