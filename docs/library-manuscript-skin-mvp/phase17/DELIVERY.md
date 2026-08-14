# Phase 17 交付记录：应用外壳与 Sidebar 手稿化

**状态**：完全交付；Electron 人工验收通过（2026-08-13）
**日期**：2026-08-13
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step         | 提交      | 说明                                                      |
| ------------ | --------- | --------------------------------------------------------- |
| 17.0         | `f7ae036` | `docs：冻结 Phase 17 应用外壳基线`                        |
| 17.1–17.6    | `7b467b3` | `feat：应用外壳与侧栏接入手稿呈现`                        |
| 17.7         | `20becab` | `test：固化应用外壳手稿作用域门禁`                        |
| 17.8         | `455baae` | `docs：交付 Phase 17 应用外壳手稿化`                      |
| 17.8 补记    | `b77c453` | `docs：补全 Phase 17 交付记录中的逐步提交哈希`            |
| 17.8 空白    | `83b98d0` | `docs：去除 Phase 17 交付记录尾随空白`                    |
| 审查 token   | `95781a8` | `fix：阻止外壳手稿 token 重映射泄漏到播放表面`            |
| 审查 F1      | `ac497bc` | `fix：侧栏弹窗补齐 Escape 与焦点约束`                     |
| 审查 F1 补记 | `badb5a9` | `docs：记录 Phase 17 审查 Finding 1 提交哈希`             |
| 审查 F2      | `3f75d79` | `fix：手稿侧栏浮层 reduced-motion 命中 Transition 根节点` |
| 审查 F3      | `eb9c1b6` | `docs：补全 Phase 17 交付范围与审查 Findings`             |

**源码范围**：`0c6d868..3f75d79`
**含交付文档**：`0c6d868..eb9c1b6`

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
- 静态守卫检查唯一状态源、shell marker、Miniplayer 隔离、owner scope、排除表面与昂贵计算执行门；
- 重命名 / Query / 删除弹窗具备 Escape、Tab 循环、背景 inert 与关闭后焦点恢复；
- Facets 打开/关闭过渡在 `prefers-reduced-motion: reduce` 下停止。

未新增 visual-style 存储键、IPC、数据库迁移或窗口架构改动。未修改 Now Playing、PlayerBar、Fullscreen、Miniplayer 与桌面歌词。

## 3. 审查 Findings 与解决方案

### Finding 1：Sidebar modal 缺少键盘关闭与焦点约束

重命名、Query 和删除弹窗声明了 `aria-modal`，但没有 Escape、Tab 焦点陷阱、背景 `inert` 或关闭后的焦点恢复。

**解决**：在 Sidebar owner 内抽取 `sidebarModalFocus` / `useSidebarOwnedModal`。打开时保存菜单外的有效触发元素（歌单行或新建按钮），打开期间把 `[data-app-shell-root]` 设为 `inert`，捕获阶段处理 Escape 与循环 Tab，关闭后恢复到仍挂载的触发元素，否则回退到新建歌单按钮。Query 提交中不允许 Escape。不引入全局 Dialog 框架，也不改 Facets 既有键盘路径。

### Finding 2：reduced-motion 选择器无法命中 Transition 根节点

`facets-dialog-fade-*` 与 `.sidebar-overlay` 在同一根节点上，后代选择器匹配不到；Facets 自身 scoped 的 160ms opacity 仍会执行。

**解决**：手稿 overlay 规则改为同元素选择器；`FacetsDialog` 在 `prefers-reduced-motion: reduce` 下关闭该过渡，modern 与 manuscript 均生效。

### Finding 3：交付源码范围遗漏后续修复提交

交付记录曾将源码范围截止到 `7b467b3`，遗漏 `95781a8` 等后续修复，并用动态 `HEAD` 作为文档边界。

**解决**：步骤表列入全部后续修复与文档补记；源码范围固定为 `0c6d868..3f75d79`，文档范围在本轮交付文档提交后写入明确哈希。

## 4. 自动验证

| 命令                    | 结果                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm.cmd test`          | 通过；22 files / 2 skipped；93 tests passed / 18 skipped；视觉作用域通过 |
| `npm.cmd run typecheck` | 通过                                                                     |
| `npm.cmd run lint`      | 通过                                                                     |
| `npm.cmd run build`     | 通过                                                                     |
| `git diff --check`      | 通过；范围 `0c6d868..3f75d79`                                            |

未新增 locale key。`zh-Hant.json` 随 build 生成链运行，无手工回写。

## 5. 所有权边界

Phase 17 提交不包含：

- Now Playing / PlayerBar / Fullscreen / Miniplayer / 桌面歌词换肤；
- Renderer 自绘窗口按钮或 drag region；
- 内容页 manuscript composition，除共享 token 增加 shell / Sidebar / settings owner；
- 主进程、preload、typed IPC 与数据库。

共享 token 的 `:where()` 同时补上 `.settings-page[data-visual-style='manuscript']`，使设置页不再依赖偶然继承。`.app-window` 只接收 primitive / semantic manuscript 变量，不重映射 `--auralis-*`，避免 PlayerBar 与 Now Playing 被纸面色板污染。

## 6. 人工验收门

用户已确认 TECHDOC §12 Step 17.8 Electron 人工矩阵通过，本阶段人工验收门关闭。

不补造截图，不填写未实测的 DPI、换曲耗时或窗口几何数字。

## 7. Phase 18 前置条件

- Phase 17 工程改动保持可回滚，且不把 `data-shell-presentation` 当作 PlayerBar / Now Playing 的换肤开关；
- Phase 18 必须为播放表面建立独立 owner scope，不得复用 `.app-shell` 宽泛后代规则。
