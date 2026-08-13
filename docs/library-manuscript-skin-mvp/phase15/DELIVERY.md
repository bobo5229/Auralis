# Phase 15 交付记录：手稿皮肤覆盖普通与智能歌单

**状态**：工程完成；人工验收待 Electron 矩阵  
**日期**：2026-08-13  
**分支**：`script-skin-dev`  
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)  
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step | 提交      | 说明                                           |
| ---- | --------- | ---------------------------------------------- |
| 15.0 | `06417a3` | `docs：冻结 Phase 15 基线并回填已确认人工验收` |
| 15.1 | `0463195` | `refactor：建立歌单手稿路由与身份契约`         |
| 15.2 | `d56f003` | `refactor：原子提交歌单身份与列表快照`         |
| 15.3 | `200cf1e` | `feat：为普通与智能歌单增加手稿档案页眉`       |
| 15.4 | `f5d2518` | `feat：歌单页面复用视觉切换与搜索定位`         |
| 15.5 | `f5e07b0` | `fix：闭合歌单页面刷新与手稿浮层状态`          |
| 15.6 | `61392cb` | `test：补齐歌单手稿路由与作用域护栏`           |
| 15.7 | `a47b44b` | `feat：手稿皮肤覆盖普通与智能歌单`             |

**源码范围**：`b24c0e4..61392cb`  
**含交付文档**：`b24c0e4..a47b44b`

## 2. 已实现

- `resolveLibraryPresentation` 允许 `library`、`playlist`、`smart-playlist` 三个明确路由消费共享手稿偏好；
- `resolveLibrarySurfaceKind` 与 `LibraryPageIdentity` 描述产品表面，不是第二套视觉偏好；
- identity、tracks、viewMode 经 `commitLibrarySnapshot` 原子提交；foreground 清空过期标题；
- 页眉按 identity 显示全部歌曲 / 普通选辑 / 智能规则索引，动态名称保留原文 `title`；
- 三个路由均可切换 `VisualStyleSwitch`；搜索热区与 `/` 以 Library surface 为边界；
- 搜索索引仍由当前 `tracks` 构建；切风格保留查询，切路由清空；
- 监听 `auralis-playlists-changed` / `auralis-smart-playlists-changed`，经现有 coordinator 做 background refresh；
- 子组件与 Teleport 统一消费 `libraryPresentation`；焦点回传不再仅限手稿；
- 静态守卫覆盖三路由契约、`data-library-surface`、页眉 identity、overlay owner 与 locale header parity。

未新增 IPC、数据库迁移、visual-style store 或 localStorage key。未实现歌单内移除、重排或规则编辑 UI。

## 3. 审查 Findings 与解决方案

### Finding 1：页眉为长名称预留两行，抬高全部歌曲滚动区

**风险**：全部歌曲标题只有一行，却固定 `min-height: 3.5rem`，成员语义再换行时页眉继续长高，压缩列表可视高度。  
**解决方案**：标题改回单行省略并保留 `title`；副标题行 `nowrap`，仅成员文案可截断。虚拟项高度仍不计入页眉。

### Finding 2：加载失败后页眉仍显示“装订中”

**风险**：foreground 失败会留下 `identity = null` 且 `isLoading = false`，页眉继续使用 loading 文案，与 `LibraryStatusState` 的错误态冲突。  
**解决方案**：标题由纯函数 `resolveLibraryHeaderTitleSource` 根据 identity / route surface / loading 解析；失败或空名称回退到“普通歌单 / 智能歌单”，不再假装仍在装订。

### Finding 3：`data-library-surface` 绑在已提交 identity 上，加载和失败时丢失

**风险**：foreground 清空 identity 后根节点没有 surface marker，语义 CSS 和静态辨认在切换歌单时会出现空窗。  
**解决方案**：根节点改为绑定 `resolveLibrarySurfaceKind(route.name)`；标题身份仍只来自快照。

### Finding 4：仓库契约仍要求歌单保持 modern

**风险**：`AGENTS.md` 仍写 playlist / smart-playlist 必须 modern，后续改动手稿时会被错误回退。  
**解决方案**：将 Library 家族三路由写入共享偏好契约，测试说明改为核验三种 route 的两种风格，并明确 `.library-overlay` 覆盖歌单浮层。

## 4. 自动验证

在起始工作树（含 Phase 14 与原生标题栏未提交改动）上执行：

| 命令                    | 结果                                      |
| ----------------------- | ----------------------------------------- |
| `npm.cmd test`          | 通过；13 files / 41 tests；视觉作用域通过 |
| `npm.cmd run typecheck` | 通过                                      |
| `npm.cmd run lint`      | 通过；三语 locale key 一致                |
| `npm.cmd run build`     | 通过                                      |
| `git diff --check`      | 通过                                      |

补充：Phase 15 相关源码与守卫 Prettier check 通过。`zh-Hans.json` / `zh-Hant.json` / 页眉组件严格 UTF-8 解码通过。

`npm.cmd run build` 会用 s2tw 重写 `zh-Hant.json`。已把繁中手稿页眉恢复为 15.3 提交用词，不把生成器结果与 windowChrome 删除混进本阶段。

## 5. 与既有未提交改动的边界

Phase 15 提交不包含：

- Phase 14 归档手稿源码与 `phase14/` 文档；
- 原生窗口控制 / IPC / `WindowChromeControls` 删除；
- `AGENTS.md` 中的窗口框架与归档段落；`docs/ARCHITECTURE.md` 等非本阶段文档。

Finding 4 只修订 `AGENTS.md` 的 Library 三路由契约与测试说明，不把窗口 / 归档改动带进本阶段提交。

工作树中上述改动所有权不变。自动门禁在混合工作树上通过，不表示这些无关改动已交付。

## 6. 人工验收门

自动检查通过不代替 Electron 内 TECHDOC §5.7 矩阵。完成前本阶段不得从「工程完成」更新为「完全交付」。

必验：三个路由 × modern/manuscript、两类歌单身份与长名称、独立 viewMode、当前列表搜索、普通歌单添加/去重、智能歌单只读成员与规则进出、queue 不越界、浮层与排除表面、900–1600 宽度与 Windows 100/125/150%。

不补造截图，不填写未实测的 10k / 50k 或分档 DPI 像素。
