import schedule
import time
import logging
from daily_analyzer import run_daily_analysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scheduler")

def job():
    logger.info("Scheduler triggering Daily Analyzer...")
    run_daily_analysis()

# Schedule the job every 4 hours
schedule.every(4).hours.do(job)

logger.info("LangGraph 4-Hour Scheduler is running...")
logger.info("Initial run starting now...")
job() # Run immediately on startup

while True:
    schedule.run_pending()
    time.sleep(60) # Wait one minute
