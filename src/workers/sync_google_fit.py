import os
import json
import logging
from datetime import datetime, timedelta
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_google_fit")

# Scopes needed for Google Fit
SCOPES = [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
    'https://www.googleapis.com/auth/fitness.body.read'
]

TOKEN_FILE = os.path.join(os.path.dirname(__file__), 'google_fit_token.json')

def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r') as token:
            creds_data = json.load(token)
            creds = Credentials.from_authorized_user_info(creds_data, SCOPES)
            
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            client_id = os.getenv("GOOGLE_FIT_CLIENT_ID")
            client_secret = os.getenv("GOOGLE_FIT_CLIENT_SECRET")
            
            if not client_id or not client_secret:
                logger.error("Missing GOOGLE_FIT_CLIENT_ID or GOOGLE_FIT_CLIENT_SECRET in .env")
                return None
                
            client_config = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost:8080/"]
                }
            }
            
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=8080)
            
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
            
    return creds

def sync_data():
    load_dotenv()
    creds = get_credentials()
    if not creds:
        return
        
    service = build('fitness', 'v1', credentials=creds)
    
    # Let's get data for the last 24 hours
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    
    start_time_ms = int(yesterday.timestamp() * 1000)
    end_time_ms = int(now.timestamp() * 1000)
    
    logger.info("Successfully connected to Google Fit!")
    logger.info("Fetching steps...")
    
    # Example: Fetching steps
    try:
        data_source = "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
        dataset = f"{start_time_ms}000000-{end_time_ms}000000"
        
        response = service.users().dataSources().datasets().get(
            userId='me',
            dataSourceId=data_source,
            datasetId=dataset
        ).execute()
        
        total_steps = 0
        for point in response.get('point', []):
            for value in point.get('value', []):
                total_steps += value.get('intVal', 0)
                
        logger.info(f"Total steps in the last 24 hours: {total_steps}")
        
    except Exception as e:
        logger.error(f"Failed to fetch steps: {e}")

if __name__ == "__main__":
    sync_data()
