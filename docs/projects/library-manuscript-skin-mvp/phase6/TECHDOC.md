# TECHDOC：手稿视觉系统固化（Phase 6）

**文档状态**：代码实现完成（含 REVIEW 修复）；用户已确认视觉与功能人工验收（2026-08-13 回填） — 见 [`DELIVERY.md`](./DELIVERY.md) / [`REVIEW.md`](./REVIEW.md)<br>
**前置版本**：手稿皮肤 MVP Phase 1–5 已实现并通过人工验收<br>
**目标路由**：`/`（`name: 'library'`）<br>
**主要模块**：`src/renderer/features/library/`<br>
**阶段定位**：内部架构收敛，不扩展皮肤覆盖范围，不进行页面重新编排

---

## 1. 目标

Phase 6 将已经通过验收的手稿皮肤整理为可继续演进的视觉系统，解决两类重复事实源：

1. 颜色、字体、边框、阴影和交互状态散落在 `manuscript.css` 的 Token 声明与消费规则中。
2. 虚拟列表敏感尺寸同时硬编码在 `LibraryPage.vue`、`uno.config.ts` 和
   `manuscript.css` 中。

完成后应形成两条清晰的数据流：

```text
libraryLayoutMetrics.ts
  ├─ LibraryPage virtualizer / scroll positioning / group estimate
  ├─ LibraryPage root CSS variables
  └─ UnoCSS shortcuts + manuscript component rules

manuscript.tokens.css
  ├─ manuscript primitive tokens
  ├─ manuscript semantic tokens
  └─ scoped --auralis-* compatibility mappings
       └─ manuscript.css component selectors
```

Phase 6 的成功标准是“设计语言和布局契约有单一事实源”，不是肉眼可见的大改版。

---

## 2. 非目标与边界

本阶段不做以下工作：

- 不改变全部歌曲页的 DOM 编排、列顺序、字段或信息密度。
- 不增加页眉、表头、页码、边注、印章或档案卡布局；这些属于 Phase 7。
- 不将手稿皮肤扩展到智能歌单、普通歌单、Sidebar、Now Playing、Playbar、
  Miniplayer、桌面歌词或全屏播放器。
- 不修改 Teleport 到 `body` 的右键菜单和元数据 Dialog；浮层适配属于后续独立阶段。
- 不增加动画、Canvas、requestAnimationFrame、封面取色或新的播放状态源。
- 不修改主进程、preload、IPC、数据库、扫描或播放队列协议。
- 不建立通用插件式皮肤框架，也不把 `VisualStyle` 合并到 light/dark `ThemeMode`。
- 不引入新的运行时依赖、测试框架或 CSS-in-JS 方案。

除第 6.2 节明确记录的虚拟高度校正外，Phase 6 应保持 Phase 5 的视觉和交互结果。

---

## 3. 当前实现基线

### 3.1 作用域与状态

- `useVisualStyle.ts` 是 `modern | manuscript` 的唯一状态源，持久化 key 为
  `auralis-visual-style`。
- `LibraryPage.vue` 仅在 `route.name === 'library'` 且偏好为 `manuscript` 时输出
  `data-visual-style="manuscript"`。
- 智能歌单和普通歌单复用 `LibraryPage.vue`，但页面根必须输出 `modern`，同时保留用户保存的
  手稿偏好。
- 所有手稿选择器均以 `.library-page[data-visual-style='manuscript']` 开头。

以上规则属于稳定契约，Phase 6 不改变。

### 3.2 重复的视觉值

`manuscript.css` 顶部已经存在第一版 feature Token，但消费规则中仍有以下直接值：

- 正文的多级 `rgba(...)` 墨色；
- 播放状态的次级暗红色；
- 搜索框表面色、边框色和焦点环；
- 纸张纹理渐变与纸页阴影；
- serif / sans-serif 字体栈；
- `1px`、`2px` 圆角、描边和焦点环宽度。

这些值需要收敛为“基础值 → 语义值 → 组件映射”，组件规则不再自行决定颜色或字体栈。

### 3.3 重复的布局值

| 布局事实             | 当前值 | 当前消费位置                                         |
| -------------------- | -----: | ---------------------------------------------------- |
| 平铺曲目行高         |   44px | `LibraryPage.vue`、`uno.config.ts`、注释与验收文档   |
| 平铺封面尺寸         |   44px | `uno.config.ts`、`manuscript.css` 约束               |
| 封面分组封面尺寸     |  250px | `uno.config.ts`、`LibraryPage.vue` 高度公式          |
| 封面曲目行高         |   40px | `LibraryPage.vue`、`uno.config.ts`、`manuscript.css` |
| 封面元数据上间距     |   12px | `uno.config.ts`、`LibraryPage.vue` 高度公式          |
| 封面元数据行高       |   20px | `uno.config.ts`、`LibraryPage.vue` 高度公式          |
| 曲目面板纵向 padding |   20px | `AlbumCoverGroup.vue`、`LibraryPage.vue`             |
| 专辑组纵向 padding   |   56px | `uno.config.ts`、`LibraryPage.vue`                   |

任一处单独修改都会造成虚拟列表空洞、重叠或搜索定位偏移。

### 3.4 已知的高度估算缺口

当前封面曲目面板有上下各 `10px` padding 和上下各 `1px` border，但
`getAlbumGroupSize()` 只计入了 `20px` padding。专辑组本身还有 `1px` 底边。

Phase 6 必须先用 DevTools 对比以下数值：

- `AlbumCoverGroup` 实际 `getBoundingClientRect().height`；
- `getAlbumGroupSize()` 返回值；
- 曲目列成为最高列时，下一虚拟项的 `start`。

若确认存在累计差值，应在独立提交中将面板纵向 border `2px` 和组底边 `1px` 纳入估算。
不得把该校正混入 Token 重命名提交。

---

## 4. 目标架构

### 4.1 布局指标单一事实源

新增：

`src/renderer/features/library/constants/libraryLayoutMetrics.ts`

导出不可变对象（与 `libraryLayoutMetrics.ts` 一致；padding/border 以**每侧/单边**存储，
高度公式内部再 `×2` 派生纵向总量）：

```ts
export const LIBRARY_LAYOUT_METRICS = {
  flatRowHeight: 44,
  flatArtworkSize: 44,
  coverArtworkSize: 250,
  coverTrackRowHeight: 40,
  coverMetaGap: 12,
  coverMetaLineHeight: 20,
  coverPanelPaddingBlockSide: 10,
  coverPanelBorderWidth: 1,
  coverGroupPaddingBlockSide: 28,
  coverGroupBorderWidth: 1,
} as const
```

该文件必须保持纯数据：不得导入 Vue、DOM、路由、播放状态或浏览器 API，以便 renderer 和构建配置
安全消费。

同文件提供两个派生出口：

1. `getAlbumGroupEstimatedHeight(trackCount, hasReleaseDate)`：集中封面列与曲目列高度公式。
2. `LIBRARY_LAYOUT_CSS_VARS`：将数值转换为带 `px` 的 CSS 自定义属性，挂载到
   `LibraryPage` 根节点。

CSS 变量（与代码一一对应；禁止再导出任何「上下合计」总量型 padding 变量，
仅允许下列每侧 / 单边宽度变量）：

```css
--library-flat-row-height
--library-flat-artwork-size
--library-cover-artwork-size
--library-cover-track-row-height
--library-cover-meta-gap
--library-cover-meta-line-height
--library-cover-panel-padding-block-side
--library-cover-panel-border-width
--library-cover-group-padding-block-side
--library-cover-group-border-width
```

`AlbumCoverGroup` 的 panel `padding` / `border-width`、Uno `album-cover-group` 的
`py` / `border-b` 宽度、以及 manuscript panel 的盒模型 border，均必须消费上表变量。
所有数值仍由 TypeScript 常量产生；CSS 变量只是传递通道，不是第二份配置。

### 4.2 高度公式

封面列高度：

```text
coverArtworkSize
+ coverMetaGap
+ coverMetaLineHeight × (有发行日期 ? 3 : 2)
```

曲目面板高度：

```text
coverTrackRowHeight × trackCount
+ coverPanelPaddingBlockSide × 2
+ coverPanelBorderWidth × 2
```

虚拟专辑组高度：

```text
max(封面列高度, 曲目面板高度)
+ coverGroupPaddingBlockSide × 2
+ coverGroupBorderWidth
```

平铺搜索定位必须使用 `flatRowHeight`，不得保留局部 `estimatedRowSize = 44`。
封面曲目行在 modern / manuscript 下均须固定 `height` 与 `min-height` 为
`--library-cover-track-row-height`（不得仅设 `min-height`）。

### 4.3 手稿 Token 分层

新增：

`src/renderer/features/library/styles/manuscript.tokens.css`

该文件仍使用相同 feature 根选择器，不允许全局 `:root`：

```css
.library-page[data-visual-style='manuscript'] {
  /* primitive */
  /* semantic */
  /* scoped --auralis-* mappings */
}
```

Token 分为三层：

| 层级                  | 责任                                   | 示例                           |
| --------------------- | -------------------------------------- | ------------------------------ |
| Primitive             | 原始纸色、墨色、暗红与字体族           | `--manuscript-color-paper-100` |
| Semantic              | 表面、正文、边框、状态、焦点、字体角色 | `--manuscript-content-primary` |
| Compatibility mapping | 让现有组件继续消费 `--auralis-*`       | `--auralis-text`               |

建议的语义分组：

- Surface：page、recessed、control、selected。
- Content：primary、muted、subtle、faint、disabled。
- Border：subtle、strong、focus。
- Accent：primary、secondary、tertiary、soft。
- Interaction：hover、pressed、selected、focus-ring。
- Typography：body-serif、ui-sans、numeric-sans。
- Shape：page、artwork、control、indicator radius；hairline width。
- Effect：paper-background、page-shadow。

现有名称的迁移关系如下：

| 当前 Token                    | Phase 6 语义 Token               |
| ----------------------------- | -------------------------------- |
| `--manuscript-paper`          | `--manuscript-surface-page`      |
| `--manuscript-paper-deep`     | `--manuscript-surface-recessed`  |
| `--manuscript-graphite`       | `--manuscript-content-primary`   |
| `--manuscript-graphite-muted` | `--manuscript-content-muted`     |
| `--manuscript-rule`           | `--manuscript-border-subtle`     |
| `--manuscript-rule-strong`    | `--manuscript-border-strong`     |
| `--manuscript-accent`         | `--manuscript-accent-primary`    |
| `--manuscript-accent-soft`    | `--manuscript-state-accent-soft` |
| `--manuscript-hover`          | `--manuscript-state-hover`       |
| `--manuscript-font-serif`     | `--manuscript-font-body`         |

不要求为了命名而保留旧 Token 别名。迁移必须在同一提交内完成，并通过全仓搜索确认旧名称无消费方。

### 4.4 消费规则

`manuscript.css` 只保留以下内容：

- feature-scoped 组件选择器；
- 布局无关的视觉属性；
- 使用语义 Token 的 hover、selected、playing、paused 和 focus-visible 状态；
- 不占据布局的伪元素。

迁移完成后，除 `manuscript.tokens.css` 外，不应出现手稿专用的 `#rrggbb`、`rgba(...)` 或完整
字体栈。`color-mix()` 可以保留，但输入颜色必须来自语义 Token。

虚拟列表敏感尺寸必须引用 `--library-*` 变量；伪元素的 `top`、`bottom`、`width` 等装饰尺寸
可以继续作为组件局部值，前提是不影响元素盒尺寸。

### 4.5 import 顺序

`LibraryPage.vue` 中保持显式顺序：

```ts
import '../styles/manuscript.tokens.css'
import '../styles/manuscript.css'
```

不要在 `main.css`、`App.vue` 或 renderer 启动入口导入手稿 Token。这样即使以后新增同名变量，作用域
和加载边界仍然清晰。

---

## 5. 分步实现计划

### Step 6.0：冻结 Phase 5 基线

#### 修改范围

- 新增 Phase 6 验收记录目录和截图说明；不改源码。

#### 实施步骤

1. 记录实现起点 commit 和工作树状态。
2. 保存以下基线截图：
   - modern / manuscript × flat / cover；
   - `< xl` / `>= xl` 各至少一张；
   - manuscript 至少包含播放行、暂停行、选中行、搜索框和切换控件。
3. 在 DevTools 记录第 3.4 节的 computed size 和 virtual item start。
4. 记录大型真实曲库快速滚动、搜索定位和视图切换的现状。

#### 验收门槛

- 基线包含足以判断 Phase 6 是否发生视觉回归的状态。
- 明确记录封面组估算是否存在 `2px` 或 `3px` 差值。

#### 建议提交

`docs：记录手稿视觉系统 Phase 6 基线`

---

### Step 6.1：集中虚拟列表布局指标

#### 修改文件

- 新增 `src/renderer/features/library/constants/libraryLayoutMetrics.ts`
- 修改 `src/renderer/features/library/pages/LibraryPage.vue`
- 修改 `uno.config.ts`
- 修改 `src/renderer/features/library/styles/manuscript.css`

#### 实施步骤

1. 建立 `LIBRARY_LAYOUT_METRICS`（每侧/单边字段，见 §4.1），先录入当前已验收数值。
2. 将 `estimateSize`、平铺搜索定位与封面高度公式迁移到常量或 `getAlbumGroupEstimatedHeight`。
3. 在 `LibraryPage` 根节点绑定 `LIBRARY_LAYOUT_CSS_VARS`；modern、manuscript 和歌单路由均绑定，
   避免 CSS shortcut 在非手稿路由失去变量。
4. 将 UnoCSS 中平铺行高、封面尺寸、元数据间距与行高、封面曲目行高（`height`+`min-height`）、
   组 `py`（`--library-cover-group-padding-block-side`）与底边宽度
   （`--library-cover-group-border-width`）改为消费 `--library-*` 变量。
5. `AlbumCoverGroup` 的 panel `padding` / `border-width` 消费
   `--library-cover-panel-padding-block-side` / `--library-cover-panel-border-width`；
   manuscript 参与盒模型的 panel border 使用同一 layout 变量，不用装饰 hairline。
6. 构建后检查 UnoCSS 是否正确生成包含 `var(--library-*)` 的规则；不得依赖未经验证的 fallback
   语法。
7. 若 Step 6.0 已确认 border 差值，在独立小提交中将 panel/group border 纳入纯高度函数
   （实施偏差见 BASELINE / DELIVERY Finding 6）。

#### 验收门槛

- `LibraryPage.vue` 不再存在虚拟列表敏感的裸 `44`、`40`、`250`、`20`、`56`。
- `uno.config.ts`、`AlbumCoverGroup.vue` 和 `manuscript.css` 不再拥有 panel/group
  padding、border 的独立数值副本。
- 仓库内不出现已废弃的「上下合计」总量字段名；metrics / CSS 变量与 §4.1 清单逐字段一致。
- 平铺行与封面曲目行 computed height 分别为 44px、40px。
- 搜索定位、flat/cover 切换锚点和快速滚动无漂移。
- 若进行了 border 校正，差异必须有 before/after 记录，且不能混入视觉 Token 提交。

#### 建议提交

`refactor：集中曲库虚拟列表布局指标`

可选校正提交：`fix：校正封面分组虚拟高度边框差值`

---

### Step 6.2：拆分并分层手稿 Token

#### 修改文件

- 新增 `src/renderer/features/library/styles/manuscript.tokens.css`
- 修改 `src/renderer/features/library/styles/manuscript.css`
- 修改 `src/renderer/features/library/pages/LibraryPage.vue`

#### 实施步骤

1. 将 `manuscript.css` 根规则中的 Token 声明移入 `manuscript.tokens.css`。
2. 按 Primitive、Semantic、Compatibility mapping 三段排列，并为每组写职责注释。
3. 为目前直接写在消费规则中的墨色层级、暗红层级、搜索表面、焦点环、纸张背景、阴影、字体栈、
   圆角和 hairline 建立语义 Token。
4. 保留现有 scoped `--auralis-*` 映射，让 `SongRow`、`AlbumCoverGroup`、
   `AlbumCoverTrackRow` 和 `VisualStyleSwitch` 无需感知手稿 Token 名称。
5. 在 `LibraryPage.vue` 中先导入 Token，再导入组件规则。
6. 全仓搜索旧 Token 名称，确认无遗漏后一次性删除旧名称。

#### 验收门槛

- Token 文件没有 `:root`、`html`、`body`、`#app` 或 shell 选择器。
- 切到歌单路由时，computed `--manuscript-*` 不应由页面根提供。
- modern 模式 computed style 与 Phase 5 基线一致。
- manuscript 模式的颜色、字体、边框、阴影和控件状态与 Phase 5 基线一致。
- 不新增对 `useTheme`、PlayerBar material 或播放状态的依赖。

#### 建议提交

`refactor：拆分手稿皮肤视觉 Token`

---

### Step 6.3：迁移组件视觉规则到语义 Token

#### 修改文件

- 修改 `src/renderer/features/library/styles/manuscript.css`
- 修改 `src/renderer/features/library/pages/LibraryPage.vue`（仅增加稳定状态 class）
- 必要时仅为稳定类名修改 Library feature 内现有组件；不得改变事件和 props 契约。

#### 实施步骤

1. 按 canvas、typography、flat list、cover list、controls、empty/loading 六个区域整理规则。
2. 将消费规则中的手稿颜色、字体栈、阴影和圆角替换为语义 Token。
3. 统一 playing / paused / selected 优先级：
   - playing 最高；
   - paused 保留当前播放身份但使用中性墨线；
   - selected 低于 playing / paused；
   - hover 不覆盖以上状态语义。
4. 将依赖 DOM utility 组合的 loading/empty 选择器替换为稳定语义类名，例如
   `.library-status-state`。只允许添加 class，不改变 DOM 分支和文案行为。
5. 保留所有 `box-sizing: border-box` 和绝对定位状态线，防止描边改变虚拟高度。
6. 保留 artwork 的 `loading="lazy"`、`decoding="async"`、错误 fallback 和全彩显示。

#### 验收门槛

- `manuscript.css` 中无手稿专用的十六进制色、`rgba(...)` 或完整字体栈。
- 不通过 `!important` 扩大影响范围；现有因 scoped 特异性必须保留的用法需有注释。
- `SongRow`、`AlbumCoverGroup` 和 `AlbumCoverTrackRow` 的 emits、props 与播放队列行为不变。
- 现代模式截图与基线无可见差异。

#### 建议提交

`refactor：统一手稿组件语义样式`

---

### Step 6.4：无障碍与字体回退核对

#### 修改范围

- 优先只调整 `manuscript.tokens.css`；除非缺少稳定状态类，否则不改组件结构。

#### 实施步骤

1. 核对正文、辅助文字、禁用文字、暗红状态文字与纸面的对比度。
2. 核对搜索框和视觉风格切换器的 `:focus-visible`，焦点指示与相邻颜色至少达到 3:1。
3. 使用中文、英文、数字、标点和缺字样本验证 GenRyuMin；缺字必须落入明确 fallback，不能出现
   tofu 方框。
4. 数字、时长、曲序号和小控件继续使用 UI sans / numeric sans Token，保证列对齐和可读性。
5. 使用 Windows 100%、125%、150% 缩放检查 1px 线条和 44px / 40px 行盒。
6. 不增加动效；现有过渡仍需遵守系统 `prefers-reduced-motion` 行为。

#### 验收门槛

- 键盘可以访问视觉风格切换和搜索输入，焦点始终可见。
- 中英混排、长标题、缺艺人/专辑和缺封面均可读。
- 字体 fallback 不改变虚拟列表盒尺寸。

#### 建议提交

`fix：完善手稿视觉系统无障碍状态`

---

### Step 6.5：回归与交付

#### 自动校验

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

#### 手工矩阵

| 维度     | 必验组合                                                   |
| -------- | ---------------------------------------------------------- |
| 视觉风格 | modern / manuscript                                        |
| 曲库视图 | flat / cover                                               |
| 路由     | 全部歌曲 / 智能歌单 / 普通歌单                             |
| 宽度     | `< xl` / `>= xl`                                           |
| 数据     | 大型曲库 / 缺封面 / 缺字段 / 长标题 / 中英混排             |
| 状态     | 默认 / hover / selected / playing / paused / focus-visible |
| 缩放     | Windows 100% / 125% / 150%                                 |

#### 结构检查

```powershell
rg -n "#[0-9a-fA-F]{3,8}|rgba?\(" src/renderer/features/library/styles/manuscript.css
rg -n ":root|(^|[, ])(html|body|#app)([ ,:{]|$)" src/renderer/features/library/styles
rg -n "estimateSize|estimatedRowSize|height: 40px|min-height: 40px" src/renderer/features/library
```

这些命令是审查辅助，不替代 typecheck、lint、build 和人工验证。对 Token 定义文件中的颜色值不执行
“零颜色字面量”要求。

#### 交付物

- 本 TECHDOC 的执行状态更新；
- Phase 6 起止提交与逐 Step 结果；
- baseline / final 截图；
- computed geometry 对照表；
- 自动校验结果；
- 已知限制和任何 border 高度校正说明。

#### 建议提交

`chore：完成手稿视觉系统 Phase 6 回归`

---

## 6. 文件级变更清单

| 文件                                                 | 动作             | 责任                                             |
| ---------------------------------------------------- | ---------------- | ------------------------------------------------ |
| `features/library/constants/libraryLayoutMetrics.ts` | 新增             | 布局数值和高度公式唯一事实源                     |
| `features/library/pages/LibraryPage.vue`             | 修改             | 消费布局常量、绑定 CSS 变量，不改行为            |
| `features/library/styles/manuscript.tokens.css`      | 新增             | scoped 手稿 primitive / semantic / mapping Token |
| `features/library/styles/manuscript.css`             | 重构             | 仅保留组件规则并消费 Token                       |
| `uno.config.ts`                                      | 修改             | 布局 shortcuts 消费 `--library-*` 变量           |
| `SongRow.vue`                                        | 原则上不改       | 保持行状态与事件契约                             |
| `AlbumCoverGroup.vue`                                | 仅必要时改 class | 保持图片加载、panel 与事件契约                   |
| `AlbumCoverTrackRow.vue`                             | 仅必要时改 class | 保持曲目字段和事件契约                           |
| `VisualStyleSwitch.vue`                              | 原则上不改       | 保持状态来源和无障碍语义                         |

路径表中省略的 renderer 文件均以 `src/renderer/` 为根。

---

## 7. 风险与解决方案

### 7.1 CSS 变量未挂载导致 modern 页面尺寸失效

**原因**：布局变量只绑定在 manuscript 分支。<br>
**解决**：`LIBRARY_LAYOUT_CSS_VARS` 无条件挂载在 `LibraryPage` 根；
`data-visual-style` 仍单独决定视觉皮肤。

### 7.2 UnoCSS 未生成自定义变量类

**原因**：shortcut 中的复杂 arbitrary value 未被正确解析。<br>
**解决**：逐项构建检查生成 CSS；如果某个 `calc()` 形式不稳定，将该条布局规则放到 Library feature
样式文件中，不复制数值常量。

### 7.3 Token 重命名造成 scoped 覆盖失效

**原因**：组件 scoped CSS 的注入顺序和选择器特异性高于 feature 规则。<br>
**解决**：保留现有 `.library-page … .album-cover-group …` 命名空间链；通过 computed style 判断最终
值，不靠增加无说明的 `!important` 修复。

### 7.4 高度校正与视觉重构混合

**原因**：border 差值和 Token 迁移同批提交后难以定位回归。<br>
**解决**：先完成等价的布局常量迁移，再以单独提交校正已测得的边框差值。

### 7.5 过早抽象为全局皮肤系统

**原因**：为了未来页面复用，将 Token 提升到 `:root` 或 `main.css`。<br>
**解决**：Phase 6 仅验证 Library feature；未来扩展到专辑或壳层时再设计跨 feature contract。

---

## 8. Definition of Done

满足以下全部条件后 Phase 6 才算完成：

- 手稿颜色、字体、边框、阴影和状态值集中在 scoped Token 文件中；
- 虚拟列表敏感尺寸由 TypeScript 常量唯一维护，并通过 CSS 变量传给样式；
- `LibraryPage` 的高度估算、搜索定位和 CSS 实际盒尺寸一致；
- modern / manuscript、flat / cover、全部歌曲 / 歌单路由均无回归；
- 手稿 Token 没有泄漏到 Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词、全屏页或
  Teleport 浮层；
- 播放、暂停、选择、搜索、右键、元数据、视图切换和持久化语义不变；
- 图片 lazy loading、async decoding 和错误 fallback 不变；
- `typecheck`、`lint`、`build`、`git diff --check` 全部通过；
- 人工矩阵通过，并记录 Phase 6 起止提交、截图、computed geometry 和已知限制。

Phase 6 完成后，Phase 7 才开始引入档案页标题、账册表头、边注与更具辨识度的页面编排。
