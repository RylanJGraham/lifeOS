# Script to configure Windows Scheduled Tasks for Life-OS.
# Every scheduled task now routes through pipeline_service.py so each run is
# recorded in pipeline_runs and worker_heartbeats. This keeps the Tasks & Chat
# panel accurate and makes failures visible in the dashboard.
#
# Re-run this script after adding a new pipeline in src/pipeline_service.py.

function Register-LifeOSTask {
    param(
        [Parameter(Mandatory=$true)] [string] $Name,
        [Parameter(Mandatory=$true)] [string] $PipelineId,
        [Parameter(Mandatory=$true)] [string] $Description,
        [Parameter(Mandatory=$true)] [object] $Trigger
    )

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $PWD; .\venv\Scripts\Activate.ps1; python src/pipeline_service.py run $PipelineId`""

    $settings = New-ScheduledTaskSettingsSet -WakeToRun

    Register-ScheduledTask `
        -Action $action `
        -Trigger $Trigger `
        -Settings $settings `
        -TaskName $Name `
        -Description $Description `
        -User "SYSTEM" `
        -Force
}

# Daily pipelines
Register-LifeOSTask -Name "LifeOS-DailyAnalysis" -PipelineId "daily-analysis" `
    -Description "Generate health/wealth insights with the local Ollama model" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 6:00AM)

Register-LifeOSTask -Name "LifeOS-MorningBriefing" -PipelineId "morning-briefing" `
    -Description "Generate and send the daily morning briefing to Telegram" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 7:00AM)

Register-LifeOSTask -Name "LifeOS-InvestmentNotifier" -PipelineId "investment-notifier" `
    -Description "Scan transactions for new investments and send a Telegram alert" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 9:00AM)

Register-LifeOSTask -Name "LifeOS-HealthSync" -PipelineId "health-sync" `
    -Description "Nightly health aggregate and ai_insights summary" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 11:30PM)

Register-LifeOSTask -Name "LifeOS-GoalCheckinDaily" -PipelineId "goal-checkin-daily" `
    -Description "Send daily habit goal check-in questions via Telegram" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 8:00PM)

Register-LifeOSTask -Name "LifeOS-PersonaInsightsDaily" -PipelineId "persona-insights" `
    -Description "Doctor + nutritionist + PT daily insight evaluation" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 9:15PM)

Register-LifeOSTask -Name "LifeOS-FuelPacing" -PipelineId "fuel-pacing" `
    -Description "Midday protein/calorie pacing nudge (silent when on track)" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 3:00PM)

Register-LifeOSTask -Name "LifeOS-EveningAudit" -PipelineId "evening-audit" `
    -Description "Pre-sleep nudge for missing meals/health/workout data" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 9:30PM)

Register-LifeOSTask -Name "LifeOS-PriceRefresh" -PipelineId "price-refresh" `
    -Description "Refresh stale advisor position prices via Finnhub fallback" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 10:00AM)

Register-LifeOSTask -Name "LifeOS-PDFStatementSync" -PipelineId "pdf-statement-sync" `
    -Description "Parse bank/CC PDF statements and insert transactions via OpenRouter vision" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 8:00AM)

# Weekday IBKR sync (before the market advisor daily run)
Register-LifeOSTask -Name "LifeOS-IBKRFlexSync" -PipelineId "ibkr-flex-sync" `
    -Description "Pull positions and trades from IBKR before the market advisor daily run" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 3:00PM)

# Weekday market advisor (revalue + swarm signals + proposed orders; replaces Jarvis v3)
Register-LifeOSTask -Name "LifeOS-MarketAdvisor" -PipelineId "market-advisor" `
    -Description "Revalue positions and run the advisor swarm for BUY/SELL/HOLD signals" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 3:30PM)

# Sunday pipelines
Register-LifeOSTask -Name "LifeOS-GoalCheckinWeekly" -PipelineId "goal-checkin-weekly" `
    -Description "Send weekly financial goal progress / green-light updates via Telegram" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00AM)

Register-LifeOSTask -Name "LifeOS-WeeklyReview" -PipelineId "weekly-review" `
    -Description "Sunday digest: body-comp, cash runway, habit momentum, correlations" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00AM)

Register-LifeOSTask -Name "LifeOS-TransactionAnomalies" -PipelineId "transaction-anomalies" `
    -Description "Scan transactions for duplicate charges, subscription changes, and unusual amounts" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:30AM)

Register-LifeOSTask -Name "LifeOS-OpenBankingSync" -PipelineId "open-banking-sync" `
    -Description "Scaffold: pull EU bank transactions via GoCardless/Salt Edge/Plaid (requires credentials)" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:45AM)

# Monday pipelines
Register-LifeOSTask -Name "LifeOS-SymptomAnalysis" -PipelineId "symptom-analysis" `
    -Description "Weekly statistical symptom correlation analysis" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 6:00AM)

Write-Host "Scheduled tasks created successfully." -ForegroundColor Green
