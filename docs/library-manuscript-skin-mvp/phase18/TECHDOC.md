# TECHDOC：Now Playing 与 PlayerBar 手稿化（Phase 18）

- **文档状态**：待实施
- **日期**：2026-08-13
- **目标分支**：`script-skin-dev`
- **前置状态**：Phase 1-17 工程实现与 Electron 人工验收均已通过
- **后续阶段**：Phase 19 全屏播放器

## 1. 结论

Phase 18 覆盖普通主窗口内持续驻留的两个播放表面：右侧 Now Playing 歌词面板与底部
PlayerBar。实施采用独立的 player presentation 契约和 owner scope，不把 Phase 17 的
`data-shell-presentation` 直接当作播放器换肤开关。

手稿模式下，PlayerBar 从封面调色和玻璃材质转为稳定的档案控制台，Now Playing 从流体背景上的
磨砂歌词层转为纸面旁注栏。视觉变化不得改变播放引擎、队列、进度、音量、歌词同步、桌面歌词 IPC
或 PlayerBar 材质偏好的持久化语义。

Phase 18 只处理普通主窗口中的常驻播放表面。以下对象保持独立：

- `FullscreenPlayerOverlay.vue`，归 Phase 19；
- `MiniPlayer.vue` 与窗口尺寸控制，归 Phase 20；
- 桌面歌词独立窗口及其 drag、锁定、点击穿透和 DPI 行为，归 Phase 21 产品决策；
- Windows 原生标题栏；
- 主进程、preload、typed IPC、数据库与音频引擎。

## 2. 设计判断

这是既有桌面播放器的保留式重设计，面向高频键鼠用户，采用克制、紧凑、可读的档案手稿语言。

- `DESIGN_VARIANCE: 4`：保持现有三段播放控制结构，不重排产品信息架构；
- `MOTION_INTENSITY: 2`：只保留状态反馈和必要过渡，不增加装饰性循环动画；
- `VISUAL_DENSITY: 7`：常驻播放表面空间有限，信息紧凑但必须保持可操作尺寸；
- 设计基础：继续使用现有 Vue 3、UnoCSS、CSS 变量与图标体系，不引入新组件库；
- 主题策略：`modern | manuscript` 与 light / dark、PlayerBar material 三者保持正交；
- 字体策略：沿用共享 manuscript token，标题、歌词、控制标签按既有正文与 UI 字体职责分层。

手稿形态不是把现代玻璃层简单涂成米色，也不是用泛化复古装饰覆盖播放器。视觉重点是明确的纸面层级、
稳定的墨色对比、克制的暗红状态、可靠的数字对齐，以及不会干扰连续播放的低运动反馈。

## 3. 当前基线审计

### 3.1 普通窗口组合

`App.vue` 在非 `mini` 分支内依次渲染：

1. `AppSidebar`；
2. `RouterView` 主内容；
3. `NowPlayingPanel`；
4. `PlayerBar`；
5. `FullscreenPlayerOverlay`。

Phase 17 已在 `.app-window` 建立 `data-shell-presentation`，但明确阻止 manuscript token
重映射泄漏到播放器。Phase 18 必须新增播放器自己的 presentation，不得删除这层隔离。

### 3.2 PlayerBar 现状

`PlayerBar.vue` 同时负责：

- 上一首、播放或暂停、下一首；
- 当前曲封面、标题、艺人、专辑与进度拖动；
- 桌面歌词显示、点击穿透切换、状态 toast 与 IPC 同步；
- 队列 popover；
- 播放模式 menu；
- 静音与音量 range；
- 当前封面色板提取、album tint 交叉过渡；
- `cover-tint | liquid-glass` 材质偏好。

当前 `useArtworkPalette(currentArtworkCacheKey)` 始终启用。album tint watcher 即使视觉上被 CSS
覆盖，也会继续处理色板结果、维护前后 tint 并启动 420ms timer。手稿模式必须从执行源头停止这些
仅用于 PlayerBar 现代材质的工作。

### 3.3 PlayerBar 子表面

`TrackProgressInfo.vue` 维护进度的 rAF 订阅、pointer capture、键盘 seek 与封面打开全屏行为。
这些属于播放交互契约，不得因换肤重写。

`PlaybackQueuePopover.vue` 使用 `usePlaybackQueue()`，显示当前曲与后续曲目，保留 lazy artwork、
`decoding='async'`、Escape 关闭和当前项定位。

`PlaybackModeMenu.vue` 提供五种模式并支持 Escape。当前只具备基础 `role='menu'`，Phase 18 应补齐
打开后焦点、方向键、Home / End、选择后焦点回传等完整菜单模型。

队列和模式浮层目前不是 Teleport，但它们是 PlayerBar owner 表面。实现时仍应携带明确 owner marker，
避免未来迁移到 Teleport 后依赖 DOM 祖先偶然继承。

### 3.4 Now Playing 现状

`NowPlayingPanel.vue` 只包装 `LyricsPanel.vue`，在 `xl` 以下隐藏。歌词包含：

- 无曲、加载、空歌词、纯文本歌词与 LRC 状态；
- 自动跟随、用户滚动、点击或键盘 seek；
- `ResizeObserver` 与 transform 定位；
- active / inactive / blur filter 与 prelude dots；
- light / dark 主题 token。

`.has-artwork .now-playing-panel` 当前启用透明背景、blur 和 saturate。手稿模式必须取消这类现代材质，
但不能停止歌词时间轴、自动跟随、observer 或可访问操作。

### 3.5 应保留与退役的模式

应保留：

- 三段式 PlayerBar 信息架构与固定定位几何；
- 当前播放状态、队列与所有 composable；
- 进度 rAF 调度和 pointer / keyboard seek 精度；
- 歌词自动跟随、手动滚动与 seek；
- light / dark 主题；
- modern 下两种 PlayerBar material；
- 缺曲、缺封面、缺歌词和加载状态；
- 现有 locale 文案与可读 title / aria-label。

手稿分支应退役：

- PlayerBar album tint、封面 accent 和玻璃折射层；
- Now Playing artwork blur 与透明流光；
- 进度条 shimmer 和弹性放大；
- 仅为装饰的浮动、发光、过强阴影与连续运动；
- 依赖 `.app-shell`、`.has-artwork` 或全局 `--auralis-*` 重映射的宽泛换肤。

## 4. 目标与非目标

### 4.1 目标

1. 普通主窗口手稿模式下，Now Playing、PlayerBar 及其 owner 浮层形成连续档案语言。
2. 建立纯函数 player presentation resolver，并以显式 prop 传播到两个 owner。
3. 手稿模式真正停止 PlayerBar 色板提取、tint timer 与现代材质渲染。
4. modern 模式完整保留 `cover-tint | liquid-glass` 用户偏好和既有视觉。
5. 保持播放、seek、音量、队列、播放模式、歌词与桌面歌词行为不变。
6. 补齐 PlayerBar 浮层的键盘焦点、关闭与回传契约。
7. 通过 owner-scoped CSS、静态守卫、单元测试和 Electron 人工矩阵防止跨阶段泄漏。

### 4.2 非目标

- 不重新设计音频引擎、gapless、媒体会话或队列算法；
- 不修改曲库、播放历史、歌词解析或桌面歌词 typed IPC；
- 不改变 PlayerBar 固定定位、主要宽度公式或应用 grid；
- 不为 manuscript 新增第二套 player store 或 localStorage key；
- 不删除或改写 PlayerBar material 偏好；
- 不覆盖全屏、Miniplayer、桌面歌词独立窗口；
- 不新增 Renderer 自绘标题栏按钮或 drag region；
- 不借视觉阶段替换图标库或统一重写 `main.css`。

## 5. Player presentation 契约

### 5.1 类型与纯 resolver

新增 player presentation 纯函数，建议位置：

`src/renderer/app/utils/playerSurfacePresentation.ts`

建议契约：

```ts
export type PlayerSurfacePresentation = 'modern' | 'manuscript'

export function resolvePlayerSurfacePresentation(
  displayMode: PlayerDisplayMode,
  visualStyle: VisualStyle,
): PlayerSurfacePresentation {
  return displayMode === 'normal' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
```

resolver 必须满足：

| displayMode  | visualStyle  | player presentation | 说明                        |
| ------------ | ------------ | ------------------- | --------------------------- |
| `normal`     | `modern`     | `modern`            | 保留既有播放表面            |
| `normal`     | `manuscript` | `manuscript`        | Phase 18 覆盖               |
| `fullscreen` | 任意         | `modern`            | 全屏由 Phase 19 独立 owner  |
| `mini`       | 任意         | `modern`            | Miniplayer 由 Phase 20 决策 |

该函数只解析呈现，不读取 localStorage，不创建状态，不修改 `useVisualStyle()`。

### 5.2 App 传播

`App.vue` 计算一次 `playerPresentation`，通过 prop 传给：

- `NowPlayingPanel`；
- `PlayerBar`。

禁止让子组件重新调用 `useVisualStyle()`。禁止把 presentation 用作组件 `key` 或 `v-if`，否则会重挂载
歌词订阅、桌面歌词 IPC、队列浮层和播放控制。

### 5.3 Owner marker

建议根 marker：

```html
<aside class="now-playing-panel" :data-player-presentation="presentation">
  <footer class="player-bar" :data-player-presentation="presentation"></footer>
</aside>
```

浮层 marker：

```html
<div class="player-overlay queue-popover" :data-player-presentation="presentation">
  <div class="player-overlay playback-mode-menu" :data-player-presentation="presentation">
    <div class="player-overlay desktop-lyrics-toast" :data-player-presentation="presentation"></div>
  </div>
</div>
```

即使浮层当前处于 PlayerBar DOM 内，也要保留 owner class 与 marker。CSS 不依赖未来实现是否 Teleport。

### 5.4 CSS 所有权

建议新增：

- `src/renderer/app/styles/manuscript.player.css`：Now Playing 与 PlayerBar；
- `src/renderer/app/styles/manuscript.player-overlays.css`：队列、模式菜单、toast。

所有选择器必须以以下作用域之一开始：

```css
.now-playing-panel[data-player-presentation='manuscript']
.player-bar[data-player-presentation='manuscript']
.player-overlay[data-player-presentation='manuscript']
```

禁止以下模式：

```css
.app-shell[data-shell-presentation='manuscript'] .player-bar
.app-window[data-shell-presentation='manuscript'] .now-playing-panel
body[data-visual-style='manuscript']
#app .player-bar
```

Phase 17 marker 只决定 shell，Phase 18 marker 只决定 player。两者来源相同，但所有权不可合并。

### 5.5 排除表面隔离

静态规则必须禁止 manuscript player stylesheet 命中：

- `.fullscreen-*`；
- `.mini-player*`；
- `.desktop-lyrics-window`、`.desktop-lyrics-root`、`.desktop-lyrics-*` 独立窗口节点；
- `.app-sidebar`、`.sidebar-overlay`；
- 页面级 `.library-*`、`.albums-*`、`.album-detail-*`、`.archive-*`、`.settings-*`。

PlayerBar 内的桌面歌词按钮与短暂 toast 属于 Phase 18。桌面歌词独立窗口本体不属于 Phase 18。

## 6. 昂贵视觉工作的执行门

### 6.1 PlayerBar 色板 gate

`PlayerBar.vue` 应将 palette enabled 绑定到 modern player presentation：

```ts
const isModernPlayer = computed(() => props.presentation === 'modern')
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey, {
  enabled: isModernPlayer,
})
```

必须验证：

- 切到 manuscript 立即失效在途请求，palette 回退；
- manuscript 换曲不触发图片解码、canvas 或 worker 色板提取；
- 切回 modern 只为当前封面恢复一次计算；
- cache 仍可复用，不引入第二套色板管线；
- Fullscreen 的独立色板工作不受 Phase 18 gate 误伤。

### 6.2 Tint 状态与 timer

album tint、previous tint 和 420ms timer 只在 modern 下工作。进入 manuscript 时必须：

1. 清除 `albumTintTimer`；
2. 清空 `previousAlbumTint` 与 `activeAlbumTint`；
3. 不渲染 `.player-bar-album-tint-*`；
4. 使用稳定 manuscript accent，不从旧封面保留颜色。

切回 modern 时，根据当前 palette 恢复一次，不得出现旧封面闪回或重复 timer。

### 6.3 Material 偏好正交

`usePlayerBarMaterial()` 继续保存 `cover-tint | liquid-glass`。规则如下：

- modern：按偏好渲染；
- manuscript：视觉上使用 manuscript player material，不改写已保存偏好；
- manuscript 中切换设置页 material 只更新偏好，不应启动隐藏 palette 工作；
- 切回 modern 后恢复用户最后选择的 material。

不得增加 `manuscript` 作为 `PlayerBarMaterial` 第三个值，因为它是视觉风格，不是材质偏好。

### 6.4 Now Playing 生命周期

歌词的 `ResizeObserver`、自动跟随和 transform 不是现代装饰，而是功能基础。Phase 18 不停止这些工作。
仅取消 artwork blur、滤镜和装饰性过渡。歌词主动 seek、键盘 focus、用户滚动暂停自动跟随的语义保持。

## 7. 手稿视觉规范

### 7.1 PlayerBar 画布

- 保持固定位置、现有宽度、底部间距与三段布局；
- 采用实色纸面或深色纸面 token，不使用 backdrop blur；
- 使用单层细边框和克制的纸面阴影，不叠加玻璃高光；
- 控件圆角遵循 manuscript control token，不混用玻璃大圆角；
- light / dark 均通过共享语义 token 维持对比；
- 不使用封面色作为整条背景。

### 7.2 传输控制

- 上一首、播放或暂停、下一首维持原顺序和点击区域；
- 主播放按钮使用 manuscript stamp / accent 表达，不增加发光；
- hover 只改变墨色、底色或轻微位移；
- active 使用最多 1px 位移或轻微缩放；
- disabled、focus-visible、playing 与 paused 必须可辨；
- reduced-motion 下去除 transform 过渡，但保留即时状态反馈。

### 7.3 曲目信息与封面

- 保持封面点击和键盘打开全屏的行为；
- 封面采用薄边框和稳定半径，不增加投影 tilt；
- 标题单行省略，艺人和专辑保持现有 fallback；
- 缺封面用既有图标与中性底色；
- 无当前曲状态仍占据相同几何，避免 PlayerBar 跳动；
- 不改动 `loading='lazy'`、`decoding='async'` 或 artwork URL 管线。

### 7.4 进度

- 不改变 rAF 驱动、pointer capture、seek 步长或 aria-valuenow；
- 轨道与填充改为纸面细线和暗红标记；
- 移除 shimmer 与持续发光；
- hover 扩大可视高度不得改变实际命中或布局几何；
- 键盘 focus 必须有清晰环，不只依赖颜色；
- 时间数字使用 tabular nums，避免播放时宽度抖动。

### 7.5 音量与次级操作

- 静音、桌面歌词、队列、播放模式保留现有按钮布局；
- active 状态使用一致的 manuscript selected / stamp 语义；
- range thumb 在键盘 focus 和 pointer hover 下可见；
- 不改变音量持久化、最后可听音量或 mute 语义；
- 右键切换桌面歌词点击穿透的行为和说明保持。

### 7.6 Now Playing

- 面板继续仅在 `xl` 显示，不改变 grid breakpoint；
- 使用纸面旁注栏和单侧细分隔，不使用 artwork blur；
- active 歌词以墨色或暗红强调，inactive 保持足够对比；
- blur filter 在 manuscript 下关闭，避免以模糊表达层级；
- prelude dots 只表达真实等待状态，不增加装饰性循环；
- 无曲、加载、空歌词、纯文本和 LRC 五类状态必须完整；
- 长混合语言歌词、CJK、RTL 字符和连续空行不得破坏滚动。

## 8. Player owner 浮层

### 8.1 队列 popover

- 使用 `.player-overlay[data-player-presentation]`；
- 手稿形态采用档案抽屉或清单，而不是玻璃卡片；
- 当前曲与后续曲目层级明确，不用封面 accent 泄漏；
- 保持队列上限、当前 index、点击播放与 lazy artwork；
- 空队列、缺封面、长标题、滚动条与 active item 均覆盖；
- Escape 关闭后焦点回到队列按钮；
- 打开时焦点进入合理首项，Tab 不落入背后不可见区域。

### 8.2 播放模式 menu

- 保持 `role='menu'` 与 `role='menuitem'`；
- 打开后聚焦当前模式，若不存在则首项；
- ArrowUp / ArrowDown 循环移动；
- Home / End 到首尾；
- Enter / Space 选择并关闭；
- Escape 关闭并回到模式按钮；
- active、hover、focus-visible 不能只靠一个低对比颜色。

### 8.3 桌面歌词 toast

- toast 属于 PlayerBar owner，不属于桌面歌词窗口；
- 保留 1200ms timer 与原有文案；
- 手稿模式使用实色纸面和细边框；
- reduced-motion 下取消进入 transform；
- 不改变 IPC 调用、可见状态或点击穿透状态。

### 8.4 同时打开与互斥

应明确队列和模式菜单的互斥策略。建议打开一个时关闭另一个，避免两个浮层重叠并产生多个 document
keydown listener。无论是否采用互斥，都必须保证 outside pointer、Escape、焦点回传与卸载清理可预测。

## 9. 可访问性、动效与主题

### 9.1 键盘与焦点

Phase 18 至少覆盖：

- 所有 PlayerBar button 的可见 focus；
- 封面 Enter / Space 打开全屏；
- 进度条方向键 seek；
- 音量 range 原生键盘操作；
- queue dialog 的打开、Escape、Tab 与焦点回传；
- mode menu 的 roving focus、选择、Escape 与焦点回传；
- LRC 行的点击和键盘 seek；
- style 切换期间当前焦点不因重挂载丢失。

### 9.2 动效

保留的动效必须表达状态变化或操作反馈。允许：

- 100-160ms 的颜色或 opacity 状态切换；
- 播放按钮轻微按压反馈；
- popover 打开关闭的短 opacity 过渡；
- modern 既有 album tint 交叉过渡。

manuscript 下禁止：

- 进度 shimmer；
- album tint 交叉过渡；
- 玻璃高光扫动；
- 永久 pulse、float 或无语义 marquee；
- 新增 scroll listener 或触及 Vue state 的 rAF 循环。

`prefers-reduced-motion: reduce` 下，新增与既有被 Phase 18 触及的 player transition、animation 和
transform 反馈必须关闭或降为即时状态。

### 9.3 主题与对比

- manuscript light / dark 均使用共享 semantic token；
- 正文与按钮文字达到 WCAG AA；
- focus ring、active、disabled 在两种主题下可辨；
- high contrast 下去除透明和 blur，边框与焦点增强；
- `prefers-reduced-transparency` 下 modern liquid glass 仍保留既有实色回退；
- 不以纯白、纯黑或封面色作为唯一对比手段。

## 10. 数据、状态与生命周期不变量

Phase 18 不得改变：

1. `usePlayback()` 是唯一播放状态源。
2. `usePlaybackQueue()` 继续投影当前曲与后续曲目。
3. `useTrackLyrics()` 继续管理歌词加载、解析和活动行。
4. `usePlayerBarMaterial()` 继续独立持久化材质偏好。
5. 播放、暂停、上一首、下一首和全部播放模式语义。
6. gapless engine、音量、mute 与最后可听音量。
7. progress rAF scheduler、pointer capture、keyboard seek 与 aria 数值。
8. 队列当前项、点击播放、即将播放上限与队列边界。
9. 桌面歌词 toggle、visibility、mouse passthrough 与 payload 去重。
10. 图片 lazy / async、错误 fallback 与 artwork URL 管线。
11. route、搜索、选中、元数据刷新和曲库快照。
12. style 切换不重挂载 PlayerBar、Now Playing 或播放 composable。

所有 document listener、observer、timer、rAF subscription 和异步 palette 请求必须可清理或失效。

## 11. 国际化

Phase 18 原则上不新增可见文案。若补充 aria-label、状态或帮助文本：

1. 先修改 `zh-Hans.json` 与 `en.json`；
2. `zh-Hant.json` 走仓库生成链；
3. lint 校验三语 key parity；
4. 不把 `Unknown Title` 等内部 fallback 作为新增手稿装饰文案；
5. 不为了视觉改写现有产品语义。

当前歌词组件存在少量硬编码状态文案。若实施中决定修复，必须作为独立可访问性改动列入 Step 18.6，
不能静默夹在 CSS 提交中。

## 12. 分步实施计划

### Step 18.0：关闭前置状态并冻结基线

**主要文件**：

- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`
- `docs/library-manuscript-skin-mvp/phase15/DELIVERY.md`
- `docs/library-manuscript-skin-mvp/phase16/DELIVERY.md`
- `docs/library-manuscript-skin-mvp/phase17/DELIVERY.md`
- `docs/library-manuscript-skin-mvp/phase18/BASELINE.md`

**实施步骤**：

1. 按用户确认将 Phase 1-17 人工验收状态回填为通过。
2. 记录当前 HEAD、分支、工作树和 Phase 17 最终交付范围。
3. 记录 PlayerBar、Now Playing、歌词组件、Uno shortcuts、main.css 与测试基线。
4. 记录 Phase 9-11 容量门禁仍延期，不将其误写为 Phase 18 阻塞项。
5. 区分用户既有改动与 Phase 18 所有权。

**验收门槛**：前置状态真实、工作树边界可追踪，不补造截图或性能数字。

**建议提交**：`docs：冻结 Phase 18 播放表面基线`

### Step 18.1：建立 player presentation 契约

**主要文件**：

- `src/renderer/app/utils/playerSurfacePresentation.ts`
- `src/renderer/app/utils/playerSurfacePresentation.test.ts`
- `src/renderer/App.vue`
- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/app/layout/PlayerBar.vue`

**实施步骤**：

1. 实现纯 resolver 和四象限测试。
2. `App.vue` 计算一次并以 prop 传播。
3. 为 Now Playing 和 PlayerBar 添加 owner marker。
4. 不使用 `key`、`v-if` 或子组件局部 visual-style ref。
5. 验证 fullscreen / mini 永远解析为 modern。

**验收门槛**：切换 style 不重挂载播放表面，Miniplayer 与 Fullscreen 不继承 marker。

**建议提交**：`refactor：建立播放表面手稿呈现契约`

### Step 18.2：停止手稿模式的 PlayerBar 色板与材质工作

**主要文件**：

- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/features/playback/composables/useArtworkPalette.test.ts`
- 可选的 PlayerBar 纯状态 helper 与测试

**实施步骤**：

1. 将 `enabled: isModernPlayer` 传入 palette composable。
2. manuscript 关闭 tint watcher 的有效输出和 timer。
3. manuscript 不渲染 glass、album tint 或封面 accent layer。
4. 保留 material 偏好，不把 manuscript 写入 material store。
5. 切回 modern 恢复当前材质和当前封面一次。

**测试**：disabled 不加载、在途结果失效、重复切换无旧 tint、material 偏好不被改写。

**建议提交**：`refactor：为手稿 PlayerBar 关闭封面材质计算`

### Step 18.3：手稿化 PlayerBar 骨架与核心控制

**主要文件**：

- `src/renderer/app/styles/manuscript.player.css`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/TrackProgressInfo.vue`
- 必要时 `uno.config.ts`

**实施步骤**：

1. 新增严格 owner-scoped stylesheet。
2. 覆盖纸面画布、边框、阴影和三段布局视觉。
3. 覆盖传输按钮、封面、曲目信息、空状态。
4. 覆盖进度、focus、drag 与 tabular number 表达。
5. 覆盖静音、音量 range、次级操作和 disabled 状态。
6. 不改变 fixed geometry、seek 逻辑或组件状态。

**验收门槛**：900-1600px 宽度下不溢出，modern 两种 material 像素与行为无明显回归。

**建议提交**：`feat：PlayerBar 接入手稿档案控制台`

### Step 18.4：手稿化 Now Playing 歌词旁注栏

**主要文件**：

- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/features/lyrics/components/LyricsPanel.vue`
- `src/renderer/features/lyrics/components/SyncedLyricsView.vue`
- `src/renderer/features/lyrics/components/PlainLyricsView.vue`
- `src/renderer/features/lyrics/components/LyricsEmptyState.vue`
- `src/renderer/app/styles/manuscript.player.css`

**实施步骤**：

1. 在 owner scope 下取消 artwork blur 和透明流光。
2. 覆盖 active、inactive、prelude、empty、loading 与 plain 状态。
3. manuscript 关闭歌词 blur filter，但保留 transform 跟随。
4. 保留 `xl` breakpoint、observer、seek 与手动滚动语义。
5. 核验 light / dark、长混合语言歌词和缺歌词状态。

**验收门槛**：歌词同步和滚动无回归，切换 style 不重置 active line 或自动跟随状态。

**建议提交**：`feat：Now Playing 接入手稿歌词旁注栏`

### Step 18.5：建立 PlayerBar 浮层 owner scope

**主要文件**：

- `src/renderer/app/styles/manuscript.player-overlays.css`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/PlaybackQueuePopover.vue`
- `src/renderer/app/layout/PlaybackModeMenu.vue`

**实施步骤**：

1. 为 queue、mode menu、toast 传递 presentation 和 owner marker。
2. 手稿化清单、菜单、滚动条、空状态和当前项。
3. 队列与模式菜单采用明确互斥。
4. 打开时设置初始焦点，关闭时恢复触发器。
5. mode menu 实现 roving focus、Arrow、Home、End、Enter、Space、Escape。
6. 队列保留 lazy artwork 与现有播放投影。

**验收门槛**：鼠标、键盘和 outside pointer 路径一致，关闭后焦点稳定，无 document listener 泄漏。

**建议提交**：`feat：手稿化 PlayerBar 队列与模式浮层`

### Step 18.6：补齐可访问性、动效与 locale

**主要文件**：

- Phase 18 所触及的 player / lyrics 组件
- `src/renderer/locales/en.json`
- `src/renderer/locales/zh-Hans.json`
- 生成的 `src/renderer/locales/zh-Hant.json`

**实施步骤**：

1. 补齐所有 focus-visible、aria 与 role 契约。
2. 在 reduced-motion 下关闭新增和被触及的 player motion。
3. 在 high contrast 与 reduced transparency 下验证实色回退。
4. 若处理硬编码歌词状态，补齐三语并单列变更。
5. 验证无曲、缺封面、缺歌词、加载与失败路径。

**建议提交**：`fix：补齐播放表面键盘与低动效契约`

### Step 18.7：扩展静态守卫与自动回归

**主要文件**：

- `scripts/check-library-visual-scope.mjs`，或拆出更通用的 visual scope guard
- presentation resolver tests
- palette / focus helper tests
- 必要的 package scripts

**静态守卫至少检查**：

1. visual-style 仍只有一个状态与持久化源。
2. player presentation 由 App 解析并以 prop 传播。
3. `.player-bar` 与 `.now-playing-panel` 使用独立 marker。
4. player overlay 具备 owner class 和 marker。
5. manuscript player CSS 无 `html`、`body`、`#app` 和宽泛 shell selector。
6. stylesheet 不命中 Fullscreen、Miniplayer、桌面歌词独立窗口和页面 owner。
7. PlayerBar palette 使用 enabled gate。
8. material store 没有增加 manuscript 值或第二个 key。
9. style 切换不使用 presentation `key` 重挂载播放表面。
10. reduced-motion 规则能命中 Transition 或 animation 的真实根节点。

**自动门禁**：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check <phase18-base>..HEAD
```

**建议提交**：`test：固化播放表面手稿作用域门禁`

### Step 18.8：Electron 人工矩阵与交付

**人工矩阵**：

| 维度     | 必验组合                                                       |
| -------- | -------------------------------------------------------------- |
| 视觉     | modern / manuscript × light / dark                             |
| 材质     | modern 下 cover-tint / liquid-glass；manuscript 往返后恢复偏好 |
| 播放     | 无曲、播放、暂停、换曲、上一首、下一首、队列末端               |
| 进度     | pointer drag、cancel、键盘 seek、长曲、未知 duration           |
| 音量     | range、mute、恢复、键盘、0 / 中间值 / 100%                     |
| 队列     | 空、单曲、多曲、长标题、缺封面、滚动、点击播放、Escape         |
| 模式     | 五模式、方向键、Home / End、Enter / Space、Escape、焦点回传    |
| 歌词     | no-track、loading、empty、plain、LRC、prelude、seek、手动滚动  |
| 桌面歌词 | toggle、右键 passthrough、toast、窗口已开时换曲与换 style      |
| 响应式   | `xl` 两侧、900-1600px、窄高窗口                                |
| Windows  | 100% / 125% / 150% 缩放，原生标题栏保持                        |
| 往返     | modern ↔ manuscript 连续切换至少 20 次，期间播放与换曲         |
| 排除     | Fullscreen、Miniplayer、桌面歌词窗口不继承 Phase 18 样式       |
| 辅助     | reduced-motion、reduced-transparency、prefers-contrast         |

**性能观察**：

- manuscript 换曲不启动 PlayerBar palette worker；
- 切回 modern 只恢复当前封面一次；
- 无重复 document listener、observer、timer 或 rAF subscription；
- style 切换不重置播放、进度、歌词 active line、队列或音量；
- 不填写未测的耗时、内存或 GPU 数字。

**交付物**：

- `phase18/DELIVERY.md`；
- 实际起止提交；
- 自动门禁结果；
- Electron 人工矩阵真实结论；
- Findings 与修复提交；
- Phase 19 明确前置条件。

**建议提交**：`docs：交付 Phase 18 播放表面手稿化`

## 13. 预计文件变更

### 13.1 新增

- `docs/library-manuscript-skin-mvp/phase18/BASELINE.md`
- `docs/library-manuscript-skin-mvp/phase18/DELIVERY.md`
- `src/renderer/app/utils/playerSurfacePresentation.ts`
- `src/renderer/app/utils/playerSurfacePresentation.test.ts`
- `src/renderer/app/styles/manuscript.player.css`
- `src/renderer/app/styles/manuscript.player-overlays.css`
- 可选的 player focus helper 与测试

### 13.2 修改

- `src/renderer/App.vue`
- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/TrackProgressInfo.vue`
- `src/renderer/app/layout/PlaybackQueuePopover.vue`
- `src/renderer/app/layout/PlaybackModeMenu.vue`
- 必要的 `src/renderer/features/lyrics/components/*.vue`
- `src/renderer/features/playback/composables/useArtworkPalette.test.ts`
- `scripts/check-library-visual-scope.mjs` 或等价通用 guard
- 必要时 `uno.config.ts`
- locale 文件，仅在新增或修复可见文案时
- `AGENTS.md`，Phase 18 完成后更新 player owner 覆盖边界与验收要求
- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`

### 13.3 原则上不修改

- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`
- `src/renderer/app/layout/MiniPlayer.vue`
- `src/renderer/features/playback/composables/usePlayback.ts`
- `src/renderer/features/playback/audio/gaplessAudioEngine.ts`
- 桌面歌词窗口组件、主进程 controller 与 IPC contracts
- `src/main/`、`src/preload/`、数据库和 Repository / Service
- Library、Albums、Archive、Settings 页面 composition

如必须修改排除文件，只允许为显式隔离 Phase 18 marker 的最小防护，并在 DELIVERY 单列原因、diff
范围与人工验证。

## 14. 风险与解决方案

### 风险 1：复用 shell marker 造成阶段所有权耦合

**表现**：Phase 17 的 `.app-window` selector 直接命中 player，未来 Fullscreen 或 Mini 跟随 shell 泄漏。

**解决**：独立 resolver、prop、root marker 与 stylesheet，静态禁止宽泛 shell 后代选择器。

### 风险 2：只隐藏 tint，色板 worker 仍运行

**表现**：manuscript 换曲不可见地执行图片解码、canvas 和 worker。

**解决**：使用 `useArtworkPalette(..., { enabled })`，并测试在途失效与恢复一次。

### 风险 3：manuscript 改写 material 偏好

**表现**：切回 modern 后用户的 cover-tint / liquid-glass 选择丢失。

**解决**：presentation 与 material 正交，manuscript 只覆盖渲染，不写 store。

### 风险 4：style 切换重挂载 PlayerBar

**表现**：桌面歌词订阅重复、popover 状态丢失、进度与焦点重置。

**解决**：只传 prop 和 data marker，不使用 key / v-if 重建 owner。

### 风险 5：歌词 blur 与功能 transform 混淆

**表现**：为去除现代滤镜而破坏自动跟随或用户滚动偏移。

**解决**：只覆盖 visual filter，保留 SyncedLyricsView 的 transform、observer 和状态机。

### 风险 6：队列与菜单焦点模型不完整

**表现**：Escape 关闭后焦点丢失，Tab 落到背后，方向键无效。

**解决**：owner 内实现可测试的焦点 helper，保存触发器、初始聚焦、循环或菜单 roving focus、关闭回传。

### 风险 7：浮层未来 Teleport 后样式丢失

**表现**：CSS 依赖 `.player-bar` 祖先，迁移 DOM 后失去样式和主题。

**解决**：浮层根自带 `.player-overlay[data-player-presentation]`。

### 风险 8：进度和音量视觉调整改变命中几何

**表现**：drag 精度、键盘 seek、PlayerBar 高度或固定定位回归。

**解决**：只改 paint 和状态层，几何变化必须同步组件逻辑并单列测试，默认不改。

### 风险 9：桌面歌词按钮被误当成独立窗口覆盖

**表现**：为换按钮样式而修改 frameless window、drag region 或 passthrough IPC。

**解决**：Phase 18 只覆盖 PlayerBar 内按钮和 toast，独立窗口文件列入禁止范围。

### 风险 10：Fullscreen 被底层 player presentation 影响

**表现**：打开全屏时底层 PlayerBar 仍计算或 Phase 18 CSS 命中全屏节点。

**解决**：resolver 在 `fullscreen` 返回 modern，CSS 静态禁止 `.fullscreen-*`，Phase 19 单独设计。

### 风险 11：reduced-motion 选择器命不中组件根

**表现**：Transition class 与 owner class 在同一元素，后代选择器无法关闭过渡。

**解决**：按真实 DOM 使用同元素选择器，并由 source guard 固化。

### 风险 12：混合工作树权属污染

**表现**：其他阶段或用户改动被纳入 Phase 18 提交与 diff 范围。

**解决**：18.0 冻结 status 和基线，按显式文件提交，DELIVERY 记录固定哈希范围。

## 15. 回滚策略

Phase 18 必须保持可逐步回滚：

1. 回滚 18.5 可恢复现代浮层，不影响 PlayerBar 核心控制。
2. 回滚 18.4 可恢复现代 Now Playing，不影响 PlayerBar。
3. 回滚 18.3 可恢复现代 PlayerBar paint，presentation 契约仍可存在。
4. 回滚 18.2 恢复既有 palette / tint 工作，但必须确认性能行为回到基线。
5. 回滚 18.1 删除 player marker 与 prop，恢复 Phase 17 的播放器排除状态。

回滚不得删除 `useVisualStyle()` 用户偏好，不得改写 material 偏好，不得清空播放队列或数据库。

## 16. Definition of Done

满足以下全部条件后，Phase 18 才可标记为“工程完成”：

- player presentation 纯 resolver 和测试完成；
- Now Playing、PlayerBar 与 player overlays 使用独立 owner scope；
- manuscript 下 PlayerBar palette、album tint 和现代材质工作真正停止；
- modern 下 cover-tint / liquid-glass 完整保留；
- 播放、进度、音量、队列、模式、歌词和桌面歌词行为无回归；
- queue 与 mode menu 键盘、Escape、焦点回传完整；
- light / dark、reduced-motion、reduced-transparency、high contrast 有明确处理；
- Fullscreen、Miniplayer、桌面歌词独立窗口未被换肤；
- listener、observer、timer、rAF 和异步 palette 请求可清理或失效；
- locale 与 UTF-8 校验通过；
- `npm.cmd test`、typecheck、lint、build 和 Phase 18 diff check 通过；
- DELIVERY 记录固定提交范围、验证结果与未决项。

Electron 人工矩阵完成并记录后，Phase 18 才能从“工程完成”更新为“完全交付”，随后进入 Phase 19。
