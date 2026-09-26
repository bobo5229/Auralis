# 全局浅色配色预设

- 状态：预设方案；**尚未写入代码**，供后续分批改造页面时共用。
- 视觉依据：CD 浏览页（`CdAlbumsPage.vue` / `CdTrackList.vue` / `CdFocusLyrics.vue`）已验收的浅灰画布。
- 对照源：当前全局 token 在 `src/renderer/app/styles/main.css`（`:root` 暖黑，`.app-window` Graphite）；应用仍为 dark-only（`useTheme.ts`）。
- 范围：主窗口各页、侧栏、播放栏、设置、弹窗、右键菜单、浮层、迷你播放器、桌面歌词。
- 不改：布局、字号、字族、动效曲线；封面取色链路与沉浸宿主边界保持现有契约。

## 1. 方向摘要

| 角色 | 方向 |
| --- | --- |
| 画布 | 浅冷灰 `#eeeeec`，整窗统一，避免暖纸色 |
| 文字 | 深灰阶：主 `#292929` → 次 `#62625b` → 弱 `#77776f` → 极弱 `#85857d` |
| 边框 | 克制中性灰：默认 `#bdbdb9`，分隔 `#8e8e88`，细线 `#aaa9a3` |
| 交互 | 悬停浅填 `#e1e1de`；选中以深灰字 / 细指示条为主，少用大块色块 |
| 静态强调 | 侧栏选中、焦点环用深灰，**不再使用克制金** |
| 动态强调 | 播放栏 / 迷你 / 全屏等沉浸层继续用封面取色；失败回退中性深灰 |
| 语义色 | 保留错误 / 成功；补一条警告；对比度按浅底微调 |

## 2. 预设变量

命名沿用现有 `--auralis-*`，便于映射与分批替换。下列为**浅色主题建议值**。

### 2.1 背景与表面

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-bg` | `#eeeeec` | 窗口根底、native window `backgroundColor` |
| `--auralis-app-bg` / `--auralis-app-background` | `#eeeeec` | App 画布 fallback |
| `--auralis-main-bg` | `#eeeeec` | `.app-main`、曲库 / 专辑 / 设置等主区 |
| `--auralis-sidebar-bg` | `#e8e8e5` | 侧栏实体表面（略深于画布，形成分区） |
| `--auralis-now-playing-bg` | `rgba(232, 232, 229, 0.92)` | 右侧 Now Playing 面板 |
| `--auralis-dialog-bg` | `#f5f5f3` | 对话框、模态内容底 |
| `--auralis-surface-raised` | `#f5f5f3` | 卡片、抬起控件、设置分区 |
| `--auralis-surface-floating` | `#ffffff` | Popover、右键菜单实体层、迷你窗实体回退 |
| `--auralis-search-bg` | `rgba(245, 245, 243, 0.92)` | 搜索条 |
| `--auralis-context-menu-bg` | `rgba(255, 255, 255, 0.94)` | 右键菜单 / 浮层磨砂底 |
| `--auralis-frosted-surface-bg` | `rgba(245, 245, 243, 0.78)` | 通用磨砂壳（播放栏、队列等） |
| `--auralis-frosted-surface-filter` | `blur(24px) saturate(1.05)` | 与上配套；饱和略低于深色 |
| `--auralis-overlay-bg` | `color-mix(in srgb, #eeeeec 72%, transparent)` | 页面遮罩、半透明幕 |
| `--auralis-artwork-placeholder-bg` | `rgba(41, 41, 41, 0.08)` | 封面占位 |
| `--auralis-artwork-background-fallback` | `#e1e1de` | 无封面时的沉浸背景 fallback |
| `--auralis-album-detail-more-bg` | `#e8e8e5` | 专辑详情「更多作品」等抬起条带 |

### 2.2 文字

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-text` | `#292929` | 标题、正文、主按钮字、选中字 |
| `--auralis-text-muted` | `#62625b` | 次级标签、未选 Tab、歌词非当前、提示 |
| `--auralis-text-subtle` | `#77776f` | 曲目序号、艺人、辅助说明 |
| `--auralis-text-faint` | `#85857d` | 分组小标题、极弱状态文案 |
| `--auralis-text-disabled` | `rgba(41, 41, 41, 0.40)` | 禁用；亦可对控件整体 `opacity: 0.4`（与 CD 按钮一致） |

CD 页另有 `#42423d` / `#55554f` / `#6f6f67` 等近邻色，改造时分别并入 **text** / **muted** / **subtle**，不新增同级 token。

### 2.3 边框与阴影

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-border-subtle` | `#bdbdb9` | 按钮描边、输入框、列表弱分隔 |
| `--auralis-border-strong` | `#8e8e88` | 标题下划线、分区强分隔 |
| `--auralis-playbar-border` | `rgba(41, 41, 41, 0.12)` | 播放栏 / 浮岛描边 |
| `--auralis-search-border` | `rgba(41, 41, 41, 0.12)` | 搜索条边框 |
| `--auralis-context-menu-border` | `rgba(41, 41, 41, 0.10)` | 菜单 / 浮层边框 |
| `--auralis-cover-divider` | `#aaa9a3` | 封面视图分组分隔 |
| `--auralis-cover-track-divider` | `rgba(170, 169, 163, 0.20)` | 曲目行间细线（对应 CD `#aaa9a333`） |
| `--auralis-surface-shadow` | `0 10px 28px rgba(41, 41, 41, 0.10)` | 浮层、迷你窗外阴影 |
| `--auralis-search-shadow` | `0 1px 3px rgba(41, 41, 41, 0.06)` | 搜索条轻阴影 |
| `--auralis-context-menu-shadow` | `0 8px 24px rgba(41, 41, 41, 0.12)` | 菜单 elevation |

### 2.4 控件：默认 / 悬停 / 选中 / 禁用

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-control-bg` | `var(--auralis-surface-raised)` | 默认控件底 |
| `--auralis-control-hover-bg` | `#e1e1de` | 按钮、列表行、侧栏项悬停 |
| `--auralis-control-active-bg` | `rgba(41, 41, 41, 0.08)` | 按下 / 选中浅填 |
| `--auralis-control-primary-bg` | `#292929` | 主操作实心按钮 |
| `--auralis-control-primary-text` | `#eeeeec` | 主按钮字色 |
| `--auralis-sidebar-active-bg` | `rgba(41, 41, 41, 0.08)` | 侧栏选中底 |
| `--auralis-sidebar-active-indicator` | `#292929` | 侧栏指示条 |
| `--auralis-sidebar-active-icon` | `#292929` | 侧栏选中图标 |
| `--auralis-sidebar-active-text` | `#292929` | 侧栏选中文字 |
| `--auralis-song-row-bg` | `transparent` | 普通行 |
| `--auralis-song-row-alt-bg` | `rgba(41, 41, 41, 0.03)` | 斑马纹（若保留） |
| `--auralis-song-row-border` | `rgba(170, 169, 163, 0.35)` | 行边 |
| `--auralis-song-row-now-playing-bg` | `rgba(41, 41, 41, 0.06)` | 当前播放行底 |
| `--auralis-song-row-now-playing-title` | `#292929` | 当前曲名 |
| `--auralis-song-row-now-playing-artist` | `#62625b` | 当前艺人 |
| `--auralis-song-row-now-playing-duration` | `#77776f` | 当前时长 |
| `--auralis-cover-track-bg` | `rgba(245, 245, 243, 0.55)` | 封面视图曲目区 |
| `--auralis-cover-track-hover-bg` | `#e1e1de` | 曲目行悬停 |
| `--auralis-btn-back-bg` | `transparent` | 返回等弱按钮 |
| `--auralis-btn-back-border` | `transparent` | 默认可无边；需要轮廓时用 `border-subtle` |
| `--auralis-btn-back-hover` | `#e1e1de` | 弱按钮悬停 |

禁用：优先 `color: var(--auralis-text-disabled)` + 不可点；实心主按钮可用 `opacity: 0.4`。

### 2.5 焦点、进度、歌词、语义色

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-focus-ring` | `#292929` | `:focus-visible` 描边（CD：`outline: 2px solid #292929`） |
| `--auralis-progress-track` | `rgba(41, 41, 41, 0.12)` | 进度 / 音量轨道 |
| `--auralis-progress-fill` | `#62625b` | 静态进度填充（无取色时） |
| `--auralis-volume-fill` | `#62625b` | 静态音量填充 |
| `--auralis-lyrics-active` | `#292929` | 当前歌词行 |
| `--auralis-lyrics-inactive` | `#85857d` | 非当前歌词 |
| `--auralis-danger` | `#8c4034` | 错误、删除、校验失败（取自 CD 播放错误色） |
| `--auralis-warning` | `#8a6a32` | **新增**：警告、需注意但非破坏性状态 |
| `--auralis-success` | `#5f7a4a` | 成功；略加深以适配浅底对比 |
| `--auralis-artwork-accent-fallback` | `#62625b` | 取色失败时的中性强调（取代深色金） |

### 2.6 播放栏材质专用

| 变量 | 建议值 | 使用场景 |
| --- | --- | --- |
| `--auralis-playbar-bg` | `rgba(245, 245, 243, 0.82)` | 常驻播放栏磨砂底 |
| `--auralis-playbar-highlight` | `rgba(255, 255, 255, 0.55)` | 顶缘高光（浅底宜弱） |
| `--auralis-playbar-highlight-soft` | `rgba(255, 255, 255, 0.28)` | 软高光 |
| `--auralis-playbar-lowlight` | `rgba(41, 41, 41, 0.06)` | 底缘压暗 |
| `--auralis-playbar-album-alpha` | `0.14` | 封面 tint 层默认不透明度（低于深色 `0.28`） |
| `--auralis-playbar-album-saturate` | `1.04` | tint 饱和；浅底避免过艳 |
| `--auralis-playbar-shadow` | `inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(41,41,41,0.06), 0 12px 32px rgba(41,41,41,0.10)` | 浮岛内外阴影 |

动态写入（宿主局部，不进静态壳）：

| 变量 | 说明 |
| --- | --- |
| `--auralis-active-album-accent` | 封面主强调色；用于播放键、进度填充、激活控件 |
| `--auralis-active-album-tint` | 封面氛围色；仅作半透明叠色，不直接当正文色 |
| `--auralis-album-detail-accent` / `--auralis-archive-accent` | 页面级 accent，职责与现深色契约相同 |

窗口 chrome 桥接仍指向静态 token：

```text
--auralis-window-chrome-bg: var(--auralis-bg)
--auralis-window-chrome-accent: var(--auralis-sidebar-active-indicator)
--auralis-window-chrome-border: var(--auralis-border-strong)
```

## 3. 现有变量 → 浅色预设映射

同一变量名切换主题值即可；无「新建同义 token」需求的项直接换值。

| 现有变量（深色现状摘要） | 浅色预设 | 备注 |
| --- | --- | --- |
| `--auralis-bg` `#0c0b0a` / Graphite `#111214` | `#eeeeec` | 与 CD 画布对齐 |
| `--auralis-main-bg` | `#eeeeec` | 主区与根底同色 |
| `--auralis-sidebar-bg` | `#e8e8e5` | 略深分区 |
| `--auralis-dialog-bg` / `surface-raised` / `surface-floating` | `#f5f5f3` / `#f5f5f3` / `#ffffff` | 抬起层级变浅 |
| `--auralis-text` 系列暖米 / Graphite 浅字 | 深灰阶见 §2.2 | 层级语义不变 |
| `--auralis-border-subtle/strong` 暖白低透明 | 实色灰 `#bdbdb9` / `#8e8e88` | 浅底用实色更稳 |
| `--auralis-control-hover-bg` 暖白 8% | `#e1e1de` | 对齐 CD 按钮悬停 |
| `--auralis-control-active-bg` / `sidebar-active-*` 金色系 | 深灰填 + `#292929` 指示 | 静态壳去金 |
| `--auralis-control-primary-bg/text` 金 / 深底 | `#292929` / `#eeeeec` | 主按钮反相 |
| `--auralis-focus-ring` 金 / 浅灰 | `#292929` | 对齐 CD focus |
| `--auralis-progress-fill` / `volume-fill` `#e1ddd6` | `#62625b` | 无取色时的中性填充 |
| `--auralis-playbar-*` 深半透明 | §2.6 | 材质原则见 §4 |
| `--auralis-lyrics-active/inactive` | `#292929` / `#85857d` | 桌面歌词同步 |
| `--auralis-danger` `#c96a55` | `#8c4034` | 贴近 CD 错误色 |
| `--auralis-success` `#8aa36a` | `#5f7a4a` | 浅底加深 |
| （无） | `--auralis-warning` `#8a6a32` | 新增 |
| `--auralis-artwork-accent-fallback` `#9e8558` | `#62625b` | 中性灰回退 |
| 页面局部硬编码金 / indigo fallback | 改读对应 `--auralis-*` 或页面 accent | 改造时收敛，不在本预设扩 token |

专辑详情 / Archive 等页面局部 token（`--auralis-stats-*`、`--auralis-track-list-*`、`--auralis-more-card-*` 等）按「浅底上的低对比灰叠色」重算：用 `rgba(41, 41, 41, 0.03–0.10)` 替代原暖白透明叠色，不单独列入全局预设表。

## 4. 浅底上的播放栏与封面取色

### 4.1 半透明材质

1. **底色走浅磨砂**：`playbar-bg` / `frosted-surface-bg` 以近画布的浅灰半透明为主，配合 blur；避免沿用深色 `rgba(31,28,24,*)`。
2. **轮廓靠淡描边 + 外阴影**：浅底上靠 `playbar-border` 与偏冷的深灰阴影建立浮岛，而不是厚重黑色投影。
3. **高光克制**：保留顶缘细高光即可；`highlight` 透明度低于深色主题，防止发白一块。
4. **文字与图标默认深灰**：播放栏未激活控件用 `--auralis-text` / `text-muted`；只有激活态才切到 album accent。
5. **`prefers-reduced-transparency`**：回退为不透明 `--auralis-surface-floating`（`#ffffff`）或 `--auralis-surface-raised`，保证对比。

### 4.2 封面取色

1. **静态壳（侧栏、列表、设置、普通弹窗）不消费 album accent**——与现深色契约一致。
2. **沉浸宿主**（PlayerBar、Mini Player、Fullscreen、以及页面级 Album Detail / Archive accent）继续写局部 `--auralis-active-album-*`。
3. **Tint 叠在磨砂之上**：浅底建议 tint 混合约 **8%–14%**（深色常见 12%–28%）；过强会导致正文发脏、对比下降。
4. **Accent 只做点缀**：播放键、进度条、音量填充、当前态描边；大面积背景与正文保持中性灰阶。
5. **可读性优先**：取色过亮时加深或降饱和后再用于描边 / 字色；过暗时可略提亮。算法不变时，在消费者边界做 `color-mix` 约束即可。
6. **Fallback**：无封面或 `quality === 'fallback'` 时用 `#62625b`（与 CD focus 环一致），不用金色或 indigo。

### 4.3 迷你播放器与桌面歌词

| 表面 | 原则 |
| --- | --- |
| 迷你播放器 | 实体或轻磨砂浅底；外阴影用 `--auralis-surface-shadow`；播放态可用 accent 外圈，暂停态只用中性阴影 |
| 桌面歌词 | 独立窗仍可用透明 / 描边策略，但**字色阶**与主主题一致：当前 `#292929`，非当前 `#85857d`；避免残留高饱和蓝 |

## 5. 改造时约定

1. 先在主题入口增加 light 值集（或 `data-theme="light"`），再按壳 → 列表 → 设置 / 弹窗 → 播放栏 / 迷你 / 歌词分批替换硬编码。
2. CD 浏览页已是目标方向：接入全局变量时可把局部硬编码改为 `var(--auralis-*)`，视觉应保持不变。
3. 不在本预设阶段改 Uno 调色板业务色、manuscript 纸色体系，或取色 worker。
4. 相关深色审计背景见 [`docs/reviews/播放器主题配色审计报告.md`](../../reviews/播放器主题配色审计报告.md)；本文是浅色统一方向，不替代该报告的深色阶段结论。

## 6. CD 源色速查（实施对照）

| CD 硬编码 | 并入预设 |
| --- | --- |
| `#eeeeec` | `bg` / `main-bg` |
| `#292929` | `text`、`focus-ring`、主按钮、选中指示 |
| `#62625b` / `#62625f` | `text-muted`、accent fallback、静态进度 |
| `#77776f` | `text-subtle` |
| `#85857d` | `text-faint`、非当前歌词 |
| `#bdbdb9` | `border-subtle` |
| `#8e8e88` | `border-strong` |
| `#aaa9a3` / `#aaa9a333` | `cover-divider` / `cover-track-divider` |
| `#e1e1de` | `control-hover-bg` |
| `#8c4034` | `danger` |
| `rgba(0,0,0,0.04/0.12)` 提示态 | 用 `control-active-bg` / `border` 表达，不单列 |
