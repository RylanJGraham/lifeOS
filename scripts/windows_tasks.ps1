# Script to configure Windows Scheduled Tasks for Life-OS

$actionMorning = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/morning_briefing.py`""
$triggerMorning = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settingsMorning = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionMorning -Trigger $triggerMorning -Settings $settingsMorning -TaskName "LifeOS-MorningBriefing" -Description "Generates and sends the daily morning briefing" -User "SYSTEM" -Force

$actionHealth = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/sync_xiaomi.py; python src/workers/sync_health.py`""
$triggerHealth = New-ScheduledTaskTrigger -Daily -At 11:30PM
$settingsHealth = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionHealth -Trigger $triggerHealth -Settings $settingsHealth -TaskName "LifeOS-HealthSync" -Description "Syncs Xiaomi Health data and processes nightly metrics" -User "SYSTEM" -Force

Write-Host "Scheduled tasks created successfully." -ForegroundColor Green
