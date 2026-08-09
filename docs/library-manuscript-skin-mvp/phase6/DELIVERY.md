# 手稿视觉系统固化 — Phase 6 交付记录

**执行日期**：2026-08-09  
**分支**：`script-skin-dev`  
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)  
**基线**：[`BASELINE.md`](./BASELINE.md)

---

## 1. 起止提交

| 角色 | 提交 | 说明 |
|---|---|---|
| 起点 | `de8b430` | Phase 5 日期修正后的工作树 |
| 6.0 | `736079b` | `docs：记录手稿视觉系统 Phase 6 基线` |
| 6.1 | `0987749` | `refactor：集中曲库虚拟列表布局指标`（含 border 高度校正） |
| 6.2–6.4 | `d47f9ec` | `refactor：拆分手稿 Token 并统一组件语义样式` |
| 6.5 | `536fb82` | `chore：完成手稿视觉系统 Phase 6 回归` |

**验收源码范围**：`de8b430..d47f9ec`（布局指标 + Token + 组件语义样式）  
**含 6.5 交付文档**：`de8b430..536fb82`（后续仅修正本表哈希的 docs 提交不改变源码）

---

## 2. 逐 Step 结果

| Step | 内容 | 结果 |
|---|---|---|
| 6.0 | 基线文档与高度差值分析 | 完成；确认曲目列更高时估算少 **3px**（panel border 2 + group border 1） |
| 6.1 | `libraryLayoutMetrics.ts` + LibraryPage + Uno + 高度公式 | 完成；`--library-*` 挂根节点；Uno shortcut 消费变量 |
| 6.1 校正 | `getAlbumGroupEstimatedHeight` 纳入 panel/group border | 完成（与 6.1 同批；before/after 见 §3） |
| 6.2 | `manuscript.tokens.css` Primitive / Semantic / Compatibility | 完成；旧 `--manuscript-paper` 等名称已删除 |
| 6.3 | `manuscript.css` 仅组件规则 + 语义 Token；`.library-status-state` | 完成；无手稿 hex/rgba 字面量 |
| 6.4 | 无障碍 / 字体角色核对 | 完成（Token 级）；焦点环与 sans/numeric 角色保留；无额外动效 |
| 6.5 | 自动校验与结构检查 | 通过（见 §4） |

---

## 3. Computed geometry 对照

### 平铺

| 项 | 值 |
|---|---:|
| `LIBRARY_LAYOUT_METRICS.flatRowHeight` | 44 |
| `estimateSize` / 搜索定位 | 同一常量 |
| 盒模型 | border-box + 底边；目标 44px |

### 封面组（示例）

| 场景 | Phase 5 旧公式 | Phase 6 新公式 |
|---|---:|---:|
| N=1，无发行日 | 302+56=**358** | max(302, 40+20+2)+56+1=**359** |
| N=1，有发行日 | 322+56=**378** | max(322, 62)+56+1=**379** |
| N=10，有发行日 | max(322,420)+56=**476** | max(322,422)+56+1=**479** |

差值：曲目列主导时 **+3px**（border 校正）；封面列主导时 **+1px**（仅 group border-b）。

---

## 4. 自动校验

| 命令 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run lint` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 通过 |

结构检查：

- `manuscript.css`：无 `#hex` / `rgba(`（仅 tokens 文件含色值）
- `styles/`：无 `:root` / `html` / `body` / `#app` 选择器
- `LibraryPage`：无裸 `estimateSize: () => 44` / `estimatedRowSize = 44`
- 构建产物 Uno CSS 含 `var(--library-*)`

---

## 5. 已知限制

- 壳层、Teleport 浮层、歌单页仍为 modern（Phase 6 不扩展）。
- baseline / final PNG 需本地 Electron 按 `screenshots/README.md` 补拍。
- Windows 显示缩放 100/125/150% 与真实大曲库滚动手测仍建议人工复核。
- Phase 7 档案页编排不在本阶段。

---

## 6. 文件清单

| 文件 | 动作 |
|---|---|
| `src/renderer/features/library/constants/libraryLayoutMetrics.ts` | 新增 |
| `src/renderer/features/library/styles/manuscript.tokens.css` | 新增 |
| `src/renderer/features/library/styles/manuscript.css` | 重构 |
| `src/renderer/features/library/pages/LibraryPage.vue` | 消费常量 / CSS vars / status class |
| `uno.config.ts` | shortcuts → `--library-*` |
| `docs/library-manuscript-skin-mvp/phase6/*` | 基线、交付、截图说明、TECHDOC |
