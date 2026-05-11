# schedule-windows.ps1
# Creates a Windows Task Scheduler task to run wallet-daily every morning at 8:00 AM.
# Run once from an elevated PowerShell prompt:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\schedule-windows.ps1

$TaskName   = "WalletDailyBudget"
$RunTime    = "08:00"
$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$Script     = Join-Path $ProjectDir "src\daily.ts"
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

# Load .env and set as machine environment variables so the task can read them
Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#=].*=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "User")
    }
}

$action = New-ScheduledTaskAction `
    -Execute $BunPath `
    -Argument "run `"$Script`"" `
    -WorkingDirectory $ProjectDir

$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "Task '$TaskName' created - runs daily at $RunTime" -ForegroundColor Green
Write-Host ""
Write-Host "To test now:  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Cyan
Write-Host "To remove:    Unregister-ScheduledTask -TaskName $TaskName" -ForegroundColor Cyan
