# MiniPlayer 脚本职责拆分技术方案

日期：2026-08-30  
状态：工程完成；人工交互验收待确认

## 1. 现状职责与耦合

`MiniPlayer.vue` 当前约 1200 行，其中约 610 行为 scoped CSS。模板和样式共同描述迷你播放器
牌面的单一视觉结构，不适合仅为降低行数继续拆分。脚本约 400 行，承担以下职责：

- 从 playback 状态派生曲目信息、封面、色板、时间标签和播放模式文案。
- 管理 popover 的打开/关闭、点击外部关闭和模式选择。
- 接收迷你窗口 typed IPC 状态，校验并同步 body 尺寸、popover 方向与区域高度。
- 请求主进程调整 popover 窗口高度，以及恢复主窗口。
- 生成播放按钮的随机金属光照参数，并在鼠标离开后生成下一组参数。
- 管理进度拖动、pointer capture、键盘 seek、视觉帧订阅和播放时间插值。
- 注册页面级 Escape、outside pointer 监听，并切换 `mini-player-root` 根 class。

主要耦合发生在三处：窗口返回的 body 数据同时决定 canvas、牌面和封面几何；进度拖动中的临时比例
同时覆盖进度填充、百分比和当前时间；金属参数由脚本生成但实际激活与动画由 playing class、`:hover`
和 CSS transition 完成。

## 2. 拟拆模块

### `useMiniPlayerMetalLight`

迷你播放器专用视觉 composable，位于 `app/layout/miniPlayer`。它持有一组 `MetalLightPose`，负责随机
参数的约束、与上一组姿态保持可感知差异、生成播放按钮 CSS 自定义属性，并提供离开按钮后的重排
操作。输入仅为可选随机数源（便于确定性测试），输出为 `style` 和 `reshuffle`。

当前源码没有基于指针坐标更新光源，也没有金属专属 `requestAnimationFrame`：playing class 决定金属
材质是否激活，CSS `:hover` 决定交互态，transition 驱动逐帧表现。为保持视觉不变，本次不新增
pointermove、JS 动画帧或 DOM 监听；因此该 composable 没有待清理的外部资源。

### `useMiniPlayerWindowSync`

迷你窗口专用 composable，同样位于 `app/layout/miniPlayer`。它通过现有 `AuralisApi['window']` typed
preload API 获取初始状态、订阅 `onMiniPlayerStateChanged`、校验 body 几何，并维护 `bodySize`、
`popoverDirection`、`popoverRegionHeight`。它还封装 `setMiniPlayerPopover` 和
`restoreFromMiniPlayer`，但不访问主进程实现、不新增 IPC，也不自行计算原生窗口尺寸。

组件挂载时调用 `start`，卸载时调用幂等 `stop`。`stop` 解除 IPC 事件订阅，并阻止未完成的初始化
Promise 在卸载后写入响应式状态。主进程的 `MiniPlayerWindowController` 继续拥有屏幕 work area、固定
窗口尺寸、边界约束、always-on-top 和 normal/mini 恢复逻辑。

### 复用 `usePlaybackProgressInteraction`

Mini 与 Fullscreen 的行为模型一致：按横向几何得到 0..1 比例、pointer capture、抬起提交、取消不
提交、左右键按 5 秒（Shift 为 10 秒）seek，并以播放时间锚点插值视觉进度。现有 composable 已通过
`renderRatio` 隔离具体 DOM/CSS，因此 Mini 可直接复用，无需复制或增加 Mini 专属条件。

Mini 传入的 `active` 为“存在曲目且正在播放”，保持当前仅在实际播放时订阅视觉帧的行为；暂停时
响应式时间变化仍会立即刷新一次。Mini 的 `renderRatio` 继续使用 `scaleX` 并同步
`--auralis-progress-value`，Fullscreen 继续使用自己的 `clip-path`，两者不共享视觉细节。

## 3. 继续保留在组件中的内容

- 完整 template、所有 scoped CSS、class、CSS 变量名称和 DOM 层级。
- 页面展示派生值、封面错误状态、播放/上一首/下一首/音量/模式业务调用。
- active popover 的产品状态、outside click 与 Escape 行为。
- 双击牌面恢复主窗口的目标过滤规则。
- `mini-player-root` 根 class 的挂载与移除，因为它属于当前视图的页面作用域。

这些逻辑直接表达页面结构、产品交互或局部视觉所有权；继续抽取会形成薄封装或迫使通用模块依赖
Mini 的 DOM 类名。

## 4. 文件计划

- 新增 `src/renderer/app/layout/miniPlayer/useMiniPlayerMetalLight.ts`
- 新增 `src/renderer/app/layout/miniPlayer/useMiniPlayerMetalLight.test.ts`
- 新增 `src/renderer/app/layout/miniPlayer/useMiniPlayerWindowSync.ts`
- 新增 `src/renderer/app/layout/miniPlayer/useMiniPlayerWindowSync.test.ts`
- 修改 `src/renderer/app/layout/MiniPlayer.vue`
- 修改 `src/renderer/features/playback/composables/usePlaybackProgressInteraction.ts`

不修改模板结构、CSS、typed IPC contract、preload 接线、主进程窗口控制器或其他播放器界面。

## 5. 验证与回归防护

- 定向测试金属参数范围、重排和 CSS 变量映射。
- 定向测试窗口初始同步、事件更新、非法尺寸回退、popover 请求结果和停止后的 Promise/监听清理。
- 复跑共享进度 composable 测试，覆盖开始、移动、结束、取消、越界、零时长、键盘和帧清理。
- 运行相关 TypeScript 检查、定向 ESLint 与 Prettier；检查 Vue template/CSS 差异，确认样式作用域、
  DOM 层级与视觉层级未变化。
- 运行时重点人工检查：快速 hover/leave、暂停/继续与曲目切换、popover 模式切换、重新打开 Mini、
  真实原生窗口尺寸和双击恢复。若当前环境没有可用 GUI，则明确列为未验证项。

主要风险是异步窗口状态到达顺序、进度帧订阅启停时序和金属随机参数映射遗漏。通过保持 IPC 边界、
复用已测进度模型、对所有 CSS 变量做确定性测试，并不改 template/CSS 来控制风险。

## 6. 实施调整

实现时对共享进度 composable 做了一项最小修正：视觉帧订阅条件由仅判断 `active` 改为同时判断
`active && isPlaying`，但每次 active、播放状态、时间或时长变化仍会立即同步一次锚点和静态比例。
这是为了同时满足两个调用方：Mini 在暂停时不保留帧订阅，Fullscreen 打开但暂停时也不空转；恢复
播放时仍只建立一个订阅。Mini 使用挂载状态作为 `active`，确保暂停状态下重新打开窗口时会在 DOM
就绪后绘制当前静态进度。

除此之外，实施与方案一致：模板和 scoped CSS 未改，金属效果没有新增指针坐标追踪或 JS 动画，
窗口尺寸计算和原生窗口行为仍完全由主进程控制器拥有。

## 7. 实际验证

- `npm.cmd run typecheck`：通过。
- 新增两个 composable 与共享进度 composable 的 3 个定向测试文件：14 项测试通过。
- 本次 Vue/TypeScript/测试文件的定向 ESLint：0 warning、0 error。
- 本次代码与文档的定向 Prettier：通过；全部文件严格 UTF-8 解码通过。
- 将 `MiniPlayer.vue` 从 `<template>` 开始的内容与 HEAD 逐行比较：template 与 scoped CSS 完全一致。

未启动 Electron 做人工视觉和原生窗口验收，因此真实 hover transition、拖动手感、popover 窗口方向、
多显示器尺寸、恢复主窗口和快速重复开关仍需人工确认。
