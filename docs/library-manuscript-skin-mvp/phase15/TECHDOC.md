# TECHDOC：手稿皮肤覆盖普通歌单与智能歌单（Phase 15）

**文档状态**：工程完成；人工验收待 Electron 矩阵  
**编写日期**：2026-08-13  
**前置门禁**：用户已确认既有人工验收均通过；Step 15.0 已按真实结果回填交付记录并冻结基线  
**目标路由**：`library`、`playlist`、`smart-playlist`  
**视觉偏好**：沿用 `modern | manuscript` 与 `auralis-visual-style` 唯一状态源

## 1. 结论

Phase 15 不新建歌单页面，而是在现有 `LibraryPage.vue` 上建立“同一列表能力、三种产品身份”的展示
契约。`library`、`playlist`、`smart-playlist` 三个明确路由都可以消费共享手稿偏好，但页眉必须让用户
辨认当前处于全部歌曲、普通歌单还是智能歌单，不能把三者统一显示为“全部歌曲”。

普通歌单表达为由用户维护的曲目集合；智能歌单表达为由规则计算并自动更新的只读成员集合。这里的
“只读”只描述歌单成员来源，不禁止播放、搜索、右键操作或曲目元数据编辑。Phase 15 复用既有平铺、
封面、虚拟滚动、播放队列、搜索定位、元数据编辑和 Library owner overlay，不复制第二套状态源、CSS
或数据加载管线。

本阶段不增加数据库迁移或 IPC。当前普通歌单只有 `addTracks`，没有“从歌单移除曲目”的 typed IPC；
Phase 15 不以视觉覆盖为名补建删除能力。若产品需要删除或重排歌单曲目，应另立功能设计，同时贯穿
Repository → Service → Typed IPC → UI。

## 2. 当前基线

### 2.1 已具备的能力

- Vue Router 已将 `/`、`/playlists/:id`、`/smart-playlists/:id` 指向同一个 `LibraryPage.vue`。
- `LibraryRouteScope` 已区分 `library | playlist | smart-playlist`，并用 id 绑定异步请求世代。
- 普通歌单和智能歌单详情已经返回 `playlist` identity、持久化 `viewMode` 与完整 `tracks`。
- 歌单播放已经把当前 `tracks` 作为 queue 和 shuffle pool，不会意外扩展为全部曲库。
- 普通歌单和智能歌单的视图模式分别写回各自服务；全部歌曲继续使用现有 localStorage key。
- 右键菜单、元数据编辑、缺失元数据、缺封面、键盘 roving focus 和滚动锚点均复用 Library 管线。
- Library Teleport 已通过 `.library-overlay[data-visual-style]` 接收 owner scope。
- 平铺行高 44px、封面曲目行高 40px、封面 250px、分组 padding 等几何已有统一常量。

### 2.2 当前缺口

1. `resolveLibraryPresentation` 只允许 `library` 使用手稿，两个歌单路由被强制为 `modern`。
2. `isManuscriptLibrary` 在页面内重复硬编码 `route.name === 'library'`，没有完全服从 resolver。
3. `VisualStyleSwitch` 只在全部歌曲显示，用户不能在歌单页直接切换视觉风格。
4. `LibraryArchiveHeader` 写死“全部歌曲 / 私人音乐收藏总账”，加载快照也没有原子提交歌单名称。
5. 搜索热区和 `/` 快捷键只对全部歌曲开放，歌单虽已有搜索索引却没有入口。
6. 页眉无法表达普通歌单的手动成员语义与智能歌单的规则成员语义。
7. Sidebar 重命名和添加曲目事件不会主动刷新当前 `LibraryPage` 的 identity 与内容。
8. 静态视觉守卫仍断言页面存在仅允许 `library` 的硬编码 route gate。

## 3. 目标、非目标与稳定边界

### 3.1 目标

- 三个明确 Library 路由都能在 `modern` 与 `manuscript` 间往返，不清除保存的视觉偏好。
- 手稿页眉按路由显示动态歌单名称、类型、成员语义、曲目数与 FOLIO。
- 普通歌单与智能歌单复用平铺账册、唱片目录、搜索定位、状态页和自有浮层。
- 路由快速切换或后台刷新时，名称、曲目、视图模式必须来自同一请求快照，不能串页。
- 普通歌单添加曲目、Sidebar 重命名、智能歌单重命名后，当前页面能 generation-safe 刷新。
- modern 现有布局、播放语义和材质保持不变；新增的共享搜索能力不得改变搜索算法。
- 增加路由解析、identity、异步提交、locale parity 与视觉作用域护栏。

### 3.2 非目标

- 不覆盖 Sidebar、应用内容外壳、Now Playing、PlayerBar、Miniplayer、全屏播放器和桌面歌词。
- 不在页面内增加重命名、删除歌单、编辑智能规则、移除曲目或曲目排序 UI。
- 不修改歌单 Repository、Service、typed IPC、preload API 或数据库 schema。
- 不把手稿状态提升到 `html`、`body`、`#app`、`.app-window` 或 `.app-shell`。
- 不改变普通歌单的持久顺序，也不重新排序智能歌单计算结果。
- 不把动态显示文案写回歌单名称、曲目 identity 或数据库字段。
- 不改变虚拟滚动几何、overscan、封面分组规则或 artwork URL 管线。

### 3.3 必须保持的行为

- 播放、暂停、选中、插播、播放专辑与 shuffle pool 继续受当前路由 `tracks` 约束。
- 搜索继续是“定位下一个匹配项”，不是过滤列表；回绕、无匹配和焦点恢复行为不变。
- 元数据保存继续遵守 foreground → metadata-save → background 请求优先级。
- route id 变化必须使旧请求失效；不存在的歌单继续重定向到 `/`。
- 图片继续使用 `loading='lazy'`、`decoding='async'` 和现有 cache key URL。
- 视觉切换不得清除选择、播放队列、搜索查询、右键目标、滚动锚点或保存中的元数据状态。

## 4. 目标架构

### 4.1 显式路由展示解析

`resolveLibraryPresentation(routeName, visualStyle)` 只允许以下三个路由消费共享偏好：

```ts
const manuscriptLibraryRoutes = new Set(['library', 'playlist', 'smart-playlist'])

return visualStyle === 'manuscript' && manuscriptLibraryRoutes.has(String(routeName))
  ? 'manuscript'
  : 'modern'
```

实际实现可以不用 `Set`，但必须满足：

- 按 Vue Router `name` 精确匹配，不使用 path 前缀；
- `albums`、`album-detail`、`archive`、`settings` 和未知 route name 不因该 resolver 进入手稿；
- 页面根节点和所有子组件只消费 `libraryPresentation`；
- `isManuscriptLibrary` 改为 `libraryPresentation.value === 'manuscript'`，删除第二套 route gate。

同时新增纯函数 `resolveLibrarySurfaceKind(routeName)`，返回
`library | playlist | smart-playlist | null`。该值只描述产品表面，不是新的视觉偏好。

### 4.2 identity 与数据快照原子提交

扩展当前 `LibraryDataSnapshot`，让标题身份与曲目、视图模式在同一 generation 中提交：

```ts
type LibraryPageIdentity =
  | { kind: 'library' }
  | { kind: 'playlist'; id: number; name: string; membership: 'manual' }
  | { kind: 'smart-playlist'; id: number; name: string; membership: 'rule-based' }

interface LibraryDataSnapshot {
  identity: LibraryPageIdentity
  tracks: TrackListItem[]
  viewMode: LibraryViewMode
}
```

- `library` 快照生成固定 identity，不引入额外请求。
- `playlist` identity 取自同一个 `playlists.getDetail(id)` 返回值。
- `smart-playlist` identity 取自同一个 `smartPlaylists.getDetail(id)` 返回值。
- `commitLibrarySnapshot` 一次提交 identity、tracks 和 viewMode；禁止先更新标题再异步更新内容。
- `isCurrentLibraryRequest` 继续用 `LibraryRouteScope` 与 generation 阻止旧 id 的结果串入新页面。
- 后台刷新保留已有可见曲目锚点；只更新名称时也不得重置播放和滚动状态。

不把歌单名称复制进 localStorage，不从 Sidebar DOM 或 route meta 推断名称。

### 4.3 三种页眉身份

复用并泛化 `LibraryArchiveHeader.vue`，不复制三个页眉组件。组件接收 `identity`、曲目数、FOLIO 和加载
状态，再按 identity 选择本地化语义。

| 表面     | 主标题               | 副标题与标签        | 成员语义               |
| -------- | -------------------- | ------------------- | ---------------------- |
| 全部歌曲 | 现有本地化“全部歌曲” | 私人音乐收藏总账    | 曲库主目录             |
| 普通歌单 | `playlist.name`      | 私人选辑 / 手动编排 | 用户维护的成员集合     |
| 智能歌单 | `playlist.name`      | 动态索引 / 规则生成 | 自动更新的只读成员集合 |

约束：

- 动态名称按一行或两行安全截断，并保留原文 `title`；不能改变页眉高度到破坏滚动区。
- “只读成员”不应表现为整个页面禁用；播放、元数据编辑和添加到其他歌单仍然可用。
- 普通歌单不声称支持当前不存在的页面内移除、拖排或重命名动作。
- 加载中使用稳定占位，不短暂显示上一个歌单名称。
- 空、错误和不存在状态仍由 `LibraryStatusState` / redirect 管理，不在页眉重复实现状态机。

页面根节点增加 `data-library-surface="library|playlist|smart-playlist"`，仅供页面内语义样式和静态检查；
手稿作用域仍必须以 `.library-page[data-visual-style='manuscript']` 开始。

### 4.4 视觉切换与搜索入口

- `VisualStyleSwitch` 对三个 Library route 都显示，继续写入唯一 `useVisualStyle`。
- 搜索热区对三个 route 都开放；modern 歌单沿用现有搜索控件材质，manuscript 歌单使用现有纸面样式。
- `/` 快捷键以 `resolveLibrarySurfaceKind(route.name) !== null` 为边界，不在其他页面抢占按键。
- 路由切换仍清空查询，避免查询从一个歌单串到另一个歌单。
- 仅切换 visual style 时不得清空查询或 outcome；若 DOM 因过渡重建，应在 nextTick 后恢复输入焦点。
- 搜索索引继续从当前 `tracks` 构建，不能回退到全曲库索引或另发 IPC。
- hover、focus、已输入查询三种显示条件继续共用 `shouldRenderSearchBar`。

### 4.5 页面视觉复用

现有 `manuscript.css` 已绑定 Library 页面作用域，因此平铺行、封面组、状态页与搜索样式应直接复用。
Phase 15 只增加身份差异所需的最小规则：

- 普通歌单使用“选辑 / 编目”标签，不新增另一套纸色或行样式；
- 智能歌单使用“规则索引”标签，可用现有暗红强调表达自动成员，不使用发光或玻璃；
- 三种表面的账册列、播放/暂停印章、缺失元数据和封面 placeholder 保持一致；
- 所有新增选择器仍以 `.library-page[data-visual-style='manuscript']` 开始；
- 不增加 shell、Sidebar 或播放器选择器，不修改 shared token 的全局挂载边界。

若 identity 差异只需组件 class 和现有 token，应优先在现有文件中完成，不为普通与智能歌单各建 CSS。

### 4.6 浮层与交互能力

`MetadataEditDialog` 与 `LibraryContextMenu` 已接收 `libraryPresentation`。resolver 扩展后，它们会在歌单路由
自动获得 `.library-overlay[data-visual-style='manuscript']`，无需新增 playlist overlay。

必须复核：

- 右键主菜单、添加到歌单子菜单、元数据弹窗和 scrim 的 owner scope；
- 从当前普通歌单添加到其他普通歌单，以及添加到自身时的去重反馈；
- 智能歌单允许把结果曲目添加到普通歌单，但不允许编辑智能成员集合；
- 视图切换写回当前歌单，并在关闭菜单后恢复原曲目焦点；
- 元数据保存后，普通歌单保持成员与顺序；智能歌单按规则重新计算，目标曲目可能退出当前列表，此时
  使用已有 fallback focus 逻辑；
- context menu 的“刷新曲库”维持现状，不改成“刷新歌单”或新增请求语义。

### 4.7 外部变更刷新

在 `LibraryPage` 生命周期中监听已有：

- `auralis-playlists-changed`
- `auralis-smart-playlists-changed`

事件处理器只对匹配的当前 route 触发 `loadLibraryData('background')`，并通过现有 coordinator 合并并发
刷新。卸载时必须移除监听。这样 Sidebar 重命名、普通歌单新增曲目和智能歌单重命名会更新当前页，且
不会另建请求队列。

事件没有 payload，不能假定具体 id；正确性由重新获取当前 route detail 保证。不得因一次 Sidebar 事件
绕过 generation 或直接修改当前 title。

### 4.8 国际化

在 `en.json`、`zh-Hans.json`、`zh-Hant.json` 同步增加页眉 identity 文案，至少包括：

- 普通歌单副标题、类型标签、手动成员标签；
- 智能歌单副标题、类型标签、规则成员 / 自动更新标签；
- 必要的当前列表搜索 aria 文案。

歌单名称保持用户原文，不经过翻译。未知曲目、未知艺人、未知专辑等内部 identity 规则保持现状。
三份 locale 必须 key parity，包含中文的文件写入后执行严格 UTF-8 字节解码。

## 5. 分步实现计划

### Step 15.0：关闭前置状态并冻结基线

#### 修改范围

- 回填用户已确认通过的既有人工验收记录。
- 更新 `DELIVERY-ROADMAP.md` 中 Phase 15 的开始状态。
- 新建 `phase15/BASELINE.md`，记录起始提交、工作树、既有未提交改动和当前自动门禁。

#### 实施要求

1. 只记录实际确认通过的人工项目，不伪造截图、10k / 50k 曲库数据或 DPI 数据。
2. Phase 9–11 的容量门禁若未实际执行，继续标记为延期，不与 Phase 15 视觉实现混写。
3. 保存 `git status --short`，明确 Phase 14 及其他用户改动的所有权，不回退或覆盖。

#### 验收门槛

- Phase 15 前置阶段不再保留与用户确认相冲突的“待人工验收”描述。
- 容量延期项仍可追踪，且不被错误标记为完成。

### Step 15.1：建立 route presentation 与 identity 纯函数契约

#### 主要文件

- `src/renderer/features/library/utils/libraryPresentation.ts`
- `src/renderer/features/library/utils/libraryPresentation.test.ts`
- `src/renderer/features/library/types/libraryPresentation.ts`
- 可新增 `src/renderer/features/library/utils/libraryPageIdentity.ts`
- 对应 `*.test.ts`

#### 实施步骤

1. 让 resolver 精确允许三个 Library route 使用共享手稿偏好。
2. 新增 `LibrarySurfaceKind`、`LibraryPageIdentity` 与 route-name 解析纯函数。
3. 覆盖 saved style 为 modern、未知 route、相似字符串和 null / undefined 的测试。
4. 不在纯函数中读取 router、localStorage、i18n 或 IPC。

#### 验收门槛

- `library`、`playlist`、`smart-playlist` + `manuscript` 均解析为手稿。
- 其他 route 永远不会通过 Library resolver 进入手稿。
- modern 偏好在全部 route 上仍解析为 modern。

#### 建议提交

`refactor：建立歌单手稿路由与身份契约`

### Step 15.2：原子加载歌单 identity 与页面数据

#### 主要文件

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/utils/libraryRouteScope.ts`
- 相关纯函数 / coordinator 测试

#### 实施步骤

1. 扩展 `LibraryDataSnapshot`，纳入 `LibraryPageIdentity`。
2. 从已有 detail 响应提取 name 与成员类型，不新增 IPC。
3. 在 `commitLibrarySnapshot` 中与 tracks、viewMode 一起提交 identity。
4. foreground 开始时清理过期 identity 或进入稳定 loading 占位，避免显示上一个歌单名。
5. 验证快速切换不同 id、普通与智能同 id、detail 返回 null、请求失败和后台刷新。

#### 验收门槛

- 标题、曲目与 viewMode 不会来自不同歌单。
- 旧请求无法覆盖新 route；不存在的歌单按现有行为重定向。
- 后台刷新保留当前播放、选中、键盘焦点与滚动锚点。

#### 建议提交

`refactor：原子提交歌单身份与列表快照`

### Step 15.3：泛化手稿页眉与三类产品语义

#### 主要文件

- `src/renderer/features/library/components/LibraryArchiveHeader.vue`
- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.css`
- 三份 locale JSON

#### 实施步骤

1. 页眉接收 identity，不再写死全部歌曲标题。
2. 增加普通歌单和智能歌单的类型、成员来源和自动更新语义。
3. 页面根节点增加 `data-library-surface`。
4. 处理长名称、空白名称防御、loading 占位与 FOLIO 对齐。
5. 保持 header 外部几何稳定，不改变虚拟列表估算。

#### 验收门槛

- 三类页面不看 Sidebar 也能被准确辨认。
- 普通与智能歌单的成员权限表达准确，不出现不存在的操作暗示。
- 中英混排、长名称、0 曲目和 10k 以上计数不溢出页眉。

#### 建议提交

`feat：为普通与智能歌单增加手稿档案页眉`

### Step 15.4：开放共享切换入口与搜索模型

#### 主要文件

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/styles/manuscript.css`
- 搜索相关测试

#### 实施步骤

1. 对三个 route 显示 `VisualStyleSwitch`。
2. 去除搜索热区对 `!isScopedPlaylist` 的限制，继续使用当前列表索引。
3. 将 `/` 快捷键边界改为明确的 Library surface route。
4. visual style 往返时保留查询、outcome 和定位状态；route 往返仍清空。
5. 检查切换样式、切换 flat / cover 与搜索定位交错时的滚动锚点。

#### 验收门槛

- 三个 route 均可发现并切换风格，保存偏好不被路由切换清除。
- 歌单搜索只扫描当前歌单，Enter 连续定位、回绕和无匹配反馈正确。
- `/` 不在设置、专辑、归档或播放器输入控件中抢焦点。

#### 建议提交

`feat：歌单页面复用视觉切换与搜索定位`

### Step 15.5：闭合播放、浮层和外部变更事件

#### 主要文件

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/components/LibraryContextMenu.vue`
- `src/renderer/features/library/components/MetadataEditDialog.vue`
- `src/renderer/features/library/styles/manuscript.overlays.css`

#### 实施步骤

1. 验证所有子组件统一接收 `libraryPresentation`，删除剩余硬编码 ternary。
2. 监听普通 / 智能歌单 changed 事件，并在卸载时清理。
3. 用现有 coordinator 执行 background refresh，不并发建立第二条刷新管线。
4. 验证普通歌单添加曲目、添加到自身、Sidebar 重命名与智能歌单重命名。
5. 验证元数据保存导致智能歌单成员退出时的 focus fallback。
6. 核对所有 Teleport wrapper 的 `library-overlay` 与 visual style 属性。

#### 验收门槛

- 歌单 queue、shuffle pool、插播与封面组播放均局限于当前列表。
- 外部变更最终收敛，快速事件不会用旧数据覆盖当前 route。
- 弹窗、菜单、焦点回传和 Escape 关闭在两种视觉下保持一致。

#### 建议提交

`fix：闭合歌单页面刷新与手稿浮层状态`

### Step 15.6：扩展自动化与静态守卫

#### 主要文件

- `scripts/check-library-visual-scope.mjs`
- `src/renderer/features/library/**/*.test.ts`
- 三份 locale JSON

#### 实施步骤

1. 把静态守卫从“仅 library route”更新为“三个显式 route”。
2. 断言页面根 marker 由 resolver 派生，禁止重新出现第二套 route + style 条件。
3. 断言 `data-library-surface`、共享 switch、identity header 与 Library overlay owner scope。
4. 保持 CSS 每条普通选择器都有 Library 手稿根作用域。
5. 断言排除 shell、Sidebar、Now Playing、PlayerBar、Miniplayer、桌面歌词和全屏。
6. 增加 locale key parity 与严格 UTF-8 校验。

#### 验收门槛

- resolver、route scope、identity、搜索索引和几何测试通过。
- 视觉静态守卫能在歌单 route 被误改回 modern-only 时失败。
- guard 不依赖易碎的整行模板字符串，应检查稳定的契约标记。

#### 建议提交

`test：补齐歌单手稿路由与作用域护栏`

### Step 15.7：回归、人工验收与交付

#### 自动校验

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

补充执行 Phase 15 相关文件的 Prettier 检查与严格 UTF-8 解码。若命令因现有工作树中无关改动失败，
DELIVERY 必须分开记录 Phase 15 结果与既有失败，不能修改无关文件来掩盖失败。

#### 人工验收矩阵

| 维度     | 必验项                                                                     |
| -------- | -------------------------------------------------------------------------- |
| 路由     | 全部歌曲、两个不同普通歌单、两个不同智能歌单、无效 id、三类 route 快速往返 |
| 风格     | 每个 route 的 modern / manuscript；连续切换不清除偏好、搜索、播放或选择    |
| 身份     | 正常名称、长中英文名称、数字和符号、空列表、加载、失败、Sidebar 重命名     |
| 视图     | flat / cover；每个歌单独立持久化 viewMode；切换视图保持定位                |
| 搜索     | `/` 聚焦、Enter 连续定位、回绕、无匹配、查询后切换风格、切换 route 后清空  |
| 普通歌单 | 添加单曲、添加专辑、添加到自身去重、外部添加后刷新、元数据编辑             |
| 智能歌单 | 规则结果、空结果、元数据变化后加入 / 退出、只读成员语义、重命名            |
| 播放     | 单曲、专辑、随机、插播、定位当前歌曲；queue 与 shuffle pool 不越出当前歌单 |
| 浮层     | 鼠标 / 键盘右键、子菜单、元数据弹窗、focus return、Escape、屏幕边缘定位    |
| 内容     | 缺封面、缺元数据、单碟 / 多碟、同名专辑、长文本、中英混排                  |
| 宽度     | 900x620、1279x800、1280x800、1600x900；`xl` 两侧均检查                     |
| 缩放     | Windows 100%、125%、150%；无行高漂移或浮层错位                             |
| 动效     | 正常与 reduced-motion；无重复 listener、timer 或 rAF                       |
| 排除面   | Sidebar、shell、Now Playing、PlayerBar、Miniplayer、桌面歌词、全屏视觉不变 |

#### 交付物

- `phase15/BASELINE.md`
- `phase15/TECHDOC.md`
- `phase15/DELIVERY.md`
- 必要的验收截图说明或人工结论记录

#### 建议提交

`feat：手稿皮肤覆盖普通与智能歌单`

## 6. 文件级变更清单

### 6.1 预计修改

- `src/renderer/features/library/pages/LibraryPage.vue`
- `src/renderer/features/library/components/LibraryArchiveHeader.vue`
- `src/renderer/features/library/utils/libraryPresentation.ts`
- `src/renderer/features/library/utils/libraryPresentation.test.ts`
- `src/renderer/features/library/types/libraryPresentation.ts`
- `src/renderer/features/library/styles/manuscript.css`
- `src/renderer/features/library/styles/manuscript.overlays.css`（仅在审计发现缺口时）
- `src/renderer/locales/en.json`
- `src/renderer/locales/zh-Hans.json`
- `src/renderer/locales/zh-Hant.json`
- `scripts/check-library-visual-scope.mjs`
- `docs/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md`

### 6.2 可能新增

- `src/renderer/features/library/utils/libraryPageIdentity.ts`
- `src/renderer/features/library/utils/libraryPageIdentity.test.ts`
- `docs/library-manuscript-skin-mvp/phase15/BASELINE.md`
- `docs/library-manuscript-skin-mvp/phase15/DELIVERY.md`

### 6.3 原则上不修改

- `src/main/**`
- `src/preload/**`
- `src/shared/ipc/**`
- `src/main/database/schema.ts`
- `src/renderer/app/layout/AppSidebar.vue`
- `src/renderer/app/layout/PlayerBar.vue`
- `src/renderer/app/layout/NowPlayingPanel.vue`
- `src/renderer/features/playback/**`
- `src/renderer/features/settings/**`

若实施必须修改上述排除文件，应暂停 Phase 15，说明原因并重新审查范围，不能把跨表面变化混入视觉提交。

## 7. 风险与解决方案

### 7.1 快速切换时标题与曲目串页

**风险**：歌单名称单独保存或单独请求，旧请求晚到后覆盖新页面。  
**解决**：identity 放进 `LibraryDataSnapshot`，与 tracks、viewMode 一起通过 route scope + generation 提交。

### 7.2 把“智能成员只读”误做成页面禁用

**风险**：用户无法播放、编辑元数据或把歌曲加入普通歌单。  
**解决**：只在页眉表达 membership source；沿用现有曲目操作能力，不对列表加 disabled 状态。

### 7.3 搜索越出当前歌单

**风险**：复用全曲库索引或异步刷新后索引与列表不一致。  
**解决**：继续由当前 `tracks` 计算 search index，快照提交后自动重建，不增加全局搜索 store。

### 7.4 外部 changed 事件造成刷新风暴

**风险**：Sidebar 重命名、添加曲目和曲库扫描事件连续触发多次详情加载。  
**解决**：全部进入现有 `LibraryRequestCoordinator` 的 background lane，由 generation 和 coalescing 收敛。

### 7.5 页眉长名称改变滚动几何

**风险**：动态标题换行增加 header 高度，压缩列表或造成 FOLIO 抖动。  
**解决**：固定可预期的标题容器与截断策略；不把 header 算入虚拟项高度，不修改行与分组 metrics。

### 7.6 visual style 切换清除搜索状态

**风险**：因为搜索 DOM 或页面 header 条件变化而重置 query / outcome。  
**解决**：只在 route scope 变化时清空搜索；presentation watch 仅负责视觉与必要的 focus 恢复。

### 7.7 手稿规则泄漏到 Sidebar 或播放器

**风险**：为歌单增加宽泛 `.playlist` 选择器，意外命中 Sidebar 歌单树或播放队列。  
**解决**：所有页面规则从 `.library-page[data-visual-style='manuscript']` 开始，不使用无 owner 的
`.playlist-*` 全局选择器；静态守卫扫描排除表面。

### 7.8 视觉阶段膨胀为歌单功能重构

**风险**：顺带实现移除、排序、规则编辑或新 IPC，扩大数据库和行为风险。  
**解决**：Phase 15 只覆盖现有能力；新功能另立 PRD / TECHDOC 并遵循完整主进程数据流。

## 8. 回退策略

Phase 15 的回退以 presentation gate 为边界：

1. resolver 可恢复为仅 `library` 返回 manuscript，使两个歌单路由立即回到 modern；
2. identity 快照与页眉泛化应保持为无害的数据改进，不需要回退现有歌单加载逻辑；
3. 若共享搜索出现回归，可单独恢复 scoped playlist 的入口 gate，不回退搜索索引和请求协调器；
4. 不回退 shared visual preference，不清除用户保存的 `auralis-visual-style`；
5. 不通过修改数据库或删除歌单数据执行视觉回退。

## 9. Definition of Done

- 用户确认的既有人工验收已按真实结果归档，Phase 15 基线可追踪。
- `library`、`playlist`、`smart-playlist` 三个明确 route 都能消费唯一视觉偏好。
- 页面不存在第二套 route + style 硬编码，根节点与子组件统一消费 resolver 结果。
- 三种页面 identity 清晰，歌单名称、成员语义、曲目数和 FOLIO 来自同一有效快照。
- 普通与智能歌单在 flat / cover 下完整复用手稿列表、搜索、状态与浮层。
- queue、shuffle、插播、元数据、viewMode、外部变更刷新和 route generation 行为无回归。
- 没有新增 visual-style store、localStorage key、数据库迁移或 IPC。
- 虚拟几何、图片 lazy / async、reduced-motion 和生命周期清理契约保持成立。
- 三语 locale key parity，中文文件通过严格 UTF-8 字节解码。
- `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 与
  `git diff --check` 通过。
- Electron 人工矩阵完成并记录后，Phase 15 才可从“工程完成”更新为“完全交付”。
