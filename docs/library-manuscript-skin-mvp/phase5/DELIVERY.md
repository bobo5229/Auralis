# 手稿皮肤 MVP — Phase 5 交付记录

**执行日期**：2026-08-09  
**分支**：`script-skin-dev`  
**TECHDOC**：[`docs/techdoc-library-manuscript-skin-mvp.md`](../../techdoc-library-manuscript-skin-mvp.md)  
**截图目录**：[`screenshots/`](./screenshots/)

### 验收提交范围

| 角色 | 提交 | 说明 |
|---|---|---|
| Phase 4 终点（验收起点） | `06f0a0f` | `fix：提升手稿搜索框焦点环对比度`（2026-08-09） |
| Phase 5 交付提交 | `7eefb70` | `chore：纳入手稿皮肤 Phase 5 交付物并修正 docs 忽略规则`（2026-08-09） |

- **范围写法**：`06f0a0f..7eefb70`（Phase 5 门禁与交付相对 Phase 4 末的 diff）
- **源码对应**：自动校验与代码层矩阵针对即将合入 `7eefb70` 的工作树（含 `manuscript.css` 回归修复）；`7eefb70` 即为该树的 Phase 5 交付快照。
- **说明**：`2026-08-07` 仅覆盖 Phase 1–2 及部分 Phase 2 修复提交，**不是** Phase 5 执行日。

---

## 1. 自动校验

在上述工作树（`06f0a0f` + Phase 5 CSS 修复）上执行，结果随 `7eefb70` 固化：

| 命令 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run lint`（含 `locales:check`） | 通过 |
| `npm.cmd run build` | 通过 |

---

## 2. 代码层矩阵核对

| 维度 | 组合 / 必验项 | 结论 |
|---|---|---|
| 视觉风格 | modern / manuscript | `data-visual-style` 由 `isManuscriptLibrary` 驱动，切换立即生效 |
| 歌曲视图 | flat / cover | 手稿 CSS 同时覆盖 `.song-row` 与 `.album-cover-group` |
| 路由 | 全部歌曲 / 智能歌单 / 普通歌单 | 仅 `route.name === 'library'` 应用手稿；歌单强制 modern，不清除偏好 |
| 窗口宽度 | `< xl` / `>= xl` | 样式仅挂在 `.library-page`，不改壳层几何 |
| 持久化 | localStorage / 非法值 / 重启 | key `auralis-visual-style`；union 校验；失败回退 `modern` |
| 虚拟列表 | 44px / 40px | 未改 `estimateSize`；播放竖条绝对定位；`song-cover` border-box |
| 无重管线 | rAF / Canvas / 取色 | 未新增持续动画、Canvas 或封面调色消费 |
| 交互契约 | 选中 / 双击 / 搜索 / 右键 / 元数据 | 语义未改；queue 仍用当前 `tracks` 作用域 |
| 样式污染 | 壳层 / Miniplayer / 桌面歌词 | 命名空间前缀；`useVisualStyle` 仅 Library feature 消费 |
| 无障碍 | 焦点 / 对比度 | 切换控件 `aria-pressed` + focus-visible；token 目标 AA |

---

## 3. Phase 5 回归修复（代码）

文件：`src/renderer/features/library/styles/manuscript.css`

1. 平铺 `song-cover` 补 `box-sizing: border-box`，避免 1px 描边把 44×44 撑成 46×46。
2. 封面分组选择器加长为 `.album-cover-group …`，特异性高于 `AlbumCoverGroup` / `AlbumCoverTrackRow` scoped，避免玻璃模糊与大圆角回潮。

---

## 4. 截图清单

约定文件名见 [`screenshots/README.md`](./screenshots/README.md)。提交时应包含：

| 文件 | 说明 |
|---|---|
| `flat-modern.png` | 平铺 + modern |
| `flat-manuscript.png` | 平铺 + manuscript |
| `cover-modern.png` | 封面分组 + modern |
| `cover-manuscript.png` | 封面分组 + manuscript |
| `window-below-xl.png` | 窗口宽度 `< xl`（无 Now Playing） |
| `window-xl.png` | 窗口宽度 `>= xl`（有 Now Playing） |

若目录中仅有 README 而无 PNG，表示视觉截图待本地 Electron 补拍后追加同一验收目录。

---

## 5. 已知限制（DoD 边界）

- Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词保持现代流光。
- 右键菜单与元数据 Dialog 保持现代玻璃样式（Teleport，明确 MVP 边界）。
- 智能/普通歌单复用 `LibraryPage` 但不应用手稿，且不清除用户手稿偏好。
- 页面级 loading / 搜索框等部分历史硬编码文案不在本 MVP 范围。
- 是否扩展至歌单、专辑、全屏播放器与全局浮层须另行立项。

---

## 6. 版本控制说明

`.gitignore` 默认忽略 `docs/*`。本交付通过精确例外纳入版本控制：

- `docs/techdoc-library-manuscript-skin-mvp.md`
- `docs/library-manuscript-skin-mvp/**`（本目录与截图）
