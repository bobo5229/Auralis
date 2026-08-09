# Phase 6 基线（Step 6.0）

**记录日期**：2026-08-09  
**起点提交**：`de8b430`（`docs：修正 Phase 5 执行日期并记录验收提交范围`）  
**分支**：`script-skin-dev`  
**工作树**：在起点提交之上实现 Phase 6；手稿 MVP Phase 1–5 已合入。

---

## 1. 作用域契约（不改）

- `useVisualStyle` + `auralis-visual-style`；仅 `route.name === 'library'` 且偏好 `manuscript` 时 `data-visual-style="manuscript"`。
- 歌单路由强制 `modern` 属性，不清除手稿偏好。
- 所有手稿选择器前缀：`.library-page[data-visual-style='manuscript']`。

---

## 2. 虚拟高度对照（代码分析 / 待 DevTools 复核）

### 2.1 平铺

| 项 | 值 |
|---|---:|
| `estimateSize` | 44 |
| `.song-row`（Uno `h-11` + border-box + border-bottom） | 目标 44px |

### 2.2 封面分组 `getAlbumGroupSize`（Phase 5 实现）

| 分量 | 代码 | DOM 实际 |
|---|---|---|
| 封面 | 250 | 250 |
| meta gap | 含于 302/322 | `mt-3` = 12 |
| meta 行 | 2 或 3 × 20 | `leading-5` = 20 |
| 曲目行 | 40 × N | `min-h-10` / 手稿 `height:40` |
| panel padding | **20** | 上下各 10px = 20 |
| panel border | **未计入** | 上下各 1px = **2** |
| group padding | 56 | `py-7` × 2 = 56 |
| group border-b | **未计入** | **1** |

### 2.3 差值结论

当**曲目列高于封面列**时，估算比实际大约少：

- panel border `2px` + group border `1px` = **`3px`**

当封面列更高时，差值为 group border **`1px`**（panel 不在 max 路径上仍可能有 1px 组底边）。

Phase 6 Step 6.1 原计划：先做数值等价迁移，再以独立 `fix` 提交纳入 panel/group border。

**实施偏差（REVIEW Finding 6）**：实际提交 `0987749` 将布局常量与 border 高度校正合并，未拆分。原因是实现时公式已按 §4.2 目标形态编写，避免中间态与文档公式不一致。风险：无法单独回退高度变化而保留常量重构。缓解：DELIVERY 记录 before/after 差值；REVIEW 修复轮将「事实源连接」与「新的高度行为」分开提交。后续 Phase 严格执行「结构等价 → 行为校正 → 视觉调整」。

---

## 3. 截图槽位

见 [`screenshots/README.md`](./screenshots/README.md)。baseline 应用 Phase 5 终态 UI 截取；final 在 Phase 6 完成后对照。

---

## 4. 行为基线（须保持）

- 点击选中、双击播放、Enter 搜索定位  
- flat/cover 切换与滚动锚点  
- 右键菜单 / 元数据编辑  
- 大列表连续滚动无跳动  
- modern 视觉与 Phase 5 一致；manuscript 仅改架构不改观感（除 §2.3 高度校正）
