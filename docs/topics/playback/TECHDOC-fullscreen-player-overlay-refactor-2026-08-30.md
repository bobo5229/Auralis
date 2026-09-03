# FullscreenPlayerOverlay 职责拆分技术方案

日期：2026-08-30  
状态：工程完成；人工交互验收待确认

## 1. 现状与耦合

`FullscreenPlayerOverlay.vue` 当前约 1200 行，其中脚本同时负责：页面展示数据、播放控制、
进度拖动与键盘 seek、进度视觉帧插值、歌词数据整形、歌词 DOM 测量、自动跟随、手动滚动暂停、
Web Animation 和页面级生命周期。主要耦合点是：

- 进度拖动值既影响 aria 百分比，也覆盖视觉帧插值结果，结束时再提交给 playback API。
- 歌词目标位置依赖歌词状态、当前行、前奏行、容器高度和实际行高，必须在 DOM 更新后测量。
- 全屏开关同时决定 DOM 是否存在、进度帧订阅是否运行，以及歌词观察器何时绑定。
- 当前组件的卸载钩子集中清理键盘监听、动画帧订阅、歌词动画、定时器和观察器，职责混杂。

## 2. 拆分结果

### `useFullscreenLyricsViewport`

全屏歌词专用 composable，放在 lyrics feature 内。输入为歌词状态、当前行、前奏状态、行数、
当前曲目和全屏开关；由调用方提供歌词滚动容器与轨道元素 ref。输出为容器高度、上下留白和
暂停自动跟随的事件处理函数。

它独占以下职责：

- `ResizeObserver` 绑定、重绑和断开；字体加载完成后的重新测量。
- 歌词行、前奏行和最大滚动范围的 DOM 测量缓存。
- 首次定位、曲目切换重置、当前行变化和窗口尺寸变化后的目标计算。
- 原生 `scrollTop` 与轨道 `transform` 之间的切换。
- 用户手动滚动后暂停三秒、恢复自动跟随。
- Web Animation 的创建、接续、取消和最终位置提交。
- 全屏关闭或 scope 销毁时清理观察器、动画与定时器，阻止字体 Promise 的过期回调。

歌词动画不与播放进度视觉帧合并：两者刷新机制、暂停条件和生命周期不同。

### `usePlaybackProgressInteraction`

可复用的 playback composable。输入为 duration、currentTime、isPlaying、active 响应式引用，
以及 seek、渲染比例和键盘步长回调。输出拖动状态、当前显示比例、aria 百分比和 pointer/keyboard
事件处理函数。

它负责 pointer capture、开始/移动/提交/取消、0..1 边界约束、键盘 seek、播放时间锚点和
视觉帧订阅。调用方通过 `renderRatio` 决定使用 `clip-path` 或 `transform`，因此 composable
不拥有页面样式。当前 PlayerBar 与 MiniPlayer 存在同类重复，证明接口有复用价值；为控制本次
回归范围，本阶段只迁移 Fullscreen，其他消费者不随手改造。

## 3. Overlay 保留职责

`FullscreenPlayerOverlay.vue` 继续持有页面布局、Teleport/Transition、CSS、封面和曲目信息、
歌词文本到展示行的转换、播放/音量/循环/随机按钮业务、Escape 关闭以及进度条具体渲染方式。
这些逻辑直接描述该页面的产品结构或视觉，不适合包装成无语义的薄模块。

## 4. 文件计划

- 新增 `src/renderer/features/lyrics/composables/useFullscreenLyricsViewport.ts`
- 新增 `src/renderer/features/lyrics/composables/useFullscreenLyricsViewport.test.ts`
- 新增 `src/renderer/features/playback/composables/usePlaybackProgressInteraction.ts`
- 新增 `src/renderer/features/playback/composables/usePlaybackProgressInteraction.test.ts`
- 修改 `src/renderer/app/layout/FullscreenPlayerOverlay.vue`

不修改 IPC、播放控制器、PlayerBar 或 MiniPlayer。

## 5. 风险与防护

- DOM 更新时序变化：歌词 watcher 保持 `flush: 'post'` 并在 `nextTick` 后测量。
- 动画跳变：取消动画时读取当前矩阵并提交，再从该位置启动新动画。
- 手动滚动失效：第一次交互先把 transform 转为原生 scrollTop，三秒后反向归一并恢复跟随。
- 曲目切换残留：按 currentTrackId 重置偏移、缓存、定时器和手动状态。
- 重复资源：观察器按元素身份复用；帧订阅、动画、定时器均保持单实例并提供幂等清理。
- pointer capture 泄漏：结束、取消和 scope 销毁都释放活动 capture；取消不提交 seek。
- 视觉回归：不改 template 结构、class、CSS 和播放业务，只替换事件与响应式状态来源。

## 6. 验证

- 定向 TypeScript 类型检查、相关文件 ESLint 和 Prettier 检查。
- 新增进度交互测试，覆盖开始、移动、结束、取消、边界、键盘和销毁清理。
- 新增歌词目标计算与生命周期测试，覆盖首次/当前行目标、手动滚动恢复、尺寸变化、曲目切换、
  全屏开关和销毁清理。
- 运行现有 playback 与 lyrics 相关定向测试。
- 若当前环境无法可靠启动 Electron，则将实际视觉、真实 wheel/touch 和窗口 resize 交互列为人工
  验收项，不用单元测试冒充视觉验收。
