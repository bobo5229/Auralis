# 手稿视觉系统固化 — Phase 6 交付记录

**执行日期**：2026-08-09
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)
**审查**：[`REVIEW.md`](./REVIEW.md)

**当前状态**：**代码实现完成（含 REVIEW Finding 1–7 修复）；人工验收待完成**

---

## 1. 起止提交

| 角色 | 提交 | 说明 |
|---|---|---|
| 起点 | `de8b430` | Phase 5 日期修正后的工作树 |
| 6.0 | `736079b` | `docs：记录手稿视觉系统 Phase 6 基线` |
| 6.1 | `0987749` | `refactor：集中曲库虚拟列表布局指标`（含 border 高度校正，见 §6） |
| 6.2–6.4 | `d47f9ec` | `refactor：拆分手稿 Token 并统一组件语义样式` |
| 6.5 | `536fb82` | `chore：完成手稿视觉系统 Phase 6 回归` |
| REVIEW F1+F3 | `35c2fff` | `fix：连接曲库布局指标与封面面板 DOM 事实源` |
| REVIEW F4 | `efc3ed5` | `refactor：收紧手稿 Token 分层与 Compatibility 映射` |
| REVIEW F5 | `e833628` | `fix：搜索框过渡遵守 prefers-reduced-motion` |
| REVIEW F2+F6 | `385e30e` | `docs：落实 Phase 6 审查结论与人工门禁状态` |
| REVIEW F7 | （提交后写入本行哈希） | `docs：同步 Phase 6 TECHDOC 布局字段与 DELIVERY 哈希` |

**验收范围（固定哈希，无 tip 占位）**：

| 范围 | 写法 | 含义 |
|---|---|---|
| 初版实现源码 | `de8b430..d47f9ec` | 布局指标 + Token + 组件语义样式 |
| 含 6.5 交付文档 | `de8b430..536fb82` | 上表至 6.5 |
| REVIEW 代码修复 | `de8b430..e833628` | 含 F1/F3/F4/F5 源码终点 |
| REVIEW 含状态文档 | `de8b430..385e30e` | 含 F2/F6 文档 |
| 含 F7 文档同步 | 见 F7 提交行 | TECHDOC/DELIVERY 字段与哈希对齐 |

---

## 2. 逐 Step 结果

| Step | 内容 | 结果 |
|---|---|---|
| 6.0 | 基线文档与高度差值分析 | 完成；确认曲目列更高时估算少 **3px** |
| 6.1 | 布局指标 + LibraryPage + Uno | 完成；REVIEW F1 后 panel/group 尺寸由 metrics 驱动 DOM |
| 6.1 校正 | border 纳入高度公式 | 完成（与 6.1 同批；偏差说明见 §6） |
| 6.2 | Token 分层 | 完成；REVIEW F4 后 Compatibility 仅 semantic 映射 |
| 6.3 | 组件语义样式 | 完成 |
| 6.4 | 无障碍 | Token 级 + **F5 reduced-motion 搜索过渡** |
| 6.5 | 自动校验 | 通过；**人工矩阵 / 截图仍开放**（Finding 2） |

---

## 3. Computed geometry 对照

### 平铺

| 项 | 值 |
|---|---:|
| `flatRowHeight` | 44 |
| `estimateSize` / 搜索定位 | 同一常量 |

### 封面组公式（REVIEW F1 后仍为同一数值）

| 场景 | Phase 5 旧公式 | Phase 6（含 border） |
|---|---:|---:|
| N=1，无发行日 | 358 | **359** |
| N=1，有发行日 | 378 | **379** |
| N=10，有发行日 | 476 | **479** |

布局 CSS 变量（每侧，与 DOM 直连）：

| 变量 | 值 |
|---|---:|
| `--library-cover-panel-padding-block-side` | 10px |
| `--library-cover-panel-border-width` | 1px |
| `--library-cover-group-padding-block-side` | 28px |
| `--library-cover-group-border-width` | 1px |
| `--library-cover-track-row-height` | 40px（modern/manuscript 均 height+min-height） |

DevTools 实测行 / 组高仍待人工矩阵勾选（Finding 2 未关闭）。

---

## 4. 自动校验

| 命令 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过（REVIEW 修复后复跑） |
| `npm.cmd run lint` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 通过 |

结构检查：

- `manuscript.css`：无手稿色值字面量
- Token Compatibility 区：无 hex / rgba / primitive 运算
- panel border 使用 `--library-cover-panel-border-width`，非 hairline
- `AlbumCoverGroup` padding/border 消费 layout 变量

---

## 5. 人工门禁（Finding 2 — 未关闭）

下列项 **未** 作为「已完成」宣称；TECHDOC 状态为「人工验收待完成」：

| 项 | 状态 |
|---|---|
| baseline / final PNG（`screenshots/README.md`） | 待补拍 |
| DevTools 实测 44/40/250 与 virtual item size | 待勾选 |
| Windows 100% / 125% / 150% | 待勾选 |
| 真实大曲库滚动 / 搜索定位 / 视图切换 | 待勾选 |
| modern / manuscript × flat / cover × 全部歌曲 / 歌单 | 待勾选 |

验收完成后应：补齐截图、在本节写明日期与执行人、将 TECHDOC 状态改为「已完成」。

---

## 6. 提交偏差说明（Finding 6）

`0987749` 将「布局常量迁移」与「border +1/+3px 高度校正」合并，偏离 BASELINE「先等价再 fix」计划。

- **原因**：目标公式在 TECHDOC §4.2 已含 border；分两次实现会产生无文档中间态。
- **风险**：无法单独回退高度变化。
- **记录**：§3 表格保留 before/after；REVIEW 修复轮将 F1 事实源连接做成独立变更意图（无新的高度数值变化）。

---

## 7. 已知限制（产品边界，非未关闭门禁）

- 壳层、Teleport 浮层、歌单页仍为 modern（Phase 6 不扩展）。
- Phase 7 档案页编排不在本阶段。

---

## 8. 文件清单（含 REVIEW 修复）

| 文件 | 动作 |
|---|---|
| `constants/libraryLayoutMetrics.ts` | 每侧字段：`coverPanelPaddingBlockSide` 等 + 对应 CSS 变量 |
| `components/AlbumCoverGroup.vue` | panel 消费 `--library-cover-panel-padding-block-side` / `--library-cover-panel-border-width` |
| `uno.config.ts` | group pad/border 变量 + cover-track-row `height`+`min-height` |
| `styles/manuscript.tokens.css` | F4 分层收紧 |
| `styles/manuscript.css` | panel border 用 layout 变量；行高交给 Uno |
| `app/styles/main.css` | search-bar reduced-motion |
| `phase6/TECHDOC.md` | §4.1/§4.2/Step 6.1 与实现字段一致（F7） |
| `phase6/DELIVERY.md` | 固定提交哈希与范围（F7） |
| `phase6/*` | 基线、交付、审查、状态 |
