import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

# Let's inspect health_metrics
try:
    health = supabase.table("health_metrics").select("*").limit(5).execute()
    print("=== health_metrics ===")
    print(json.dumps(health.data, indent=2))
except Exception as e:
    print(f"Error fetching health_metrics: {e}")

# Inspect advisor_positions
try:
    positions = supabase.table("advisor_positions").select("*").limit(5).execute()
    print("\n=== advisor_positions ===")
    print(json.dumps(positions.data, indent=2))
except Exception as e:
    print(f"Error fetching advisor_positions: {e}")

# Inspect system_logs
try:
    logs = supabase.table("system_logs").select("*").limit(5).execute()
    print("\n=== system_logs ===")
    print(json.dumps(logs.data, indent=2))
except Exception as e:
    print(f"Error fetching system_logs: {e}")

# Inspect advisor_portfolio_snapshots
try:
    snapshots = supabase.table("advisor_portfolio_snapshots").select("*").limit(5).execute()
    print("\n=== advisor_portfolio_snapshots ===")
    print(json.dumps(snapshots.data, indent=2))
except Exception as e:
    print(f"Error fetching advisor_portfolio_snapshots: {e}")
