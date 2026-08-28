# TECHDOC：modern PlayerBar 外壳圆角增大

- 日期：2026-08-29
- 状态：待实现；本文是技术方案，不代表样式已修改或视觉验收通过。
- 范围：仅主页面 modern PlayerBar 外壳；不写 PRD，不接手播放按钮、播放流程或历史纽扣任务。
- 验收等级：A 级局部表现调整，依据 [风险分级验收](./docs/rules/validation.md)。

## 1. 目标与边界

将 modern PlayerBar 的悬浮岛外壳圆角从 `18px` 调整为 `28px`，使 72px 高的播放栏两端更圆润。
本次不是满胶囊处理，不采用 `32px` 备选值。

- 两种 modern 材质（`cover-tint`、`liquid-glass`）共同适用。
- 保持 `height: 72px`、宽度、定位、`padding`、内容布局和现有外壳阴影参数不变。
- 保持封面、播放按钮自身的形状、颜色和阴影参数不变。
- 不修改 manuscript PlayerBar、MiniPlayer、Fullscreen 或桌面歌词。
- 不新增 token、DOM、`overflow` 裁剪、脚本状态或播放逻辑。

## 2. 唯一改动落点

只修改 [main.css](./src/renderer/app/styles/main.css) 中的 modern 外壳选择器：

```css
/* src/renderer/app/styles/main.css */
.player-bar[data-player-presentation='modern'] .player-bar-island {
  border-radius: 28px;
}
```

上面的代码示意表示唯一预期差异；实际编辑应保留该规则中的其他声明及工作区已有 dirty 修改。
`.player-bar[data-player-presentation='modern']` 宿主仍维持透明、72px 高和既有定位，宿主自身的
`border-radius: 0` 不应被改写。

## 3. 圆角继承链

外壳当前的高光层 `.player-bar-island::before` 已使用 `border-radius: inherit`；玻璃层
`.player-bar-glass` 与染色层 `.player-bar-album-tint` 也已使用 `border-radius: inherit`。
因此改动外壳为 `28px` 后，三层沿用既有继承链即可，不额外硬编码半径，也不增加新的层或裁剪。
应确认高光、玻璃和染色边缘与外壳一致，无层错位；弹层仍依赖现有 `overflow: visible`。

## 4. A 级最小验收

1. 文档阶段检查本文件；实施阶段核对本次 CSS 差异仅含 modern 外壳圆角变更，保留已有无关修改。
2. 定向检查 `main.css` 选择器与继承链，确认高度、定位、宽度、内边距、布局和阴影没有变化。
3. 有现成 GUI 时查看 modern 两种材质的播放栏两端：圆角连续、玻璃/染色/高光无错位，内容无裁切。
4. 通过差异确认 `overflow` 未改变，不为本次圆角调整重验菜单功能。
5. 不运行全量 test、lint、typecheck、build，不搭建 GUI 平台；无 GUI 时如实记录“视觉未验证”。

本 TECHDOC 只供后续获授权的样式实施与主进程统一文档检查使用；本轮不实施 CSS。
