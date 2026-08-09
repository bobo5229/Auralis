# Phase 6 实现审查报告

**审查日期**：2026-08-09<br>
**审查范围**：`de8b430..77f1e73`<br>
**对应设计**：[`TECHDOC.md`](./TECHDOC.md)<br>
**审查结论（初审）**：需要修复后再满足 Phase 6 Definition of Done<br>
**修复状态（2026-08-09）**：Finding 1 / 3 / 4 / 5 / 6 / 7 已处理；Finding 2 人工门禁仍开放（TECHDOC 为「代码实现完成，人工验收待完成」）

---

## 1. 结论摘要

Phase 6 的主要架构方向已经落地：

- `libraryLayoutMetrics.ts` 已集中虚拟列表估算和搜索定位使用的核心数值；
- `manuscript.tokens.css` 已从组件规则中拆出；
- Token 仍限定在 Library feature 根节点；
- modern / playlist 路由没有被直接切换到 manuscript；
- `typecheck`、`lint`、`build` 均通过。

但当前仍不能把 Phase 6 判定为完全完成，原因如下：

| 级别 | 数量 | 含义 |
|---|---:|---|
| P1 | 2 | 会使 Phase 6 的核心目标或交付结论不成立，应在进入 Phase 7 前修复 |
| P2 | 3 | 当前可能不立即失败，但会留下明确的漂移或无障碍风险 |
| P3 | 1 | 不影响运行，但降低提交可回退性与审计一致性 |

---

## 2. Findings 与解决方案

### Finding 1 — P1：曲目面板几何仍有多个事实源

#### 证据

- `libraryLayoutMetrics.ts:11-19` 定义 panel padding `20`、panel border `2`、group border
  `1` 并用于虚拟高度公式。
- `libraryLayoutMetrics.ts:51` 导出了 `--library-cover-panel-padding-block`，但源码中没有任何 CSS
  消费方。
- `AlbumCoverGroup.vue:110-112` 仍直接写 `border: 1px` 和 `padding: 10px`。
- `uno.config.ts:92` 仍通过普通 `border-b` 隐式决定 group border 为 `1px`。
- manuscript panel 的 border width 来自 `--manuscript-hairline-width`，而虚拟高度公式使用独立的
  TypeScript 数字。

#### 影响

Phase 6 宣称布局指标成为单一事实源，但目前只是让 TypeScript 公式与 CSS 通过人工约定保持一致。
未来只要修改 panel padding、hairline 或 group border 中的任意一处，DOM 实际高度和 virtualizer
估算就会再次分离，重新出现空洞、重叠或搜索定位漂移。

#### 解决方案

推荐改为“每侧尺寸”而不是预先求和的总量：

```ts
coverPanelPaddingBlockSide: 10
coverPanelBorderWidth: 1
coverGroupPaddingBlockSide: 28
coverGroupBorderWidth: 1
```

然后：

1. 高度公式内部以 `× 2` 派生 panel padding 和 panel border 总量。
2. 将四个值全部输出为 `--library-*` CSS 变量。
3. `AlbumCoverGroup.vue` 的 `padding`、`border-width` 改为消费对应变量；颜色仍由
   `--auralis-track-list-border` 决定。
4. `album-cover-group` 的 padding 和 bottom border width 也消费对应变量。
5. 删除没有消费方的 `--library-cover-panel-padding-block`，避免“看似已连接”的死变量。
6. manuscript hairline 仅用于不参与虚拟高度的装饰线；参与盒模型的 border width 统一使用
   layout 变量。

#### 修复后验证

- 修改任一 `LIBRARY_LAYOUT_METRICS` 尺寸后，DOM computed style 和高度公式应同时变化。
- 曲目列主导时：`virtualItem.size === albumGroup.getBoundingClientRect().height`。
- 封面列主导时也应相等，允许的误差不超过浏览器子像素舍入误差。
- modern / manuscript、全部歌曲 / 歌单路由全部复测。

---

### Finding 2 — P1：交付文档宣告完成，但人工门禁和截图尚未完成

#### 证据

- `TECHDOC.md:3` 将状态标记为“已实现（Step 6.0–6.5）”。
- `TECHDOC.md:547` 的 Definition of Done 要求人工矩阵通过，并记录截图和 computed geometry。
- `BASELINE.md:19` 明确写着虚拟高度仅为“代码分析 / 待 DevTools 复核”。
- `screenshots/` 中只有 `README.md`，没有 baseline 或 final PNG。
- `DELIVERY.md:82-83` 明确记录 PNG、Windows 100/125/150% 缩放和真实大曲库滚动仍待人工完成。

#### 影响

自动构建只能证明代码可编译，不能证明这次全路由布局变量迁移和 `+1/+3px` 高度校正没有产生视觉
或滚动回归。目前的“已实现/完成”状态与 Phase 6 自己定义的 DoD 不一致，Phase 7 若直接建立在该
基线上，会失去可靠的视觉回归参照。

#### 解决方案

1. 在人工矩阵完成前，将 TECHDOC 状态改为“代码实现完成，人工验收待完成”。
2. 按 `screenshots/README.md` 补齐 baseline / final 的 modern、manuscript、flat、cover 对照。
3. 在 DevTools 记录至少以下 computed 值：44px 平铺行、40px 封面行、250px 封面、panel
   padding/border、group padding/border、virtual item size。
4. 在 Windows 100%、125%、150% 缩放下检查边线和行盒。
5. 使用真实大曲库验证快速滚动、搜索定位、flat/cover 切换锚点。
6. 验收完成后在 DELIVERY 中记录日期、执行人、结果及发现；再把 TECHDOC 状态恢复为“已完成”。

如果团队决定不再要求 PNG 或部分矩阵，应先修改 TECHDOC 的 DoD，并在 DELIVERY 中记录范围变更，
不能一边保留门禁一边把它列为已知限制。

#### 修复后验证

- `screenshots/` 包含 README 约定的实际图片。
- DELIVERY 不再出现“需补拍”“仍建议复核”等未关闭措辞。
- TECHDOC 状态与实际验收状态一致。

---

### Finding 3 — P2：modern 封面曲目行仍只是 `min-height`，与固定估算契约不完全一致

#### 证据

- `uno.config.ts:104` 对 `.cover-track-row` 只设置
  `min-height: var(--library-cover-track-row-height)`。
- `manuscript.css:137-138` 仅在 manuscript 下额外设置固定 `height` 与 `min-height`。
- `getAlbumGroupEstimatedHeight()` 对 modern、manuscript 和歌单路由都按每行严格 40px 计算。

#### 影响

当前内容在默认字体下大概率仍为 40px，但 modern 路由允许行盒因字体 fallback、多值艺人内容或后续
样式调整而超过 40px。一旦发生，virtualizer 仍按 40px 累加，专辑越靠后偏差越大。该风险与
Phase 6“CSS 实际盒尺寸和估算一致”的目标冲突。

#### 解决方案

当前产品设计已经把封面曲目行定义为固定 40px，因此推荐：

1. 在共享 `cover-track-row` shortcut 中同时设置 `height` 和 `min-height` 为
   `--library-cover-track-row-height`。
2. 保留标题、艺人、genre 的截断，避免内容撑高行盒。
3. manuscript 中重复的固定 height 可以删除，或保留为带注释的防御性覆盖，但不能成为唯一固定
   modern 高度的规则。

如果产品未来希望曲目行自适应多行内容，则不能继续使用固定公式，应改为 virtualizer
`measureElement` 驱动的动态测量；不要同时保留“自适应 DOM + 固定 40px 估算”。

#### 修复后验证

- modern / manuscript 下 `.cover-track-row` computed height 都严格为 40px。
- 多值艺人、缺字段、长标题和字体 fallback 不改变盒高度。

---

### Finding 4 — P2：Token 分层仍存在重复原始值和 Compatibility 绕过 Semantic

#### 证据

- `manuscript.tokens.css:32` 与 `:53` 分别直接写了相同的
  `rgba(139, 48, 47, 0.1)`。
- `--manuscript-surface-selected` 没有消费方，实际 selected 使用
  `--manuscript-state-accent-soft`。
- `manuscript.tokens.css:84` 在 Effect 层重新写 `rgba(243, 238, 223, 0.92)`，没有从 paper
  primitive 派生。
- `manuscript.tokens.css:88` 的 `--auralis-text-muted` 直接写 rgba 表达式，没有映射到一个明确的
  semantic content Token。

#### 影响

文件形式上已经分成 Primitive / Semantic / Compatibility，但同一个视觉事实仍可能要改多个位置；
Compatibility 层也仍知道 primitive 的实现细节。这不会立刻造成 UI 错误，但会削弱 Phase 6 为
Phase 7 提供稳定设计系统的价值。

#### 解决方案

1. 增加需要透明度派生的 primitive RGB 值，例如 paper/accent RGB，或者统一使用
   `color-mix()` 从 primitive 派生。
2. 只保留一个 soft accent semantic Token；`surface-selected` 若无独立语义就删除。
3. 为当前 `rgba(ink, 0.72)` 增加明确的 `--manuscript-content-secondary`，让
   `--auralis-text-muted` 只映射该 semantic Token。
4. 让 `--manuscript-effect-search-surface` 从 `--manuscript-surface-page` 派生，不重复纸色数值。
5. Compatibility 区只允许 `var(--manuscript-<semantic>)`、`transparent` 或 `none`，不直接出现
   hex / rgba / primitive RGB 运算。
6. 删除没有消费方的 Token，并用 `rg` 复核每个 semantic Token 至少有一个消费者。

#### 修复后验证

- 修改 paper/accent primitive 时，所有相关半透明状态同步变化。
- Compatibility 区不包含颜色字面量或 primitive 计算。
- 不存在仅定义、不消费的 semantic Token。

---

### Finding 5 — P2：搜索框位移动画未遵守 Phase 6 的 reduced-motion 条款

#### 证据

- `main.css:1415-1425` 的搜索框 enter/leave 同时执行 opacity 和 `translateY(-4px)` 动画。
- `main.css:1760` 的 `prefers-reduced-motion: reduce` 只关闭了 library view fade，没有覆盖
  `.search-bar-enter-active` / `.search-bar-leave-active`。
- `TECHDOC.md:421` 明确要求现有过渡遵守 `prefers-reduced-motion`。
- DELIVERY 将 Step 6.4 标记为完成，但没有对应代码或人工证据。

#### 影响

开启“减少动态效果”的用户仍会看到搜索框位移动画，Step 6.4 的无障碍验收并未真正完成。

#### 解决方案

在现有 reduced-motion media query 中增加 Library 搜索过渡：

```css
@media (prefers-reduced-motion: reduce) {
  .search-bar-enter-active,
  .search-bar-leave-active {
    transition-duration: 0ms !important;
  }

  .search-bar-enter-from,
  .search-bar-leave-to,
  .search-bar-enter-to,
  .search-bar-leave-from {
    transform: translateX(-50%);
  }
}
```

同时核对 Library 中其他包含 transform/position 的过渡。纯颜色 hover 可以保留；若希望严格执行
“全部过渡归零”，再为 `.cover-track-row` 等设置 `transition-duration: 0ms`。

#### 修复后验证

- DevTools 模拟 `prefers-reduced-motion: reduce` 后，搜索框出现和消失不发生纵向位移。
- normal 模式仍保留原来的 160ms 过渡。

---

### Finding 6 — P3：高度校正没有按基线文档约定拆成独立提交

#### 证据

- `BASELINE.md:48` 要求先完成数值等价迁移，再以独立 `fix` 提交处理 panel/group border。
- 实际提交 `0987749` 同时引入布局常量和 `+1/+3px` border 高度校正。
- DELIVERY 已注明该提交“含 border 高度校正”，但没有解释为何偏离基线计划。

#### 影响

运行结果不一定错误，但如果校正出现视觉回归，无法在保留单一事实源重构的同时单独回退高度变化；
审查者也更难区分等价迁移和行为变化。

#### 解决方案

- 不建议为了拆提交而重写已经形成交付记录的历史。
- 在 BASELINE / DELIVERY 中明确记录“实施时合并提交”的原因、风险和验证结果。
- 本轮修复 Finding 1 时，将“事实源连接”和任何新的高度行为变更分别提交。
- 后续 Phase 严格执行“结构等价迁移 → 行为校正 → 视觉调整”的提交顺序。

#### 修复后验证

- 文档不再声称 border 校正存在独立提交。
- 后续修复提交可以逐个回退，并且每个提交只有一种变更意图。

---

## 3. 已通过项

以下项目在本次审查中未发现阻断问题：

- `useVisualStyle` 仍是视觉风格唯一状态源。
- manuscript 仍通过 route name 与 visual style 双重条件生效。
- Token 文件和组件规则均保持 Library feature 命名空间，没有全局 `:root` / `body` 污染。
- `LibraryPage` 无条件向 modern、manuscript 和歌单路由提供布局 CSS 变量。
- 平铺 virtualizer 与搜索定位已经共同消费 `flatRowHeight`。
- artwork 的 lazy loading、async decoding 和错误 fallback 未被 Phase 6 修改。
- `SongRow` / `AlbumCoverGroup` / `AlbumCoverTrackRow` 的 props、emits 和播放队列语义未改。
- 本次复跑 `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 均通过。

---

## 4. 建议修复顺序

```text
Finding 1 连接完整布局事实源
  └─ Finding 3 固定 modern 封面曲目行盒
       └─ Finding 4 收紧 Token 分层
            └─ Finding 5 补 reduced-motion
                 └─ 重新执行自动门禁和人工矩阵
                      └─ Finding 2 更新完成状态与交付证据
                           └─ Finding 6 校正文档偏差说明
```

建议在 Finding 1–5 修复并完成 Finding 2 的人工门禁前，不开始 Phase 7 的页面重新编排。

---

## 5. 修复落地摘要

| Finding | 级别 | 处理 |
|---|---|---|
| 1 曲目面板多事实源 | P1 | metrics 改为每侧尺寸；AlbumCoverGroup / Uno / manuscript panel 消费 `--library-*`；panel 盒模型 border 不用 hairline |
| 2 人工门禁未完成 | P1 | TECHDOC / DELIVERY 状态改为「人工验收待完成」；§5 列出未关闭清单（不伪称 DoD 完成） |
| 3 modern 曲目行仅 min-height | P2 | Uno `cover-track-row` 同时 `height` + `min-height` |
| 4 Token 分层漂移 | P2 | accent/paper RGB 派生；删除无用 surface-selected；Compatibility 仅 semantic 映射 |
| 5 reduced-motion | P2 | `main.css` 覆盖 search-bar 过渡与 transform |
| 6 合并提交偏差 | P3 | BASELINE / DELIVERY 记录原因与风险；不重写 git 历史 |
| 7 TECHDOC/DELIVERY 滞后 | P2 | TECHDOC §4.1/4.2/6.1 改为每侧字段；DELIVERY 写死 REVIEW 提交哈希 |

---

## 6. 复查记录（2026-08-09）

### 6.1 复查结论

**代码层结论**：Finding 1、3、4、5 的修复通过复查，未发现新的运行时阻断问题。<br>
**文档层结论**：Finding 6 已记录，但新增 1 个 P2 文档一致性 Finding。<br>
**人工门禁**：Finding 2 仍开放；用户明确说明尚未执行人工验收，因此 Phase 6 仍不能标记为最终完成。

| Finding | 复查状态 | 证据 |
|---|---|---|
| 1 曲目面板多事实源 | 代码已关闭 | metrics 改为每侧值；AlbumCoverGroup / Uno / manuscript panel 直接消费对应 CSS 变量 |
| 2 人工门禁未完成 | **保持开放** | 截图目录仍只有 README；DevTools、缩放、真实曲库矩阵尚未执行 |
| 3 modern 行盒仅 min-height | 代码已关闭 | Uno 同时生成 `height` 与 `min-height` |
| 4 Token 分层漂移 | 代码已关闭 | soft accent 单点派生；Compatibility 映射到 semantic；死 Token 已删除 |
| 5 reduced-motion | 代码已关闭 | search enter/leave 在 reduce 模式下变为 0ms 且取消纵向位移 |
| 6 合并提交偏差 | 文档已关闭 | BASELINE / DELIVERY 已记录原因、风险和不重写历史的决定 |
| 7 TECHDOC/DELIVERY 滞后 | 文档已关闭 | §4.1/4.2 每侧字段与 CSS 变量已对齐实现；DELIVERY 列出固定哈希，无 `<tip>` |

### 6.2 自动复查结果

| 项目 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run lint` | 通过 |
| `npm.cmd run build` | 通过 |
| Uno 构建产物 | 已确认生成 group border width、group block padding、track height/min-height 变量规则 |

本轮没有执行或代替人工验收，也没有将截图、DevTools computed geometry、Windows 缩放或真实曲库
滚动标记为通过。

---

### Finding 7 — P2：TECHDOC 架构示例和 DELIVERY 提交范围仍停留在修复前

#### 证据

- `TECHDOC.md:132-135` 仍使用 `coverPanelPaddingBlock`、`coverPanelBorderBlock`、
  `coverGroupPaddingBlock`、`coverGroupBorderBlock` 总量字段。
- `TECHDOC.md:157-158` 仍列出旧 CSS 变量
  `--library-cover-panel-padding-block` / `--library-cover-group-padding-block`。
- 实际代码已改为 `coverPanelPaddingBlockSide`、`coverPanelBorderWidth`、
  `coverGroupPaddingBlockSide`、`coverGroupBorderWidth` 及对应 CSS 变量。
- `DELIVERY.md:22` 将 REVIEW 修复提交写成“本轮提交，见 git log”，没有列出
  `35c2fff`、`efc3ed5`、`e833628`、`385e30e`。
- `DELIVERY.md:26` 的修复后范围仍是 `de8b430..<tip>` 占位符。

#### 影响

代码的单一事实源已经修好，但作为长期契约的 TECHDOC 仍指导后续开发者使用已删除的字段和变量；
DELIVERY 也无法仅凭文档还原复查所覆盖的准确提交范围。这会让下一阶段重新引入旧命名或错误判断
验收对象。

#### 解决方案

1. 更新 TECHDOC §4.1 示例为四个“每侧/单边”字段，与当前
   `libraryLayoutMetrics.ts` 完全一致。
2. 更新 §4.1 CSS 变量清单和 §4.2 公式，明确 panel padding/border `×2`、group padding
   `×2`、group border `×1`。
3. 更新 Step 6.1 的验收措辞，删除旧总量变量名。
4. 在 DELIVERY 起止提交表中分别列出：
   - `35c2fff`：布局事实源与固定行盒；
   - `efc3ed5`：Token 分层；
   - `e833628`：reduced-motion；
   - `385e30e`：审查与人工门禁状态文档。
5. 将源码复查范围固定为 `de8b430..e833628`；文档范围列出实际提交，不保留 `<tip>`。
6. 如果后续用新提交修正文档，增加该提交的新行，不要用动态 tip 占位符。

#### 修复后验证

- TECHDOC 中搜索旧字段和旧 CSS 变量结果为零。
- TECHDOC 示例可直接与 `libraryLayoutMetrics.ts` 逐字段对应。
- DELIVERY 不包含 `<tip>`、“本轮提交”或“见 git log”等不可复现范围。

#### 落地（Finding 7）

- 已更新 `TECHDOC.md` §4.1 metrics 示例、CSS 变量清单、§4.2 公式（`×2` / 单边 border）与
  Step 6.1 验收措辞。
- 已更新 `DELIVERY.md` 起止提交表：`35c2fff` / `efc3ed5` / `e833628` / `385e30e` 分行列出；
  源码复查范围 `de8b430..e833628`；无 `<tip>`。
- F7 文档同步提交哈希在合入后写入 DELIVERY 对应行（不用动态 tip）。

---

### 6.3 当前最终判定

```text
代码 Findings 1 / 3 / 4 / 5：关闭
流程 Finding 6：关闭
文档 Finding 7：开放
人工 Finding 2：开放（等待用户执行）
```

在 Finding 7 修正后，可将状态表述为“代码与文档复查通过，人工验收待完成”；只有用户完成
Finding 2 的矩阵后，Phase 6 才能标记为最终完成。
