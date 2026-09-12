# Renderer 视觉与交互

适用：页面、组件、样式、播放界面、视觉状态及窗口几何。
下文是修改边界，不是每次必须遍历所有页面的验收清单。

## 窗口与界面边界

- 主窗口使用系统原生边框和标题栏：`frame: true`、`transparent: false`。
  不得恢复 Renderer 自绘的主窗口控制按钮或主 shell 拖拽区域。
- Playbar / PlayerBar 是主页面底部常驻播放栏，核心文件为
  `src/renderer/app/layout/PlayerBar.vue` 和 `TrackProgressInfo.vue`。
- Miniplayer 由 `MiniPlayer.vue`、`miniPlayerWindowController.ts` 控制，复用主 BrowserWindow，
  但 UI 与行为独立。改 Playbar 不得误改 Miniplayer，反之亦然；窗口配置自然影响两者。
- 桌面歌词是独立 frameless window，保留自身 drag/no-drag 区域。

## 状态与实现来源

- 播放视觉状态来自现有 playback composable，不建立第二套 player store。
- 应用只提供 modern 视觉；全局 theme 和 PlayerBar material（`cover-tint | liquid-glass`）相互独立，
  不互相重置。主题可用模式以 `useTheme.ts` 为准；当前为 dark-only。
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

- 风格切换保留选择、播放队列、搜索、右键菜单、元数据、歌词状态和懒加载行为；
  图片保持 `decoding='async'`。
- 虚拟列表几何保持一致，修改时 CSS 和 virtualizer estimate 必须同步：平铺行 44px、
  封面轨道 40px、封面 250px、轨道面板垂直 padding 合计 20px、专辑组垂直 padding 合计 56px。
- PlayerBar 保持现代悬浮岛几何；窄窗音量滑杆通过 `modern-player-bar` 容器查询折叠，并以向上
  overlay 展开。

检查哪些状态、主题和断点由 [风险分级验收](validation.md) 决定，不因加载本文而全量回归。
