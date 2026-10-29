#requires -Version 7.0
<#
.SYNOPSIS
  清理本轮专辑页审计与修复产生的隔离浏览器配置和 Vite 缓存。
.DESCRIPTION
  固定清单只包含 .electron-home 内两个已确认任务的 profile / vite-cache。
  保留截图、验证记录、复现脚本及其他任务目录。默认只读预览。
  执行时要求传入预览输出的 PlanId；目录有变化、仍被进程使用、包含
  受 Git 跟踪文件或重解析点时拒绝删除。
.EXAMPLE
  $plan = & ./scripts/workspace-cleanup/cleanup-album-ui-temp.ps1 -WhatIf
  & ./scripts/workspace-cleanup/cleanup-album-ui-temp.ps1 -Execute -ExpectedPlanId $plan.PlanId
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [switch]$Execute,
    [string]$ExpectedPlanId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$separator = [IO.Path]::DirectorySeparatorChar
$workspacePrefix = $workspaceRoot.TrimEnd($separator) + $separator
$taskDirectories = @(
    '.electron-home/album-ui-audit-20261029-1793284646761',
    '.electron-home/album-ui-fixes-20261029-1793285363096'
)
$cacheNames = @('profile', 'vite-cache')

if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'package.json') -PathType Leaf)) {
    throw "Workspace package.json not found: $workspaceRoot"
}
$gitRoot = & git -C $workspaceRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or
    -not [IO.Path]::GetFullPath(($gitRoot | Out-String).Trim()).Equals(
        $workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Cleanup workspace must match the Git root.'
}
$trackedFiles = @(& git -c core.quotePath=false -C $workspaceRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked files.' }
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)

function Assert-RegularAncestors {
    param([Parameter(Mandatory)][string]$FullPath)

    if (-not $FullPath.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing a target outside the workspace: $FullPath"
    }
    $relative = [IO.Path]::GetRelativePath($workspaceRoot, $FullPath)
    $current = $workspaceRoot
    foreach ($segment in ($relative -split '[\\/]')) {
        $current = Join-Path $current $segment
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Target must use regular directories only: $current"
        }
    }
}

$targets = [Collections.Generic.List[object]]::new()
$fingerprint = [Collections.Generic.List[string]]::new()
$allFiles = [Collections.Generic.List[IO.FileInfo]]::new()

foreach ($task in $taskDirectories) {
    $taskPath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $task))
    # Check the task root too: launchers reference it rather than its profile subdirectory.
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ($commandLine.Replace('/', '\').IndexOf(
                $taskPath.Replace('/', '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            throw "Task is referenced by process $($process.ProcessId): $taskPath"
        }
    }
    foreach ($cacheName in $cacheNames) {
        $relative = "$task/$cacheName"
        $full = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relative))
        if ([IO.Path]::GetDirectoryName($full) -ne $taskPath -or
            -not $full.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected cleanup target: $full"
        }
        if (-not (Test-Path -LiteralPath $full)) {
            Write-Host "Missing, skip: $full"
            continue
        }
        Assert-RegularAncestors $full
        if (@($trackedFiles | Where-Object {
                    $_.Equals($relative, [StringComparison]::OrdinalIgnoreCase) -or
                    $_.StartsWith($relative + '/', [StringComparison]::OrdinalIgnoreCase)
                }).Count -gt 0) {
            throw "Refusing a target containing tracked files: $relative"
        }
        $null = & git -C $workspaceRoot check-ignore --quiet -- $relative
        if ($LASTEXITCODE -ne 0) { throw "Target is not ignored by Git: $relative" }

        $files = [Collections.Generic.List[IO.FileInfo]]::new()
        $stack = [Collections.Generic.Stack[string]]::new()
        $stack.Push($full)
        while ($stack.Count -gt 0) {
            $directory = $stack.Pop()
            $fingerprint.Add("DIR|$directory")
            foreach ($child in Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop) {
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    throw "Refusing a target containing a link or junction: $($child.FullName)"
                }
                if ($child.PSIsContainer) {
                    $stack.Push($child.FullName)
                } else {
                    $files.Add([IO.FileInfo]$child)
                    $allFiles.Add([IO.FileInfo]$child)
                    $fingerprint.Add("FILE|$($child.FullName)|$($child.Length)|$($child.LastWriteTimeUtc.Ticks)")
                }
            }
        }
        $bytes = 0L
        foreach ($file in $files) { $bytes += $file.Length }
        $targets.Add([pscustomobject]@{
                Path = $full
                Files = $files.Count
                Bytes = $bytes
                MiB = [math]::Round($bytes / 1MB, 2)
            })
    }
}

$hashInput = (@($fingerprint | Sort-Object -CaseSensitive) -join "\n")
$planId = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($hashInput))
).ToLowerInvariant()
$totalBytes = 0L
foreach ($target in $targets) { $totalBytes += $target.Bytes }
Write-Host "Workspace: $workspaceRoot"
$targets | Format-Table Path, Files, MiB -AutoSize | Out-Host
Write-Host ("Total: {0} directories; {1} files; {2:N2} MiB" -f
    $targets.Count, $allFiles.Count, ($totalBytes / 1MB))
Write-Host "PlanId: $planId"

$performDeletion = $Execute -and -not $WhatIfPreference
if ($performDeletion) {
    if ([string]::IsNullOrWhiteSpace($ExpectedPlanId) -or $ExpectedPlanId -cne $planId) {
        throw 'ExpectedPlanId does not match this plan. Review a fresh WhatIf before executing.'
    }
    # Preflight every file before any deletion; an open profile must remain intact.
    foreach ($file in $allFiles) {
        $handle = [IO.File]::Open($file.FullName, [IO.FileMode]::Open,
            [IO.FileAccess]::Read, [IO.FileShare]::None)
        $handle.Dispose()
    }
}

$deleted = [Collections.Generic.List[string]]::new()
foreach ($target in $targets) {
    if (($Execute -or $WhatIfPreference) -and
        $PSCmdlet.ShouldProcess($target.Path, 'Delete isolated temporary directory recursively')) {
        Assert-RegularAncestors $target.Path
        Remove-Item -LiteralPath $target.Path -Recurse -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $target.Path) { throw "Target still exists: $($target.Path)" }
        $deleted.Add($target.Path)
        Write-Host "Deleted: $($target.Path)"
    }
}
if (-not $Execute -and -not $WhatIfPreference) {
    Write-Host 'Preview only. Use -WhatIf to inspect actions, then -Execute -ExpectedPlanId <PlanId>.'
}
[pscustomobject]@{
    PlanId = $planId
    Workspace = $workspaceRoot
    Mode = $(if ($performDeletion) { 'Execute' } else { 'WhatIf' })
    TotalFiles = $allFiles.Count
    TotalBytes = $totalBytes
    Targets = @($targets.ToArray())
    Deleted = @($deleted.ToArray())
}
