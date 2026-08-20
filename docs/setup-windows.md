# Windows Setup Guide

This document provides exact PowerShell commands to configure your Windows PC for Life-OS.

## 1. Install Dependencies (Winget)

Run PowerShell as Administrator:

```powershell
# Install Python, Docker Desktop, and Node.js
winget install Python.Python.3.11
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS.LTS

# Install Ngrok and Tailscale
winget install ngrok.ngrok
winget install tailscale.tailscale
```

## 2. Configure Windows Power Settings (Wake Timers)

To ensure the morning briefing cron job (and health sync) run while your PC is asleep, enable wake timers:

```powershell
# Enable wake timers for the current active power scheme
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /SETACTIVE SCHEME_CURRENT
```

## 3. Network Setup

### Tailscale (Private Dashboard Access)
```powershell
tailscale up
# Authenticate in the browser that opens.
# Ensure Tailscale is set to auto-start in its settings.
```

### Ngrok (Public Webhook)
```powershell
# Authenticate (get your token from dashboard.ngrok.com)
ngrok config add-authtoken <your-auth-token>

# Start tunnel with your free static domain
# Example: ngrok http --domain=your-static-domain.ngrok-free.app 8000
#
# For always-on operation, ngrok runs as a Windows service (see section 5 below).
```

## 5. Always-On Services (NSSM)

The backend (ngrok tunnel, FastAPI, Next.js frontend) runs as Windows services via [NSSM](https://nssm.cc), so everything starts automatically at boot and restarts on failure.

Install NSSM first:

```powershell
winget install nssm
# or: choco install nssm
# or: download the zip from https://nssm.cc and put nssm.exe on your PATH
```

Then run the installer **elevated** (PowerShell as Administrator) from anywhere:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_services.ps1
```

This registers three auto-start services:

- `LifeOS-Ngrok` — ngrok tunnel using `NGROK_DOMAIN` from `.env`
- `LifeOS-API` — `uvicorn api:app` on `127.0.0.1:8000` (depends on `LifeOS-Ngrok`, since the API self-registers the Telegram webhook at boot)
- `LifeOS-Frontend` — `npm start` in `frontend/` (requires `npm run build` to have been run first)

It also registers the `LifeOS-Watchdog` scheduled task, which runs every 5 minutes as SYSTEM and restarts `LifeOS-API` if `http://localhost:8000/status` fails or `LifeOS-Ngrok` if it is not running.

Logs are written to `logs\` in the repo root: `ngrok.*.log`, `api.*.log`, `frontend.*.log`, and `watchdog.log`.

Check status:

```powershell
nssm status LifeOS-API
curl http://localhost:8000/status
```

Uninstall:

```powershell
nssm remove LifeOS-Ngrok confirm
nssm remove LifeOS-API confirm
nssm remove LifeOS-Frontend confirm
Unregister-ScheduledTask -TaskName "LifeOS-Watchdog" -Confirm:$false
```

## 4. Install Life-OS Service

We use a helper script to schedule the jobs and ensure the network is up before starting. Run the following from the `LifeOS` project root:

```powershell
# Run the installation script
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

This will:
- Check that `ollama pull` succeeded.
- Create the Windows Scheduled Tasks for morning briefings and health sync via `windows_tasks.ps1`.
- Ensure everything runs smoothly after reboot.
