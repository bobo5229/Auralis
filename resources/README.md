# 应用资源

| 目录     | 用途                                                   | Git 策略                       |
| -------- | ------------------------------------------------------ | ------------------------------ |
| `icons/` | 图标源文件、PNG/ICO 导出及来源说明；开发窗口与打包共用 | 跟踪                           |
| `audio/` | 本地准备的 mpv、FFmpeg，以及许可证文件                 | 忽略 `*.exe`，跟踪说明与许可证 |

图标以 [icons/](icons/) 为唯一来源，[来源说明](icons/SOURCE-ATTRIBUTION.txt) 随图标保留。
`package.json` 已引用这里的图标，打包产物放在 `release/`。

## 准备音频工具

在仓库根目录运行已有脚本，将明确选择的本地二进制复制到 `resources/audio/`：

```powershell
powershell -File scripts/mpv-probe/stage-runtime.ps1 -MpvExecutable 'C:\path\to\mpv.exe' -FfmpegExecutable 'C:\path\to\ffmpeg.exe'
Get-FileHash -LiteralPath resources/audio/mpv.exe, resources/audio/ffmpeg.exe -Algorithm SHA256
```

脚本使用显式来源路径，不修改系统 PATH。二进制不会随 Git 检出，需要单独准备；相关探测说明见
[mpv-probe](../scripts/mpv-probe/README.md)。

## 当前本地二进制记录

以下版本来自 2026-09-26 的实际 `--version` / `-version` 输出，SHA-256 来自实际文件。

| 文件               | 版本                                                      | SHA-256                                                            |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `audio/mpv.exe`    | `v0.41.0-dev-gc64675679`，构建时间 `Sep 22 2026 07:30:14` | `ACABDF60EEE6D3BF92B5DDDDE2F1371774E1EF1FCEAB3E674CF7A7F594DDC060` |
| `audio/ffmpeg.exe` | `8.0.1-full_build-www.gyan.dev`                           | `74DB6C184A03DBA2BDFE23E1A1F41CF5A8385BC1DE6A7A1B26DB1DC541ABEF93` |

原始下载地址未留档；这里记录本机已有文件的身份与本地准备方式。替换运行时时同步更新版本、
校验值、来源和对应许可证。
