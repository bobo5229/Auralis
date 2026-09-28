# TECHDOC：封面视图分割线与设备像素取整

- 日期：2026-09-28
- 范围：歌曲页封面视图曲目行，以及复用 `AlbumCoverTrackRow.vue` 的界面
- 状态：已调整绘制方式，静态检查通过；实际窗口的缩放与滚动视觉验收待完成

## 问题与证据

曲目行分割线的 CSS 高度和颜色一致，屏幕上仍呈现粗细差异。
旧实现使用绝对定位伪元素，以 `height: 1px` 和背景色绘制实心矩形：每行的 `::before` 绘制上边界，末行的 `::after` 绘制下边界，行间边界只绘制一次。

本次读取用户提供的原始 PNG（3840 × 2088），而非聊天中缩小后的预览。
在横坐标 x = 2400 处取样，结果如下；坐标从 0 开始：

| 位置                       | 纵坐标 y | 像素厚度 | RGB             |
| -------------------------- | -------- | -------- | --------------- |
| 《不能说的秘密》曲目区顶部 | 485      | 1        | (151, 153, 153) |
| 同一曲目区行间             | 557      | 1        | (151, 153, 153) |
| 同一曲目区底部             | 627–628  | 2        | (151, 153, 153) |

源码中的封面宽度为 250 CSS px，截图对应 375 像素；曲目行高为 48 CSS px，截图中相邻行顶部间距为 72 像素。两者均对应约 1.5 倍的有效比例。

这些证据支持非整数缩放后的栅格化取整是本次差异的主要原因。运行时 DPR 和应用缩放值尚未读取，因此 1.5 是由截图与源码推算的比例，不能直接认定为 Windows 缩放设置。

## 绘制原因

CSS px 是布局单位，最终显示还要映射到设备像素。在有效比例为 1.5 时，1 CSS px 对应 1.5 个设备像素。矩形上下边缘的落点影响像素覆盖和取整结果，本次截图表现为同色线条分别占 1 排和 2 排像素。

排查这类问题需要同时检查厚度与落点：

- 相同的 `height` 和颜色，只能证明样式一致。
- 整数 CSS 坐标乘以非整数 DPR 后，仍可能落在设备像素之间。
- 原图可用于确认像素差异；缩小预览会引入额外重采样。
- 同时排除相邻边框叠加、状态样式和祖先变换，避免仅凭“线条不一致”就归因于缩放。

## 本次处理

修改位置：[AlbumCoverTrackRow.vue](../../../src/renderer/features/library/components/AlbumCoverTrackRow.vue)。

```css
.cover-track-row::before,
.cover-track-row:last-child::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  height: 0;
  border-top: 1px solid var(--auralis-cover-track-divider);
  pointer-events: none;
}
```

移除原有背景色矩形，交由 border 的设备像素宽度取整规则绘制细线。伪元素继续采用原有 `top: 0` / `bottom: 0` 定位，并保留颜色 token、左右缩进以及悬停、选中和当前播放状态下的隐藏规则。

边框位于绝对定位伪元素上，不参与曲目行的正常布局；无需调整行高、分组高度或虚拟列表估算。

`border-top: 1px` 的目标是利用浏览器原生笔画取整提高一致性，不代表在所有 DPR 下都固定为一个物理像素。祖先缩放、合成变换等影响仍需通过实际渲染判断。

## 后续选择原则

普通水平或垂直细线先使用原生 border；需要脱离布局的装饰线由伪元素承载。仅当实际验证仍有问题，或产品明确要求固定物理像素厚度时，再考虑手动对齐。

没有额外 CSS 缩放变换时，手动对齐的基本公式为：

```ts
const dpr = window.devicePixelRatio
const thickness = physicalPixelCount / dpr // physicalPixelCount 为正整数
const alignedY = Math.round(y * dpr) / dpr // y 为线条上边缘的视口坐标
const offsetY = alignedY - y
```

厚度和位置需一起处理。固定写 `0.5px` 或 `scaleY(0.5)` 只适配部分比例；只调整行高也不能保证边缘对齐。手动方案还需要处理滚动、布局变化及跨屏后的 DPR 变化，其测量与更新成本应纳入虚拟列表性能评估。本次采用原生边框方案。

## 验证与当前边界

本次已完成目标组件的 Prettier 检查、`git diff --check` 和 impeccable 样式静态检测，均通过；尚未运行修复后的实际窗口视觉检查。

对本问题进行视觉验收时，按以下范围检查：

1. 在实际 Electron 窗口中记录 `devicePixelRatio`，优先复现用户约 150% 的有效比例，再按需覆盖 100%、125%、200%。
2. 比较同组首线、行间线、末线及不同专辑组；滚动停止后再次比较。使用原始分辨率截图检查厚度和颜色。
3. 检查悬停、选中及当前播放状态附近的线条隐藏和恢复，确认行高、封面顶对齐及虚拟滚动位置保持正常。

上述检查用于本类像素绘制问题，按改动风险选取；静态检测通过不等同于完成视觉验收。

## 参考

- [CSS Values and Units：边框宽度的设备像素取整](https://www.w3.org/TR/css-values-4/#snap-a-length-as-a-border-width)
- [MDN：devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
- [MDN：getBoundingClientRect 与视口、滚动坐标](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
