# Phase 22 交付记录：歌曲列表页取消整页卡片

**状态**：工程完成；Electron 人工矩阵待确认
**日期**：2026-08-13
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step   | 提交      | 说明                                              |
| ------ | --------- | ------------------------------------------------- |
| 22.0   | `74dbddc` | `docs：冻结 Phase 22 歌曲列表页画布基线`          |
| 22.1   | `57f647d` | `fix：手稿歌曲列表页改为铺满主栏纸面`             |
| 22.2   | 并入 22.1 | 滚动与状态页沿用同一几何，无需改 Vue              |
| 22.3   | `232ef1f` | `test：禁止手稿歌曲列表页根再变回整页卡片`        |
| 22.5   | 见下      | `docs：交付 Phase 22 歌曲列表页取消整页卡片`      |

**源码范围**：`74dbddc..232ef1f`
**含交付文档**：`74dbddc..<交付提交哈希>`（提交后回填）

## 2. 已实现

- 手稿 `library` / `playlist` / `smart-playlist` 页根拆除整页卡片六件套：`margin: 0`、`height: 100%`
  （删除 `calc(100% - 24px)` 补偿，与 Uno `h-full` 一致）、`border: 0`、`border-radius: 0`、
  `background: transparent`（露出窗口 `--manuscript-surface-page`）、`box-shadow: none`；
- 保留 `container-name: manuscript-library` / `container-type: inline-size`，封面密度容器查询继续
  以页根为容器；`font-family` 保留；
- Controls 段过时注释「搜索框与视觉风格切换」改为只描述搜索；
- 滚动与状态页未改 Vue：`.library-list-scroll` 的 `flex-1 overflow-auto` 自动最小尺寸归零，列表内部
  滚动、Playbar 安全区与空 / 加载 / 错误状态继续铺在同一张纸上；
- 静态守卫新增页根反回归断言（`extractLibraryPageRootRule`）：页根无 12px margin、无高度补偿、
  无 paper-background / page-shadow、`margin: 0` 与 `background: transparent` 在位；专辑 / 专辑详情 /
  归档 / 设置页根继续保留整页卡片 token，不被「桌面一致」误拆；
- `--manuscript-effect-paper-background` / `--manuscript-effect-page-shadow` 共享 token 未删除。

未新增视觉偏好、locale key、IPC、数据库迁移或窗口架构改动。未改 Sidebar、Now Playing、LyricsPanel、
PlayerBar、Fullscreen、Miniplayer、桌面歌词与壳层 grid 几何。

## 3. 审查 Findings 与解决方案

工程阶段未产生审查 Findings。Electron 人工矩阵完成后按需补充。

## 4. 自动验证

| 命令                    | 结果                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `npm.cmd test`          | 通过；28 files / 144 tests passed / 18 skipped；视觉作用域通过  |
| `npm.cmd run typecheck` | 通过                                                            |
| `npm.cmd run lint`      | 通过（守卫 Prettier 警告已修复并 amend）                        |
| `npm.cmd run build`     | 通过                                                            |
| `git diff --check`      | 通过；范围 `74dbddc..232ef1f`                                   |

## 5. 所有权边界

Phase 22 提交不包含：

- 流光（modern）歌曲列表、专辑目录、专辑详情、归档、设置页的整页卡片；
- Sidebar、Now Playing、LyricsPanel、PlayerBar、Fullscreen、Miniplayer、桌面歌词；
- 壳层网格、列宽、`--auralis-shell-edge-gap`；
- 虚拟行高、封面几何、搜索算法、播放队列、IPC 与数据库；
- 工作树中用户未提交的 `LibraryContextMenu.vue` 右键菜单重构与既有 docs 表格对齐。

## 6. 人工验收门

TECHDOC §11 Electron 人工矩阵**待用户执行确认**：手稿三路由 × 平铺 / 封面无整页描边 / 圆角 / 阴影 /
外缝；空态 / 加载 / 错误无框；Playbar 浮在连续纸上且安全区有效；`xl` 两侧与隐藏右栏；modern 列表
与手稿专辑 / 归档 / 设置整页卡片无回归；搜索、播放、右键、元数据、风格往返状态不丢；
`prefers-reduced-motion` 与窗口最大化 / 还原无双滚动。

确认后本阶段由「工程完成」更新为「完全交付」。不补造截图，不填写未实测的数字。

## 7. 与 Phase 19–21 的关系

Phase 22 与 19–21（全屏播放器、Miniplayer、桌面歌词）无依赖、并行推进，不占用 19–21 槽位。
19–21 未实施期间，本阶段的歌曲列表页根纸面身份不依赖它们。
