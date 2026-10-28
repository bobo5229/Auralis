#requires -Version 7.0
<#
.SYNOPSIS
  按固定清单清理 Auralis 工作区中的历史验证产物与重复构建副本。

.DESCRIPTION
  默认只读预览，不删除任何内容；显式传入 -Execute 才执行删除。
  清单文件为 JSON 数组，每个条目包含 Path / Kind / Category / Reason。
  脚本对每个条目执行保护区与路径校验，拒绝删除：
    - 受保护根（src、scripts、docs、demo、resources、data、AppData、node_modules、.git、.cache 等）
    - 工作区根之外的任何路径
    - 目录联接 / 符号链接（跳过并记录）
  执行前记录 HEAD、Git 状态与清单概要；执行后生成 report.json。
  本脚本不会通过动态通配符扩大清单范围。

.USAGE
  # 预览（默认）：打印将要删除的条目与合计字节
  pwsh ./scripts/workspace-cleanup/cleanup.ps1 -Manifest .cache/workspace-cleanup-20261024/manifest.json

  # 执行删除
  pwsh ./scripts/workspace-cleanup/cleanup.ps1 -Manifest .cache/workspace-cleanup-20261024/manifest.json -Execute
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Manifest,

    [switch]$Execute,

    [string]$ReportDir = '.cache/workspace-cleanup-20261024',

    # 执行删除前，将目标树内的截图/录屏证据复制到此目录保全。
    [string]$KeepEvidenceDir = '.cache/workspace-cleanup-20261024/kept-evidence'
)

$ErrorActionPreference = 'Stop'

# --- 工作区与保护区 ---
$workspaceRoot = (Get-Location).Path
$sep = [System.IO.Path]::DirectorySeparatorChar
$protectedRoots = @(
    'src', 'scripts', 'docs', 'demo', 'resources',
    'data', 'AppData', 'node_modules', '.git', '.cache',
    '.electron-gyp', '.npm-cache', '.worktrees',
    'out', 'release', 'output', 'artifacts', 'issues', 'log'
) | ForEach-Object { [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $_)) }
$electronHomeRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot '.electron-home'))
# .electron-home 内只允许删除“任务子目录”下的内容：拒绝 AppData/.electron-gyp 及根级文件。
$electronHomeProtectedFirstSegments = @('AppData', '.electron-gyp')

# 显式获准的固定清理目标（精确前缀）。只有这些路径可绕过常规保护区。
$explicitAllowPrefixes = @(
    (Join-Path $workspaceRoot 'tsconfig.node.tsbuildinfo'),
    (Join-Path $workspaceRoot 'tsconfig.web.tsbuildinfo'),
    (Join-Path $workspaceRoot ('out' + $sep + 'liquid-metal-gpu-audit-20261005-2130')),
    (Join-Path $workspaceRoot ('out' + $sep + 'liquid-metal-visibility-fix-20261005-2149')),
    (Join-Path $workspaceRoot ('release' + $sep + 'installer' + $sep + 'win-unpacked')),
    (Join-Path $workspaceRoot ('release' + $sep + 'portable' + $sep + 'win-unpacked')),
    (Join-Path $workspaceRoot '.worktrees')
) | ForEach-Object { [System.IO.Path]::GetFullPath($_) }

function Assert-AllowedPath {
    param([string]$Path)
    if (-not $Path) { return $false }
    $full = [System.IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($workspaceRoot + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }
    foreach ($allow in $explicitAllowPrefixes) {
        if ($full -eq $allow -or $full.StartsWith($allow + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    foreach ($root in $protectedRoots) {
        if ($full.StartsWith($root + $sep, [System.StringComparison]::OrdinalIgnoreCase) -or $full -eq $root) {
            return $false
        }
    }
    if (-not $full.StartsWith($electronHomeRoot + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
        # R1：非 .electron-home 路径必须精确命中显式放行前缀（白名单）。
        # 走到这里说明未命中 explicitAllowPrefixes（否则已提前返回 true），直接拒绝。
        return $false
    }
    $relative = $full.Substring($electronHomeRoot.Length + 1)
    $firstSegment = ($relative -split [regex]::Escape($sep))[0]
    if (-not $firstSegment) { return $false }
    # R2：显式拒绝 .electron-home 根级文件或仅一段的条目。
    if ($relative.IndexOf($sep) -lt 0) { return $false }
    if ($electronHomeProtectedFirstSegments -contains $firstSegment) { return $false }
    # 保守防线：拒绝清单之外的“近期任务”（2026-10-20 及以后创建），即使清单意外包含也拦截。
    $taskDir = Join-Path $electronHomeRoot $firstSegment
    $taskItem = Get-Item -LiteralPath $taskDir -Force -ErrorAction SilentlyContinue
    if ($null -ne $taskItem -and $taskItem.LastWriteTime -ge (Get-Date '2026-10-20T00:00:00')) {
        return $false
    }
    return $true
}

# --- 读取清单 ---
$entries = @()
foreach ($m in $Manifest) {
    if (-not (Test-Path -LiteralPath $m)) { throw "Manifest not found: $m" }
    $items = Get-Content -LiteralPath $m -Raw | ConvertFrom-Json
    if ($items -isnot [array]) { $items = @($items) }
    $entries += $items
}
$totalBytes = ($entries | Measure-Object -Property SizeBytes -Sum).Sum
Write-Host "Manifest entries: $($entries.Count)  expected bytes: $totalBytes"

# --- 预先记录环境（执行时） ---
$gitHead = ''
$gitStatus = @()
if ($Execute) {
    try {
        $gitHead = (& git rev-parse HEAD 2>$null).Trim()
        $gitStatus = @(& git status --porcelain 2>$null)
    } catch { }
}

# --- 校验与删除 ---
$validated = @()   # Path, SizeBytes
$invalid = @()
foreach ($e in $entries) {
    try {
        $full = [System.IO.Path]::GetFullPath($e.Path)
        if (-not (Test-Path -LiteralPath $full)) { continue }
        if (-not (Assert-AllowedPath $full)) { $invalid += $full; continue }
        $item = Get-Item -LiteralPath $full -Force -ErrorAction SilentlyContinue
        if ($null -eq $item) { continue }
        if ($item.LinkType) { $invalid += $full; continue }
        $size = 0L
        if ($item.PSIsContainer) {
            $size = (Get-ChildItem -LiteralPath $full -Recurse -File -Force -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum).Sum
        } else {
            $size = $item.Length
        }
        $validated += [PSCustomObject]@{ Path = $full; SizeBytes = [long]$size }
    } catch {
        $invalid += $e.Path
    }
}
$expectedBytes = ($validated | Measure-Object -Property SizeBytes -Sum).Sum

# R3：删除前预检目标树内部是否存在目录联接/符号链接；存在则跳过该条目。
$safe = @()
if ($Execute) {
    foreach ($v in $validated) {
        $reparse = Get-ChildItem -LiteralPath $v.Path -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }
        if ($reparse) {
            $invalid += $v.Path
        } else {
            $safe += $v
        }
    }
} else {
    $safe = $validated
}

# M1：执行删除前，保全目标树内的截图与录屏证据。
# 镜像目录结构 = <KeepEvidenceDir>/<条目相对 .electron-home 的路径>/<文件相对条目路径>，
# 保证不同任务、不同 profile 的同名证据不会互相覆盖。
$evidenceKept = @()
if ($Execute) {
    $evidenceDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $KeepEvidenceDir))
    foreach ($v in $safe) {
        $vPath = $v.Path
        if ($vPath.StartsWith($electronHomeRoot + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
            $mirrorSuffix = $vPath.Substring($electronHomeRoot.Length + 1)
        } else {
            $mirrorSuffix = $vPath.Substring($workspaceRoot.Length + 1)
        }
        $evidenceFiles = Get-ChildItem -LiteralPath $vPath -Recurse -File -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in '.png', '.webm', '.jpg', '.jpeg' }
        foreach ($ef in $evidenceFiles) {
            $rel = $ef.FullName.Substring($vPath.Length + 1)
            $dest = Join-Path (Join-Path $evidenceDir $mirrorSuffix) $rel
            $destDir = Split-Path -Parent $dest
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
            Copy-Item -LiteralPath $ef.FullName -Destination $dest -Force
            $evidenceKept += $dest
        }
    }
}

$deleted = @()
$failed = @()
if ($Execute) {
    foreach ($v in $safe) {
        try {
            Remove-Item -LiteralPath $v.Path -Recurse -Force -ErrorAction Stop
            $deleted += $v
        } catch {
            $failed += [PSCustomObject]@{ Path = $v.Path; Error = $_.Exception.Message }
        }
    }
} else {
    $safe | ForEach-Object { Write-Host "WOULD DELETE: $($_.Path)" }
}

# --- 报告 ---
$deletedBytes = [long](($deleted | Measure-Object -Property SizeBytes -Sum).Sum)
$report = [PSCustomObject]@{
    Timestamp        = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
    Head             = $gitHead
    GitStatusLines   = $gitStatus.Count
    ManifestEntries  = $entries.Count
    Validated        = $validated.Count
    InvalidSkipped   = $invalid.Count
    ExpectedBytes    = $expectedBytes
    Execute          = [bool]$Execute
    DeletedCount     = $deleted.Count
    DeletedBytes     = $deletedBytes
    EvidenceKept     = $evidenceKept.Count
    Failed           = $failed
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$reportPath = Join-Path $ReportDir ('report-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.json')
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding utf8
Write-Host "Report written to $reportPath"
Write-Host "Deleted: $($deleted.Count) / Validated: $($validated.Count) / InvalidSkipped: $($invalid.Count)"

if ($failed.Count -gt 0) {
    Write-Host 'Failures:'
    $failed | ForEach-Object { Write-Host "  $($_.Path): $($_.Error)" }
}
