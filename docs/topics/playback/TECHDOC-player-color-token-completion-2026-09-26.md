# TECHDOC：播放器颜色变量体系补全

- 日期：2026-09-26
- 状态：变量迁移与遗留收尾已实施；计算样式对比通过，应用整体视觉验收待完成。
- 更新：2026-09-27。第 1–8 节保留设计与实施计划，第 9 节记录实际交付。
- 基线：当前工作区源码，包含已有未提交修改。
- 适用规则：[Renderer 视觉与交互](../../rules/renderer.md)、[风险分级验收](../../rules/validation.md)。

## 1. 方案结论

在现有 `--auralis-*` 体系上补全播放器颜色管理：全局主题提供基础语义，播放器宿主定义局部配色，组件消费语义变量，封面取色继续通过宿主动态注入。共享回退色由一个纯数据模块维护，供 TypeScript 算法与构建期 CSS 输出共同使用。

第一轮实施保持当前深浅主题、迷你播放器和全屏播放器的实际外观。完成后，调整滑块、控件状态、材质或回退色时，可以定位到明确的定义入口；同一职责的颜色有统一来源，各播放形态仍保留各自的视觉设计。

范围覆盖普通 PlayerBar、队列与模式浮层、音量控件、MiniPlayer 及其浮层、FullscreenPlayerOverlay，以及这些界面消费的封面颜色回退。播放行为、布局几何、窗口管理和取色算法的计算规则保持现状。右侧 Now Playing、桌面歌词窗口与其他页面继续使用其现有配色；本轮只检查共享样式对它们的传播。

## 2. 当前实现与缺口

| 入口                                                                                               | 当前职责                                                                   | 待补全项                                                           |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [main.css](../../../src/renderer/app/styles/main.css)                                              | 深浅主题基础变量、`--auralis-playbar-*`、`--player-surface-*` 与播放器样式 | 滑块和部分交互样式仍直接写色值；播放器引用了侧边栏语义变量         |
| [uno.config.ts](../../../uno.config.ts)                                                            | 播放器 shortcut 消费主题变量                                               | `player-control-active` 等引用侧边栏变量，需要按实际使用方拆开职责 |
| [PlayerBar.vue](../../../src/renderer/app/layout/PlayerBar.vue)                                    | 封面取色、强调色对比度处理、局部动态变量注入                               | 保留动态链路，统一静态回退入口                                     |
| [MiniPlayer.vue](../../../src/renderer/app/layout/MiniPlayer.vue)                                  | `.mini-player-canvas` 定义局部深色主题，宿主与浮层共享动态强调色           | 按钮前景、金属材质、高对比度覆盖与 tooltip 配色仍有直接色值        |
| [miniPlayerPopover.css](../../../src/renderer/app/layout/miniPlayer/miniPlayerPopover.css)         | 迷你队列、模式、音量浮层样式                                               | 悬停与选中背景重复写值，多处携带字面量回退                         |
| [FullscreenPlayerOverlay.vue](../../../src/renderer/app/layout/FullscreenPlayerOverlay.vue)        | `.fullscreen-player` 局部文字、轨道、填充色与背景                          | 集中背景、歌词光晕和控件颜色；外部 SVG 图标有固定白色填充          |
| [resolvePlaybarAccent.ts](../../../src/renderer/features/playback/utils/resolvePlaybarAccent.ts)   | 深浅主题强调色回退和对比度计算                                             | 回退 RGB 与 CSS、调色板模块重复维护                                |
| [extractArtworkPalette.ts](../../../src/renderer/features/playback/utils/extractArtworkPalette.ts) | 提取调色板及 `FALLBACK_PALETTE`                                            | 统一同语义强调色来源，保留算法背景回退的独立职责                   |

[useTheme.ts](../../../src/renderer/composables/useTheme.ts) 当前支持 `light` 和 `dark`；PlayerBar 将 `isDark` 传入强调色解析函数。MiniPlayer 在局部设置 `color-scheme: dark` 并覆盖基础颜色；全屏播放器在自身根节点定义固定配色。

历史文档中的 dark-only、旧材质模式和浅色建议值属于历史背景。本方案以当前源码和实施前的计算样式为迁移基线。Renderer 规则中“PlayerBar 使用深色磨砂”的描述与当前浅色实现存在差异，变量整理沿用当前深浅分支，主题策略变更另行决策。

## 3. 变量分层与所有权

| 层级           | 定义位置                                                             | 内容与消费方式                                                                           |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 共享颜色数据   | 拟新增 `src/renderer/features/playback/utils/playerColorDefaults.ts` | 仅保存算法与 CSS 共用的 RGB 回退数据；无 DOM、Vue 状态或 IPC 依赖                        |
| 全局主题语义   | `main.css` 现有主题区                                                | 保留 `--auralis-text-*`、`--auralis-control-*`、`--auralis-progress-*` 等基础变量        |
| 普通播放栏材质 | `main.css` 现有 Playbar 区                                           | 保留 `--auralis-playbar-*` 与 `--player-surface-*`，补充实际缺失的控件角色               |
| 迷你宿主配色   | `MiniPlayer.vue` 的 `.mini-player-canvas` 变量块                     | 集中迷你界面的颜色与材质，供主体和 `MiniPlayerPopover` 继承                              |
| 全屏宿主配色   | `FullscreenPlayerOverlay.vue` 的 `.fullscreen-player` 变量块         | 集中全屏背景、文字、控件与歌词光晕                                                       |
| 动态封面变量   | 各宿主现有 computed/style 绑定                                       | 保留 `--auralis-active-album-accent`、`--auralis-active-album-tint` 的现有生成与更新时机 |

变量按使用职责命名。相同色值只有在职责也相同时才共用；滑块白色、文字白色和金属高光分别维护。已有变量能准确表达职责时直接复用。

组件局部覆盖基础语义变量是现有主题机制的一部分，继续保留。新增专用变量用于滑块、播放按钮、遮光层等基础变量无法准确表达的角色。局部颜色块与组件规则同文件维护，避免为每个界面再建立一份配色文件。

## 4. 控件与材质迁移

以下新增名称为拟定接口；实施时将定义和消费者在同一批次接通。

| 当前用色                            | 目标变量或入口                                                                             | 等值迁移要求                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `.track-progress::after` 的 `white` | 新增 `--auralis-player-slider-thumb`                                                       | 初值为 `#ffffff`，音量滑块共用；定义在共享滑块可访问的基础变量区               |
| 进度滑块投影                        | 新增 `--auralis-player-progress-thumb-shadow`                                              | 保留原阴影；与音量滑块不同的投影分别维护                                       |
| 音量滑块普通、悬停投影              | 新增 `--auralis-player-volume-thumb-shadow`、`--auralis-player-volume-thumb-active-shadow` | WebKit 与 Mozilla 规则消费同一组变量                                           |
| 播放器中的侧边栏静态强调色引用      | 新增 `--auralis-player-static-accent`                                                      | 按宿主与主题给出当前等值定义，供原侧边栏回退位置使用                           |
| 播放器中的侧边栏激活文字引用        | 新增 `--auralis-player-control-active-text`                                                | 保持该消费者当前颜色；已有封面强调色消费者继续消费动态 accent                  |
| 迷你播放按钮 `#121214`              | 新增 `--auralis-mini-primary-text`                                                         | 普通与播放状态共用；保持现有按钮前景选择策略                                   |
| 迷你浮层白色 8% 悬停背景            | 新增 `--auralis-mini-option-hover-bg`                                                      | 初值 `rgb(255 255 255 / 0.08)`，用于选项与音量按钮                             |
| 迷你浮层激活背景                    | 新增 `--auralis-mini-option-active-bg`                                                     | 初始别名指向 hover 变量，后续可独立调整                                        |
| 迷你主体与浮层的重复遮光渐变        | 新增 `--auralis-mini-artwork-scrim`                                                        | 统一完整渐变表达式，保留渐变位置与透明度                                       |
| 迷你金属按钮多层渐变与投影          | 宿主定义 `--auralis-mini-primary-*` 材质变量                                               | 按普通、播放、悬停状态组织完整材质；动态光照位置参数继续由现有 composable 提供 |
| 迷你高对比度面板背景与边框          | 宿主定义 `--auralis-mini-contrast-surface`、`--auralis-mini-contrast-border`               | 保留 `prefers-contrast: more` 的原选择器与优先级                               |
| 全屏背景 `#15181d`                  | 新增 `--auralis-fullscreen-bg`                                                             | 定义于全屏根节点，背景规则只读变量                                             |
| 全屏歌词白色光晕                    | 新增 `--auralis-fullscreen-lyrics-glow`                                                    | 保留当前光晕强度与现有文字色来源                                               |

金属渐变中的 `white`、`black` 表达提亮和压暗端点，可保留在集中材质定义内。遮罩黑色和液态玻璃位移图的通道值继续由各自算法维护。最终检查按颜色职责分类，避免把所有字面量都列为未完成项。

### 4.1 回退链

确定由宿主提供的变量直接使用 `var(--token)`。具有独立挂载需求的组件回退到已有基础变量，例如强调色使用 `var(--auralis-active-album-accent, var(--auralis-artwork-accent-fallback))`。

删除字面量回退前，逐个确认宿主、主题、浮层和降级路径均有定义。`#949499`、`#a0a0a5` 等近邻值按原角色迁移，不通过模糊色值匹配批量合并。

### 4.2 SVG 图标

全屏播放和上一首、下一首图标目前通过 `<img>` 加载 SVG，文件内 `fill="#ffffff"` 属于真实固定图标色。父元素的 `color` 或 `currentColor` 无法为外部图片内部填充建立继承。

本轮保留这些固定白色资产，并将它们列入明确的固定色例外。将图标接入主题需要改为内联 SVG 或 mask，同时验收尺寸、抗锯齿和悬停透明度，作为独立的图标适配任务处理。

## 5. 共享回退色的单一来源

`playerColorDefaults.ts` 只收敛已确认重复的强调色：深色 `{ r: 143, g: 167, b: 187 }`，浅色 `{ r: 120, g: 135, b: 121 }`。导出只读数据，消费者需要可变对象时复制。

TypeScript 侧由 `resolvePlaybarAccent.ts` 和 `extractArtworkPalette.ts` 引用。CSS 侧由 `uno.config.ts` 使用相对路径导入，通过 UnoCSS 的 `preflights` 输出两个带专用前缀的原始颜色变量：

```text
playerColorDefaults.ts
  ├─ resolvePlaybarAccent.ts / extractArtworkPalette.ts
  └─ uno.config.ts preflights
       ├─ --auralis-player-default-accent-dark
       └─ --auralis-player-default-accent-light
            └─ 各宿主的语义变量
```

两个原始变量在 `:root` 定义为 RGB 颜色值，仅承担共享常量出口。主题选择与局部覆盖仍留在现有 CSS 语义层；构建期输出不设置页面背景、文字或布局。正常首屏由静态 CSS 获得完整回退，无需等待组件挂载或运行时读取计算样式。

实现时确认当前 UnoCSS 版本的 `preflights` 接口、入口样式加载与构建类型检查覆盖。该方案新增的是现有 Uno 配置中的小型静态输出，不增加生成文件或额外构建脚本。仓库当前尚无这段输出。

迁移对象按语义限定：全局 `--auralis-artwork-accent-fallback`、播放器局部同语义别名，以及上述两个算法模块。其他页面里数值相同的颜色继续归各自所有者维护。

以下值保持独立：

- `FALLBACK_PALETTE.background` 是取色失败后的算法背景；它与 CSS 的背景回退当前数值不同，保持各自职责。
- `PLAYBAR_DARK_SURFACE_BOUND`、`PLAYBAR_LIGHT_SURFACE_BOUND` 是对比度计算的表面亮度边界，继续由强调色算法维护。材质发生变化时重新核对边界，不能直接以透明背景的 RGB 替代。
- `resolvePlayerPrimaryButtonTextColor.ts` 的两种前景是对比度候选；目前实际调用方包括 Archive 的 `RankingRecordShelf.vue`，播放器只通过另一导出使用亮度计算。本轮保持候选值与调用关系。

## 6. 宿主、主题与继承

普通 PlayerBar 保留深浅主题定义，队列、模式菜单和音量浮层继续共享其表面变量。移除播放器对 `--auralis-sidebar-active-*` 的依赖时，先记录每个主题下的实际值，再将这些值落到播放器语义变量，避免侧边栏调整带动播放器变色。

MiniPlayer 的配色定义继续位于 `.mini-player-canvas`。主体 `.mini-player` 与 `MiniPlayerPopover` 是该节点下的兄弟，变量放到主体上会使浮层失去继承。迷你窗口的 `.tooltip-overlay` 通过现有 `.mini-player-root` 专用规则维护；它的颜色定义保留在可实际到达该节点的作用域，不能依赖 canvas 后代关系。

全屏播放器通过 Teleport 展示，颜色变量定义在 `.fullscreen-player` 自身。它的进度与音量填充当前使用局部固定值；封面流动背景与控件强调色是不同链路，本轮保留这一关系。

`FluidArtworkBackground.vue` 还服务其他界面。其暗角与遮光色优先留在组件内的集中材质变量中，播放器仅在需要时通过宿主覆盖；改动默认值前检查全部调用方。液态玻璃、噪声和位移图的生成逻辑保持原有所有权。

## 7. 实施顺序

### 阶段一：记录基线并补齐静态角色

记录各宿主在深浅主题下的颜色、交互状态、媒体查询覆盖与内联变量。补充滑块、迷你控件、遮光层和全屏背景变量，逐个替换直接声明，保留现有级联顺序。

完成条件：迁移项均能追溯至集中变量定义；主体、浮层与 tooltip 的计算值与迁移前一致。

### 阶段二：统一共享回退来源

新增纯数据模块，接入两个算法消费者与 UnoCSS 静态变量输出；将同语义 CSS 回退改为别名。保留当前主题选择、无封面与取色失败分支的行为。

完成条件：共享深浅回退 RGB 各有一个数据定义，CSS 首屏与算法消费同源值，现有对比度测试保持通过。

### 阶段三：解除语义耦合并收尾

将播放器的侧边栏变量依赖迁移至播放器角色；检查共享 shortcut 的全部调用方，必要时仅在播放器作用域覆盖。逐项处理字面量回退，记录固定 SVG、遮罩和算法色等保留项。

完成条件：播放器配色调整不依赖侧边栏专用变量；每个剩余固定色都有明确用途。各阶段独立形成可审查差异，便于按迁移项恢复原定义。

## 8. 验证与交付

纯 CSS 迁移按轻微风险验收，检查本次差异并查看受影响状态。共享回退模块和 Uno 配置接线涉及计算与构建输出，增加对应定向测试和一次构建检查。

| 变更                     | 最小验证                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| 滑块、控件、材质变量替换 | 检查变量定义与引用；对照普通、悬停、拖动、禁用、键盘焦点状态                                    |
| 宿主局部配色             | 普通栏分别查看深浅主题；迷你和全屏分别确认局部配色；打开队列、模式、音量浮层及迷你 tooltip      |
| 动态与回退颜色           | 抽查无封面、取色失败、偏亮和偏暗封面，确认主题切换后强调色更新                                  |
| 对比度与降级规则         | 检查受影响的 `prefers-contrast: more`、`prefers-reduced-transparency` 和无 backdrop-filter 分支 |
| 共享常量与构建输出       | 运行已有强调色测试，检查生成 CSS 含两个原始变量，运行一次构建以验证 Uno 接线                    |

已有测试入口：

```powershell
npm.cmd run test:unit -- src/renderer/features/playback/utils/resolvePlaybarAccent.test.ts src/renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor.test.ts
```

只有在接入共享常量与 Uno 输出后执行构建：

```powershell
npm.cmd run build
```

若新增测试，优先覆盖 CSS 输出与算法的同源消费、深浅主题选择，以及浮层变量可达性；避免仅断言源码里出现了某个变量名。已有对比度测试验证算法边界下的比例，半透明材质上的实际可读性通过受影响界面确认。

完成交付列出实际迁移项、保留固定色及理由、验证结果和未验证状态。当前文档阶段进行源码核对、文档差异、链接与 UTF-8 检查；应用测试、构建和视觉验收留待实施阶段执行。

## 9. 实施记录与固定色登记（2026-09-27）

### 9.1 已迁移

共享深浅强调色已由 `playerColorDefaults.ts` 提供，算法与 UnoCSS preflight 同源消费。滑块、迷你浮层状态、遮光层、播放按钮材质、全屏背景和歌词光晕已接入各自语义变量；播放器交互消费者已改用播放器专用静态强调与激活文字变量。

本次收尾补充以下角色：

| 位置                      | 实际处理                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MiniPlayer.vue` 图标按钮 | `--auralis-mini-icon-hover-bg` 保持白色 12%；`--auralis-mini-icon-active-bg` 初始引用 hover 值，与浮层选项的白色 8% 分开维护                    |
| `MiniPlayer.vue` 封面     | 普通阴影、播放态阴影和焦点色分别集中为 `--auralis-mini-cover-shadow`、`--auralis-mini-cover-playing-shadow`、`--auralis-mini-cover-focus-color` |
| `main.css` 歌词锁定滑块   | `.desktop-lyrics-lock-pill` 内定义背景、边框、阴影变量，动态强调色在消费节点解析                                                                |
| 字面量回退                | 移除 MiniPlayer 文字 2 处、迷你浮层边框与轨道 2 处、播放栏降级背景与悬停文字 4 处，共 8 处；对应基础变量均在宿主或深浅主题中定义                |

金属按钮的 sweep、普通播放渐变和悬停渐变定义在 `.mini-play-button`，与内联 `--metal-*` 参数同节点解析。祖先节点保留静态颜色与使用宿主强调色的阴影。该分工保留了鼠标离开后重新生成光照参数的效果。

### 9.2 固定保留

以下项目继续使用固定色；后续调整按所属角色进行。

| 文件 / 选择器或入口                                             | 保留内容                                | 理由                                                                             |
| --------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `main.css` 深浅主题区、MiniPlayer canvas 与 tooltip、全屏根节点 | 文字、背景、边框、轨道等变量初值        | 这些位置是颜色定义入口，允许固定值；不同语义即使同色也分别维护                   |
| `MiniPlayer.vue` 金属材质变量                                   | 黑白高光、混色端点及透明度              | 表达金属材质；依赖动态位置的组合在按钮节点解析                                   |
| `FullscreenPlayerOverlay.vue` `.fullscreen-player-artwork`      | `0 30px 80px rgba(31, 35, 40, 0.18)`    | 全屏封面单次使用的固定投影                                                       |
| `miniPlayerPopover.css` `.mini-popover`                         | 白色 6% 内高光，以及背景混色的黑色端点  | 迷你浮层局部材质，保持当前强度                                                   |
| `main.css` `.desktop-lyrics-toast`、`.track-cover`              | 黑色 12% 与 8% 投影                     | 提示浮层与封面的不同投影角色，分别保留                                           |
| `main.css` `.player-bar`、队列与模式菜单的装饰规则              | 外壳阴影、白色 5% 内高光、白色 8% 渐变  | 原有材质声明；部分被后续统一表面规则覆盖或隐藏，保留当前级联，旧样式清理另行处理 |
| `FluidArtworkBackground.vue` 暗角层                             | 黑色和 `rgba(14, 17, 23, ...)` 遮光渐变 | 共享组件默认材质，本轮保持其他调用方的表现                                       |
| 全屏歌词 mask、`liquidGlassDisplacementMap.ts`                  | 黑色遮罩及 RGB 通道值                   | 表达透明度或位移数据                                                             |
| `features/playback/assets` 的三个 SVG                           | `fill="#ffffff"`                        | 外部图片固定填充；主题适配需要独立调整图标渲染方式                               |
| `FALLBACK_PALETTE.background`、表面亮度边界、前景候选常量       | 独立算法色值                            | 保留背景生成与对比度计算职责                                                     |

主页面 `::selection`、侧边栏和 Now Playing 的配色归各自界面维护，沿用本方案范围。固定色登记不要求所有消费者都增加一层变量。

### 9.3 验证记录

- 前次审查：4 个定向测试文件、17 项测试通过；UnoCSS 实际生成两个共享强调色变量。
- 金属按钮返工复查：隔离 Chromium 页面中，播放／暂停、模拟悬停及两组参数共 8 种组合，与迁移前计算样式一致；背景与扫光随参数变化。
- 本次收尾：使用修改前文件快照与修改后样式，在隔离 Chromium 页面比较深浅主题、两种强调色、普通／播放／模拟悬停／焦点状态，共 16 种组合，每组检查 8 个元素的颜色、背景、边框、阴影与焦点色，结果一致。
- 本次未运行应用测试或完整构建；未进行应用整体视觉验收。上述计算样式验证使用隔离 DOM 和模拟状态类，不代表真实窗口、鼠标事件和媒体查询切换验收。
- 提交前补充验证：`npm.cmd run build` 通过，包含语言键检查、类型检查、主进程／Preload／Renderer 构建及产物预算检查。构建基于当前工作区，包含未纳入本次提交的侧边栏、Now Playing 与 Archive 既有修改。

后续视觉确认覆盖实际迷你窗口按钮与封面、歌词锁定浮层、主题切换，以及降低透明度和高对比度状态。
