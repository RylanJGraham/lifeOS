# One-off repair: the LifeOS-Ngrok service runs as SYSTEM, whose profile has no
# ngrok config file, so the tunnel dies with ERR_NGROK_4018 (auth failed).
# This passes the authtoken to the service as an environment variable instead.
# Right-click -> Run with PowerShell (as Administrator), or:
#   powershell -ExecutionPolicy Bypass -File scripts\fix_ngrok_service.ps1
# (from an elevated prompt, in the repo root)

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

$tokenLine = Get-Content $envFile | Where-Object { $_ -match "^NGROK_AUTHTOKEN=" } | Select-Object -First 1
if (-not $tokenLine) {
    Write-Host "ERROR: NGROK_AUTHTOKEN not found in $envFile" -ForegroundColor Red
    exit 1
}
$token = $tokenLine.Split('=', 2)[1].Trim().Trim('"').Trim("'")

& nssm set LifeOS-Ngrok AppEnvironmentExtra "NGROK_AUTHTOKEN=$token"
& nssm restart LifeOS-Ngrok
Start-Sleep -Seconds 5

# Also restart the API so it loads the latest webhook code and re-registers
# the Telegram webhook (its startup now retries until DNS is available).
& nssm restart LifeOS-API

$status = (& nssm status LifeOS-Ngrok)
Write-Host "LifeOS-Ngrok status: $status"
Write-Host "LifeOS-API status: $(& nssm status LifeOS-API)"

$errTail = Get-Content (Join-Path $root "logs\ngrok.err.log") -Tail 3 -ErrorAction SilentlyContinue
if ($errTail -match "ERR_NGROK_4018") {
    Write-Host "ngrok still failing auth - check the token in .env" -ForegroundColor Red
} else {
    Write-Host "Tunnel should be up. Verify: https://$((Get-Content $envFile | Where-Object { $_ -match '^NGROK_DOMAIN=' }).Split('=',2)[1].Trim())/webhook" -ForegroundColor Green
}
