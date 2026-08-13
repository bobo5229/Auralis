# TECHDOC：手稿 PlayerBar 吸底页脚（Phase 23）

- **日期**：2026-08-13
- **状态**：设计冻结，未实现
- **前置状态**：Phase 18 工程完成、Electron 人工矩阵待确认；Phase 22 工程完成、人工待确认
- **覆盖对象**：普通主窗口、`data-player-presentation='manuscript'` 的 PlayerBar
- **明确排除**：modern PlayerBar、Now Playing 内容设计、Fullscreen、Miniplayer、桌面歌词独立窗口

## 1. 结论

Phase 23 将普通主窗口手稿皮肤下的 PlayerBar 从居中悬浮胶囊改为吸附窗口底部的连续手稿页脚。
它从 Sidebar 所在 grid track 的右边界开始，横跨主内容与可见的 Now Playing 列，右侧与底部贴紧
客户区边缘。

本阶段不是新建第二套播放器。独立的是手稿 presentation 的布局和视觉表达；播放状态、队列、
歌词同步、进度、音量和模式控制继续复用现有 PlayerBar 与 playback composable。

Phase 23 只覆盖手稿呈现。流光皮肤继续使用现有悬浮 PlayerBar，且 Miniplayer、Fullscreen 与
桌面歌词窗口保持各自的现代基线。

## 2. 文档归属与约束覆盖

本 TECHDOC 放在 `docs/library-manuscript-skin-mvp/phase23/`，原因如下：

1. 它是 Phase 18 播放表面手稿化的后续几何与信息架构调整，不是独立产品专题。
2. Phase 19、20、21 已分别预留给 Fullscreen、Miniplayer 和桌面歌词。
3. Phase 22 已用于歌曲列表页取消整页卡片，因此本阶段使用 Phase 23。

本文件仅对下列旧约束作定向覆盖：

- Phase 18 中“手稿与 modern 共用 PlayerBar 主要宽度公式和固定悬浮几何”的约束；
- Phase 22 中“手稿 Playbar 继续浮在连续主栏纸面上”的描述。

覆盖范围只限 manuscript PlayerBar。Phase 18 建立的 player presentation、owner scope、palette
gate、material 正交性、overlay 键盘模型与生命周期约束继续有效。

## 3. 已冻结产品决策

| 决策项 | 冻结结论 |
| ------ | -------- |
| 皮肤范围 | 只改普通主窗口的 manuscript PlayerBar |
| modern | 保持现有流光悬浮 PlayerBar，不改变几何、材质或行为 |
| 窗口范围 | Fullscreen、Miniplayer、桌面歌词独立窗口不变 |
| 定位模型 | 继续使用 `position: fixed`，不进入 AppShell grid flow |
| 高度 | 固定 72px |
| 左边界 | 260px，与主内容 grid track 起点严格对齐 |
| 右边界 | `right: 0` |
| 底边界 | `bottom: 0` |
| 圆角 | 仅左上、右上 16px；底部两个角为直角 |
| 空状态 | 无当前曲时仍显示完整底栏，几何不跳动 |
| 内容避让 | manuscript 下主内容与 Now Playing 均预留 88px |
| 视觉 | 连续手稿纸面、顶部细线、轻微内阴影、无悬浮外投影 |
| 内部布局 | 左曲目信息与进度、中传输控制、右操作与音量 |
| 中心基准 | 传输控制相对主内容列居中，不相对整条底栏居中 |
| `xl` | 右侧操作区归入 Now Playing 列，并显示低对比竖向分隔线 |
| 窄窗 | 依据 PlayerBar 容器宽度折叠常驻音量滑杆 |
| 折叠音量 | hover 或 `focus-within` 时向上展开紧凑滑杆；点击按钮仍静音 |
| Player overlay | 队列、模式菜单和歌词提示继续向上展开 |
| 风格切换 | 立即切换，不做位置、宽度或圆角的几何动画 |
| 实现边界 | 复用现有 PlayerBar、playback composable 与子组件，不复制播放器 |

## 4. 当前实现基线

### 4.1 Presentation 与 owner

- 普通窗口只有在 `displayMode === 'normal'` 且 visual style 为 `manuscript` 时，
  `resolvePlayerSurfacePresentation` 才返回 `manuscript`。
- PlayerBar owner 是 `.player-bar[data-player-presentation]`。
- Fullscreen 和 Miniplayer 始终解析为 `modern`。
- modern 与 manuscript 当前共享 `PlayerBar.vue` 的 DOM 和全部播放逻辑，仅通过 presentation、
  CSS owner 与视觉工作 gate 区分。

Phase 23 不改变上述状态来源，不增加新的视觉偏好或播放器 store。

### 4.2 当前悬浮几何

当前 PlayerBar shortcut 与全局 CSS 共同提供：

- `position: fixed`；
- 高度 72px；
- `bottom: var(--auralis-player-bottom-gap)`，当前 gap 为 44px；
- 宽度 `min(960px, calc(100vw - 320px))`；
- 最小宽度 720px；
- 水平居中公式在 `xl` 两侧不同；
- 完整胶囊圆角和悬浮阴影。

manuscript 目前没有独立几何，因此上述规则也作用于手稿 PlayerBar。Phase 23 必须以 player owner
为边界覆盖 manuscript 几何，不能修改共享 shortcut 后误伤 modern。

### 4.3 AppShell 列结构

普通主窗口最小宽度为 900px。Sidebar 所在第一条 grid track 在所有宽度下固定为 260px：

```text
900px <= viewport < xl
┌────────── 260px ──────────┬──────────── main ────────────┐
│ Sidebar                    │                               │
└────────────────────────────┴───────────────────────────────┘

viewport >= xl
┌────────── 260px ──────────┬──────── main ────────┬─ 20vw ─┐
│ Sidebar                    │                      │ Now     │
│                            │                      │ Playing │
└────────────────────────────┴──────────────────────┴─────────┘
```

Sidebar 可见卡片宽约 232px 且带外边距，但它不是主内容的布局边界。PlayerBar 左边界必须使用
260px，不能使用 232px、244px 或视觉估算值。

### 4.4 当前内部结构

现有 PlayerBar 是一行三段 flex，不是三列 grid：

```text
transport-controls | TrackProgressInfo | playback-actions + volume
```

- 左右两段 `shrink-0`；
- `TrackProgressInfo` 为 `flex: 1; min-width: 0`；
- `TrackProgressInfo` 内含 44px 封面、标题、艺术家和可拖动进度条；
- 无当前曲时中段仍存在并显示稳定空态；
- 进度条保留 ARIA slider、pointer capture、键盘步进和共享帧调度。

Phase 23 会改变三段视觉顺序和布局容器，但不得改写上述功能语义。

### 4.5 当前 overlay

- 队列与播放模式菜单位于 PlayerBar DOM 内，并向上绝对定位；
- 桌面歌词 toast 锚定歌词按钮 wrapper 并向上显示；
- 三者都携带 `.player-overlay[data-player-presentation]` owner；
- PlayerBar 的 `overflow: visible` 是现有弹层不被裁切的必要条件。

吸底后仍保留向上展开、z-index、焦点返回和 owner scope。

### 4.6 当前 safe area

共享变量 `--auralis-playbar-safe-area` 当前为 116px，等于 72px 栏高加 44px 悬浮底部间距。
该值被 Library、Albums、Album detail、Archive 和 Settings 等滚动所有者消费，但部分页面还叠加
自己的末端 inset。

Phase 23 不能把全局变量直接改成 88px，否则会让 modern 悬浮 PlayerBar 的内容避让不足。

## 5. 目标几何契约

### 5.1 外框

manuscript PlayerBar 的目标盒模型为：

```text
position: fixed
left: 260px
right: 0
bottom: 0
height: 72px
width: auto
min-width: 0
transform: none
border-radius: 16px 16px 0 0
overflow: visible
```

这组规则只允许在 `.player-bar[data-player-presentation='manuscript']` 或等价 player owner
作用域下生效。modern 继续使用当前 bottom gap、宽度、最小宽度、水平定位和完整胶囊圆角。

### 5.2 层级与边缘

- PlayerBar 继续位于内容之上，保持现有固定播放控制的 z-index 语义。
- 右侧和底部不得保留 desk gap、safe area 或透明缝。
- Sidebar 保持全高直达客户区底部；PlayerBar 从其右侧与主内容列接合。
- 不把底栏扩展到 Sidebar 下方，不在 Sidebar 内放置播放信息或装饰副本。
- 不引入会裁剪向上 overlay 的 dock wrapper。

### 5.3 视觉表面

目标不是“拉宽后的悬浮胶囊”，而是主内容区域的手稿页脚：

- 使用现有 manuscript paper、ink、rule 和 shadow token；
- 顶部绘制低对比细线，表达页面与控制页脚的边界；
- 使用极轻的内阴影增加压页层次；
- 取消悬浮外投影、玻璃折射、高光扫过和 album tint；
- light / dark 都保持纸面与文字的可读对比；
- 不因 PlayerBar material 为 `cover-tint` 或 `liquid-glass` 而改变手稿页脚外观。

## 6. 目标信息架构

### 6.1 经典三区

目标顺序为：

```text
track + progress | transport | secondary actions + volume
```

其中：

1. 左区复用 `TrackProgressInfo`，保留封面、曲名、艺术家和进度交互；
2. 中区复用上一首、播放或暂停、下一首；
3. 右区复用桌面歌词、队列、播放模式、静音和音量调节。

无当前曲时左区继续占据同一几何，不重新分配中区或右区，也不隐藏整条底栏。

### 6.2 主内容中心线

传输控制必须相对 `.app-main` 的可用宽度居中，而不是相对从 260px 到 viewport 右边缘的整个
PlayerBar 居中。`xl` 出现 Now Playing 后，这条约束尤其重要，否则传输控制会向右漂移。

实现时应使用明确的嵌套 grid 或等价布局契约，不以左右区的实际内容宽度“碰巧抵消”来模拟
居中。

### 6.3 `xl` 两列对齐

在 `xl` 以下：

- PlayerBar 的全部三区共享从 260px 到 viewport 右边缘的空间；
- 左右区按各自边缘对齐，中区保持主内容中心。

在 `xl` 及以上：

- PlayerBar 外层与 AppShell 对齐为 main + 20vw Now Playing 两区；
- 左区和传输控制位于 main 区；
- 右侧操作与音量位于 Now Playing 区；
- main 与 Now Playing 的边界显示一条低对比竖线；
- 竖线使用与顶部细线相同的 manuscript rule token；
- 低于 `xl` 时不存在这条分隔线，不保留空占位。

## 7. 响应式与音量降级

### 7.1 约束来源

最窄主窗口为 900px，扣除 Sidebar grid track 后，PlayerBar 可用宽度为 640px。当前 720px
`min-width` 会侵入 Sidebar 并超出 viewport，因此 manuscript 必须显式取消该最小宽度。

响应式判断基于 PlayerBar 自身容器宽度，不绑定 viewport 宽度。这样 Sidebar 或 Now Playing
比例未来调整时，底栏仍按真实可用空间降级。

### 7.2 常驻音量折叠

当容器不足以稳定容纳三区时：

- 隐藏常驻横向音量滑杆；
- 保留音量按钮及其静音状态；
- 点击音量按钮继续执行现有静音或取消静音语义；
- hover 音量组或键盘焦点进入音量组时，在按钮上方向上展开紧凑音量滑杆；
- `focus-within` 必须与 hover 等价，不能只为鼠标用户提供调节能力；
- 展开层不得改变底栏高度或挤压曲目信息；
- 焦点移出后可关闭，但不得在 slider 拖动或键盘调整期间意外消失。

container query 的具体阈值应由实现时的 intrinsic-size 测量和 900px 实机验证确定。初始验证目标
可取 760px PlayerBar 宽度附近，但不能把约 1020px viewport 写成组件契约。

### 7.3 文本与控制降级顺序

空间不足时的优先级为：

1. 先折叠常驻音量滑杆；
2. 标题和艺术家沿用 truncate；
3. 保留封面、传输控制、歌词、队列、模式和静音按钮；
4. 不允许横向滚动；
5. 不允许按钮无提示消失；
6. 不允许 PlayerBar 重新侵入 Sidebar 或超出 viewport。

## 8. 内容避让与滚动

### 8.1 双 safe-area 契约

必须区分两种 presentation：

```text
modern PlayerBar safe area      = 116px（现状保持）
manuscript dock safe area       = 88px（72px 栏高 + 16px 呼吸空间）
```

实现可以通过 presentation 派生的 CSS 变量或等价 owner-safe token 提供最终值，但不得要求每个页面
复制判断逻辑，也不得把全局 modern 值直接覆盖为 88px。

### 8.2 消费者

下列普通窗口内容必须在 manuscript 下消费 88px 的最终避让值：

- Library family：全部歌曲、普通歌单、智能歌单；
- Albums catalog；
- Album detail；
- Archive；
- Settings；
- Now Playing 内部可滚动或可到达的末端内容。

各页面已有的额外 bottom inset 若承担页面自身节奏，可继续保留；不得因为 Phase 23 重复叠加
44px 旧悬浮间距。Library flat 的既有虚拟列表 bottom inset、Archive 的额外页尾间距必须在实机中
分别核对，不能机械删除。

### 8.3 滚动不变量

- 最后一行或最后一个可交互元素滚到底后不得被 PlayerBar 遮挡；
- 最后内容与栏顶至少具有设计冻结的 16px 呼吸空间，页面自己的额外 inset 除外；
- 不改变虚拟列表行高、封面分组高度或 virtualizer estimate；
- 切换 visual style 不重置 scrollTop、当前选择、搜索位置或播放视口恢复状态；
- 不通过给 `RouterView` 增加 presentation key 来刷新布局。

## 9. Overlay 与可访问性

### 9.1 展开方向与裁切

队列、播放模式菜单、桌面歌词 toast 和窄窗音量滑杆都从底栏向上展开。实现必须保持：

- PlayerBar 或必要 containing block 的 `overflow: visible`；
- overlay 高于页面和 PlayerBar 纸面的 z-index；
- `.player-overlay[data-player-presentation]` owner marker；
- manuscript overlay CSS 不泄漏到 Fullscreen、Miniplayer 或桌面歌词窗口。

### 9.2 键盘与焦点

Phase 23 不得破坏 Phase 18 已建立的：

- Escape 关闭并把焦点返回触发器；
- queue / mode menu 的 roving focus；
- Tab containment；
- live trigger 位于 overlay 外时的焦点契约；
- 所有 PlayerBar button 的 `focus-visible`；
- progress slider 的方向键、Shift 步进和 ARIA value；
- 音量 slider 的键盘调整能力。

窄窗音量展开层必须新增针对 hover、focus-within、拖动保持和焦点返回的自动测试或纯状态测试。

## 10. 状态、性能与生命周期不变量

Phase 23 不得改变：

1. `usePlayback()` 的唯一播放状态来源；
2. 当前曲、播放队列、上一首、下一首、seek 和播放模式语义；
3. `TrackProgressInfo` 的共享 visual-frame scheduler；
4. 桌面歌词同步、自动跟随和 seek；
5. `usePlayerBarMaterial()` 的 `cover-tint | liquid-glass` 持久化值；
6. manuscript 下 PlayerBar palette worker 与 album tint 保持关闭；
7. 切回 modern 时只恢复当前封面一次，不出现过期 tint、重复 timer 或重复 listener；
8. artwork 的懒加载和 `decoding='async'`；
9. 风格切换不 remount PlayerBar、Now Playing 或 playback composable。

本阶段不增加几何 transition。`modern <-> manuscript` 立即切换布局，以避免文字重排期间的点击热区
错位。既有非几何动效仍须尊重 `prefers-reduced-motion`。

## 11. CSS 与组件所有权

### 11.1 推荐实现边界

独立的是手稿布局层，不是第二个播放器。建议：

- `PlayerBar.vue` 继续作为唯一 PlayerBar owner 和逻辑入口；
- 复用 `TrackProgressInfo`、transport、actions、queue、mode 和 lyrics control；
- 允许为布局清晰度抽取只负责 presentation 的内部组件或 wrapper；
- 不复制 playback composable 调用、timer、watcher 或事件监听；
- 不新建 `ManuscriptPlayerBar.vue` 并复制整套播放器逻辑。

### 11.2 样式位置

- manuscript 几何、纸面和内部布局优先放在
  `src/renderer/app/styles/manuscript.player.css`；
- manuscript player overlay 与窄窗音量展开层放在
  `src/renderer/app/styles/manuscript.player-overlays.css`；
- 只有真正跨 presentation 的基础结构才允许修改 `main.css` 或 Uno shortcut；
- 禁止用裸 `.player-bar` 改写吸底几何；
- 禁止借用 `.app-window[data-shell-presentation]` 控制 PlayerBar 皮肤；
- player selector 不能涂到 `.app-sidebar`、`.library-*`、`.albums-*`、`.archive-*`、
  `.settings-*`、`.fullscreen-*`、`.mini-player*` 或 `.desktop-lyrics-*`。

### 11.3 Container query owner

若使用 CSS container query：

- container 建立在 PlayerBar 或其明确的 presentation layout wrapper；
- query 只控制内部排版和音量折叠；
- 不以 query 改变播放器状态或卸载组件；
- 不允许 container 本身因查询结果循环改变可用宽度。

## 12. 预计文件范围

### 12.1 预计修改

- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/TrackProgressInfo.vue`（仅在布局接口确有必要时）
- `src/renderer/app/styles/manuscript.player.css`
- `src/renderer/app/styles/manuscript.player-overlays.css`
- `src/renderer/app/styles/main.css`（仅 presentation-safe-area 接线确有必要时）
- 各页面 safe-area 消费者（只做统一 token 接线，不重做页面视觉）
- `src/renderer/app/utils/playerOverlayFocus.test.ts` 或相邻纯状态测试
- `scripts/check-library-visual-scope.mjs`
- `AGENTS.md`（实现后更新最终不变量）
- 本阶段后续 `BASELINE.md`、`DELIVERY.md` 与路线图

### 12.2 原则上不修改

- `src/renderer/app/layout/MiniPlayer.vue`
- `src/main/app/miniPlayerWindowController.ts`
- `src/renderer/app/layout/FullscreenPlayerOverlay.vue`
- 桌面歌词独立窗口组件与主进程控制器
- playback store / composable 的状态模型
- IPC contract、preload、repository、service、SQLite schema
- PlayerBar material 偏好定义
- Library 虚拟列表几何常量

若实现中必须修改排除文件，只允许加入防止 manuscript dock 泄漏的最小隔离，并在 DELIVERY 中单列
原因和 diff 范围。

## 13. 分步实施计划

本文件只冻结设计，不授权实施。后续用户明确要求编码时，按以下步骤执行。

### Step 23.0：建立阶段基线

1. 新建 `phase23/BASELINE.md`；
2. 记录工作树既有修改所有权；
3. 记录 900px、`xl` 两侧、light / dark、modern / manuscript 当前截图或文字基线；
4. 记录 PlayerBar、safe-area 消费者、overlay 与测试现状；
5. 明确 Phase 18、22 人工矩阵的未关闭项，不把它们误写为 Phase 23 已完成。

### Step 23.1：建立 presentation-safe 几何

1. 只为 manuscript PlayerBar 增加 260px / 0 / 0 / 72px 吸底几何；
2. 清除 manuscript 下共享悬浮宽度、min-width、translate 和 bottom gap；
3. 保留 modern 原几何；
4. 补充纯 resolver 或静态作用域守卫，证明排除表面不受影响。

### Step 23.2：重排经典三区

1. 左区放置 `TrackProgressInfo`；
2. 中区放置 transport，并以 main 列中心为基准；
3. 右区放置 actions 与 volume；
4. `xl` 时接入 Now Playing 20vw 列和竖线；
5. 无当前曲时验证三段几何不跳动。

### Step 23.3：接入双 safe area

1. 保留 modern 116px；
2. manuscript 使用 88px；
3. 逐一接入 Library family、Albums、Album detail、Archive、Settings 与 Now Playing；
4. 核对页面自有额外 inset，避免重复空白；
5. 不改虚拟列表 estimate。

### Step 23.4：实现窄窗音量降级

1. 建立 PlayerBar container；
2. 通过 container query 折叠常驻 slider；
3. 实现 hover / focus-within 向上展开；
4. 保留点击静音；
5. 补齐拖动保持、键盘调整和焦点测试。

### Step 23.5：校准 overlay 与视觉

1. 校准 queue、mode、lyrics toast 和 volume overlay 的向上锚点；
2. 保持 overflow、z-index 和 owner marker；
3. 应用连续纸面、顶部细线、16px 顶角和轻内阴影；
4. 验证 album tint、glass 与外投影未在 manuscript 重新出现。

### Step 23.6：门禁与交付

1. 扩展静态 scope 检查；
2. 运行自动测试、类型检查、lint 与 build；
3. 完成 Electron 人工矩阵；
4. 新建 `phase23/DELIVERY.md`，记录实际文件、命令、人工结果与遗留项；
5. 更新路线图和 `AGENTS.md`，不得预填未执行结果。

## 14. 自动验证要求

至少覆盖：

1. `normal + manuscript` 才启用吸底 presentation；
2. modern、Fullscreen、Miniplayer 始终保持原几何或 modern presentation；
3. player owner CSS 不跨越到 shell、页面或独立播放器表面；
4. 900px 下 PlayerBar 不侵入 Sidebar、不超出 viewport；
5. `xl` 两侧的布局分支正确，传输控制以 main 列居中；
6. manuscript safe area 为 88px，modern 仍为 116px；
7. style 切换不使用 key remount；
8. queue / mode / lyrics overlay owner 和焦点模型不变；
9. 窄窗 volume overlay 支持 hover、focus-within、拖动与键盘；
10. manuscript 下 palette 与 album tint gate 继续关闭；
11. reduced-motion 规则仍命中所有被触及的 player surface。

实施后的工程门禁：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## 15. Electron 人工验收矩阵

### 15.1 必测组合

| 维度 | 场景 |
| ---- | ---- |
| presentation | modern / manuscript 往返至少 5 次 |
| theme | light / dark |
| 宽度 | 900px、container query 两侧、1279px、1280px、宽屏 |
| 播放 | 无曲、暂停、播放、换曲、上一首、下一首、队列末端 |
| 页面 | Library、playlist、smart-playlist、Albums、Album detail、Archive、Settings |
| Now Playing | `xl` 隐藏与显示两侧、歌词滚到底 |
| overlay | queue、mode、lyrics toast、窄窗 volume |
| 排除表面 | Fullscreen、Miniplayer、桌面歌词窗口 |

### 15.2 几何验收

- manuscript 栏高稳定为 72px；
- 左边界始终为 260px，Sidebar 保持全高；
- 右侧、底部无缝贴边；
- 仅两个顶部角为 16px；
- 900px 下不越界、不横向滚动；
- `xl` 时右区进入 Now Playing 列，竖线与上方列边界一致；
- 传输控制在主内容列中心，不随右区宽度漂移；
- 所有页面末项可滚至栏顶上方至少 16px，页面自有额外 inset 除外。

### 15.3 行为验收

- progress 拖动、方向键和 Shift 步进准确；
- 音量按钮静音语义不变；
- 窄窗 slider 在 hover 和键盘 focus 下都可达，拖动时不消失；
- queue / mode Escape 返回、roving focus 与 Tab containment 不变；
- lyrics toast、歌词 auto-follow、scroll 与 seek 不被风格切换重置；
- style 切换无几何动画、无 remount、无点击热区短暂漂移；
- manuscript 换曲不触发 palette decode / canvas；切回 modern 只恢复一次当前封面；
- PlayerBar material 偏好经过 modern / manuscript 往返后保持原值。

## 16. 风险与对策

| 风险 | 对策 |
| ---- | ---- |
| 共享 shortcut 被修改后 modern 也吸底 | manuscript owner 内覆盖；增加静态与视觉守卫 |
| fixed 元素改进 grid flow 导致隐式行 | 保持 fixed，不让 PlayerBar 成为 grid auto-placement item |
| 260px 与 Sidebar 可见宽度混淆 | 以 grid track 为唯一左边界来源 |
| safe area 全局改为 88px 遮住 modern 内容 | 建立 presentation-safe 双值契约 |
| 页面已有 inset 叠加出大块空白 | 逐消费者审计，不机械删除页面自有节奏 |
| `xl` 后控制以整栏居中而右漂 | 使用明确 main / Now Playing 列和 main 内中心线 |
| 900px 下三区挤压 | 取消 720px min-width；container query 先折叠 volume slider |
| 音量展开只支持 hover | 同时实现 `focus-within`、键盘与拖动保持 |
| dock wrapper 裁切 overlay | 保持必要 containing block `overflow: visible` |
| 重新排列 DOM 破坏焦点顺序 | DOM 顺序与视觉顺序保持一致，避免只依靠 CSS `order` 伪装 |
| style 切换重排时误触 | 不做几何动画，不 remount，切换为原子 presentation 更新 |
| manuscript material selector 被共享样式反压 | 保持 owner specificity 与样式加载顺序，增加静态检查 |

## 17. 回滚策略

Phase 23 应能按层回滚：

1. 回滚窄窗 volume overlay，可临时恢复常驻 slider，但不得让栏越界；
2. 回滚经典三区，可恢复 Phase 18 内部顺序，不影响吸底外框；
3. 回滚 manuscript safe area，可恢复 116px，代价只是额外底部空白而非遮挡内容；
4. 回滚 manuscript 吸底几何，即完整恢复 Phase 18 悬浮 PlayerBar；
5. 所有回滚都不得修改 modern、Miniplayer、Fullscreen 或 playback 状态。

## 18. Definition of Done

Phase 23 只有满足以下全部条件后才能标记为“工程完成”：

- manuscript PlayerBar 使用 260px 左边界、0 右边界、0 底边界和 72px 高度；
- modern PlayerBar 的流光悬浮几何完全不变；
- 经典三区、主内容中心线和 `xl` Now Playing 对齐正确；
- manuscript / modern 双 safe area 生效且所有消费者末项可达；
- 窄窗音量 slider 的鼠标、键盘和拖动行为完整；
- 所有 player overlay 向上展开且不被裁切；
- 无当前曲、切歌与风格往返不产生布局跳动或状态重置；
- palette、tint、material、焦点、歌词和队列不变量全部保持；
- 自动门禁全部通过；
- Electron 人工矩阵已执行并记录在 `DELIVERY.md`；
- `AGENTS.md` 与路线图已同步最终实现事实。

当前只完成设计冻结，尚未创建 BASELINE、尚未修改代码、尚未执行工程或 Electron 验收，因此不得将
Phase 23 标记为工程完成或完全交付。
