# Load environment variables from .env if present
if (Test-Path ".env") {
    Get-Content .env | Where-Object { $_ -match "^[^#\s]+=" } | ForEach-Object {
        $parts = $_.Split('=', 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($value -like '"*"') { $value = $value.Substring(1, $value.Length - 2) }
        elseif ($value -like "'*'") { $value = $value.Substring(1, $value.Length - 2) }
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

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
    $ngrokPath = "ngrok"
    if (!(Get-Command ngrok -ErrorAction SilentlyContinue)) {
        $wingetNgrok = "C:\Users\rylan\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
        if (Test-Path $wingetNgrok) {
            $ngrokPath = $wingetNgrok
        }
    }
    Start-Process $ngrokPath -ArgumentList "http --domain=$env:NGROK_DOMAIN 8000" -WindowStyle Hidden -ErrorAction SilentlyContinue
    
    # Activate virtual environment and start Life-OS
    Write-Host "Starting Life-OS API..."
    .\venv\Scripts\Activate.ps1
    python src/api.py
} else {
    Write-Host "Network timeout. Cannot start Life-OS securely." -ForegroundColor Red
}
