# Phase 15 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`b24c0e458737ec19b25f019a213f5f937f4711dc`（`feat：完成手稿皮肤阶段九至十三`）
**状态**：Step 15.0 已完成；15.1 尚未改源码

## 1. 前置回填

Phase 15 TECHDOC 前置门禁要求：用户已确认既有人工验收通过，开始前按真实结果回填。

| 阶段     | 回填结论                         | 明确不宣称                         |
| -------- | -------------------------------- | ---------------------------------- |
| Phase 6  | 视觉与功能人工项关闭             | 不入库 PNG；无分档 DPI 像素表      |
| Phase 8  | 用户确认通过                     | 无独立截图入库                     |
| Phase 9  | 当前曲库规模下的视觉与功能项关闭 | 10k / 50k 容量门禁延期             |
| Phase 10 | 不新增 UI 矩阵；继承 Phase 9     | 容量门禁延期                       |
| Phase 11 | 工程完成                         | 10k / 50k 性能实测延期，无虚构数字 |
| Phase 12 | 用户确认通过                     | 不补造目录页截图                   |
| Phase 13 | 用户确认通过                     | 不补造详情页截图                   |
| Phase 14 | 用户确认通过；工作树仍未提交     | 提交权属不属于 Phase 15            |

容量延期项继续可追踪，不与 Phase 15 视觉实现混写为完成。

## 2. 进入 Step 15.0 时的 `git status --short`

记录冻结当时工作树，不回退、不覆盖这些改动：

```text
 M AGENTS.md
 M docs/ARCHITECTURE.md
 M docs/techdoc-library-manuscript-skin-mvp.md
 M scripts/check-library-visual-scope.mjs
 M src/main/app/createWindow.ts
 M src/main/ipc/registerIpcHandlers.ts
 M src/preload/index.ts
 M src/renderer/App.vue
 D src/renderer/app/layout/WindowChromeControls.vue
 M src/renderer/app/styles/main.css
 M src/renderer/features/appearance/styles/manuscript.tokens.css
 M src/renderer/features/archive/components/MusicDnaCard.vue
 M src/renderer/features/archive/pages/ArchivePage.vue
 M src/renderer/locales/en.json
 M src/renderer/locales/zh-Hans.json
 M src/renderer/locales/zh-Hant.json
 M src/shared/ipc/api.ts
 M src/shared/ipc/channels.ts
 M src/shared/ipc/contracts.ts
?? docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md
?? docs/library-manuscript-skin-mvp/phase14/
?? docs/library-manuscript-skin-mvp/phase15/
?? src/renderer/features/archive/styles/
?? src/renderer/features/archive/utils/
```

## 3. 未提交改动所有权

Phase 15 只拥有本阶段文档与后续 15.1+ 源码。下列改动必须保持原所有权：

### 3.1 Phase 14（归档手稿，待其单独提交）

- `src/renderer/features/archive/pages/ArchivePage.vue`
- `src/renderer/features/archive/components/MusicDnaCard.vue`
- `src/renderer/features/archive/styles/`
- `src/renderer/features/archive/utils/`
- `src/renderer/features/appearance/styles/manuscript.tokens.css` 中的归档相关增量
- `scripts/check-library-visual-scope.mjs` 中的归档守卫增量
- `docs/projects/library-manuscript-skin-mvp/phase14/`
- 三语 locale 中的归档相关增量

### 3.2 其他用户 / 主窗口改动（非 Phase 15）

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `src/main/app/createWindow.ts`
- `src/main/ipc/registerIpcHandlers.ts`
- `src/preload/index.ts`
- `src/renderer/App.vue`
- `src/renderer/app/layout/WindowChromeControls.vue`（删除）
- `src/renderer/app/styles/main.css`
- `src/shared/ipc/api.ts`
- `src/shared/ipc/channels.ts`
- `src/shared/ipc/contracts.ts`

这些路径若与 Phase 15 冲突，必须暂停并重新审查范围，不得为了手稿歌单去改 main / preload / IPC。

### 3.3 Step 15.0 本阶段文档

- `docs/projects/library-manuscript-skin-mvp/phase15/TECHDOC.md`
- `docs/projects/library-manuscript-skin-mvp/phase15/BASELINE.md`
- `docs/projects/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`
- 既有 Phase 6 / 8 / 9 / 10 / 11 / 12 / 13 交付状态回填
- Phase 14 文档仅在其未提交树上同步回填结论，不把它的源码纳入 Phase 15 提交

## 4. 当前产品与代码基线

- Vue Router 将 `/`、`/playlists/:id`、`/smart-playlists/:id` 指向同一 `LibraryPage.vue`。
- `resolveLibraryPresentation` 只允许 `routeName === 'library'` 且 `visualStyle === 'manuscript'` 进入手稿。
- `playlist` 与 `smart-playlist` 被强制为 `modern`。
- `VisualStyleSwitch` 与搜索热区仍以全部歌曲为入口边界。
- `LibraryArchiveHeader` 写死全部歌曲标题语义。
- 共享偏好源仍是 `useVisualStyle` / `auralis-visual-style`。
- 平铺 44px、封面曲目 40px、封面 250px、分组 metrics 保持不变。
- 不存在歌单「从列表移除曲目」typed IPC；Phase 15 不补建。

## 5. 进入时自动门禁（含既有未提交改动）

在起始提交 `b24c0e4` 加上第 2 节工作树的状态下执行：

| 命令                    | 结果                                      |
| ----------------------- | ----------------------------------------- |
| `npm.cmd test`          | 通过；11 files / 30 tests；视觉作用域通过 |
| `npm.cmd run typecheck` | 通过                                      |
| `npm.cmd run lint`      | 通过；三语 locale key 一致                |
| `npm.cmd run build`     | 通过                                      |
| `git diff --check`      | 通过                                      |

该结果证明当前混合工作树可构建，不表示 Phase 15 源码已完成，也不替代 15.7 的人工矩阵。

## 6. 风险基线

1. 快速切换歌单时标题与曲目可能来自不同请求。
2. 把智能歌单「只读成员」误做成整页禁用。
3. 搜索索引越出当前歌单。
4. Sidebar changed 事件造成刷新风暴或绕过 generation。
5. 页眉长名称改变滚动几何。
6. 视觉切换清空搜索状态。
7. 无 owner 的 `.playlist-*` 选择器泄漏到 Sidebar。
8. 视觉阶段膨胀为移除 / 排序 / 规则编辑 / 新 IPC。

对应方案已写入 TECHDOC §7。Phase 15 不修改 `src/main/**`、`src/preload/**`、`src/shared/ipc/**`。
