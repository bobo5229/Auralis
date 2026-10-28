#requires -Version 7.0
<#
.SYNOPSIS
  清理 Auralis badge-player-integration 的临时 renderer-build 输出。

.DESCRIPTION
  默认只打印预览。执行必须同时提供 -Execute 和预览所得的 -ExpectedPlanId。
  仅允许删除 output/badge-player-integration/renderer-build；如果目录含有
  跟踪文件、忽略文件、链接，或计划生成后内容变化，脚本会中止。

.EXAMPLE
  pwsh -NoProfile -File ./scripts/clean-renderer-build-artifact.ps1

.EXAMPLE
  pwsh -NoProfile -File ./scripts/clean-renderer-build-artifact.ps1 `
    -Execute -ExpectedPlanId <WhatIf 输出的 PlanId>
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [switch]$Execute,
    [string]$ExpectedPlanId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'output'))
$targetRelative = 'output/badge-player-integration/renderer-build'
$targetFull = [IO.Path]::GetFullPath((Join-Path $workspaceRoot ($targetRelative -replace '/', [IO.Path]::DirectorySeparatorChar)))
$separator = [IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'package.json') -PathType Leaf)) {
    throw "Workspace package.json not found: $workspaceRoot"
}
$gitRootOutput = & git -C $workspaceRoot rev-parse --show-toplevel 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve Git root: $gitRootOutput" }
$gitRoot = [IO.Path]::GetFullPath(($gitRootOutput | Out-String).Trim())
if (-not $gitRoot.Equals($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Script workspace differs from Git root: $workspaceRoot != $gitRoot"
}

function New-CleanupPlan {
    if (-not (Test-Path -LiteralPath $targetFull -PathType Container)) {
        throw "Cleanup target is missing: $targetFull"
    }
    $outputItem = Get-Item -LiteralPath $outputRoot -Force -ErrorAction Stop
    $parentItem = Get-Item -LiteralPath (Join-Path $outputRoot 'badge-player-integration') -Force -ErrorAction Stop
    $targetItem = Get-Item -LiteralPath $targetFull -Force -ErrorAction Stop
    if (($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        ($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The output root, parent, and cleanup target must be regular directories.'
    }
    if (-not $targetFull.StartsWith($outputRoot.TrimEnd($separator) + $separator, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target escaped output: $targetFull"
    }

    $tracked = @(& git -c core.quotePath=false -C $workspaceRoot ls-files -- $targetRelative)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect tracked files in the cleanup target.' }
    if ($tracked.Count -gt 0) { throw "Refusing to delete a directory containing tracked files ($($tracked.Count))." }

    $untracked = @(& git -c core.quotePath=false -C $workspaceRoot ls-files --others --exclude-standard -- $targetRelative)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect untracked files in the cleanup target.' }
    if ($untracked.Count -eq 0) { throw 'No untracked build files were found; nothing will be removed.' }

    $entries = @(Get-ChildItem -LiteralPath $targetFull -Recurse -Force -ErrorAction Stop)
    $links = @($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($links.Count -gt 0) { throw "Refusing to remove a build tree containing links ($($links.Count))." }
    $files = @($entries | Where-Object { -not $_.PSIsContainer })
    if ($files.Count -ne $untracked.Count) {
        throw "The directory has $($files.Count) files but Git reports $($untracked.Count) untracked files; possible ignored or unknown files found."
    }

    $untrackedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $untracked) { [void]$untrackedSet.Add($path) }
    $fingerprint = [Collections.Generic.List[string]]::new()
    $bytes = 0L
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($workspaceRoot, $file.FullName).Replace('\', '/')
        if (-not $untrackedSet.Contains($relative)) {
            throw "Refusing a tracked, ignored, or unknown file: $relative"
        }
        $bytes += [long]$file.Length
        $fingerprint.Add(('{0}|{1}|{2}' -f $relative, $file.Length, $file.LastWriteTimeUtc.Ticks))
    }
    if ($untrackedSet.Count -ne $files.Count) { throw 'Git and filesystem inventories do not match.' }

    $sorted = @($fingerprint | Sort-Object -CaseSensitive)
    $hash = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($sorted -join "`n")))
    [pscustomobject]@{
        PlanId = [Convert]::ToHexString($hash).ToLowerInvariant()
        Target = $targetFull
        FileCount = $files.Count
        Bytes = $bytes
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
Write-Host "Target: $targetRelative"
Write-Host "Files: $($plan.FileCount); size: $(Format-Size $plan.Bytes); links: 0; tracked files: 0"
Write-Host "PlanId: $($plan.PlanId)"

if (-not $Execute) {
    Write-Host 'Preview only. Use -Execute -ExpectedPlanId <PlanId> to apply this exact plan.'
    return
}
if ([string]::IsNullOrWhiteSpace($ExpectedPlanId)) {
    throw 'Execution requires -ExpectedPlanId copied from the reviewed preview.'
}
if (-not $ExpectedPlanId.Equals($plan.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
    throw "PlanId mismatch; expected $ExpectedPlanId, current plan is $($plan.PlanId). Nothing was removed."
}

$currentPlan = New-CleanupPlan
if (-not $currentPlan.PlanId.Equals($plan.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Target changed after preview. New PlanId: $($currentPlan.PlanId). Nothing was removed."
}

if ($PSCmdlet.ShouldProcess("$targetRelative ($(Format-Size $plan.Bytes))", 'Permanently remove temporary build output')) {
    Remove-Item -LiteralPath $targetFull -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $targetFull) { throw 'Cleanup command returned, but the target still exists.' }
    Write-Host "Removed $($plan.FileCount) files ($(Format-Size $plan.Bytes))."
}
