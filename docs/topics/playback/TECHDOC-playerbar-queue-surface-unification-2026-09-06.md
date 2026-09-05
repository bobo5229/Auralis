# TECHDOC：PlayerBar 与播放队列浮层材质统一

- 日期：2026-09-06
- 状态：已实施，待 GUI 视觉验收；本文是实现约束，不代表已经通过视觉验收。
- 适用规则：[Renderer 视觉与交互](../../rules/renderer.md)、[风险分级验收](../../rules/validation.md)。

## 1. 问题与结论

当前普通主窗口中的 PlayerBar 与其播放队列弹窗共享播放状态、presentation 和专辑取色变量，
但两者并不共享同一套表面实现：PlayerBar 的可见外壳由 `.player-bar-island`、
`.player-bar-glass` 和专辑 tint 层组成；队列弹窗则由 Uno shortcut、全局
`.queue-popover` 伪元素及独立 liquid-glass 参数共同组成。两处背景、边框、阴影、折射 blur
和交互色分别定义，因此会产生明显的材质割裂。

本轮将“统一”定义为：PlayerBar 与播放队列使用同一套材质语义和颜色来源，同时保留各自的
空间职责。需要统一的是背景合成、边框、高光、专辑 tint、折射特征和状态色；不要求弹窗复制
PlayerBar 的宽高和外形。队列仍是位于 PlayerBar 上方的浮层，允许使用更高的投影层级。

## 2. 已确认的当前实现

- `PlayerBar.vue` 在 `.player-bar` 根节点写入 `--auralis-active-album-tint` 和
  `--auralis-active-album-accent`，队列作为其后代可以自然继承；队列没有 Teleport。
- modern PlayerBar 的表面 owner 是
  `.player-bar[data-player-presentation='modern'] .player-bar-island`，圆角为 `28px`。
- 队列根节点是 `.player-overlay.queue-popover`，基础几何位于 `uno.config.ts`；它相对
  `.playback-actions` 定位，圆角为 `24px`。
- PlayerBar 与队列分别调用 `useLiquidGlassFilter()`。两者的 `depth`、`strength` 和
  `chromaticAberration` 当前相同，但队列额外传入 `blur: 16`，导致折射后的清晰度不同。
- 队列主体的 liquid-glass 背景、边框和阴影在 `main.css` 中另行覆盖；其当前曲文字还直接绑定
  `--auralis-song-row-now-playing-*`，未以 PlayerBar 的 active album accent 为优先来源。
- manuscript PlayerBar 是贴底纸面 footer，队列是抬起的 paper overlay。两者几何不同是合理的，
  但必须继续使用同一 manuscript token 家族。

## 3. 目标与完成条件

### 3.1 视觉目标

在 `modern + cover-tint` 与 `modern + liquid-glass` 两种材质下：

1. 队列弹窗与 PlayerBar 应被识别为同一材质家族，不再出现一处偏厚重毛玻璃、另一处偏清透
   折射玻璃的割裂。
2. 两者使用相同的中性底色方向、边框透明度、高光语言和专辑色来源。
3. 队列的 elevation 可以高于 PlayerBar，但阴影色相、锐度和层次必须来自同一表面语言。
4. 当前播放行继续是清楚的选中状态；强调色优先跟随 PlayerBar 当前专辑 accent，并保留主题
   fallback，不能恢复旧冷蓝强调。
5. 弹窗的宽度、最大高度、内部 padding、封面尺寸和滚动行为保持不变。

### 3.2 不变量

- 不修改播放队列数据、顺序、跳转播放、焦点循环、Esc 关闭和初始焦点行为。
- 不修改专辑取色算法、`usePlaybackQueue`、`usePlayerBarOverlayController` 或播放状态。
- 不改变 PlayerBar 的高度、最大宽度、主布局、safe area 和容器查询断点。
- 不影响 MiniPlayer、Fullscreen、Sidebar、Now Playing、桌面歌词窗口或其他页面 overlay。
- 不把 liquid-glass 引入 manuscript，也不把 manuscript 纸面样式带入 modern。
- 不顺手统一 mode menu、volume overlay、overflow panel 或桌面歌词弹层；发现关联差异只报告。

## 4. 设计决策

### 4.1 统一材质，不统一几何

| 属性 | PlayerBar | 播放队列 | 决策 |
| --- | --- | --- | --- |
| 材质底色 | 主表面 | 同一主表面语言 | 统一来源和合成顺序 |
| 边框与高光 | 低透明边框、克制高光 | 同色相与透明度 | 统一 |
| 专辑 tint | 当前专辑动态色 | 继承同一动态色 | 统一来源，允许按浮层可读性降低强度 |
| liquid 折射 | 当前 PlayerBar 参数 | 当前额外 `blur: 16` | 移除额外 blur；保留与自身圆角匹配的 radius |
| 圆角 | `28px` | `24px` | 保留，二者职责不同 |
| 阴影 | 浮岛 elevation | 浮层 elevation | 允许强度不同，但色相和层次一致 |
| 定位 | 主窗口底部浮岛 | 相对播放操作区 | 保留 |

队列 `radius` 必须继续匹配自身 `24px` 几何，不能为了参数字面一致强制改为 `28px`；真正需要一致的
是 `depth`、`strength`、`chromaticAberration`、blur 策略及表面合成顺序。

### 4.2 样式所有权

- `uno.config.ts` 的 `queue-popover` shortcut 只保留几何、定位、层级、尺寸、overflow 和 padding。
  队列的背景、边框和阴影移到 presentation-scoped CSS，避免两处互相覆盖。
- modern 队列主体样式必须限定在
  `.player-bar[data-player-presentation='modern'] .queue-popover` 下。
- liquid-glass 覆盖必须继续限定在
  `.player-bar--liquid-glass[data-player-presentation='modern']` 下。
- 不新增无 owner 的 `.queue-popover` 材质规则。滚动条等纯内部规则若保留全局，必须确认不会影响
  其他组件。
- manuscript 继续由 `manuscript.player-overlays.css` 所有；本轮只在实际存在材质偏离时使用既有
  manuscript surface token 修正，不重做其版式。

### 4.3 token 与颜色绑定

优先复用已有 `--auralis-playbar-*`、`--auralis-active-album-*`、`--auralis-text-*` 和
`--auralis-control-*` 变量，不新建一套 queue 专用主题体系。若为去除重复硬编码确需增加变量，
只能沿用 `--auralis-playbar-*` 命名，并定义在 PlayerBar owner 上，使 PlayerBar 和队列共同消费。

当前播放行：

- 背景可继续使用现有 now-playing 低透明填充，或改为由 active album accent 通过 `color-mix()`
  派生；必须保证无专辑色时回退到现有主题金状态色。
- 标题和艺人不再通过模板内联样式绑定 song-row 专用 token。应在队列 owner 的 CSS 中表达状态，
  优先消费 `--auralis-active-album-accent`，并保持足够对比度。
- 普通条目的默认、hover、focus 继续使用壳层文本与 control token，不大面积铺专辑色。

### 4.4 表面合成顺序

两种 modern material 均遵循以下层次：

```text
页面背景
  -> 材质层（cover tint 或 liquid displacement）
  -> 中性表面 veil
  -> 边框 / 克制高光
  -> 内容与交互状态
```

`cover-tint` 下，队列继承 PlayerBar 当前专辑 tint，但只能作为低透明材质层，不能覆盖文字和列表
状态。`liquid-glass` 下，队列的折射层与 PlayerBar 使用相同强度策略，并移除独有的 `blur: 16`；
中性 veil 负责可读性，不通过额外大半径模糊制造另一种玻璃材质。

## 5. 文件级实施计划

### `src/renderer/app/layout/PlaybackQueuePopover.vue`

- 移除队列 liquid filter 独有的 `blur: 16`，保留 `radius: 24` 并与 PlayerBar 对齐其他光学参数。
- 删除当前曲标题和艺人的模板内联颜色，把状态样式交回 owner-scoped CSS。
- 不改变模板结构、ARIA、焦点管理、队列数据和事件。

### `src/renderer/app/styles/main.css`

- 将队列基础材质从无 owner 的 `.queue-popover` 规则收敛到 modern PlayerBar owner。
- 让 PlayerBar glass 与队列消费同一底色、边框、高光及 tint 语义；浮层阴影只表达 elevation 差异。
- 合并或消除 liquid-glass 下针对队列的冲突背景与 blur 覆盖，确保折射层、veil、内容层顺序明确。
- 为当前播放行、普通 hover 和 focus 建立队列局部样式，避免依赖模板内联颜色。
- 保留 reduced transparency、forced colors 和不支持 backdrop-filter 时的实体回退。

### `uno.config.ts`

- `queue-popover` 仅保留布局和几何 shortcut；移除由 CSS owner 接管的背景、边框和阴影声明。
- 保留队列条目尺寸、封面尺寸、padding、滚动高度等交互几何。
- 若状态色已迁到 owner CSS，移除重复的 active/hover 视觉声明；不要影响其他 shortcut。

### 默认不修改

- `PlayerBar.vue`：现有动态变量写入和挂载层级足够；只有实施中证明需要共享参数常量或修正层级时
  才允许最小修改，并在交付中说明原因。
- `manuscript.player-overlays.css`：先验证现状；只有 manuscript 确实未消费既有 paper surface token
  时才做局部修正。
- playback composable、取色算法、MiniPlayer 与 Fullscreen 文件均不得修改。

## 6. 实施顺序

1. 记录修改前 `modern + cover-tint`、`modern + liquid-glass` 和 manuscript 的 PlayerBar + 队列同屏
   状态，确认问题基线。
2. 先收敛 Uno 与 CSS 的样式所有权，不改变视觉参数。
3. 对齐两种 modern material 的底色、边框、高光、tint 与 liquid filter 策略。
4. 将当前播放行的内联颜色迁移到队列 owner CSS，并验证无专辑色 fallback。
5. 检查窄窗定位、长标题、空队列、滚动队列和弹窗焦点。
6. 按第 7 节完成最小充分验证；不得提交或推送。

## 7. 验收

本任务是局部视觉表现与一处参数/模板绑定调整，按 A 级为主；若实现改变 Vue 行为或共享参数契约，
升级为 B 级定向验证。无需默认运行全仓测试、全量 lint 或 build。

### 7.1 静态检查

- `git diff --check`
- 对实际修改文件运行 Prettier check。
- 若修改 Vue/TS，运行对应文件的定向 ESLint。
- 检查新增/修改 selector 均包含正确 Player owner，且没有新增无作用域的 modern queue 材质规则。
- 检查 `MiniPlayer.vue`、`FullscreenPlayerOverlay.vue`、播放状态与取色算法不在本次 diff 中。
- 修改中文文档后，读取实际字节并执行严格 UTF-8 解码校验。

### 7.2 GUI 场景

| 场景 | 必查内容 |
| --- | --- |
| modern + cover-tint | PlayerBar 与队列的底色、高光、边框、专辑 tint 属于同一材质家族 |
| modern + liquid-glass | 两者折射清晰度和色散一致；队列不再因额外 blur 显得更厚重 |
| modern 无封面/无取色 | 两者都回退到暖黑壳层与主题强调，不出现冷蓝或透明失控 |
| manuscript | footer 与 paper overlay 保持各自几何，但色纸、线条和文字语言一致 |
| 队列状态 | 空队列、单曲、长列表滚动、当前曲、hover、focus、Esc 和点击选曲正常 |
| 窄窗 | 队列不越界、不被 PlayerBar 裁切，定位锚点与现状一致 |
| 无障碍回退 | reduced transparency / forced colors 下内容清楚，折射层正确关闭 |

### 7.3 通过标准

- 同屏观察时，PlayerBar 和队列不再像两套不同玻璃/配色组件。
- 队列仍能明确表达“高于 PlayerBar 的浮层”，但差异只来自 elevation 和几何，不来自另一套底色或模糊。
- 当前曲强调清楚且克制，无旧冷蓝硬编码；普通队列项不被大面积专辑色污染。
- cover-tint、liquid-glass 与 manuscript 互不串样式。
- 没有交互、焦点、滚动、定位或裁切回归。

## 8. 停止条件与交付

若统一材质必须修改共享 overlay、MiniPlayer、Fullscreen 或播放逻辑，实施 Session 应停止并报告传播
路径，不自行扩大范围。若无法运行 Electron GUI，可以交付静态检查结果，但必须明确写“视觉未验证”，
不能以 lint、typecheck 或构建代替视觉验收。

交付时列出：实际修改文件、统一了哪些样式来源、保留了哪些合理差异、执行过的检查、GUI 覆盖场景、
未验证项和剩余风险。不得自动 commit、push、切换分支或创建 PR。
