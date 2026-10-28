<#
.SYNOPSIS
    扫描并清理指定目录下没有音频文件的子文件夹。

.DESCRIPTION
    递归检查指定根目录下的所有子文件夹：
    - 若某个子文件夹及其所有后代目录中均无音频文件，则将该子文件夹作为剪枝目标移除（包括其中的封面图、歌词、日志等非音频文件）。
    - 根目录自身永远不会被移除，仅清理其子文件夹。
    - 默认将文件夹移入 Windows 回收站（可撤销恢复），支持 -WhatIf 试运行纯预览与 -Permanent 永久删除。

.PARAMETER Path
    要扫描的目标根目录路径。若未提供，将交互式提示输入或拖入路径。

.PARAMETER Extensions
    认定的音频文件扩展名列表。默认为 14 种常见无损与有损格式。

.PARAMETER WhatIf
    试运行预览模式，只列出扫描结果与待删除清单，不执行任何实际删除。

.PARAMETER Permanent
    永久删除模式（不可通过回收站恢复）。默认为移入 Windows 回收站。

.PARAMETER Force
    跳过终端确认提示，直接执行删除（适用于自动化批处理）。

.PARAMETER Detailed
    在清单中展示待删除文件夹内包含的具体文件列表。

.EXAMPLE
    .\clean-empty-audio-dirs.ps1 -Path "D:\Music" -WhatIf
    预览 D:\Music 下所有无音频的子文件夹，不执行删除。

.EXAMPLE
    .\clean-empty-audio-dirs.ps1 -Path "D:\Music"
    扫描并在交互确认后，将无音频子文件夹移入回收站。
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromPipeline = $true)]
    [string]$Path,

    [string[]]$Extensions = @(
        '.mp3', '.flac', '.wav', '.m4a', '.aac',
        '.ogg', '.opus', '.ape', '.wv', '.dsf',
        '.dff', '.aiff', '.alac', '.wma'
    ),

    [switch]$WhatIf,

    [switch]$Permanent,

    [switch]$Force,

    [switch]$Detailed
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 1. 确保目标路径输入
if ([string]::IsNullOrWhiteSpace($Path)) {
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "       Auralis 音乐库空目录与无音频文件夹清理工具" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    $rawInput = Read-Host "请输入或直接拖入目标文件夹路径"
    if ([string]::IsNullOrWhiteSpace($rawInput)) {
        Write-Warning "未提供路径，脚本已退出。"
        exit 0
    }
    $Path = $rawInput.Trim().Trim('"').Trim("'")
}

if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    Write-Error "指定的路径不存在或不是文件夹: $Path"
    exit 1
}

$targetRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).ProviderPath)

# 2. 格式化并规范化音频扩展名集合
$audioExtSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($ext in $Extensions) {
    if ([string]::IsNullOrWhiteSpace($ext)) { continue }
    $cleaned = $ext.Trim()
    if (-not $cleaned.StartsWith('.')) {
        $cleaned = ".$cleaned"
    }
    [void]$audioExtSet.Add($cleaned)
}

Write-Host "`n[配置信息]" -ForegroundColor Cyan
Write-Host "  目标根目录 : $targetRoot"
Write-Host "  识别音频格式: $($audioExtSet -join ', ')"
Write-Host "  删除方式   : $(if ($Permanent) { '彻底永久删除 (Shift+Delete)' } else { '移至 Windows 回收站 (可撤销恢复)' })"
if ($WhatIf) {
    Write-Host "  运行模式   : 试运行预览 (-WhatIf)，不执行任何删除" -ForegroundColor Yellow
}

# 3. 递归扫描目录树（自底向上后序分析）
function Scan-DirectoryNode {
    param(
        [System.IO.DirectoryInfo]$Dir,
        [System.Collections.Generic.HashSet[string]]$AudioExts,
        [bool]$IsRoot
    )

    # 检查是否为目录联接点或符号链接，避免跨盘穿透
    if ($Dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Warning "跳过重解析点/符号链接目录: $($Dir.FullName)"
        return [PSCustomObject]@{
            FullName     = $Dir.FullName
            Name         = $Dir.Name
            IsRoot       = $IsRoot
            HasAudio     = $true # 标记为保留，防止误删联接点
            AudioCount   = 0
            ChildResults = @()
        }
    }

    $audioCount = 0
    try {
        $files = $Dir.GetFiles()
        foreach ($f in $files) {
            if ($AudioExts.Contains($f.Extension)) {
                $audioCount++
            }
        }
    } catch {
        Write-Warning "读取目录文件失败: $($Dir.FullName) - $_"
    }

    $childResults = @()
    try {
        $subDirs = $Dir.GetDirectories()
        foreach ($sub in $subDirs) {
            $childRes = Scan-DirectoryNode -Dir $sub -AudioExts $AudioExts -IsRoot $false
            $childResults += $childRes
            if ($childRes.HasAudio) {
                $audioCount += $childRes.AudioCount
            }
        }
    } catch {
        Write-Warning "读取子目录失败: $($Dir.FullName) - $_"
    }

    return [PSCustomObject]@{
        FullName     = $Dir.FullName
        Name         = $Dir.Name
        IsRoot       = $IsRoot
        HasAudio     = ($audioCount -gt 0)
        AudioCount   = $audioCount
        ChildResults = $childResults
    }
}

# 4. 提取顶层无音频子文件夹候选列表
function Get-PruneCandidates {
    param([psobject]$Node)

    $candidates = @()
    foreach ($child in $Node.ChildResults) {
        if (-not $child.HasAudio) {
            # 当前子目录整个分支均无音频文件，作为顶层剪枝点
            $candidates += $child
        } else {
            # 当前子目录包含音频，继续递归查找其下无音频的子分支
            $candidates += (Get-PruneCandidates -Node $child)
        }
    }
    return $candidates
}

Write-Host "`n正在扫描目录树，请稍候..." -ForegroundColor Gray
$rootItem = Get-Item -LiteralPath $targetRoot
$treeRoot = Scan-DirectoryNode -Dir $rootItem -AudioExts $audioExtSet -IsRoot $true
$pruneCandidates = @(Get-PruneCandidates -Node $treeRoot)

if ($pruneCandidates.Count -eq 0) {
    Write-Host "`n✔ 扫描完成：未发现任何没有音频文件的子文件夹，目录结构整洁，无需清理。`n" -ForegroundColor Green
    exit 0
}

# 5. 汇总待删除文件夹详细指标
function Format-FileSize([long]$Bytes) {
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

$candidateDetails = @()
$totalFreedBytes = 0L
$totalNonAudioFiles = 0

foreach ($c in $pruneCandidates) {
    $filesInside = @(Get-ChildItem -LiteralPath $c.FullName -Recurse -File -Force -ErrorAction SilentlyContinue)
    $subDirsInside = @(Get-ChildItem -LiteralPath $c.FullName -Recurse -Directory -Force -ErrorAction SilentlyContinue)
    
    $folderBytes = 0L
    foreach ($f in $filesInside) {
        $folderBytes += $f.Length
    }
    $totalFreedBytes += $folderBytes
    $totalNonAudioFiles += $filesInside.Count

    $candidateDetails += [PSCustomObject]@{
        Path         = $c.FullName
        FileCount    = $filesInside.Count
        SubDirCount  = $subDirsInside.Count
        TotalBytes   = $folderBytes
        Files        = $filesInside
    }
}

Write-Host "`n==================================================" -ForegroundColor Yellow
Write-Host "             待清理无音频文件夹清单 ($($candidateDetails.Count) 个)" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow

$index = 1
foreach ($item in $candidateDetails) {
    $sizeStr = Format-FileSize $item.TotalBytes
    Write-Host "[$index] $($item.Path)" -ForegroundColor White
    if ($item.FileCount -eq 0 -and $item.SubDirCount -eq 0) {
        Write-Host "    └─ 完全空目录" -ForegroundColor DarkGray
    } else {
        Write-Host "    └─ 包含非音频文件: $($item.FileCount) 个，子文件夹: $($item.SubDirCount) 个，总占用: $sizeStr" -ForegroundColor DarkYellow
    }

    if ($Detailed -and $item.FileCount -gt 0) {
        foreach ($f in $item.Files) {
            Write-Host "       • $($f.Name) ($(Format-FileSize $f.Length))" -ForegroundColor DarkCyan
        }
    }
    $index++
}

Write-Host "--------------------------------------------------" -ForegroundColor Gray
Write-Host "待清理文件夹总数: $($candidateDetails.Count) 个"
Write-Host "涉及非音频文件数: $totalNonAudioFiles 个"
Write-Host "预估释放磁盘空间: $(Format-FileSize $totalFreedBytes)"

if ($WhatIf) {
    Write-Host "`n[试运行完毕] 以上为 -WhatIf 预览结果，未执行任何删除变更。`n" -ForegroundColor Cyan
    exit 0
}

# 6. 安全交互确认
if (-not $Force) {
    $actionName = if ($Permanent) { "【永久删除且不可恢复】" } else { "【移入 Windows 回收站】" }
    $confirm = Read-Host "`n确认将上述 $($candidateDetails.Count) 个文件夹 $actionName 吗？(输入 Y 确认，其它任意键取消)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Warning "操作已由用户取消，未执行删除。"
        exit 0
    }
}

# 7. 执行删除
if (-not $Permanent) {
    Add-Type -AssemblyName Microsoft.VisualBasic
}

$successCount = 0
$failCount = 0

Write-Host "`n正在执行清理..." -ForegroundColor Cyan

foreach ($item in $candidateDetails) {
    try {
        if (-not (Test-Path -LiteralPath $item.Path)) {
            continue
        }

        if ($Permanent) {
            Remove-Item -LiteralPath $item.Path -Recurse -Force -ErrorAction Stop
        } else {
            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
                $item.Path,
                [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
            )
        }
        $successCount++
        Write-Host "  ✔ 已清理: $($item.Path)" -ForegroundColor Green
    } catch {
        $failCount++
        Write-Error "清理失败: $($item.Path) - $_"
    }
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "清理完成总结:" -ForegroundColor Cyan
Write-Host "  成功清理: $successCount 个文件夹" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "  失败数量: $failCount 个文件夹" -ForegroundColor Red
}
Write-Host "  释放空间: $(Format-FileSize $totalFreedBytes)"
Write-Host "==================================================" -ForegroundColor Cyan
