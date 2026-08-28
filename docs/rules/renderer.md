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
- `modern | manuscript` 唯一来源为
  `src/renderer/features/appearance/composables/useVisualStyle.ts`。
- 视觉风格、全局 theme 和 PlayerBar material（`cover-tint | liquid-glass`）相互独立，
  不合并状态、不互相重置。主题可用模式以 `useTheme.ts` 为准；当前 dark-only，手稿纸色不是 light theme。
- 页面 presentation 根据显式 Vue Router route name 解析，不能根据路径前缀推断。
- 普通主窗口可用 manuscript；Fullscreen 与 Miniplayer 始终保持 modern。
- 切换风格不得 remount AppSidebar、RouterView 或设置页曲库区域，不清除已保存偏好。
- 样式优先使用 UnoCSS；主题颜色和稳定布局 shortcut 位于 `uno.config.ts`。
- 新动画通过 `src/renderer/shared/animation/motion.ts` 封装，尊重 `prefers-reduced-motion`，
  卸载时清理 animation frame 与监听器。此条不授权顺手修复本次范围外的既有动效。

## 样式所有权

manuscript selector 必须限定在对应 owner 下：

| Owner        | 根作用域                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Library      | `.library-page[data-visual-style='manuscript']`                                                                   |
| Albums       | `.albums-page[data-visual-style='manuscript']`                                                                    |
| Album detail | `.album-detail-page[data-visual-style='manuscript']`                                                              |
| Archive      | `.archive-page[data-visual-style='manuscript']`                                                                   |
| Settings     | `.settings-page[data-visual-style='manuscript']`                                                                  |
| Sidebar      | `.app-sidebar[data-shell-presentation='manuscript']`                                                              |
| Shell        | `.app-window[data-shell-presentation='manuscript']`                                                               |
| Player       | `.now-playing-panel[data-player-presentation='manuscript']`、`.player-bar[data-player-presentation='manuscript']` |

- Teleport overlay 携带所有者作用域：`.library-overlay`、`.albums-overlay`、`.archive-overlay`、
  `.sidebar-overlay` 或 `.player-overlay`，不得交叉污染。
- 共享 manuscript token 位于 `src/renderer/features/appearance/styles/manuscript.tokens.css`，
  页面组合样式仍由各 feature 拥有。
- 不新增未限定作用域的 `html`、`body` 或 `#app` manuscript selector。
- Shell manuscript 样式不得影响 Player、Fullscreen、Miniplayer 或桌面歌词。
- Player manuscript 样式不得影响 Sidebar、页面 owner、Fullscreen、Miniplayer 或桌面歌词。

## Modern-only 工作

- shell chrome palette、FluidArtworkBackground 只在 modern shell 运行。
- PlayerBar artwork palette、album tint 只在 modern player presentation 运行。
- Album detail 的 artwork canvas、pointer tilt 只在 modern 运行。
- Archive 的 album-ranking artwork canvas 只在 modern 运行。
- 切到 manuscript 或卸载时，停止并清理相关监听器、动画帧和进行中的图片工作；
  切回 modern 恢复一次，不产生重复监听器、过期 tint 或重复定时器。

## 交互与几何不变量

- 风格切换保留选择、播放队列、搜索、右键菜单、元数据、歌词状态和懒加载行为；
  图片保持 `decoding='async'`。
- 虚拟列表几何保持一致，修改时 CSS 和 virtualizer estimate 必须同步：平铺行 44px、
  封面轨道 40px、封面 250px、轨道面板垂直 padding 合计 20px、专辑组垂直 padding 合计 56px。
- manuscript Library 根节点是无外框的主列纸面，不恢复外 margin、border、radius、page shadow
  或 paper highlight。
- 手稿 PlayerBar 为 `left: 260px` 起、右/底贴边的连续页脚：72px 高、仅顶角 16px 圆角、
  无悬浮外投影；modern 悬浮几何不变。manuscript safe area 为 88px（72 + 16），
  由 shell 作用域派生，全局 116px 不变。
- 手稿窄窗音量滑杆经 `manuscript-player-bar` 容器查询折叠，并以向上 overlay 展开。

检查哪些状态、主题和断点由 [风险分级验收](validation.md) 决定，不因加载本文而全量回归。
