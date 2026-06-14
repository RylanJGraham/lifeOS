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
# Note: For production, we will configure this as a Windows service using NSSM or similar.
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
