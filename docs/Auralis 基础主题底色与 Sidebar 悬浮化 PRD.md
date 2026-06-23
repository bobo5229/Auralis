# Auralis 基础主题底色与 Sidebar 悬浮化 PRD

## 1. 需求背景

当前 Auralis 已完成基础桌面播放器框架，包括左侧 Sidebar、中间 Main Content、右侧 Now Playing / Lyrics Panel，以及底部悬浮 Playbar。

现阶段需要先统一播放器的基础视觉空间，建立浅色主题与深色主题下的大面积底色规则，并将左侧 Sidebar 从传统“贴边顶到底”的侧栏，调整为更具桌面播放器质感的悬浮圆角面板。

本次需求只处理基础布局质感与大面积配色，不处理按钮 hover、active、播放状态色、蓝色高亮系统等细节。

## 2. 产品目标

1. 建立 Auralis 浅色 / 深色主题下的基础面板底色。
2. 让左侧 Sidebar 从“系统侧边栏”变成“悬浮导航面板”。
3. 保持右侧歌词 / Now Playing Panel 顶到底的固定侧栏样式。
4. 通过细线描边增强 Sidebar 和右侧 Panel 的边界感。
5. 不破坏当前 Electron + Vue 应用架构，不影响已有路由、数据库、IPC 和扫描逻辑。

## 3. 设计原则

本次设计重点是“空间感”，不是“装饰感”。

左侧 Sidebar 应该像一个独立放置在播放器空间中的导航卡片，因此需要有外边距、圆角和完整描边。

右侧歌词 / Now Playing Panel 仍然是应用框架的一部分，不做悬浮，不做圆角，不加外边距。它只需要通过一条左边框与 Main Content 区分。

中间 Main Content 是主舞台，保持干净、克制，使用播放器主面板底色。

## 4. 技术边界

本需求只属于 renderer 层 UI 调整。

禁止修改：

```text
src/main/
src/preload/
src/shared/
```

禁止新增 IPC。

禁止修改数据库、Repository、Service、扫描逻辑、元数据解析逻辑。

禁止重构路由。

禁止修改播放业务逻辑。

本次主要可能涉及：

```text
src/renderer/app/layout/AppSidebar.vue
src/renderer/app/layout/NowPlayingPanel.vue
src/renderer/app/layout/PlayerBar.vue  如果受布局影响才可少量调整
src/renderer/app/layout/AppShell.vue   如果当前项目存在该文件
src/renderer/styles/*                  如果项目已有全局主题变量文件
```

如果项目已有 theme.css、variables.css、tokens.css 或 UnoCSS theme token，请优先复用现有结构，不要重复创造多套变量系统。

## 5. 基础颜色规范

### 5.1 浅色主题

浅色主题下：

```text
播放器主面板 / Main Content 背景：#FFFFFF
左侧 Sidebar 背景：#FAFAFB
右侧 Lyrics / Now Playing Panel 背景：#FAFAFB
```

建议 token：

```css
:root {
  --auralis-bg: #FFFFFF;
  --auralis-main-bg: #FFFFFF;
  --auralis-sidebar-bg: #FAFAFB;
  --auralis-now-playing-bg: #FAFAFB;

  --auralis-border-subtle: rgba(31, 35, 40, 0.08);
}
```

### 5.2 深色主题

深色主题下：

```text
播放器主面板 / Main Content 背景：#1F1F1F
左侧 Sidebar 背景：#232324
右侧 Lyrics / Now Playing Panel 背景：#232324
```

建议 token：

```css
[data-theme='dark'] {
  --auralis-bg: #1F1F1F;
  --auralis-main-bg: #1F1F1F;
  --auralis-sidebar-bg: #232324;
  --auralis-now-playing-bg: #232324;

  --auralis-border-subtle: rgba(255, 255, 255, 0.08);
}
```

说明：

本次只定义基础底色和边框色。蓝色主题色、hover、active、focus、progress、selected 等状态色后续单独设计。

## 6. 整体布局关系

当前应用壳结构为：

```text
┌──────────┬─────────────────────┬──────────────┐
│ Sidebar  │     Main Content    │ Now Playing  │
│  232px   │                     │  292px (xl)  │
└──────────┴─────────────────────┴──────────────┘
│              Player Bar (fixed bottom)         │
└────────────────────────────────────────────────┘
```

目标结构调整为：

```text
┌──────────────────────────────────────────────────────┐
│  ┌──────────────┐   Main Content      │ Now Playing  │
│  │   Sidebar    │                     │              │
│  │   floating   │                     │ top-to-bottom│
│  └──────────────┘                     │              │
└───────────────────────────────────────┴──────────────┘
```

核心变化：

1. 左侧 Sidebar 变为悬浮圆角矩形。
2. Sidebar 不再与窗口顶部和底部连接。
3. Sidebar 左侧、顶部、底部需要留出外边距。
4. 右侧 Now Playing / Lyrics Panel 保持顶到底结构。
5. 右侧 Panel 不悬浮、不圆角、不加外边距。
6. Main Content 保持主背景色。
7. 底部 Playbar 保持现有悬浮方案，不在本需求中重构。

## 7. 左侧 Sidebar 需求

### 7.1 形态

左侧 Sidebar 需要从当前贴边侧栏改为悬浮圆角矩形。

要求：

```text
- 保持原有导航内容
- 保持原有路由跳转逻辑
- 保持原有当前选中状态逻辑
- 保持宽度约 232px
- 不再贴住窗口顶部
- 不再贴住窗口底部
- 左侧、顶部、底部有外边距
- 整体为圆角矩形
- 外边缘有灰色细线描边
```

### 7.2 建议尺寸

```text
Sidebar 宽度：232px
外边距：12px 或 16px
圆角：20px
边框：1px solid var(--auralis-border-subtle)
```

推荐视觉：

```css
.app-sidebar {
  width: 232px;
  height: calc(100vh - 24px);
  margin: 12px 0 12px 12px;
  border-radius: 20px;
  background: var(--auralis-sidebar-bg);
  border: 1px solid var(--auralis-border-subtle);
  overflow: hidden;
}
```

如果使用 16px 外边距：

```css
.app-sidebar {
  height: calc(100vh - 32px);
  margin: 16px 0 16px 16px;
}
```

### 7.3 描边

Sidebar 的描边应该是完整四边描边，因为它是悬浮圆角矩形。

浅色主题中描边应非常轻，避免变成明显灰框。

深色主题中描边应略微可见，用于从深色背景中分离 Sidebar。

推荐：

```css
border: 1px solid var(--auralis-border-subtle);
```

### 7.4 阴影

P0 阶段阴影不是必须项。

如果需要阴影，应非常克制。

浅色主题：

```css
box-shadow: 0 18px 48px rgba(31, 35, 40, 0.04);
```

深色主题：

```css
box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
```

如果当前界面加阴影后显得太“卡片化”，可以先取消阴影，只保留圆角、外边距和描边。

## 8. 右侧 Lyrics / Now Playing Panel 需求

### 8.1 形态保持

右侧 Lyrics / Now Playing Panel 不做悬浮化。

要求：

```text
- 保持当前顶到底布局
- 保持贴右侧边缘
- 不增加外边距
- 不增加圆角
- 不改为卡片
- 不改变内部内容结构
```

### 8.2 背景色

浅色主题：

```css
background: #FAFAFB;
```

深色主题：

```css
background: #232324;
```

建议使用 token：

```css
background: var(--auralis-now-playing-bg);
```

### 8.3 左边框

右侧 Panel 只加左边框，不加四边描边。

原因：

右侧 Panel 是固定侧栏，不是悬浮卡片。它只需要与 Main Content 之间形成清晰但克制的结构分割。

推荐：

```css
.now-playing-panel {
  background: var(--auralis-now-playing-bg);
  border-left: 1px solid var(--auralis-border-subtle);
}
```

不要添加：

```css
border-radius
margin
box-shadow
完整四边 border
```

## 9. Main Content 需求

Main Content 使用播放器主背景色。

浅色主题：

```css
background: #FFFFFF;
```

深色主题：

```css
background: #1F1F1F;
```

建议：

```css
.main-content {
  background: var(--auralis-main-bg);
}
```

Sidebar 悬浮后，Main Content 与 Sidebar 之间应保留适当间距，避免圆角 Sidebar 紧贴内容区。

建议间距：

```text
12px - 16px
```

如果当前 layout 使用 grid 或 flex，需要注意 Sidebar 的 margin 会影响整体宽度计算。

## 10. App Shell 背景

App Shell 最外层背景应与 Main Content 主背景一致。

建议：

```css
.app-shell {
  background: var(--auralis-bg);
}
```

这样 Sidebar 的 `#FAFAFB / #232324` 才能从主背景中轻微浮出。

## 11. 与 Playbar 的关系

本次不重构 Playbar。

但需要保证：

1. Sidebar 悬浮后不会与底部 Playbar 视觉冲突。
2. Sidebar 底部外边距应让它不贴住窗口底部。
3. 如果 Playbar 位于底部中央，Sidebar 不应遮挡 Playbar。
4. Main Content 仍需保留底部安全距离，避免内容被 Playbar 遮挡。

## 12. 响应式要求

P0 阶段优先保证常规桌面窗口下显示正常。

需要注意：

1. Sidebar 外边距不能导致整体布局横向溢出。
2. 小窗口下 Main Content 不应被挤压到不可用。
3. Right Panel 的顶到底结构保持稳定。
4. Sidebar 圆角和描边不应因为窗口缩放而丢失。

## 13. 非目标

本次不做以下内容：

```text
- 不设计蓝色主题色
- 不设计 hover 态
- 不设计 active 态
- 不设计 selected 态
- 不设计播放进度条颜色
- 不调整按钮图标颜色
- 不重构 Playbar
- 不重构 Now Playing 内部内容
- 不调整播放器业务逻辑
- 不新增 IPC
- 不修改 main / preload / shared
- 不修改数据库和扫描逻辑
```

## 14. 验收标准

完成后需要满足：

1. 浅色主题下：

   * Main Content / 应用主背景为 `#FFFFFF`
   * Sidebar 背景为 `#FAFAFB`
   * Right Lyrics / Now Playing Panel 背景为 `#FAFAFB`

2. 深色主题下：

   * Main Content / 应用主背景为 `#1F1F1F`
   * Sidebar 背景为 `#232324`
   * Right Lyrics / Now Playing Panel 背景为 `#232324`

3. 左侧 Sidebar：

   * 是悬浮圆角矩形
   * 不再贴住窗口顶部
   * 不再贴住窗口底部
   * 左侧有外边距
   * 四周有灰色细线描边
   * 原有导航内容不丢失
   * 原有路由跳转正常
   * 原有选中态逻辑不受影响

4. 右侧 Lyrics / Now Playing Panel：

   * 仍然保持顶到底布局
   * 不悬浮
   * 不圆角
   * 不增加外边距
   * 只在左侧增加灰色细线边框

5. Main Content：

   * 背景色正确
   * 与悬浮 Sidebar 之间有合理间距
   * 页面内容不被异常挤压

6. 工程约束：

   * 不修改 main / preload / shared
   * 不新增 IPC
   * 不影响数据库、扫描、元数据解析
   * `npm run dev` 正常启动
   * 无明显 TypeScript / ESLint 错误

## 15. 建议实现顺序

1. 先检查当前主题变量系统。
2. 如果已有全局 CSS variables，则加入基础背景 token。
3. 如果没有，则新增最小必要 token，不要建立复杂设计系统。
4. 修改 App Shell / Main Content 背景。
5. 修改 AppSidebar 为悬浮圆角形态。
6. 给 AppSidebar 增加四边细线描边。
7. 修改 NowPlayingPanel 背景。
8. 给 NowPlayingPanel 增加左边框。
9. 检查浅色主题显示。
10. 检查深色主题显示。
11. 检查 Sidebar 路由和选中态。
12. 运行项目验证。
