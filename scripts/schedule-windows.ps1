# schedule-windows.ps1
# Creates all wallet-daily scheduled tasks.
# Run once from an elevated PowerShell prompt:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\schedule-windows.ps1

$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile    = Join-Path $ProjectDir ".env"

# Find bun
$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    Write-Error "bun not found in PATH. Install from https://bun.sh then re-run."
    exit 1
}
$BunPath = $bunCmd.Source

if (-not (Test-Path $EnvFile)) {
    Write-Error ".env not found at $EnvFile"
    exit 1
}

# Load .env and persist as user environment variables
Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#=].*=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "User")
    }
}

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

function Register-WalletTask {
    param($Name, $Script, $Trigger)

    $action = New-ScheduledTaskAction `
        -Execute $BunPath `
        -Argument "run `"$(Join-Path $ProjectDir $Script)`"" `
        -WorkingDirectory $ProjectDir

    Register-ScheduledTask `
        -TaskName $Name `
        -Action $action `
        -Trigger $Trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "  OK  $Name" -ForegroundColor Green
}

Write-Host "Registering wallet-daily tasks..." -ForegroundColor Cyan

# Daily report — every day at 08:00
Register-WalletTask "WalletDaily" "src\daily.ts" `
    (New-ScheduledTaskTrigger -Daily -At "08:00")

# Weekly report — every Monday at 08:05
Register-WalletTask "WalletWeekly" "src\weekly.ts" `
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "08:05")

# Midday alert — every day at 13:00
Register-WalletTask "WalletAlert" "src\alert.ts" `
    (New-ScheduledTaskTrigger -Daily -At "13:00")

# Monthly close — 1st of every month at 08:10
Register-WalletTask "WalletMonthly" "src\monthly.ts" `
    (New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At "08:10")

Write-Host ""
Write-Host "All tasks registered." -ForegroundColor Green
Write-Host ""
Write-Host "Test commands:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName WalletDaily"
Write-Host "  Start-ScheduledTask -TaskName WalletWeekly"
Write-Host "  Start-ScheduledTask -TaskName WalletAlert"
Write-Host "  Start-ScheduledTask -TaskName WalletMonthly"
