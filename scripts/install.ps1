# Life-OS Master Installation Script
# Run as Administrator

Write-Host "======================================"
Write-Host " Life-OS Foundation Installer"
Write-Host "======================================"

# 1. Check Python and dependencies
Write-Host "Checking Python..."
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python is missing. Please run winget install Python.Python.3.11 first." -ForegroundColor Red
    exit
}

# 2. Setup Virtual Environment
Write-Host "Setting up Python virtual environment..."
if (!(Test-Path -Path "venv")) {
    python -m venv venv
}
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Verify Ollama Model (Llama 3.1 8b)
Write-Host "Verifying Ollama and pulling Llama 3.1 8b..."
try {
    ollama pull llama3.1:8b
    # Verify it responds
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get
    if ($response.models.name -contains "llama3.1:8b") {
        Write-Host "Ollama setup verified successfully!" -ForegroundColor Green
    } else {
        Write-Host "Warning: Model pulled but not found in list." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error connecting to Ollama. Make sure Ollama is installed and running." -ForegroundColor Red
    exit
}

# 4. Set Wake Timers
Write-Host "Configuring Power Settings for Wake Timers..."
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /SETACTIVE SCHEME_CURRENT
Write-Host "Wake timers enabled." -ForegroundColor Green

# 5. Execute Sub-Scripts
Write-Host "Creating Scheduled Tasks..."
.\scripts\windows_tasks.ps1

Write-Host "======================================"
Write-Host " Foundation setup complete!"
Write-Host " Next steps:"
Write-Host " 1. Fill out your .env file."
Write-Host " 2. Run .\scripts\ngrok_setup.ps1 to get your webhook URL."
Write-Host " 3. Verify Tailscale is running."
Write-Host "======================================"
