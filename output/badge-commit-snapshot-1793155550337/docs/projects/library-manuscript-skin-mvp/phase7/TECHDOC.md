# TECHDOC：深化全部歌曲页的视觉编排（Phase 7）

**文档状态**：计划稿，待实现  
**目标路由**：`/`（`name: 'library'`）  
**目标视觉风格**：`manuscript`  
**前置阶段**：Phase 1-5 已验收；Phase 6 代码实现已完成，剩余状态以 REVIEW / DELIVERY 为准，人工验收仍待完成  
**影响范围**：Renderer UI；不涉及数据库、IPC、扫描、播放内核或主进程  
**阶段定位**：允许改变手稿皮肤的视觉编排，不改变任何产品行为

---

## 1. 设计判断

Phase 7 是一次“保留行为的产品页重编排”。页面继续服务大型本地曲库，但视觉母题从
“铺在现代外壳中的暖白纸页”深化为“私人音乐收藏总账与唱片目录”。

设计参数固定为：

| 参数               | 数值 | 说明                                               |
| ------------------ | ---: | -------------------------------------------------- |
| `DESIGN_VARIANCE`  |    6 | 允许不对称的页眉、边注与目录标记，但不牺牲扫描效率 |
| `MOTION_INTENSITY` |    1 | 不新增自动动画；只保留已有视图切换和控件反馈       |
| `VISUAL_DENSITY`   |    8 | 大型曲库优先；依靠列、编号、层级和细线组织信息     |

手稿风格继续使用项目内已打包的 GenRyuMin 明体。数字、页码、曲序和控件继续使用
`Auralis Sans SC`，避免长数字列失去对齐。

Phase 7 的视觉成功标准不是“颜色更像纸”，而是：

> 即使临时关闭纸张背景、纹理和阴影，用户仍能通过档案页眉、账册列、行号、状态批注、
> 唱片目录标记和字体层级认出手稿皮肤。

---

## 2. 目标

### 2.1 页面级编排

- 增加档案册式页面标题。
- 显示曲目总数和只读 FOLIO 定位信息。
- 将搜索区从悬浮在第一行上方的视觉层，整理为手稿页内的独立检索带。
- 保持视觉风格切换入口、页面滚动区和 Playbar safe area 的既有关系。

### 2.2 平铺视图

- 增加账册式列头。
- 增加稳定的曲目序号列。
- 强化标题、艺人、专辑和时长的列关系。
- 用页边批注或印章表达播放中与已暂停状态。
- 在窄宽度下改变信息密度，但不改变 44px 行高。

### 2.3 封面视图

- 将每个专辑分组深化为“唱片目录卡”。
- 增加目录编号、曲目数量、字段表头和当前播放标记。
- 保持 250px 封面、40px 曲目行和现有虚拟高度契约。
- 通过结构、文字层级和细线形成目录卡，不依赖大圆角或背景色。

### 2.4 内容鲁棒性

- 长标题、中英混排和多值艺人保持稳定省略。
- 缺失标题、艺人、专辑、日期、曲序、流派和时长时显示明确占位。
- 缺封面时使用一致的档案占位，不新增插画或远程资源。
- 完整内容仍可通过原生 `title` 或可访问名称读取。

### 2.5 响应式密度

- 以中央纸页的实际容器宽度为依据，而不是仅依据 viewport。
- 覆盖最小窗口、`xl` 左右主列突变和宽屏三种密度。
- 列隐藏或合并只改变展示，不改变数据、排序、搜索和播放语义。

---

## 3. 非目标与边界

Phase 7 不做以下事项：

- 不新增分页请求、分页按钮或分页数据模型。
- 不修改 `library.getTracks()`、Repository、Service、IPC contract 或 preload。
- 不修改数据库排序，不在 Renderer 建立第二份曲目数组。
- 不改变搜索的前缀匹配和 Enter 跳转下一项语义。
- 不改变点击选中、双击播放、右键菜单、插播、加入歌单或元数据编辑行为。
- 不改变播放队列、随机池或当前播放 store。
- 不增加多选、列排序、筛选器或批量操作。
- 不覆盖普通歌单和智能歌单，即使它们复用 `LibraryPage.vue`。
- 不修改现代流光视觉的页面编排。
- 不修改 Teleport 到 `body` 的右键菜单和元数据 Dialog。
- 不修改 Sidebar、Now Playing、Playbar、Miniplayer 或全屏播放器。
- 不新增动态纸纹、滚动动画、Canvas、WebGL 或封面取色任务。
- 不引入新的字体、图标库、表格库或动画依赖。
- 不在本阶段补做歌曲行的完整键盘操作模型。现有行不是可聚焦控件，此限制需继续记录。

---

## 4. 前置门禁

### 4.1 Phase 6 人工验收

本文可以先完成，但 Phase 7 源码实现开始前，应关闭 Phase 6 尚未完成的人工门禁：

- modern / manuscript；
- flat / cover；
- 全部歌曲 / 智能歌单 / 普通歌单；
- DevTools 44px / 40px / 封面组 computed geometry；
- Windows 100% / 125% / 150% 缩放；
- 真实大型曲库连续滚动；
- Phase 6 截图和验收结论归档。

若 Phase 6 人工验收发现基础几何问题，应先修复并重新建立基线，再进入 Phase 7。

### 4.2 Phase 7 基线

实现前新增：

```text
docs/library-manuscript-skin-mvp/phase7/
  BASELINE.md
  DELIVERY.md
  TECHDOC.md
  screenshots/
    README.md
```

基线至少记录：

- Phase 7 起始提交；
- 900×620、1279×800、1280×800、1600×900 四个窗口尺寸；
- modern / manuscript 的 flat / cover；
- 正常、hover、selected、playing、paused；
- 长中文标题、长英文标题、中英混排、多值艺人；
- 缺标题、缺艺人、缺专辑、缺日期、缺流派、缺时长、缺封面；
- 搜索框隐藏、显示、聚焦和带查询四种状态。

---

## 5. 稳定行为契约

### 5.1 路由隔离

手稿编排只在以下条件同时成立时渲染：

```ts
route.name === 'library' && visualStyle.value === 'manuscript'
```

建议继续以 `isManuscriptLibrary` 作为唯一页面判断。新增页眉、列头、目录标记和占位文案必须
使用 `v-if="isManuscriptLibrary"`、组件 `presentation="manuscript"` 或
`.library-page[data-visual-style='manuscript']` 命名空间隔离。

普通歌单和智能歌单不得因为共享 `LibraryPage.vue`、`SongRow.vue`、`AlbumCoverGroup.vue` 而出现
行号、FOLIO、目录卡或手稿缺失值文案。

### 5.2 虚拟滚动

以下高度保持不变：

| 项目                    |    值 | 单一事实源                                   |
| ----------------------- | ----: | -------------------------------------------- |
| 平铺曲目行              |  44px | `LIBRARY_LAYOUT_METRICS.flatRowHeight`       |
| 平铺封面                |  44px | `LIBRARY_LAYOUT_METRICS.flatArtworkSize`     |
| 封面视图封面            | 250px | `LIBRARY_LAYOUT_METRICS.coverArtworkSize`    |
| 封面曲目行              |  40px | `LIBRARY_LAYOUT_METRICS.coverTrackRowHeight` |
| 封面 panel 单侧 padding |  10px | `coverPanelPaddingBlockSide`                 |
| 封面组单侧 padding      |  28px | `coverGroupPaddingBlockSide`                 |

Phase 7 新增的页眉、检索带和账册列头全部位于虚拟滚动容器外。它们会改变可视区域高度，但不
进入 virtual item 的 `estimateSize`。

目录编号、字段表头和播放印章放入现有 28px 封面组上边距或使用绝对定位，不得为每个专辑组
新增未纳入估算的流式高度。

### 5.3 搜索

- 保留 `searchQuery`、匹配字段、归一化、循环查找和 Enter 触发逻辑。
- 手稿模式仅将 `.library-search-zone` 改为页内 48px 检索带。
- `onLibraryListMouseMove()` 继续以 list shell 顶部 48px 作为触发范围。
- modern 模式继续使用现有 absolute search zone，不改变位置和动画。
- 检索带不得成为过滤器，也不得显示伪造的结果数。

### 5.4 播放与右键

以下事件和参数保持原样：

```text
SongRow
  select(trackId)
  play(trackId)
  openContextMenu(trackId, event)

AlbumCoverGroup
  select(trackId)
  play(trackId)
  openTrackContextMenu(trackId, event)
  openAlbumArtworkContextMenu(anchorTrackId, event)
```

新增视觉元素必须设置 `pointer-events: none`，或放在现有可点击根元素内部且不注册新点击行为。
不得用新按钮、链接或拖拽层覆盖歌曲行。

### 5.5 图片加载

- 保留 `loading="lazy"`。
- 保留 `decoding="async"`。
- 保留 `draggable="false"`。
- 图片错误后继续切换到本地占位。
- 不因手稿模式启动新的封面请求或颜色提取。

---

## 6. 目标编排

### 6.1 页面骨架

```text
┌──────────────────────────────────────────────────────────────┐
│ 全部歌曲                                  [流光] [手稿]      │
│ 私人音乐收藏总账        曲目 12,480       FOLIO 004 / 250    │
├─────────────────── 检索带：悬停显示搜索框 ───────────────────┤
│ 序号 │ 封面 │ 曲目             │ 艺人      │ 专辑      │ 时长 │
├──────────────────────────────────────────────────────────────┤
│ 0047 │  □   │ Track title      │ Artist    │ Album     │ 4:12 │
│ PLAY │  □   │ Current track    │ Artist    │ Album     │ 3:58 │
│ 0049 │  □   │ Track title      │ Artist    │ Album     │ 5:01 │
└──────────────────────────────────────────────────────────────┘
```

页面标题和 FOLIO 只在手稿模式出现。现代模式仍从现有歌曲列表起始位置开始渲染。

### 6.2 FOLIO 语义

FOLIO 是档案定位，不是真实分页：

```ts
export const LIBRARY_ARCHIVE_FOLIO_SIZE = 50

totalFolio = trackCount === 0 ? 0 : Math.ceil(trackCount / LIBRARY_ARCHIVE_FOLIO_SIZE)
currentFolio =
  trackCount === 0 ? 0 : Math.floor(firstVisibleTrackIndex / LIBRARY_ARCHIVE_FOLIO_SIZE) + 1
```

规则：

- 每 50 首歌曲形成一个视觉 FOLIO。
- 空曲库显示 `FOLIO 000 / 000`；loading 状态显示稳定占位，不提前宣称曲目数。
- flat 视图按首个可见歌曲 index 计算。
- cover 视图按首个可见专辑组的 `firstTrackIndex` 计算。
- FOLIO 不可点击，不改变滚动位置，不改变队列，也不写入持久化状态。
- 切换 flat / cover 后允许当前 FOLIO 随首个可见曲目变化，但既有视图切换锚点逻辑保持不变。
- 数字至少补齐 3 位；总页数超过 999 时按真实位数扩展。
- 不使用 `aria-live`，避免滚动时反复播报。

建议新建纯函数：

```text
src/renderer/features/library/constants/libraryArchivePresentation.ts
```

其中只保存 FOLIO 大小、序号格式化和边界计算，不导入 Vue、DOM、路由或播放状态。

### 6.3 平铺账册列

手稿模式的共享 grid 模板：

```text
序号 | 44px 封面 | 曲目 | 艺人 | 专辑 | 时长
```

账册列头和 `SongRow` 必须共同消费同一个 CSS 变量：

```css
--library-manuscript-flat-grid: 40px 44px minmax(0, 1.3fr) minmax(110px, 0.75fr)
  minmax(120px, 0.9fr) 56px;
```

该变量只控制横向编排，不影响 virtualizer，因此保留在 feature CSS，而不是放入 TypeScript
虚拟高度 metrics。

序号规则：

- 使用 `index + 1`，不是 track id。
- 最少 4 位，曲目总数超过 9999 时扩展位数。
- 使用 tabular numbers。
- 播放中或暂停时，序号位可切换为暗红印章，同时保留可访问的完整序号。

### 6.4 播放状态

状态层级固定为：

```text
playing / paused > selected > hover > normal
```

手稿状态表达：

| 状态     | 平铺视图                                   | 封面视图                               |
| -------- | ------------------------------------------ | -------------------------------------- |
| playing  | 左页边暗红线、暗红标题、序号位“播放”印章   | 目录标记显示“播放”、当前曲目暗红线     |
| paused   | 中性页边线、标题恢复墨色、序号位“暂停”印章 | 目录标记显示“暂停”、当前曲目中性线     |
| selected | 极淡暗红底纹                               | 保持现有封面视图语义，不新增选择 store |
| hover    | 极淡石墨底纹                               | 极淡石墨底纹                           |

要求：

- 印章使用真实 DOM 文本和 i18n，不用 CSS `content` 写死中文或英文。
- 印章无旋转动画、闪烁或呼吸效果。
- 印章和页边线绝对定位，不占 44px / 40px 行盒。
- 当前曲目根元素增加 `aria-current="true"`；状态文本不使用 live region。

### 6.5 唱片目录卡

每个 `AlbumCoverGroup` 在手稿模式增加以下非交互元素：

```text
CAT 003 / 12 TRACKS            NO. / TITLE / GENRE / TIME
┌──────────────────────┐       ┌──────────────────────────┐
│                      │       │ 01  Track title      4:12 │
│      album art       │       │ 02  Track title      3:36 │
│                      │       │ 03  Track title      5:08 │
└──────────────────────┘       └──────────────────────────┘
Album title
Artist                            2024
```

目录卡不是新增浮层卡片，而是对现有专辑组的结构化深化：

- `CAT nnn / n TRACKS` 放在封面列上方的既有 28px 上边距内。
- `NO. / TITLE / GENRE / TIME` 放在曲目 panel 上方的同一上边距内。
- 两组标记和下面内容共享列对齐。
- 专辑标题、艺人和日期继续位于封面下方。
- 缺日期时在艺人行右侧显示“日期未知”，不新增第三行。
- 包含当前曲目时，目录标记右侧显示“播放”或“暂停”印章。
- panel 继续使用现有 padding、border 和 40px 行盒。
- 专辑封面右键仍以整张专辑为作用域。

目录编号由 `virtualGroup.index + 1` 派生，不写入数据库，也不作为 Vue key。

### 6.6 缺失元数据

只在手稿 presentation 下使用以下占位：

| 字段 | zh-Hans    | zh-Hant    | en             |
| ---- | ---------- | ---------- | -------------- |
| 标题 | 未命名曲目 | 未命名曲目 | Untitled track |
| 艺人 | 未知艺人   | 未知藝人   | Unknown artist |
| 专辑 | 未知专辑   | 未知專輯   | Unknown album  |
| 日期 | 日期未知   | 日期未知   | Unknown date   |
| 流派 | 未分类     | 未分類     | Unclassified   |
| 曲序 | `--`       | `--`       | `--`           |
| 时长 | `--:--`    | `--:--`    | `--:--`        |
| 封面 | 无封面     | 無封面     | No artwork     |

占位文字使用 muted / italic 或小型档案标签，但必须满足正文对比度。不得将空字符串继续渲染成
看似损坏的列，也不得用假数据代替缺失值。

建议新建：

```text
src/renderer/features/library/utils/formatMetadataDisplay.ts
```

该 helper 只负责 trim 后判空并返回 `{ text, missing }`。fallback 文案由组件通过 i18n 传入，
避免纯 helper 依赖全局 locale。

### 6.7 长文本与中英混排

- 标题、艺人、专辑和流派保留单行省略。
- 每个 grid item 必须具备 `min-width: 0`。
- 完整值放入原生 `title`，缺失值的 title 使用本地化 fallback。
- 取消封面视图流派列当前的 `direction: rtl` 技巧，避免中英和双向文本顺序异常。
- compact 模式下，专辑作为曲目标题下的第二行显示，仍在 44px 行盒内。
- compact 封面曲目行将流派合并到标题下的次要信息行，仍在 40px 行盒内。
- 数字列使用 tabular numbers；正文不通过缩小到 10px 以下来容纳长文本。
- 不允许长字符串撑宽 grid 或引起横向滚动。

### 6.8 缺封面

建议新增 feature-scoped `LibraryArtworkPlaceholder.vue`，支持 `row` / `catalog` 两种尺寸：

- 继续使用项目现有图标类，不手绘 SVG。
- row 尺寸仅显示图标与低对比斜线底纹。
- catalog 尺寸显示图标和本地化“无封面”。
- 斜线使用静态 CSS gradient，无动画、滤镜或远程图片。
- 图标 `aria-hidden="true"`；占位根节点提供可访问名称。
- 图片本身使用空 alt，避免与相邻标题重复播报。

---

## 7. 响应式密度契约

### 7.1 使用容器查询

在手稿页面根节点设置：

```css
container-name: manuscript-library;
container-type: inline-size;
```

断点以纸页宽度为准：

| 密度     |       容器宽度 | 典型场景                                           |
| -------- | -------------: | -------------------------------------------------- |
| compact  |     `<= 760px` | 900px 最小窗口；1280px 出现 Now Playing 后主列突降 |
| standard | `761px-1099px` | 1279px 两列壳；常见中等窗口                        |
| spacious |    `>= 1100px` | 1600px 以上宽屏主内容                              |

必须重点验收 1279px 与 1280px，因为应用壳在 `xl` 断点加入 20% Now Playing 列，中央主内容
会突然变窄。

### 7.2 flat 密度

#### compact

- 保留序号、封面、曲目、艺人、时长。
- 隐藏独立专辑列。
- 将专辑放入曲目单元格第二行。
- 标题 / 专辑两行总高度不得超过 32px。
- 缩小横向 gap 和 inline padding，不改变 44px 行高或 44px 封面。

#### standard

- 显示全部六列。
- 艺人和专辑使用弹性最小宽度，不恢复 300px 固定艺人列。
- 序号、封面和时长保持固定宽度。

#### spacious

- 显示全部六列。
- 扩大曲目、艺人和专辑的最小宽度。
- 允许页眉和 FOLIO 形成更明确的左右分栏。
- 不增加新字段，不把页面变成统计面板。

### 7.3 cover 密度

#### compact

- 封面仍为 250px。
- 专辑列与曲目 panel 间距从 48px 收紧到约 20px。
- panel 内隐藏独立流派列，将流派并入标题下第二行。
- 目录字段头同步隐藏 GENRE 列。
- 不堆叠为单列，避免改变专辑组虚拟高度模型。

#### standard

- 两列布局保持。
- 间距约 32px。
- 展示 NO. / TITLE / GENRE / TIME。

#### spacious

- 间距恢复 48px。
- 流派列允许更宽，但不得挤压标题列。
- 目录标记与 panel 对齐，不扩大封面尺寸。

### 7.4 响应式不变量

- 不根据宽度修改 44px / 40px 行高。
- 不根据宽度修改 250px 封面尺寸。
- 不在 JavaScript 维护第二套 breakpoint 状态。
- 不因列隐藏而删除字段数据或改变搜索字段。
- 不使用 viewport `@media` 代替纸页容器查询。
- 不产生横向滚动条。

---

## 8. Token 与 CSS 规则

### 8.1 新增语义 Token

在 `manuscript.tokens.css` 增加少量语义层，不在组件规则中写颜色字面量：

```css
--manuscript-border-ledger;
--manuscript-border-ledger-strong;
--manuscript-content-ledger-label;
--manuscript-surface-stamp;
--manuscript-content-stamp;
--manuscript-state-missing;
```

这些 Token 必须由现有 paper / ink / accent primitives 派生。不得新增第二个强调色。

### 8.2 布局变量

不影响 virtualizer 的横向值保留在 `manuscript.css`：

```css
--library-manuscript-flat-grid;
--library-manuscript-cover-track-grid;
--library-manuscript-row-gap;
--library-manuscript-page-inline-padding;
```

影响 virtualizer 的纵向值仍只能来自 `libraryLayoutMetrics.ts` 和其导出的 `--library-*` 变量。

### 8.3 选择器边界

新增规则必须以以下选择器开始：

```css
.library-page[data-visual-style='manuscript']
```

不得新增裸 `.song-row`、裸 `.album-cover-group` 或 body 级手稿覆盖。除现有 scoped 特异性确实无法
覆盖的状态外，不新增 `!important`。若必须新增，应在旁边写明被覆盖的具体规则来源。

### 8.4 形状与动效

- 纸页、封面、控件和 panel 继续使用 Phase 6 的近直角 radius 系统。
- 不新增胶囊标签。播放印章为小型方形或窄矩形档案章。
- 不新增 marquee、滚动视差、循环动画或状态闪烁。
- 已有视图 fade 继续遵守 `prefers-reduced-motion`。
- 搜索框进出继续使用现有 Transition；reduce 模式保持 0ms。

---

## 9. 组件与数据设计

### 9.1 新组件

#### `LibraryArchiveHeader.vue`

建议 props：

```ts
defineProps<{
  trackCount: number
  currentFolio: number
  totalFolios: number
  isLoading: boolean
}>()
```

职责：

- 渲染唯一页面 `h1`；
- 渲染曲目总数和 FOLIO；
- 格式化本地化数字；
- 不读取 route、scrollRef 或播放 store；
- 不实现分页点击。

#### `LibraryLedgerHeader.vue`

职责：

- 使用与手稿 `SongRow` 相同的 grid template；
- 渲染序号、封面、曲目、艺人、专辑、时长列头；
- compact 模式同步隐藏专辑列；
- 不伪装成可排序按钮；
- 不添加无效 `aria-sort`。

#### `LibraryArtworkPlaceholder.vue`

职责：

- 统一 row / catalog 缺封面表现；
- 不读取 artwork URL；
- 不发事件；
- 不新增外部资源。

### 9.2 现有组件的 presentation 参数

建议给共享行组件增加显式 presentation：

```ts
type LibraryPresentation = 'modern' | 'manuscript'
```

使用位置：

- `SongRow.vue`
- `AlbumCoverGroup.vue`
- `AlbumCoverTrackRow.vue`

默认值必须是 `modern`。只有 `LibraryPage` 在 `isManuscriptLibrary` 为真时传入 `manuscript`。
这样缺失值、行号和目录标记不会泄漏到 modern 或歌单路由。

### 9.3 `LibraryPage.vue` 新增派生值

建议新增：

```text
archiveTrackCount
archiveCurrentFolio
archiveTotalFolios
firstVisibleTrackIndex
```

`archiveCurrentFolio` 只在手稿全部歌曲页更新。scroll handler 使用 passive 模式，只在 FOLIO
实际变化时写 reactive state，避免每个滚动事件触发无意义更新。

flat 的首个可见 index 可由 `scrollTop`、`LIBRARY_TOP_INSET` 和 44px 行高 O(1) 计算。
cover 通过 virtual items 的 `start/end` 找到首个可见 group，再读取 `firstTrackIndex`；只扫描当前
virtual items，不扫描全部专辑组。

### 9.4 DOM 顺序

目标顺序：

```vue
<section class="library-page">
  <VisualStyleSwitch />
  <LibraryArchiveHeader v-if="isManuscriptLibrary" />

  <div v-if="isLoading" class="library-status-state">...</div>

  <div v-else-if="tracks.length > 0" class="library-list-shell">
    <div class="library-search-zone">...</div>
    <LibraryLedgerHeader v-if="isManuscriptLibrary && !isCoverView" />
    <div ref="scrollRef" class="library-list-scroll">...</div>
  </div>

  <div v-else class="library-status-state">...</div>
</section>
```

仅手稿模式让 search zone 参与 flex 流；modern 仍为 absolute。列头位于 scroll container 外，
不会进入虚拟高度。

---

## 10. 分步实现计划

### Step 7.0：关闭前置门禁并冻结基线

#### 修改范围

- 完成 Phase 6 人工验收记录。
- 新增 Phase 7 `BASELINE.md`、`DELIVERY.md` 和 screenshots README。
- 不改源码。

#### 实施步骤

1. 完成 Phase 6 尚未执行的人工矩阵。
2. 记录 Phase 7 起始提交。
3. 按 §4.2 截取基线。
4. 记录真实曲库规模、Windows 缩放、窗口尺寸和测试 locale。
5. 明确当前已知问题，不把它们混入 Phase 7 视觉修改。

#### 验收门槛

- Phase 6 人工门禁关闭。
- Phase 7 基线可以判断 modern、歌单路由和虚拟滚动是否回归。

#### 建议提交

`docs：记录手稿编排 Phase 7 基线`

---

### Step 7.1：建立展示契约与本地化文案

#### 修改文件

- 新增 `constants/libraryArchivePresentation.ts`
- 新增 `utils/formatMetadataDisplay.ts`
- 修改 `locales/zh-Hans.json`
- 修改 `locales/zh-Hant.json`
- 修改 `locales/en.json`
- 必要时新增 feature-scoped `types/libraryPresentation.ts`

#### 实施步骤

1. 定义 `LIBRARY_ARCHIVE_FOLIO_SIZE = 50`。
2. 实现 FOLIO、曲目序号和目录序号格式化纯函数。
3. 实现 trim 后判空的 metadata display helper。
4. 增加页眉、列头、目录、播放状态和缺失元数据的三语言文案。
5. 对格式化函数做边界自检：0、1、49、50、51、9999、10000 首。
6. 禁止把路由、DOM 或播放状态导入纯 helper。

建议 key 契约：

```text
library.manuscript.header.title
library.manuscript.header.subtitle
library.manuscript.header.trackCount
library.manuscript.header.folio
library.manuscript.ledger.index
library.manuscript.ledger.artwork
library.manuscript.ledger.title
library.manuscript.ledger.artist
library.manuscript.ledger.album
library.manuscript.ledger.duration
library.manuscript.catalog.number
library.manuscript.catalog.trackCount
library.manuscript.catalog.genre
library.manuscript.status.playing
library.manuscript.status.paused
library.manuscript.missing.title
library.manuscript.missing.artist
library.manuscript.missing.album
library.manuscript.missing.date
library.manuscript.missing.genre
library.manuscript.missing.artwork
```

#### 验收门槛

- 三个 locale JSON 均可解析。
- 序号会随总数扩展位数，不截断 10000+ 曲库。
- FOLIO 仅为派生显示，不创建新状态持久化。
- helper 不改变原始 metadata。

#### 建议提交

`feat：建立手稿档案编排展示契约`

---

### Step 7.2：实现档案页眉、曲目总数与 FOLIO

#### 修改文件

- 新增 `components/LibraryArchiveHeader.vue`
- 修改 `pages/LibraryPage.vue`
- 修改 `styles/manuscript.tokens.css`
- 修改 `styles/manuscript.css`

#### 实施步骤

1. 在 `VisualStyleSwitch` 后插入 manuscript-only 页眉。
2. 页眉渲染 `h1`、总曲目数、当前 FOLIO 和总 FOLIO。
3. loading 时总数显示稳定占位，不伪造为 0。
4. 通过现有 scrollRef 计算首个可见曲目 index。
5. flat 使用 O(1) 几何计算；cover 只检查当前 virtual items。
6. scroll handler 使用 passive，且只有 FOLIO 变化时才更新 ref。
7. 路由、视图模式、曲目数组变化后重算并 clamp。
8. 手稿 search zone 改为 48px flex 检索带；modern 保持 absolute。
9. 页眉为右上角视觉风格开关预留空间，最小窗口不得重叠。

#### 验收门槛

- 页眉只在 `/ + manuscript` 出现。
- modern、普通歌单和智能歌单 DOM 无档案页眉。
- FOLIO 在第 1、50、51、100、101 首边界正确。
- flat / cover 切换后 FOLIO 与首个可见曲目一致。
- FOLIO 不改变 scrollTop、搜索、队列或视图持久化。
- 搜索仍在顶部 48px 范围出现，Enter 行为不变。

#### 建议提交

`feat：新增全部歌曲档案页眉与 FOLIO 定位`

---

### Step 7.3：实现平铺账册结构

#### 修改文件

- 新增 `components/LibraryLedgerHeader.vue`
- 修改 `components/SongRow.vue`
- 修改 `pages/LibraryPage.vue`
- 修改 `styles/manuscript.tokens.css`
- 修改 `styles/manuscript.css`

#### 实施步骤

1. 在 flat scroll container 上方插入 manuscript-only 列头。
2. 给 `SongRow` 增加默认 modern 的 presentation prop。
3. manuscript 行增加序号单元格，modern 不渲染或隐藏该单元格。
4. 列头和歌曲行共同消费 `--library-manuscript-flat-grid`。
5. 将标题内部整理为主标题与 compact 专辑次行，modern 维持单行视觉。
6. 增加 playing / paused 印章 DOM 和 `aria-current`。
7. 保留根节点 click、dblclick、contextmenu 和 emit 参数。
8. 保留图片 lazy / async / draggable 行为。
9. 检查 playing、paused、selected、hover 的层级。

#### 验收门槛

- DevTools 实测每个 `SongRow` 仍为 44px。
- 列头和行在三个密度下逐列对齐。
- 10000+ 首时序号不挤压标题。
- 印章不遮挡封面、标题或点击区域。
- 搜索定位、双击播放和右键菜单行为不变。
- modern 截图与 Phase 7 基线一致。

#### 建议提交

`feat：将手稿平铺列表深化为曲目账册`

---

### Step 7.4：实现唱片目录卡

#### 修改文件

- 修改 `components/AlbumCoverGroup.vue`
- 修改 `components/AlbumCoverTrackRow.vue`
- 修改 `pages/LibraryPage.vue`
- 修改 `styles/manuscript.tokens.css`
- 修改 `styles/manuscript.css`

#### 实施步骤

1. 给 group / track row 增加默认 modern 的 presentation prop。
2. 从 `LibraryPage` 传入目录序号和 `isPlaying`。
3. 在 28px group 上边距内增加目录标记和 track field header。
4. 目录标记显示目录号、曲目数和组级 playing / paused 印章。
5. track field header 与 40px 曲目行消费同一个 grid template。
6. 专辑标题使用明确标题层级；艺人、日期和曲目数保持紧凑。
7. 当前曲目继续使用绝对定位线和暗红文字，不新增高度。
8. 保留封面右键整专辑作用域和曲目行事件。
9. 目录序号不替代现有 group key。

#### 验收门槛

- `getAlbumGroupEstimatedHeight()` 无需因目录标记增加新常量。
- DevTools 实测曲目行仍为 40px。
- 少曲目和多曲目专辑均无 header 重叠。
- 封面组连续滚动无空洞、重叠或跳动。
- 视图切换锚点保持。
- modern 和歌单 cover 视图无目录标记。

#### 建议提交

`feat：将手稿封面视图深化为唱片目录卡`

---

### Step 7.5：补齐长文本、缺失元数据与缺封面

#### 修改文件

- 新增 `components/LibraryArtworkPlaceholder.vue`
- 修改 `components/SongRow.vue`
- 修改 `components/AlbumCoverGroup.vue`
- 修改 `components/AlbumCoverTrackRow.vue`
- 修改 `styles/manuscript.css`

#### 实施步骤

1. 只在 manuscript presentation 下应用本地化 fallback。
2. 为标题、艺人、专辑和流派增加完整 `title`。
3. 删除流派列的 `direction: rtl`，使用标准末尾省略。
4. 为所有文本 grid item 补齐 `min-width: 0`。
5. 数字空值显示 `--` / `--:--`。
6. 统一 row / catalog 缺封面占位。
7. 图片加载失败后仍使用相同占位。
8. 缺失值使用 muted 状态，不与 disabled 混淆。
9. 检查简体、繁体、英文、数字、多值艺人和超长无空格字符串。

#### 验收门槛

- 不再出现空白标题或空白艺人列。
- 超长文本不撑宽页面、不改变行高、不出现横向滚动。
- 原生 tooltip 能读取完整值。
- 缺封面不触发额外网络、Canvas 或 worker 工作。
- modern 缺失值显示仍与基线一致。

#### 建议提交

`fix：完善手稿曲库长文本与缺失元数据展示`

---

### Step 7.6：落实三档响应式密度

#### 修改文件

- 修改 `styles/manuscript.css`
- 必要时修改 `LibraryLedgerHeader.vue` 和三个行组件的结构类名

#### 实施步骤

1. 在 manuscript 根建立 named container。
2. 定义 compact / standard / spacious 的 flat grid 变量。
3. compact 隐藏独立专辑列，并显示标题下专辑次行。
4. 定义三档 cover gap 和 track grid。
5. compact 隐藏独立 GENRE 列，将流派并入次要信息行。
6. 页眉在 compact 保持标题、曲目数、FOLIO 和视觉开关不重叠。
7. 不在 JS 增加 width listener 或 breakpoint ref。
8. 不改变虚拟高度 metrics。

#### 验收门槛

- 900×620 无横向滚动、重叠或文字小于 10px。
- 1279×800 使用 standard，1280×800 能平稳退化到 compact。
- 1600×900 使用 spacious，列宽增加但没有无意义空卡。
- 调整窗口宽度时 virtual rows 不跳动、不重排数据。
- 页面在三档密度下都能通过“关闭背景辨识”测试。

#### 建议提交

`feat：完善手稿曲库三档响应式编排`

---

### Step 7.7：回归、性能与交付

#### 自动校验

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

#### 结构检查

```powershell
rg -n "library-page\[data-visual-style='manuscript'\]" src/renderer/features/library/styles
rg -n "LIBRARY_LAYOUT_METRICS|--library-cover|--library-flat" src/renderer/features/library uno.config.ts
rg -n "@media.*manuscript|window.addEventListener\('scroll'" src/renderer/features/library
```

检查目标：

- 新样式全部有 manuscript 命名空间。
- 没有复制 44 / 40 / 250 / 10 / 28 等虚拟敏感值。
- 手稿响应式使用 container query，不是 viewport media query。
- 没有新增 window scroll listener。

#### 人工矩阵

| 维度   | 组合                                                           |
| ------ | -------------------------------------------------------------- |
| 视觉   | modern / manuscript                                            |
| 视图   | flat / cover                                                   |
| 路由   | 全部歌曲 / 智能歌单 / 普通歌单                                 |
| 窗口   | 900×620 / 1279×800 / 1280×800 / 1600×900                       |
| 缩放   | Windows 100% / 125% / 150%                                     |
| locale | zh-Hans / zh-Hant / en                                         |
| 状态   | normal / hover / selected / playing / paused                   |
| 内容   | 短文本 / 长中文 / 长英文 / 中英混排 / 多值艺人 / 缺失 metadata |
| 封面   | 正常 / 缺失 / 加载失败                                         |
| 搜索   | 隐藏 / 显示 / focus / 有 query / Enter 连续定位                |
| 数据量 | 小曲库 / 真实大型曲库                                          |

#### 必测行为

1. 单击选中。
2. 双击播放。
3. 右键单曲菜单。
4. 右键专辑封面菜单。
5. 插播单曲和整张专辑。
6. 加入现有歌单和新建歌单。
7. 编辑元数据。
8. 刷新扫描。
9. flat / cover 切换和锚点恢复。
10. 搜索 Enter 循环定位。
11. 播放队列使用完整 `tracks`。
12. 切换 visual style 后 modern 无残留页眉、列头或占位。

#### 性能门槛

- 平铺视图仍只渲染 virtual rows 加 overscan。
- 封面视图仍只渲染 virtual groups 加 overscan。
- FOLIO 计算 flat 为 O(1)，cover 为 O(当前 virtual items)。
- 不为每次 scroll map 全部 tracks 或全部 albumGroups。
- 不增加持续动画、图像分析或背景任务。
- 5000+ 曲目连续滚动无明显掉帧、空洞或页面号抖动。

#### 关闭背景辨识测试

在 DevTools 临时关闭以下效果：

```text
--manuscript-effect-paper-background
--manuscript-effect-page-shadow
页面 background image / gradient
```

通过条件：

- flat 仍可由档案页眉、FOLIO、列头、行号和状态印章识别。
- cover 仍可由 CAT 编号、字段头、目录关系和状态印章识别。
- modern 与 manuscript 不会只剩“深色和浅色”的区别。

#### 交付物

- `DELIVERY.md` 记录每个 Step 的固定提交哈希；
- screenshots 记录四个窗口宽度的 flat / cover；
- 记录自动校验输出；
- 记录人工矩阵、真实曲库规模和 Windows 缩放；
- 记录未解决限制，不把未执行项目标记为通过。

#### 建议提交

`chore：完成手稿编排 Phase 7 回归`

---

## 11. 文件级变更清单

### 11.1 新增

```text
src/renderer/features/library/components/LibraryArchiveHeader.vue
src/renderer/features/library/components/LibraryLedgerHeader.vue
src/renderer/features/library/components/LibraryArtworkPlaceholder.vue
src/renderer/features/library/constants/libraryArchivePresentation.ts
src/renderer/features/library/utils/formatMetadataDisplay.ts
docs/library-manuscript-skin-mvp/phase7/BASELINE.md
docs/library-manuscript-skin-mvp/phase7/DELIVERY.md
docs/library-manuscript-skin-mvp/phase7/screenshots/README.md
```

`types/libraryPresentation.ts` 仅在三个以上组件需要共享 union 时新增；否则避免为一个字符串 union
制造过度抽象。

### 11.2 修改

```text
src/renderer/features/library/pages/LibraryPage.vue
src/renderer/features/library/components/SongRow.vue
src/renderer/features/library/components/AlbumCoverGroup.vue
src/renderer/features/library/components/AlbumCoverTrackRow.vue
src/renderer/features/library/styles/manuscript.tokens.css
src/renderer/features/library/styles/manuscript.css
src/renderer/locales/zh-Hans.json
src/renderer/locales/zh-Hant.json
src/renderer/locales/en.json
```

### 11.3 原则上不修改

```text
uno.config.ts
src/renderer/app/styles/main.css
src/renderer/app/layout/PlayerBar.vue
src/renderer/features/playback/**
src/main/**
src/preload/**
src/shared/ipc/**
```

若实现必须修改 `uno.config.ts` 或 `main.css`，应先证明 feature CSS 无法表达该规则，并在 DELIVERY
记录全局回归范围。

---

## 12. 风险与解决方案

### 12.1 页眉挤压滚动区

**风险**：页眉、检索带和列头减少可视行数，最小高度窗口可能显得拥挤。  
**解决**：页眉控制在约 72px；检索带 48px；列头约 28px；三者位于虚拟容器外，不修改 item
高度。900×620 必须能看到有效歌曲内容，不允许页眉继续增长。

### 12.2 1279 / 1280 宽度突变

**风险**：Now Playing 在 `xl` 出现后中央列骤窄，viewport media query 无法准确表达纸页宽度。  
**解决**：使用 named container query，并将 1280×800 列为强制验收点。

### 12.3 新列导致 modern 错位

**风险**：`SongRow` 新增序号节点后，modern 的五列 grid 发生 item 位移。  
**解决**：序号和 compact 次行只在 manuscript presentation 渲染或 display；默认 presentation 为
modern；modern 基线逐像素复查。

### 12.4 目录字段头改变组高

**风险**：在 panel 内增加流式 header，会让估算少 20-32px并引起重叠。  
**解决**：字段头必须占用现有 group top padding 或绝对定位；不得进入 panel 流。若最终设计必须
进入流，先更新 `libraryLayoutMetrics.ts`、CSS 变量和高度公式，并作为独立提交处理。

### 12.5 FOLIO 抖动或性能回退

**风险**：scroll 期间反复写 reactive state，或为 cover 每次扫描全部 groups。  
**解决**：flat O(1)，cover 只查当前 virtual items；只有页码跨 50 首边界时才写 ref；无
`window.addEventListener('scroll')`。

### 12.6 缺失值泄漏到 modern / 歌单

**风险**：共享组件直接应用 fallback，导致 Phase 7 范围扩大。  
**解决**：fallback 受显式 presentation 控制；默认 modern；歌单路由测试空 metadata。

### 12.7 compact 隐藏专辑或流派造成误解

**风险**：用户以为字段数据消失。  
**解决**：专辑进入标题第二行，流派进入 cover track 次要行；数据仍参与搜索和 metadata 编辑；
不从 DOM 同时删除两处展示。

### 12.8 长文本破坏固定行高

**风险**：衬线字体、无空格英文或多值艺人使 44px / 40px 行盒溢出。  
**解决**：固定 line-height、`min-width: 0`、单行 ellipsis、compact 两行总高度上限；DevTools
实测盒模型。

### 12.9 状态印章遮挡交互

**风险**：印章位于 row 上层，截获单击或右键。  
**解决**：印章 `pointer-events: none`；不新增交互 role；事件仍绑定原 row 根节点。

### 12.10 Phase 6 未验收就继续叠加

**风险**：基础几何问题在 Phase 7 被新编排掩盖，难以定位责任阶段。  
**解决**：Step 7.0 是源码实施硬门禁。Phase 6 人工矩阵未关闭时，只允许完善文档和设计，不开始
Phase 7 代码提交。

---

## 13. 回退策略

每一步都应可独立回退：

| Step | 回退结果                                              |
| ---- | ----------------------------------------------------- |
| 7.1  | 删除纯展示 helper 和 locale key，无视觉变化           |
| 7.2  | 移除页眉与 FOLIO，恢复 Phase 6 页面起始结构           |
| 7.3  | 移除列头、序号和印章，恢复 Phase 6 平铺列表           |
| 7.4  | 移除目录标记和字段头，恢复 Phase 6 封面组             |
| 7.5  | 移除 manuscript fallback 与统一占位，恢复原始空值表现 |
| 7.6  | 移除 container query，恢复单一布局                    |

回退不得删除 Phase 6 的 token 分层、虚拟布局单一事实源或 reduced-motion 修复。

---

## 14. Definition of Done

满足以下全部条件后，Phase 7 才能标记为完成：

- Phase 6 人工验收已关闭并归档。
- 档案页眉、总曲目数和 FOLIO 只在全部歌曲手稿页出现。
- FOLIO 是只读派生定位，不引入真实分页或持久化状态。
- flat 具备列头、行号和 playing / paused 页边状态表达。
- cover 具备目录编号、曲目数、字段头和组级播放印章。
- 长标题、中英混排、多值艺人和全部缺失 metadata 场景可读。
- 缺封面有统一 row / catalog 表现，图片 lazy / async 不回归。
- compact / standard / spacious 三档在指定窗口宽度通过。
- 44px / 40px / 250px 和封面组高度公式无漂移。
- 虚拟滚动、搜索定位、队列、右键、视图切换和锚点恢复无回归。
- modern、普通歌单、智能歌单无 Phase 7 DOM 或样式泄漏。
- typecheck、lint、build、diff-check 全部通过。
- 真实大型曲库和 Windows 缩放人工矩阵通过。
- 关闭背景、纹理和阴影后，手稿皮肤仍可从编排与状态表达识别。
- DELIVERY 记录固定提交、截图、人工结果和已知限制。

Phase 7 完成后，下一阶段可再评估手稿皮肤是否扩展到歌单、专辑页或 Teleport 浮层；这些范围不
在本文中预承诺。
