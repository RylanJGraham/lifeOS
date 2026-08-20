# Script to configure Windows Scheduled Tasks for Life-OS

$actionMorning = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/morning_briefing.py`""
$triggerMorning = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settingsMorning = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionMorning -Trigger $triggerMorning -Settings $settingsMorning -TaskName "LifeOS-MorningBriefing" -Description "Generates and sends the daily morning briefing" -User "SYSTEM" -Force

$actionHealth = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/sync_xiaomi.py; python src/workers/sync_health.py`""
$triggerHealth = New-ScheduledTaskTrigger -Daily -At 11:30PM
$settingsHealth = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionHealth -Trigger $triggerHealth -Settings $settingsHealth -TaskName "LifeOS-HealthSync" -Description "Syncs Xiaomi Health data and processes nightly metrics" -User "SYSTEM" -Force

# Goal check-ins: daily habit questions in the evening, weekly financial review Sunday morning
$actionGoalDaily = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/goal_checkin.py daily`""
$triggerGoalDaily = New-ScheduledTaskTrigger -Daily -At 8:00PM
$settingsGoalDaily = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionGoalDaily -Trigger $triggerGoalDaily -Settings $settingsGoalDaily -TaskName "LifeOS-GoalCheckinDaily" -Description "Sends daily habit goal check-in questions via Telegram" -User "SYSTEM" -Force

$actionGoalWeekly = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/goal_checkin.py weekly`""
$triggerGoalWeekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00AM
$settingsGoalWeekly = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionGoalWeekly -Trigger $triggerGoalWeekly -Settings $settingsGoalWeekly -TaskName "LifeOS-GoalCheckinWeekly" -Description "Sends weekly financial goal progress / green-light updates via Telegram" -User "SYSTEM" -Force

# Persona insights: doctor + nutritionist + PT review the day every evening
$actionPersonaDaily = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/persona_insights.py daily`""
$triggerPersonaDaily = New-ScheduledTaskTrigger -Daily -At 9:15PM
$settingsPersonaDaily = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionPersonaDaily -Trigger $triggerPersonaDaily -Settings $settingsPersonaDaily -TaskName "LifeOS-PersonaInsightsDaily" -Description "Doctor + nutritionist + PT daily insight evaluation (dashboard + Telegram alerts)" -User "SYSTEM" -Force

# Midday fuel pacing: protein/calorie pace check while there's still time to fix dinner
$actionPacing = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/fuel_pacing.py`""
$triggerPacing = New-ScheduledTaskTrigger -Daily -At 3:00PM
$settingsPacing = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionPacing -Trigger $triggerPacing -Settings $settingsPacing -TaskName "LifeOS-FuelPacing" -Description "Midday protein/calorie pacing nudge (silent when on track)" -User "SYSTEM" -Force

# Weekly review: body-comp trend, cash runway, habit momentum, correlations
$actionWeekly = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/weekly_review.py`""
$triggerWeekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00AM
$settingsWeekly = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionWeekly -Trigger $triggerWeekly -Settings $settingsWeekly -TaskName "LifeOS-WeeklyReview" -Description "Sunday digest: body-comp, cash runway, habit momentum, correlations" -User "SYSTEM" -Force

Write-Host "Scheduled tasks created successfully." -ForegroundColor Green
