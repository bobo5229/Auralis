# Phase 22 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`3374857`（`refactor：移除页面实验性视觉风格切换入口`）
**状态**：Step 22.0 已完成；22.1 尚未改 `manuscript.css`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)（本阶段设计文档，随 22.0 一并入库）

## 1. 前置状态

| 阶段       | 真实结论                                       | 明确不宣称             |
| ---------- | ---------------------------------------------- | ---------------------- |
| Phase 1–17 | 工程与人工验收均已完成（用户 2026-08-13 回填） | 不补造截图或性能数字   |
| Phase 9–11 | 当前曲库规模下的视觉与功能项已回填             | 10k / 50k 容量门禁延期 |
| Phase 18   | 工程完成；Electron 人工矩阵待确认              | 不写完全交付           |
| Phase 19–21 | 已预留槽位（全屏 / Miniplayer / 桌面歌词）    | 本阶段不占用          |

Phase 22 是已覆盖 Library 表面的保留式修正，与 19–21 无依赖，不以外壳视觉工作重新打开
Phase 1–18 人工矩阵。Phase 18 人工矩阵仍待用户确认，本阶段不替它关闭。

## 2. 进入 Step 22.0 时的 `git status --short`

```text
 M docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md
 M docs/library-manuscript-skin-mvp/phase16/BASELINE.md
 M docs/library-manuscript-skin-mvp/phase18/BASELINE.md
 M docs/library-manuscript-skin-mvp/phase18/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase6/DELIVERY.md
 M docs/library-manuscript-skin-mvp/phase9/DELIVERY.md
 M src/renderer/features/library/components/LibraryContextMenu.vue
?? docs/library-manuscript-skin-mvp/phase22/
```

工作树中的已修改 docs 为既有阶段文档的表格对齐格式化（无内容变化）；`LibraryContextMenu.vue`
为独立于本阶段的右键菜单激活重构（用户未提交工作），不属于 Phase 22 所有权，随后续用户
提交处理，本阶段提交不含它。`phase22/` 目前仅含 `TECHDOC.md`。

## 3. 页根整页卡片现状摘录（拆除对象）

`src/renderer/features/library/styles/manuscript.css` Canvas 段（第 11–23 行）：

```css
.library-page[data-visual-style='manuscript'] {
  font-family: var(--manuscript-font-body);
  container-name: manuscript-library;
  container-type: inline-size;

  /* 约 12px 外围间隙；高度补偿上下 margin，避免 app-main 双滚动 */
  margin: 12px;
  height: calc(100% - 24px);
  border: var(--manuscript-hairline-width) solid var(--manuscript-border-strong);
  border-radius: var(--manuscript-radius-page);
  background: var(--manuscript-effect-paper-background);
  box-shadow: var(--manuscript-effect-page-shadow);
}
```

六件套现状：`margin: 12px`、`height: calc(100% - 24px)`、hairline border、`radius-page`、
`--manuscript-effect-paper-background`、`--manuscript-effect-page-shadow`。

另有一处过时注释：Controls 段「搜索框与视觉风格切换」需改为只描述搜索（22.1 一并处理）。

## 4. 保留边界（不得误拆）

- 壳层：`.app-window[data-shell-presentation='manuscript']` 已是 `--manuscript-surface-page`，
  `.app-main` 背景透明；页根改 `background: transparent` 即露出窗口纸面。
- `container-name: manuscript-library` / `container-type: inline-size` 必须保留（封面密度容器查询）。
- `--manuscript-effect-paper-background` / `--manuscript-effect-page-shadow` token 仍被专辑、归档、
  设置与 PlayerBar 消费，不得从 `manuscript.tokens.css` 删除。
- 页内封面组、搜索条、状态页装饰线、虚拟几何数字本阶段不改（除非双滚动迫使 `min-h-0` 最小修正）。

## 5. 已提交源码范围（Phase 22 起点）

```text
a1bd7fb..3374857  （Phase 18 工程 + 审查修复 + VisualStyleSwitch 清理）
```

本阶段提交将在 `3374857` 之上继续，不回写历史 Phase 2 / 6 / 7 的整页画布描述。
