# Renderer 视觉与交互

适用：页面、组件、样式、播放界面、视觉状态及窗口几何。
下文是修改边界，不是每次必须遍历所有页面的验收清单。

## 窗口与界面边界

以下窗口形态、按钮位置和视觉模式描述当前实现；有明确设计变更时按任务调整，其他行为保持稳定。

- 主窗口使用不透明的无框窗口：`frame: false`、`transparent: false`。普通主界面在
  左侧边栏顶部显示自绘红绿灯窗口按钮；CD 视图暂时在右上角显示同一组按钮。
  窗口操作经过类型化 Preload/IPC，迷你播放器保持独立布局。
- Playbar / PlayerBar 是主页面底部常驻播放栏，核心文件为
  `src/renderer/app/layout/PlayerBar.vue` 和 `TrackProgressInfo.vue`。
- Miniplayer 由 `MiniPlayer.vue`、`miniPlayerWindowController.ts` 控制，复用主 BrowserWindow，
  但 UI 与行为独立。改 Playbar 不得误改 Miniplayer，反之亦然；窗口配置自然影响两者。

## 状态与实现来源

- 播放视觉状态来自现有 playback composable，不建立第二套 player store。
- 当前应用提供 modern 视觉；PlayerBar 及其浮层使用深色磨砂材质，不读取历史 material 偏好。
  液态玻璃保留在 `LiquidGlassPanel.vue` 和 `useLiquidGlassRefraction` 中供其他界面复用。
  主题可用模式以 `src/renderer/composables/useTheme.ts` 为准。
- 页面 presentation 根据显式 Vue Router route name 解析，不能根据路径前缀推断。
- 样式优先使用 UnoCSS；主题颜色和稳定布局 shortcut 位于 `uno.config.ts`。
- 新动画通过 `src/renderer/shared/animation/motion.ts` 封装，尊重 `prefers-reduced-motion`，
  卸载时清理 animation frame 与监听器。此条不授权顺手修复本次范围外的既有动效。

## 样式所有权

- 页面、Shell、Sidebar 与 Player 的样式由各自 feature 或 layout 拥有；Teleport overlay 使用
  `.library-overlay`、`.albums-overlay`、`.archive-overlay`、`.sidebar-overlay` 或 `.player-overlay`
  作为根，不得交叉污染。
- 不新增未限定作用域的 `html`、`body` 或 `#app` 页面视觉选择器。

## Modern-only 工作

- shell chrome palette、FluidArtworkBackground 只在普通主窗口运行。
- PlayerBar artwork palette、album tint 只在可见的普通主窗口 PlayerBar 运行。
- Album detail 的 artwork canvas、pointer tilt，以及 Archive 的 album-ranking artwork canvas，
  卸载时停止并清理相关监听器、动画帧和进行中的图片工作。

## 交互与几何不变量

- 视觉调整保留选择、播放队列、搜索、右键菜单、元数据、歌词状态和懒加载行为；
  图片保持 `decoding='async'`。
- 虚拟列表布局指标统一由 `src/renderer/features/library/constants/libraryLayoutMetrics.ts`
  维护；CSS 与 virtualizer estimate 共同消费这些指标，修改后保持实际几何与估算高度一致。
- PlayerBar 保持现代悬浮岛几何；音量控制在栏内横向展开，左边缘保持固定，右端扩展受可用空间限制。

检查哪些状态、主题和断点由 [风险分级验收](validation.md) 决定，不因加载本文而全量回归。
