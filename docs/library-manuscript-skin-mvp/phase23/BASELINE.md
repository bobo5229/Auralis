# Phase 23 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`ace7b7c`（`chore：格式化视口恢复改动文件以通过 lint 门禁`）
**状态**：Step 23.0 已完成；23.1 尚未改 PlayerBar / manuscript.player.css
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)（本阶段设计文档，随 23.0 一并入库）

## 1. 前置状态

| 阶段       | 真实结论                                       | 明确不宣称             |
| ---------- | ---------------------------------------------- | ---------------------- |
| Phase 1–17 | 工程与人工验收均已完成（用户 2026-08-13 回填） | 不补造截图或性能数字   |
| Phase 18   | 工程完成；Electron 人工矩阵待确认              | 不写完全交付           |
| Phase 22   | 工程完成；Electron 人工矩阵待确认              | 不写完全交付           |
| Phase 19–21 | 已预留槽位（全屏 / Miniplayer / 桌面歌词）    | 本阶段不占用          |

Phase 23 只覆盖普通主窗口 manuscript PlayerBar，不以外壳视觉工作重新打开既有人工矩阵。
Phase 18 / 22 人工矩阵仍待用户确认，本阶段不替它们关闭。

## 2. 进入 Step 23.0 时的 `git status --short`

```text
 M AGENTS.md
 M docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md
 M docs/library-manuscript-skin-mvp/phase16/BASELINE.md
 M docs/library-manuscript-skin-mvp/phase18/BASELINE.md
 M docs/library-manuscript-skin-mvp/phase18/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase22/BASELINE.md
 M docs/library-manuscript-skin-mvp/phase22/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase22/TECHDOC.md
 M docs/library-manuscript-skin-mvp/phase6/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase9/DELIVERY.md
 M scripts/check-library-visual-scope.mjs
 M src/renderer/features/library/components/AlbumCoverGroup.vue
 M src/renderer/features/library/components/AlbumCoverTrackRow.vue
 D src/renderer/features/library/components/LibraryArchiveHeader.vue
 M src/renderer/features/library/components/LibraryContextMenu.vue
 M src/renderer/features/library/constants/libraryArchivePresentation.ts
 M src/renderer/features/library/styles/manuscript.css
 M uno.config.ts
?? docs/library-manuscript-skin-mvp/phase23/
```

工作树中的已修改文件为 **Phase 22 扩权在途工作**（用户未提交）：删除 LibraryArchiveHeader、
搜索顶栏改浮层、cover-track-row 列宽调整、库内 components/constants/CSS 修改、guard 与
`uno.config.ts` 修改，以及若干 docs 状态/对齐改动。这些不属于 Phase 23 所有权，随用户后续
提交处理；本阶段提交不含它们。`phase23/` 目前仅含 `TECHDOC.md`。

## 3. 当前 PlayerBar 几何现状摘录（改造对象）

Uno shortcut（`uno.config.ts`）：

```ts
'player-bar':
  'fixed left-1/2 bottom-[var(--auralis-player-bottom-gap)] z-50 flex h-18
   w-[min(960px,calc(100vw-320px))] min-w-[720px] -translate-x-1/2 items-center gap-5
   rounded-full border border-[var(--auralis-playbar-border)] bg-[var(--auralis-playbar-bg)]
   px-6 shadow-[var(--auralis-playbar-shadow)]',
```

main.css 覆写：`.player-bar { left: calc(50vw + 122px); }`，≥1280px 为 `calc(40vw + 122px)`。
`h-18` = 72px，`--auralis-player-bottom-gap` = 44px，`--auralis-playbar-safe-area` = 116px。

模板三段顺序：`transport-controls | TrackProgressInfo | playback-actions`；音量 slider 常驻内联。

## 4. 目标几何契约（TECHDOC §5.1）

```text
position: fixed; left: 260px; right: 0; bottom: 0; height: 72px;
width: auto; min-width: 0; transform: none;
border-radius: 16px 16px 0 0; overflow: visible
```

只允许在 `.player-bar[data-player-presentation='manuscript']` owner 作用域生效；modern 保持
悬浮几何与 `--auralis-playbar-safe-area: 116px`；manuscript 双 safe-area 为 88px（72 + 16）。

## 5. 保留边界（不得误拆）

- modern PlayerBar 几何 / 材质 / 行为完全不变；Fullscreen / Miniplayer / 桌面歌词不命中。
- `--auralis-playbar-safe-area: 116px` 全局值不变；88px 只以 manuscript presentation 派生。
- 虚拟列表行高、封面几何、`libraryLayoutMetrics`、TrackProgressInfo 功能语义、material 偏好、
  IPC / SQLite / 播放引擎不改。
- queue / mode / lyrics toast overlay 的 owner marker、焦点模型、向上展开与 `overflow: visible`
  保持。

## 6. 已提交源码范围（Phase 23 起点）

```text
74dbddc..ace7b7c  （Phase 22 工程 + 视口恢复修复链）
```

本阶段提交将在 `ace7b7c` 之上继续，不回写历史 Phase 18 / 22 文档中的悬浮描述。
