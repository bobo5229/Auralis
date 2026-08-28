# TECHDOC：LibraryPage 编排拆分

- **日期**：2026-08-28
- **状态**：工程方案冻结；在隔离分支 `refactor/library-page-orchestration` 上实现
- **覆盖对象**：`src/renderer/features/library/pages/LibraryPage.vue` 的 script 编排
- **明确排除**：Playbar、Miniplayer、Fullscreen、桌面歌词、IPC、SQLite、扫描、快照分页协议、虚拟列表几何数字、manuscript CSS owner

## 1. 结论

这次优化只拆 `LibraryPage.vue` 里还叠在一起的编排，不改曲库产品行为。

页面今天已经把快照、coordinator、搜索索引、视口恢复决策、元数据编辑抽成纯模块。剩下的危险区是 **同一文件同时拥有**：三条加载通道的 UI 副作用、搜索会话、滚动 generation、双虚拟列表、键盘焦点、右键菜单。目标是按现有模式继续拆：

```text
可测纯函数  →  拥有一块状态的 composable  →  页面只接线与模板
```

禁止再造一套播放 store，禁止把 15 个 ref 包进一个空壳 composable，禁止改几何或快照协议。

页面 script 从约 1333 行降到约 450–600 行。模板、CSS owner、虚拟列表 DOM 留在页面。

## 2. 非目标

| 不做 | 原因 |
| --- | --- |
| 改 `library:get-track-page` / 游标 / OFFSET | 现有消费者依赖完整有序快照 |
| 改 `LIBRARY_LAYOUT_METRICS` 任何数字 | 虚拟列表与 CSS 必须同步；本轮不同步改几何 |
| 抽 TanStack virtualizer 出页面 | 与模板、`scrollRef`、行高公式绑死 |
| 重写搜索算法或繁简表 | `normalizeSearchText` / `scanLibrarySearchIndex` 已独立 |
| 动 `usePlayback`、扫描、备份、IPC | 不在本文件优化范围内 |
| 视觉风格切换 remount `RouterView` / Sidebar | Agents.md 硬约束 |
| 为拆而拆已经独立的模块 | 见 §4 |

## 3. 冻结不变量

实现者必须把这些当作测试与 review 的验收标准。行为变化即回归。

### 3.1 快照与加载

1. All Songs 只走 `loadLibraryCatalogSnapshot(auralis.library.getTrackPage)`，聚合完整数组后再 `commitLibrarySnapshot`。
2. 禁止 SQLite `OFFSET`、禁止复用过期游标、禁止把部分数组交给封面分组 / 搜索 / 播放队列。
3. 刷新优先级：`foreground > metadata-save > background`。实现继续使用现有 `LibraryRequestCoordinator`，不得改其语义。
4. `play-stats-updated` / `play-stats-reset` 不得触发全量重载。
5. 前台加载失败写 `initialLoadError`；后台失败只打诊断，不清空当前列表。
6. 歌单 / 智能歌单走 `getDetail`，不走 catalog page。详情缺失则 `router.replace('/')`。

### 3.2 视口

7. 后台刷新视口恢复必须调用现有 `resolveLibraryViewportRestoreAction`：用户滚动则放弃；id 序列不变则写回 `scrollTop`；序列变了则把**原首个可见曲**滚到顶部，永不滚到 playing / selected / keyboard focus。
8. 前台加载仍滚到当前播放或选中曲（33% 视口，`SCROLL_POSITION_RATIO = 0.33`）。
9. `userScrollGeneration`：wheel / touchstart 递增；`scrollToTrackById`、view-switch rAF、focus restore 必须在写 `scrollTop` 前检查。
10. 平铺行 44px、封面轨道 40px、封面 250px、面板垂直 padding 合计 20px、专辑组垂直 padding 合计 56px。只读 `LIBRARY_LAYOUT_METRICS`。

### 3.3 搜索与键盘

11. 搜索索引增量构建，generation 过期丢弃；完整冻结后才给 `scanLibrarySearchIndex`。
12. 匹配字段仍是规范化后的 title / artist / albumArtist / album **前缀**。
13. `/` 聚焦搜索；Enter 跳下一命中；Escape 清空或失焦。manuscript 列表 Arrow/Home/End/Space/Enter 键盘模型不变。
14. 风格切换不得丢失选择、播放队列、搜索 query、右键菜单、元数据对话框、懒加载。

### 3.4 视觉与生命周期

15. presentation 只由 `resolveLibraryPresentation(route.name, visualStyle)` 决定。
16. manuscript 选择器继续挂在 `.library-page[data-visual-style='manuscript']`；Teleport 仍是 `.library-overlay`。
17. 卸载必须：`coordinator.invalidate()`、取消 rAF、去掉 listener、递增 search generation、解订阅 `library.onChanged` / scan-progress。

## 4. 当前基线（禁止重做）

这些模块已经存在，本轮只消费，不改语义、不合并、不改名。

| 模块 | 职责 |
| --- | --- |
| `utils/libraryRequestCoordinator.ts` | generation 与三车道 |
| `utils/loadLibraryCatalogSnapshot.ts` | 分页聚合 |
| `utils/libraryDataSnapshot.ts` | All Songs / 歌单快照 |
| `utils/libraryCatalogViewIndex.ts` | 分组 + id 查找 + 封面偏移 |
| `utils/libraryViewportRestore.ts` | 后台刷新视口决策 |
| `utils/librarySearchIndex.ts` | 增量索引 |
| `utils/librarySearchScan.ts` | 前缀扫描 |
| `utils/libraryPresentation.ts` | route.name + visualStyle |
| `utils/libraryRouteScope.ts` | 路由身份与外部歌单事件 |
| `composables/useLibraryMetadataEditor.ts` | 元数据打开/保存/焦点归还 |
| `constants/libraryLayoutMetrics.ts` | 几何单一事实源 |

`LibraryPage.vue` 仍是编排中枢。下面的 Step 只搬它还没搬走的块。

## 5. 目标结构

```text
src/renderer/features/library/
  pages/LibraryPage.vue          # 路由、presentation、双 virtualizer、模板接线
  composables/
    useLibraryMetadataEditor.ts  # 已有
    useLibrarySearchSession.ts   # 新增：搜索会话
    useLibraryViewport.ts        # 新增：滚动 generation / 定位 / 首个可见
    useLibraryCatalogLoader.ts   # 新增：loadLibraryData + 订阅
    useLibraryContextMenu.ts     # 新增：右键菜单与加入歌单
  utils/
    libraryKeyboardFocus.ts      # 新增：纯函数
    libraryFirstVisibleTrack.ts  # 新增：纯函数
```

依赖方向（不允许反向）：

```text
libraryKeyboardFocus / libraryFirstVisibleTrack
        ↑
useLibraryViewport
        ↑
useLibrarySearchSession ─┐
useLibraryContextMenu  ─┼─→ LibraryPage.vue
useLibraryCatalogLoader─┘
        ↑
useLibraryMetadataEditor（已有）
```

页面保留：

- `useVirtualizer` 两套（flat / cover）与模板
- `libraryPresentation` / `librarySurfaceKind`
- `tracks` / `pageIdentity` / `isLoading` / `libraryViewMode`
- 把 composable 返回值接到模板事件

## 6. 分 Step 实现

每一步必须：先写或扩展失败测试 → 最小实现 → 跑相关 Vitest → 中文 conventional commit。  
Windows 上只用 `npm.cmd`。不要在实现中途切回 `dev`，不要改隔离 worktree 以外的文件。

---

### Step 0 — 隔离分支（编排者执行，不由 worker 再做）

1. 当前工作区留在 `dev`，保留用户未提交的 HANDOFF 改动。
2. 从当前 `HEAD` 建分支 `refactor/library-page-orchestration`。
3. 用 git worktree 检出到 `.worktrees/library-page-orchestration`。
4. 把**当前工作区**的 `src/renderer/features/library/` 与 `src/renderer/shared/diagnostics/` 覆盖进 worktree，作为本优化的真实基线（含已抽模块）。
5. 本 TECHDOC 进入 worktree 并跟踪。
6. `.gitignore` 增加 `.worktrees/`，以及 `docs/library-page-orchestration/` 例外。

Worker 只在该 worktree 里改文件、提交。禁止 `git checkout dev`、禁止 push、禁止 reset 用户工作区。

---

### Step 1 — 冻结现有纯模块回归

**Files**

- 不改生产代码
- 跑：`libraryRequestCoordinator.test.ts`、`libraryViewportRestore.test.ts`、`loadLibraryCatalogSnapshot.test.ts`、`libraryCatalogViewIndex.test.ts`、`librarySearchScan.test.ts`、`useLibraryMetadataEditor.test.ts`、`libraryLayoutMetrics.test.ts`

**要求**

```powershell
npm.cmd exec vitest run src/renderer/features/library --config vitest.config.ts
```

必须全绿。若失败：停下来修基线，不要开始拆。本步 commit 仅在确实补了缺失断言时才需要；全绿则不必空 commit。

---

### Step 2 — 纯函数：键盘焦点目标

**Create**

- `src/renderer/features/library/utils/libraryKeyboardFocus.ts`
- `src/renderer/features/library/utils/libraryKeyboardFocus.test.ts`

**从页面挪出的行为（保持完全一致）**

`ensureKeyboardFocusTrackId` 的选择顺序：

1. 当前 `keyboardFocusTrackId` 仍在 `trackIndexById` 中 → 保留
2. 否则 `playback.selectedTrackId` 若在索引中 → 用它
3. 否则 `playback.currentTrackId` 若在索引中 → 用它
4. 否则 `tracks[0].id`
5. 空列表 → `null`

`moveKeyboardFocus` 的目标下标：

- `first` → `0`
- `last` → `length - 1`
- `next` → `min(length-1, currentIndex+1)`，`currentIndex < 0` 时视为 `0`
- `prev` → `max(0, currentIndex-1)`，`currentIndex < 0` 时视为 `0`

**接口（必须按此签名）**

```ts
export function resolveKeyboardFocusTrackId(input: {
  trackCount: number
  currentFocusId: number | null
  selectedTrackId: number | null
  currentTrackId: number | null
  hasTrack: (id: number) => boolean
  firstTrackId: number | null
}): number | null

export type LibraryKeyboardMoveDirection = 'next' | 'prev' | 'first' | 'last'

export function resolveKeyboardMoveIndex(input: {
  direction: LibraryKeyboardMoveDirection
  currentIndex: number
  lastIndex: number
}): number
```

`lastIndex` 为 `tracks.length - 1`。空列表由调用方短路，本函数不接收负数 length。

**页面改动**

`ensureKeyboardFocusTrackId` / `moveKeyboardFocus` 改为调用上述纯函数；DOM focus、`scrollToTrackById` 仍留页面或留给 Step 3 的 viewport。本步不要把键盘事件处理器整段搬进 Vue composable。

**测试至少覆盖**

- 有效当前焦点不改
- 失效焦点回退 selected → current → first
- 空列表返回 null
- next/prev 夹紧；currentIndex = -1 时 next/prev 都落到 0
- first/last

**Commit**：`refactor：抽出曲库键盘焦点纯函数`

---

### Step 3 — 纯函数：首个可见曲目

**Create**

- `src/renderer/features/library/utils/libraryFirstVisibleTrack.ts`
- `src/renderer/features/library/utils/libraryFirstVisibleTrack.test.ts`

**从 `updateFirstVisibleTrackIndex` 挪出计算，不挪 rAF。**

```ts
export function resolveFirstVisibleTrackIndex(input: {
  scrollTop: number
  topInset: number
  isCoverView: boolean
  flatRowHeight: number
  trackCount: number
  virtualAlbumGroups: ReadonlyArray<{ index: number; end: number }>
  albumGroups: ReadonlyArray<{ firstTrackIndex: number }>
}): number
```

规则（与现页面逐行一致）：

- `trackCount === 0` → `0`（调用方也可直接 return；函数仍须安全）
- `offset = max(0, scrollTop - topInset)`
- 平铺：`floor(offset / flatRowHeight)`
- 封面：在 `virtualAlbumGroups` 里找第一个 `end > offset`，否则第一项；取其 `albumGroups[index].firstTrackIndex`；找不到组则 `0`
- 最后 `clamp` 到 `[0, trackCount - 1]`；`trackCount === 0` 时返回 `0`

`LIBRARY_TOP_INSET`（16）和 `flatRowHeight` 由调用方传入，函数内不 import 布局常量也可以，但测试要使用真实 `LIBRARY_LAYOUT_METRICS.flatRowHeight` 与 `16`。

**页面改动**：`updateFirstVisibleTrackIndex` 只读 DOM/`scrollRef`，把数字交给纯函数后写回 `firstVisibleTrackIndex`。

**Commit**：`refactor：抽出曲库首个可见曲目计算`

---

### Step 4 — `useLibrarySearchSession`

**Create**

- `src/renderer/features/library/composables/useLibrarySearchSession.ts`
- `src/renderer/features/library/composables/useLibrarySearchSession.test.ts`

**搬入的状态与函数**

- `searchQuery`、`isSearchFocused`、`isSearchZoneHovered`
- `searchInputRef`、`searchRootRef`、`searchOutcome`
- `lastSearchQuery`、`lastMatchedTrackIndex`
- `librarySearchIndexGeneration`、`librarySearchIndexPromise`
- `scheduleLibrarySearchIndex`
- `jumpToNextSearchMatch` / `clearSearch`
- `onLibraryListMouseMove` / `onLibraryListMouseLeave`
- `onSearchBarPointerDown` / `onSearchInputFocus` / `onSearchInputBlur` / `onSearchKeydown`
- `onDocumentPointerDown` 里与搜索条相关的部分
- `onWindowKeyDown` 的 `/` 快捷键
- `watch(searchQuery)` 清空 outcome
- `shouldRenderSearchBar` / `hasSearchQuery`

**不要搬**

- `scrollToTrackById`（通过回调注入）
- 诊断 scope 字符串可保持 `library.search`

**接口**

```ts
export function useLibrarySearchSession(options: {
  isDisposed: () => boolean
  isLibrarySurface: () => boolean
  isInteractiveTarget: (target: EventTarget | null) => boolean
  scrollToTrackIndex: (index: number) => Promise<void>
}): {
  searchQuery: Ref<string>
  isSearchFocused: Ref<boolean>
  isSearchZoneHovered: Ref<boolean>
  searchInputRef: Ref<HTMLElement | null>
  searchRootRef: Ref<HTMLElement | null>
  searchOutcome: Ref<LibrarySearchOutcome>
  hasSearchQuery: ComputedRef<boolean>
  shouldRenderSearchBar: ComputedRef<boolean>
  scheduleLibrarySearchIndex: (tracks: readonly TrackListItem[]) => void
  jumpToNextSearchMatch: () => Promise<void>
  clearSearch: () => void
  onLibraryListMouseMove: (event: MouseEvent) => void
  onLibraryListMouseLeave: () => void
  onSearchBarPointerDown: () => void
  onSearchInputFocus: () => void
  onSearchInputBlur: () => void
  onSearchKeydown: (event: KeyboardEvent) => void
  onDocumentPointerDown: (event: PointerEvent) => void
  onWindowKeyDown: (event: KeyboardEvent) => void
  invalidate: () => void
}
```

`invalidate()` 在页面 `onBeforeUnmount` 里调用：generation +1，使进行中的索引构建过期。现有 `createLibrarySearchIndexIncrementally` / `scanLibrarySearchIndex` / `normalizeSearchText` 原样使用。

`commitLibrarySnapshot` 仍由页面或 loader 调用 `scheduleLibrarySearchIndex(snapshot.tracks)`。

测试用注入的 fake `scrollToTrackIndex` 与短 tracks 夹具，覆盖：空 query → idle；命中调用 scroll；generation 过期不滚动；Escape 清空。

**Commit**：`refactor：抽出曲库搜索会话`

---

### Step 5 — `useLibraryViewport`

**Create**

- `src/renderer/features/library/composables/useLibraryViewport.ts`
- `src/renderer/features/library/composables/useLibraryViewport.test.ts`

**搬入**

- `userScrollGeneration` 及 capture / cancel / `onUserScrollInput`
- `firstVisibleTrackIndex`、`scheduleFirstVisibleTrackIndexUpdate`、`pendingFirstVisibleTrackFrame`
- `scrollRenderedTrackToRatio` / `scrollRenderedTrackToTop` / `scrollToTrackById` / `scrollToTrackIndex` / `scrollToPlaybackTrack`
- `captureLibraryViewportRestore` / `restoreLibraryViewportRestore`
- `pendingViewSwitchTrackId` / `pendingViewSwitchScrollFrame` / `onLibraryViewEnter`
- `scrollRef` 的 scroll/wheel/touchstart 绑定（从页面的 `watch(scrollRef)` 搬入，提供 `bindScrollElement` 或内部 watch）
- 卸载时取消两个 rAF

**不要搬**

- `switchLibraryViewMode` 的持久化（localStorage / playlist IPC）和关菜单。页面继续改 `libraryViewMode` 并调用 viewport 的 `beginViewSwitch(anchorTrackId)`。
- virtualizer 本身

**接口要点**

```ts
export function useLibraryViewport(options: {
  scrollRef: Ref<HTMLElement | null>
  tracks: Ref<readonly TrackListItem[]>
  isCoverView: ComputedRef<boolean>
  derivedIndex: ComputedRef<{
    trackIndexById: Map<number, number>
    albumGroupIndexByTrackId: Map<number, number>
    albumGroupStartOffsets: number[]
    trackById: Map<number, TrackListItem>
  }>
  albumGroups: ComputedRef<ReadonlyArray<{ firstTrackIndex: number }>>
  virtualAlbumGroups: ComputedRef<ReadonlyArray<{ index: number; end: number }>>
  currentTrackId: () => number | null
  selectedTrackId: () => number | null
  isDisposed: () => boolean
})
```

`SCROLL_POSITION_RATIO` 保持 `0.33`。`LIBRARY_TOP_INSET` 保持 `16`。`restoreLibraryViewportRestore` 必须调用现有 `resolveLibraryViewportRestoreAction`。

测试：优先测可脱离 DOM 的部分（generation 取消、restore action 接线、first visible 调度是否调用 Step 3 纯函数）。需要 `jsdom` 时只断言 `scrollTop` 赋值。

**Commit**：`refactor：抽出曲库视口与滚动 generation`

---

### Step 6 — `useLibraryContextMenu`

**Create**

- `src/renderer/features/library/composables/useLibraryContextMenu.ts`
- `src/renderer/features/library/composables/useLibraryContextMenu.test.ts`

**搬入**

- `contextMenu` 状态、`onOpenContextMenu` / `onOpenAlbumArtworkContextMenu` / `closeContextMenu`
- `contextMenuAnchor` / 标题 computed
- `onContextMenuPlay` / `onContextMenuInsert` / `onLocateCurrentTrack`
- `onInsertAfterCurrent` / `onInsertAlbumAfterCurrent` / `onPlayAlbum`
- `regularPlaylistItems`、加载错误、加入歌单、新建歌单、feedback timer
- `onRefreshLibrary` / `isStartingLibraryRefresh`
- `getContextMenuTrackIds`

通过 options 注入：`playback` 方法、`getTrackById`、`getAlbumGroupByTrackId`、`tracks`、`isScopedPlaylist`、`onEditMetadata`、`onSwitchViewMode`、`t`、`auralis` 播放列表 API。不要在 composable 里直接 new 播放引擎。

`closeContextMenu('metadata-dialog' | 'view-switch')` 的焦点归还语义保持：metadata 走 `metadataEditor.setReturnTarget`；view-switch 走 `pendingViewSwitchReturnTarget`（若该 ref 已进 viewport，则通过 options 回调）。

**Commit**：`refactor：抽出曲库右键菜单会话`

---

### Step 7 — `useLibraryCatalogLoader`

**Create**

- `src/renderer/features/library/composables/useLibraryCatalogLoader.ts`
- `src/renderer/features/library/composables/useLibraryCatalogLoader.test.ts`

**搬入**

- `LibraryRequestCoordinator` 实例（composable 内创建，不要改类）
- `isCurrentLibraryRequest`、`fetchLibrarySnapshot`、`commitLibrarySnapshot` 的编排
- `loadLibraryData` / `retryInitialLoad`
- `onMounted` 里的 `library.onChanged` / `onScanProgress` / 歌单 collection 事件
- `watch(route.fullPath)` 触发的前台加载（search 清空仍由页面先 `searchSession.clearSearch()` 再调用 loader，或 loader options 提供 `onRouteReload`）
- `initialLoadError`、前台 `isLoading` / 清空 `pageIdentity`

`commitLibrarySnapshot` 副作用保持：

1. 写 `pageIdentity` / `tracks` / `libraryViewMode`
2. `lastMatchedTrackIndex = -1`（调用 `searchSession` 可暴露 `resetMatchCursor()`）
3. `ensureKeyboardFocusTrackId()`
4. `scheduleLibrarySearchIndex(snapshot.tracks)`

测试用 fake `getTrackPage` / `getDetail` / coordinator 时钟，覆盖：

- 后台在前台进行中返回 `queued`，finish 后 flush
- metadata-save 等待前台
- play-stats 事件不加载（若订阅在 composable 内，用 fake event 断言）
- 过期 generation 不 commit

**Commit**：`refactor：抽出曲库目录加载会话`

---

### Step 8 — 瘦身 `LibraryPage.vue`

页面 script 只留：

1. 路由与 presentation
2. `tracks` / `libraryViewMode` / 双 virtualizer
3. 创建四个 composable 并接线
4. `onPlay` / `onSelect` / `restoreLibraryFocus`（focus restore 依赖 DOM querySelector，可留页面；内部滚动改走 viewport）
5. `switchLibraryViewMode` 持久化 + `contextMenu`/`viewport` 回调
6. `onBeforeUnmount` 调各 `invalidate`/`dispose`
7. 原模板，不改 DOM 结构、class、`data-*`、过渡名

验收：

- `LibraryPage.vue` 的 `<script setup>` 行数 ≤ 650（含 import）。目标 450–600。
- 模板行不增加功能，不删 `data-track-id` / `data-album-key` / `data-first-track-id`。
- 不出现第二个 `LibraryRequestCoordinator`。
- 不 import `@main`。

**Commit**：`refactor：LibraryPage 改为 composable 接线`

---

### Step 9 — 验证

```powershell
npm.cmd exec vitest run src/renderer/features/library --config vitest.config.ts
npm.cmd run typecheck
npm.cmd run lint
```

不要为了本步跑完整 `npm.cmd test` 里的 native/Electron，除非改到了主进程（本方案不应改到）。

`git diff --check`。

人工无法在本隔离分支代替：modern/manuscript 切两次、flat/cover、搜索 Enter 循环、后台刷新时滚动、右键加入歌单、元数据保存后焦点。文档里标记为 **隔离实现后待主分支人工确认**，不要把未跑过的 GUI 写成已完成。

**Commit**：仅当验证修复了问题；否则不提交空验证 commit。

## 7. Worker 硬约束

1. 工作目录必须是隔离 worktree，不是 `D:\VSCode\Auralis` 主工作区。
2. 只改 `src/renderer/features/library/**`、本 TECHDOC（若需勘误）和对应测试。
3. 中文 conventional commit；一步一 commit。
4. TypeScript、Vue 3 `<script setup lang="ts">`、Prettier（无分号、单引号、100 列）。
5. 禁止 `any`；禁止 `rm -rf` / `Remove-Item -Recurse -Force`。
6. 禁止修改 `src/renderer/features/settings/styles/settings.chrome.css`。
7. 禁止升级 Electron / better-sqlite3。
8. 新纯函数必须有相邻 `*.test.ts`。composable 能测的状态机必须测；DOM 查询可留页面。
9. 失败则停在当前 Step，不要把后续 Step 的半成品混进同一 commit。

## 8. 回合主分支

本分支不自动 merge 到 `dev`。HANDOFF 在主工作区完成后，再由人工把 `refactor/library-page-orchestration` rebase/merge 上去。预期冲突集中在 `LibraryPage.vue`。
