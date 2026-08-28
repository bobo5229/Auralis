# LibraryPage 编排拆分实现报告

- **分支**：`refactor/library-page-orchestration`
- **worktree**：`D:\VSCode\Auralis\.worktrees\library-page-orchestration`
- **状态**：DONE_WITH_CONCERNS
- **日期**：2026-08-28

## Step commits

| Step | 说明 | Hash |
| --- | --- | --- |
| 1 | 现有 library Vitest 全绿，无代码改动，无 commit | — |
| 2 | `refactor：抽出曲库键盘焦点纯函数` | `1c045f8600015c382477934d5fdd72c8e311a321` |
| 3 | `refactor：抽出曲库首个可见曲目计算` | `403ec8c94dbaafdabd3a4bdfc8cb65b6ded87399` |
| 4 | `refactor：抽出曲库搜索会话` | `c1c17059a4e7492a7e08ef5bd19221ed3902e751` |
| 5 | `refactor：抽出曲库视口与滚动 generation` | `60b6410e64fc468cb7d000e32cae2681283614f3` |
| 6 | `refactor：抽出曲库右键菜单会话` | `d9b97b1ba2490336166bac7178f765c951e5ecf5` |
| 7 | `refactor：抽出曲库目录加载会话` | `332527243dc4b15a0d6b61439a258da34783de38` |
| 8 | `refactor：LibraryPage 改为 composable 接线` | `9dfab40cc8c7fc13ec6c366207feed6ca070ca1a` |
| 9 | 验证全绿，无修复 commit | — |

## 跑过的命令与结果

```powershell
npm.cmd exec vitest run src/renderer/features/library --config vitest.config.ts
```

19 files / 89 tests passed。`npm.cmd exec` 会把 `--config` 当成 npm 参数并打印 warn，但 Vitest 仍加载了 `vitest.config.ts` 并跑完。

```powershell
npm.cmd run typecheck
```

通过（`vue-tsc` + `tsc`）。

```powershell
npm.cmd run lint
```

通过（含 `locales:check`，`eslint --max-warnings 0`）。

```powershell
git diff --check
```

无空白错误。

未跑 `npm.cmd test` 全套，未跑 native Electron / `build`。

## LibraryPage.vue script 行数

`<script setup>` 含 import 共 **540 行**（文件第 1–540 行，含标签）。目标 450–600，上限 650。

## 偏差

- `useLibraryViewport` 的 `tracks` / `isCoverView` / `derivedIndex` / `albumGroups` / `virtualAlbumGroups` 使用结构类型 `{ readonly value: ... }`，而不是 TECHDOC 字面 `ComputedRef<...>`。原因是 Vue `ComputedRef` 对含额外字段或 `ReadonlyMap` 的索引类型不变，页面现有 computed 无法直接传入。运行时仍读 `.value`。
- `useLibrarySearchSession` 额外返回 `resetMatchCursor()`（TECHDOC Step 7 允许），供 snapshot commit 重置匹配游标。
- 搜索/目录 DEV 诊断在 Vitest 中会打 stdout；scope 仍是 `library.search` / `library.catalog`。
- 未改 `LIBRARY_LAYOUT_METRICS` 数字、快照分页/游标、IPC、SQLite、扫描、Playbar、Miniplayer、`settings.chrome.css`。

## 未做的 GUI 人工项（隔离实现后待主分支人工确认）

- modern / manuscript 各切两次
- flat / cover 视图切换
- 搜索 Enter 循环命中
- 后台刷新时用户滚动不被拽回 playing/selected
- 右键加入歌单
- 元数据保存后焦点归还
- 风格切换后选择、队列、搜索 query、菜单、懒加载是否保留

## 状态

**DONE_WITH_CONCERNS**：自动验证通过，script 行数达标；GUI 未在隔离分支人工确认；viewport options 类型相对 TECHDOC 字面签名有结构类型放宽。
