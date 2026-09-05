# TECHDOC：modern PlayerBar Liquid Glass 视觉保真修复

- 日期：2026-09-05
- 状态：待实施的修复方案；当前实现尚未通过视觉验收，本文不代表修复已经完成。
- 触发问题：Auralis 当前 PlayerBar 更接近深色高模糊毛玻璃，与参考仓库示意图中可辨认的液态折射、边缘位移和色散不一致。
- 参考实现：[`nikdelvin/liquid-glass`](https://github.com/nikdelvin/liquid-glass/tree/49251869805a117db87c70998e3f7b83719c690e)，固定到 commit `49251869805a117db87c70998e3f7b83719c690e`。
- 本地算法来源：`src/renderer/features/playback/utils/liquidGlassDisplacementMap.ts`；许可声明见仓库根目录 `THIRD_PARTY_NOTICES.md`。
- 适用规则：[Renderer 视觉与交互](../../rules/renderer.md)、[风险分级验收](../../rules/validation.md)。

## 1. 决策摘要

本轮不推翻现有 SVG displacement 算法，也不先靠反复调整透明度“猜效果”。修复按以下顺序推进：

1. 用接近上游的高辨识度参数建立诊断基线，确认 Electron 合成器实际输出了折射像素。
2. 确认折射有效后，纠正 PlayerBar 的合成层次，使折射层采样原始页面背景，暗色遮罩与表面高光在折射之后叠加。
3. 再将强度收敛到适合 Auralis 的生产值，同时保持上游效果的核心视觉特征。
4. 使用真实 Electron 窗口和固定场景做前后截图对比；单元测试、CSSOM 语法接受或计算样式均不能替代视觉验收。

若第一步使用高对比背景和高辨识度参数后仍看不到几何位移，实施 Session 必须停止视觉调参，转为调查 Electron/Chromium 对 data URI SVG `backdrop-filter: url(...)` 的实际合成支持。不得用更重的模糊、阴影或高光掩盖该失败。

## 2. 目标与成功定义

### 2.1 目标

只修复普通主窗口中 `modern + liquid-glass` PlayerBar 浮岛的外壳材质，使其保留 Auralis 现有布局与可读性的同时，具有参考实现可识别的三项核心特征：

- 背景经过浮岛边缘时出现连续的光学位移，而不是仅被均匀模糊。
- 高对比边界附近可以辨认轻微 RGB 通道分离，但不形成常驻霓虹描边。
- 浮岛内部仍可辨认其后的专辑封面、文字或结构轮廓，不被厚重黑色遮罩压成近乎不透明的胶囊。

“视觉保真”指保留上述光学机制和视觉层次，不要求在不同背景、尺寸和 Electron 渲染条件下与上游预览逐像素一致。上游预览使用高饱和、高对比素材，Auralis 的纯黑页面天然会降低折射可见度。

### 2.2 完成条件

同时满足以下条件才可标记完成：

- 在真实 Electron 窗口、高对比背景穿过 PlayerBar 的场景中，肉眼可见边缘位移和轻微色散。
- 在以黑色为主的页面中，播放栏仍保持稳定轮廓、按钮和文字可读；不能为了追求示意图而加入与页面无关的彩色背景。
- `cover-tint` 外观不变，`manuscript` PlayerBar 不受影响。
- Fullscreen、Miniplayer、桌面歌词和 PlayerBar 弹出层不因本次修复改变材质或生命周期。
- 窄窗 resize 后位移图尺寸与圆角仍贴合，不出现旧尺寸、裁切直边或闪烁。
- `prefers-reduced-transparency: reduce` 和 forced-colors 继续关闭折射并使用可读的实体回退。
- 产出实施前、诊断基线、最终调校三组可追溯截图，并记录测试场景与窗口宽度。

## 3. 当前状态与证据分级

### 3.1 已确认事实

1. `liquidGlassDisplacementMap.ts` 是对固定上游 commit 的格式适配移植，生成 `feDisplacementMap`、RGB 通道拆分和 `feBlend` 滤镜；相邻单元测试覆盖 SVG data URI、零值边界、三通道 scale 和 CSSOM parser 判定。
2. `PlayerBar.vue` 当前传入 `radius: 28`、`depth: 10`、`strength: 32`、`chromaticAberration: 4`，滤镜链为 `url(...) brightness(1.08) saturate(1.6)`。
3. 当前 liquid-glass 的 `.player-bar-glass` 使用最高约 `0.68` alpha 的深色渐变，并先执行 `blur(28px) saturate(180%) contrast(106%)`。
4. 当前 DOM 先渲染 `.player-bar-glass`，再渲染 `.player-bar-liquid-refract-edge`；两者都是浮岛内部绝对定位的视觉层。
5. 上游 `LiquidGlass.astro` 的默认值为 `strength = 100`、`chromaticAberration = 0`、`blur = 0`。其主示例未覆盖默认 strength，组件的滤镜链把可选 blur 与 SVG displacement 放在同一个 filter layer；黑色 overlay 与 filter layer 分开绘制。
6. `supportsBackdropFilterUrlSyntax()` 只检查 CSSOM 是否接受 `url()` 语法。源码注释已明确说明：返回 `true` 不代表合成器实际渲染 SVG 滤镜。
7. 当前用户截图中，浮岛的主要感知来自深色填充、模糊、边框和阴影，没有达到参考预览中清晰可辨的折射强度。

### 3.2 高可信推断

- 重度前置模糊与深色遮罩先消除了背景的空间频率和明暗差，后续 displacement 即使运行也缺少可供位移的可见细节。
- 当前玻璃层与折射层的 DOM 顺序及 stacking 关系可能使折射层采样到已经模糊、压暗的合成结果，而不是原始页面背景。
- `strength: 32` 比上游主示例默认值弱，而 `chromaticAberration: 4` 相对偏高；这组参数可能产生“几何位移不明显、局部色边更突出”的失衡结果。
- Auralis 页面的大面积纯黑背景会进一步降低折射可见度，因此必须在专辑封面或明暗边界穿过浮岛的场景验证，不能只看黑色空白区域。

以上属于待实验验证的根因候选，不得在实施报告中写成已经证实的浏览器合成行为。

### 3.3 实施前仍需确认

- 当前 Electron/Chromium 版本是否真的渲染 data URI SVG 作为 `backdrop-filter`，而非只接受属性语法。
- `.player-bar-liquid-refract-edge` 的实际 computed `backdrop-filter` 是否保留完整 data URI，是否因 CSS 层叠、长度或解析被置空。
- 折射层在当前 `isolation: isolate`、overflow 和 stacking context 下实际采样的是页面背景还是已有玻璃层。
- Windows 图形后端、硬件加速和不同缩放比例是否影响该滤镜输出。

## 4. 范围与不变量

### 4.1 本次范围

- `src/renderer/app/layout/PlayerBar.vue` 中 normal modern PlayerBar 的液态玻璃视觉层、参数和 resize 更新。
- `src/renderer/app/styles/main.css` 中完整限定在
  `.player-bar--liquid-glass[data-player-presentation='modern']` 下的浮岛外壳、折射层、遮罩层和回退规则。
- 仅在发现算法或能力判断存在可复现缺陷时，才允许修改
  `src/renderer/features/playback/utils/liquidGlassDisplacementMap.ts` 及其相邻测试。
- 若第三方移植范围变化，检查并按实际变化更新 `THIRD_PARTY_NOTICES.md`；参数和 CSS 调整本身不需要改许可声明。

### 4.2 明确不做

- 不修改 PlayerBar 的高度、最大宽度、底部间距、圆角、控件排列、容器查询断点或 safe area。
- 不修改播放状态、队列、音量、桌面歌词、快捷键、可访问名称或路由行为。
- 不修改 `cover-tint` 的取色、过渡和 DOM 生命周期。
- 不把液态玻璃扩展到 manuscript、Fullscreen、Miniplayer、桌面歌词窗口或其他页面。
- 不把 queue popover、mode menu、toast、overflow panel 一并重做；这些弹出层沿用现状，除非实际层叠回归要求最小修正。
- 不引入 Canvas/WebGL、运行时截图采样、第三方 UI 依赖、常驻调试开关或新的全局主题系统。
- 不为了让折射更明显而改变专辑详情页背景、注入彩色渐变或复制上游演示素材到产品界面。

## 5. 目标合成模型

### 5.1 层次顺序

liquid-glass 浮岛的目标视觉链路为：

```text
页面原始背景
  -> SVG displacement 折射层
  -> 轻量中性表面 veil
  -> 边缘高光 / 内侧反射
  -> PlayerBar 内容与交互控件
```

关键约束是“先折射，后压暗”。折射层必须尽可能看到原始页面背景；中性 veil 只负责保证文字和控件可读，不承担第二次大半径 backdrop blur。

建议保留现有类名并把浮岛内部视觉层明确为：

| 层级 | 元素                              | 职责                                              |
| ---: | --------------------------------- | ------------------------------------------------- |
|    0 | `.player-bar-liquid-refract-edge` | 对浮岛后的原始页面执行 displacement、亮度和饱和度 |
|    1 | `.player-bar-glass`               | 轻量中性 veil、边框和必要的内部明暗，不做重度模糊 |
|    3 | `.player-bar-island::before`      | 静态表面高光；不得覆盖为大面积白雾                |
|    4 | PlayerBar 交互内容                | 既有按钮、进度、标题和工具                        |

如浏览器实测证明 sibling 顺序仍导致错误的 backdrop 采样，应优先调整 DOM 顺序或局部 stacking context，而不是增加负 `z-index`。负层级可能被 `isolation: isolate` 裁到浮岛背后，必须避免未经截图验证直接采用。

### 5.2 liquid-glass 与共享玻璃规则解耦

`.player-bar-glass` 当前还命中共享的 `blur(24px)` 规则。实施时必须在完整 liquid-glass 作用域内显式覆盖该 blur，不能修改共享规则，否则会污染 `cover-tint` 和弹出层。

liquid-glass 的 `.player-bar-glass` 应以低 alpha 中性背景承担可读性。诊断阶段先禁用其 backdrop blur；最终阶段如确有需要，只允许加入不压平折射的轻微模糊，并以对比截图证明收益。最终值不能在验证前由本文预先盖章。

### 5.3 参数分为诊断基线与生产调校

第一轮使用故意易辨认的诊断基线：

| 参数                  |    当前值 |      诊断起点 | 用途                                           |
| --------------------- | --------: | ------------: | ---------------------------------------------- |
| `strength`            |        32 |           100 | 对齐上游默认位移强度，验证几何折射链路         |
| `chromaticAberration` |         4 |             2 | 避免色边掩盖位移；保留足够可见的 RGB 分离      |
| surface backdrop blur |      28px |           0px | 排除前置模糊压平背景的影响                     |
| surface dark veil     | 0.42–0.68 | 低 alpha 单层 | 排除重度暗色遮罩；具体起点由实施者在截图中记录 |
| filter brightness     |      1.08 |           1.1 | 接近上游普通组件默认值                         |
| filter saturate       |       1.6 |           1.5 | 接近上游普通组件默认值                         |

诊断值不是最终产品规范。链路确认后，按以下顺序一次只调一个维度：

1. 先调 `strength`，直到边缘位移清楚但文字背后的背景不过度扭曲。
2. 再调 `chromaticAberration`，使色散只在高对比边界附近可见。
3. 再调 veil 的 alpha，保证播放控件可读但不把背景压成黑色。
4. 最后才评估是否需要 `0–4px` 的轻微 blur；若没有明确收益，保持 `0px`。
5. 边框、inset highlight 和外投影只在上述机制确定后微调，不能用它们代替折射。

每轮记录参数与对应截图。禁止同时修改所有参数后只保留主观结论。

## 6. 分阶段实施方案

### 阶段 A：运行时折射诊断

1. 使用开发环境启动真实 Electron，不以普通浏览器预览替代。
2. 选择专辑详情页，让明暗边界、封面边缘或文字行实际穿过 PlayerBar 浮岛。
3. 记录当前实现截图、窗口宽度、系统缩放和 PlayerBar material。
4. 在 liquid-glass 专属规则中临时关闭 `.player-bar-glass` 的 backdrop blur 和重度暗色背景，应用第 5.3 节诊断参数。
5. 在 DevTools 核对折射节点存在、尺寸非零、computed `backdrop-filter` 非空，并观察背景边界是否产生几何位移。

阶段 A 的停止条件：

- 若出现清晰位移，保存诊断截图并进入阶段 B。
- 若属性非空但没有任何像素位移，停止 CSS 美化；提交运行环境与证据，进入 compositor 兼容性调查。
- 若属性为空或节点尺寸错误，先修正接线或 resize 生命周期，再重复一次诊断。

临时诊断类、硬编码开关和演示素材不得进入最终差异。

### 阶段 B：修正合成顺序

1. 调整浮岛视觉层的 DOM/stacking 顺序，使 displacement 层位于 surface veil 之前。
2. 将 `.player-bar-glass` 在 liquid-glass 作用域内改为轻量 veil，并显式覆盖共享 blur。
3. 保留内容层 `z-index`、pointer-events 和既有交互命中；装饰层全部 `pointer-events: none`。
4. resize 后继续调用现有位移图更新入口，确认 width、height、radius 与浮岛实际几何一致。
5. 切换 `liquid-glass -> cover-tint -> liquid-glass`，确认滤镜 URL 的创建、清理和恢复没有残留旧尺寸。

阶段 B 只解决合成结构，不同步重做按钮、进度条或弹出层。

### 阶段 C：生产视觉调校

以阶段 A 截图为参照，按第 5.3 节固定顺序收敛参数。最终效果必须同时通过：

- 高对比背景：折射与轻微色散可辨认。
- 低对比黑色背景：轮廓稳定且不显脏，不要求凭空出现彩色折射。
- 内容密集背景：标题、时间、音量和图标保持可读。

若必须在“上游强烈折射”和“PlayerBar 内容可读”之间取舍，优先保留可读性，但最终不能退化回只有 blur、阴影和描边的普通 glassmorphism。无法同时满足时应提交两组候选截图给用户决策，不自行宣称验收完成。

### 阶段 D：清理与最小回归

1. 删除所有诊断开关、临时日志和演示样式。
2. 检查最终 diff 只覆盖授权文件及索引，不混入工作区其他未提交修改。
3. 执行第 8 节的最小充分验证并填写视觉验收记录。
4. 不提交、不推送、不切换分支；由 Commander 根据 diff、测试和截图决定是否接受。

## 7. 文件级实施约束

| 文件                                                                      | 预期动作                                                                    | 禁止事项                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/renderer/app/layout/PlayerBar.vue`                                   | 调整 liquid 专属视觉层顺序；集中参数；保留现有 material、normal/modern gate | 不改播放、队列、音量、歌词或控件布局            |
| `src/renderer/app/styles/main.css`                                        | 调整 liquid 专属层级、veil、blur、highlight 和 fallback                     | 不改全局 token、共享玻璃规则、cover-tint 或几何 |
| `src/renderer/features/playback/utils/liquidGlassDisplacementMap.ts`      | 默认只读；仅在发现可复现算法/兼容缺陷时修改                                 | 不因视觉调参重写算法，不去掉来源和许可说明      |
| `src/renderer/features/playback/utils/liquidGlassDisplacementMap.test.ts` | 算法或 parser contract 改动时同步测试                                       | 不用源码字符串断言或快照代替真实 GUI 验证       |
| `THIRD_PARTY_NOTICES.md`                                                  | 仅在第三方代码范围变化时核对                                                | 不删除或弱化固定 commit 与 MIT notice           |

所有 CSS selector 必须包含 `.player-bar--liquid-glass[data-player-presentation='modern']` 完整 owner。不能恢复未限定 presentation 的 `.player-bar--liquid-glass ...` 规则。

## 8. 验证计划

本修复包含局部 Vue 接线、CSS 合成和运行时视觉行为，按 B 级局部行为验证，并增加受影响区域的真实 GUI 视觉验收；不默认运行全仓测试、全仓 lint、build 或打包。

### 8.1 静态与自动验证

- `git diff --check`
- `npm.cmd exec -- prettier --check src/renderer/app/layout/PlayerBar.vue src/renderer/features/playback/utils/liquidGlassDisplacementMap.ts src/renderer/features/playback/utils/liquidGlassDisplacementMap.test.ts docs/topics/playback/TECHDOC-playerbar-liquid-glass-visual-fidelity-2026-09-05.md`
- 若修改 Vue/TS：对实际改动代码执行定向 ESLint。
- 若修改 displacement helper 或其参数 contract：运行
  `npm.cmd run test:unit -- src/renderer/features/playback/utils/liquidGlassDisplacementMap.test.ts`。
- 若只改模板层顺序和局部 CSS，不新增算法逻辑，不为像素值补脆弱的源码字符串测试。
- 修改中文文档后，读取实际字节并执行严格 UTF-8 解码校验。

### 8.2 GUI 场景矩阵

| 维度     | 必测场景                                                                 |
| -------- | ------------------------------------------------------------------------ |
| 背景     | 高对比专辑封面边缘穿过浮岛；黑色列表区域；无封面/低对比背景              |
| 宽度     | 常规宽窗；触发 modern 容器查询后的窄窗                                   |
| 材质     | liquid-glass 修复效果；切换到 cover-tint 后保持现状；再切回 liquid-glass |
| 生命周期 | 首次进入；resize；切换页面；切换 material；卸载后恢复                    |
| 无障碍   | reduced transparency；forced-colors；reduced motion 不产生额外过渡       |
| 排除项   | manuscript 不出现 liquid 层；Fullscreen/Miniplayer 不挂载该折射层        |

每张验收截图必须记录：场景、窗口宽度、material、关键参数、是否为诊断或最终版本。避免只截纯黑区域，因为该场景无法证明位移链路工作。

### 8.3 视觉通过标准

- 背景直线或封面边缘穿过浮岛边缘时出现平滑偏折，离开浮岛后恢复原位置。
- RGB 色散跟随被折射的高对比边界，不是固定在整个胶囊轮廓上的彩色描边。
- 中央区域没有 `28px` 级别模糊造成的均匀泥化；背景结构仍有辨识度。
- veil 不把浮岛压成近乎不透明的黑条；同时控件、时间和进度保持清楚。
- 圆角四角、左右端和 resize 后边界没有矩形裁切、错位或旧尺寸滤镜残留。
- hover、点击和弹出层命中不受装饰层阻挡。

以下证据不能单独判定视觉通过：单元测试通过、CSS parser 返回 true、computed style 非空、构建成功、代码与上游算法文本一致。

## 9. 风险与回退

| 风险                                     | 观察信号                                          | 处理方式                                                            |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Electron 只接受语法但不渲染 SVG backdrop | computed style 非空，高对比背景仍完全没有几何位移 | 停止调参，记录 Electron/Chromium/GPU 信息，调查兼容路径             |
| veil 仍进入折射采样                      | 位移只作用于均匀暗色或模糊块                      | 检查 DOM 顺序、stacking context、isolation 和 backdrop root         |
| 参数过强                                 | 文字后方背景剧烈拉伸、彩边刺眼                    | 先降 strength，再降 chromatic aberration，不靠加黑遮罩修复          |
| 参数过弱                                 | 只剩普通 blur 与亮边                              | 先回到诊断基线确认链路，再逐项收敛                                  |
| 低对比页面看不到效果                     | 黑色区域无明显变化，但封面边缘场景正常            | 视为背景限制，不向产品背景注入假彩色                                |
| resize 频繁重建造成闪烁或开销            | 拖动窗口时抖动、URL 高频生成、旧图残留            | 沿用 ResizeObserver，必要时只在尺寸整数变化时更新，不引入动画帧循环 |
| CSS 作用域污染                           | cover-tint、manuscript 或弹出层外观变化           | 收紧到完整 modern liquid owner，回退共享 selector 修改              |

安全回退是恢复 liquid-glass 专属的旧 DOM 顺序和 CSS 参数；不得删除 displacement helper、第三方 notice 或影响 `cover-tint`。如果 SVG backdrop 在目标 Electron 环境中不可用，应保留明确的实体/普通玻璃 fallback，并将“参考效果不可实现”的证据提交用户决策，不静默伪装为已完成。

## 10. 后续实施 Session 的停止条件

出现任一情况即停止并向 Commander 报告，不扩大范围：

- 高辨识度诊断基线仍无像素位移，需要研究 Electron 合成器或替代技术。
- 必须修改 Electron 启动参数、禁用安全设置、引入 WebGL/Canvas 或新增依赖才能继续。
- 必须改变 PlayerBar 几何、页面背景或其他 owner 才能让效果可见。
- 现有未提交修改与目标行发生无法安全拆分的冲突。
- 两种视觉候选都满足技术条件，但“更接近上游”与“更克制可读”需要产品取舍。

完成交付时必须报告：实际修改文件、最终参数、自动验证结果、三阶段截图位置、未验证环境以及剩余风险。不得只以“Terra 已完成”或文字自述代替 diff 与证据。
