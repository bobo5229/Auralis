# PlayerBar 浮层控制器重构技术方案

日期：2026-08-30  
状态：工程完成，人工交互与视觉验收待确认

## 1. 目标与边界

本次重构集中治理 `PlayerBar.vue` 中浮层的互斥状态和关闭规则，保持现有功能、焦点、键盘、
ARIA、定位、过渡和视觉表现不变。不会继续按视觉区块拆组件，也不会修改 Renderer 与播放服务、
typed IPC 或主进程的边界。

响应式宽度测量、音量值交互和播放控制本身不在本次抽取范围内：宽度测量已经集中在一组
`ResizeObserver` 函数中，音量值和播放控制均是短小的 playback 调用。它们与浮层控制器的唯一
交点，是宽度决定“音量是否退化为向上浮层”；该几何判断继续由视图层计算，并把结果作为明确
的用户行为交给控制器。

## 2. 当前浮层及实际行为

### 2.1 互斥浮层

| 标识       | 开启入口                                   | 再次触发                                          | 内部关闭                           | 外部点击         | Escape                                                                 |
| ---------- | ------------------------------------------ | ------------------------------------------------- | ---------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `queue`    | 队列按钮                                   | 关闭                                              | 队列组件发出 `close`               | 关闭，不恢复焦点 | 队列组件监听 document keydown，发出 `close` 并恢复队列按钮焦点         |
| `mode`     | 独立模式按钮，或窄布局 overflow 内的模式项 | 关闭                                              | 选择模式或菜单发出 `close`         | 关闭，不恢复焦点 | 模式菜单监听 document keydown，发出 `close` 并恢复当前可用触发按钮焦点 |
| `overflow` | modern 窄布局“更多”按钮                    | 关闭                                              | 无独立关闭按钮                     | 关闭，不恢复焦点 | 面板自身 `keydown.esc` 关闭并恢复更多按钮焦点                          |
| `volume`   | 音量组 hover、focus-in 或浮层滑杆 drag     | 无点击式 toggle；离开、失焦、拖动结束后按信号关闭 | Escape 或显式 dismiss 设置关闭锁存 | 关闭并锁存       | 关闭并恢复静音按钮焦点                                                 |

队列、模式、overflow 与“窄布局下实际显示的音量浮层”互斥。打开 queue、mode 或 overflow 会
关闭其余面板并 dismiss 音量；进入退化后的音量浮层会关闭其他面板。宽布局下音量滑杆以内联
形式存在，hover/focus 信号不应抢占 queue 或 mode。

### 2.2 非互斥视觉反馈

桌面歌词 toast 虽使用 `player-overlay` 样式类，但它是 1200ms 自动消失的状态反馈，不接受指针或
键盘交互，也不参与 queue/mode/overflow/volume 的互斥。桌面歌词窗口本身是独立 BrowserWindow，
同样不属于 PlayerBar 浮层状态机。

### 2.3 布局和生命周期规则

- modern 工具区从窄布局恢复到宽布局时，关闭 overflow 和 mode；queue 保持当前行为，不关闭。
- presentation 离开 modern 时，解绑 island `ResizeObserver` 并关闭 overflow；其他面板保持现有
  行为。
- 当前源码没有在切换曲目时关闭浮层，也没有全局“任意 Escape 关闭最高优先级浮层”的规则；
  Escape 由具体浮层接入并恢复对应焦点。
- 组件卸载时移除 document pointerdown、断开 `ResizeObserver`、清理 toast timer。浮层 DOM 随
  组件卸载消失，当前没有延迟关闭 timer。

## 3. 现有耦合与风险

互斥规则目前分散在：

- `isQueueOpen`、`isModeMenuOpen`、`isOverflowOpen` 三个可直接写入的 ref；
- `useVolumeOverlay().open` 的第四套派生状态；
- `currentOverlayFlags` / `applyExclusiveOverlay` 的状态快照和回写；
- 三个 toggle、四个 close/escape/组件事件处理函数；
- document pointerdown 的顺序分支；
- 宽度 watcher 和 presentation watcher；
- hover/focus/drag 进入音量浮层前的额外互斥调用。

现有纯函数 `playerBarExclusiveOverlay.ts` 能计算一组合法 flags，但调用方仍持有多组可独立写入的
状态，并在不同路径绕过 reducer 直接关闭单个布尔值。快速切换通常依靠事件顺序正确工作，但状态
模型本身允许非法组合；新增关闭规则时也容易遗漏音量的 dismiss 锁存。

## 4. `usePlayerBarOverlayController` 设计

### 4.1 状态模型

使用明确联合类型：

```ts
type PlayerBarOverlayId = 'queue' | 'mode' | 'overflow' | 'volume'
type PlayerBarToggleOverlayId = Exclude<PlayerBarOverlayId, 'volume'>
```

控制器内部只保存 `activePanel: Ref<PlayerBarToggleOverlayId | null>`。queue、mode、overflow 天然
只能有一个处于打开状态，避免映射布尔值的非法组合。volume 是否打开仍由现有
`useVolumeOverlay` 的 hover/focus/drag/dismissed 状态机派生；控制器通过一个最小端口读取 `open`
并调用 `dismiss()`，不复制音量状态源。

### 4.2 输入和输出

输入：

- `volume.open`：只读响应式可见状态；
- `volume.dismiss()`：沿用现有关闭锁存语义。

输出：

- `activePanel`：只读的当前主动面板；
- `isQueueOpen`、`isModeMenuOpen`、`isOverflowOpen`：供现有模板直接适配的 computed；
- `toggle(panel)`：表达触发按钮再次点击关闭、切换到其他面板并 dismiss volume；
- `activateVolume()`：仅在视图确认音量退化浮层生效后调用，关闭当前主动面板；实际打开仍由
  `useVolumeOverlay` 的 pointer/focus/drag 事件完成；
- `close(id)`：按语义关闭指定浮层；volume 走 dismiss；
- `closeAll()`：清空主动面板并 dismiss volume；
- `closeMany(ids)`：供布局变化关闭指定集合，不让 watcher 直接写多个状态；
- `dismissOutside(inside)`：接收目标所处浮层标识集合，按现有优先顺序处理外部点击。DOM contains
  判断留在 `PlayerBar.vue`，控制器不持有元素或 CSS 结构。

所有 API 同步执行，不使用 timer 或异步 watcher，因此快速连续切换不会产生过期写入。

## 5. 职责归属

统一控制器负责：浮层联合类型、唯一主动面板、toggle/close/closeAll、音量互斥接入、布局批量
关闭和外部点击的关闭决策。

具体组件和视图层继续负责：

- 队列与模式菜单内部的键盘导航、初始焦点和 `close` 事件；
- Escape 后选择并恢复实际触发元素；
- pointer target 与 queue/button/panel/volume DOM 的 contains 判断；
- 音量 hover/focus/drag 信号及 dismiss 锁存；
- island/host 宽度测量和退化断点判断；
- playback mode 选择、音量值修改、静音和 transport 控制；
- 全部模板、Teleport/定位关系、ARIA、过渡和局部 CSS。

不调整 `PlaybackQueuePopover`、`PlaybackModeMenu`、`TrackProgressInfo` 等子组件接口。

## 6. 预计文件

- 新增 `src/renderer/app/layout/playerBar/usePlayerBarOverlayController.ts`；
- 新增相邻单元测试；
- 修改 `src/renderer/app/layout/PlayerBar.vue`，以控制器替换散落状态与回写；
- 本技术文档及 `.gitignore` 的精确跟踪例外。

现有 `playerBarExclusiveOverlay.ts` 继续保留音量退化几何判断。原 flags reducer 暂不扩展；完成接入
后若没有生产调用，不在本次顺手删除，以免把浮层重构扩大成无关清理。

## 7. 验证与风险

本次属于 B 级局部交互重构，但会新增 composable 接口，执行定向单测、定向 ESLint/Prettier 和
相关 typecheck。不会机械运行全量测试或 build。

控制器测试覆盖：单独打开、再次关闭、closeAll；queue/mode/overflow 双向快速切换；volume 激活
和 dismiss；外部点击、内部点击；布局集合关闭；重复 close 的幂等性。保留并定向运行现有音量
状态机与布局互斥纯函数测试。

人工运行风险主要是：pointerdown 先于 trigger click 的真实事件顺序、子组件 document Escape
监听与焦点恢复、modern 断点两侧的 overflow/mode DOM 切换、manuscript 窄窗音量 hover/focus/drag
表现，以及浮层定位和过渡。若当前无法运行 Electron GUI，最终明确列为未验证，不以静态检查
替代视觉结论。

## 8. 实施结果

实现与方案一致：新增 PlayerBar 专用控制器，以 `activePanel: 'queue' | 'mode' | 'overflow' | null`
作为三种点击式面板的单一状态源；volume 继续复用既有交互状态机，通过只读 `open` 和
`dismiss()` 端口接入。`PlayerBar.vue` 的 DOM contains 判断、Escape 后焦点恢复、宽度测量、音量
值处理、播放控制、模板和 CSS 均保留在原职责边界。

相对方案没有产品行为调整。实现时保留了一个重要的既有事件顺序：当主动面板与宽布局下不可见
的 volume hover/focus 信号短暂并存时，点击主动面板内部会直接保留两者；点击 volume 区域先关闭
主动面板但保留 volume；真正点击两者外部才 dismiss volume。这样不会借重构改变当前 pointerdown
行为。

实际验证：

- `npm.cmd run typecheck`：通过；
- 定向 ESLint（`PlayerBar.vue`、控制器及测试）：0 warning / 0 error；
- 定向 Prettier check（代码、测试、本文档）：通过；
- 定向 Vitest：控制器、`useVolumeOverlay`、`playerBarExclusiveOverlay` 共 3 个文件、24 个测试通过；
  控制器最终用例调整后又单独复跑，6 个测试通过；
- 现有 `playerOverlayFocus` 键盘与焦点规则测试：28 个测试通过；
- 未运行全量测试、build 或 Electron GUI，符合本次 B 级局部交互重构的风险范围。

仍需人工确认：queue/mode/overflow 的真实 pointerdown→click 快速切换、各自 Escape 焦点恢复、
modern 宽度断点两侧的菜单定位、manuscript 窄窗音量 hover/focus/drag 和过渡、卸载后重新挂载。
