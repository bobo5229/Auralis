# LibraryPage 编排拆分代码审查

- **分支**：`refactor/library-page-orchestration`
- **HEAD**：`301229b1ac5bae58ebf2506d24a205dc1dc31cf1`
- **审查范围**：`4e6b5d97d2555b1ca5892a3754e75deb1247cdd8`..`HEAD`，聚焦 `src/renderer/features/library/**`
- **对照**：`docs/projects/library-page-orchestration/TECHDOC.md`、`docs/projects/library-page-orchestration/IMPLEMENTATION-REPORT.md`
- **日期**：2026-08-28
- **结论**：通过。本轮拆分没有发现可执行回归。

## 审查方法

只读审查，未改生产代码，未 checkout 其他分支。

- 阅读 TECHDOC 冻结不变量与 IMPLEMENTATION-REPORT 的偏差说明。
- 用 worktree reflog 确认 Step commits：`1c045f8` → `403ec8c` → `c1c1705` → `60b6410` → `d9b97b1` → `3325272` → `9dfab40`，另有文档提交 `05e85e2`、`301229b`。
- 逐文件对照拆分后的 composable / 纯函数与拆分前 `LibraryPage.vue` 中仍叠在一起的同名逻辑（主工作区仍保留拆分前页面，约 1557 行，行为基线与 TECHDOC 描述一致）。
- 核对模板 `data-*`、manuscript owner、布局数字、IPC/SQLite/Playbar 边界。

本次未重跑 `vitest` / `typecheck` / `lint`。IMPLEMENTATION-REPORT 记录 19 files / 89 tests 通过，且 `typecheck`、`lint`、`git diff --check` 通过；本审查以源码对照为准。

## Issues

无。对照 `4e6b5d9` 基线与 TECHDOC 冻结不变量，本轮编排拆分没有发现可执行的回归缺陷。

## 不变量核对

| # | 不变量 | 结果 |
| --- | --- | --- |
| 1 | All Songs 走 `loadLibraryCatalogSnapshot(getTrackPage)`，完整聚合后再 commit | 通过 |
| 2 | 刷新优先级 foreground > metadata-save > background；只有一个 `LibraryRequestCoordinator` | 通过 |
| 3 | `play-stats-updated` / `play-stats-reset` 不触发全量重载 | 通过 |
| 4 | 后台视口恢复调用 `resolveLibraryViewportRestoreAction`；用户滚动则放弃；永不滚到 playing/selected/keyboard focus | 通过 |
| 5 | `LIBRARY_LAYOUT_METRICS` 数字未改；`SCROLL_POSITION_RATIO=0.33`；`LIBRARY_TOP_INSET=16` | 通过 |
| 6 | 搜索索引 generation 过期丢弃；前缀字段仍是 title / artist / albumArtist / album | 通过 |
| 7 | 卸载 invalidate coordinator、取消 rAF、解订阅 | 通过 |
| 8 | 模板 `data-track-id` / `data-album-key` / `data-first-track-id`、manuscript owner 仍在 | 通过 |
| 9 | 没有第二套 player store；没有改 IPC / SQLite / Playbar | 通过 |
| 10 | `LibraryPage.vue` `<script setup>` ≤ 650 行 | 通过（第 1–540 行，含标签） |

### 1. 快照与加载

`useLibraryCatalogLoader.fetchLibrarySnapshot` 在 `scope.kind === 'library'` 时只调用 `loadLibraryCatalogSnapshot(options.getTrackPage, isRequestCurrent)`，该函数按游标分页聚合成完整 `tracks` 后才返回；过期 generation 抛 `LibraryCatalogLoadStaleError`，不会把部分数组交给 `createAllSongsLibrarySnapshot`。歌单 / 智能歌单走 `getDetail`，缺失则 `replaceWithLibraryHome()`（页面注入 `router.replace('/')`）。

Coordinator 仍是现有类，composable 内只 `new` 一次。生产路径上没有第二处 `new LibraryRequestCoordinator()`。`begin('background')` 在任何车道占用时返回 `null` 并置 pending；`metadata-save` 先 `waitForForegroundIdle`；foreground 完成时若有 metadata-save waiter 则不 flush background（与基线 `libraryRequestCoordinator.test.ts` 一致）。

`subscribeLibraryEvents` 对 `play-stats-updated` / `play-stats-reset` 直接 return。前台失败写 `initialLoadError`；后台失败只打 `library.catalog` 诊断，不把 `tracks` 置空。

页面接线：

```ts
getTrackPage: (request) => auralis.library.getTrackPage(request),
onSnapshotCommitted: (snapshot) => {
  resetMatchCursor()
  ensureKeyboardFocusTrackId()
  scheduleLibrarySearchIndex(snapshot.tracks)
},
```

与 TECHDOC `commitLibrarySnapshot` 副作用清单一致。

### 2. 视口

`restoreLibraryViewportRestore` 把 capture 交给 `resolveLibraryViewportRestoreAction`：generation 变了 → `no-op`；id 序列不变 → 写回 `scrollTop`；序列变了且原首个可见曲仍在 → `scrollRenderedTrackToTop`（顶对齐，不是 33%）。没有 playing / selected / keyboard 回退。

`scrollToTrackById`、view-switch rAF、`restoreLibraryFocus` 在写 `scrollTop` / focus 前检查 `userScrollGeneration`。wheel / touchstart 仍由 viewport 在 `scrollRef` 上 capture 递增。`SCROLL_POSITION_RATIO` 与 `LIBRARY_TOP_INSET` 分别为 `0.33` 与 `16`。

`LIBRARY_LAYOUT_METRICS` 与基线逐字相同：平铺行 44、封面轨道 40、封面 250、面板 padding 10×2=20、专辑组 padding 28×2=56。

### 3. 搜索与键盘

`scheduleLibrarySearchIndex` 递增 generation，增量构建的 `isCurrent` 绑定该 generation；`jumpToNextSearchMatch` 在 await 之后若 generation 过期、query 变化或 disposed 则丢弃，不滚动。扫描仍走未改动的 `scanLibrarySearchIndex` / `normalizeSearchText`，匹配字段仍是规范化后的四字段前缀。

`/`、Enter、Escape 与 manuscript Arrow/Home/End/Space/Enter 仍按原分支处理。风格切换 watch 在搜索仍聚焦时把焦点写回输入框，不丢 query。

### 4. 生命周期、模板、边界

`onBeforeUnmount` 顺序：`isPageUnmounted = true` → 搜索 `invalidate()`（generation+1）→ viewport `dispose()`（停 watch、卸 scroll/wheel/touchstart、取消两个 rAF）→ context menu `dispose()`（清 feedback timer）→ catalog `dispose()`（`coordinator.invalidate()`、解订阅 `onChanged` / scan-progress、卸歌单 window 事件）→ 卸 `keydown` / `pointerdown`。

模板结构、class、过渡名与基线一致。`SongRow` / `AlbumCoverTrackRow` 仍有 `data-track-id`；封面组仍有 `data-album-key` 与页面落下的 `data-first-track-id`。根节点仍是 `.library-page[data-visual-style='manuscript']`；Teleport 仍是 `.library-overlay`。

页面只 `usePlayback()`，无第二套 player store，无 `@main` import。IPC / SQLite / Playbar / Miniplayer / `settings.chrome.css` 不在本分支 Step commits 的改动面里。冻结模块（coordinator、catalog snapshot 加载、viewport restore 决策、search scan、layout metrics、metadata editor）相对基线未改语义。

## 已核对但非缺陷的偏差

这些与 IMPLEMENTATION-REPORT 一致，不构成回归：

- `useLibraryViewport` 对 `tracks` / `isCoverView` / `derivedIndex` / `albumGroups` / `virtualAlbumGroups` 使用结构类型 `{ readonly value: ... }`，而不是 TECHDOC 字面 `ComputedRef`。运行时仍读 `.value`，页面现有 computed 可以传入。
- `useLibrarySearchSession` 额外返回 `resetMatchCursor()`，供 snapshot commit 重置匹配游标。TECHDOC Step 7 允许。
- 搜索 / 目录 DEV 诊断在 Vitest 中可能打 stdout；scope 仍是 `library.search` / `library.catalog`。

## 基线既有观察（本轮未引入，不作为必须修复项）

以下行为与拆分前 `LibraryPage.vue` 逐行一致。TECHDOC 要求本轮不改产品行为，故不记入 Issues。若后续要修，应单独开缺陷，不要混进编排拆分。

1. **前台 `scrollToPlaybackTrack` 发生在 `isLoading === true` 期间。** 模板用 `v-if="isLoading"` 卸掉列表，`scrollRef` 为 null，`scrollRenderedTrackToRatio` 直接失败；`isLoading = false` 在 `finally` 里、滚动 await 之后才发生。路由切换同样如此。因此「前台滚到当前播放/选中曲」在基线里就已经几乎不会生效，拆分后仍调用同一函数、同一时序。
2. **view-switch rAF 被用户滚动取消后仍走 `finishViewSwitch` → `restoreLibraryFocus`。** focus restore 会用新的 generation 再写一次 33% `scrollTop`。基线如此，拆分只是把回调挪到 `onViewSwitchComplete`。
3. **`LIBRARY_TOP_INSET = 16` 在页面模板与 `useLibraryViewport` 各写一份。** 当前值相同；若以后只改一处会破坏几何。不是现况错误。
4. **`useLibraryCatalogLoader` 对 `useLibraryMetadataEditor` 有 type-only import**（`LibraryMetadataRefreshResult`）。依赖图略反向，运行时无环。

## GUI

隔离分支未做人工 GUI 确认。IMPLEMENTATION-REPORT 列出的 modern/manuscript 双切、flat/cover、搜索 Enter 循环、后台刷新时用户滚动、右键加入歌单、元数据保存后焦点归还，仍待主分支人工验证。本审查不把未跑过的 GUI 写成已完成。
