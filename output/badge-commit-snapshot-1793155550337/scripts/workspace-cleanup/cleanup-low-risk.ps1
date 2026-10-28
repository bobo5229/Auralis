#requires -Version 7.0
<#
.SYNOPSIS
清理工作区根目录的低风险缓存与空目录。
.DESCRIPTION
默认仅预览；传入 -Execute 才删除 .grok、.npm-cache、.electron-gyp。
.grok 必须不含文件。缓存删除后可重新生成，可能需要联网下载。
.EXAMPLE
pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-low-risk.ps1
.EXAMPLE
pwsh -NoProfile -File ./scripts/workspace-cleanup/cleanup-low-risk.ps1 -Execute
#>
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Execute)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'package.json') -PathType Leaf)) {
    throw "Workspace package.json not found: $workspaceRoot"
}

# 先校验全部目标，避免发现异常前已删除其他目录。
$targets = foreach ($name in @('.grok', '.npm-cache', '.electron-gyp')) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $name))
    if ([IO.Path]::GetDirectoryName($targetPath) -ne $workspaceRoot) {
        throw "Target is outside the workspace root: $targetPath"
    }
    if (-not (Test-Path -LiteralPath $targetPath)) {
        Write-Host "Missing, skip: $targetPath"
        continue
    }
    $item = Get-Item -LiteralPath $targetPath -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Target must be a regular directory: $targetPath"
    }
    $children = @(Get-ChildItem -LiteralPath $targetPath -Force -Recurse)
    if (@($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) {
        throw "Target contains a link or junction: $targetPath"
    }
    $files = @($children | Where-Object { -not $_.PSIsContainer })
    if ($name -eq '.grok' -and $files.Count -gt 0) {
        throw '.grok contains files; this script only removes it when empty of files.'
    }
    $bytes = 0L
    foreach ($file in $files) { $bytes += $file.Length }
    [pscustomobject]@{ Path = $targetPath; Files = $files.Count; MiB = [math]::Round($bytes / 1MB, 2) }
}

Write-Host "Workspace: $workspaceRoot"
$targets | Format-Table Path, Files, MiB -AutoSize | Out-Host
if (-not $Execute) {
    Write-Host 'Preview only. Pass -Execute to delete the listed directories.'
    return
}

foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target.Path, 'Delete directory recursively')) {
        Remove-Item -LiteralPath $target.Path -Recurse -Force
        Write-Host "Deleted: $($target.Path)"
    }
}
