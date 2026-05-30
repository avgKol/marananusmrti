param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,

    [Parameter(Mandatory = $true)]
    [string]$Task,

    [string]$AgentType = "",
    [string]$Branch = "",
    [int]$LeaseMinutes = 120,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $repoRoot "AGENT_LOCK.json"

if (-not (Test-Path $lockPath)) {
    throw "Lock file not found at $lockPath"
}

$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
$now = (Get-Date).ToUniversalTime()
$expiry = $null

if ($lock.expires_at_utc) {
    try {
        $expiry = [datetime]::Parse($lock.expires_at_utc).ToUniversalTime()
    } catch {
        $expiry = $null
    }
}

$lockIsActive = $lock.status -eq "locked"
$lockIsFresh = $expiry -and $expiry -gt $now

if ($lockIsActive -and $lockIsFresh -and -not $Force) {
    throw "Lock is currently held by '$($lock.current_holder)' until $($lock.expires_at_utc). Use -Force only if the lock is stale or override is intentional."
}

$newLock = [ordered]@{
    schema_version      = 1
    status              = "locked"
    repo                = $lock.repo
    current_holder      = $Agent
    agent_type          = $AgentType
    task_summary        = $Task
    branch              = $Branch
    started_at_utc      = $now.ToString("o")
    last_heartbeat_utc  = $now.ToString("o")
    expires_at_utc      = $now.AddMinutes($LeaseMinutes).ToString("o")
    released_at_utc     = ""
    last_completed_by   = $lock.last_completed_by
    last_completed_task = $lock.last_completed_task
    lock_protocol       = $lock.lock_protocol
    handoff_file        = $lock.handoff_file
    workflow_file       = $lock.workflow_file
    notes               = ""
}

$newLock | ConvertTo-Json -Depth 5 | Set-Content $lockPath

Write-Host "Claimed lock for '$Agent' on task: $Task"
Write-Host "Expires at (UTC): $($newLock.expires_at_utc)"
