param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,

    [string]$Summary = "",
    [string]$Notes = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $repoRoot "AGENT_LOCK.json"

if (-not (Test-Path $lockPath)) {
    throw "Lock file not found at $lockPath"
}

$lock = Get-Content $lockPath -Raw | ConvertFrom-Json

if ($lock.status -eq "locked" -and $lock.current_holder -and $lock.current_holder -ne $Agent -and -not $Force) {
    throw "Lock is currently held by '$($lock.current_holder)'. Use -Force only if you intentionally need to release a stale lock."
}

$now = (Get-Date).ToUniversalTime()

$newLock = [ordered]@{
    schema_version      = 1
    status              = "unlocked"
    repo                = $lock.repo
    current_holder      = ""
    agent_type          = ""
    task_summary        = ""
    branch              = ""
    started_at_utc      = ""
    last_heartbeat_utc  = ""
    expires_at_utc      = ""
    released_at_utc     = $now.ToString("o")
    last_completed_by   = $Agent
    last_completed_task = $Summary
    lock_protocol       = $lock.lock_protocol
    handoff_file        = $lock.handoff_file
    workflow_file       = $lock.workflow_file
    notes               = $Notes
}

$newLock | ConvertTo-Json -Depth 5 | Set-Content $lockPath

Write-Host "Released lock for '$Agent'"
if ($Summary) {
    Write-Host "Summary: $Summary"
}
