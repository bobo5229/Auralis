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
| 18.8  | `fd9ecbd` | `docs：交付 Phase 18 播放表面手稿化`        |

**源码范围**：`a1bd7fb..976fff1`
**含交付文档**：`a1bd7fb..fd9ecbd`

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

（工程阶段未产生审查 Findings；Electron 人工矩阵完成后按需补充。）

## 4. 自动验证

| 命令                    | 结果                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm.cmd test`          | 通过；包含 player presentation / album tint / overlay focus 单测与视觉作用域 |
| `npm.cmd run typecheck` | 通过                                                                     |
| `npm.cmd run lint`      | 通过                                                                     |
| `npm.cmd run build`     | 通过                                                                     |
| `git diff --check`      | 通过；范围 `a1bd7fb..976fff1`                                            |

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
