# TECHDOC：歌曲列表页取消整页卡片（Phase 22）

- **文档状态**：设计完成，待实施
- **设计日期**：2026-08-13
- **目标分支**：`script-skin-dev`
- **目标路由**：`library`、`playlist`、`smart-playlist`（平铺与封面）
- **视觉偏好**：沿用 `modern | manuscript` 与 `auralis-visual-style` 唯一状态源
- **前置状态**：Phase 1–17 已完全交付；Phase 18 工程完成、Electron 人工矩阵待确认
- **编号说明**：19–21 已预留给全屏播放器、Miniplayer 与桌面歌词。本阶段与它们无依赖，可在本 TECHDOC 验收后立即实施，不得占用 19–21 槽位。

## 1. 结论

Phase 17 把 Sidebar 做成桌上的卡片之后，歌曲列表页根节点仍保留 Phase 2 / 6 的整页画布外壳：12px 空隙、细线描边、近直角、页阴影，以及独立的纸面高光底。主栏因此变成与 Sidebar、Now Playing、Playbar 同类的第四张卡，桌面隐喻塌成「卡片套卡片」。

本阶段只修正这个身份错误。手稿模式下，歌曲列表页是摊开在 `.app-main` 里的那一页纸，不是再浮在窗口纸上的物件。

实施后：

- `library` / `playlist` / `smart-playlist` 在手稿下共用同一张无框平纸；
- 纸面贴齐 `.app-main` 四边，和窗口使用同一块 `--manuscript-surface-page`；
- Playbar 浮在这张连续纸上，不再压着一条卡片下沿；
- 空态、加载、错误与有列表时落在同一张纸上；
- 档案页眉整块拆除（「全部歌曲 / 私人音乐收藏总账 / 曲库主目录」、曲目总数、FOLIO）；
- 页内封面组、曲目表、搜索条、平铺账册列头仍是账册内部结构，不是整页外壳。

本阶段明确不覆盖：

- 流光（`modern`）歌曲列表；
- 专辑目录、专辑详情、归档、设置的整页卡片；
- Sidebar、Now Playing、LyricsPanel、PlayerBar、Fullscreen、Miniplayer、桌面歌词；
- 壳层网格、列宽、`--auralis-shell-edge-gap`；
- 虚拟行高、封面几何、搜索算法、播放队列、IPC 与数据库。

若实施中发现必须改上述排除表面，应暂停并重新审查范围。

## 2. 产品决策记录

以下条目来自 2026-08-13 需求澄清，实施时不得重新解释：

| 决策     | 结论                                                         |
| -------- | ------------------------------------------------------------ |
| 范围     | 歌曲列表页三种路由，平铺与封面同等处理                       |
| 皮肤     | 只改手稿                                                     |
| 拆什么   | 整页外壳整套拆掉：空隙、描边、圆角、页阴影                   |
| 纸面     | 与窗口合成同一张平纸，不再单独铺页底                         |
| 右栏     | Now Playing 仍是一张卡；歌词是其内容，不拆第二张卡           |
| 保留     | Playbar 继续浮着；页内封面组 / 曲目表外框保留                |
| 歌单     | 普通歌单与智能歌单和全部歌曲同一刀，避免切页跳回第四张卡     |
| 内边距   | 不把 12px 外距改成页面 padding 偷回来                        |
| 状态页   | 空态 / 加载 / 错误同样铺在无框纸上                           |
| 四边     | 上下左右都贴齐主栏；顶底桌面缝一起消失                       |
| 页底特效 | 去掉页根 `--manuscript-effect-paper-background`              |
| 壳层     | 不动侧栏列宽、edge-gap、右栏左边线                           |
| 档案页眉 | 歌曲列表三种路由都去掉整块 letterhead；不留空页眉条          |
| 搜索顶栏 | 去掉 48px 占位横幅与顶部分隔线；搜索改为浮在列表上，能力保留 |

## 3. 设计判断

这是已覆盖 Library 表面的保留式修正，不是新皮肤，也不是桌面重排。

- `DESIGN_VARIANCE = 2`：信息架构、列、封面组均不变；去掉整页卡片与档案 letterhead。
- `MOTION_INTENSITY = 1`：不新增动效；去掉页阴影后也不得补装饰过渡。
- `VISUAL_DENSITY = 7`：列表密度与虚拟几何保持 Phase 6 契约。

手稿桌面的正确层级是：

```text
窗口纸（desk / page）
├─ Sidebar          → 桌上的卡片
├─ .app-main        → 摊开的账册页（本阶段的主体）
│  └─ 封面组 / 曲目表 / 搜索条 → 页内结构
├─ Now Playing      → 桌上的卡片（歌词住在里面）
└─ PlayerBar        → 浮在纸上的控件卡
```

禁止把 `.library-page` 再画成与 Sidebar 同级的物件。

## 4. 当前基线

### 4.1 页根整页卡片（必须拆除）

`src/renderer/features/library/styles/manuscript.css` 的 Canvas 段当前为：

```css
.library-page[data-visual-style='manuscript'] {
  font-family: var(--manuscript-font-body);
  container-name: manuscript-library;
  container-type: inline-size;
  margin: 12px;
  height: calc(100% - 24px);
  border: var(--manuscript-hairline-width) solid var(--manuscript-border-strong);
  border-radius: var(--manuscript-radius-page);
  background: var(--manuscript-effect-paper-background);
  box-shadow: var(--manuscript-effect-page-shadow);
}
```

`LibraryPage.vue` 根节点同时带 Uno `h-full`。手稿 CSS 的 `height: calc(100% - 24px)` 覆盖它，用来补偿上下各 12px margin，避免 `.app-main` 出现双滚动。

三个 Library 路由都通过 `resolveLibraryPresentation` 输出 `data-visual-style="manuscript"`，因此这一段同时作用于全部歌曲、普通歌单和智能歌单。这正是本阶段要统一拆除的外壳。

### 4.2 已经正确的壳层与页内结构（不得误拆）

| 表面                            | 现状                                                   | 本阶段                                                                |
| ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `.app-window` / `.app-main`     | 手稿下已是 `--manuscript-surface-page`，主栏背景透明   | 不动                                                                  |
| Sidebar                         | 独立卡片：描边、圆角、列内 edge-gap                    | 不动                                                                  |
| Now Playing                     | `xl` 列内旁注栏，歌词是唯一子节点                      | 不动                                                                  |
| PlayerBar                       | 底部浮卡，列表已有 `--auralis-playbar-safe-area`       | 不动                                                                  |
| `LibraryArchiveHeader`          | 标题、副标题、成员语义、曲目数、FOLIO                  | 整块拆除，不留空条                                                    |
| `.library-search-zone`          | 手稿曾改成 48px 文档流顶栏 + 底线                      | 改回浮层：不占高度、不画顶部分隔线；`/` / 顶部悬停 / 已有查询仍可唤出 |
| `.album-cover-group` / 曲目面板 | 自有 border、padding，几何在 `libraryLayoutMetrics.ts` | 保留                                                                  |
| `LibraryStatusState`            | 作为 `.library-page` 子节点居中                        | 随页根铺开，不另套卡                                                  |
| 专辑 / 归档 / 设置页根          | 仍使用 paper-background / page-shadow / 居中限宽卡     | 故意保留                                                              |

### 4.3 Token 边界

`--manuscript-effect-paper-background` 与 `--manuscript-effect-page-shadow` 仍被专辑、归档、设置和 PlayerBar 使用。本阶段只停止歌曲列表**页根**消费它们，不得从 `manuscript.tokens.css` 删除这两个 token。

页内封面组使用 `--manuscript-radius-page` 作为小组件圆角，与整页卡片无关，必须保留。

### 4.4 已知后果（验收时视为预期）

1. 去掉左右各 12px 后，`manuscript-library` 容器约宽 24px。Compact / Standard / Spacious 断点可能在临界宽度偏移一档；不为此预先改断点数字。
2. 顶、底奶油色桌面缝消失；Playbar 改为压在连续主栏纸上。
3. 从歌曲列表切到专辑 / 归档 / 设置，那些页仍是整页卡片。这是范围，不是缺陷。
4. 侧栏 260px 列里 232px 卡片右侧的壳层缝仍在。那是 Phase 17 几何，不是本阶段外框。

## 5. 目标、非目标与稳定边界

### 5.1 目标

- 手稿歌曲列表页不再被读成桌上第四张卡。
- 三个 Library 路由、两种视图、四类页面状态（列表 / 空 / 加载 / 错误）共用同一张无框平纸。
- 页根不再设置独立 margin、border、radius、page-shadow、paper-background 与 `calc(100% - 24px)`。
- 虚拟列表仍由 `.library-list-scroll` 滚动；`.app-main` 不因页根高度补偿失败而出现双滚动。
- modern 歌曲列表、其它手稿页面和全部壳层播放表面无回归。
- 静态守卫禁止歌曲列表页根重新引入整页卡片，且不误伤其它页面的整页卡片。

### 5.2 非目标

- 不重排账册列、封面组或搜索交互。
- 不把 12px 外距改写成页面 padding / gap「看起来差不多」。
- 不改壳层 grid、Sidebar 外边距、Now Playing 左边线或 Playbar 几何。
- 不把手稿规则提升到 `html`、`body`、`#app`。
- 不删除共享 paper-background / page-shadow token。
- 不把专辑、归档、设置改成无框页。
- 不恢复内容页 `VisualStyleSwitch`。
- 不修改 main / preload / IPC / SQLite / 播放引擎。

### 5.3 必须保持的行为

- `useVisualStyle()` 仍是唯一偏好源；presentation 仍由 `resolveLibraryPresentation(route.name, visualStyle)` 决定。
- 平铺 44px、封面曲目 40px、封面 250px、曲目面板垂直 padding 合计 20px、专辑组垂直 padding 合计 56px，以及 `libraryLayoutMetrics.ts` 中的其余几何。
- 搜索仍是定位下一个匹配项，不是过滤。
- 播放、选中、右键、元数据保存优先级、generation 刷新与 artwork `loading='lazy'` / `decoding='async'` 不变。
- 视觉切换不清除选择、队列、搜索、滚动锚点或保存中的元数据。

## 6. 目标 CSS 契约

只改 `.library-page[data-visual-style='manuscript']` 页根。建议结果：

```css
.library-page[data-visual-style='manuscript'] {
  font-family: var(--manuscript-font-body);
  container-name: manuscript-library;
  container-type: inline-size;
  margin: 0;
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
```

约束：

1. `background` 必须是 `transparent` 或等价地露出窗口 `--manuscript-surface-page`。禁止页根再铺 `--manuscript-effect-paper-background`。
2. 不得保留「肉眼看不见但仍占盒模型」的 12px margin / padding 作为外壳残留。
3. 高度必须重新等于主栏 100%，使 Uno `h-full` 与手稿规则一致；删除 `calc(100% - 24px)`。
4. `container-name` / `container-type` 必须保留，封面密度查询继续以页根为容器。
5. 页内选择器（`.album-cover-group`、`.library-search-bar`、`.library-status-state` 等）不在本阶段改视觉，除非双滚动或裁切迫使最小修正。
6. 注释「Controls — 搜索框与视觉风格切换」应改为只描述搜索；切换控件已移除。

若 `height: 100%` 与 `h-full` 重复，允许只保留一处，但计算后的已用高度必须是主栏 100%，不能再减 24px。

## 7. 滚动与几何

### 7.1 滚动所有者

当前意图：`.library-list-scroll` 是列表滚动容器；页根 `flex` 列吃满主栏。拆除 margin 后：

- `.library-page` 必须 `min-h-0` 友好（现有 `flex h-full flex-col` 可保留）；
- `.library-list-scroll` 继续 `flex-1 overflow-auto` 并保留 `pb-[var(--auralis-playbar-safe-area)]`；
- `.app-main` 在歌曲列表手稿下不应出现第二根纵向滚动条。

若拆除外壳后 `.app-main` 被页根撑出滚动，只允许用页根 / 列表的 overflow 与 `min-h-0` 修正，不得用外圈 margin 把问题藏回去。

### 7.2 虚拟列表

`libraryLayoutMetrics.ts`、Uno `song-row` shortcut、封面组高度公式**本阶段不得改数字**。拆的是页壳，不是行几何。容器变宽 24px 只影响横向栅格，不改变行高估算。

禁止把 12px 页边写进 `LIBRARY_LAYOUT_METRICS`。它不是虚拟项尺寸。

### 7.3 搜索热区与绝对定位

手稿搜索区已是文档流（`position: relative; top: auto`），不依赖页卡片作为定位包含块。本阶段不改搜索定位模型。

## 8. 作用域、守卫与文档

### 8.1 选择器所有权

继续只使用：

```css
.library-page[data-visual-style='manuscript']
.library-status-state[data-visual-style='manuscript']
```

禁止：

```css
.app-main {
  /* 为本阶段改主栏通用皮肤 */
}
.app-window[data-shell-presentation='manuscript'] .library-page {
  /* 用 shell marker 驱动页面 */
}
.albums-page[data-visual-style='manuscript'] {
  /* 顺手拆专辑外框 */
}
```

### 8.2 静态守卫

更新 `scripts/check-library-visual-scope.mjs`：

1. 断言手稿 Library 页根 CSS **不再**包含 `margin: 12px`、`height: calc(100% - 24px)`、`--manuscript-effect-paper-background`、`--manuscript-effect-page-shadow`（仅针对页根规则，不能误伤封面组或其它文件）。
2. 继续禁止三个 Library 页面模板出现 `VisualStyleSwitch`。
3. 继续要求专辑、归档、设置页根保留各自现有 presentation / owner 契约；不得为了「桌面一致」删除它们的整页卡片特征。

守卫必须写「页根没有这些声明」，而不是「整个 manuscript.css 禁止 paper-background」。封面组与其它页面仍合法使用相关 token。

### 8.3 文档同步（实施后，不在本文件预填哈希）

Step 22.5 再更新：

- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`：登记 Phase 22 主题、与 19–21 的并行关系；
- 必要时 `AGENTS.md` 补一句：手稿 Library 页根是主栏纸面，不是整页卡片；
- 本目录 `DELIVERY.md`：源码范围使用明确起止哈希，不用 `HEAD`。

历史 Phase 2 / 6 / 7 文档描述当时的整页画布，不回写伪造。

## 9. 国际化、无障碍与动效

- 不新增可见文案，不改 locale key。
- 不改变键盘 `/`、roving focus、右键与 Dialog 焦点契约。
- 不新增 transition。若误伤现有 `prefers-reduced-motion` 规则，只删除已无目标的 `.visual-style-switch*` 残留，不得改写列表动效。
- 对比度继续走共享 semantic token；去掉描边、档案页眉与搜索占位顶栏后，平铺列头与封面组边框承担结构分隔。

## 10. 分步实施计划

### Step 22.0：冻结基线

**主要文件**：`docs/library-manuscript-skin-mvp/phase22/BASELINE.md`

记录分支、起始 HEAD、工作树、本 TECHDOC 路径，以及页根六件套（margin / height / border / radius / background / shadow）的现状摘录。不补造截图。

**建议提交**：`docs：冻结 Phase 22 歌曲列表页画布基线`

### Step 22.1：拆除手稿页根整页卡片

**主要文件**：`src/renderer/features/library/styles/manuscript.css`

按第 6 节改页根；保留 container 与字体；清理过时注释。不改封面组、搜索条、状态页装饰线，除非双滚动必须动 `min-h-0`。

**验收**：三个 Library 路由 × 平铺 / 封面，手稿下主栏无外描边、无圆角卡、无页阴影、无 12px 缝；modern 无变化。

**建议提交**：`fix：手稿歌曲列表页改为铺满主栏纸面`

### Step 22.2：确认滚动与状态页

**主要文件**：`LibraryPage.vue`（仅当 CSS 不足以消除双滚动时）、`LibraryStatusState` 相关手稿规则

核对：列表内部滚动、Playbar 安全区、空态 / 加载 / 错误铺在同一张纸、歌单与全部歌曲一致。

**建议提交**：仅在确实改了 Vue 时单独提交；否则并入 22.1。

### Step 22.3：静态守卫

**主要文件**：`scripts/check-library-visual-scope.mjs`

按第 8.2 节增加页根反回归断言，并跑 `npm.cmd test`。

**建议提交**：`test：禁止手稿歌曲列表页根再变回整页卡片`

### Step 22.4：工程门禁

```bash
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

不宣称 10k / 50k；不关闭 Phase 18 人工矩阵。

### Step 22.5：交付记录

编写 `DELIVERY.md`，回填明确哈希；按第 8.3 节同步 ROADMAP。状态写「工程完成；人工验收待 Electron 矩阵」，在真实窗口跑完第 11 节之前不得写完全交付。

## 11. Electron 人工矩阵

在真实窗口核验，不入库伪造 PNG：

1. 手稿 × 全部歌曲 × 平铺：无整页描边 / 圆角 / 阴影 / 外缝；无档案 letterhead / 曲目总数 / FOLIO；无 48px 搜索占位顶栏。列表顶即内容。`/` 与顶部悬停仍可唤出搜索。
2. 手稿 × 全部歌曲 × 封面：封面组与曲目表面仍是页内卡片；页根不是。
3. 手稿 × 普通歌单、智能歌单 × 两种视图：与全部歌曲同一张纸，无档案 letterhead，切页不跳回整页卡。
4. 空曲库 / 加载 / 错误：同样无框。
5. 有当前曲与无当前曲：Playbar 浮在连续纸上，列表不被挡住（安全区仍有效）。
6. `xl` 显示右栏与隐藏右栏：主栏贴齐自己的格子，不改壳层缝。
7. 流光歌曲列表：与改前一致。
8. 手稿专辑目录、专辑详情、归档、设置：整页卡片仍在。
9. Sidebar / Now Playing / 歌词 / Playbar：外框与行为不变。
10. 搜索定位、播放、右键、元数据、风格往返：状态不丢。
11. `prefers-reduced-motion` 与窗口最大化 / 还原：无双滚动、无裁切。

## 12. 完成标准

工程完成：

- 第 6 节页根契约落地；
- 第 5.3 节行为不变；
- 第 8.2 节守卫通过；
- test / typecheck / lint / build / `git diff --check` 通过。

完全交付：

- 第 11 节人工矩阵在真实 Electron 窗口关闭；
- `DELIVERY.md` 使用明确哈希，不用 `HEAD`。
