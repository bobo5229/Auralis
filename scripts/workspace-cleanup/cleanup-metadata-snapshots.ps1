#requires -Version 7.0
<#
.SYNOPSIS
预览或移除两份已从 Git 索引移除的元数据验证副本。
.EXAMPLE
pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-metadata-snapshots.ps1
.EXAMPLE
pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-metadata-snapshots.ps1 -Execute
#>
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Execute)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputRoot = Join-Path $workspaceRoot 'output'
$sharedModules = Join-Path $workspaceRoot 'node_modules'
$names = @('metadata-commit-check', 'metadata-commit-final')
$cacheFiles = @('.electron-home/tsconfig.node.tsbuildinfo', '.electron-home/tsconfig.web.tsbuildinfo')
$duplicateFiles = @(
    '.codex-remote-attachments/01a10d73-7de2-7750-a282-d9ae15198fff/6097ebe6-6b00-4f0c-9bbe-4c1fae73bb5c/1-25731.jpg',
    'docs/reviews/2026-10-25-liquid-glass-parameter-layout-review.md',
    'docs/topics/archive/TECHDOC-badge-achievements.md',
    'resources/audio/auralis-file-replace.exe',
    'resources/audio/ffmpeg.exe',
    'resources/audio/mpv.exe'
)

function Get-Targets {
    $outputItem = Get-Item -LiteralPath $outputRoot -Force
    if (-not $outputItem.PSIsContainer -or ($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Output must be a regular directory: $outputRoot"
    }
    foreach ($name in $names) {
        $relativeRoot = "output/$name"
        $tracked = @(& git -C $workspaceRoot ls-files -- $relativeRoot)
        if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the Git index.' }
        if ($tracked.Count -gt 0) { throw "Directory still contains tracked files: $relativeRoot" }
        $target = Join-Path $outputRoot $name
        if (-not (Test-Path -LiteralPath $target)) { Write-Host "不存在，跳过: $target"; continue }
        $item = Get-Item -LiteralPath $target -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $item.FullName -ne $target) { throw "Unexpected target: $target" }

        $stack = [Collections.Generic.Stack[string]]::new()
        $stack.Push($target)
        $bytes = 0L
        $count = 0
        $hasJunction = $false
        while ($stack.Count -gt 0) {
            foreach ($child in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
                $relative = [IO.Path]::GetRelativePath($target, $child.FullName).Replace('\', '/')
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    if ($relative -ne 'node_modules' -or $child.LinkType -ne 'Junction' -or
                        $child.Target -ne $sharedModules) { throw "Unexpected link: $($child.FullName)" }
                    $hasJunction = $true
                } elseif ($child.PSIsContainer) {
                    $stack.Push($child.FullName)
                } else {
                    if ($relative -notin $cacheFiles -and $relative -notin $duplicateFiles) {
                        throw "Unexpected file; preserving directory: $($child.FullName)"
                    }
                    if ($relative -in $duplicateFiles) {
                        $original = Join-Path $workspaceRoot $relative
                        if (-not (Test-Path -LiteralPath $original -PathType Leaf) -or
                            (Get-FileHash -LiteralPath $child.FullName).Hash -ne (Get-FileHash -LiteralPath $original).Hash) {
                            throw "Original missing or differs: $relative"
                        }
                    }
                    $bytes += $child.Length
                    $count++
                }
            }
        }
        [pscustomobject]@{ Path = $target; Files = $count; Bytes = $bytes; Junction = $hasJunction }
    }
}

$targets = @(Get-Targets)
foreach ($target in $targets) {
    Write-Host ("{0}: {1} files, {2:N1} MiB; dependency junction: {3}" -f $target.Path, $target.Files, ($target.Bytes / 1MB), $target.Junction)
}
if (-not $Execute) { Write-Host '仅预览。传入 -Execute 执行清理。'; return }

# 重新核查所有目标，再删除联接本身和副本；不遍历联接目标。
$targets = @(Get-Targets)
foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target.Path, '删除已检查的验证副本')) {
        if ($target.Junction) { Remove-Item -LiteralPath (Join-Path $target.Path 'node_modules') -Force }
        Remove-Item -LiteralPath $target.Path -Recurse -Force
        Write-Host "已删除: $($target.Path)"
    }
}
