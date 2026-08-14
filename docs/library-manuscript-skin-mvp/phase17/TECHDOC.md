# TECHDOC：应用外壳与 Sidebar 手稿化（Phase 17）

- **文档状态**：完全交付；Electron 人工验收通过（2026-08-13）
- **设计日期**：2026-08-13
- **目标表面**：普通主窗口应用外壳、主内容边界、`AppSidebar` 与 Sidebar 自有浮层
- **唯一视觉状态源**：`src/renderer/features/appearance/composables/useVisualStyle.ts`
- **前置状态**：Phase 16 已完全交付，Electron 人工矩阵通过

## 1. 结论

Phase 17 把已经完成手稿覆盖的内容路由连接成连续的桌面应用环境。实现只从现有
`useVisualStyle()` 派生普通主窗口的 shell presentation，不创建新的外壳开关、状态 ref、
storage key 或 IPC。

本阶段覆盖：

- 普通主窗口的 `.app-window`、`.app-shell` 与 `.app-main` 边界；
- `AppSidebar` 品牌区、工具区、主导航、统计、歌单树、空状态和拖排反馈；
- Sidebar 自有的新建菜单、歌单右键菜单、重命名、删除、自然语言智能歌单 Dialog；
- 从 Sidebar 打开的 `FacetsDialog` 及其自有右键菜单；
- 手稿模式下应用级流体封面背景、blur overlay 和 shell chrome 封面色板计算的真实停用。

本阶段明确不覆盖：

- `NowPlayingPanel.vue` 与 `PlayerBar.vue`，归 Phase 18；
- `FullscreenPlayerOverlay.vue`，归 Phase 19；
- `MiniPlayer.vue` 与主进程迷你窗口控制，归 Phase 20；
- 桌面歌词窗口，是否实施由 Phase 21 决定；
- Windows 原生标题栏、最小化、最大化、还原和关闭按钮；
- 内容页自身的手稿布局与业务功能；
- Repository、Service、SQLite、typed IPC、preload 与主进程窗口架构。

若实施中发现必须改变上述排除表面或跨进程契约，应暂停并重新审查范围，不能以 shell
换肤为由顺带修改播放器或窗口行为。

## 2. 设计判断

这是本地音乐档案播放器外壳的保留式重构，面向高频浏览个人大型曲库的桌面用户，延续
现有手稿 token、Vue、UnoCSS 与 Lucide 图标体系。手稿外壳应像一套耐用的档案索引工具，
而不是营销网站、复古装饰主题或把所有控件放进纸张卡片的皮肤。

- `DESIGN_VARIANCE = 4`：整体网格稳定，差异来自边界、层级、编号与墨色，不改变导航结构。
- `MOTION_INTENSITY = 2`：只保留 hover、press、focus、拖排和 Dialog 状态反馈，停止 shimmer、
  glow 与流体背景。
- `VISUAL_DENSITY = 7`：在 232px Sidebar 中保持高信息密度，名称、数量与状态仍可快速扫描。

设计系统继续使用项目既有 UnoCSS、CSS variables、Lucide 与共享 manuscript tokens，不引入
Fluent、Material、Carbon 或新组件库。Phase 17 是目标化演进，不重写信息架构与文案。

## 3. 当前基线审计

### 3.1 普通主窗口结构

`src/renderer/App.vue` 当前结构为：

```text
.app-window
└─ .app-shell
   ├─ FluidArtworkBackground
   ├─ .app-shell-bg-overlay
   ├─ AppSidebar
   ├─ .app-main -> RouterView
   ├─ NowPlayingPanel
   └─ PlayerBar
```

`FullscreenPlayerOverlay` 位于 `.app-shell` 外但仍在 `.app-window` 内。`MiniPlayer` 通过根级
`v-if` 复用同一个 BrowserWindow，却是独立 Renderer 模式。因此 shell marker 必须只挂在
普通模式分支，不得让 Miniplayer 继承 Phase 17 presentation。

### 3.2 当前 shell 视觉工作

普通模式当前始终执行：

1. 根据当前曲 `artworkCacheKey` 生成 artwork URL；
2. `useArtworkPalette()` 加载图片、绘制 48x48 canvas，并提交 worker 提取色板；
3. 将色板写入 `--auralis-window-chrome-*`；
4. 有封面时挂载 `FluidArtworkBackground`；
5. 挂载 `.app-shell-bg-overlay` 并执行 blur；
6. Sidebar 继续使用半透明背景、28px blur、渐变、发光与 shimmer。

仅用 CSS 把 canvas 或背景设为不可见并不能停止图片加载、worker、canvas 和 GPU 工作。Phase 17
必须从 presentation 派生真实执行门，而不是只做视觉遮盖。

### 3.3 Sidebar 信息架构与行为

`AppSidebar.vue` 当前包含：

| 区域     | 能力                             | 必须保持                                 |
| -------- | -------------------------------- | ---------------------------------------- |
| 品牌区   | AuralisMusic 标记与名称          | 品牌名称、DOM 语义与点击行为不变         |
| 工具区   | Facets、Miniplayer、Settings     | 顺序、快捷入口、title 与 aria-label 不变 |
| 主导航   | 全部歌曲、专辑、归档             | route、统计数量与乐观选中态不变          |
| 歌单区   | 普通与智能歌单混排               | 名称、曲目数、类型图标与空状态不变       |
| 指针交互 | 长按进入拖排、移动判断、释放写入 | 280ms 阈值、6px 容差和回退加载不变       |
| 播放交互 | 双击随机播放歌单曲目             | 队列与 shuffle pool 语义不变             |
| 管理交互 | 新建、右键、重命名、删除         | IPC、路由跳转、事件广播与错误语义不变    |
| 智能歌单 | Facets 与自然语言 query          | loading、error、disabled 和焦点行为不变  |

Sidebar 还维护以下生命周期资源：

- `auralis.library.onChanged()` 订阅；
- `auralis-playlists-changed` 事件；
- 全局 pointer move、up、cancel 监听；
- 乐观导航的临时 pointer 监听；
- 长按 timer 与拖排状态。

视觉风格切换不得重挂载 Sidebar，也不得中断这些状态和监听。

### 3.4 Sidebar 浮层现状

Sidebar 自有 Teleport 表面包括：

- 新建普通或智能歌单菜单；
- 歌单右键菜单；
- 重命名 Dialog；
- 自然语言智能歌单 Dialog；
- 删除确认 alertdialog；
- `FacetsDialog`；
- Facets 内的创建智能歌单右键菜单。

当前菜单复用 `.library-context-menu` 与 `LiquidGlassPanel`，Dialog 使用 `.smart-playlist-*`，
`FacetsDialog` 使用 scoped `.facets-*`。这些 class 名不能作为所有权边界。Phase 17 必须增加
`.sidebar-overlay` owner marker，并在 Teleport 根节点携带 presentation。

### 3.5 需要保留与退役的视觉模式

保留：

- 232px Sidebar 宽度与现有 shell grid；
- 原有导航、分组、工具和歌单顺序；
- 数量列、文本省略、内部滚动与窄高窗口适配；
- keyboard focus、pointer press、drag target 和危险操作层级；
- modern 下现有玻璃、色板、流体背景与动效。

只在 manuscript 分支退役：

- Sidebar 28px blur 与大面积玻璃透叠；
- 品牌文字渐变滑动；
- active link glow、shimmer 和装饰性高光；
- 应用级 `FluidArtworkBackground` 与 blur overlay；
- shell chrome 的封面色板提取与封面驱动过渡；
- owner 浮层的玻璃材质和无边界全局选择器依赖。

## 4. 目标与非目标

### 4.1 目标

1. `modern | manuscript` 在普通主窗口拥有唯一、明确的 shell presentation。
2. 手稿内容页之间导航时，Sidebar、主内容边界与背景保持视觉连续。
3. modern 外观与全部现有行为保持不变。
4. 手稿模式真正停止应用级流体背景与 shell chrome 色板计算。
5. 切回 modern 后背景与色板按当前曲恢复，不产生重复 worker、监听或陈旧结果提交。
6. Sidebar 全状态、全浮层和键盘路径在两种 presentation 下完整可用。
7. Phase 18-21 表面不继承 Phase 17 CSS 或状态 marker。

### 4.2 非目标

- 不改变 route、导航文字、歌单数据模型或 drag 算法。
- 不新增外壳视觉偏好、theme mode 或 PlayerBar material 的耦合。
- 不把 manuscript token 全局写入 `html`、`body` 或 `#app`。
- 不把 Sidebar 拆成新状态 store，亦不移动 IPC 到 Renderer 其他层。
- 不在本阶段重新设计主窗口尺寸、Sidebar 宽度或 xl breakpoint。
- 不为原生 Windows 标题栏制造 Renderer 替代品或 drag region。
- 不改造 `LiquidGlassPanel` 的全局默认外观，Sidebar owner 通过局部覆盖处理。

## 5. Presentation 契约

### 5.1 类型与纯 resolver

新增纯类型和 resolver：

```ts
export type ShellPresentation = 'modern' | 'manuscript'

export function resolveShellPresentation(
  displayMode: 'full' | 'mini',
  visualStyle: VisualStyle,
): ShellPresentation {
  return displayMode === 'full' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
```

实际 `displayMode` 类型名称以 `usePlayerDisplayMode()` 现有导出为准，不复制联合类型。纯函数必须
覆盖 full、mini、modern、manuscript 的组合测试。

### 5.2 根 marker

普通主窗口根节点：

```vue
<div
  v-else
  class="app-window"
  data-app-shell-root
  :data-shell-presentation="shellPresentation"
  :style="windowChromeStyle"
>
```

使用独立的 `data-shell-presentation`，不复用页面级 `data-visual-style`。理由：

- 页面 marker 表示特定 route 的 presentation；
- shell marker 表示普通主窗口 owner surface；
- PlayerBar、Now Playing 与 Fullscreen 即使是后代，也不属于 Phase 17；
- 独立命名可以让静态守卫明确禁止选择器越界。

### 5.3 CSS 所有权

建议新增：

```text
src/renderer/app/styles/manuscript.shell.css
src/renderer/app/styles/manuscript.sidebar.css
src/renderer/app/styles/manuscript.sidebar-overlays.css
src/renderer/app/utils/shellPresentation.ts
src/renderer/app/utils/shellPresentation.test.ts
```

规则必须以下列 owner scope 起始：

```css
.app-window[data-shell-presentation='manuscript'] .app-shell { ... }
.app-window[data-shell-presentation='manuscript'] .app-main { ... }
.app-sidebar[data-shell-presentation='manuscript'] { ... }
.sidebar-overlay[data-shell-presentation='manuscript'] { ... }
```

`AppSidebar` 自身也接收 `presentation` prop 并挂：

```vue
<aside class="app-sidebar" :data-shell-presentation="presentation">
```

不得新增以下规则：

```css
html[data-visual-style='manuscript'] { ... }
body.manuscript { ... }
#app .sidebar-link { ... }
[data-shell-presentation='manuscript'] .player-bar { ... }
[data-shell-presentation='manuscript'] .now-playing-panel { ... }
```

### 5.4 排除表面隔离

因为 PlayerBar 与 Now Playing 是 `.app-shell` 后代，CSS 不能使用宽泛后代规则覆盖所有 button、
input、panel 或 text。允许覆盖的 shell class 应列入静态白名单。

Phase 17 shell stylesheet 可触及：

- `.app-shell`；
- `.app-main`；
- `.app-shell-bg-fluid` 与 `.app-shell-bg-overlay` 的挂载边界；
- `.app-sidebar` 及明确 `.sidebar-*`；
- `.sidebar-overlay` 后代；
- `.facets-*`，但仅位于 `.sidebar-overlay` owner 下。

不得触及：

- `.now-playing-*`；
- `.player-bar*`、`.player-control*`、`.queue-*`、`.playback-mode-*`；
- `.fullscreen-*`；
- `.mini-player*`；
- `.desktop-lyrics-*`。

## 6. 昂贵视觉工作的执行门

### 6.1 Shell effect gate

派生：

```ts
const isModernShell = computed(() => shellPresentation.value === 'modern')
const shouldRenderShellArtwork = computed(() => isModernShell.value && !!artworkUrl.value)
```

仅当 `shouldRenderShellArtwork` 为 true 时挂载：

- `FluidArtworkBackground`；
- `.app-shell-bg-overlay`。

切到 manuscript 时 Vue 应卸载背景组件，使其内部 canvas、RAF、observer 或异步工作走现有 cleanup。
切回 modern 时以当前曲重新挂载，不保留 manuscript 期间的视觉帧。

### 6.2 色板计算必须支持 enabled

当前 `useArtworkPalette(artworkCacheKey)` 只要 key 改变就加载图片和执行 worker。Phase 17 应扩展为：

```ts
useArtworkPalette(artworkCacheKey, { enabled: isModernShell })
```

具体 API 可使用 `Ref<boolean>` 或 options 中的 `MaybeRefOrGetter<boolean>`，但须满足：

1. disabled 时不启动新的图片加载、canvas 或 worker 提取；
2. disabled 时递增 request token，阻止此前异步结果提交到 shell；
3. 已解析缓存可保留，不要求清空全局 LRU；
4. 再次 enabled 时立即按当前 key 读取缓存或启动一次计算；
5. 无 key 时回退 `FALLBACK_PALETTE`；
6. 其他调用方默认 enabled，避免静默改变 Album Detail、PlayerBar 或 Fullscreen 行为；
7. 增加针对 disabled、重新 enabled、key 竞态与陈旧结果的单元测试。

不应在 `useArtworkPalette` 内读取 `useVisualStyle()`。该 composable 仍是通用色板能力，是否启用由
shell owner 显式传入。

### 6.3 Window chrome 回退

manuscript 下 `windowChromeStyle` 使用稳定 token：

```text
--auralis-window-chrome-bg: var(--manuscript-page)
--auralis-window-chrome-accent: var(--manuscript-accent)
--auralis-window-chrome-border: var(--manuscript-rule)
```

实际 token 名以 `manuscript.tokens.css` 已有定义为准，不在 `App.vue` 硬编码新颜色。modern 继续使用
当前曲色板。原生标题栏仍由系统绘制，Phase 17 仅影响客户区背景变量。

## 7. 手稿视觉规范

### 7.1 应用外壳

- `.app-shell` 使用稳定纸张或档案底色，不显示封面流体图层。
- `.app-main` 保持透明或轻微纸面层级，让各 page owner 自身背景继续生效。
- Sidebar 与 main 之间使用单一实线或折页边界，不叠加 glow 和厚 shadow。
- 不更改 shell grid、底部 PlayerBar 占位或 Now Playing 的 xl 显隐。
- light 与 dark 主题继续由现有主题 token 决定，manuscript 不等于强制 light。

### 7.2 Sidebar 品牌与工具

- 保留 AuralisMusic 名称和现有标记，不改 logo 或文案。
- 品牌名称停止渐变滑动，使用稳定字色和字重。
- 品牌标记减少圆角、发光与弹性 hover，但保持可识别轮廓。
- 三个工具入口保持原顺序和可点击面积。
- Settings 选中态不能只靠颜色，需同时使用底纹、边线或字重。
- Miniplayer 工具只改变自身 hover 和 focus 外观，不把 mini 模式纳入 shell presentation。

### 7.3 导航与歌单树

- Section label 使用档案分组标题，不添加装饰性编号 eyebrow。
- 主导航与歌单继续使用相同对齐列：图标、名称、数量。
- active 状态使用稳定边标、墨色底纹和字重，不使用 glow、shimmer 或渐变扫光。
- hover 与 press 只使用背景、1px 位移或墨色变化，时长保持短且可关闭。
- 数量是信息，不做 pill badge；使用等宽数字或 tabular nums 对齐。
- 普通歌单与智能歌单仍由 Lucide 图标区分，不新增彩色状态点。
- 长名称保持单行省略并可通过现有 title 或可访问名称读取。

### 7.4 空状态与窄高窗口

- 无歌单时保留创建导向，但不显示大面积插画或营销文案。
- Sidebar 内部歌单区继续独立滚动，品牌区和主导航不随之滚走。
- 在窗口高度不足时，工具栏、主导航、歌单 header 和 PlayerBar 上缘不得互相覆盖。
- 232px 宽度不变，100%、125%、150% DPI 下名称列与数量列必须可读。

### 7.5 拖排状态

手稿样式必须表达：

- pointer pressed；
- long-press 后 dragging；
- drop before；
- drop after；
- 持久化失败后的列表回退。

before 和 after 使用单侧墨线或插入标记，不改变行高，避免拖动过程中布局抖动。样式切换不能重置
`pressedPlaylistKey`、`draggingPlaylistKey` 或 `dropTarget`。

## 8. Sidebar owner 浮层

### 8.1 Owner marker 传播

所有 Sidebar 发起的 Teleport 根节点使用：

```vue
<div
  class="sidebar-overlay"
  :data-shell-presentation="presentation"
>
```

`FacetsDialog` 增加 `presentation` prop，并在自身 Teleport 根 marker 上同时包含
`.sidebar-overlay`。其内部 context layer 不另建 visual state。

### 8.2 菜单

新建菜单与歌单右键菜单：

- 保持现有定位、视口夹取与 click-outside 行为；
- 可继续复用 `LiquidGlassPanel` 结构，但 manuscript owner 下覆盖为不透明纸面；
- 菜单项保持 Lucide、文字与危险操作层级；
- 不修改其他 library owner 的 `.library-context-menu` 外观；
- 不使用 `.library-context-menu[data-visual-style]` 冒充 Sidebar 所有权。

### 8.3 Dialog 与 alertdialog

重命名、query、删除和 Facets 必须覆盖：

- 初始 focus 与关闭后的合理 focus 恢复；
- Escape、backdrop、cancel 与 submit；
- input、textarea、placeholder、helper、error、disabled、loading；
- 危险按钮与普通主按钮；
- `role='dialog'` 或 `role='alertdialog'`、`aria-modal` 和可访问标题；
- query 长文本、三语 locale 与 100%-150% DPI。

Phase 17 不以视觉工作重写现有焦点模型，但若人工验收发现明确的 focus trap 或 focus return 缺口，
可在 Sidebar owner 内修复并增加测试，不能扩展为全局 Dialog 框架重构。

### 8.4 Facets 边界

`FacetsDialog` 是从 Sidebar 工具入口打开的 Sidebar owner 表面，因此属于 Phase 17。其筛选数据、
创建智能歌单逻辑与键盘事件保持不变。只增加 presentation prop、owner marker 和手稿样式。

## 9. 动效、可访问性与主题

### 9.1 动效

manuscript 下允许：

- hover / active 的短时颜色或 1px transform；
- Dialog opacity 与轻微位移；
- 拖排插入线状态变化。

manuscript 下禁止：

- Sidebar shimmer；
- 品牌渐变循环或弹性 glow；
- 应用级流体封面背景；
- perpetual pulse、float、marquee 或磁吸；
- 通过 `transition: all` 无差别动画布局属性。

`prefers-reduced-motion: reduce` 下所有非必要 transition 与 animation 停止，但 hover、focus、active、
drag 与 loading 的语义必须继续通过静态样式表达。

### 9.2 键盘与焦点

- 主导航和歌单保持 RouterLink 的 Enter 行为。
- Space 触发的乐观态不能滞留。
- 工具栏保留现有 toolbar aria-label。
- `:focus-visible` 在 paper、dark manuscript 与 modern 中均达到清晰对比。
- 焦点环不能被 `.app-sidebar` 的 `overflow: hidden` 裁掉。
- style toggle 后当前 focus、route 和 open overlay 保持。

### 9.3 主题与对比

- manuscript 继续兼容 light 和 dark theme，不自行覆写 ThemeMode。
- active、hover、disabled、danger、error 与 focus 至少达到 WCAG AA 可辨识要求。
- 选中态、智能歌单类型、drop position 不能只依赖颜色。
- `prefers-contrast: more` 下取消 blur，并增强边界与文本层级。
- `prefers-reduced-transparency: reduce` 下 modern 继续使用现有 solid fallback，manuscript 本身不依赖 blur。

## 10. 数据、状态与生命周期不变量

风格切换期间必须保持：

- 当前 route 与 Sidebar 乐观 active path；
- 当前播放曲目、播放状态、队列、shuffle pool 与双击随机播放；
- library stats 与 playlist items；
- 歌单顺序、拖排状态与持久化请求；
- 新建、重命名、删除、query 与 Facets 的输入和错误；
- 所有 IPC 订阅和 window event listener 数量；
- MiniPlayer display mode 与窗口状态同步；
- RouterView component key 和已有 route transition 语义。

禁止使用 `:key="shellPresentation"`、`v-if` 包裹整个 `AppSidebar` 或重新创建 playback composable 来
驱动换肤。

## 11. 国际化

Phase 17 原则上不需要新增可见文案。如果为可访问标题或状态补 key：

1. 先修改 `en` 与 `zh-CN`；
2. 使用现有 `locales:zh-hant` 生成流程；
3. 保持三语 key 一致；
4. 生成后执行第二次生成并确认幂等；
5. 不在生成后手改 `zh-TW`；
6. 对所有中文文件执行严格 UTF-8 字节解码。

## 12. 分步实施计划

### Step 17.0：关闭前置状态并冻结基线

工作：

1. 读取 Phase 15、16 DELIVERY 与路线图，按用户真实验收结果更新状态。
2. 记录起始提交、分支和 `git status --short`。
3. 明确工作树中 Phase 14、窗口框架或其他未提交改动的所有权。
4. 采集 modern shell 与 Sidebar 当前截图，至少包括有封面、无封面、歌单与浮层。
5. 执行进入门禁，不把已有失败归因于 Phase 17。

验收：

- Phase 15 已通过的人工验收不再标为待执行。
- Phase 16 未执行项不虚构通过。
- Phase 17 提交范围与既有工作树所有权可区分。

建议提交：

`docs：冻结 Phase 17 应用外壳基线`

### Step 17.1：建立 shell presentation 契约

工作：

1. 新增 `shellPresentation.ts` 与单元测试。
2. `App.vue` 读取唯一 `useVisualStyle()`。
3. 结合 full / mini display mode 派生 presentation。
4. 普通 `.app-window` 挂 `data-shell-presentation`。
5. `AppSidebar` 接收 presentation prop 并挂 owner marker。
6. 新增空的 shell、Sidebar、overlay 样式入口。

验收：

- full + manuscript 才解析为 manuscript。
- Miniplayer 始终不携带 Phase 17 marker。
- 切换风格不重挂载 Sidebar 或 RouterView。
- modern DOM 与视觉没有变化。

建议提交：

`feat：建立应用外壳视觉呈现契约`

### Step 17.2：停止手稿模式的 shell 封面视觉工作

工作：

1. 为 `useArtworkPalette` 增加默认开启的 enabled 契约。
2. 增加 disabled、reenable、key 竞态与陈旧结果测试。
3. App shell 仅在 modern 下启用 chrome palette。
4. 仅在 modern 且有封面时挂载 `FluidArtworkBackground` 与 overlay。
5. manuscript 使用稳定共享 token 回退。
6. 验证切回 modern 后当前曲色板与背景恢复一次。

验收：

- manuscript 下换曲不会触发 shell palette 图片加载或 worker。
- 切换中已发出的异步结果不会污染 manuscript chrome。
- modern、Album Detail、PlayerBar 和 Fullscreen 既有调用默认行为不变。
- 无重复 RAF、observer、worker request 或 listener。

建议提交：

`perf：手稿外壳停用封面视觉计算`

### Step 17.3：手稿化 shell 画布与主内容边界

工作：

1. 覆盖 `.app-shell` 纸面、层级与边界。
2. 覆盖 `.app-main` 与 Sidebar 分隔关系。
3. 保持 shell grid、PlayerBar 占位与 xl 断点。
4. 加入 light、dark、high contrast 与 reduced transparency 规则。
5. 静态检查禁止命中 Phase 18-21 class。

验收：

- 页面之间视觉连续，无背景闪烁。
- Now Playing 与 PlayerBar 仍是 Phase 18 现代外观。
- Fullscreen 与 Miniplayer 不受影响。
- Windows 原生标题栏保持系统行为。

建议提交：

`feat：连接手稿页面与应用外壳`

### Step 17.4：手稿化 Sidebar 骨架、品牌与主导航

工作：

1. 覆盖 Sidebar 材质、边框与内部滚动。
2. 覆盖品牌标记、品牌名称和工具栏。
3. 覆盖主导航 default、hover、active、press、focus 与数量列。
4. 移除 manuscript shimmer、glow 与品牌渐变动画。
5. 验证统计刷新和乐观导航状态。

验收：

- 三个主 route 与 Settings 工具选中态正确。
- pointer cancel、move、release outside 后 active path 回退正确。
- 统计变化不改变布局宽度。
- light、dark 与 reduced motion 均可辨识。

建议提交：

`feat：应用侧栏导航支持手稿呈现`

### Step 17.5：手稿化歌单树与拖排状态

工作：

1. 覆盖歌单 section header、数量、空状态与 add button。
2. 覆盖普通与智能歌单 default、hover、active 与 focus。
3. 覆盖 pressed、dragging、drop-before 与 drop-after。
4. 保持长按阈值、移动容差、排序 IPC 与失败回退。
5. 验证双击随机播放与右键不冲突。

验收：

- 长名称、0 曲、超大曲目数与混合语言可读。
- 拖排标记不改变行高。
- 风格切换不重置拖排或播放状态。
- pointer listener 和 timer 在 unmount 时清理。

建议提交：

`feat：歌单树与拖排支持手稿侧栏样式`

### Step 17.6：建立 Sidebar 浮层 owner scope

工作：

1. 为全部 Sidebar Teleport 根添加 `.sidebar-overlay` 与 presentation。
2. 覆盖创建菜单、右键菜单、rename、query 与 delete Dialog。
3. 为 `FacetsDialog` 增加 presentation prop 与 owner marker。
4. 覆盖 Facets loading、grid、option、selected、context menu 与 error。
5. 验证 focus、Escape、click-outside、submit、disabled 与 danger。

验收：

- 浮层在 modern 与 manuscript 下与触发 owner 一致。
- Sidebar CSS 不改变 Library、Albums、Archive 或 Settings owner 浮层。
- 打开浮层后切换风格时内容、焦点与输入保持。
- Dialog 可访问名称、role 与 aria-modal 完整。

建议提交：

`feat：侧栏浮层接入手稿所有权作用域`

### Step 17.7：扩展静态守卫与自动回归

工作：

1. 扩展现有 visual-scope script，或新增职责清晰的 shell scope script。
2. 检查唯一状态源、root marker、Sidebar prop 与 overlay owner marker。
3. 检查 shell CSS 不含 `html`、`body`、`#app` 或排除表面 selector。
4. 检查 manuscript 下 FluidArtwork 与 palette 均有执行门。
5. 检查 Miniplayer 分支无 marker。
6. 执行 locale、format、UTF-8 与完整自动门禁。

验收命令：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check <phase17-base>..HEAD
```

`git diff --check` 必须针对 Phase 17 实际提交范围，不能以提交后的空工作树替代交付 diff。

建议提交：

`test：固化应用外壳手稿作用域门禁`

### Step 17.8：Electron 人工矩阵与交付

人工矩阵：

1. modern 与 manuscript 各执行完整巡检。
2. light 与 dark theme。
3. 无播放曲、当前曲无封面、当前曲有封面、播放中与暂停。
4. 全部歌曲、普通歌单、智能歌单、专辑、专辑详情、归档、设置之间连续导航。
5. 主导航 pointer down、cancel、拖动离开、Enter 与 Space。
6. 歌单双击随机播放、右键、重命名、删除、新建普通歌单。
7. 长按拖排 before / after、排序成功与模拟失败回退。
8. 自然语言智能歌单空输入、解析失败、loading、disabled 与成功。
9. Facets loading、选择、清空、创建智能歌单与内部右键菜单。
10. 打开每种浮层时往返切换 visual style。
11. 100%、125%、150% Windows 缩放。
12. 宽度跨越 xl 两侧，确认 Now Playing 显隐不改变 Sidebar 几何。
13. 窄高窗口与长歌单滚动。
14. `prefers-reduced-motion`、`prefers-contrast: more` 与 reduced transparency。
15. Miniplayer 往返，确认其视觉未被手稿 shell 污染。
16. Fullscreen 往返，确认 Phase 19 表面未改变。
17. 快速换曲与连续 modern / manuscript 往返，观察色板、背景和资源恢复。
18. 三语 locale、长混合语言歌单名与数量对齐。

交付文档记录：

- 起止提交；
- 文件清单与所有权边界；
- 自动门禁真实输出；
- Electron 版本、Windows 缩放和测试矩阵；
- 必要截图；
- 未执行项、延期项和已知限制；
- Phase 18 的明确前置条件。

建议提交：

`docs：交付 Phase 17 应用外壳手稿化`

## 13. 预计文件变更

### 13.1 新增

- `docs/library-manuscript-skin-mvp/phase17/BASELINE.md`
- `docs/library-manuscript-skin-mvp/phase17/DELIVERY.md`
- `src/renderer/app/utils/shellPresentation.ts`
- `src/renderer/app/utils/shellPresentation.test.ts`
- `src/renderer/app/styles/manuscript.shell.css`
- `src/renderer/app/styles/manuscript.sidebar.css`
- `src/renderer/app/styles/manuscript.sidebar-overlays.css`
- 色板 enabled 契约的 colocated test，文件名按实现落点确定

### 13.2 修改

- `src/renderer/App.vue`
- `src/renderer/app/layout/AppSidebar.vue`
- `src/renderer/features/facets/components/FacetsDialog.vue`
- `src/renderer/features/playback/composables/useArtworkPalette.ts`
- `src/renderer/app/styles/main.css`，仅保留 modern 基线或导入新 stylesheet 所需的最小调整
- `scripts/check-library-visual-scope.mjs` 或新增 shell scope script
- `package.json`，仅在新增独立 scope script 时调整 test / lint 入口
- locale 文件，仅在确有新可见或可访问文案时
- `AGENTS.md`，Phase 17 完成后更新 shell 覆盖与排除边界
- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`

### 13.3 原则上不修改

- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`
- `src/renderer/app/layout/MiniPlayer.vue`
- `src/main/`、`src/preload/`、`src/shared/ipc/` 与数据库代码
- 已交付内容页 manuscript composition

若必须改动排除文件，只允许为显式隔离 Phase 17 marker 的最小防护，并在 DELIVERY 单列原因、diff
和回归结果。

## 14. 风险与解决方案

### 风险 1：宽泛 shell selector 提前换肤 Phase 18 表面

**表现**：`.app-window[data-shell-presentation] button` 命中 PlayerBar 或 Now Playing。

**解决**：只允许明确 `.app-shell`、`.app-main`、`.app-sidebar`、`.sidebar-*` 与
`.sidebar-overlay` 选择器，静态守卫禁止排除 class。

### 风险 2：CSS 隐藏背景但昂贵计算继续运行

**表现**：manuscript 下看不到流体背景，但仍加载图片、画 canvas 和调 worker。

**解决**：组件挂载门与 `useArtworkPalette(enabled)` 双门，测试 disabled 和 stale result。

### 风险 3：切回 modern 后背景不恢复或重复运行

**表现**：色板停留 fallback、出现旧封面颜色、重复 worker 或 RAF。

**解决**：enabled 变化参与 watch，request token 作废旧结果，重启只消费当前 key。

### 风险 4：视觉切换重挂载 Sidebar

**表现**：拖排、Dialog 输入、统计订阅或乐观 active state 丢失。

**解决**：presentation 仅作为 prop、data attribute 和执行门，不作为 component key 或 Sidebar v-if。

### 风险 5：复用 library context-menu 造成 owner 泄漏

**表现**：Sidebar 手稿规则改变 Library Page 自有菜单。

**解决**：所有 Sidebar Teleport 增加 `.sidebar-overlay`，样式必须以 owner scope 起始。

### 风险 6：Facets 被遗漏或重复定义状态

**表现**：Dialog 仍是玻璃现代样式，或组件内部读取新的 visual style ref。

**解决**：由 AppSidebar 传 presentation，Facets 只挂 marker，不读取或持久化视觉偏好。

### 风险 7：原生标题栏边界被误解

**表现**：新增 Renderer 窗口按钮或 drag region，破坏 Windows native frame。

**解决**：Phase 17 只调整客户区 token；标题栏和系统按钮维持 BrowserWindow 原生行为。

### 风险 8：Miniplayer 继承普通外壳 marker

**表现**：复用同一窗口时 MiniPlayer 被纸面 token 或 Sidebar CSS 污染。

**解决**：resolver 将 mini 固定为 modern，且 marker 只存在于普通模式分支；人工执行双向往返。

### 风险 9：工作树所有权混入

**表现**：Phase 14、窗口配置或其他用户改动被纳入 Phase 17 提交。

**解决**：17.0 冻结 status，按显式路径提交，DELIVERY 同时记录工作树门禁与 Phase 17 diff 门禁。

## 15. 回滚策略

Phase 17 以以下边界回滚：

1. 移除普通 `.app-window` 的 `data-shell-presentation`。
2. AppSidebar 恢复不接收 presentation prop。
3. 移除 shell、Sidebar 与 Sidebar overlay 三份 manuscript stylesheet。
4. `useArtworkPalette` 保留 enabled API 亦可，因为默认 enabled 向后兼容；若回滚 API，恢复原调用。
5. 恢复 FluidArtwork 与 overlay 的 modern 常驻挂载条件。
6. 不回滚 unique visual style state、Phase 1-16 页面覆盖或播放业务。

每个 Step 独立提交，使 presentation、性能门、shell、Sidebar、浮层和守卫可分别回退。

## 16. Definition of Done

满足以下全部条件后，Phase 17 才能标记为“工程完成”：

- 普通主窗口存在唯一 shell presentation，且只从 `useVisualStyle()` 派生。
- Miniplayer 不携带 Phase 17 marker。
- manuscript 下应用级 FluidArtwork、overlay blur 和 shell palette 计算真实停止。
- 切回 modern 后当前曲背景与色板恢复，无陈旧结果和重复工作。
- shell、main boundary、Sidebar 和全部 Sidebar owner 浮层完成手稿覆盖。
- Sidebar 导航、统计、歌单双击播放、拖排、新建、重命名、删除、query 与 Facets 行为保持。
- Now Playing、PlayerBar、Fullscreen、Miniplayer、桌面歌词和原生标题栏未被换肤。
- modern 视觉和行为保持基线一致。
- light、dark、reduced motion、high contrast、keyboard、focus、loading、empty、error、disabled 与 danger 完成。
- 静态守卫覆盖 root marker、unique state、owner scope、排除表面与昂贵计算执行门。
- 三语 key 一致，中文文件严格 UTF-8 解码通过。
- `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 通过。
- `git diff --check <phase17-base>..HEAD` 通过。

Electron 人工矩阵完成并记录后，Phase 17 才能从“工程完成”更新为“完全交付”，随后进入 Phase 18
Now Playing 与 PlayerBar 的独立拆解。
