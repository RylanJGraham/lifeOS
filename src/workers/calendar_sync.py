"""Refresh every imported calendar (Outlook/Google/Apple published links).

Runs every 30 minutes (cron / Task Scheduler call this script directly, like
calendar_reminders). Also registered as the `calendar-sync` pipeline so it can
be triggered from the dashboard.
"""
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

import calendar_import  # noqa: E402

logger = logging.getLogger("calendar_sync")


def run() -> int:
    n = calendar_import.sync_all()
    logger.info(f"Calendar subscriptions synced: {n}")
    return n


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
