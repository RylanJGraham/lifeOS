# Wait for network and VPNs before starting Life-OS
$timeout = 30
$connected = $false

Write-Host "Waiting for network connectivity..."

while ($timeout -gt 0) {
    if (Test-Connection -ComputerName 8.8.8.8 -Quiet -Count 1) {
        $connected = $true
        break
    }
    Start-Sleep -Seconds 1
    $timeout--
}

if ($connected) {
    Write-Host "Network connected." -ForegroundColor Green
    
    # Start Ngrok if not running
    Write-Host "Starting Ngrok Tunnel..."
    Start-Process ngrok -ArgumentList "http --domain=$env:NGROK_DOMAIN 8000" -WindowStyle Hidden -ErrorAction SilentlyContinue
    
    # Activate virtual environment and start Life-OS
    Write-Host "Starting Life-OS API..."
    .\venv\Scripts\Activate.ps1
    python src/api.py
} else {
    Write-Host "Network timeout. Cannot start Life-OS securely." -ForegroundColor Red
}
