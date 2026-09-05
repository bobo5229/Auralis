# TECHDOC：modern PlayerBar 纽扣式内凹播放按钮

- 日期：2026-08-29
- 状态：待实现的技术方案；本文不代表样式已实现或视觉验收通过。
- 本版取代同路径原“哑光浅凸”方案；路径不变，以保持现有引用有效。
- 产品依据：[PRD](./PRD-playerbar-matte-depth-2026-08-29.md)。
- 验收依据：[风险分级验收](../../rules/validation.md)；本需求属于 A 级局部表现调整。

## 1. 目标与边界

本次只为主页面底部 PlayerBar 的 modern 主播放按钮设计纽扣式内凹表面。
按钮自身是一个有厚度的圆形按键：外沿较高，中央轻微下凹；不是把整块平片嵌进播放条的洞。
不绘制纽扣孔、孔洞、透明玻璃球、金属旋钮或悬浮光球。

- 保留 40×40px 尺寸、圆形点击区域和图标尺寸。
- 第一强调色继续作为按钮主体底色；中心区域必须主要保留该颜色。
- 上方光源固定：凹面内上缘偏暗，内下缘偏亮，明暗方向不随状态反转。
- 外沿使用同一底色上的宽、柔、连续坡面表达厚度，不形成硬朗分界或细亮环。
- 无视觉 `border`、`box-shadow`（包括 `inset`）、`drop-shadow`、外部投影或外围光晕。
- 不改变取色、播放/暂停判断、禁用条件、加载语义、图标语义或按钮可访问名称。
- 不修改 manuscript、MiniPlayer、Fullscreen、旧焦点问题或全局动效。
- 不新增 Vue 状态、DOM、JS 动画、图片资源、动画时间轴或新的主题 token。

## 2. 当前源码快照与唯一落点

本方案只预期修改 `src/renderer/app/styles/main.css`，不修改模板或播放逻辑。

| 文件                                                     | 当前职责                                             | 本次处理       |
| -------------------------------------------------------- | ---------------------------------------------------- | -------------- |
| [main.css](../../../src/renderer/app/styles/main.css)           | modern 主按钮尺寸、底色、前景色与状态                | 唯一实现落点   |
| [PlayerBar.vue](../../../src/renderer/app/layout/PlayerBar.vue) | 注入颜色变量、绑定 disabled 与 `aria-busy`、渲染图标 | 只读，沿用现状 |

所有规则限定在以下完整选择器，不得缩写为共享控件规则：

```css
.player-bar[data-player-presentation='modern'] .transport-control-primary
```

当前按钮已是 40px 宽高、`border-radius: 999px`、无阴影，并使用：

- `--auralis-player-primary-button-bg`：沿用 Vue 注入的第一强调色；有曲目但无有效封面时
  沿用 palette 回退色，无曲目时沿用中性底色。CSS 的变量兜底不等同于“无封面”。
- `--auralis-player-primary-button-fg`：沿用当前实际底色的对比色计算和无曲目的默认前景色，
  不因无封面而另行切换图标算法。

当前 modern 模板把 `disabled` 绑定到无当前曲目或播放待处理，把播放待处理绑定为
`aria-busy="true"`；播放中/暂停中只切换既有图标。不要为内凹外观增加另一套状态来源。

## 3. 单一实现方案：底色加两层内部光照

按钮本体只负责不透明第一强调色。当前源码没有按钮伪元素；最多新增两个：`::before` 绘制外沿环状坡面，
`::after` 绘制缩进的中央凹面。两者都在按钮圆内，均不接收指针事件，也不参与布局。
若实施前工作区出现旧浅凸伪元素，必须在同一按钮作用域内替换其作用，先移除旧表面层再加入下述两层，
禁止新旧叠加。

### 3.1 按钮本体与裁剪

建议将按钮设为 `position: relative; isolation: isolate; overflow: hidden`，保留 40×40px、
`flex-shrink: 0`、`border-radius: 999px`，以 `background-color: var(--auralis-player-primary-button-bg,
var(--auralis-control-primary-bg)) !important` 承载底色，以 `color: var(--auralis-player-primary-button-fg,
var(--auralis-control-primary-text)) !important` 承载前景，并将 `background-image` 置为 `none !important`。
过渡改为 `transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1) !important`；数值是实现起点，非视觉结论。

`overflow: hidden` 只用于将光照裁切在圆内，不是制造播放条凹槽。保留 `border: none` 与
`box-shadow: none` 作为重置但不得绘制边缘。移除本按钮旧状态中的重复 `background` 简写，
以免覆盖新的底色声明；按钮上的简写本身不会重置伪元素的背景。

### 3.2 外沿环状坡面（`::before`）

外沿是从圆边向中央凹面连续过渡的宽坡面，不是描边或整圈亮光。透明中心由 mask 保留。
圆润外沿本身上方微亮、下方微暗；其内侧凹壁则由下一层表现上暗下亮，不能把两者混为一层。

```css
.player-bar[data-player-presentation='modern'] .transport-control-primary::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--auralis-player-primary-bevel-opacity, 0.75);
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0.12),
    transparent 42%,
    transparent 60%,
    rgb(0 0 0 / 0.1)
  );
  -webkit-mask: radial-gradient(
    circle closest-side,
    transparent 0 54%,
    #000 72% 86%,
    transparent 100%
  );
  mask: radial-gradient(circle closest-side, transparent 0 54%, #000 72% 86%, transparent 100%);
}
```

黑白光照仅改变底色的明暗，色相仍由第一强调色承担。`closest-side` 让百分比对应圆的半径，
避免默认渐变半径延伸到方框角点。54% 到 100% 是渐入再渐出的宽坡面，不画 1px 边界。

### 3.3 中央凹面（`::after`）

中央层向内缩进 3px，绘制凹面内壁：上缘暗、下缘亮，中心和最外缘都渐隐，
让第一强调色穿透。不能将整块中心涂成白色或黑色，也不能据此宣称图标对比度已验收。

```css
.player-bar[data-player-presentation='modern'] .transport-control-primary::after {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--auralis-player-primary-recess-opacity, 0.8);
  background: linear-gradient(
    180deg,
    rgb(0 0 0 / 0.24),
    transparent 44%,
    transparent 60%,
    rgb(255 255 255 / 0.2)
  );
  -webkit-mask: radial-gradient(
    circle closest-side,
    transparent 0 42%,
    #000 68% 78%,
    transparent 100%
  );
  mask: radial-gradient(circle closest-side, transparent 0 42%, #000 68% 78%, transparent 100%);
}

.player-bar[data-player-presentation='modern'] .transport-control-primary > span {
  position: relative;
  z-index: 1;
}
```

两层都使用柔和渐变而非硬朗停止点；`::after` 的 3px 内缩和 `::before` 的宽 mask
共同表达高外沿、低中心。绘制范围不会超出圆形，图标永远位于最上层。

## 4. 状态、层叠与优先级

按钮默认保持静态可读的内凹感。状态只微调光照强度和既有 transform，不翻转明暗方向，
不让 hover 明显上浮或放大。建议局部变量和状态参数如下：

| 状态                        | `bevel-opacity` | `recess-opacity` | transform                         | 说明                                  |
| --------------------------- | --------------: | ---------------: | --------------------------------- | ------------------------------------- |
| 默认可用                    |            0.75 |             0.80 | `none`                            | 清晰的宽坡面与透明中心                |
| hover 且非 disabled         |            0.80 |             0.86 | `translateY(-0.25px) scale(1.01)` | 仅轻微响应，不改变结构                |
| active 且非 disabled        |            0.85 |             1.00 | `translateY(0.25px) scale(0.99)`  | 内凹略加强，不恢复浅凸或反转明暗      |
| disabled                    |            0.45 |             0.50 | `none !important`                 | 静态沿用禁用语义，不响应 hover/active |
| disabled + `aria-busy=true` |     同 disabled |      同 disabled | `none !important`                 | 仅保留现有 wait 光标与 loader 语义    |

规则顺序固定为基础、hover、active、disabled、busy、局部 reduced-motion。hover 与 active
必须带 `:not(:disabled)`；active 写在 hover 后，避免按住时仍被抬起。disabled 的
`transform: none !important` 必须压过既有 active 声明。

只在需要压过当前 `!important` 的局部属性上保留 `!important`；状态只调整两个变量和
`transform`，不得重复写 `background`、边框、阴影、滤镜或混合模式。busy 只写 `cursor: wait`，
不新增旋转、脉冲或加载动画。

## 5. 动效与 reduced-motion

本方案仅收敛当前按钮的 transform 过渡，不新增关键帧、时间轴或 JS 动画。伪元素 opacity
按状态即时切换，避免渐变图像插值造成闪烁。当前 `motion.ts` 不需要新增调用。

局部覆盖应限定在完整 modern 按钮选择器及其 hover/active/disabled 状态：

```css
@media (prefers-reduced-motion: reduce) {
  .player-bar[data-player-presentation='modern'] .transport-control-primary,
  .player-bar[data-player-presentation='modern'] .transport-control-primary:hover:not(:disabled),
  .player-bar[data-player-presentation='modern'] .transport-control-primary:active:not(:disabled),
  .player-bar[data-player-presentation='modern'] .transport-control-primary:disabled {
    transition: none !important;
    transform: none !important;
  }
}
```

不要借此修改 PlayerBar 其他控件或全局 reduced-motion 规则；按钮仍保留静态内凹明暗。

## 6. 实施顺序与 A 级验收

1. 只检查 `main.css` 的现有 modern 按钮规则，保留同文件其他 dirty 修改。
2. 在完整 modern 作用域内替换现有浅凸 transform/background 规则，加入上述两个伪元素；不叠加旧层。
3. 核对基础、hover、active、disabled、busy、reduced-motion 的层叠，确认没有 background 简写重置。
4. 检查本次 CSS 差异、格式与作用域；不运行全量 test、lint、typecheck 或 build。
5. 有现成 GUI 时，只查看按钮局部的默认、hover、active、disabled、busy 和 reduced-motion 外观。
6. 代表性检查偏亮、偏暗、无封面回退色：确认第一强调色仍是主体、中心图标清楚、没有暗描边/白斑/细亮环。
7. 在现有 `cover-tint` 与 `liquid-glass` PlayerBar 材质下查看同一按钮区域；不修改材质实现。

验收只覆盖 modern PlayerBar 主按钮及上述相关状态，不扩展到 manuscript、MiniPlayer、Fullscreen、
全局动效或旧加载/重试 TECHDOC。没有可用 GUI 时必须记录“视觉未验证”，不能用静态检查替代视觉结论。

本轮仅重写技术文档；任何 CSS 实现与应用验收均留给后续获授权的实施任务。
