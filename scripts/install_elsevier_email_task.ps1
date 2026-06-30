param(
  [string]$TaskName = "Zotero Tracker Elsevier Email Push",
  [string]$Time = "07:00",
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScriptPath = Join-Path $ProjectRoot "python\elsevier_email_push.py"
$EnvPath = Join-Path $ProjectRoot ".env"

if (!(Test-Path $ScriptPath)) {
  throw "Cannot find $ScriptPath"
}

if (!(Test-Path $EnvPath)) {
  throw "Cannot find .env. Copy .env.example to .env and fill Elsevier/163 settings first."
}

$Action = New-ScheduledTaskAction `
  -Execute $PythonExe `
  -Argument "`"$ScriptPath`"" `
  -WorkingDirectory $ProjectRoot

$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Send daily Elsevier paper recommendations to 163 email." `
  -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' at $Time."
Write-Host "Test manually with: python `"$ScriptPath`" --dry-run"
