# Phase 16 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始提交**：`56feca9`（`feat：封面缓存垃圾回收与维护协调`）
**状态**：Step 16.0 已完成；16.1 尚未改设置页源码

## 1. 前置状态

| 阶段       | 真实结论                             | 明确不宣称              |
| ---------- | ------------------------------------ | ----------------------- |
| Phase 15   | 工程完成；审查 Findings 已修复       | Electron 人工矩阵未执行 |
| Phase 14   | 工程完成，人工已回填；工作树仍未提交 | 提交权属不属于 Phase 16 |
| Phase 9–11 | 当前曲库规模下的视觉与功能项已回填   | 10k / 50k 容量门禁延期  |

Phase 16 不以设置页视觉工作关闭 Phase 15 人工矩阵，也不接管 Phase 14、窗口框架或封面缓存之外的未提交改动。

## 2. 进入 Step 16.0 时的 `git status --short`

```text
 M AGENTS.md
 M docs/ARCHITECTURE.md
 M docs/techdoc-library-manuscript-skin-mvp.md
 M scripts/check-library-visual-scope.mjs
 M src/main/app/createWindow.ts
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
?? .zcode/
?? docs/library-manuscript-skin-mvp/phase14/
?? docs/library-manuscript-skin-mvp/phase16/
?? src/renderer/features/archive/styles/
?? src/renderer/features/archive/utils/
```

## 3. 未提交改动所有权

### 3.1 Phase 14（归档手稿）

- `src/renderer/features/archive/**`
- `scripts/check-library-visual-scope.mjs` 中的归档守卫增量
- `docs/library-manuscript-skin-mvp/phase14/`
- 共享 token 中的归档作用域增量

### 3.2 原生窗口框架 / 其他用户改动

- `AGENTS.md` 窗口框架段落
- `docs/ARCHITECTURE.md`
- `src/main/app/createWindow.ts`
- `src/preload/index.ts`
- `src/renderer/App.vue`
- `src/renderer/app/layout/WindowChromeControls.vue`（删除）
- `src/renderer/app/styles/main.css`
- `src/shared/ipc/api.ts` / `channels.ts` / `contracts.ts`
- 三语 locale 中的 `windowChrome` 删除
- `.zcode/` 不纳入本阶段

封面缓存相关改动已在起始提交 `56feca9` 合入，不属于未提交工作树。

### 3.3 Phase 16 本阶段文档

- `docs/library-manuscript-skin-mvp/phase16/TECHDOC.md`
- `docs/library-manuscript-skin-mvp/phase16/BASELINE.md`
- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md` 中的 Phase 16 开始状态

## 4. 设置页代码基线

- `/settings` 由 `SettingsPage.vue` 承载四个本地分区，默认 `selectedSection = 'library'`。
- 外观区已有固定深色主题说明、语言 radiogroup、PlayerBar 材质 radiogroup。
- 没有 Settings presentation resolver，根节点没有 `data-visual-style`。
- `MusicLibrarySettings.vue` 在挂载时订阅扫描与元数据进度；风格切换不得用 `v-if` / `key` 重建它。
- 现代玻璃、渐变标题、nav shimmer 与部分 reduced-motion 属于现有产品基线，必须保留给 `modern`。
- 没有 Settings 自有 Teleport overlay。

## 5. 进入时自动门禁（含既有未提交改动）

| 命令           | 结果                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| `npm.cmd test` | 通过；17 files passed / 2 skipped；71 tests passed / 18 skipped；视觉作用域通过 |

该结果证明当前混合工作树可运行测试，不表示 Phase 16 源码已完成，也不替代 16.7 人工矩阵。
