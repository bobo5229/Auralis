# 歌词面板收起与专辑网格同步过渡技术方案

日期：2026-09-30  
状态：源码分析完成，方案待实施。

2026-10-04 更新：专辑列表已移除透视视图；下文实施和验证范围改为常规网格，列表不再读取或保存显示模式偏好。原始执行链路和原因分析保留 2026-09-30 的记录。

## 结论

专辑页的不同步来自明确的执行顺序：歌词面板先完成 200ms 收起动画，专辑网格保持旧宽度，随后经过两次 requestAnimationFrame 和 nextTick 才提交最终布局。用户看到的“专辑重排动画”主要是延迟发生的布局切换；当前网格没有卡片位置插值动画。

建议将收放组织成一次布局事务：先计算并提交最终网格几何，再让可见专辑、歌词面板和 Playbar 共用一个进度完成视觉过渡。列数与虚拟行高每次事务提交一次，可见卡片通过位置插值移动，结束时只清理过渡层。

本文依据当前工作区源码，包括已有未提交修改。本次完成静态链路分析，未启动 Electron 或采集 Performance trace；掉帧的主要耗时来源仍需按下文测量确认。

## 当前执行链路

| 环节 | 源码依据 | 当前行为 |
| --- | --- | --- |
| 切换入口 | [PlayerBar.vue](../../../src/renderer/app/layout/PlayerBar.vue)、[useLyricsPanelVisibility.ts](../../../src/renderer/features/appearance/composables/useLyricsPanelVisibility.ts) | 更新共享的歌词展开偏好 |
| 收放状态 | [App.vue](../../../src/renderer/App.vue) 的 `collapseWithAnimation`、`finishLyricsResize` | 设置 `isLyricsResizing`，逐帧更新进度；完成后卸载歌词，再经过两次 rAF 解除 resizing |
| 动画时钟 | [motion.ts](../../../src/renderer/shared/animation/motion.ts) 的 `animateLyricsPanelExpansion` | 时长 200ms，缓动为 `1 - (1 - t)^3` |
| Shell 与播放栏 | [main.css](../../../src/renderer/app/styles/main.css) 的 `.app-shell`、`.player-bar` | 进度驱动歌词 Grid 列宽和 Playbar 的 `right` |
| 歌词内容 | [NowPlayingPanel.vue](../../../src/renderer/app/layout/NowPlayingPanel.vue) | 内容保持目标宽度，外层裁切；内容透明度随进度变化 |
| 网格布局 | [useAlbumGridLayout.ts](../../../src/renderer/features/albums/composables/useAlbumGridLayout.ts) | resizing 期间保留已提交宽度、列数和行高，结束后 `nextTick(update)` |
| 虚拟行 | [AlbumsPage.vue](../../../src/renderer/features/albums/pages/AlbumsPage.vue) | 内层固定 `gridWidth`；按列数将专辑分组；行通过 `translateY` 定位 |
| 现有测试 | [useAlbumGridLayout.test.ts](../../../src/renderer/features/albums/composables/useAlbumGridLayout.test.ts) | 明确验证动画期间冻结几何、结束后一次提交，以及滚动锚点不漂移 |

```text
当前：点击 → 歌词面板逐帧收起，专辑保持旧几何
           → 200ms 动画完成 → 两次 rAF → nextTick → 网格提交新几何

目标：点击 → 批量读取旧几何、提交目标几何、准备过渡层
           → 同一帧启动歌词、专辑、Playbar 过渡 → 同一帧到达终点并清理
```

两次 rAF 代表刷新周期等待，不是固定毫秒延迟；在 60Hz 屏幕上通常约为两个刷新周期，繁忙帧会进一步拉长观感。

## 原因与性能风险

### 不同步是冻结策略的直接结果

`useAlbumGridLayout.update()` 在 resizing 且已有 `gridWidth` 时直接返回。这个保护避免连续重组虚拟行，但同时使专辑卡片在面板收起期间完全保留旧尺寸。解除冻结后，`gridWidth`、`columnCount`、`rowHeight` 一起变化，形成第二次可见变化。

`.albums-grid-row` 仅声明透明度过渡。卡片封面的 transform、阴影等 hover 过渡不承担网格重排。因此，调整卡片 hover 时长、添加统一的 200ms CSS 参数，无法改变上述先后关系。

Shell 已有 `.is-lyrics-resizing { transition: none; }`，收放期间不会让 280ms 的 `grid-template-columns` CSS 过渡追赶 rAF。修复应保留这项约束，避免重复处理已经解决的问题。

### 需要测量的掉帧来源

| 候选来源 | 已确认的代码路径 | 需要记录的证据 |
| --- | --- | --- |
| 动画中持续布局 | 每帧改变 Grid 列宽与 Playbar 的 `right` | Layout、Recalculate Style、Paint 的耗时与受影响节点 |
| 虚拟器尺寸观察 | 页面的 ResizeObserver 调用网格更新；TanStack 的 `observeElementRect` 仍观察容器 | 回调次数、虚拟器更新耗时，确认冻结网格后剩余工作量 |
| 终点集中更新 | 提交宽度与行高、`measure()`、列数变化时重建 `albumRows`、恢复 scrollTop | 动画尾部主线程峰值，区分分组、DOM patch 与布局耗时 |
| 跨行卡片重建 | 行以虚拟行 key 标识，卡片 key 位于各自行内 | mount/unmount 次数、图片解码与绘制事件 |
| 视觉效果叠加 | 封面阴影、透视 transform，播放中的歌词更新 | Paint、Raster、Composite 与主线程轨道的对应关系 |

列数变化会将部分专辑移到另一个父行；相同的 `album.key` 不能保证跨父节点复用卡片实例。应统计实际重建数量，再决定是否进一步调整渲染结构。

浏览器动画优化优先减少逐帧布局与绘制，并使用 transform、opacity 承担视觉运动；这些属性仍需结合实际图层和绘制记录验收。[web.dev 动画性能指南](https://web.dev/articles/animations-guide)

## 推荐实现

### 统一事务与进度

在 Renderer 布局层增加短生命周期的过渡协调器，继续使用 `useLyricsPanelVisibility` 保存用户偏好。协调器只管理 `revision`、阶段、起点、目标和取消回调，不建立第二份播放或歌词状态。

阶段定义为 `idle → preparing → animating → idle`。专辑页提供准备、推进、完成和取消接口；App 负责歌词可见条件、Shell 与 Playbar 的几何。普通收放沿用现有 200ms 和 cubic ease-out，所有参与者消费同一时间戳计算出的归一化进度。

准备完成后统一启动时钟。不能在歌词已经移动后，再等待专辑页异步准备。每个异步边界检查 revision、页面活跃状态和容器连接状态，过期完成回调直接退出。

### 一次提交目标布局

把 `useAlbumGridLayout` 拆分为纯几何计算和提交两个部分。输入包括最终容器可用宽度及滚动锚点；输出包括列数、卡片边长、行高、总高度和目标滚动位置。沿用现有 40px 横向 padding、20px 列间距、3–6 列及常规网格的 28px 行间距规则。

准备阶段按以下顺序执行：

1. 批量读取当前可见卡片矩形、滚动容器矩形、scrollTop 和稳定专辑 key。所有位置统一到同一个过渡层坐标系。
2. 捕获旧画面的轻量卡片快照，保存已加载封面、文本和必要视觉样式。快照不挂载 `AlbumCard` 的数据订阅和观察器。
3. 将 Shell、Playbar 与专辑网格提交到目标布局，完成虚拟器测量及锚点恢复；目标实际可用宽度包含滚动条影响，避免单纯用窗口宽度减歌词宽度替代测量。
4. 在 Vue DOM 更新后批量读取目标可见卡片矩形。最终内容准备好之前，用旧快照保持画面连续；不可让新布局先裸露一帧。
5. 根据新旧矩形构造过渡层，启动共享进度。动画结束时显露已准备的真实内容并移除快照，不再重组网格。

最终布局提交与视觉动画解耦后，`isLyricsResizing` 不再表示“等到结尾才能更新网格”。它仍可用于关闭冲突的 CSS 过渡；专辑几何由事务显式提交，ResizeObserver 在事务内只记录失效，不重复提交。

### 可见卡片的过渡层

为适配现有按行虚拟化结构，使用覆盖滚动视口的临时展示层，并按 `album.key` 对齐旧、新可见集合。只处理两个集合及必要 overscan 的并集，节点数随视口规模变化。

同时存在于两端的专辑按旧矩形向新矩形移动；仅旧端存在的淡出，仅新端存在的淡入，三种变化共享起止时间。封面保持正方形并等比缩放，标题和作者采用平移及必要的交叉淡化，避免把整张卡片非等比拉伸。位移动画放在额外外层。

真实虚拟行继续独占自己的 `translateY(virtualRow.start)`。过渡层承载动画，避免 FLIP 位移覆盖虚拟行定位，也避免对所有专辑开启 `will-change`。

过渡层设置 `aria-hidden`、`inert` 和 `pointer-events: none`，移除重复 id；真实卡片在替身可见期间暂时禁止命中，避免点击位置与实际目标错位。保持键盘焦点的专辑 key，结束后恢复到对应真实控件。动画中收到滚轮、触摸板滚动或导航键时先完成当前目标并清理替身，再交还正常交互。

### 歌词面板和 Playbar 同步

在专辑页事务中，Shell 的最终列宽一次提交；歌词面板临时脱离 Grid 流，固定在右侧原有区域，通过 transform 与 opacity 退出或进入。展开时先挂载歌词并准备目标内容，再统一启动动画；收起完成后卸载。

过渡层放在 Shell 内合适的层级，裁切范围与主内容视口对齐。收起时正在退出的歌词覆盖在逐渐释放的区域上，专辑视觉层由对应边界裁切；展开使用反向边界。裁切参数由共享进度计算，需单独检查其 Paint 成本。

Playbar 的目标 `right` 一次提交，对实际可见的播放栏岛从旧矩形到新矩形做位置过渡；若宽度或响应式按钮布局变化，准备新旧展示并同步淡化。仅移动外层不足以隐藏按钮重排，应把该断点场景纳入实现和验收。

逐帧阶段只更新展示层的 transform、opacity 和必要裁切，禁止逐帧调用网格 `measure()`、读取卡片矩形或重新计算列数。若采用 rAF，共享调度器批量写样式；切换到其他动画 API 时也必须维持统一启动、取消与完成语义。

首轮实现可将上述事务限定于活跃的普通专辑列表页，其他页面沿用当前收放行为。共享协调器负责切换时清理，防止专辑页的临时定位样式泄漏到其他路由。

## 打断和滚动契约

| 场景 | 处理方式 |
| --- | --- |
| 快速反向点击 | 从当前可见插值矩形和歌词进度接续；取消旧 revision，以当前画面为新起点，重新准备目标；剩余时长按行程缩短 |
| 列数往返变化 | 保留稳定专辑 key 与行内偏移；按最终几何恢复锚点，避免每次重用新行首专辑而向前漂移 |
| 窗口改变尺寸或跨越 1280px | 取消快照事务，按当前窗口和面板可用条件直接结算最终布局；下一次按钮操作再启动动画 |
| 路由离开或 KeepAlive 停用 | 取消动画和待执行测量，清理替身与样式；在容器仍有效时保存滚动位置 |
| reduced motion 开启 | 直接提交最终几何和可访问状态，跳过快照与时钟；动画中切换偏好时立即结算 |
| 全屏或迷你模式切换 | 按现有 `canDisplayLyricsPanel` 结算并清理；返回普通模式时重新读取实际容器几何 |
| 事务中曲库刷新 | 使当前事务失效，清理后按最新专辑集合提交，避免旧 key 指向新列表位置 |
| 准备失败或容器脱离 DOM | 清理临时状态，恢复符合当前偏好的稳定布局，避免残留透明内容或 inert 控件 |

这些规则应与现有滚动锚点测试合并设计。锚点恢复保留原有“等待新总高度进入 DOM 后写 scrollTop”的约束，并覆盖接近列表底部时的合法范围裁剪。

## 实施顺序与文件范围

1. **记录基线。** 用隔离样例曲库复现，记录不同步、尾帧峰值和冷暖封面差异，明确主要成本。
2. **提取几何计算。** 扩展 `useAlbumGridLayout.ts` 及定向测试，保留现有尺寸规则、锚点和 KeepAlive 契约。
3. **接入统一事务。** 在布局层增加协调器，由 `App.vue` 驱动；让 `AlbumsPage.vue` 在动画前提交目标布局。
4. **实现视口过渡层。** 在 albums 模块增加轻量展示组件；按 key 匹配卡片，独立于虚拟行和封面内部 transform。
5. **同步面板与 Playbar。** 调整 `NowPlayingPanel.vue`、必要的 PlayerBar 包装层及局部 CSS，处理退出、展开和响应式切换。
6. **完成定向验证。** 比较同一环境的前后 trace，通过后移除临时计数器，保留必要回归测试。

该方案在 Renderer 内完成，复用现有数据与播放入口，不需要新增 Preload/IPC 或数据库操作。原有[歌词面板收放文档](../shell/TECHDOC-collapsible-lyrics-panel-2026-09-28.md)作为功能背景；本方案补充普通专辑页的动画协同。

## 验证与交付标准

### 性能取证

使用隔离样例数据，分别选择列数保持和列数变化的窗口宽度，覆盖常规网格。在列表顶部、中段、底部执行收起、展开和快速反向操作。记录窗口尺寸、devicePixelRatio、刷新率、专辑数、封面缓存状态、硬件加速状态和构建模式。

每组暖缓存场景连续记录 20 次操作；冷封面单独记录，不与暖缓存混合统计。用 Performance 面板关联 Frames、Main、Layout、Paint 和 Raster；帧是否丢失以 trace 中的帧记录判断，rAF 间隔只作为辅助信号。[Chrome DevTools 性能面板参考](https://developer.chrome.com/docs/devtools/performance/reference)

临时埋点至少包含 `prepare-start`、`geometry-commit`、`motion-start`、`motion-end` 和 `cleanup-end`，并统计网格提交、measure、卡片挂载和几何读取次数。准备阶段和清理阶段同样纳入响应耗时，防止把掉帧搬到动画起点。

### 验收指标

以下为实施目标，需在记录硬件与刷新率的同一环境中比较：

- 歌词、专辑和 Playbar 在同一渲染帧开始、在同一渲染帧到达目标；结束后没有第二次重排。
- 无打断的事务只提交一次目标网格几何；稳态动画帧中没有网格 measure、列数重算和卡片矩形读取。
- 暖缓存下，从点击到首次可见反馈的 P95 不超过 50ms；准备阶段超标时优先减少快照与测量成本。
- 暖缓存下动画窗口 dropped frames 比例目标低于 5%，无归因于本次过渡的 50ms 以上主线程任务；60Hz 与 120Hz 分别按约 16.7ms、8.3ms 帧预算检查。
- 连续十次收起与展开后锚点保持稳定，顶部和底部不出现持续空白、跳回或累积漂移。
- reduced motion、路由切换、KeepAlive、窗口缩放及快速反向操作后，临时节点、rAF、样式和 inert 状态全部清理。

### 定向测试

几何单测覆盖列数临界值、常规网格行高、底部裁剪与重复往返锚点。协调器测试覆盖准备完成前反向、动画中反向、过期回调、取消与 reduced motion。现有“整段冻结后提交”测试应改为“准备时提交一次、动画期间稳定、结束时不再提交”。

组件或浏览器测试验证跨行专辑的 key 对齐、真实卡片命中与焦点恢复。实际 Electron 检查验证同帧启动、裁切、阴影、封面、Playbar 断点及不同缩放比例；单元测试通过不能替代这部分视觉和性能证据。

本次文档交付仅核对源码引用、方案一致性和文档差异。功能测试、类型检查、Electron 运行与性能基准属于后续实施验收。
