# 舞台保留资产

2026-10-03：声迹正式入口 `/archive` 已收拢为 Mac 终端，`/archive/mac` 重定向到正式入口。

当前页面保留 Mac 整机、CRT 桌面、真实日期统计和收起待用的托盘。舞台、星空、连接线、封面拖入及其播放入口已退出页面。

以下文件供后续复用，当前页面没有导入或初始化它们：

- `macStage.ts`、`macStageRenderer.js`、`macStageRenderer.d.ts`：实体舞台控制器与渲染器。
- `macStage.html`、`macStage.css`：从原组合页面拆出的舞台结构和样式。
- `coverPipeline.ts`、`coverQuantize.worker.ts`：封面量化与缓存，许可见 `NOTICE.md`、`LICENSE`。
- `../canvas/archiveStage.*`、`../canvas/archiveHologram.*`：早期舞台与共用全息算法。
- `../canvas/archiveStageFonts.css`：旧舞台字体声明，字体源文件仍保留于 `assets/fonts/archive/`，不再通过全局 CSS 打包。

`loadTray.ts`、`loadTray.css` 仍由 Mac 页面装配，默认收起；不绑定专辑装入或播放命令。

当前运行验证入口为 `scripts/capture-archive-mac.mjs`，使用正式 Electron 和隔离曲库，结果与截图输出到 `.electron-home/archive-mac-only/`。此前的 `capture-archive-mac-preview.mjs` 对应历史舞台预览版本。
