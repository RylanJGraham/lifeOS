# Script to configure Windows Scheduled Tasks for Life-OS

$actionMorning = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/morning_briefing.py`""
$triggerMorning = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settingsMorning = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionMorning -Trigger $triggerMorning -Settings $settingsMorning -TaskName "LifeOS-MorningBriefing" -Description "Generates and sends the daily morning briefing" -User "SYSTEM" -Force

$actionHealth = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/sync_health.py`""
$triggerHealth = New-ScheduledTaskTrigger -Daily -At 11:30PM
$settingsHealth = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionHealth -Trigger $triggerHealth -Settings $settingsHealth -TaskName "LifeOS-HealthSync" -Description "Runs nightly health aggregate and writes ai_insights summary" -User "SYSTEM" -Force

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

# Evening audit: one consolidated nudge before bed if the day is incomplete
$actionEvening = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/evening_audit.py`""
$triggerEvening = New-ScheduledTaskTrigger -Daily -At 9:30PM
$settingsEvening = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionEvening -Trigger $triggerEvening -Settings $settingsEvening -TaskName "LifeOS-EveningAudit" -Description "Pre-sleep nudge for missing meals/health/workout data" -User "SYSTEM" -Force

# Weekly review: body-comp trend, cash runway, habit momentum, correlations
$actionWeekly = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/weekly_review.py`""
$triggerWeekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00AM
$settingsWeekly = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionWeekly -Trigger $triggerWeekly -Settings $settingsWeekly -TaskName "LifeOS-WeeklyReview" -Description "Sunday digest: body-comp, cash runway, habit momentum, correlations" -User "SYSTEM" -Force

# Symptom correlation analysis: statistical correlations between symptoms and behaviours
$actionSymptom = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/symptom_analysis.py`""
$triggerSymptom = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 6:00AM
$settingsSymptom = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionSymptom -Trigger $triggerSymptom -Settings $settingsSymptom -TaskName "LifeOS-SymptomAnalysis" -Description "Weekly statistical symptom correlation analysis" -User "SYSTEM" -Force

# Transaction anomaly scan: duplicate charges, subscription price changes, unusual amounts
$actionAnomalies = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/transaction_anomalies.py`""
$triggerAnomalies = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:30AM
$settingsAnomalies = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionAnomalies -Trigger $triggerAnomalies -Settings $settingsAnomalies -TaskName "LifeOS-TransactionAnomalies" -Description "Scan transactions for duplicate charges, subscription changes, and unusual amounts" -User "SYSTEM" -Force

# Price refresh: refresh stale advisor position prices via Finnhub fallback
$actionPriceRefresh = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/price_refresh.py`""
$triggerPriceRefresh = New-ScheduledTaskTrigger -Daily -At 10:00AM
$settingsPriceRefresh = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionPriceRefresh -Trigger $triggerPriceRefresh -Settings $settingsPriceRefresh -TaskName "LifeOS-PriceRefresh" -Description "Refresh stale advisor position prices via Finnhub fallback" -User "SYSTEM" -Force

# IBKR Flex Sync: pull real broker positions/trades before Jarvis v3 daily run
$actionIbkr = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/workers/ibkr_flex_sync.py`""
$triggerIbkr = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 3:00PM
$settingsIbkr = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionIbkr -Trigger $triggerIbkr -Settings $settingsIbkr -TaskName "LifeOS-IBKRFlexSync" -Description "Pulls positions and trades from IBKR before the Jarvis v3 daily run" -User "SYSTEM" -Force

# PDF Statement Sync: parse bank/CC PDFs from STATEMENT_DIRECTORY and insert real transactions
$actionPdfStatement = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/pipeline_service.py run pdf-statement-sync`""
$triggerPdfStatement = New-ScheduledTaskTrigger -Daily -At 8:00AM
$settingsPdfStatement = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionPdfStatement -Trigger $triggerPdfStatement -Settings $settingsPdfStatement -TaskName "LifeOS-PDFStatementSync" -Description "Parse bank/CC PDF statements and insert transactions via OpenRouter vision" -User "SYSTEM" -Force

# EU Open Banking Sync: scaffold for GoCardless/Salt Edge/Plaid EU transaction pulls (requires credentials)
$actionOpenBanking = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/pipeline_service.py run open-banking-sync`""
$triggerOpenBanking = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:45AM
$settingsOpenBanking = New-ScheduledTaskSettingsSet -WakeToRun

Register-ScheduledTask -Action $actionOpenBanking -Trigger $triggerOpenBanking -Settings $settingsOpenBanking -TaskName "LifeOS-OpenBankingSync" -Description "Scaffold: pull EU bank transactions via GoCardless/Salt Edge/Plaid (requires credentials)" -User "SYSTEM" -Force

Write-Host "Scheduled tasks created successfully." -ForegroundColor Green
