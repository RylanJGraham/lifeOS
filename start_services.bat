@echo off
echo ==========================================
echo Starting Life-OS Services...
echo ==========================================

echo [1/2] Starting Ngrok tunnel in a new window...
start "Ngrok Tunnel" ngrok http --domain=fraternal-encrust-decline.ngrok-free.dev 8000

echo [2/2] Starting FastAPI Backend...
cd src
..\venv\Scripts\python -m uvicorn api:app --port 8000 --reload
