import os
import subprocess
import json
import logging
from datetime import datetime
import httpx
from dotenv import load_dotenv
import sys
import os

# Add parent directory to path so we can import utils
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.logger import SupabaseLogger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_xiaomi")

# Directory where SmartScaleConnect will be cloned
LIB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "lib")
REPO_URL = "https://github.com/AlexxIT/SmartScaleConnect"
REPO_DIR = os.path.join(LIB_DIR, "SmartScaleConnect")

def ensure_repo_exists():
    os.makedirs(LIB_DIR, exist_ok=True)
    if not os.path.exists(REPO_DIR):
        logger.info(f"Cloning SmartScaleConnect into {REPO_DIR}...")
        subprocess.run(["git", "clone", REPO_URL, REPO_DIR], check=True)
        logger.info("Compile the Go binary instead of pip install")
        subprocess.run(["go", "build", "-o", "scaleconnect.exe"], cwd=REPO_DIR, check=True)

def run_sync():
    load_dotenv()
    email = os.getenv("XIAOMI_EMAIL")
    password = os.getenv("XIAOMI_PASSWORD")
    region = os.getenv("XIAOMI_REGION", "eu")

    if not email or not password:
        logger.error("Missing XIAOMI_EMAIL or XIAOMI_PASSWORD in .env. Skipping sync.")
        return

    output_file = os.path.join(REPO_DIR, "your_sleep_data.json").replace("\\", "/")

    # Command: python -m smartscaleconnect sync_mifitness: from: mifitness email    # Execute scaleconnect
    # JSON config for CLI (using relative path to avoid Windows drive letter colon being parsed as a URL schema by Go)
    config_json = f'{{"sync_mifitness": {{"from": "mifitness {email} {password} {region}", "to": "json your_sleep_data.json"}}}}'
    cmd = [
        "go", "run", "main.go",
        "-c", config_json
    ]

    logger.info(f"[{datetime.now()}] Running Mi Fitness sync...")
    SupabaseLogger.info("sync_xiaomi", "Starting Mi Fitness sync process.")
    try:
        subprocess.run(cmd, cwd=REPO_DIR, check=True)
        logger.info("Sync command completed successfully.")
    except subprocess.CalledProcessError as e:
        logger.error(f"Sync command failed: {e}")
        SupabaseLogger.error("sync_xiaomi", f"Subprocess sync failed: {e}")
        return

    # Check if output file was created
    if not os.path.exists(output_file):
        logger.error(f"Output file {output_file} not found after sync.")
        SupabaseLogger.error("sync_xiaomi", "JSON output file missing after sync.")
        return

    # Parse and POST
    try:
        with open(output_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        logger.info(f"Parsed {len(data)} records from JSON. Posting to API...")
        
        # We can directly post to our own endpoint
        # In a real environment, we'd want to handle auth/tokens here if the endpoint was secured.
        response = httpx.post("http://localhost:8000/api/sleep", json=data, timeout=10.0)
        
        if response.status_code == 200:
            logger.info("Successfully posted data to /api/sleep.")
            SupabaseLogger.info("sync_xiaomi", f"Successfully synced {len(data)} sleep records.")
        else:
            logger.error(f"Failed to post to API. Status: {response.status_code}, Response: {response.text}")
            SupabaseLogger.error("sync_xiaomi", f"API Post failed: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error reading or posting data: {e}")
        SupabaseLogger.error("sync_xiaomi", f"Exception during data parsing/posting: {e}")

if __name__ == "__main__":
    ensure_repo_exists()
    run_sync()
