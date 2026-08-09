# TECHDOC：全部歌曲页手稿皮肤 MVP

**文档状态**：Phase 1–5 已实现；Phase 5 回归门禁已通过（自动校验 + 代码层矩阵）  
**目标路由**：`/`（`name: 'library'`）  
**目标模块**：`src/renderer/features/library/pages/LibraryPage.vue`  
**视觉风格**：现代流光（`modern`）/ 手稿（`manuscript`）  
**影响范围**：Renderer UI；不涉及数据库、IPC、扫描、播放内核或主进程

---

## 1. 背景与目标

Auralis 当前采用深色现代流光视觉。本 MVP 新增一套可持久化的“手稿”视觉风格，
先在“全部歌曲”页完成纵向样板，用真实大型曲库验证纸张材质、衬线字体、账本分隔线、
状态色和两种歌曲视图的适配效果。

MVP 的核心原则是：**只改变视觉表达，不改变页面布局、数据来源和交互语义**。

手稿风格采用“私人音乐收藏总账”母题：暖白档案纸、深石墨文字、暗红强调、极轻纸纹，
并复用项目内已打包的 GenRyuMin 明体。页面不新增动画、插画、做旧污渍或动态封面取色。

---

## 2. 已确认范围

### 2.1 MVP 包含

- 仅在 `/` 的全部歌曲页应用手稿风格。
- 同时覆盖平铺列表和封面分组两种视图。
- 页面右上角提供“流光 / 手稿”临时切换入口，并跨重启持久化。
- 手稿状态离开全部歌曲页后保持；返回该页时自动恢复。
- 真实曲库、虚拟滚动、搜索定位、点击选中、双击播放、播放队列、右键菜单、元数据编辑、
  封面懒加载和视图切换全部保留。
- 搜索框、视图切换和视觉风格切换适配手稿视觉。
- 空状态和加载状态使用简洁的档案文字与细线表达。

### 2.2 MVP 不包含

- 不修改 `AppSidebar.vue`、`NowPlayingPanel.vue` 或 `PlayerBar.vue`。
- 不修改独立 `MiniPlayer.vue` 及其窗口控制器。
- 不覆盖普通歌单和智能歌单，即使它们复用 `LibraryPage.vue`。
- 不修改全局右键菜单和其他 Teleport 到 `body` 的浮层。
- 不在正式设置页提供视觉风格入口。
- 不改变歌曲列、行高、封面尺寸、页面结构或信息架构。
- 不引入动态纸纹、Canvas、持续动画或新的封面色提取任务。
- 不新增数据库字段、IPC contract 或第二套播放状态。

---

## 3. 现状约束

### 3.1 路由复用

`LibraryPage.vue` 同时承载以下范围：

- `/`：全部歌曲，route name 为 `library`；
- 智能歌单；
- 普通歌单。

所有手稿选择器必须同时满足“视觉风格为 `manuscript`”和“当前 route name 为
`library`”。禁止在 `LibraryPage.vue` 根节点无条件添加手稿 class，否则会污染歌单页面。

### 3.2 虚拟滚动几何

现有虚拟列表依赖固定几何：

- 平铺歌曲行：44px；
- 封面分组内歌曲行：40px；
- 封面分组面板 padding：20px；
- 封面分组额外高度：56px。

MVP 不允许修改上述数值，也不得通过 border、padding 或字体 line-height 使实际盒模型高度
发生变化。新增的当前播放暗红线必须使用绝对定位伪元素，不占据布局空间。

### 3.3 数据和行为

曲库通过现有 `library.getTracks()` 一次性加载，Renderer 持有完整数组，DOM 由
`vue-virtual` 虚拟化。手稿皮肤不得建立副本数据源、重新排序或改变搜索语义。

现有搜索是按 Enter 定位到下一首前缀匹配歌曲，不是实时过滤器。MVP 只改变搜索框外观，
不改变该行为。

### 3.4 字体资产

`src/renderer/assets/fonts/` 已包含 GenRyuMin2TC 多字重，并以
`Auralis Desktop Lyrics SC` 注册。手稿页面直接复用该字体：

- 页标题、歌曲名、艺人、专辑等主要内容使用衬线字体；
- 时长、曲序号和小型控件继续使用现有无衬线字体；
- 不在 MVP 中下载或打包新的字体文件；
- 实现后必须人工检查简体中文、繁体中文、英文、数字和缺字回退。

---

## 4. 状态与样式架构

### 4.1 独立视觉风格状态

新增 feature-scoped composable，例如：

`src/renderer/features/library/composables/useVisualStyle.ts`

```ts
export type VisualStyle = 'modern' | 'manuscript'

const VISUAL_STYLE_STORAGE_KEY = 'auralis-visual-style'
```

实现模式参考 `usePlayerBarMaterial.ts`：

- module-scope `ref` 作为唯一 Renderer 状态；
- 读取 localStorage 时校验 union 值；
- 缺失、非法或读取失败时回退到 `modern`；
- setter 同时更新响应式状态和 localStorage；
- localStorage 写入失败不能阻断切换；
- 不扩展现有 `ThemeMode = 'light' | 'dark'`，不修改 `auralis-theme` key。

该 composable 只由主窗口的 Library feature 消费，不在 `main.ts` 的所有 Renderer 分支之前
全局初始化，避免影响 Miniplayer 和桌面歌词窗口。

### 4.2 路由隔离

在 `LibraryPage.vue` 中派生：

```ts
const isManuscriptLibrary = computed(
  () => route.name === 'library' && visualStyle.value === 'manuscript'
)
```

页面根节点添加稳定命名空间：

```html
<section
  class="library-page"
  :data-visual-style="isManuscriptLibrary ? 'manuscript' : 'modern'"
>
```

普通歌单和智能歌单必须始终得到 `modern`，但不能清除用户已保存的手稿偏好。

### 4.3 Feature-scoped CSS

新增：

`src/renderer/features/library/styles/manuscript.css`

样式必须全部以以下选择器作为前缀：

```css
.library-page[data-visual-style='manuscript']
```

禁止使用无命名空间的 `:root`、`body`、`.song-row` 或 `.track-list-panel` 覆盖。页面外的
Sidebar、Now Playing、Playbar 和 Teleport 浮层不得继承手稿 token。

建议定义以下 feature token，具体值允许在视觉验收时小幅微调：

```css
--manuscript-paper: #f3eedf;
--manuscript-paper-deep: #e9e1cf;
--manuscript-graphite: #292723;
--manuscript-graphite-muted: #6d675e;
--manuscript-rule: rgba(62, 57, 50, 0.24);
--manuscript-rule-strong: rgba(48, 43, 37, 0.46);
--manuscript-accent: #8b302f;
--manuscript-accent-soft: rgba(139, 48, 47, 0.1);
--manuscript-hover: rgba(42, 39, 34, 0.055);
--manuscript-font-serif: 'Auralis Desktop Lyrics SC', serif;
```

手稿根节点可局部映射现有 `--auralis-*` 语义 token，供已有子组件消费；不得改变全局默认
token。所有正文与交互色必须达到可读性要求，普通正文目标至少满足 WCAG AA 4.5:1。

---

## 5. Phase 实施计划

## Phase 0：建立回归基线

### 目标

在任何代码修改前固定现代流光页面的行为和几何基线，便于逐 Phase 验证零退化。

### 工作项

1. 记录 `/` 全部歌曲页平铺视图和封面视图截图。
2. 记录普通歌单和智能歌单截图，作为样式泄漏对照。
3. 确认以下行为当前可用：
   - 点击选中、双击播放；
   - Enter 搜索定位；
   - 曲目和专辑右键菜单；
   - 元数据编辑；
   - 平铺/封面切换及滚动锚点恢复；
   - 大列表连续滚动。
4. 在 DevTools 记录平铺行 44px、封面曲目行 40px 的实际高度。

### 验收门槛

- 基线截图和行为清单齐备。
- 工作区内不存在由本任务引入的代码变更。

---

## Phase 1：视觉风格状态与实验入口

### 目标

建立可持久化但与主题系统隔离的 `VisualStyle` 状态，并只在全部歌曲页提供入口。

### 预计文件

- 新增 `src/renderer/features/library/composables/useVisualStyle.ts`
- 可选新增 `src/renderer/features/library/components/VisualStyleSwitch.vue`
- 修改 `src/renderer/features/library/pages/LibraryPage.vue`
- 修改 `src/renderer/locales/zh-Hans.json`
- 修改 `src/renderer/locales/zh-Hant.json`
- 修改 `src/renderer/locales/en.json`

### 工作项

1. 实现 `VisualStyle` union、非法值校验、localStorage 读取和容错写入。
2. 在全部歌曲页现有控制区加入“流光 / 手稿”双选控件。
3. 通过既有 i18n 体系提供三种语言文案，禁止在模板中硬编码中文。
4. 只在 route name 为 `library` 时显示该控件。
5. 在页面根节点输出 route-scoped `data-visual-style`，暂不修改全局 `html` 或 `body`。
6. 控件使用 button 语义、明确的 `aria-pressed` 或 radiogroup 语义，并支持键盘焦点。

### 验收门槛

- 切换后 `data-visual-style` 立即更新。
- 重启应用后选择仍保留。
- 写入非法 localStorage 值后能安全回退至 `modern`。
- 进入普通/智能歌单时不显示入口、不应用手稿属性；返回 `/` 后恢复选择。
- Miniplayer 和桌面歌词 Renderer 不读取或应用该状态。

### 回退边界

删除新增 composable、切换控件和根属性即可完整回退；不涉及数据迁移。

---

## Phase 2：纸张画布与局部 Token

### 目标

建立手稿皮肤的基础材质、字体和色彩系统，不改变歌曲布局。

### 预计文件

- 新增 `src/renderer/features/library/styles/manuscript.css`
- 修改 `src/renderer/features/library/pages/LibraryPage.vue`

### 工作项

1. 给中央主内容区建立约 12px 外围间隙的独立暖白纸页。
2. 使用方正边缘、1px 石墨描边和克制阴影；不使用大圆角或毛边。
3. 纸纹由低对比度静态 CSS gradient 或内联静态 SVG 纹理构成：
   - 不引入外部背景图片；
   - 不使用 Canvas；
   - 不创建 requestAnimationFrame；
   - 不响应封面色板。
4. 在手稿根节点局部映射文字、边框、控件、歌曲行和播放状态 token。
5. 主要文本启用 GenRyuMin 衬线字体；数字和小控件保留无衬线。
6. 保持 Playbar safe area，纸页可以延伸至其后方，但不得改变 Playbar 的 fixed 几何。
7. 保持外围 Sidebar、Now Playing 和 Playbar 的现代流光视觉。

### 验收门槛

- 仅 `/` 且 visual style 为 `manuscript` 时出现纸张画布。
- 页面切回 `modern` 后与 Phase 0 截图无视觉回归。
- 普通/智能歌单没有任何纸张 token 泄漏。
- 纸纹在静止和滚动时无闪烁、摩尔纹或明显 GPU 抖动。
- 中英文、数字与缺失元数据均可读，没有字体导致的截断或高度变化。

### 回退边界

删除 feature stylesheet 引用即可回到只有状态切换、无视觉变化的 Phase 1。

---

## Phase 3：平铺歌曲列表手稿化

### 目标

在不改变 44px 行高与列布局的前提下，将平铺列表变为收藏总账。

### 预计文件

- 修改 `src/renderer/features/library/styles/manuscript.css`
- 必要时最小修改 `src/renderer/features/library/components/SongRow.vue`

### 工作项

1. 所有歌曲行使用透明或统一纸色，取消奇偶行交替底色。
2. 使用 1px 低对比石墨横线分隔，不增加竖向表格线。
3. 悬停使用极淡石墨底纹。
4. 当前曲目/现有选中语义使用淡暗红底纹。
5. 正在播放行增加左侧 2px 暗红伪元素，并将歌曲标题切换为暗红。
6. 伪元素必须绝对定位，不能挤压 44px 行高、44px 封面或现有列宽。
7. 专辑封面保持 44×44 和全彩内容，改为接近直角并增加 1px 石墨描边。
8. 保留图片 `loading="lazy"` 与 `decoding="async"`。
9. 不新增多选 store；“选中”只映射现有 playback/current-track 状态。

### 验收门槛

- DevTools 实测每行仍为 44px。
- 虚拟滚动连续滚动无跳动、重叠、空洞或定位漂移。
- 当前播放、暂停、悬停和普通状态清晰可区分。
- 点击、双击、右键和搜索定位的事件契约不变。
- `modern` 模式下 `SongRow.vue` 与 Phase 0 一致。

### 回退边界

平铺视图规则全部位于手稿命名空间内，可单独删除而不影响 Phase 2 纸张画布。

---

## Phase 4：封面分组与常驻控件手稿化

### 目标

补齐封面分组视图、搜索框和页面常驻切换控件，使全部歌曲页形成完整 MVP 闭环。

### 预计文件

- 修改 `src/renderer/features/library/styles/manuscript.css`
- 必要时最小修改：
  - `src/renderer/features/library/components/AlbumCoverGroup.vue`
  - `src/renderer/features/library/components/AlbumCoverTrackRow.vue`
  - `src/renderer/features/library/components/VisualStyleSwitch.vue`

### 工作项

1. 专辑封面保持 250×250 和全彩内容，去除明显大圆角，增加 1px 石墨描边。
2. 封面曲目 panel 保持原尺寸和 padding，移除：
   - backdrop blur；
   - 玻璃高光；
   - 大阴影；
   - 20px 大圆角。
3. panel 改为暖白纸面、细石墨边框和接近直角的边缘。
4. 内部曲目行保持 40px 高度，以细横线、石墨 hover 和暗红播放状态表达层级。
5. 搜索框、平铺/封面切换和流光/手稿切换使用暖白底、细墨线和暗红激活态。
6. 控件尺寸、DOM 顺序和点击区域保持不变；新增视觉切换除外。
7. 空状态与加载状态只使用衬线文字、细线和简洁档案编号，不新增插画。
8. 右键菜单、元数据 Dialog 及其他 Teleport 浮层保持现代样式。

### 验收门槛

- 封面分组虚拟化的行高估算与实际高度一致，无重叠和跳动。
- 切换两种视图后，手稿视觉连续，滚动锚点恢复正常。
- 搜索框 Enter 定位行为不变。
- 所有常驻控件具备 hover、focus-visible 和 active 状态。
- 弹出右键菜单仍可操作，且其现代样式被视为明确的 MVP 边界。

### 回退边界

封面与控件规则使用独立选择器分组，可在保留平铺手稿视图的情况下单独回退。

---

## Phase 5：回归、性能与交付门禁

### 目标

验证手稿皮肤没有破坏现代皮肤、歌单路由、虚拟列表或播放交互，并形成可继续扩展的稳定基线。

### 自动校验

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

### 手工验证矩阵

至少覆盖以下组合：

| 维度 | 组合 |
|---|---|
| 视觉风格 | modern / manuscript |
| 歌曲视图 | flat / cover |
| 路由 | 全部歌曲 / 智能歌单 / 普通歌单 |
| 窗口宽度 | `< xl` / `>= xl`（显示 Now Playing） |
| 数据 | 大型真实曲库 / 缺封面 / 缺艺人或专辑 / 长标题 / 中英混排 |
| 播放状态 | 未选择 / 已选择 / 正在播放 / 暂停 |

### 必验行为

1. localStorage 持久化、非法值回退和重启恢复。
2. 连续快速滚动、搜索定位和视图切换后无虚拟列表漂移。
3. 双击播放后 queue 仍使用当前全部歌曲或歌单作用域。
4. 曲目和专辑右键菜单的播放、插播、加歌单、编辑元数据和刷新动作正常。
5. `modern` 模式与 Phase 0 基线一致。
6. 歌单页面、Sidebar、Now Playing、Playbar、Miniplayer 和桌面歌词无样式污染。
7. 无新增持续动画、requestAnimationFrame、Canvas 或封面调色消费。
8. 控件可用键盘访问，焦点可见，正文和状态色对比度满足要求。

### 交付物

受跟踪验收目录（`.gitignore` 已为 TECHDOC 与本目录增加精确例外）：

- TECHDOC：`docs/techdoc-library-manuscript-skin-mvp.md`
- 交付记录与矩阵：`docs/library-manuscript-skin-mvp/phase5/DELIVERY.md`
- 截图目录：`docs/library-manuscript-skin-mvp/phase5/screenshots/`
  - modern / manuscript 平铺对比；
  - modern / manuscript 封面对比；
  - `< xl` 与 `>= xl` 窗口；
- 三条自动校验命令结果（见 DELIVERY）；
- 已知限制说明（见 DELIVERY）：其他页面及全局浮层仍为现代视觉。

### Phase 5 执行记录（2026-08-09）

完整正文见 [`docs/library-manuscript-skin-mvp/phase5/DELIVERY.md`](./library-manuscript-skin-mvp/phase5/DELIVERY.md)。摘要：

- **执行日期**：2026-08-09（非 2026-08-07；后者仅为 Phase 1–2 时段）。
- **验收提交范围**：`06f0a0f`（Phase 4 终点）..`7eefb70`（Phase 5 交付提交）。
- **自动校验**：`typecheck` / `lint` / `build` 均通过（对应即将合入 `7eefb70` 的工作树）。
- **代码层矩阵**：路由隔离、持久化、虚拟列表几何、命名空间、无重管线、交互契约均通过代码核对。
- **回归修复**：`song-cover` border-box；封面分组选择器特异性高于 scoped。
- **已知限制**：壳层与 Teleport 浮层保持现代；歌单页不应用手稿；部分历史硬编码文案不在 MVP 范围。

---

## 6. Phase 依赖关系

```text
Phase 0 回归基线
  └─ Phase 1 状态与入口
       └─ Phase 2 纸张画布与 Token
            ├─ Phase 3 平铺列表
            └─ Phase 4 封面视图与常驻控件
                 └─ Phase 5 回归与交付
```

Phase 3 和 Phase 4 在 Phase 2 完成后可以分别开发，但合入前必须共同通过 Phase 5。
推荐每个 Phase 独立提交，避免视觉问题与状态、虚拟滚动问题混在同一个提交中。

---

## 7. 风险与缓解

### 7.1 样式泄漏到歌单页面

**风险**：`LibraryPage.vue` 被多条路由复用。  
**缓解**：route name 与 visual style 双重判断；所有 CSS 使用 feature 根命名空间。

### 7.2 虚拟列表高度漂移

**风险**：字体、border 或 padding 改变实际行高。  
**缓解**：保持 border-box；暗红线用绝对定位；每 Phase 实测 44px/40px；不修改
virtualizer estimateSize。

### 7.3 字体缺字或简繁字形不一致

**风险**：GenRyuMin2TC 对部分简体字形表现不符合预期。  
**缓解**：保留现有字体 fallback；使用真实中英混排曲库验收。若视觉验收不通过，将引入简体
衬线字体列为后续独立任务，不扩大本 MVP。

### 7.4 页面外浮层视觉断层

**风险**：右键菜单和元数据 Dialog 仍为现代玻璃样式。  
**缓解**：将其记录为明确 MVP 边界；不通过无命名空间 CSS 强行覆盖 Teleport 内容。

### 7.5 全局流体背景仍在运行

**风险**：纸页遮住中央流体背景，但外围现代外壳仍消费现有色板和动画。  
**缓解**：这是已确认的“纸页置于深色桌面”构图；MVP 不修改共享播放背景管线，以免影响
Sidebar、Playbar 和其他页面。

---

## 8. Definition of Done

满足以下条件后，手稿皮肤 MVP 才视为完成：

- Phase 1–4 的所有验收门槛通过；
- Phase 5 自动校验和手工矩阵通过；
- 手稿状态仅在全部歌曲页生效并能跨重启恢复；
- 两种歌曲视图均形成暖白档案总账视觉；
- 页面布局、虚拟滚动几何和全部既有交互零退化；
- modern 模式无视觉回归；
- 不触及 Playbar、Miniplayer、主进程、IPC 或数据库；
- 截图与已知限制已纳入交付说明。

本 MVP 完成后，是否扩展至歌单、专辑、全屏播放器和全局浮层，必须另行立项，不在本
TECHDOC 中预承诺。
