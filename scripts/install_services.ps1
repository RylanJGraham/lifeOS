# install_services.ps1 — Register Life-OS backend as always-on Windows services via NSSM.
# MUST be run elevated (Run PowerShell as Administrator).
# Registers: LifeOS-Ngrok, LifeOS-API, LifeOS-Frontend + LifeOS-Watchdog scheduled task.

$ErrorActionPreference = "Stop"

# --- 0. Admin check ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> 'Run as administrator', then re-run this script."
    exit 1
}

# --- 1. NSSM pre-check ---
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: nssm not found on PATH." -ForegroundColor Red
    Write-Host "Install it with one of:"
    Write-Host "  winget install nssm"
    Write-Host "  choco install nssm"
    Write-Host "  or download the zip from https://nssm.cc and put nssm.exe on your PATH."
    exit 1
}

# --- 2. Resolve and validate paths ---
$root        = Split-Path $PSScriptRoot -Parent
$venvPython  = Join-Path $root "venv\Scripts\python.exe"
$srcDir      = Join-Path $root "src"
$frontendDir = Join-Path $root "frontend"
$logsDir     = Join-Path $root "logs"

foreach ($p in @($venvPython, $srcDir, $frontendDir)) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: Required path not found: $p" -ForegroundColor Red
        exit 1
    }
}

# --- 3. Read NGROK_DOMAIN / NGROK_AUTHTOKEN from .env (same parsing as start_with_network.ps1) ---
$envFile = Join-Path $root ".env"
$ngrokDomain = $null
$ngrokAuthtoken = $null
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match "^[^#\s]+=" } | ForEach-Object {
        $parts = $_.Split('=', 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($value -like '"*"') { $value = $value.Substring(1, $value.Length - 2) }
        elseif ($value -like "'*'") { $value = $value.Substring(1, $value.Length - 2) }
        if ($name -eq "NGROK_DOMAIN") { $ngrokDomain = $value }
        if ($name -eq "NGROK_AUTHTOKEN") { $ngrokAuthtoken = $value }
    }
}
if (-not $ngrokDomain) {
    Write-Host "ERROR: NGROK_DOMAIN not set in $envFile" -ForegroundColor Red
    exit 1
}

# Locate ngrok.exe
$ngrokExe = $null
if (Get-Command ngrok -ErrorAction SilentlyContinue) {
    $ngrokExe = (Get-Command ngrok).Source
} else {
    $found = & where.exe ngrok 2>$null
    if ($LASTEXITCODE -eq 0 -and $found) { $ngrokExe = ($found | Select-Object -First 1) }
}
if (-not $ngrokExe) {
    Write-Host "ERROR: ngrok.exe not found on PATH." -ForegroundColor Red
    Write-Host "Install with: winget install ngrok.ngrok"
    exit 1
}

# Locate npm.cmd (full path) for the frontend service
$npmCmd = $null
if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    $npmCmd = (Get-Command npm.cmd).Source
} elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmCmd = (Get-Command npm).Source
}
if (-not $npmCmd) {
    Write-Host "ERROR: npm.cmd not found on PATH. Install Node.js (winget install OpenJS.NodeJS.LTS)." -ForegroundColor Red
    exit 1
}

# --- 4. Logs directory ---
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

# --- 5. (Re)register the three services idempotently ---
function Register-LifeOSService {
    param(
        [string]$Name,
        [string]$Application,
        [string]$Arguments,
        [string]$AppDirectory
    )
    if (Get-Service -Name $Name -ErrorAction SilentlyContinue) {
        Write-Host "Service $Name already exists - updating configuration..."
        & nssm set $Name Application $Application | Out-Null
        & nssm set $Name AppParameters $Arguments | Out-Null
        & nssm set $Name AppDirectory $AppDirectory | Out-Null
    } else {
        Write-Host "Installing service $Name..."
        & nssm install $Name $Application $Arguments | Out-Null
        & nssm set $Name AppDirectory $AppDirectory | Out-Null
    }
}

# LifeOS-Ngrok
Register-LifeOSService -Name "LifeOS-Ngrok" -Application $ngrokExe -Arguments "http --domain=$ngrokDomain 8000" -AppDirectory $root
& nssm set LifeOS-Ngrok Start SERVICE_AUTO_START | Out-Null
& nssm set LifeOS-Ngrok AppStdout (Join-Path $logsDir "ngrok.out.log") | Out-Null
& nssm set LifeOS-Ngrok AppStderr (Join-Path $logsDir "ngrok.err.log") | Out-Null
# The service runs as SYSTEM, which has no ngrok config file (the authtoken added
# via `ngrok config add-authtoken` lives in the installing user's profile), so
# pass the token explicitly — ngrok v3 reads the NGROK_AUTHTOKEN env var.
if ($ngrokAuthtoken) {
    & nssm set LifeOS-Ngrok AppEnvironmentExtra "NGROK_AUTHTOKEN=$ngrokAuthtoken" | Out-Null
} else {
    Write-Host "WARNING: NGROK_AUTHTOKEN not set in $envFile - the tunnel service will fail with ERR_NGROK_4018" -ForegroundColor Yellow
}

# LifeOS-API (depends on ngrok: the API self-registers the Telegram webhook
# against the ngrok domain at boot, so the tunnel must be up first)
Register-LifeOSService -Name "LifeOS-API" -Application $venvPython -Arguments "-m uvicorn api:app --host 127.0.0.1 --port 8000" -AppDirectory $srcDir
& nssm set LifeOS-API Start SERVICE_AUTO_START | Out-Null
& nssm set LifeOS-API DependOnService LifeOS-Ngrok | Out-Null
& nssm set LifeOS-API AppRestartDelay 5000 | Out-Null
& nssm set LifeOS-API AppStdout (Join-Path $logsDir "api.out.log") | Out-Null
& nssm set LifeOS-API AppStderr (Join-Path $logsDir "api.err.log") | Out-Null

# LifeOS-Frontend
# NOTE: `npm run build` must have been run in frontend/ for `next start` (npm start) to work.
if (-not (Test-Path (Join-Path $frontendDir ".next\BUILD_ID"))) {
    Write-Host "WARNING: frontend\.next\BUILD_ID not found. Run 'npm run build' in frontend/ before the frontend service can start successfully." -ForegroundColor Yellow
}
Register-LifeOSService -Name "LifeOS-Frontend" -Application $npmCmd -Arguments "start" -AppDirectory $frontendDir
& nssm set LifeOS-Frontend Start SERVICE_AUTO_START | Out-Null
& nssm set LifeOS-Frontend AppStdout (Join-Path $logsDir "frontend.out.log") | Out-Null
& nssm set LifeOS-Frontend AppStderr (Join-Path $logsDir "frontend.err.log") | Out-Null

# --- 6. Start services and verify ---
Write-Host "Starting services..."
& nssm start LifeOS-Ngrok | Out-Null
& nssm start LifeOS-API | Out-Null
& nssm start LifeOS-Frontend | Out-Null
Start-Sleep -Seconds 8

try {
    $status = Invoke-RestMethod -Uri "http://localhost:8000/status" -TimeoutSec 10
    Write-Host "API status endpoint responded:" -ForegroundColor Green
    $status | ConvertTo-Json -Depth 5
} catch {
    Write-Host "WARNING: http://localhost:8000/status did not respond yet: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Check logs\api.err.log for details."
}

# --- 7. Re-register the daily scheduled jobs ---
# windows_tasks.ps1 embeds $PWD in the task actions, so invoke it from the repo root.
Push-Location $root
try {
    & (Join-Path $root "scripts\windows_tasks.ps1")
} finally {
    Pop-Location
}

# --- 8. Watchdog scheduled task (every 5 minutes as SYSTEM) ---
$watchdogScript = Join-Path $root "scripts\watchdog.ps1"
$actionWatchdog = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogScript`""
$triggerWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settingsWatchdog = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionWatchdog -Trigger $triggerWatchdog -Settings $settingsWatchdog -TaskName "LifeOS-Watchdog" -Description "Restarts LifeOS-API / LifeOS-Ngrok services if they stop responding" -User "SYSTEM" -Force

Write-Host ""
Write-Host "Life-OS services installed and started." -ForegroundColor Green
Write-Host "  Services : LifeOS-Ngrok, LifeOS-API, LifeOS-Frontend"
Write-Host "  Watchdog : LifeOS-Watchdog (every 5 min)"
Write-Host "  Logs     : $logsDir"
