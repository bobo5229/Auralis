# Auralis 基础主题底色与 Sidebar 悬浮化技术设计

## 1. 技术结论

本需求是纯 Renderer 层视觉结构调整。实现时只应修改全局主题 token、App Shell 布局 shortcut，以及 Sidebar / Now Playing Panel 的样式结构。

禁止修改：

```text
src/main/
src/preload/
src/shared/
```

禁止新增 IPC、数据库迁移、Repository、Service 或扫描逻辑。

## 2. 当前实现状态

当前全局应用壳在 `src/renderer/App.vue`：

```text
AppSidebar
app-main / RouterView
NowPlayingPanel
PlayerBar
```

当前布局样式主要在 `uno.config.ts` 的 shortcuts 中：

```text
app-shell
app-sidebar
app-main
now-playing-panel
player-bar
```

全局 CSS 在 `src/renderer/app/styles/main.css`，目前还没有主题变量系统。因此推荐在该文件中新增最小必要 CSS variables。

## 3. Theme Token 方案

在 `main.css` 的 `:root` 中新增浅色主题 token：

```css
:root {
  --auralis-bg: #ffffff;
  --auralis-main-bg: #ffffff;
  --auralis-sidebar-bg: #fafafb;
  --auralis-now-playing-bg: #fafafb;
  --auralis-border-subtle: rgba(31, 35, 40, 0.08);
}
```

同时预留深色主题：

```css
[data-theme='dark'] {
  --auralis-bg: #1f1f1f;
  --auralis-main-bg: #1f1f1f;
  --auralis-sidebar-bg: #232324;
  --auralis-now-playing-bg: #232324;
  --auralis-border-subtle: rgba(255, 255, 255, 0.08);
}
```

说明：本阶段只定义大面积底色和细边框色。hover、active、selected、progress、蓝色高亮不在本次范围内。

## 4. App Shell 布局方案

`app-shell` 继续使用 CSS Grid，但需要为悬浮 Sidebar 预留外边距。

推荐 grid：

```text
grid-template-columns:
  260px minmax(0, 1fr)

xl:
  260px minmax(0, 1fr) 292px
```

原因：Sidebar 自身仍保持 232px 宽，左侧 12px margin，加上 Sidebar 与 Main Content 之间约 16px 间距，总列宽约 260px。这样不会让 Sidebar margin 挤压 Main Content 的计算。

`app-shell` 背景使用：

```css
background: var(--auralis-bg);
```

## 5. Sidebar 悬浮化方案

`AppSidebar.vue` 结构不需要重写，导航数组和 `RouterLink` 逻辑保持不变。

只调整 `app-sidebar` shortcut：

```css
width: 232px;
height: calc(100vh - 24px);
margin: 12px 0 12px 12px;
border-radius: 20px;
background: var(--auralis-sidebar-bg);
border: 1px solid var(--auralis-border-subtle);
overflow: hidden;
```

UnoCSS shortcut 推荐包含：

```text
w-[232px]
h-[calc(100vh-24px)]
m-[12px_0_12px_12px]
rounded-[20px]
border
border-[var(--auralis-border-subtle)]
bg-[var(--auralis-sidebar-bg)]
overflow-hidden
```

P0 不加阴影。原因是当前目标是空间感，不是卡片装饰感；先用外边距、圆角和描边即可。

## 6. Main Content 方案

`app-main` 保持滚动容器职责：

```css
min-height: 0;
overflow-y: auto;
padding-bottom: 7rem;
background: var(--auralis-main-bg);
```

不修改现有路由，不修改页面组件的业务内容。`content-frame` 可以保持当前宽度和内边距。

Sidebar 悬浮后的 Main Content 间距由 `app-shell` 第一列宽度和 Sidebar margin 共同保证，不建议在每个页面里额外加特殊 margin。

## 7. Now Playing Panel 方案

`NowPlayingPanel.vue` 内部结构不改。只调整 `now-playing-panel` shortcut：

```css
background: var(--auralis-now-playing-bg);
border-left: 1px solid var(--auralis-border-subtle);
```

必须避免：

```text
margin
border-radius
box-shadow
完整四边 border
```

右侧 Panel 仍是应用框架固定侧栏，不做悬浮。

Panel 内部已有顶部 `border-b border-black/8`。建议同步替换为 token 风格，避免浅/深主题边框不一致：

```text
border-b border-[var(--auralis-border-subtle)]
```

## 8. Player Bar 影响范围

本次不重构 Player Bar。

仅在发现 Sidebar 底部与 Player Bar 视觉冲突时，允许微调 `app-sidebar` 的 bottom margin 或 padding。不要修改播放按钮结构，不新增播放业务状态。

## 9. 实施顺序

推荐按以下顺序实现：

1. 在 `main.css` 新增主题 token。
2. 修改 `uno.config.ts` 中的 `app-shell` 背景和列宽。
3. 修改 `app-sidebar` 为 232px 悬浮圆角面板。
4. 修改 `app-main` 背景为 `var(--auralis-main-bg)`。
5. 修改 `now-playing-panel` 背景和左边框 token。
6. 将 Now Playing 内部顶部边框替换为 token。
7. 运行类型检查、lint、build。
8. 启动应用做视觉验收。

## 10. 验收标准

浅色主题：

- App Shell / Main Content 背景为 `#FFFFFF`。
- Sidebar 背景为 `#FAFAFB`。
- Now Playing Panel 背景为 `#FAFAFB`。

Sidebar：

- 宽度保持约 232px。
- 左侧、顶部、底部有 12px 外边距。
- 四角圆角约 20px。
- 四边都有细线描边。
- 原有导航内容、路由跳转、active-class 不变。

Now Playing Panel：

- 仍然顶到底、贴右侧。
- 不悬浮、不圆角、不加外边距。
- 只有左边框用于分隔 Main Content。

工程约束：

- 不修改 `src/main/`、`src/preload/`、`src/shared/`。
- 不新增 IPC。
- 不影响曲库扫描、数据库、metadata 解析。
- `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 通过。

## 11. 风险与处理

主要风险是 Sidebar margin 进入 grid 后挤压 Main Content。因此必须把第一列从 232px 调整为约 260px，而不是只给 Sidebar 加 margin。

第二个风险是深色主题 token 被定义但尚无主题切换入口。P0 只需要预留 `[data-theme='dark']`，不实现主题切换 UI。
