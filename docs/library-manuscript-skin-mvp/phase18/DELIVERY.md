# Phase 18 交付记录：Now Playing 与 PlayerBar 手稿化

**状态**：工程完成；Electron 人工矩阵待用户确认
**日期**：2026-08-13
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step  | 提交      | 说明                                        |
| ----- | --------- | ------------------------------------------- |
| 18.0  | `a1bd7fb` | `docs：冻结 Phase 18 播放表面基线`          |
| 18.1  | `5f428ec` | `refactor：建立播放表面手稿呈现契约`        |
| 18.2  | `fcdc7b8` | `refactor：为手稿 PlayerBar 关闭封面材质计算` |
| 18.3  | `37578d5` | `feat：PlayerBar 接入手稿档案控制台`        |
| 18.4  | `32dd417` | `feat：Now Playing 接入手稿歌词旁注栏`      |
| 18.5  | `8609e96` | `feat：手稿化 PlayerBar 队列与模式浮层`     |
| 18.6  | `177151c` | `fix：补齐播放表面键盘与低动效契约`         |
| 18.7  | `976fff1` | `test：固化播放表面手稿作用域门禁`          |
| 18.8  | `804ef3f` | `docs：交付 Phase 18 播放表面手稿化`        |
| P2 修复 | `8256115` | `fix：空队列播放浮层焦点兜底到弹窗根节点`   |
| P2 修复 | `6325c56` | `fix：模式菜单改为 roving tabindex 并回传选择后焦点` |
| P2 修复 | `db25276` | `fix：歌词自动跟随遵守 reduced-motion 且不创建 WAAPI 动画` |
| P2 修复 | `73c83f6` | `fix：全屏时隐藏 PlayerBar 不再启动 palette worker` |

**源码范围**：`a1bd7fb..73c83f6`
**含交付文档**：`a1bd7fb..804ef3f`

## 2. 已实现

- `resolvePlayerSurfacePresentation(displayMode, visualStyle)` 纯 resolver：仅 `normal + manuscript` 解析为手稿，fullscreen / mini 恒为 `modern`（四象限测试覆盖）；
- `App.vue` 计算一次 `playerPresentation` 并以 prop 传播给 NowPlayingPanel 与 PlayerBar，不加 `key` / `v-if` 重挂载；
- Now Playing 与 PlayerBar 根节点挂独立 `data-player-presentation` marker，与 Phase 17 `data-shell-presentation` 所有权分离；
- PlayerBar 封面色板与 album tint 由 `useArtworkPalette(..., { enabled: isModernPlayer })` + `useAlbumTint` 门控：manuscript 下不触发图片解码 / canvas / worker，tint timer 清理、层清空；切回 modern 只恢复当前封面一次；`playerBarMaterial` 偏好保持 `cover-tint | liquid-glass` 不被改写；
- `manuscript.player.css` 手稿化 PlayerBar：纸面画布、克制阴影、无 backdrop blur，隐藏 glass / tint / 高光层；传输按钮 stamp / hover 只变墨色 / active 1px 位移 / focus 2px 环；封面薄边框；进度细线 + 暗红填充、移除 shimmer 与 hover 高度变化；音量 thumb 可见；reduced-motion 命中根节点；
- `manuscript.player.css` 手稿化 Now Playing 歌词旁注栏：覆盖 `.has-artwork` 的 `!important` blur，remap 歌词墨色 token，inactive 行以对比而非 blur 表达层级，prelude dots 去 glow；SyncedLyricsView 的 transform、observer、seek 与自动跟随不变；
- `manuscript.player-overlays.css` + `player-overlay` owner：队列抽屉、模式菜单、桌面歌词 toast 手稿化；
- 队列与模式菜单互斥（只保留一个 document keydown listener）；`playerOverlayFocus` 纯函数：队列 Tab 圈定 + Escape 回传、模式菜单 roving focus（Arrow / Home / End / Enter / Space / Escape）、触发器焦点恢复；
- 歌词硬编码状态文案与 seek aria-label 移入 locale（`lyricsNoTrack` / `lyricsLoading` / `lyricsSeekToLine` / `lyricsSeekToTime` / `lyricsStartingSoon`），zh-Hant 走生成链；
- 静态守卫新增 player 表面检查：resolver 与 prop 传播、无重挂载 key、palette enabled gate、material 无 manuscript 值、player CSS 严格 owner scope 且不命中 Fullscreen / Miniplayer / 桌面歌词窗口 / Sidebar / 页面 owner。

未新增 visual-style 存储键、player store、IPC、数据库迁移或窗口架构改动。未修改 Fullscreen、Miniplayer、桌面歌词独立窗口、主进程与 preload。

## 3. 审查 Findings 与解决方案

### Finding P2：空队列无法建立焦点约束

`PlaybackQueuePopover` 的初始聚焦只聚焦可交互的队列项。空队列或只有当前曲（无 upcoming）时，弹窗内没有 focusable：根节点虽有 `tabindex="-1"` 却不会获得焦点，且 `focusableCount === 0` 时 Tab 未被拦截，焦点会逃逸到弹窗背后的 PlayerBar。

**解决**（`8256115`）：

- 初始聚焦目标抽为 `resolveQueueInitialFocusTarget` 纯函数：优先活动曲播放按钮，其次首个可聚焦项，两者皆无时落到弹窗根节点；
- `resolvePlayerOverlayKeyAction` 在 `focusableCount === 0` 时对 Tab（含 Shift+Tab）返回 `keep-root`，组件 `preventDefault` 并重新聚焦根节点，Escape 仍关闭弹窗；
- 新增空队列、单曲队列、活动曲按钮优先与首项兜底的焦点测试。

### Finding P2：播放模式菜单缺少真 roving tabindex，选择后焦点丢失

五个菜单项全部保持默认 `tabindex="0"`：方向键虽能移动焦点，但 Tab 仍逐项穿过菜单，不是标准 roving focus；且 PlayerBar 选择模式后调用 `closeModeMenu()` 不恢复模式按钮焦点，键盘 Enter/Space 选择后被聚焦的菜单项直接卸载，焦点可能落到 body。

**解决**（`6325c56`）：

- `focusedIndex` 成为唯一状态源：模板经 `resolveModeMenuItemTabIndex` 仅把当前项设为 `tabindex="0"`，其余 `-1`，Tab 以菜单为整体进出；方向键经 `resolveModeMenuKeydown` 更新 index 并聚焦对应项；
- 菜单项枚举改用专用 `getPlayerModeMenuItems`（`PLAYER_MODE_MENU_ITEM_SELECTOR`），不复用会排除 `tabindex="-1"` 的通用 focusable selector；
- 键盘选择直接以 `focusedIndex` 定位模式并 emit；PlayerBar 的 `handleSelectMode` 改走与 Escape 相同的 `handleModeMenuClose` 关闭路径，键盘与鼠标选择后都回传模式按钮焦点；
- 新增 Tab 整组进出、键盘选择、菜单项枚举保留 `-1` 项与 tabindex 绑定测试。DOM 层点击/焦点回传行为纳入 Electron 人工矩阵验证。

### Finding P2：歌词自动跟随未遵守 reduced-motion

`SyncedLyricsView` 默认使用 420-650ms Web Animations API 平滑移动歌词轨道，现有 reduced-motion CSS 只关闭 PlayerBar 和浮层动画，无法停止脚本创建的 `track.animate()`。

**解决**（`db25276`）：

- 新增 `useReducedMotion`（matchMedia factory 可注入）与 `lyricsMotion` 纯函数层：`resolveLyricsFollowBehavior` 使 reduced-motion 下默认跟随行为解析为 `auto`，`shouldAnimateLyricsFollow` 作为 WAAPI 创建门（`auto` 恒不创建动画）；
- 偏好中途切到 reduce 时 `watch` 立即取消在途动画并提交目标位置（`updateTarget('auto')`）；
- `onLyricLineActivate` 改用默认行为，不再强制 `smooth`；
- `manuscript.player.css` 的 reduced-motion 块补上 `.now-playing-panel[...]` 及其后代，关闭歌词行 opacity/filter transition；
- 新增低动效下不创建动画、行为解析与偏好变更跟踪测试。

### Finding P2：打开 Fullscreen 会启动隐藏 PlayerBar 的 palette worker

`resolvePlayerSurfacePresentation` 将 fullscreen 解析为 modern，而 PlayerBar 直接用 `presentation === 'modern'` 开启色板提取：从 manuscript 进入全屏时，底层不可见 PlayerBar 会重新加载封面并启动 palette worker，与 TECHDOC「打开全屏时底层 PlayerBar 不继续计算」的风险描述冲突。

**解决**（`73c83f6`）：

- 将「视觉 presentation」与「表面当前是否活跃」拆分：新增 `resolvePlayerVisualEffectsActive(displayMode)`（仅 `normal` 活跃）与 `resolvePlayerPaletteEnabled({ presentation, displayMode })`（`modern && normal`）；
- PlayerBar 改用 `paletteEnabled` 作为 palette 与 album tint 门，tint 层 `v-if` 同步切换；`isModernPlayer` 仅保留给 presentation 语义（album accent 与 owner marker）；
- Fullscreen 继续使用自己的 owner 与视觉管线；
- 新增 manuscript → fullscreen → normal 往返测试（隐藏 PlayerBar 不启动 palette）、活跃门与 palette 门测试；静态守卫同步更新 palette gate 断言。

（工程阶段其余未产生审查 Findings；Electron 人工矩阵完成后按需补充。）

## 4. 自动验证

| 命令                    | 结果                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm.cmd test`          | 通过；包含 player presentation / album tint / overlay focus 单测与视觉作用域 |
| `npm.cmd run typecheck` | 通过                                                                     |
| `npm.cmd run lint`      | 通过                                                                     |
| `npm.cmd run build`     | 通过                                                                     |
| `git diff --check`      | 通过；范围 `a1bd7fb..73c83f6`                                            |

新增 locale key（`player.lyricsNoTrack` / `lyricsSeekToLine` / `lyricsSeekToTime` / `lyricsStartingSoon`，`lyricsLoading` 复用）；`zh-Hant.json` 由 `locales:zh-hant` 生成，三语 key parity 校验通过。

## 5. 所有权边界

Phase 18 提交不包含：

- Fullscreen 播放器（Phase 19）、Miniplayer 与窗口尺寸控制（Phase 20）、桌面歌词独立窗口（Phase 21）；
- Renderer 自绘窗口按钮或 drag region；
- 播放引擎、队列算法、歌词解析、桌面歌词 typed IPC；
- 内容页 manuscript composition；
- 主进程、preload、typed IPC 与数据库。

PlayerBar 内的桌面歌词按钮与 toast 属于 Phase 18；桌面歌词独立窗口本体不属于。

## 6. 人工验收门

TECHDOC §12 Step 18.8 Electron 人工矩阵**待用户执行确认**，包括：modern / manuscript × light / dark、材质往返、播放 / 进度 / 音量 / 队列 / 模式 / 歌词 / 桌面歌词矩阵、`xl` 两侧与 900-1600px、Windows 缩放、连续 20 次风格切换往返、排除表面（Fullscreen / Miniplayer / 桌面歌词窗口）与 reduced-motion / reduced-transparency / prefers-contrast。

确认后本阶段由「工程完成」更新为「完全交付」。不补造截图，不填写未实测的耗时、内存或 GPU 数字。

## 7. Phase 19 前置条件

- Fullscreen 播放器建立独立 owner 呈现契约，不得继承 `data-player-presentation`（resolver 已保证 fullscreen 恒为 modern）；
- 现代全屏播放器继续保留自身深色 artwork 视觉域，独立设计其手稿形态；
- 保持 Phase 18 播放表面、palette gate 与浮层焦点模型可回滚。
