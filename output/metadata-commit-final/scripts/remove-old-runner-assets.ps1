[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$assetRoot = Join-Path $workspace 'output\imagegen'
$currentRoot = Join-Path $assetRoot 'auralis-runner-v3'
$recordPath = Join-Path $currentRoot '制作与检查.md'
$oldNames = @('auralis-runner-v1', 'auralis-runner-v2')

# Reject junctions and symlinks throughout the relevant directory trees.
function Assert-PlainPath([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Refusing reparse point: $Path"
    }
}

foreach ($path in @($workspace, (Join-Path $workspace 'output'), $assetRoot, $currentRoot, $recordPath)) {
    Assert-PlainPath $path
}

$targets = @()
foreach ($name in $oldNames) {
    $target = [IO.Path]::GetFullPath((Join-Path $assetRoot $name))
    if ((Split-Path -Parent $target) -ne $assetRoot -or (Split-Path -Leaf $target) -notin $oldNames) {
        throw "Unexpected deletion target: $target"
    }
    if (-not (Test-Path -LiteralPath $target)) { continue }
    Assert-PlainPath $target
    foreach ($item in Get-ChildItem -LiteralPath $target -Force -Recurse) {
        Assert-PlainPath $item.FullName
    }
    $targets += $target
}

$record = [IO.File]::ReadAllText($recordPath, [Text.Encoding]::UTF8)
$old = '- reference/ 中间动作参考来自 v2 的 rgsdev / Character Prototype Animated（CC0）。来源与授权记录见 ../auralis-runner-v2/制作与检查.md。'
$replacement = '- reference/ 中间动作参考沿用旧版采用的 rgsdev / Character Prototype Animated。原来源记录：作者 rgsdev；页面 https://opengameart.org/content/character-prototype-animated ；原始下载 https://opengameart.org/sites/default/files/animated_prototype_character.zip ；许可 CC0（页面说明无需署名，但欢迎署名）。旧版目录已清理，来源信息保留于此。'
if ($record.Contains($old)) {
    if ($PSCmdlet.ShouldProcess($recordPath, 'Preserve source and license information before deleting old assets')) {
        [IO.File]::WriteAllText($recordPath, $record.Replace($old, $replacement), [Text.UTF8Encoding]::new($false))
    } elseif (-not $WhatIfPreference) {
        throw 'Source record update declined; deletion cancelled.'
    }
} elseif (-not $record.Contains($replacement)) {
    throw 'Unexpected source record. Review the v3 documentation before deleting anything.'
}

foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target, 'Permanently delete old runner assets')) {
        Remove-Item -LiteralPath $target -Recurse -Force
        if (Test-Path -LiteralPath $target) { throw "Deletion incomplete: $target" }
        Write-Output "Removed: $target"
    }
}
Write-Output "Preserved current assets: $currentRoot"
