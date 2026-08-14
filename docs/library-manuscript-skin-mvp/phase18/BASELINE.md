# Phase 18 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`355c906`（`docs：写入 Phase 17 审查收口提交哈希`）
**状态**：Step 18.0 已完成；18.1 尚未改播放器源码

## 1. 前置状态

| 阶段       | 真实结论                                       | 明确不宣称             |
| ---------- | ---------------------------------------------- | ---------------------- |
| Phase 1–17 | 工程与人工验收均已完成（用户 2026-08-13 回填） | 不补造截图或性能数字   |
| Phase 9–11 | 当前曲库规模下的视觉与功能项已回填             | 10k / 50k 容量门禁延期 |
| Phase 15   | 完全交付；人工验收通过                         | 不新增 Phase 18 阻塞项 |
| Phase 16   | 完全交付；人工验收通过                         | 同上                   |
| Phase 17   | 完全交付；人工验收通过                         | 同上                   |

Phase 18 不以外壳视觉工作重新打开 Phase 15–17 人工矩阵。Phase 9–11 容量门禁仍延期，
不误写为 Phase 18 阻塞项。

## 2. 进入 Step 18.0 时的 `git status --short`

```text
 M docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md
 M docs/library-manuscript-skin-mvp/phase15/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase15/TECHDOC.md
 M docs/library-manuscript-skin-mvp/phase16/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase16/TECHDOC.md
 M docs/library-manuscript-skin-mvp/phase17/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase17/TECHDOC.md
?? docs/library-manuscript-skin-mvp/phase18/
```

工作树中的已修改文档为 Phase 1–17 人工验收状态回填（用户确认），纳入 Step 18.0 提交。
`phase18/` 目前仅含 `TECHDOC.md`。

## 3. 未提交改动所有权

### 3.1 Phase 18 本阶段文档

- `docs/library-manuscript-skin-mvp/phase18/TECHDOC.md`
- `docs/library-manuscript-skin-mvp/phase18/BASELINE.md`

### 3.2 明确不纳入本阶段

- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`（Phase 19）
- `src/renderer/app/layout/MiniPlayer.vue` 与窗口尺寸控制（Phase 20）
- 桌面歌词独立窗口及其 drag、锁定、点击穿透和 DPI 行为（Phase 21 产品决策）
- Windows 原生标题栏
- `src/main/`、`src/preload/`、`src/shared/ipc/` 与数据库代码
- 已交付内容页 manuscript composition，除非为共享 token 增加 player owner 作用域

## 4. 播放表面代码基线

- `App.vue` 非 `mini` 分支依次渲染 `AppSidebar`、`RouterView`、`NowPlayingPanel`、`PlayerBar`、`FullscreenPlayerOverlay`；`.app-window[data-shell-presentation]` 已由 Phase 17 建立，但 shell marker 不得泄漏到播放器。
- `PlayerBar.vue`：三段布局（transport / TrackProgressInfo / playback-actions）；`useArtworkPalette(currentArtworkCacheKey)` 当前始终启用；album tint 由 420ms timer 与 previous/active 两个 ref 驱动；`playerBarMaterial` 持久化 `cover-tint | liquid-glass`。
- `TrackProgressInfo.vue`：进度 rAF 订阅、pointer capture、键盘 seek 与封面打开全屏；属播放交互契约，不得因换肤重写。
- `PlaybackQueuePopover.vue` / `PlaybackModeMenu.vue`：非 Teleport，位于 PlayerBar DOM 内；当前只有基础 `role='menu'` 与 Escape 关闭，无完整焦点模型。
- `NowPlayingPanel.vue` 只包装 `LyricsPanel.vue`（`SyncedLyricsView` / `PlainLyricsView` / `LyricsEmptyState`）；`.has-artwork .now-playing-panel` 在 `main.css` 启用透明背景、blur 与 saturate。
- `main.css` 现代播放器效果集中在：`.player-bar` 玻璃/阴影、`.player-bar-glass`、`.player-bar-album-tint-*`、`.track-progress` shimmer、`.queue-popover` / `.playback-mode-menu` 的 backdrop-filter 与封面 tint `::after`、`.desktop-lyrics-toast` blur、`.has-artwork .now-playing-panel` blur。
- `uno.config.ts`：`now-playing-panel`、`player-bar`、`queue-popover`、`playback-mode-menu`、`lyric-*` 等 shortcuts 已存在，无任何 `--manuscript-*` 引用。
- `manuscript.tokens.css`：`.app-window[data-shell-presentation='manuscript']` 只注入 `--manuscript-*` 语义 token；Compatibility remap 刻意不覆盖 `.app-window`，以保护播放器现代 token。

## 5. 基线测试

- `src/renderer/app/utils/shellPresentation.test.ts`：mini 永远 modern。
- `src/renderer/features/playback/composables/useArtworkPalette.test.ts`：enabled 契约（禁用不加载、重启用立即加载、在途结果失效、key 缺失回退）。
- `src/renderer/features/appearance/utils/rovingIndex.test.ts`：方向键 / Home / End 环绕。
- `scripts/check-library-visual-scope.mjs`：`assertShellCssScope` 禁止 shell CSS 命中 `now-playing|player-bar|player-control|queue-|playback-mode-|mini-player|desktop-lyrics|fullscreen`。
