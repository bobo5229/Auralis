# Phase 17 交付记录：应用外壳与 Sidebar 手稿化

**状态**：工程完成；人工验收待 Electron 矩阵
**日期**：2026-08-13
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step      | 提交      | 说明                                 |
| --------- | --------- | ------------------------------------ |
| 17.0      | `f7ae036` | `docs：冻结 Phase 17 应用外壳基线`   |
| 17.1–17.6 | `7b467b3` | `feat：应用外壳与侧栏接入手稿呈现`   |
| 17.7      | `20becab` | `test：固化应用外壳手稿作用域门禁`   |
| 17.8      | `455baae` | `docs：交付 Phase 17 应用外壳手稿化` |

**源码范围**：`0c6d868..7b467b3`
**含交付文档**：`0c6d868..HEAD`

## 2. 已实现

- `resolveShellPresentation(displayMode, visualStyle)` 只在非 `mini` 且偏好为 `manuscript` 时解析为手稿；
- 普通 `.app-window` 挂 `data-shell-presentation`，Miniplayer 分支不携带该 marker；
- `AppSidebar` 接收 presentation prop，自身与全部 Teleport 根节点使用 `.sidebar-overlay` owner；
- `FacetsDialog` 只接收 presentation，不读取或持久化视觉偏好；
- `useArtworkPalette` 增加默认开启的 `enabled` 契约；manuscript 外壳停用封面色板计算；
- 仅 modern 且有封面时挂载 `FluidArtworkBackground` 与 blur overlay；
- manuscript chrome 回退到共享 `--manuscript-surface-page` / `--manuscript-accent-primary` / `--manuscript-border-strong`；
- 手稿覆盖 `.app-shell`、`.app-main`、Sidebar 品牌 / 工具 / 主导航 / 歌单树 / 拖排，以及创建、右键、重命名、删除、query 与 Facets 浮层；
- 风格切换不给 `AppSidebar` 或 `RouterView` 增加 `key` / `v-if`；
- 静态守卫检查唯一状态源、shell marker、Miniplayer 隔离、owner scope、排除表面与昂贵计算执行门。

未新增 visual-style 存储键、IPC、数据库迁移或窗口架构改动。未修改 Now Playing、PlayerBar、Fullscreen、Miniplayer 与桌面歌词。

## 3. 自动验证

| 命令                    | 结果                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm.cmd test`          | 通过；21 files / 2 skipped；85 tests passed / 18 skipped；视觉作用域通过 |
| `npm.cmd run typecheck` | 通过                                                                     |
| `npm.cmd run lint`      | 通过                                                                     |
| `npm.cmd run build`     | 通过                                                                     |
| `git diff --check`      | 通过；范围 `0c6d868..HEAD`                                               |

未新增 locale key。`zh-Hant.json` 随 build 生成链运行，无手工回写。

## 4. 所有权边界

Phase 17 提交不包含：

- Now Playing / PlayerBar / Fullscreen / Miniplayer / 桌面歌词换肤；
- Renderer 自绘窗口按钮或 drag region；
- 内容页 manuscript composition，除共享 token 增加 shell / Sidebar / settings owner；
- 主进程、preload、typed IPC 与数据库。

共享 token 的 `:where()` 同时补上 `.settings-page[data-visual-style='manuscript']`，使设置页不再依赖偶然继承。`.app-window` 只接收 primitive / semantic manuscript 变量，不重映射 `--auralis-*`，避免 PlayerBar 与 Now Playing 被纸面色板污染。

## 5. 人工验收门

自动检查通过不代替 TECHDOC §12 Step 17.8 Electron 矩阵。完成前不得从「工程完成」更新为「完全交付」。

不补造截图，不填写未实测的 DPI、换曲耗时或窗口几何数字。

## 6. Phase 18 前置条件

- Phase 17 工程改动保持可回滚，且不把 `data-shell-presentation` 当作 PlayerBar / Now Playing 的换肤开关；
- Phase 18 必须为播放表面建立独立 owner scope，不得复用 `.app-shell` 宽泛后代规则。
