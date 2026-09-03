# TECHDOC：设置页手稿化与集中外观入口（Phase 16）

- **文档状态**：完全交付；Electron 人工验收通过（2026-08-13）
- **编写日期**：2026-08-13
- **目标路由**：`settings` / `/settings`
- **唯一视觉偏好源**：`useVisualStyle()` / `auralis-visual-style`
- **前置状态**：Phase 15 工程实现与自动门禁已完成；实施前按真实结果关闭或继续标注其 Electron 人工矩阵

## 1. 结论

Phase 16 只覆盖 `settings` 路由，并把视觉风格选择收口到设置页的外观分区。设置页将成为用户理解和管理 `modern | manuscript` 的稳定入口，但不会把视觉偏好提升为未经设计的全局皮肤，也不会在本阶段修改 Sidebar、应用外壳、Now Playing、PlayerBar、Miniplayer、全屏播放器或桌面歌词。

实现采用“保留式重构”：保持现有四个设置分区、默认选中的音乐资料库分区、所有 IPC、播放设置、语言设置、扫描与元数据刷新状态机不变，只增加显式 presentation、外观选择控件、页面内手稿样式和静态作用域守卫。

设计方向是克制的档案管理界面，不是营销页或复古装饰页：

- `DESIGN_VARIANCE = 4`：保留清晰的左侧分区导航与右侧内容结构，不追求不对称展示。
- `MOTION_INTENSITY = 2`：动效仅用于焦点、按压、展开和任务状态；手稿模式停止 shimmer、发光与无语义漂移动画。
- `VISUAL_DENSITY = 6`：设置项、路径、状态和任务数据保持紧凑可扫描，不把每个字段包装成独立大卡片。
- 沿用现有手稿纸张、墨色、暗红强调、衬线正文与无衬线控件体系，不引入新设计系统、第三方组件库、图标库或字体。

Phase 16 预计不需要数据库迁移、Repository、Service、typed IPC、preload 或主进程改动。若实施时发现必须修改这些层，应暂停并重新审查范围，不能把功能变化伪装成视觉覆盖。

## 2. 当前基线

### 2.1 页面结构

`SettingsPage.vue` 当前由四个本地分区组成：

| 分区       | 当前能力                                         | 状态来源                                 |
| ---------- | ------------------------------------------------ | ---------------------------------------- |
| 外观       | 固定深色主题说明、语言、PlayerBar 材质           | `useLocale()`、`usePlayerBarMaterial()`  |
| 播放       | 无缝播放开关                                     | 现有 `usePlayback()`                     |
| 音乐资料库 | 目录选择、扫描、取消、进度、元数据补全、失败记录 | typed IPC 与 push 事件                   |
| 关于       | 版本、数据库路径、复制反馈                       | `auralis.app.getInfo()` 与 Clipboard API |

页面使用本地 `selectedSection`，默认值为 `library`。外观的语言和 PlayerBar 材质已经实现 `radiogroup`、roving tabindex、方向键、Home 和 End 键操作；无缝播放使用 `role="switch"`。

`MusicLibrarySettings.vue` 是独立子组件，并在挂载时订阅：

- `auralis.library.onScanProgress`
- `auralis.metadata.onRefreshProgress`

组件卸载时会取消订阅。视觉风格切换不得通过 `v-if`、动态 `key` 或路由刷新重建该组件，否则会中断界面中的任务连续性并增加重复订阅风险。

### 2.2 当前视觉特征

现代设置页已经包含：

- 230px 分区导航与响应式横向导航；
- 玻璃感列表、圆角卡片、渐变标题、active glow 与 nav shimmer；
- 语言和 PlayerBar 材质 segmented control；
- 状态点、进度条、旋转图标、错误区和失败记录展开区；
- 820px 与 560px 两级响应式布局；
- 部分 `prefers-reduced-motion` 规则。

这些现代样式属于既有产品基线。Phase 16 必须保证 `modern` 仍保持原有外观和行为；手稿样式通过 settings owner scope 覆盖，不重写现代基础样式。

### 2.3 当前缺口

1. `settings` 路由没有自己的 presentation resolver，也没有 `data-visual-style` 页面标记。
2. 设置页没有 `useVisualStyle()` 的集中入口，用户仍需前往已覆盖内容页切换风格。
3. 外观区的“深色主题”和 PlayerBar 材质容易与页面视觉风格混为同一概念。
4. 手稿 token 没有由 Settings 页面显式消费，设置控件仍全部使用现代玻璃、圆角和发光语法。
5. 扫描、元数据刷新、失败记录、复制反馈、loading 和 disabled 状态尚无手稿表达。
6. 当前 nav shimmer、页面进入动画与部分 hover transform 没有被现有 reduced-motion 规则完整停止。
7. 现有静态视觉守卫未检查 `settings` route、Settings 页面作用域或未来 Settings overlay owner。

## 3. 目标、非目标与稳定行为

### 3.1 目标

- `settings` route 在保存偏好为 `manuscript` 时解析为手稿，在 `modern` 时保持现代。
- 外观分区提供可发现、可键盘操作、可本地化的视觉风格选择器。
- 设置页四个分区在两种 presentation 下均完整可用。
- 手稿模式覆盖导航、标题、设置行、开关、单选组、路径、任务进度、错误和失败记录。
- 风格切换不重建分区内容，不重置当前分区，不重新请求 app info，不中断扫描或元数据刷新。
- 页面和未来 Renderer 浮层都具备明确 owner scope，静态守卫可阻止规则泄漏。
- 补齐 reduced-motion、焦点、禁用、加载、错误与窄宽度验收。

### 3.2 非目标

- 不覆盖 Sidebar、主内容外壳、Now Playing、PlayerBar、Miniplayer、全屏播放器和桌面歌词。
- 不新增 light / dark 主题切换；当前应用固定深色主题的产品事实保持不变。
- 不把 PlayerBar 材质并入 `VisualStyle`，也不改变其 localStorage key。
- 不改变无缝播放、语言、目录选择、扫描、取消扫描、元数据刷新和复制路径语义。
- 不新增目录、扫描或元数据 IPC，不改变数据库 schema。
- 不修改操作系统原生目录选择器的外观；它不属于 Renderer DOM。
- 不把设置页样式提升到 `html`、`body`、`#app`、`.app-window`、`.app-shell` 或通用 `button/input`。
- 不为 Phase 17 提前实现 Sidebar 或 shell presentation。
- 不为 Phase 18 提前改变 PlayerBar 的实际材质、色板提取或流体效果。

### 3.3 必须保持的行为

- `selectedSection` 在视觉风格切换前后保持不变，默认仍为 `library`。
- 语言和 PlayerBar 材质的 roving tabindex、方向键、Home、End 与焦点回传保持不变。
- 无缝播放开关只更新现有 playback composable，不中断当前曲目。
- 目录选择继续调用 `auralis.library.selectRoot()`；取消原生 picker 不显示错误。
- 扫描的开始、取消、push progress、完成后刷新 roots 逻辑保持不变。
- 元数据补全任务、失败记录展开与清除行为保持不变。
- About 的版本、数据库路径、loading、读取失败和复制反馈保持不变。
- 改变 locale 后，当前分区和当前视觉风格都不改变。
- PlayerBar 材质改变后，设置页控件反映新值，但 PlayerBar 本身仍由现有实现消费该偏好。

## 4. 目标架构

### 4.1 显式 route presentation

新增 Settings 自有纯函数，不复用 Library、Albums 或 Archive resolver：

```ts
export type SettingsPresentation = 'modern' | 'manuscript'

export function resolveSettingsPresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): SettingsPresentation {
  return routeName === 'settings' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
```

建议文件：

- `src/renderer/features/settings/types/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.test.ts`

约束：

- 只按 Vue Router 的精确 route name 判断，不按 `/settings` 字符串、path prefix 或 route meta 推断。
- `settings` 以外的 route、相似字符串、`null` 和 `undefined` 都返回 `modern`。
- resolver 不读取 router、localStorage、i18n、DOM 或 IPC。
- `SettingsPage.vue` 是唯一消费 route 与 `visualStyle` 的边界；所有子组件接收解析后的 presentation 或通过有界祖先选择器呈现。

### 4.2 页面根作用域

`SettingsPage.vue` 根节点增加：

```vue
<section class="settings-page" :data-visual-style="settingsPresentation">
```

Settings 手稿规则必须从以下选择器开始：

```css
.settings-page[data-visual-style='manuscript']
```

建议新增：

- `src/renderer/features/settings/styles/manuscript.css`

由 `SettingsPage.vue` 显式导入共享 `manuscript.tokens.css` 与本页 `manuscript.css`。不得把 Settings 规则写入 Library、Albums、Archive 样式或 `main.css`。

### 4.3 集中视觉风格入口

外观分区新增专用 `VisualStylePreference.vue`，建议放在：

- `src/renderer/features/appearance/components/VisualStylePreference.vue`

它与现有浮动 `VisualStyleSwitch.vue` 共享同一个 `useVisualStyle()`，但承担不同展示职责：

- `VisualStyleSwitch` 继续作为已覆盖内容页的紧凑快捷入口。
- `VisualStylePreference` 是设置页中的说明性偏好控件，展示当前选择、两种样本和覆盖边界。
- 两者不得复制状态 ref、storage key 或初始化逻辑。

建议控件契约：

```ts
const { visualStyle, setVisualStyle } = useVisualStyle()

type VisualStyleOption = {
  value: VisualStyle
  labelKey: string
  descriptionKey: string
}
```

交互要求：

- 使用 `role="radiogroup"` 与两个 `role="radio"` 选项。
- 选中项 `aria-checked="true"` 且 `tabindex="0"`，另一项为 `-1`。
- 支持 ArrowLeft、ArrowRight、ArrowUp、ArrowDown、Home、End。
- 键盘改变选项后把焦点移动到新选中项。
- 点击和键盘都只调用 `setVisualStyle()`。
- 切换时不路由跳转，不重载页面，不修改语言、主题或 PlayerBar 材质。

视觉样本不是伪造应用截图。它们应是语义明确的纸张与排版样本：

- modern：现有深色、紧凑、柔和圆角与材质层级。
- manuscript：纸页、墨色、细边框、档案标签与克制暗红强调。
- 样本只用于比较页面视觉语言，不暗示 Sidebar、PlayerBar 或尚未覆盖表面已经换肤。

### 4.4 外观概念分层

外观分区需要明确区分三个独立设置：

| 概念           | 当前值        | 状态源        | Phase 16 处理            |
| -------------- | ------------- | ------------- | ------------------------ | ------------------ |
| 页面视觉风格   | `modern       | manuscript`   | `useVisualStyle()`       | 新增集中入口       |
| 应用主题       | 当前固定 dark | 现有主题事实  | 只说明，不新增切换       |
| PlayerBar 材质 | `cover-tint   | liquid-glass` | `usePlayerBarMaterial()` | 保持现有控件与行为 |

推荐顺序：视觉风格、界面语言、PlayerBar 材质、固定深色主题说明。视觉风格是外观区的主要选择，但不能用“全局主题”描述，也不能宣称未覆盖表面会立即改变。

### 4.5 手稿信息架构与视觉规则

手稿模式保持当前两栏信息架构，不复制一套模板。具体规则：

#### 页面与标题

- 页面内容区表现为档案册中的“偏好登记簿”，但不增加无功能封面页。
- 标题使用现有 manuscript body 字体与层级，取消现代渐变文字。
- eyebrow 只保留一处，避免每个 section 都增加编号或装饰性微标签。
- 页面背景、边框和阴影使用共享 token，不定义第二套纸张 palette。

#### 分区导航

- 保留四个分区与原顺序，不改变 label、默认项或导航方式。
- active 状态使用左侧细标记、墨色加深或暗红印记之一，不叠加 glow。
- 停止 active shimmer、hover 平移和图标缩放。
- 选中状态不能只依赖颜色；边框、标记或字重同时表达。
- 窄宽度仍转为横向可滚动导航，不改成汉堡菜单或 Dialog。

#### 设置列表与控件

- 以登记行、分隔线和留白分组，避免把每一项变成独立大圆角卡片。
- segmented control 使用纸面选项、细边框和明确选中标记。
- switch 保留现有尺寸与语义，可改为档案滑块表达，但不得改变 hit target 或 checked 逻辑。
- 所有 button、radio、switch、failure toggle 必须有可见 `:focus-visible`。
- disabled 状态使用 token 降低对比，同时保留可辨识边框和文本，不使用 `display: none` 代替。
- active 反馈可以使用轻微位移或明暗变化，不新增弹簧、磁吸或循环动画。

#### About 与路径

- About mark 从现代发光徽标改为克制馆藏章记，但 Auralis 名称和现有文案不变。
- 数据库路径保持 LTR、等宽字体、单行省略和复制按钮。
- copied、failed、loading、unavailable 都必须有文本，不只使用图标或颜色。

### 4.6 音乐资料库任务状态

`MusicLibrarySettings.vue` 继续拥有全部数据与任务状态。Phase 16 只从父页面 presentation 作用域改变视觉，不移动 IPC 或订阅。

必须覆盖：

- 未选择目录；
- 已选择目录、从未扫描；
- scanning、queued、completed、canceled、failed、unknown；
- 选择目录与开始扫描的 loading / disabled；
- 实时文件数、失败数和百分比；
- 取消扫描；
- 元数据刷新 processing、completed、failed；
- refresh failure 折叠与展开；
- 清除失败记录 loading 与错误；
- 长路径、空路径 fallback 与未知 track id。

视觉要求：

- 真实任务状态点可以保留，因为它具有语义，不属于装饰性圆点。
- 进度必须继续显示数值和文本，不只依赖进度条宽度。
- 手稿进度可表现为登记线或填充刻度，不改变 `progressPercent` 计算。
- reduced-motion 下停止 progress shimmer 和 spinner 旋转，状态文本与数值仍持续更新。
- 错误使用 inline error，不以临时 toast 取代。
- failure reason 和 file path 继续显示真实数据，不翻译、截断或改写内部值。

### 4.7 原生 picker 与未来 overlays

当前 `auralis.library.selectRoot()` 打开的是操作系统原生目录选择器。它不在 Renderer DOM 中，Phase 16：

- 不尝试给原生 picker 注入 CSS；
- 不新增自绘目录浏览器；
- 不改变 main / preload / typed IPC；
- 只保证 picker 打开前后的 loading、disabled、取消和错误反馈在两种 presentation 下正确。

当前 Settings 页面没有自有 Teleport overlay，因此本阶段不应为了“owner scope”凭空增加 overlay。若实现过程中确实新增 Renderer Dialog、popover 或 tooltip，则必须：

```html
class="settings-overlay" data-visual-style="modern|manuscript"
```

并将手稿规则约束在：

```css
.settings-overlay[data-visual-style='manuscript']
```

Sidebar 的歌单 Dialog、Library overlay、Albums overlay 和播放器 popover 不属于 Settings owner。

### 4.8 动效与生命周期

Phase 16 不新增定时器、observer、RAF、图像解码或 canvas 管线。风格切换应是 CSS presentation 变化。

必须补齐 `prefers-reduced-motion: reduce`：

- 停止 settings page / section enter transform；
- 停止 nav shimmer；
- 停止 hover translate、icon scale 和 about logo rotation；
- 停止 segmented option、switch 和 thumb 的非必要 transition；
- 停止 scan spinner 与 progress shimmer；
- 展开失败记录不增加高度弹簧动画。

正常模式下也不增加持续循环装饰动效。扫描 spinner 和进度 shimmer只在真实任务运行时存在。

### 4.9 国际化与生成链

三语 locale 同步新增 Settings 视觉风格文案，至少包含：

- 视觉风格标题与说明；
- modern label 与说明；
- manuscript label 与说明；
- 覆盖边界说明，明确播放器和外壳分阶段开放；
- visual style radiogroup aria label；
- 必要的当前选择或预览 aria 文案。

建议把通用视觉风格名称逐步收口到 `appearance.visualStyle` 或现有 appearance 域，不继续新增 `library.visualStyle` 的页面专属副本。若迁移现有 key，会影响多个已覆盖页面，必须作为独立机械步骤完成并由 locale parity 与静态守卫保护；若风险过大，本阶段可保留旧 key，并只为 Settings 新增说明性 key。

`zh-Hant.json` 是生成物。所有简中源文案与 `scripts/zh-hant-overrides.json` 必须保证执行 `npm.cmd run locales:zh-hant` 后幂等，禁止 build 后手工恢复繁中措辞。

## 5. 分步实施计划

### Step 16.0：关闭前置状态并冻结基线

#### 修改范围

- 更新 `DELIVERY-ROADMAP.md` 中 Phase 15 / Phase 16 的真实状态。
- 新建 `phase16/BASELINE.md`。
- 记录起始提交、`git status --short`、Phase 14 与其他未提交改动所有权。
- 记录 Phase 15 Electron 人工矩阵是否已完成，不补写未执行结果。

#### 验收门槛

- Phase 15 状态与实际人工验收一致。
- Phase 9 至 11 的 10k / 50k 容量延期项继续可追踪。
- Phase 14、封面缓存、窗口配置或其他工作树改动不被 Phase 16 接管。
- 基线记录包含当前自动门禁结果及其执行范围。

#### 建议提交

`docs：冻结 Phase 16 设置页手稿化基线`

### Step 16.1：建立 Settings presentation 契约

#### 主要文件

- `src/renderer/features/settings/types/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.test.ts`
- `src/renderer/features/settings/pages/SettingsPage.vue`

#### 实施步骤

1. 新增 `SettingsPresentation` 类型和纯 resolver。
2. 在 `SettingsPage.vue` 消费 `useRoute()` 与 `useVisualStyle()`。
3. 根节点绑定 `data-visual-style`。
4. 显式导入共享 manuscript tokens 与 Settings 手稿样式入口。
5. 不改变任何 section、IPC 或设置写入逻辑。

#### 测试

- `settings + manuscript -> manuscript`。
- `settings + modern -> modern`。
- albums、archive、library、playlist、相似字符串、`null`、`undefined` 均不进入 Settings 手稿。

#### 建议提交

`refactor：建立设置页手稿呈现契约`

### Step 16.2：实现集中视觉风格入口

#### 主要文件

- `src/renderer/features/appearance/components/VisualStylePreference.vue`
- `src/renderer/features/settings/pages/SettingsPage.vue`
- 三语 locale
- 可选的共享 roving focus 纯函数与测试

#### 实施步骤

1. 在外观分区加入说明性 visual style radiogroup。
2. 复用 `useVisualStyle()`，不创建新状态或 key。
3. 实现鼠标与完整键盘选择。
4. 明确页面风格、固定深色主题和 PlayerBar 材质的概念边界。
5. 保留 `selectedSection`，切换风格不重建 Settings 页面或当前 section。

#### 验收门槛

- 设置页可从 modern 切到 manuscript 并立即反映。
- 从 manuscript 切回 modern 后原现代 UI 恢复。
- 切换时当前分区、locale、PlayerBar 材质、gapless、扫描和刷新任务不改变。
- 内容页紧凑 `VisualStyleSwitch` 与设置页控件始终显示同一值。

#### 建议提交

`feat：设置页新增集中视觉风格入口`

### Step 16.3：完成页面骨架与分区导航手稿样式

#### 主要文件

- `src/renderer/features/settings/styles/manuscript.css`
- `src/renderer/features/settings/pages/SettingsPage.vue`

#### 实施步骤

1. 覆盖页面纸面、标题、两栏结构与 section heading。
2. 覆盖四项导航的 default、hover、active、focus-visible。
3. 停止手稿模式中的 gradient text、glass blur、glow、shimmer 与装饰 transform。
4. 保持 820px、560px 响应式结构与 playbar safe area。
5. 不选择 `.app-sidebar`、`.app-shell` 或其他 feature class。

#### 验收门槛

- 四个分区可辨认、可切换、可键盘聚焦。
- 长英中文 label 不重叠。
- 横向窄屏导航可滚动，active 项不被裁切。
- modern 像素结构没有因新增手稿文件改变。

#### 建议提交

`feat：设置页骨架与分区导航支持手稿风格`

### Step 16.4：覆盖通用设置控件与 About 状态

#### 主要文件

- `src/renderer/features/settings/styles/manuscript.css`
- `src/renderer/features/settings/pages/SettingsPage.vue`
- 必要的外观控件局部样式

#### 实施步骤

1. 覆盖 settings list、row、divider、note 与 value。
2. 覆盖 radiogroup、segmented option、switch、secondary button。
3. 覆盖 theme status、visual style samples 与 About mark。
4. 覆盖数据库 path、copy idle/copied/failed、app info loading/error。
5. 核对所有控件对比度、disabled 与 focus-visible。

#### 验收门槛

- 语言和 PlayerBar 材质键盘行为不变。
- gapless 的 checked 与 aria 文案一致。
- 长数据库路径保持 LTR、可复制且不撑破布局。
- copy success / failure 不只靠颜色表达。

#### 建议提交

`feat：设置控件与关于信息支持手稿风格`

### Step 16.5：覆盖曲库扫描与元数据维护状态

#### 主要文件

- `src/renderer/features/settings/components/MusicLibrarySettings.vue`
- `src/renderer/features/settings/styles/manuscript.css`

#### 实施步骤

1. 在不移动状态与 IPC 的前提下覆盖 library card 和 folder identity。
2. 覆盖扫描状态条、按钮、进度、metrics、inline error。
3. 覆盖元数据维护、refresh progress、failure toggle、failure list。
4. 验证视觉切换不卸载组件或重复订阅。
5. 验证原生目录 picker 的打开、取消、成功和错误返回。

#### 验收门槛

- active scan 和 metadata refresh 在切换风格后继续更新同一任务。
- start/cancel/refresh/clear failure 按钮的 disabled 条件不变。
- 文件路径、失败原因、任务编号和时间仍来自真实数据。
- 空状态、错误状态与长路径在窄宽度下可读。

#### 建议提交

`feat：曲库维护状态支持手稿设置样式`

### Step 16.6：补齐 reduced-motion、locale 与静态护栏

#### 主要文件

- `src/renderer/features/settings/styles/manuscript.css`
- `src/renderer/features/settings/pages/SettingsPage.vue`
- `src/renderer/features/settings/components/MusicLibrarySettings.vue`
- `scripts/check-library-visual-scope.mjs` 或后续统一命名的视觉守卫脚本
- 三语 locale 与 `scripts/zh-hant-overrides.json`

#### 实施步骤

1. 补齐 Settings 全部非必要动效的 reduced-motion 规则。
2. 静态检查 route resolver、根 marker、唯一状态源与 Settings CSS scope。
3. 检查 Settings 不选择排除表面。
4. 检查三语 visual-style key parity 与严格 UTF-8。
5. 验证繁中生成后工作树幂等。

#### 静态守卫至少检查

- `resolveSettingsPresentation(route.name, visualStyle.value)` 存在。
- 根节点使用 `:data-visual-style="settingsPresentation"`。
- Settings 手稿 CSS 每个选择器都以 Settings page 或 Settings overlay owner 开始。
- 不存在 `html`、`body`、`#app`、`.app-window`、`.app-shell`、`.app-sidebar`、`.player-bar`、`.mini-player`、`.fullscreen-player` 选择器。
- 不新增第二个 `auralis-visual-style` key 或 page-local visual style ref。
- visual style 设置文案三语齐全。

#### 建议提交

`test：补齐设置页手稿作用域与交互护栏`

### Step 16.7：回归、人工验收与交付

#### 自动门禁

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check <phase16-base>..HEAD
```

补充执行 Phase 16 文件的 Prettier check、严格 UTF-8 解码，以及 `npm.cmd run locales:zh-hant` 后的幂等检查。`git diff --check` 必须针对实际提交范围，不能以提交后的空工作树代替交付 diff。

#### 人工验收矩阵

| 维度         | 必验组合                                              |
| ------------ | ----------------------------------------------------- |
| presentation | modern、manuscript、连续往返至少 5 次                 |
| section      | appearance、playback、library、about                  |
| 宽度         | 宽屏、820px 附近、560px 附近、可用最窄主内容宽度      |
| Windows 缩放 | 100%、125%、150%                                      |
| 输入         | 鼠标、Tab、Shift+Tab、方向键、Home、End、Enter、Space |
| motion       | 默认、`prefers-reduced-motion: reduce`                |
| locale       | en、zh-Hans、zh-Hant                                  |

逐项验收：

1. 进入 Settings 时只页面内容进入手稿，Sidebar、Now Playing 和 PlayerBar 不变。
2. 外观分区能切换 visual style，两个入口状态同步。
3. 切换视觉风格不改变当前 section。
4. 语言 radiogroup 的 roving focus 与切换行为不变。
5. PlayerBar 材质 radiogroup 行为不变，Miniplayer 不被误改。
6. gapless switch 的点击、Space、aria checked 和播放行为不变。
7. 未配置目录时提示、选择目录按钮和扫描禁用状态正确。
8. 原生目录 picker 取消不报错，选择成功后路径与状态刷新。
9. 扫描进行中切换 visual style，进度和取消按钮继续工作。
10. 扫描 completed、canceled、failed 与错误恢复可读。
11. 元数据维护进行中切换 visual style，任务继续更新。
12. 失败记录的展开、清除、loading 和 error 状态正确。
13. About 版本 loading/error、长数据库路径、复制 success/failure 正确。
14. 窄宽度导航、设置行、按钮 label 和路径不重叠、不横向撑破页面。
15. reduced-motion 下无 nav shimmer、进入位移、旋转或装饰性循环动画。
16. modern 返回后原有 gradient、glass、radius 和交互恢复，没有手稿 token 泄漏。
17. Library、Albums、Album Detail、Archive 与三种 Library family route 无回归。
18. 操作系统原生标题栏仍由 Windows 提供，没有 Renderer 自绘窗口控件。

#### 交付物

- `phase16/BASELINE.md`
- `phase16/TECHDOC.md`
- `phase16/DELIVERY.md`
- 自动门禁记录
- Electron 人工矩阵真实结果
- 必要截图；不补造未实际采集的 DPI 或任务状态截图

#### 建议提交

`feat：完成设置页手稿风格与集中外观入口`

## 6. 预计文件变更

### 6.1 新增

- `src/renderer/features/settings/types/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.ts`
- `src/renderer/features/settings/utils/settingsPresentation.test.ts`
- `src/renderer/features/settings/styles/manuscript.css`
- `src/renderer/features/appearance/components/VisualStylePreference.vue`
- `docs/projects/library-manuscript-skin-mvp/phase16/BASELINE.md`
- `docs/projects/library-manuscript-skin-mvp/phase16/DELIVERY.md`

### 6.2 修改

- `src/renderer/features/settings/pages/SettingsPage.vue`
- `src/renderer/features/settings/components/MusicLibrarySettings.vue`
- `src/renderer/locales/en.json`
- `src/renderer/locales/zh-Hans.json`
- `src/renderer/locales/zh-Hant.json`，仅通过生成链更新
- `scripts/zh-hant-overrides.json`，仅在生成措辞需要时
- `scripts/check-library-visual-scope.mjs`，或经独立提交安全改名后的统一视觉守卫
- `docs/projects/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`
- `AGENTS.md`，在 Phase 16 完成后更新设置页覆盖边界和人工验收要求

### 6.3 原则上不修改

- `src/main/**`
- `src/preload/**`
- `src/shared/ipc/**`
- `src/main/database/**`
- `src/renderer/app/layout/AppSidebar.vue`
- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/MiniPlayer.vue`
- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`
- `src/renderer/app/styles/main.css`
- Library、Albums、Archive 的页面手稿 CSS

## 7. 风险与解决方案

### 7.1 风格切换重建任务组件

**风险**：给 section 或 `MusicLibrarySettings` 添加依赖 visual style 的 `key`，导致 push 事件重复订阅或任务 UI 短暂归零。

**解决**：只改变 Settings 根节点 `data-visual-style`；不以 presentation 控制组件挂载。

### 7.2 三类外观概念混淆

**风险**：用户把 manuscript 当作 dark theme 或 PlayerBar 材质，进而认为全应用已经换肤。

**解决**：文案、分组和预览明确区分页面视觉风格、固定深色主题和 PlayerBar 材质，并说明覆盖按阶段开放。

### 7.3 手稿规则泄漏到 shell 或播放器

**风险**：复用 `.settings-*` 之外的宽泛 `button`、`.sidebar` 或 token override，提前改变 Phase 17 / 18 表面。

**解决**：所有规则由 Settings owner 起始；静态守卫检查排除 selector。

### 7.4 原生 picker 被误判为漏样式

**风险**：为了视觉一致性新增自绘目录浏览器或修改 IPC，扩大安全和文件系统风险。

**解决**：明确原生 picker 属于操作系统；只验收打开前后的 Renderer 状态。

### 7.5 现代设置页回归

**风险**：直接改写 scoped CSS 基础规则，使 modern 的 glass、圆角、responsive 或交互改变。

**解决**：现代基础样式保持原位；手稿增量放在独立 owner-scoped 文件中。

### 7.6 键盘单选组出现多套实现

**风险**：visual style、locale 和 PlayerBar material 的 roving focus 行为不一致。

**解决**：优先复用现有交互结构；若提取 helper，只提取纯 index 计算并为边界键位编写测试，不引入新的全局组件框架。

### 7.7 reduced-motion 只覆盖新增控件

**风险**：手稿样式停止新动画，但旧 nav shimmer、page enter 和 progress shimmer 仍运行。

**解决**：以 Settings 页面为单位审计所有 keyframes、transform 和 transition，覆盖完整生命周期。

### 7.8 繁中生成不幂等

**风险**：手工修改 `zh-Hant.json` 后 build 再次改写，交付记录无法复现。

**解决**：简中为源，必要措辞进入 override，生成后运行 `git diff` 验证。

### 7.9 工作树所有权混杂

**风险**：Phase 14、封面缓存、窗口或 IPC 的未提交改动被误纳入 Phase 16。

**解决**：16.0 冻结 `git status`；每步使用显式 path 和提交范围；交付文档区分混合工作树门禁与 Phase 16 自身 diff。

## 8. 回退策略

Phase 16 以 Settings presentation gate 为回退边界：

1. resolver 对 `settings` 临时返回 `modern`，立即停用设置页手稿呈现。
2. 保留 `useVisualStyle()` 中已保存的用户偏好，不清除 localStorage。
3. 隐藏设置页集中入口时，既有内容页快捷入口仍可继续使用。
4. 删除 Settings 手稿 CSS import 不应影响任何设置数据或 IPC。
5. 不回退 Phase 15 及更早页面的手稿能力。

## 9. Definition of Done

满足以下全部条件后，Phase 16 才能标记为“工程完成”：

- `settings` route 使用显式 resolver 和页面 owner scope。
- 设置页存在集中 visual style 入口，并只写入唯一状态源。
- appearance、playback、library、about 四个分区均完成 modern / manuscript 覆盖。
- 当前 section、locale、PlayerBar material、gapless、扫描、元数据刷新和 About 状态在切换风格时保持。
- 原生 picker 边界明确，没有新增文件系统或 IPC 能力。
- Settings CSS、未来 overlay 与排除表面作用域静态检查通过。
- reduced-motion、键盘、focus-visible、disabled、loading、empty 和 error 状态完成。
- 三语 key parity、繁中生成幂等和严格 UTF-8 校验通过。
- `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 通过。
- 针对 Phase 16 实际提交范围的 `git diff --check` 通过。
- Electron 人工矩阵完成并记录后，Phase 16 才可从“工程完成”更新为“完全交付”。
