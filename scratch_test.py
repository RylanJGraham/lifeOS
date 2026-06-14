import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
res = requests.get(f"{os.getenv('SUPABASE_URL')}/rest/v1/system_logs", headers={'apikey': os.getenv('SUPABASE_SERVICE_ROLE_KEY'), 'Authorization': f"Bearer {os.getenv('SUPABASE_SERVICE_ROLE_KEY')}"})
print(res.status_code, res.text)
