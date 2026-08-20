# watchdog.ps1 — Health-check the Life-OS services; restart them if down.
# Runs silently every 5 minutes via the LifeOS-Watchdog scheduled task (SYSTEM).

$root   = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $root "logs"
$logFile = Join-Path $logDir "watchdog.log"

function Write-WatchdogLog([string]$message) {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "$timestamp $message"
}

# --- Check the API ---
$apiOk = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/status" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) { $apiOk = $true }
} catch {
    $apiOk = $false
}

if (-not $apiOk) {
    Write-WatchdogLog "API health check failed; restarting LifeOS-API."
    & nssm restart LifeOS-API | Out-Null
}

# --- Check the ngrok tunnel service ---
$ngrokStatus = (& nssm status LifeOS-Ngrok) | Out-String
if ($ngrokStatus.Trim() -ne "SERVICE_RUNNING") {
    Write-WatchdogLog "LifeOS-Ngrok status is '$($ngrokStatus.Trim())'; restarting."
    & nssm restart LifeOS-Ngrok | Out-Null
}
