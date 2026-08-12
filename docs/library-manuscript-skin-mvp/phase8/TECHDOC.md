# TECHDOC：全部歌曲页交互视觉闭环与可访问性（Phase 8）

**文档状态**：待实施  
**编写日期**：2026-08-12  
**前置阶段**：Phase 7 代码已实现；进入源码实施前必须关闭 Phase 7 人工验收门禁  
**目标路由**：`/`（`name: 'library'`）  
**主要范围**：全部歌曲页拥有的右键菜单、元数据编辑弹窗、搜索状态、页面状态与键盘操作  
**影响范围**：Renderer UI；不修改数据库、Repository、Service、IPC contract、preload 或播放内核  
**视觉参数**：`DESIGN_VARIANCE: 6`、`MOTION_INTENSITY: 2`、`VISUAL_DENSITY: 8`

---

## 1. 背景

Phase 7 已让全部歌曲页在关闭背景颜色、纸纹和阴影后，仍可从页眉、账册列、目录卡、字体与播放
状态表达中识别为手稿皮肤。当前剩余的主要断层不在静态编排，而在用户开始操作之后：

- 曲目与专辑封面的右键菜单 Teleport 到 `body`，仍显示现代玻璃材质。
- 元数据编辑弹窗 Teleport 到 `body`，没有手稿视觉，也缺少完整对话框语义和焦点管理。
- 搜索框主要依赖鼠标进入顶部区域出现，键盘用户没有稳定入口。
- 搜索只执行 Enter 跳转，没有“找到 / 未找到 / 已回绕”的视觉和读屏反馈。
- 平铺行与封面曲目行仍是不可聚焦的 `div`，无法用键盘完成选择、播放和打开菜单。
- 加载和空状态已有基础手稿样式，但没有读取失败、重试和完整的状态语义。

Phase 8 的任务不是扩大到更多页面，而是把“全部歌曲”这一条纵向体验真正闭合。用户从浏览、搜索、
选择、播放、右键操作到编辑元数据，不能在任何一步突然回到现代玻璃语言，也不能因使用键盘而失去
核心能力。

---

## 2. 设计判断

这是高密度本地曲库产品界面的保留式深化，不是营销页重做，也不是重新设计产品行为。

- **变化度 6**：允许重新组织浮层内部层级，但不改变路由、动作集合和字段顺序。
- **动效 2**：只保留 hover、pressed、focus 和必要的显隐过渡；不增加滚动动画、弹性菜单或纸张物理效果。
- **密度 8**：菜单和表单继续紧凑，以细线、字重和留白组织层级，不把动作包装成大量卡片。
- **单一强调色**：继续使用 Phase 6 固化的暗红 accent，不新增第二种状态强调色。
- **形状规则**：手稿浮层使用 1-2px 小圆角；modern 继续使用现有圆角与玻璃材质。
- **状态完整性**：每个交互必须覆盖 default、hover、pressed、focus-visible、disabled、busy、error。

---

## 3. 目标

### 3.1 交互视觉闭环

- 右键主菜单、添加到歌单子菜单和元数据弹窗在手稿模式下使用独立纸面视觉。
- Teleport 浮层显式携带视觉 presentation，不依赖页面 DOM 祖先，也不读取 `body` 上的全局皮肤状态。
- modern、普通歌单、智能歌单、Albums 页面、Sidebar 和 Miniplayer 继续使用现有现代材质。

### 3.2 键盘可达

- 键盘可进入歌曲列表，并在虚拟化列表中前后移动焦点。
- 键盘可选择歌曲、播放歌曲、打开曲目菜单。
- 封面视图下，键盘可打开专辑封面的专辑级菜单。
- 菜单、子菜单和元数据弹窗具备正确的焦点进入、循环、关闭和返回行为。

### 3.3 搜索反馈完整

- `/` 可在全部歌曲页快速打开并聚焦搜索框。
- Enter 仍保持“前缀匹配并跳到下一项”的现有语义。
- 显示并播报已定位、未找到和回绕结果，不把搜索改造成过滤器。
- 搜索状态不增加页面高度，不改变 48px 搜索带和虚拟列表几何。

### 3.4 页面状态完整

- 加载、空曲库、读取失败和重试都有稳定 DOM、三语文案和读屏语义。
- 后台曲库变更刷新失败时保留当前列表，不用错误状态覆盖仍可用的数据。

---

## 4. 非目标与边界

Phase 8 不做以下事项：

- 不把手稿皮肤扩展到普通歌单、智能歌单、专辑页、Sidebar、Now Playing、Playbar、Miniplayer、
  桌面歌词或全屏播放器。
- 不统一改造 AppSidebar、AlbumsPage、FacetsDialog 等其他页面复用的全部 `LiquidGlassPanel`。
- 不在 `html`、`body`、`#app` 或应用外壳上增加手稿属性、class 或全局 token。
- 不改变搜索的 NFKC 归一化、繁简映射、前缀匹配、Enter 跳转下一项和回绕语义。
- 不新增筛选、排序、分页、多选、批量操作、模糊搜索或服务端搜索。
- 不改变单击选择、双击播放、队列、随机池、插播、加入歌单、元数据写入和刷新扫描行为。
- 不增加或删除元数据字段，不修改日期和年份校验规则。
- 不修改 44px 平铺行、40px 封面曲目行、250px 封面、20px panel 纵向 padding 和 56px group 纵向
  padding。
- 不引入新的组件库、焦点管理库、动画库、字体、图标库或测试依赖。
- 不新增动态纸纹、Canvas、WebGL、滚动监听动画或持续 requestAnimationFrame 循环。
- 不把 Playbar 与 Miniplayer 的术语或实现边界混在本阶段中。

允许的受控跨范围变化只有两类：

1. `LibraryContextMenu.vue` 与 `MetadataEditDialog.vue` 的 ARIA 语义和三语文案可同时惠及其 modern
   presentation，但 modern 的材质、尺寸、圆角和动作集合必须保持不变。
2. 共享 `LiquidGlassPanel.vue` 可以新增默认值为 `modern` 的 presentation prop，但未显式传入该 prop
   的所有现有调用点必须像素级保持原样。

---

## 5. 前置门禁

### 5.1 关闭 Phase 7 人工验收

Phase 8 源码实施前必须完成以下工作：

- 统一 `phase7/DELIVERY.md` 与 `phase7/screenshots/README.md` 的验收状态。
- 归档 900x620、1279x800、1280x800、1600x900 的 modern / manuscript、flat / cover 截图。
- 在 Windows 100%、125%、150% 缩放下复验多曲专辑滚动，不再出现文字或分隔线抖动。
- 记录 44px、40px、250px 和封面组估算高度的 DevTools computed geometry。
- 确认搜索定位、视图切换锚点、播放队列和所有右键动作无回归。

Phase 7 门禁未关闭时，只允许编写 Phase 8 文档和建立基线，不允许继续叠加浮层与键盘实现。

### 5.2 建立 Phase 8 基线

基线至少记录：

- 当前分支与完整提交 SHA。
- `git status --short`，明确哪些改动不属于 Phase 8。
- 右键菜单在视口四角、子菜单展开、无歌单和长歌单名的截图。
- 元数据弹窗 default、validation error、saving、save error 的截图。
- 搜索隐藏、显示、聚焦、有查询、无匹配的截图。
- 键盘审计：当前 Tab 顺序、Escape、Shift+F10、Context Menu 键和焦点返回结果。

新增：

- `docs/library-manuscript-skin-mvp/phase8/BASELINE.md`
- `docs/library-manuscript-skin-mvp/phase8/DELIVERY.md`
- `docs/library-manuscript-skin-mvp/phase8/screenshots/README.md`

---

## 6. 现状审计

### 6.1 右键菜单

当前菜单直接写在 `LibraryPage.vue` 的 Teleport 模板中：

- 外层固定在 `z-[60]`。
- 主菜单和添加到歌单子菜单使用 `LiquidGlassPanel`。
- 菜单视觉来自 `main.css` 的全局 `.library-context-menu*` 规则。
- 菜单缺少 `role="menu"`、`role="menuitem"`、roving tabindex 和 Escape 处理。
- 子菜单只依赖 CSS `:hover` / `:focus-within` 显示，没有显式 expanded 状态。
- `onOpenContextMenu()` 用 448px 估算菜单宽度，而模板 `w-55` 实际约为 220px；高度也固定估算为
  392px。不同语言、歌单数量和窗口边缘下可能产生错误偏移。
- 菜单文案直接混写在模板中，没有接入三语 locale。

现有动作必须全部保留：

1. 定位当前歌曲。
2. 播放曲目或整张专辑。
3. 插播曲目或整张专辑。
4. 添加到现有歌单。
5. 新建歌单并添加。
6. 编辑元数据。
7. 切换 flat / cover。
8. 刷新曲库。

专辑封面来源必须继续以整张专辑为作用域，歌曲行来源必须继续只作用于单曲。

### 6.2 元数据编辑弹窗

`MetadataEditDialog.vue` 当前自身 Teleport 到 `body`：

- 没有 `role="dialog"`、`aria-modal`、标题关联和错误关联。
- 打开后没有把焦点移动到第一个输入框。
- Tab 可离开弹窗，Escape 不关闭，关闭后不恢复到发起曲目。
- 保存时父组件阻止关闭，但关闭按钮没有同步 disabled / aria-disabled 表达。
- 字段标签、按钮、校验错误和保存失败文案混用中文与英文，并直接写在组件中。
- 输入和按钮使用全局 Uno shortcut，没有手稿 Teleport token。

字段和字段顺序保持：Title、Artist、Album、Album Artist、Genre、Year、Release Date。

### 6.3 搜索

搜索状态位于 `LibraryPage.vue`：

- 鼠标进入列表顶部 48px 时显示，focus 或查询非空时保持显示。
- Enter 使用现有 `jumpToNextSearchMatch()` 跳转下一条前缀匹配。
- 匹配成功只滚动，不选择、不播放；这一点必须保留。
- 未匹配时静默返回，没有视觉或 aria-live 反馈。
- 输入的 aria-label 和 placeholder 为硬编码英文。
- 没有键盘快捷入口，也没有 Escape 契约。

### 6.4 歌曲行与虚拟列表

`SongRow.vue` 与 `AlbumCoverTrackRow.vue` 的根元素都是 `div`：

- 支持 click、dblclick、contextmenu，但没有 tabindex 和完整可交互语义。
- `SongRow` 有 selected、playing、paused 状态；封面曲目行没有 selected prop。
- TanStack virtualizer 只挂载可见项。焦点移动必须先滚动目标，再等待目标 DOM 挂载。
- 不能为每一首歌注册 document 监听器，也不能在每次滚动中查询全部歌曲 DOM。

### 6.5 页面状态

当前只有 loading 与 empty 两个分支：

- `reloadTracks()` 的初次读取失败没有页面错误分支。
- loading / empty 文案没有全部接入 locale。
- 状态主要依赖装饰性伪元素，缺少 `role="status"` / `role="alert"`。
- 没有重试动作。

### 6.6 Teleport token 边界

Phase 6 token 仅定义在：

```css
.library-page[data-visual-style='manuscript']
```

Teleport 后的 DOM 不再是 `.library-page` 后代，不能通过增加选择器特异性解决。Phase 8 必须建立显式、
可审计、不会污染 shell 的浮层根作用域。

---

## 7. 稳定行为契约

### 7.1 路由与视觉隔离

继续使用现有判定：

```ts
const isManuscriptLibrary = computed(
  () => route.name === 'library' && visualStyle.value === 'manuscript',
)
```

新增统一派生值：

```ts
const libraryPresentation = computed<LibraryPresentation>(() =>
  isManuscriptLibrary.value ? 'manuscript' : 'modern',
)
```

页面内组件和 Teleport 组件只能消费 `libraryPresentation`。禁止在不同组件中重复读取 localStorage、
`useVisualStyle()` 或 route 并自行推导。

### 7.2 虚拟滚动

- flat 继续使用同一 `rowVirtualizer`、overscan 12 和 44px estimate。
- cover 继续使用同一 `albumVirtualizer`、overscan 2 和现有 group height 公式。
- 键盘定位复用 `scrollToTrackById()` / `scrollToTrackIndex()`，不得建立第二套滚动高度计算。
- focus、outline、data attribute、ARIA attribute 不得参与盒模型。
- 不允许为 focus 状态增加 border、padding 或改变 line-height。

### 7.3 搜索

- 查询数组仍是原始 `tracks`。
- 匹配函数仍为 `normalizeSearchText(field).startsWith(normalizedQuery)`。
- 匹配字段仍为 title、artist、albumArtist、album。
- Enter 仍从上次匹配之后继续，末尾回到开头。
- 搜索成功仍只滚动，不调用 `selectTrack()` 或 `playTrackFromQueue()`。

### 7.4 播放与右键

- 单击继续调用 `playback.selectTrack(trackId)`。
- 双击和键盘 Enter 继续调用相同的 `onPlay(trackId)`。
- 播放队列继续使用当前 `tracks`；歌单路由的 shufflePool 语义不变。
- 打开菜单仍先选择目标曲目。
- album-artwork 菜单继续使用整张专辑的 track ids。
- 关闭菜单不得触发播放或改变当前歌曲。

### 7.5 元数据

- 读取和保存继续使用现有 `auralis.metadata` API。
- 校验规则不变。
- 保存成功后继续 reload tracks 并关闭。
- 保存失败继续保持弹窗打开，并显示可读错误。
- 保存中禁止关闭和重复提交。

### 7.6 图片

Phase 8 不得删除或改变：

```html
loading="lazy" decoding="async" draggable="false"
```

---

## 8. 样式与组件架构

### 8.1 独立 Teleport 根作用域

所有曲库拥有的 Teleport 浮层使用稳定根：

```html
<div
  class="library-overlay"
  :data-visual-style="presentation"
  data-library-overlay="context-menu"
></div>
```

元数据弹窗使用 `data-library-overlay="metadata-dialog"`。不得把 presentation 写到 `body`。

`manuscript.tokens.css` 的 token 定义改为同时支持页面根和曲库浮层根：

```css
:where(
  .library-page[data-visual-style='manuscript'],
  .library-overlay[data-visual-style='manuscript']
) {
  /* 同一份 primitive / semantic token */
}
```

这不是全局皮肤。只有带 `.library-overlay` 且显式标记 manuscript 的 Teleport 根获得 token。

浮层规则新增在：

```text
src/renderer/features/library/styles/manuscript.overlays.css
```

规则只能以以下选择器开头：

```css
.library-overlay[data-visual-style='manuscript']
```

Phase 8 实施时同步更新 `AGENTS.md` 的 Library visual styles 说明：将“Teleport overlays remain outside”改为
“仅 LibraryContextMenu 与 MetadataEditDialog 纳入 Phase 8；其他 Teleport 仍在范围外”。

### 8.2 Token 扩展

在现有 primitive 基础上新增语义 token，不重复写纸色和墨色字面量：

```css
--manuscript-surface-overlay: var(--manuscript-surface-page);
--manuscript-surface-overlay-recessed: var(--manuscript-surface-recessed);
--manuscript-surface-scrim: rgba(var(--manuscript-color-ink-900-rgb), 0.28);
--manuscript-border-overlay: var(--manuscript-border-strong);
--manuscript-content-danger: var(--manuscript-accent-primary);
--manuscript-effect-overlay-shadow: 0 8px 24px rgba(var(--manuscript-color-ink-900-rgb), 0.16);
```

禁止：

- 在 overlay CSS 重新声明完整 palette。
- 让 overlay 依赖 `.library-page` 祖先。
- 用 `!important` 覆盖整个 modern 菜单。
- 在浮层滚动容器上增加 filter、动态 noise 或 backdrop-filter。

### 8.3 `LibraryContextMenu.vue`

从 `LibraryPage.vue` 抽出菜单 DOM，新组件只负责：

- 渲染动作与子菜单。
- 主菜单和子菜单焦点管理。
- 实际尺寸测量、视口夹取和子菜单翻转。
- presentation 与 ARIA 语义。
- 把用户意图 emit 给 `LibraryPage.vue`。

它不得直接：

- 调用 IPC。
- 读取 playback store。
- 修改 view mode。
- 计算专辑 track ids。
- 自己读取 visual style 或 route。

建议 props：

```ts
interface Props {
  open: boolean
  presentation: LibraryPresentation
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
  trackTitle: string
  albumTitle: string
  canLocateCurrent: boolean
  canInsert: boolean
  currentViewMode: LibraryViewMode
  playlists: SidebarPlaylistItem[]
  playlistFeedback: { playlistId: number; message: string } | null
  playlistLoading: boolean
  playlistLoadError: string | null
  creatingPlaylist: boolean
  refreshing: boolean
}
```

事件保留显式名称，避免用无类型字符串总线：

```ts
close
locateCurrent
play
insertAfterCurrent
addToPlaylist: [playlist: SidebarPlaylistItem]
createPlaylist
editMetadata
switchView: [mode: LibraryViewMode]
refresh
```

`LiquidGlassPanel.vue` 可以增加 `presentation?: LibraryPresentation`，默认 `modern`。只有菜单显式传入
`manuscript` 时隐藏 refraction、highlight、blur 和 glass shadow。

### 8.4 菜单状态类型

新增：

```text
src/renderer/features/library/types/libraryInteraction.ts
```

建议类型：

```ts
export type LibraryViewMode = 'flat' | 'cover'
export type LibraryContextMenuSource = 'track' | 'album-artwork'
export type LibraryContextMenuOpenReason = 'pointer' | 'keyboard'

export interface LibraryContextMenuAnchor {
  clientX: number
  clientY: number
  returnFocusTrackId: number | null
  openReason: LibraryContextMenuOpenReason
}

export interface LibraryContextMenuState {
  trackId: number
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
}
```

不要把 HTMLElement 长期存入业务状态。焦点返回以 track id 为稳定锚点；临时 invoker element 只允许作为
组件内部非响应引用，并在关闭时清理。

### 8.5 `MetadataEditDialog.vue`

新增 `presentation: LibraryPresentation` prop，并在 Teleport 根输出独立 overlay scope。

弹窗继续是同一个字段表单，不复制 manuscript 专用组件。结构要求：

- `role="dialog"` 与 `aria-modal="true"`。
- `aria-labelledby` 指向唯一标题 id。
- 错误区域有稳定 id、`role="alert"`，输入按需使用 `aria-invalid` / `aria-describedby`。
- 打开后聚焦 Title；Tab / Shift+Tab 在弹窗可交互元素间循环。
- Escape 在非 saving 状态关闭；saving 时忽略并保持焦点。
- 关闭按钮在 saving 时 disabled。
- 关闭后由页面按 track id 恢复焦点。
- 点击 scrim 继续不关闭，避免静默改变现有行为。

### 8.6 `LibraryStatusState.vue`

新增统一状态组件：

```ts
type LibraryStatusKind = 'loading' | 'empty' | 'error'
```

职责：

- 渲染 locale 文案和正确 role。
- loading 使用静态账册行占位，不使用 spinner 或 shimmer。
- empty 使用现有引导含义，不新增路由跳转按钮。
- error 提供唯一的“重试”按钮。
- presentation 为 modern 时保持现有简洁外观；manuscript 才使用纸页编排。

### 8.7 CSS 文件职责

| 文件                      | Phase 8 职责                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| `manuscript.tokens.css`   | 让同一份 token 同时服务 page 与 library overlay 根；新增 overlay semantic token |
| `manuscript.css`          | 页面内搜索、歌曲行 focus-visible、状态布局；仍只服务 `.library-page`            |
| `manuscript.overlays.css` | 右键菜单、子菜单、scrim、metadata dialog、输入和按钮                            |
| `main.css`                | 保留 modern 默认；只在组件抽取导致稳定类名调整时做最小修改                      |
| `uno.config.ts`           | 原则上不改；不得通过修改全局 shortcut 实现 manuscript overlay                   |

---

## 9. 目标视觉规格

### 9.1 右键菜单

手稿菜单表现为一张紧凑的档案操作签：

- 宽度以内容为准，目标 232-264px，受 `calc(100vw - 16px)` 限制。
- 外框 1px 墨线，圆角 2px，纸面不透明。
- 不使用 backdrop blur、玻璃高光、refraction 或大面积渐变。
- 可保留一层轻微、暖色调的外阴影以表达浮层层级。
- 图标继续使用项目现有 Lucide Uno 图标，统一尺寸和墨色，不引入新图标族。
- 每个 item 最小高度 32px；长曲名和歌单名单行截断并提供 title。
- hover 使用石墨灰底，pressed 使用 soft accent，focus-visible 使用 2px 暗红内框或外框。
- disabled 保持文本可辨识，但对比度降低且没有 hover。
- 分隔线只用于动作分组，不在每一行上下都画线。
- playing 不是菜单装饰状态，不增加无语义圆点。

### 9.2 添加到歌单子菜单

- 指针 hover 和键盘 ArrowRight 都可打开。
- 根据右侧剩余空间向左翻转，不能溢出窗口。
- 高度超过可用空间时内部纵向滚动，最大高度由视口计算。
- 歌单加载失败显示内联错误，但“新建歌单”仍可用。
- 添加成功反馈使用 `aria-live="polite"`，不改变菜单尺寸。

### 9.3 元数据编辑弹窗

手稿弹窗是一张编辑记录单，不模拟拟物书本：

- 最大宽度继续约 576px，窄窗口保持 16px 安全边距。
- 纸面不透明，1px 外框，2px 圆角，禁止玻璃 blur。
- 标题使用手稿正文衬线；字段标签和按钮使用 UI sans；年份与日期使用 numeric sans。
- 输入框使用 1px 线框和纸面底；focus 使用 2px 暗红环，不改变输入高度。
- 错误直接位于相关表单区域下方，不使用 toast。
- primary save 使用暗红实底和纸色文字；cancel 使用透明纸面与墨线。
- saving 只替换按钮文字并禁用相关关闭动作，不增加旋转动画。

### 9.4 搜索

- 继续位于现有 48px 搜索带，不新增第二个搜索入口。
- 右侧预留短状态文本位置；compact 下状态改为仅读屏，不挤压输入。
- 状态包括：已定位 `{index}/{total}`、未找到、已从开头继续。
- 状态更新使用 `aria-live="polite"`。
- no-match 只改变文字和边框语义，不震动、不闪烁、不播放动效。

### 9.5 页面状态

- loading：显示 5-7 条静态账册骨架线，尺寸不需要进入 virtualizer。
- empty：显示“尚未收录曲目”的功能性文案，不使用伪造档案编号。
- error：显示读取失败原因的用户可读摘要和重试按钮。
- 状态区不使用纯装饰性的版本号、编号 eyebrow 或持续动画。

---

## 10. 键盘与焦点契约

### 10.1 歌曲行 roving focus

仅在 `isManuscriptLibrary` 为 true 时启用完整歌曲行键盘模型；modern 和歌单的 DOM 可获得无视觉影响的
ARIA 修正，但不在本阶段改变其 Tab 行为。

页面维护：

```ts
const keyboardFocusTrackId = ref<number | null>(null)
const shouldRestoreKeyboardFocus = ref(false)
```

初始锚点按以下顺序选择：

1. `playback.state.selectedTrackId`
2. `playback.state.currentTrackId`
3. 第一首曲目

歌曲行使用：

- `role="button"`
- `tabindex="0"` 仅用于 active row，其余已挂载行使用 `-1`
- `aria-pressed` 表达 selected
- `aria-current="true"` 表达 now playing
- `data-track-id` 作为离散焦点恢复锚点

键位：

| 键           | 行为                                           |
| ------------ | ---------------------------------------------- |
| ArrowDown    | 焦点移到下一首；不播放、不选择                 |
| ArrowUp      | 焦点移到上一首；不播放、不选择                 |
| Home         | 焦点移到第一首                                 |
| End          | 焦点移到最后一首                               |
| Space        | 调用现有 `onSelect(trackId)`                   |
| Enter        | 调用现有 `onPlay(trackId)`                     |
| Context Menu | 打开该曲目的 track 菜单                        |
| Shift+F10    | 打开该曲目的 track 菜单                        |
| `/`          | 聚焦搜索框，前提是当前焦点不在输入控件或弹窗内 |

焦点移动实现顺序：

1. 计算目标在 `tracks` 中的 index。
2. 复用 `scrollToTrackById()`。
3. `await nextTick()`。
4. 等待一次 requestAnimationFrame，让 virtual item 挂载。
5. 只查询目标 `[data-track-id="..."]` 并 focus。

禁止在 keydown 中扫描全部 DOM，也禁止引入持续 RAF。

### 10.2 封面视图专辑作用域

手稿 cover 下 `.album-cover-artwork` 增加键盘入口：

- `role="button"`
- `tabindex="0"`
- aria-label 使用专辑名和“打开专辑操作菜单”本地化文案
- Enter、Space、Context Menu、Shift+F10 打开 `source='album-artwork'` 菜单

打开菜单时仍以该组首曲作为 anchor track id，因此整专辑动作集合与现状一致。

### 10.3 主菜单

主菜单遵循：

| 键                  | 行为                                                            |
| ------------------- | --------------------------------------------------------------- |
| ArrowDown / ArrowUp | 在可用 menuitem 中循环                                          |
| Home / End          | 第一项 / 最后一项                                               |
| Enter / Space       | 执行当前项                                                      |
| ArrowRight          | 当前项有子菜单时打开并聚焦第一项                                |
| Escape              | 关闭子菜单；若主菜单无子菜单则关闭主菜单                        |
| Tab / Shift+Tab     | 阻止默认行为，关闭菜单并恢复 invoker；再次按 Tab 才继续页面顺序 |

打开后聚焦第一项可用动作。disabled item 不进入 roving 序列。

### 10.4 子菜单

- ArrowDown / ArrowUp 在歌单和“新建歌单”间循环。
- ArrowLeft 或 Escape 返回父级“添加到歌单”。
- Enter / Space 执行动作。
- 指针离开时，如果焦点仍在子菜单内部，不得因 hover 消失而卸载。

### 10.5 元数据弹窗

- 打开后聚焦 Title。
- Tab / Shift+Tab 在弹窗内循环。
- Escape 在非 saving 状态关闭。
- Enter 的表单提交语义需要显式实现并写入交付记录；不得产生双提交。
- saving 时所有 close 路径都失效，保存按钮保持 disabled。
- validation / save error 出现后，焦点保持在当前字段或保存按钮，错误通过 alert 播报。

### 10.6 焦点返回

- 关闭右键菜单：返回打开菜单的歌曲行或专辑封面。
- 菜单进入元数据编辑：把 `returnFocusTrackId` 转交给 dialog 流程，菜单关闭时不抢先恢复。
- 关闭元数据弹窗：滚动并聚焦原曲目。
- 在菜单中切换 flat / cover：复用现有锚点滚动，目标视图 mounted 后恢复到同一 track id。
- 若目标歌曲已被曲库刷新删除，回退到滚动容器或当前第一首，不抛异常。

---

## 11. 搜索状态设计

新增状态：

```ts
type LibrarySearchOutcome =
  | { kind: 'idle' }
  | { kind: 'matched'; index: number; total: number; wrapped: boolean }
  | { kind: 'not-found' }
```

`jumpToNextSearchMatch()` 仍使用现有匹配函数，只在既有返回路径上补充 outcome：

```text
空查询       -> idle，不滚动
找到下一项   -> matched，wrapped=false
尾部回到开头 -> matched，wrapped=true
没有匹配     -> not-found，不滚动
```

快捷键 `/` 的约束：

- 只在 `route.name === 'library'` 且没有打开菜单 / dialog 时生效。
- event target 为 input、textarea、select、button 或 contenteditable 时不拦截。
- 先让搜索条进入 render 条件，再 nextTick focus。
- 不拦截 Ctrl+F，不改变 Electron / Chromium 的浏览器查找快捷键。

Escape 契约：

1. 查询非空时清空查询并回到 idle，焦点保留在输入框。
2. 查询为空时 blur 并允许搜索条按现有规则隐藏。

---

## 12. 本地化契约

新增三语 key，保持 `zh-Hans`、`zh-Hant`、`en` 结构完全一致。

建议结构：

```text
library.search.*
library.contextMenu.*
library.metadataEditor.*
library.status.*
library.a11y.*
```

必须移除 LibraryPage / MetadataEditDialog 中以下硬编码可见文本：

- 搜索 aria-label 与 placeholder。
- 右键菜单全部动作。
- Unknown Title / album fallback。
- 元数据标题、字段名、按钮、saving、validation、save error。
- loading、全部歌曲 empty、普通歌单 empty、智能歌单 empty、load error、retry。
- album artwork 与歌曲行的键盘 aria-label。

动态标题使用 locale 插值，不用字符串拼接：

```json
{
  "playTrack": "播放「{title}」",
  "playAlbum": "播放「{album}」"
}
```

英文、简体和繁体都必须通过 `npm.cmd run lint` 中的 locale key 一致性检查。

---

## 13. 分步实施计划

## Step 8.0：关闭 Phase 7 门禁并冻结基线

### 修改范围

- `docs/library-manuscript-skin-mvp/phase7/DELIVERY.md`
- `docs/library-manuscript-skin-mvp/phase7/screenshots/README.md`
- `docs/library-manuscript-skin-mvp/phase8/BASELINE.md`
- `docs/library-manuscript-skin-mvp/phase8/screenshots/README.md`

### 实施步骤

1. 完成第 5.1 节人工矩阵。
2. 统一 Phase 7 文档状态，记录最近封面滚动抖动修复的提交或工作树差异。
3. 固定 Phase 8 起始 SHA 和工作树状态。
4. 归档现有 modern 与 manuscript 浮层基线。

### 验收门槛

- Phase 7 人工验收有明确通过结论。
- Phase 8 BASELINE 能区分已有问题与本阶段引入问题。
- 未修改源码。

### 建议提交

```text
docs：冻结手稿交互闭环 Phase 8 基线
```

---

## Step 8.1：建立 overlay presentation 与 token 作用域

### 修改文件

- `src/renderer/features/library/types/libraryInteraction.ts`（新增）
- `src/renderer/features/library/styles/manuscript.tokens.css`
- `src/renderer/features/library/styles/manuscript.overlays.css`（新增）
- `src/renderer/features/library/components/LiquidGlassPanel.vue`
- `src/renderer/features/library/pages/LibraryPage.vue`
- `AGENTS.md`

### 实施步骤

1. 新增 `libraryPresentation` 单一派生值。
2. 定义 menu source、anchor、open reason 和 state 类型。
3. 扩展 token selector，使 page root 和 library overlay root 共享同一份 token。
4. 新建 overlay CSS，只建立稳定根和材质基础，不搬运具体菜单 DOM。
5. `LiquidGlassPanel` 新增默认 modern presentation；未传 prop 的现有调用点无变化。
6. 更新 AGENTS.md 的 Teleport 范围说明。

### 验收门槛

- 禁止出现 `[data-visual-style='manuscript']` 裸选择器。
- 禁止给 html、body、#app、app-window 增加手稿 selector。
- Sidebar、Albums、Facets、Miniplayer 的 LiquidGlassPanel computed style 不变。
- typecheck、lint、build 通过。

### 建议提交

```text
refactor：建立曲库手稿浮层作用域
```

---

## Step 8.2：抽取并手稿化右键菜单

### 修改文件

- `src/renderer/features/library/components/LibraryContextMenu.vue`（新增）
- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.overlays.css`

### 实施步骤

1. 将现有菜单 DOM 原样抽入组件，逐项核对动作条件和 disabled 条件。
2. 父页面继续持有 IPC、playback、album ids、view switch 和 refresh 逻辑。
3. 用实际 DOM rect 替代 448x392 硬编码估算。
4. 主菜单夹取到 8px viewport inset。
5. 子菜单按空间右开或左开，并限制最大高度。
6. 应用第 9.1、9.2 节手稿视觉。
7. modern presentation 与抽取前截图对比。

### 验收门槛

- 八类既有动作逐项可用。
- album-artwork 和 track 作用域没有互换。
- 视口四角不溢出。
- 子菜单在窄窗口正确翻转。
- modern 材质和布局无视觉回归。

### 建议提交

```text
feat：完成手稿曲库右键菜单视觉闭环
```

---

## Step 8.3：实现菜单键盘模型与焦点恢复

### 修改文件

- `src/renderer/features/library/components/LibraryContextMenu.vue`
- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.overlays.css`

### 实施步骤

1. 增加 menu / menuitem / separator / submenu ARIA。
2. 实现可用 item 的 roving tabindex。
3. 实现 Arrow、Home、End、Enter、Space、Escape、Tab。
4. 子菜单用显式 expanded 状态控制，保留 pointer hover 能力。
5. 记录 `returnFocusTrackId`，关闭后恢复。
6. 菜单进入 metadata 或 view switch 时转交焦点恢复责任。
7. 所有 document / resize listener 在关闭和 unmount 时清理。

### 验收门槛

- 菜单全程可不使用鼠标完成。
- disabled item 不获得焦点。
- Escape 行为符合主菜单 / 子菜单层级。
- 关闭后焦点不会落到 body。
- 不存在重复 keydown listener。

### 建议提交

```text
feat：补齐曲库菜单键盘操作与焦点恢复
```

---

## Step 8.4：手稿化并无障碍化元数据编辑弹窗

### 修改文件

- `src/renderer/features/library/components/MetadataEditDialog.vue`
- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.overlays.css`
- `src/renderer/locales/zh-Hans.json`
- `src/renderer/locales/zh-Hant.json`
- `src/renderer/locales/en.json`

### 实施步骤

1. 增加 presentation prop 和 library overlay root。
2. 增加 dialog 语义、标题关联和错误关联。
3. 实现打开聚焦、Tab 圈闭、Escape 和 saving 禁止关闭。
4. 父页面保存原 track id，关闭后恢复歌曲焦点。
5. 全部字段、按钮和校验文案接入 i18n。
6. 应用第 9.3 节手稿视觉。
7. 保持字段顺序和校验算法不变。

### 验收门槛

- default、validation error、saving、save success、save error 全通过。
- saving 时不能 Escape、关闭或重复提交。
- 关闭后回到原歌曲。
- modern presentation 的字段尺寸和弹窗位置不回归。
- 三语没有硬编码残留。

### 建议提交

```text
feat：完成手稿元数据编辑弹窗与焦点管理
```

---

## Step 8.5：补齐搜索入口与结果反馈

### 修改文件

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.css`
- 三个 locale JSON

### 实施步骤

1. 增加 `LibrarySearchOutcome`。
2. 在现有匹配返回路径更新 matched / wrapped / not-found。
3. 增加 aria-live 状态，不修改滚动与选择语义。
4. 实现 `/` 快捷入口及输入目标保护。
5. 实现 Escape 两阶段契约。
6. compact 下隐藏视觉状态文案但保留读屏。

### 验收门槛

- 鼠标 hover 行为保持。
- `/` 可打开搜索，输入控件内按 `/` 不被拦截。
- Enter 下一项和回绕行为与基线一致。
- no-match 不选择、不播放、不移动列表。
- 搜索带仍为 48px，列表顶部 inset 不变。

### 建议提交

```text
feat：补齐手稿曲库搜索反馈与快捷入口
```

---

## Step 8.6：实现歌曲行与专辑封面键盘模型

### 修改文件

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/components/SongRow.vue`
- `src/renderer/features/library/components/AlbumCoverGroup.vue`
- `src/renderer/features/library/components/AlbumCoverTrackRow.vue`
- `src/renderer/features/library/styles/manuscript.css`
- 三个 locale JSON

### 实施步骤

1. 为 flat 与 cover 行增加稳定 `data-track-id`、role、tabindex 和 ARIA 状态。
2. 为 cover row 增加 selected prop，但不改变 40px 高度。
3. 页面集中处理 roving focus 和快捷键，行组件只 emit 意图。
4. 复用现有 track scroll 函数完成虚拟化跨屏焦点移动。
5. album artwork 增加专辑菜单键盘入口。
6. focus-visible 使用不占盒模型的 outline / inset shadow。
7. view switch 后按同一 track id 恢复。

### 验收门槛

- flat / cover 均可完成 focus、select、play、context menu。
- Home / End 在大型曲库中可用。
- 快速连续 Arrow 不产生错焦、空焦点或明显卡顿。
- 44px / 40px / 250px computed geometry 不变。
- 虚拟行数量与 overscan 不增加。
- 点击、双击和右键行为无回归。

### 建议提交

```text
feat：补齐手稿曲库虚拟列表键盘操作
```

---

## Step 8.7：补齐 loading、empty、error 状态

### 修改文件

- `src/renderer/features/library/components/LibraryStatusState.vue`（新增）
- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.css`
- 三个 locale JSON

### 实施步骤

1. 抽取 loading / empty 现有分支。
2. 新增仅针对初次和路由读取的 `initialLoadError`。
3. 添加 retry，复用同一 reload + scroll 流程。
4. 后台 onChanged / scan completed 失败时保留当前 tracks，并记录错误，不覆盖可用列表。
5. 实现 status / alert / busy 语义。
6. 应用第 9.5 节静态账册状态视觉。

### 验收门槛

- loading、empty、initial error、retry success、retry failure 全通过。
- 背景刷新失败不会清空已有曲目。
- 状态没有 spinner、shimmer 或持续动画。
- ordinary / smart playlist 仍显示各自正确空文案。

### 建议提交

```text
feat：补齐曲库加载空态与错误恢复
```

---

## Step 8.8：回归、性能与交付

### 自动校验

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

对所有 Phase 8 修改文件运行 Prettier check。不要对脏工作树执行无范围的全仓格式化。

### 结构检查

```powershell
rg -n "html|body|#app|app-window" src/renderer/features/library/styles/manuscript.overlays.css
rg -n "backdrop-filter|filter:|animation:" src/renderer/features/library/styles/manuscript.overlays.css
rg -n "role=|aria-|tabindex|keydown" src/renderer/features/library/components src/renderer/features/library/pages/LibraryPage.vue
rg -n "定位到当前歌曲|编辑元数据|Loading library|Unknown Title|Unable to save" src/renderer/features/library
```

第一条允许值应为 0。第二条只允许明确的 modern fallback 或 manuscript 禁用规则，不能出现 manuscript
动态 filter / animation。第四条应确认可见硬编码已迁移到 locale。

### 人工验收

执行第 14 节完整矩阵，更新：

- `phase8/DELIVERY.md`
- `phase8/screenshots/README.md`
- 截图与 computed geometry 记录

### 建议提交

```text
chore：完成手稿交互闭环 Phase 8 交付门禁
```

---

## 14. 人工验证矩阵

### 14.1 窗口与缩放

| 窗口     | Windows 缩放     | 必验原因                           |
| -------- | ---------------- | ---------------------------------- |
| 900x620  | 100%、125%、150% | compact、菜单空间和弹窗高度        |
| 1279x800 | 100%、125%       | xl 前中央列宽                      |
| 1280x800 | 100%、125%       | xl 后 Now Playing 出现，中央列突变 |
| 1600x900 | 100%、125%、150% | spacious、子菜单和长文本           |

### 14.2 视觉组合

至少覆盖：

- modern / manuscript
- flat / cover
- normal / hover / pressed / focus-visible / disabled / busy / error
- zh-Hans / zh-Hant / en
- 普通歌曲菜单 / 专辑封面菜单
- 无歌单 / 1 个歌单 / 20 个歌单 / 超长歌单名
- 正常 metadata / 全空 metadata / validation error / save error

### 14.3 键盘路径

1. Tab 进入歌曲列表。
2. ArrowDown 跨越多个虚拟窗口。
3. Space 选择，Enter 播放。
4. Shift+F10 打开曲目菜单。
5. ArrowRight 进入歌单子菜单，ArrowLeft 返回。
6. Escape 关闭并回到歌曲。
7. 在 cover 下聚焦 artwork，Enter 打开专辑菜单。
8. 从菜单进入 metadata，Tab / Shift+Tab 圈闭。
9. 关闭 dialog，焦点返回原曲目。
10. 菜单内切换 flat / cover，焦点恢复到同一 track id。
11. `/` 打开搜索，Enter 跳转，Escape 清除并退出。

### 14.4 右键行为

- locate current 在 currentTrackId 为空时 disabled。
- play track / play album 队列正确。
- insert track / insert album 条件正确。
- album artwork 添加到歌单仍为整专辑。
- track row 添加到歌单仍为单曲。
- create playlist busy 状态不重复创建。
- edit metadata 的目标 track id 正确。
- view switch 锚点不漂移。
- refresh busy 状态不重复触发扫描。

### 14.5 搜索

- title、artist、albumArtist、album 前缀匹配。
- 大小写、NFKC、繁简归一化不回归。
- 同查询连续 Enter 找下一项。
- 末尾回绕到开头并显示 wrapped 反馈。
- 无结果不移动、不选择、不播放。
- 搜索中打开 / 关闭菜单不丢失查询。

### 14.6 状态与错误

- 初次 loading。
- 全部歌曲 empty。
- 普通歌单 empty。
- 智能歌单 empty。
- 初次读取 reject。
- retry 继续 reject。
- retry 成功。
- 已有列表时后台 reload reject，列表仍可操作。

错误场景可在开发构建中使用受控 one-shot stub 模拟。验收后不得保留 stub、调试按钮或环境开关。

### 14.7 读屏与焦点

- Windows Narrator 能播报歌曲标题、selected 和 now playing。
- 菜单打开、子菜单 expanded、disabled 和反馈可播报。
- dialog 标题、字段标签、错误和 saving 可播报。
- no-match 与 wrapped 搜索结果通过 polite live region 播报。
- 任意关闭路径后 focus 不落到 body。

---

## 15. 性能门槛

- 不增加 Renderer 到 main 的 IPC 调用频率；菜单打开仍只加载一次歌单列表。
- 不为每个 SongRow / AlbumCoverTrackRow 注册 document、window 或 scroll listener。
- 菜单与 dialog 的 listener 只在 open 生命周期存在，并在 close / unmount 清理。
- Arrow 键每次只做一次 track index 计算、一次既有滚动定位和一次目标 DOM 查询。
- 不在滚动回调中更新焦点或执行 `querySelectorAll`。
- 不改变 virtualizer count、overscan、estimateSize 或 group height 公式。
- manuscript overlay 不使用 backdrop-filter、动态 filter、持续动画或 canvas。
- 大型曲库快速按住 ArrowDown 时主线程没有持续长任务，列表不出现明显掉帧或焦点丢失。

---

## 16. 文件级变更清单

### 16.1 新增

```text
docs/library-manuscript-skin-mvp/phase8/BASELINE.md
docs/library-manuscript-skin-mvp/phase8/DELIVERY.md
docs/library-manuscript-skin-mvp/phase8/screenshots/README.md
src/renderer/features/library/components/LibraryContextMenu.vue
src/renderer/features/library/components/LibraryStatusState.vue
src/renderer/features/library/styles/manuscript.overlays.css
src/renderer/features/library/types/libraryInteraction.ts
```

### 16.2 修改

```text
AGENTS.md
src/renderer/features/library/pages/LibraryPage.vue
src/renderer/features/library/components/LiquidGlassPanel.vue
src/renderer/features/library/components/MetadataEditDialog.vue
src/renderer/features/library/components/SongRow.vue
src/renderer/features/library/components/AlbumCoverGroup.vue
src/renderer/features/library/components/AlbumCoverTrackRow.vue
src/renderer/features/library/styles/manuscript.tokens.css
src/renderer/features/library/styles/manuscript.css
src/renderer/locales/zh-Hans.json
src/renderer/locales/zh-Hant.json
src/renderer/locales/en.json
```

### 16.3 原则上不修改

```text
src/main/**
src/preload/**
src/shared/ipc/**
src/renderer/features/playback/**
src/renderer/app/layout/PlayerBar.vue
src/renderer/app/layout/MiniPlayer.vue
src/renderer/app/layout/AppSidebar.vue
src/renderer/features/albums/**
uno.config.ts
electron.vite.config.ts
package.json
```

如果实际实施必须修改原则上不修改的文件，应先在 DELIVERY 说明原因、影响面和回退方式。

---

## 17. 风险与解决方案

### 17.1 Teleport token 泄漏

**风险**：为让浮层获得 paper token，开发者把 manuscript 属性写到 body，导致 Sidebar、Albums 或其他菜单
被动变色。  
**解决**：只允许 `.library-overlay[data-visual-style='manuscript']`；token 用 `:where(page, overlay)` 共享，
样式仍分别命名空间。结构检查禁止 body selector。

### 17.2 `LiquidGlassPanel` 共享回归

**风险**：该组件还被 Sidebar、Facets、Albums、MiniPlayer 使用，修改默认材质会扩大范围。  
**解决**：presentation 默认 modern；manuscript 只由 LibraryContextMenu 显式传入；对所有现有调用点做
computed style 和截图对比。

### 17.3 菜单抽取丢动作条件

**风险**：`v-if` / disabled 条件散落在原模板，抽取时容易让当前曲目也显示插播，或把 album scope 降为
单曲。  
**解决**：先建立动作矩阵，再逐项搬运；业务函数仍留在父页面；人工验收覆盖八类动作和两种 source。

### 17.4 焦点与虚拟化冲突

**风险**：目标行尚未挂载就 focus，或 focused row 被虚拟器卸载后焦点落到 body。  
**解决**：先复用 scrollToTrackById，再 nextTick + 单次 RAF；以 track id 恢复；目标删除时回退 scroll
container；不缓存行 HTMLElement。

### 17.5 行 focus 样式改变高度

**风险**：focus border 进入盒模型，破坏 44px / 40px estimate 并重新引发抖动。  
**解决**：只用 outline、box-shadow inset 或伪元素；computed geometry 是强制门禁。

### 17.6 快捷键抢占输入

**风险**：`/`、Space、Arrow 或 Enter 在 metadata 输入框、搜索输入框或其他控件中被页面处理。  
**解决**：集中使用 `isTextEntryTarget()` / interactive target guard；dialog 或 menu open 时页面快捷键暂停；
不拦截 Ctrl+F。

### 17.7 Tab 关闭菜单后焦点丢失

**风险**：菜单先 unmount，再让浏览器执行默认 Tab，目标不存在。  
**解决**：Tab / Shift+Tab 均 `preventDefault()`，关闭菜单并恢复 invoker；用户再次按 Tab 才继续页面顺序。
这一语义必须在两种 presentation 和三类曲库 route 中保持一致。

### 17.8 元数据保存双提交

**风险**：按钮 click 与 form Enter 同时触发。  
**解决**：只有 form submit 调用 onSave，按钮使用 `type="submit"`；saving guard 位于组件和父页面两层；
人工快速连按 Enter 验证只发生一次 IPC。

### 17.9 搜索反馈改变产品语义

**风险**：为了显示结果数量而提前过滤全部列表、选择匹配项或建立第二份 tracks。  
**解决**：outcome 只记录本次跳转 index、总数和 wrapped；不创建 filteredTracks，不调用 select / play。

### 17.10 错误状态覆盖可用列表

**风险**：后台刷新暂时失败后整页变成 error，用户失去当前列表。  
**解决**：full error 只用于初次 / 路由读取且没有可用 tracks；后台失败保留当前 shallowRef 数据并记录。

### 17.11 locale 文案导致菜单溢出

**风险**：英文动态曲名、繁体标签或长歌单名改变菜单实际尺寸。  
**解决**：菜单 mount 后测量而不是硬编码高度；动态文本 truncate + title；三语都执行四角和子菜单测试。

### 17.12 Phase 7 文档状态冲突

**风险**：DELIVERY 声称前置门禁已关闭，但 screenshots README 仍记录未关闭，导致 Phase 8 基线不可信。  
**解决**：Step 8.0 必须先统一事实；无法提供人工结果时不得把 Phase 8 标为 in progress。

---

## 18. 回退策略

Phase 8 应按 Step 独立提交，回退顺序与实现顺序相反：

1. 回退状态组件，不影响列表数据和虚拟化。
2. 回退歌曲行键盘 props / events，不删除原 click、dblclick、contextmenu。
3. 回退搜索 outcome 与快捷键，保留原 Enter 跳转函数。
4. 回退 MetadataEditDialog presentation 和焦点增强，保留原字段与保存逻辑。
5. 回退 LibraryContextMenu 抽取时，恢复基线 Teleport 模板和现有业务 handler。
6. 最后回退 overlay CSS / token scope；不得删除 Phase 6 page token。

任何单步回退后都必须确认：

- modern 与歌单仍工作。
- 原右键动作集合完整。
- metadata 可保存。
- search Enter 可定位。
- flat / cover 虚拟滚动几何不变。

---

## 19. Definition of Done

满足以下全部条件后，Phase 8 才能标记完成：

- Phase 7 人工验收已关闭，文档和截图状态一致。
- context menu 与 metadata dialog 在 manuscript 下形成完整纸面视觉，在 modern 下保持现有材质。
- Teleport 通过 library overlay 根获得 token，没有 body / shell 样式泄漏。
- 八类右键动作和 track / album 两种作用域无回归。
- 主菜单与子菜单可全键盘操作，焦点关闭后正确返回。
- metadata dialog 具备 dialog 语义、焦点圈闭、Escape、saving guard 和错误播报。
- flat / cover 歌曲均可用键盘 focus、select、play 和打开菜单。
- cover artwork 可用键盘打开专辑级菜单。
- `/` 可进入搜索；Enter 的原搜索语义不变；matched / wrapped / not-found 可见且可播报。
- loading、empty、initial error、retry 和后台失败保留数据全部通过。
- zh-Hans、zh-Hant、en key 一致，组件中无本阶段目标硬编码文案。
- 44px、40px、250px、panel padding 和 group height 公式无漂移。
- 图片 lazy / async、队列、随机池、搜索定位、右键、metadata、view switch 和 anchor restore 无回归。
- modern、普通歌单、智能歌单、Sidebar、Albums、Facets、Miniplayer 没有手稿视觉泄漏。
- 所有 open 生命周期 listener 均有清理，不存在每行全局监听器或持续 RAF。
- typecheck、lint、build、diff-check 和目标文件 Prettier check 全部通过。
- Windows 多宽度、多缩放、三语、指针、键盘和 Narrator 人工矩阵通过。
- DELIVERY 记录固定提交、截图、computed geometry、人工结论和已知限制。

Phase 8 完成后，再评估 Phase 9 是否扩展到普通歌单与智能歌单。不要在 Phase 8 实施过程中顺带修改
歌单页眉、专辑页或应用外壳。
