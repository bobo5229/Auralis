# Phase 17 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`0c6d868`（`docs：归档手稿皮肤 TECHDOC 状态同步`）
**状态**：Step 17.0 已完成；17.1 尚未改外壳源码

## 1. 前置状态

| 阶段       | 真实结论                           | 明确不宣称               |
| ---------- | ---------------------------------- | ------------------------ |
| Phase 16   | 工程完成                           | Electron 人工矩阵未执行  |
| Phase 15   | 工程完成；审查 Findings 已修复     | Electron 人工矩阵未执行  |
| Phase 14   | 工程完成；源码与文档已提交         | 不属于 Phase 17 提交范围 |
| Phase 9–11 | 当前曲库规模下的视觉与功能项已回填 | 10k / 50k 容量门禁延期   |

Phase 17 不以外壳视觉工作关闭 Phase 15 / 16 人工矩阵。原生标题栏已在 `c9e4913` 回到系统框架，本阶段不得再引入 Renderer 窗口按钮或 drag region。

## 2. 进入 Step 17.0 时的 `git status --short`

```text
?? docs/library-manuscript-skin-mvp/phase17/
```

工作树中不再有 Phase 14 或原生窗口框架的未提交改动。唯一未跟踪内容是本阶段文档目录。

## 3. 未提交改动所有权

### 3.1 Phase 17 本阶段文档

- `docs/projects/library-manuscript-skin-mvp/phase17/TECHDOC.md`
- `docs/projects/library-manuscript-skin-mvp/phase17/BASELINE.md`

### 3.2 明确不纳入本阶段

- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`
- `src/renderer/app/layout/MiniPlayer.vue`
- `src/main/`、`src/preload/`、`src/shared/ipc/` 与数据库代码
- 已交付内容页 manuscript composition，除非为共享 token 增加 shell owner 作用域

## 4. 外壳与 Sidebar 代码基线

- 普通模式根节点为 `.app-window[data-app-shell-root]`，Miniplayer 走独立 `v-if="displayMode === 'mini'"` 分支。
- `displayMode` 实际类型为 `PlayerDisplayMode = 'normal' | 'fullscreen' | 'mini'`，不是 TECHDOC 示意中的 `'full' | 'mini'`。
- 普通模式始终调用 `useArtworkPalette(artworkCacheKey)`，有封面时挂载 `FluidArtworkBackground` 与 `.app-shell-bg-overlay`。
- `AppSidebar` 无 presentation prop；Teleport 菜单复用 `.library-context-menu`，Dialog 使用 `.smart-playlist-*`，`FacetsDialog` 无 owner marker。
- Sidebar 宽度 232px，shell grid 与 xl 断点保持现有 UnoCSS shortcut。
- `useArtworkPalette` 尚无 `enabled` 契约；PlayerBar 与 Miniplayer 也调用该 composable，默认行为必须保持开启。
- 共享 manuscript token 当前未挂到 shell / Sidebar / sidebar-overlay owner。

## 5. 截图

不补造 PNG。modern 外壳、有封面 / 无封面、歌单树与浮层截图留待 Step 17.8 Electron 人工矩阵采集。

## 6. 进入时自动门禁

| 命令           | 结果                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| `npm.cmd test` | 通过；19 files / 2 skipped；76 tests passed / 18 skipped；视觉作用域通过 |

该结果证明当前基线可运行测试，不表示 Phase 17 源码已完成，也不替代 17.8 人工矩阵。
