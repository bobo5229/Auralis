# Auralis 悬浮 Playbar PRD

## 1. 需求背景

当前 Auralis 已完成基础桌面应用框架，包括左侧 Sidebar、中间 Main Content、右侧 Now Playing 面板以及底部 Playbar。现有 Playbar 以全宽底栏形式存在，视觉上更像系统状态栏，整体较重，也不够接近音乐播放器的核心体验。

本需求希望将底部 Playbar 改造为类似 Apple Music 桌面端的悬浮播放控制胶囊。目标不是复刻 Apple Music 的 UI，而是借鉴其布局逻辑：让播放控制成为一个轻量、集中、稳定的悬浮控制岛。

## 2. 产品目标

将当前全宽底部 Playbar 改造为悬浮式 Playbar，使其在视觉上更轻、更聚焦，并成为播放器界面的核心控制组件。

P0 阶段只实现布局与静态交互骨架，不要求接入完整播放业务逻辑。

## 3. 设计原则

Playbar 应该是悬浮层，而不是底部布局层。

它应该固定在应用窗口底部附近，并相对于主内容区域视觉居中，不随页面滚动，不因路由切换消失。

Playbar 不应横跨整个窗口，也不应贴住 Sidebar 或 Right Panel。它应该表现为一个独立的圆角胶囊容器。

整体视觉应简洁、克制、稳定。不要为了模仿 Apple Music 而加入复杂毛玻璃、动画或过度装饰。

## 4. 功能范围

### 4.1 P0 范围

本次只实现以下内容：

1. 将 Playbar 从全宽底栏改为悬浮胶囊。
2. Playbar 内部从左至右依次布局：

   * 上一首
   * 播放 / 暂停
   * 下一首
   * 进度条 + 专辑信息
   * 播放队列
   * 播放模式
   * 音量调节
3. 实现“进度条 + 专辑信息”区域的静态结构。
4. 无歌曲播放时，中间区域显示品牌/占位符，参考当前 Apple Music 空状态样式，但不能使用 Apple Logo。
5. 保持现有功能正常运行，不破坏当前 Electron + Vue 项目结构。
6. 保持 Sidebar、Main Content、Right Panel 当前布局稳定。
7. 主内容区底部保留安全间距，避免被悬浮 Playbar 遮挡。

### 4.2 暂不实现

P0 阶段不实现以下内容：

1. 真实音频播放状态联动。
2. 真实播放进度拖拽。
3. 全屏播放界面。
4. 点击封面跳转全屏播放的真实路由。
5. 播放队列弹层。
6. 播放模式真实切换逻辑。
7. 音量真实调节逻辑。
8. 复杂动画、毛玻璃、高级过渡效果。

## 5. Playbar 总体布局

悬浮 Playbar 从左到右依次为：

```text
上一首 | 播放/暂停 | 下一首 | 进度条+专辑信息 | 播放队列 | 播放模式 | 音量调节
```

结构示意：

```text
┌──────────────────────────────────────────────────────────────┐
│  Prev   Play   Next    [Cover] Song Title       Queue Mode Vol │
│                           Album Artist - Album                 │
│                         ━━━━━━━━━━━━━━━━━━━━━━━                │
└──────────────────────────────────────────────────────────────┘
```

Playbar 应固定在窗口底部，表现为一个悬浮胶囊：

```text
position: fixed;
bottom: 24px;
```

宽度建议：

```text
width: min(960px, calc(100vw - sidebarWidth - rightPanelWidth - 48px));
min-width: 720px;
```

如果当前项目不方便动态计算 Sidebar 和 Right Panel 宽度，可以先使用固定最大宽度与自适应宽度：

```text
width: min(960px, calc(100vw - 320px));
```

小窗口下需要避免布局崩坏，必要时可压缩中间信息区。

## 6. 进度条 + 专辑信息区域

### 6.1 区域定位

“进度条 + 专辑信息”是 Playbar 的核心信息区，承担当前播放内容展示与播放进度展示。

该区域不是普通按钮，也不是纯进度条，而是当前播放内容的“信息名片”。

### 6.2 显示内容

有歌曲播放时，专辑信息包括：

```text
专辑封面
歌曲名称
专辑艺术家 - 专辑
```

文本结构为两行：

```text
歌曲名称
专辑艺术家 - 专辑
```

不显示当前时间和总时长。

### 6.3 布局结构

该区域分为上下两层。

上层为专辑封面 + 两行歌曲信息：

```text
[专辑封面]  歌曲名称
          专辑艺术家 - 专辑
```

下层为进度条：

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

进度条必须放在专辑封面和歌曲信息下方，并且进度条左边缘与专辑封面左边缘对齐。

完整结构：

```text
┌──────┐  歌曲名称
│封面  │  专辑艺术家 - 专辑
└──────┘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

不要让进度条只与文字区域左对齐。错误示例：

```text
┌──────┐  歌曲名称
│封面  │  专辑艺术家 - 专辑
└──────┘  ━━━━━━━━━━━━━━━━━
```

### 6.4 封面与文字高度关系

专辑封面与右侧两行歌曲信息需要形成视觉等高的信息单元。

例如封面尺寸为 `44px × 44px`，则右侧文字容器高度也应为 `44px`。

推荐实现：

```css
.track-cover {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex: 0 0 auto;
}

.track-text {
  height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.track-title {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-subtitle {
  font-size: 12px;
  line-height: 16px;
  opacity: 0.68;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

两行文字不需要物理撑满封面高度，但视觉上需要与封面高度匹配，避免文字漂浮在封面中部或只占据上半部分。

### 6.5 进度条规格

进度条位于封面 + 歌曲信息下方。

进度条左边缘与专辑封面左边缘对齐。

进度条宽度应占据整个 TrackProgressInfo 区域，右侧保留适当间距，不贴近播放队列按钮。

推荐样式：

```css
.track-progress {
  width: 100%;
  height: 3px;
  border-radius: 999px;
  overflow: hidden;
}

.track-progress-fill {
  height: 100%;
  width: var(--progress, 0%);
}
```

P0 阶段可使用静态进度值，例如 `0%` 或 mock 数据。

### 6.6 长文本处理

歌曲名称和“专辑艺术家 - 专辑”均必须单行显示。

超出宽度时使用省略号，不允许换行，不允许撑开 Playbar。

```css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

P0 阶段不实现跑马灯。

## 7. 空状态

当没有歌曲播放时，Playbar 中间信息区不显示复杂文字，不显示“No track selected”。

空状态参考用户提供的 Apple Music 样式：中间区域显示一个简洁的品牌/占位符。

注意：不能使用 Apple Logo。

建议使用以下之一：

1. Auralis 的简化 Logo。
2. 字母 A 标识。
3. 唱片 / 音符类通用图标。
4. 临时品牌文字 Auralis。

空状态下：

* 左侧上一首、播放/暂停、下一首可以保持禁用或弱化状态。
* 中间显示品牌占位。
* 右侧播放队列、播放模式、音量调节可以保留，但无实际功能。
* 进度条不显示，或显示为 0% 的弱化状态。

## 8. 点击交互

P0 阶段只预留交互语义，不实现完整跳转。

有歌曲播放时：

* 点击专辑封面，未来应跳转至全屏播放界面。
* P0 可以只添加 `cursor: pointer` 和空的 handler，例如 `handleCoverClick`。
* 不要在 P0 阶段实现全屏播放页面。
* 不要让点击歌曲文字区域触发跳转，当前只要求专辑封面可点击。

播放按钮、上一首、下一首、播放队列、播放模式、音量调节可以保留当前已有逻辑；如果当前没有逻辑，则使用占位函数，不要引入复杂状态管理。

## 9. 组件拆分建议

建议将 Playbar 拆分为以下结构：

```text
PlayerBar.vue
├─ TransportControls.vue
│  ├─ PrevButton
│  ├─ PlayPauseButton
│  └─ NextButton
├─ TrackProgressInfo.vue
│  ├─ AlbumCover
│  ├─ TrackText
│  └─ ProgressBar
└─ PlaybackActions.vue
   ├─ QueueButton
   ├─ PlayModeButton
   └─ VolumeControl
```

如果当前项目还比较简单，也可以先只新增 `TrackProgressInfo.vue`，其余按钮继续保留在 `PlayerBar.vue` 内。

P0 推荐最小拆分：

```text
PlayerBar.vue
TrackProgressInfo.vue
```

## 10. 样式要求

Playbar 容器应具备：

* 悬浮定位
* 大圆角
* 轻微边框
* 轻微阴影
* 适度半透明背景或纯色背景
* 内部元素垂直居中
* 不铺满整个窗口宽度

推荐方向：

```css
.player-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  height: 72px;
  width: min(960px, calc(100vw - 320px));
  border-radius: 999px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 20px;
  z-index: 50;
}
```

注意：具体颜色、阴影、边框应结合当前项目主题变量，不要硬编码过多视觉风格。

## 11. 布局安全区

由于 Playbar 是悬浮层，不再占据正常文档流，Main Content 底部必须保留安全距离。

建议主内容滚动区域增加：

```css
padding-bottom: 112px;
```

避免页面底部内容被悬浮 Playbar 遮挡。

## 12. 响应式要求

窗口缩小时：

1. Playbar 不应超出窗口边界。
2. 中间 TrackProgressInfo 区域应优先压缩。
3. 歌曲名和副信息使用省略号。
4. 按钮区域保持固定宽度。
5. 必要时音量滑杆可收缩为图标按钮。

P0 阶段可以先保证常规桌面窗口下正常显示，不强制适配极小窗口。

## 13. 验收标准

完成后应满足以下条件：

1. 底部 Playbar 不再是全宽底栏，而是悬浮胶囊。
2. Playbar 固定在窗口底部附近，不随页面滚动。
3. Playbar 内部顺序为：上一首、播放/暂停、下一首、进度条+专辑信息、播放队列、播放模式、音量调节。
4. 有歌曲数据时，中间区域显示专辑封面、歌曲名称、“专辑艺术家 - 专辑”。
5. 两行歌曲信息的视觉高度与专辑封面高度匹配。
6. 进度条位于专辑封面和歌曲信息下方，并与专辑封面左边缘对齐。
7. 歌曲名和副信息过长时使用省略号，不撑破布局。
8. 无歌曲播放时，中间区域显示 Auralis 品牌/占位符，不使用 Apple Logo。
9. 点击专辑封面预留未来进入全屏播放界面的交互入口。
10. 不破坏现有 Sidebar、Main Content、Right Panel 布局。
11. 不破坏现有路由和开发环境。
12. 项目仍可通过 `npm run dev` 正常启动。

## 14. 给 Codex 的执行要求

请先阅读当前项目结构，理解现有 `PlayerBar`、`AppShell`、路由和样式组织方式。

请不要一次性重构整个播放器项目。

优先完成 Playbar 的 P0 布局改造。

修改前请说明：

1. 当前 Playbar 组件位于哪里。
2. 你准备修改哪些文件。
3. 是否需要新增 `TrackProgressInfo.vue`。
4. 是否会影响现有页面布局。

修改后请说明：

1. 改动了哪些文件。
2. 如何运行项目验证。
3. 哪些功能只是预留，尚未实现真实逻辑。
