#requires -Version 7.0
<#
.SYNOPSIS
  Safely remove the two abandoned Auralis worktree directories.

.DESCRIPTION
  Preview only by default. Execution requires -Execute, the PlanId printed by
  the preview, and the confirmation prompt. The script only accepts the two
  exact paths below. It removes their verified node_modules junctions without
  traversing them, then removes the remaining worktree contents.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/cleanup-abandoned-worktrees.ps1

.EXAMPLE
  pwsh -NoProfile -File ./scripts/cleanup-abandoned-worktrees.ps1 `
    -Execute -ExpectedPlanId <PlanId-from-preview>
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$Execute,
    [string]$ExpectedPlanId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-CanonicalPath {
    param([Parameter(Mandatory)][string]$Path)

    $fullPath = [IO.Path]::GetFullPath($Path)
    $pathRoot = [IO.Path]::GetPathRoot($fullPath)
    if (-not $fullPath.Equals($pathRoot, [StringComparison]::OrdinalIgnoreCase)) {
        $fullPath = $fullPath.TrimEnd([char[]]@('\', '/'))
    }
    return $fullPath
}

$workspaceRoot = ConvertTo-CanonicalPath (Join-Path $PSScriptRoot '..')
$expectedWorkspaceRoot = ConvertTo-CanonicalPath 'D:\VSCode\Auralis'
$sharedNodeModules = ConvertTo-CanonicalPath (Join-Path $workspaceRoot 'node_modules')
$separator = [IO.Path]::DirectorySeparatorChar

if (-not $workspaceRoot.Equals($expectedWorkspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unexpected workspace root: $workspaceRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'package.json') -PathType Leaf)) {
    throw "Workspace package.json not found: $workspaceRoot"
}
if (-not (Test-Path -LiteralPath $sharedNodeModules -PathType Container)) {
    throw "Shared node_modules target is missing: $sharedNodeModules"
}

$gitRootOutput = & git -C $workspaceRoot rev-parse --show-toplevel 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve Git root: $gitRootOutput"
}
$gitRoot = ConvertTo-CanonicalPath (($gitRootOutput | Out-String).Trim())
if (-not $gitRoot.Equals($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Script workspace differs from Git root: $workspaceRoot != $gitRoot"
}

$targetDefinitions = @(
    [pscustomobject]@{
        Name = 'WorkBuddy worktree'
        Path = 'C:\Users\BoBo\WorkBuddy\Worktrees\Auralis\origin-dev-feaf3096'
        Parent = 'C:\Users\BoBo\WorkBuddy\Worktrees\Auralis'
    },
    [pscustomobject]@{
        Name = 'Badge performance worktree'
        Path = 'D:\VSCode\Auralis-badge-performance'
        Parent = 'D:\VSCode'
    }
)

function Get-RegisteredWorktreePaths {
    $lines = @(& git -C $workspaceRoot worktree list --porcelain 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect registered worktrees: $($lines -join [Environment]::NewLine)"
    }

    $paths = [Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        if ($line -match '^worktree (.+)$') {
            $paths.Add((ConvertTo-CanonicalPath $Matches[1]))
        }
    }
    return ,$paths.ToArray()
}

function Get-TargetSnapshot {
    param([Parameter(Mandatory)]$Definition)

    $target = ConvertTo-CanonicalPath $Definition.Path
    $expectedTarget = ConvertTo-CanonicalPath $Definition.Path
    $expectedParent = ConvertTo-CanonicalPath $Definition.Parent
    $actualParent = ConvertTo-CanonicalPath (Split-Path -Parent $target)

    if (-not $target.Equals($expectedTarget, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target path mismatch: $target"
    }
    if (-not $actualParent.Equals($expectedParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unexpected parent for target: $target"
    }
    if ($target.Equals($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to remove the current workspace.'
    }
    if (-not (Test-Path -LiteralPath $target -PathType Container)) {
        throw "Cleanup target is missing: $target"
    }

    $targetItem = Get-Item -LiteralPath $target -Force -ErrorAction Stop
    if ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Cleanup target itself must be a regular directory: $target"
    }

    $registeredPaths = @(Get-RegisteredWorktreePaths)
    if ($registeredPaths -contains $target) {
        throw "Target is still registered as a worktree: $target"
    }

    $junctionPath = ConvertTo-CanonicalPath (Join-Path $target 'node_modules')
    $junctionTarget = $null
    if (Test-Path -LiteralPath $junctionPath) {
        $junctionItem = Get-Item -LiteralPath $junctionPath -Force -ErrorAction Stop
        if (-not ($junctionItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $junctionItem.LinkType -ne 'Junction') {
            throw "Refusing to remove a non-junction node_modules path: $junctionPath"
        }

        $linkTargetValue = @($junctionItem.Target)[0]
        $junctionTarget = ConvertTo-CanonicalPath ([string]$linkTargetValue)
        if (-not $junctionTarget.Equals($sharedNodeModules, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected node_modules junction target: $junctionTarget"
        }
    }

    $entries = @(Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction Stop)
    $unexpectedLinks = @(
        $entries | Where-Object {
            ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
            -not (ConvertTo-CanonicalPath $_.FullName).Equals($junctionPath, [StringComparison]::OrdinalIgnoreCase)
        }
    )
    if ($unexpectedLinks.Count -gt 0) {
        $linkPaths = $unexpectedLinks.FullName -join ', '
        throw "Unexpected reparse points found; refusing cleanup: $linkPaths"
    }

    $records = [Collections.Generic.List[string]]::new()
    $fileCount = 0
    $totalBytes = 0L
    foreach ($entry in $entries) {
        $entryPath = ConvertTo-CanonicalPath $entry.FullName
        if ($entryPath.Equals($junctionPath, [StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        $relativePath = [IO.Path]::GetRelativePath($target, $entryPath).Replace('\', '/')
        if ($entry.PSIsContainer) {
            $records.Add(('DIR|{0}|{1}' -f $relativePath, $entry.LastWriteTimeUtc.Ticks))
        } else {
            $fileCount++
            $totalBytes += [long]$entry.Length
            $records.Add(('FILE|{0}|{1}|{2}' -f $relativePath, $entry.Length, $entry.LastWriteTimeUtc.Ticks))
        }
    }
    if ($junctionTarget) {
        $records.Add(('JUNCTION|node_modules|{0}' -f $junctionTarget))
    }

    $sortedRecords = @($records | Sort-Object -CaseSensitive)
    $fingerprintText = $target + "`n" + ($sortedRecords -join "`n")
    $fingerprint = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($fingerprintText))

    [pscustomobject]@{
        Name = $Definition.Name
        Path = $target
        Definition = $Definition
        FileCount = $fileCount
        Bytes = $totalBytes
        JunctionPath = if ($junctionTarget) { $junctionPath } else { $null }
        JunctionTarget = $junctionTarget
        PlanId = [Convert]::ToHexString($fingerprint).ToLowerInvariant()
    }
}

function New-CleanupPlan {
    $snapshots = @($targetDefinitions | ForEach-Object { Get-TargetSnapshot $_ })
    $planText = (($snapshots | Sort-Object Path | ForEach-Object { '{0}|{1}' -f $_.Path, $_.PlanId }) -join "`n")
    $planHash = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($planText))

    [pscustomobject]@{
        Targets = $snapshots
        PlanId = [Convert]::ToHexString($planHash).ToLowerInvariant()
    }
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return '{0:N2} GiB' -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return '{0:N1} MiB' -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return '{0:N1} KiB' -f ($Bytes / 1KB) }
    return "$Bytes B"
}

$plan = New-CleanupPlan
Write-Host "Workspace: $workspaceRoot"
foreach ($target in $plan.Targets) {
    $junctionSummary = if ($target.JunctionPath) { "verified junction -> $($target.JunctionTarget)" } else { 'no node_modules junction' }
    Write-Host ("Target: {0} | files: {1} | size: {2} | {3}" -f $target.Path, $target.FileCount, (Format-Size $target.Bytes), $junctionSummary)
}
Write-Host "PlanId: $($plan.PlanId)"

if (-not $Execute) {
    Write-Host 'Preview only. Re-run with -Execute -ExpectedPlanId <PlanId> to remove these exact directories.'
    return
}
if ([string]::IsNullOrWhiteSpace($ExpectedPlanId)) {
    throw 'Execution requires -ExpectedPlanId copied from the reviewed preview.'
}
if (-not $ExpectedPlanId.Equals($plan.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
    throw "PlanId mismatch; expected $ExpectedPlanId, current plan is $($plan.PlanId). Nothing was removed."
}

$confirmedPlan = New-CleanupPlan
if (-not $confirmedPlan.PlanId.Equals($plan.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Target contents changed after preview. Current PlanId: $($confirmedPlan.PlanId). Nothing was removed."
}

foreach ($target in $confirmedPlan.Targets) {
    if (-not $PSCmdlet.ShouldProcess($target.Path, 'Remove abandoned worktree contents')) {
        continue
    }

    $currentTarget = Get-TargetSnapshot $target.Definition
    if (-not $currentTarget.PlanId.Equals($target.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target changed before removal: $($target.Path). Nothing further was removed."
    }

    if ($currentTarget.JunctionPath) {
        Remove-Item -LiteralPath $currentTarget.JunctionPath -Force -ErrorAction Stop
        if (-not (Test-Path -LiteralPath $sharedNodeModules -PathType Container)) {
            throw "Shared node_modules target unexpectedly disappeared: $sharedNodeModules"
        }
        if (Test-Path -LiteralPath $currentTarget.JunctionPath) {
            throw "Junction still exists after removal: $($currentTarget.JunctionPath)"
        }
    }

    $remainingLinks = @(
        Get-ChildItem -LiteralPath $currentTarget.Path -Recurse -Force -ErrorAction Stop |
            Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    )
    if ($remainingLinks.Count -gt 0) {
        throw "Unexpected reparse points remain under $($currentTarget.Path); directory not removed."
    }

    Remove-Item -LiteralPath $currentTarget.Path -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $currentTarget.Path) {
        throw "Cleanup command returned, but the target still exists: $($currentTarget.Path)"
    }
    Write-Host "Removed: $($currentTarget.Path)"
}

if (-not (Test-Path -LiteralPath $sharedNodeModules -PathType Container)) {
    throw "Shared node_modules target missing after cleanup: $sharedNodeModules"
}
Write-Host 'Cleanup complete. The shared Auralis node_modules directory remains in place.'
