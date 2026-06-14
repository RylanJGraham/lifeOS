# Ngrok Setup for Life-OS
# Run this script to test and verify your ngrok tunnel

Write-Host "Starting Ngrok Tunnel Setup..."

# Ensure ngrok is installed
if (!(Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "ngrok is not installed. Installing via winget..."
    winget install ngrok.ngrok
}

# Ensure token is added
$envFile = "$PWD\.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    $tokenLine = $envContent | Where-Object { $_ -match "^NGROK_AUTHTOKEN=" }
    if ($tokenLine) {
        $token = $tokenLine.Split("=")[1].Trim()
        if ($token -and $token -ne "your_ngrok_token") {
            Write-Host "Found NGROK_AUTHTOKEN in .env. Configuring ngrok..."
            ngrok config add-authtoken $token
        } else {
            Write-Host "Please set your actual NGROK_AUTHTOKEN in the .env file." -ForegroundColor Yellow
        }
    }
}

# Verify domain
$domainLine = $envContent | Where-Object { $_ -match "^NGROK_DOMAIN=" }
if ($domainLine) {
    $domain = $domainLine.Split("=")[1].Trim()
    if ($domain -and $domain -ne "your-static-domain.ngrok-free.app") {
        Write-Host "Setup Complete!" -ForegroundColor Green
        Write-Host "Your webhook URL for Telegram BotFather is: https://$domain/webhook"
        Write-Host "You can start the tunnel manually to test it via:"
        Write-Host "ngrok http --domain=$domain 8000" -ForegroundColor Cyan
    } else {
        Write-Host "Please set your actual NGROK_DOMAIN in the .env file." -ForegroundColor Yellow
    }
} else {
    Write-Host "NGROK_DOMAIN not found in .env." -ForegroundColor Red
}
