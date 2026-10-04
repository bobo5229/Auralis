# 舞台保留资产

2026-10-03：声迹正式入口 `/archive` 已收拢为 Mac 终端，`/archive/mac` 重定向到正式入口。

2026-10-05 当前实现：Mac 整机、星空穿梭和每日专辑统计；右侧为 2.5D 悬浮软盘。拖入、双击或按钮插盘后 CRT 显示对应专辑，可退盘。键盘、鼠标、面板式列表和投影光束已移除。插盘仅改变视图状态，不触发播放。

大屏概念版：保留 280×365×215 的外壳、场景缩放与摆放位置，屏幕凹槽从 230×167 调整到 244×256（正面高度约 70%）。CRT 使用 512×544 逻辑画布，封面、标题与艺术家纵向排列，统计固定在下方。软盘槽下移到机身 y=300，标志、指示灯与铭牌收拢到短下巴；插盘落点继续从实际槽口几何读取。这是声迹用的比例再设计，并非原版 128K 的尺寸复刻。

顶部导航在穿梭完成后提供「返回星空」。返回会关闭日历，取消插盘/退盘或拖盘并清除临时软盘、已载入内容；Mac 恢复初始小尺寸姿态，星空重新初始化，再次双击或按 Enter、空格即可穿梭。当前日期和所选软盘保留，减少动态效果模式下直接切换且不自转。返回同时清除本会话的已进入标记，离开页面再回来仍处于初始星空并保留日期。

以下文件供后续复用，当前页面没有导入或初始化它们：

- `macStage.ts`、`macStageRenderer.js`、`macStageRenderer.d.ts`：实体舞台控制器与渲染器。
- `macStage.html`、`macStage.css`：从原组合页面拆出的舞台结构和样式。
- `coverPipeline.ts`、`coverQuantize.worker.ts`：封面量化与缓存，许可见 `NOTICE.md`、`LICENSE`。
- `../canvas/archiveStage.*`、`../canvas/archiveHologram.*`：早期舞台与共用全息算法。
- `../canvas/archiveStageFonts.css`：旧舞台字体声明，字体源文件仍保留于 `assets/fonts/archive/`，不再通过全局 CSS 打包。

`loadTray.ts`、`loadTray.css` 及对应测试保留为早期抽屉资产，当前页面已取消导入和初始化。软盘交互由 `archiveDisks.ts` 管理，沿 Mac 自带槽口装入，不再使用抽屉。

当前运行验证入口为 `scripts/capture-archive-mac.mjs`，使用正式 Electron 和隔离曲库，结果与截图输出到 `.electron-home/archive-mac-only/`。此前的 `capture-archive-mac-preview.mjs` 对应历史舞台预览版本。
