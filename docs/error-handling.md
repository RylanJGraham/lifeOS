# Error Handling & Recovery Strategies

This document defines how to recover from the most common failure modes in Life-OS.

## 1. Webhook Unreachable / Tunnel Down
**Symptom:** Telegram bot stops responding, `/status` is dead.
**Cause:** Ngrok tunnel crashed or PC is fully powered off/no network.
**Recovery:**
1. Check if the PC is awake.
2. Run `Get-Process ngrok` in PowerShell. If stopped, start the ngrok service.
3. Check Tailscale connectivity: `tailscale ping <your-ip>`.
4. If network is completely down, Life-OS queues requests (handled locally once network is restored, though Telegram will timeout after 3 retries).

## 2. LLM / Ollama Timeout
**Symptom:** Operations requiring local LLM inference fail with 500 errors.
**Cause:** Ollama service crashed, out of VRAM, or model not pulled.
**Recovery:**
1. `Invoke-WebRequest http://localhost:11434/api/tags` to check if Ollama is running.
2. Run `Restart-Service ollama` (if installed as a service) or restart the Ollama app.
3. If memory errors occur, ensure Docker and other heavy apps are closed, or configure Ollama to use CPU fallback (slower).

## 3. PostgreSQL / pgvector Connection Refused
**Symptom:** Memory storage fails, dashboard shows no data.
**Cause:** Supabase cloud connection lost, or local Docker pgvector container crashed.
**Recovery:**
1. If using Supabase Cloud: Check your internet connection and Supabase dashboard.
2. If using local Docker: `docker-compose ps` to check status.
3. `docker-compose restart db`.

## 4. Morning Briefing Never Arrives
**Symptom:** It's 7:15 AM and no Telegram message arrived.
**Cause:** PC failed to wake from sleep, or Task Scheduler job failed.
**Recovery:**
1. Open Windows Task Scheduler. Find the `LifeOS-MorningBriefing` task.
2. Check the "Last Run Result". A code like `0x1` indicates a crash in the script.
3. Verify `powercfg -waketimers` shows the scheduled event. Ensure BIOS allows OS wake timers.

## 5. Corrupted Python Environment
**Symptom:** `ModuleNotFoundError` on startup.
**Cause:** Dependencies updated or `pip` broke.
**Recovery:**
```powershell
Remove-Item -Recurse -Force venv
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
