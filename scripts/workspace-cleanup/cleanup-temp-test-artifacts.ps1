#requires -Version 7.0
<#
.SYNOPSIS
  清理已确认的临时测试输出、重复快照与隔离缓存。

.DESCRIPTION
  默认只生成预览计划。目标限定为本脚本内列出的 output 子目录、文件和
  .gitignore 标记的测试缓存。脚本拒绝删除受版本控制的文件、未列入范围的
  output 文件、真实路径诊断目录，以及含重解析点的目录树。

  含 node_modules 联接点的三个提交快照仅逐个删除 Git 未跟踪文件，保留联接点。
  output/badge-glsl-validation/latest.json 仅在它指向本次将清理的临时运行目录时
  恢复到 HEAD。

.EXAMPLE
  pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-temp-test-artifacts.ps1

.EXAMPLE
  pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-temp-test-artifacts.ps1 `
    -Execute -ExpectedPlanId <WhatIf 输出的 PlanId>
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [switch]$Execute,
    [string]$ExpectedPlanId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'output'))
$separator = [IO.Path]::DirectorySeparatorChar
$protectedDiagnosticRoot = [IO.Path]::GetFullPath((Join-Path $outputRoot 'metadata-real-path-probe-20261011'))

if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'package.json') -PathType Leaf)) {
    throw "Workspace package.json not found: $workspaceRoot"
}
if (-not (Test-Path -LiteralPath $outputRoot -PathType Container)) {
    throw "Output directory not found: $outputRoot"
}
$outputRootItem = Get-Item -LiteralPath $outputRoot -Force
if ($outputRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Output root cannot be a junction or symbolic link: $outputRoot"
}

$gitRootOutput = & git -C $workspaceRoot rev-parse --show-toplevel 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve Git root: $gitRootOutput" }
$gitRoot = [IO.Path]::GetFullPath(($gitRootOutput | Out-String).Trim())
if (-not $gitRoot.Equals($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Script workspace differs from Git root: $workspaceRoot != $gitRoot"
}

# Exact generated artifact roots observed in this workspace. New output paths are not
# added automatically; an unclassified path makes the plan fail closed.
$artifactDirectories = @(
    'output/badge-achievement-review',
    'output/badge-achievements',
    'output/badge-all',
    'output/badge-caption',
    'output/badge-cold-open',
    'output/badge-commit-snapshot-1793155550337',
    'output/badge-keyboard',
    'output/badge-open-performance',
    'output/badge-open-performance-compare',
    'output/badge-preload',
    'output/badge-switch-resize-recheck',
    'output/badge-transition',
    'output/badge-transition-review',
    'output/badge-ui-critique',
    'output/badge-ui-polish',
    'output/badge-glsl-validation/run-1793159277565',
    'output/badge-glsl-validation/run-1793159436025',
    'output/badge-glsl-validation/run-1793159588265',
    'output/badge-glsl-validation/run-1793159836284',
    'output/badge-glsl-validation/run-1793159878170',
    'output/badge-glsl-validation/run-1793160138614',
    'output/day-top3-preview',
    'output/flashcard-refined-demo',
    'output/font-budget-check',
    'output/hours1000-redesign',
    'output/hours1000-texture',
    'output/hours1000-track-details',
    'output/metadata-build',
    'output/metadata-commit-check',
    'output/metadata-commit-final',
    'output/metadata-ui-check',
    'output/playbar-cover-fixture'
)

$artifactFiles = @(
    'output/badge-achievements-check.mjs',
    'output/badge-all-check.mjs',
    'output/badge-caption-check.mjs',
    'output/badge-cold-open-check.mjs',
    'output/badge-combined.index',
    'output/badge-commit-merge-state.json',
    'output/badge-commit-message.txt',
    'output/badge-commit-state.json',
    'output/badge-commit.index',
    'output/badge-keyboard-check.mjs',
    'output/badge-open-performance.mjs',
    'output/badge-preload-check.mjs',
    'output/badge-transition-check.mjs',
    'output/badge-ui-critique-a.mjs',
    'output/badge-ui-polish-check.mjs',
    'output/commit-badges-isolated.mjs',
    'output/day-top3-preview.mjs',
    'output/font-budget-check.mjs',
    'output/font-fix.index',
    'output/hours1000-texture.mjs',
    'output/hours1000-track-details.mjs',
    'output/metadata-final.index',
    'output/metadata-ui-check.mjs',
    'output/playbar-cover-fixture.mjs',
    'output/prepare-badge-index-merge.mjs',
    'output/redesign-hours1000.mjs',
    'output/stage-badge-commit.mjs'
)

# Exact ignored cache/build directories from .gitignore. Caches nested inside one of
# the artifact roots above are already covered by that root and are omitted here.
$ignoredCacheDirectories = @(
    'output/album-entry-review-20261017/isolated-profile',
    'output/album-indicator-color-validation/isolated-profile',
    'output/badge-case-shell/isolated-profile',
    'output/badge-player-integration/isolated-profile',
    'output/badge-player-integration/renderer-build',
    'output/badge-player-performance/isolated-profile',
    'output/bitrate-settings-validation/isolated-profile',
    'output/cd-track-alignment-validation/isolated-profile',
    'output/cd-track-bars-validation/isolated-profile',
    'output/comet-removal-validation/isolated-profile',
    'output/context-selection-validation/isolated-profile',
    'output/cover-bitrate-validation/isolated-profile',
    'output/imagegen/auralis-runner-v3/qa/browser-profile',
    'output/metadata-saving-preview/dist-ssr',
    'output/metadata-saving-preview/isolated-profile',
    'output/now-playing-icons-expanded-validation/profile',
    'output/now-playing-icons-validation/profile',
    'output/playing-indicator-fix/profile',
    'output/playing-indicator-integration/profile',
    'output/search-hover-validation/dist-baseline',
    'output/search-hover-validation/dist-before-second-fix',
    'output/search-hover-validation/isolated-profile',
    'output/search-hover-validation/isolated-profile-v2',
    'output/search-hover-validation/repro-profile',
    'output/sidebar-facets-icon-validation/isolated-profile',
    'output/sidebar-tools-demo/isolated-profile'
)

$ordinalIgnoreCase = [StringComparer]::OrdinalIgnoreCase
$untrackedOutput = @(& git -c core.quotePath=false -C $workspaceRoot ls-files --others --exclude-standard |
    Where-Object { $_.StartsWith('output/', [StringComparison]::OrdinalIgnoreCase) })
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate untracked output files.' }
$trackedPaths = @(& git -c core.quotePath=false -C $workspaceRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked Git files.' }
$untrackedSet = [Collections.Generic.HashSet[string]]::new($ordinalIgnoreCase)
foreach ($path in $untrackedOutput) { [void]$untrackedSet.Add($path) }

function Get-RelativeFullPath {
    param([Parameter(Mandatory)][string]$RelativePath)
    $full = [IO.Path]::GetFullPath((Join-Path $workspaceRoot ($RelativePath -replace '/', $separator)))
    $outputPrefix = $outputRoot.TrimEnd($separator) + $separator
    if (-not $full.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target escaped output directory: $RelativePath"
    }
    if ($full.StartsWith($protectedDiagnosticRoot.TrimEnd($separator) + $separator, [StringComparison]::OrdinalIgnoreCase) -or
        $full.Equals($protectedDiagnosticRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Protected real-path diagnostics cannot be cleaned: $RelativePath"
    }
    return $full
}

function Assert-NoReparseAncestors {
    param([Parameter(Mandatory)][string]$FullPath)
    $outputPrefix = $outputRoot.TrimEnd($separator) + $separator
    if (-not $FullPath.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside output: $FullPath"
    }
    $relative = $FullPath.Substring($outputPrefix.Length)
    $segments = $relative -split '[\\/]'
    $current = $outputRoot
    for ($index = 0; $index -lt ($segments.Count - 1); $index++) {
        $current = Join-Path $current $segments[$index]
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Target crosses a junction or symbolic link: $current"
        }
    }
}

function Get-SafeTreeInventory {
    param([Parameter(Mandatory)][string]$Path)
    Assert-NoReparseAncestors $Path
    $rootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Target must be a regular directory: $Path"
    }
    $files = [Collections.Generic.List[IO.FileInfo]]::new()
    $directories = [Collections.Generic.List[IO.DirectoryInfo]]::new()
    $reparsePoints = [Collections.Generic.List[IO.FileSystemInfo]]::new()
    $stack = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
    $stack.Push([IO.DirectoryInfo]$rootItem)
    while ($stack.Count -gt 0) {
        $current = $stack.Pop()
        foreach ($child in Get-ChildItem -LiteralPath $current.FullName -Force -ErrorAction Stop) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                $reparsePoints.Add($child)
                continue
            }
            if ($child.PSIsContainer) {
                $dir = [IO.DirectoryInfo]$child
                $directories.Add($dir)
                $stack.Push($dir)
            } else {
                $files.Add([IO.FileInfo]$child)
            }
        }
    }
    return [pscustomobject]@{ Files = $files; Directories = $directories; ReparsePoints = $reparsePoints }
}

function Get-TreeFingerprintLines {
    param([Parameter(Mandatory)]$Inventory)
    foreach ($file in $Inventory.Files) {
        '{0}|{1}|{2}' -f $file.FullName, $file.Length, $file.LastWriteTimeUtc.Ticks
    }
    foreach ($link in $Inventory.ReparsePoints) {
        'LINK|{0}|{1}' -f $link.FullName, $link.LinkType
    }
}

function New-CleanupPlan {
    $actions = [Collections.Generic.List[object]]::new()
    $fingerprint = [Collections.Generic.List[string]]::new()
    $authorizedRoots = @($artifactDirectories)

    foreach ($path in $untrackedOutput) {
        $covered = $artifactFiles -contains $path
        if (-not $covered) {
            foreach ($root in $authorizedRoots) {
                if ($path.StartsWith($root + '/', [StringComparison]::OrdinalIgnoreCase)) {
                    $covered = $true
                    break
                }
            }
        }
        if (-not $covered) { throw "Unclassified output file; left untouched: $path" }
    }

    foreach ($relative in $artifactDirectories) {
        $full = Get-RelativeFullPath $relative
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { throw "Expected artifact directory is missing: $relative" }
        $trackedInside = @($trackedPaths | Where-Object { $_.StartsWith($relative + '/', [StringComparison]::OrdinalIgnoreCase) })
        if ($trackedInside.Count -gt 0) { throw "Refusing directory containing tracked files ($($trackedInside.Count)): $relative" }
        $untrackedInside = @($untrackedOutput | Where-Object { $_.StartsWith($relative + '/', [StringComparison]::OrdinalIgnoreCase) })
        if ($untrackedInside.Count -eq 0) { throw "Expected untracked artifact files are missing: $relative" }
        $inventory = Get-SafeTreeInventory $full
        if ($inventory.ReparsePoints.Count -gt 0) {
            $files = [Collections.Generic.List[string]]::new()
            $bytes = 0L
            foreach ($filePath in $untrackedInside) {
                $fileFull = Get-RelativeFullPath $filePath
                Assert-NoReparseAncestors $fileFull
                foreach ($link in $inventory.ReparsePoints) {
                    if ($fileFull.StartsWith($link.FullName.TrimEnd($separator) + $separator, [StringComparison]::OrdinalIgnoreCase)) {
                        throw "Refusing untracked file beneath a preserved link: $filePath"
                    }
                }
                $fileItem = Get-Item -LiteralPath $fileFull -Force -ErrorAction Stop
                if ($fileItem.PSIsContainer -or ($fileItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                    throw "Refusing a linked or non-file entry: $filePath"
                }
                $files.Add($fileFull)
                $bytes += [long]$fileItem.Length
                $fingerprint.Add(('FILE|{0}|{1}|{2}' -f $filePath, $fileItem.Length, $fileItem.LastWriteTimeUtc.Ticks))
            }
            foreach ($line in Get-TreeFingerprintLines $inventory) { $fingerprint.Add($line) }
            $links = @($inventory.ReparsePoints | ForEach-Object { $_.FullName })
            $actions.Add([pscustomobject]@{
                Kind = 'UntrackedFiles'; RelativePath = $relative; FullPath = $full
                FilePaths = $files; FileCount = $files.Count; Bytes = $bytes; Links = $links
            })
        } else {
            foreach ($line in Get-TreeFingerprintLines $inventory) { $fingerprint.Add($line) }
            $bytes = [long](($inventory.Files | Measure-Object Length -Sum).Sum)
            $actions.Add([pscustomobject]@{
                Kind = 'Directory'; RelativePath = $relative; FullPath = $full
                FilePaths = @(); FileCount = $inventory.Files.Count; Bytes = $bytes; Links = @()
            })
        }
        $fingerprint.Add(('DIR|{0}|{1}|{2}' -f $relative, $inventory.Files.Count, $bytes))
    }

    foreach ($relative in $artifactFiles) {
        if (-not $untrackedSet.Contains($relative)) { throw "Expected temporary file is not untracked: $relative" }
        $full = Get-RelativeFullPath $relative
        Assert-NoReparseAncestors $full
        $item = Get-Item -LiteralPath $full -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Expected a regular file: $relative"
        }
        $actions.Add([pscustomobject]@{
            Kind = 'File'; RelativePath = $relative; FullPath = $full
            FilePaths = @($full); FileCount = 1; Bytes = [long]$item.Length; Links = @()
        })
        $fingerprint.Add(('FILE|{0}|{1}|{2}' -f $relative, $item.Length, $item.LastWriteTimeUtc.Ticks))
    }

    foreach ($relative in $ignoredCacheDirectories) {
        $full = Get-RelativeFullPath $relative
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { throw "Expected ignored cache is missing: $relative" }
        $null = & git -C $workspaceRoot check-ignore --quiet -- $relative
        if ($LASTEXITCODE -ne 0) { throw "Cache target is no longer ignored by Git: $relative" }
        if (@($trackedPaths | Where-Object { $_.StartsWith($relative + '/', [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0) {
            throw "Refusing cache directory containing tracked files: $relative"
        }
        $inventory = Get-SafeTreeInventory $full
        if ($inventory.ReparsePoints.Count -gt 0) { throw "Refusing cache directory containing links: $relative" }
        foreach ($line in Get-TreeFingerprintLines $inventory) { $fingerprint.Add($line) }
        $bytes = [long](($inventory.Files | Measure-Object Length -Sum).Sum)
        $actions.Add([pscustomobject]@{
            Kind = 'Directory'; RelativePath = $relative; FullPath = $full
            FilePaths = @(); FileCount = $inventory.Files.Count; Bytes = $bytes; Links = @()
        })
        $fingerprint.Add(('CACHE|{0}|{1}|{2}' -f $relative, $inventory.Files.Count, $bytes))
    }

    $pointerRelative = 'output/badge-glsl-validation/latest.json'
    $pointerFull = Join-Path $workspaceRoot $pointerRelative
    $restorePointer = $false
    $pointerHash = $null
    $null = & git -C $workspaceRoot diff --cached --quiet -- $pointerRelative
    if ($LASTEXITCODE -ne 0) { throw 'The validation pointer is staged; refusing to overwrite staged content.' }
    $null = & git -C $workspaceRoot diff --quiet -- $pointerRelative
    $pointerDiff = $LASTEXITCODE
    if ($pointerDiff -notin @(0, 1)) { throw 'Unable to inspect the tracked validation pointer.' }
    if ($pointerDiff -eq 1) {
        $pointerObject = Get-Content -LiteralPath $pointerFull -Raw | ConvertFrom-Json -ErrorAction Stop
        if (@($pointerObject.PSObject.Properties.Name).Count -ne 1 -or $pointerObject.PSObject.Properties.Name -notcontains 'output') {
            throw 'The modified validation pointer has an unexpected shape; preserving it.'
        }
        $pointedFull = [IO.Path]::GetFullPath([string]$pointerObject.output)
        $pointedRelative = [IO.Path]::GetRelativePath($workspaceRoot, $pointedFull).Replace('\', '/')
        $pointsToPlannedRun = ($artifactDirectories -contains $pointedRelative) -and
            (@($untrackedOutput | Where-Object { $_.StartsWith($pointedRelative + '/', [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0)
        if ($pointsToPlannedRun) {
            $restorePointer = $true
            $pointerHash = (Get-FileHash -LiteralPath $pointerFull -Algorithm SHA256).Hash
            $fingerprint.Add(('RESTORE|{0}|{1}' -f $pointerRelative, $pointerHash))
        }
    }

    $sortedFingerprint = @($fingerprint | Sort-Object -CaseSensitive)
    $hashBytes = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($sortedFingerprint -join "`n")))
    $planId = [Convert]::ToHexString($hashBytes).ToLowerInvariant()
    $totalBytes = [long](($actions | Measure-Object Bytes -Sum).Sum)
    $totalFiles = [long](($actions | Measure-Object FileCount -Sum).Sum)
    return [pscustomobject]@{
        Actions = $actions; PlanId = $planId; TotalBytes = $totalBytes
        TotalFiles = $totalFiles; RestorePointer = $restorePointer
        PointerPath = $pointerFull; PointerHash = $pointerHash
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
Write-Host "Targets: $($plan.Actions.Count) exact paths; $($plan.TotalFiles) files; $(Format-Size $plan.TotalBytes)"
Write-Host 'Mode: permanent removal; tracked evidence and review documents stay in place.'
$plan.Actions | Sort-Object RelativePath | ForEach-Object {
    $note = if ($_.Kind -eq 'UntrackedFiles') { ' (preserving linked node_modules)' } else { '' }
    Write-Host ('  {0,-14} {1,5} files  {2,9}  {3}{4}' -f $_.Kind, $_.FileCount, (Format-Size $_.Bytes), $_.RelativePath, $note)
}
if ($plan.RestorePointer) {
    Write-Host '  Restore tracked output/badge-glsl-validation/latest.json to HEAD (its current run is being removed).'
}
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

# Rebuild immediately before mutation; any changed file, link, status or pointer aborts.
$currentPlan = New-CleanupPlan
if (-not $currentPlan.PlanId.Equals($plan.PlanId, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Workspace changed after preview. New PlanId: $($currentPlan.PlanId). Nothing was removed."
}

$targetSummary = "$($plan.TotalFiles) files ($(Format-Size $plan.TotalBytes)) from $($plan.Actions.Count) exact output paths"
if ($plan.RestorePointer) { $targetSummary += ' and restore the generated tracked run pointer' }
if (-not $PSCmdlet.ShouldProcess($targetSummary, 'Permanently remove approved temporary outputs')) {
    return
}

if ($plan.RestorePointer) {
    $currentHash = (Get-FileHash -LiteralPath $plan.PointerPath -Algorithm SHA256).Hash
    if (-not $currentHash.Equals($plan.PointerHash, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The tracked validation pointer changed after planning; aborting before deletion.'
    }
    $null = & git -C $workspaceRoot restore --source=HEAD --worktree -- 'output/badge-glsl-validation/latest.json'
    if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the generated validation pointer from HEAD.' }
}

$removedFiles = 0L
$removedBytes = 0L
foreach ($action in $plan.Actions) {
    if ($action.Kind -eq 'Directory') {
        Remove-Item -LiteralPath $action.FullPath -Recurse -Force -ErrorAction Stop
        $removedFiles += $action.FileCount
        $removedBytes += $action.Bytes
        Write-Host "Removed directory: $($action.RelativePath)"
    } elseif ($action.Kind -eq 'UntrackedFiles' -or $action.Kind -eq 'File') {
        foreach ($filePath in $action.FilePaths) {
            Remove-Item -LiteralPath $filePath -Force -ErrorAction Stop
        }
        $removedFiles += $action.FileCount
        $removedBytes += $action.Bytes
        if ($action.Kind -eq 'UntrackedFiles') {
            Write-Host "Removed untracked files; preserved links: $($action.RelativePath)"
        } else {
            Write-Host "Removed file: $($action.RelativePath)"
        }
    }
}

# Prune empty directories left in the three snapshots that contain a shared junction.
foreach ($action in @($plan.Actions | Where-Object { $_.Kind -eq 'UntrackedFiles' })) {
    $tree = Get-SafeTreeInventory $action.FullPath
    $directories = @($tree.Directories | Sort-Object { $_.FullName.Length } -Descending)
    foreach ($directory in $directories) {
        if (@(Get-ChildItem -LiteralPath $directory.FullName -Force -ErrorAction Stop).Count -eq 0) {
            Remove-Item -LiteralPath $directory.FullName -Force -ErrorAction Stop
        }
    }
}

Write-Host "Cleanup complete: $removedFiles files; $(Format-Size $removedBytes) removed."
if ($plan.RestorePointer) { Write-Host 'Tracked validation pointer restored to HEAD.' }
