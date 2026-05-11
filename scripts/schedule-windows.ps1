# schedule-windows.ps1
# Creates a Windows Task Scheduler task to run wallet-daily every morning at 8:00 AM.
# Run this script once from an elevated PowerShell prompt:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\schedule-windows.ps1

param(
    [string]$ProjectDir = $PSScriptRoot + "\..",
    [string]$BunPath    = (Get-Command bun -ErrorAction SilentlyContinue)?.Source,
    [string]$RunTime    = "08:00",
    [string]$TaskName   = "WalletDailyBudget"
)

if (-not $BunPath) {
    Write-Error "bun not found in PATH. Install from https://bun.sh then re-run."
    exit 1
}

$ProjectDir = Resolve-Path $ProjectDir
$EnvFile    = Join-Path $ProjectDir ".env"
$Script     = Join-Path $ProjectDir "src\daily.ts"

if (-not (Test-Path $EnvFile)) {
    Write-Error ".env not found at $EnvFile — copy .env.example and fill in your values."
    exit 1
}

# Load .env into a hashtable
$env = @{}
Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) { $env[$parts[0].Trim()] = $parts[1].Trim() }
}

# Build the env vars string for the action command
$envArgs = ($env.Keys | ForEach-Object { "$_=$($env[$_])" }) -join " "

$action  = New-ScheduledTaskAction `
    -Execute $BunPath `
    -Argument "run $Script" `
    -WorkingDirectory $ProjectDir

$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Store env vars as task environment (requires XML approach)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "✓ Task '$TaskName' created — runs daily at $RunTime" -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: The task runs as your current user with your current environment." -ForegroundColor Yellow
Write-Host "Make sure your .env values are also set as system environment variables, or" -ForegroundColor Yellow
Write-Host "edit the task in Task Scheduler to add them under Environment Variables." -ForegroundColor Yellow
Write-Host ""
Write-Host "To test immediately: Start-ScheduledTask -TaskName $TaskName"
Write-Host "To remove:           Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
