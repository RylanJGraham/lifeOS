# resume_services.ps1
# MUST be run elevated (Run PowerShell as Administrator).
# Starts LifeOS services and re-enables the watchdog task.

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> 'Run as administrator', then re-run this script."
    exit 1
}

# If they were set to manual, make sure they are auto again
# & nssm set LifeOS-API Start SERVICE_AUTO_START
# & nssm set LifeOS-Frontend Start SERVICE_AUTO_START
# & nssm set LifeOS-Ngrok Start SERVICE_AUTO_START

Write-Host "Starting Life-OS services..."
& nssm start LifeOS-Ngrok
& nssm start LifeOS-API
& nssm start LifeOS-Frontend

Write-Host "Enabling Watchdog task..."
Enable-ScheduledTask -TaskName "LifeOS-Watchdog" -ErrorAction SilentlyContinue | Out-Null

Write-Host "Life-OS services have been started and the watchdog is enabled." -ForegroundColor Green
