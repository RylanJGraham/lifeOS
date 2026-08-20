# stop_services.ps1
# MUST be run elevated (Run PowerShell as Administrator).
# Stops LifeOS services and disables the watchdog task so they don't restart.

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> 'Run as administrator', then re-run this script."
    exit 1
}

Write-Host "Disabling Watchdog task..."
Disable-ScheduledTask -TaskName "LifeOS-Watchdog" -ErrorAction SilentlyContinue | Out-Null

Write-Host "Stopping Life-OS services..."
# Stop the services
& nssm stop LifeOS-API
& nssm stop LifeOS-Frontend
& nssm stop LifeOS-Ngrok

# Optional: To prevent them from starting automatically on next PC reboot, you can uncomment these lines:
# & nssm set LifeOS-API Start SERVICE_DEMAND_START
# & nssm set LifeOS-Frontend Start SERVICE_DEMAND_START
# & nssm set LifeOS-Ngrok Start SERVICE_DEMAND_START

Write-Host "Life-OS services have been stopped and the watchdog is disabled." -ForegroundColor Green
