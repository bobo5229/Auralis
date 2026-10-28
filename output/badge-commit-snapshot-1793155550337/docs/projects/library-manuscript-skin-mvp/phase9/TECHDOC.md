# TECHDOC：全部歌曲页视觉稳定性与大曲库耐久性（Phase 9）

**编写日期**：2026-08-12
**实施分支**：`script-skin-dev`
**前置阶段**：Phase 8 代码已交付；Phase 8 人工结论已于 2026-08-13 回填，无独立截图入库
**设计参数**：`DESIGN_VARIANCE 6 / MOTION_INTENSITY 2 / VISUAL_DENSITY 8`

---

## 1. 阶段目标

Phase 9 不继续扩张手稿皮肤覆盖范围，也不新增装饰性动效。它负责让 Phase 7-8 已形成的档案册编排在大曲库、快速滚动、连续搜索、视图切换、后台刷新和不同中央内容宽度下保持稳定。

完成后应达到：

- 全部歌曲页在数万首曲目的数据规模下，不因重复线性查找或重复文本归一化产生明显额外卡顿；
- flat / cover 的搜索定位、键盘巡检、当前曲定位和视图切换共享可信的索引与偏移来源；
- FOLIO 更新不会在同一滚动帧内反复写响应式状态；
- 扫描完成、元数据保存和路由切换等异步刷新不会由旧请求覆盖新页面状态；
- 现有 44px / 40px / 250px 等虚拟几何、播放队列、右键菜单和 Teleport 行为保持不变；
- modern 与所有歌单路由继续保持 modern，不扩大手稿样式作用域。

## 2. 范围与非目标

### 2.1 范围内

- `LibraryPage.vue` 的派生索引、搜索、滚动、定位和刷新协调；
- 必要时新增 feature-scoped、纯 TypeScript 的曲库索引或搜索工具；
- 保持现有 UI 不变的性能和稳定性加固；
- Phase 9 基线、交付和人工验收记录；
- 对当前未提交的平铺文字对比度修复提供基线保护。

### 2.2 非目标

- 不新增数据库分页、服务端搜索、搜索索引表或新 IPC 合约；
- 不修改 Repository -> Service -> Typed IPC -> UI 数据流；
- 不改变排序规则、搜索的前缀匹配语义、回绕语义或 Enter 跳转行为；
- 不改变 flat / cover 的 DOM 几何指标、overscan 或视图模式持久化；
- 不把手稿皮肤扩展到歌单、Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词或全屏播放；
- 不引入新依赖，不增加自动动画，不改变产品行为。

数据库分页与主进程排序下推属于独立架构阶段。Phase 9 先消除 renderer 内已经确认的重复工作，并建立可用于后续架构升级的测量基线。

## 3. 基线事实与主要成本

### 3.1 必须保护的现有改动

Phase 9 起点为提交 `d2975e0473ad623951b2bd65154775b585b7e925`。工作树另有一项未提交修改：`manuscript.css` 的 flat 行文字对比度修复。任何 Step 都不得覆盖、重写或顺带提交该修改，除非交付时由用户明确决定如何归属。

### 3.2 已确认的热路径

- `tracks.findIndex` / `tracks.some` 在定位、焦点恢复和键盘巡检路径多次重复执行；
- cover 定位会先 `findIndex` 专辑组，再从 0 累加此前所有组高度；
- `albumGroups.find(...some(...))` 在播放专辑、插播专辑、菜单作用域和焦点恢复中重复执行；
- 搜索每次 Enter 先收集全部匹配，再通过第二次扫描找下一个结果，且每次比较都会重复执行 NFKC、繁简转换和小写归一化；
- scroll 事件直接执行 FOLIO 推导与响应式写入，未合并到 animation frame；
- `onChanged`、scan completed、路由 watch 和元数据保存均可触发全量加载，缺少统一的旧请求失效机制。

### 3.3 虚拟几何不变量

| 指标                      |    固定值 |
| ------------------------- | --------: |
| Flat row                  |      44px |
| Flat artwork              |      44px |
| Cover artwork             |     250px |
| Cover track row           |      40px |
| Cover panel block padding | 每侧 10px |
| Cover panel border        |       1px |
| Album group block padding | 每侧 28px |
| Album group bottom border |       1px |

任何 Step 如需改变上述值，必须同时更新 `libraryLayoutMetrics.ts`、CSS 消费点、virtualizer estimate 和定位公式，并重新立项。Phase 9 默认禁止改变。

## 4. 技术原则

### 4.1 派生数据单一事实源

从当前 `tracks` 和 `albumGroups` 派生以下只读索引：

- track id -> track index；
- track id -> track；
- track id -> album group index；
- album group index -> 起始偏移；
- 必要时 track id -> 搜索归一化字段。

索引只在源数组变化时重建，不在滚动或按键事件内重建。不得建立第二份可变业务状态，也不得复制播放 store。

### 4.2 保持行为等价

优化前后必须保持：

- 搜索字段仍为 title / artist / albumArtist / album；
- 匹配仍为归一化后的 `startsWith`；
- 同一查询连续 Enter 按曲库顺序寻找下一首，到末尾后回绕；
- 匹配反馈中的 index / total / wrapped 语义不变；
- 定位仍以可视区域约 33% 处为目标；
- flat / cover 切换仍以歌曲 id 作为锚点；
- 点击选中、双击播放、队列、插播、整专辑菜单和元数据编辑不变。

### 4.3 局部优化，不增加架构负债

- 优先新增小型纯函数或 composable，避免继续扩大 `LibraryPage.vue`；
- 不用 `any`，不增加第三方依赖；
- 不把缓存挂到全局对象或 localStorage；
- 不在 render loop、scroll handler 或模板表达式里做全量数据转换；
- rAF 必须可取消，监听器与异步状态必须在卸载时清理或失效。

## 5. 分步实施

### Step 9.1：建立派生索引与定位单一事实源

**目的**：先消除所有定位路径中的重复 O(n) 查找和 cover 前缀累加，为后续步骤提供稳定接口。

**实现要求**：

1. 新增 feature-scoped 纯 TypeScript 工具或 composable，基于 `tracks` 与 `albumGroups` 一次构建：
   - `trackIndexById`；
   - `trackById`；
   - `albumGroupIndexByTrackId`；
   - `albumGroupStartOffsets`。
2. `albumGroupStartOffsets[i]` 必须严格等于 `0..i-1` 的 `getAlbumGroupSize` 总和，并与 virtualizer estimate 使用同一函数。
3. 替换以下路径的重复查找：
   - `getTrackById`；
   - flat / cover 的 `scrollRenderedTrackToRatio`；
   - `ensureKeyboardFocusTrackId` 与 `moveKeyboardFocus`；
   - 专辑播放、插播、菜单 track ids、封面焦点恢复。
4. 索引缺失时安全返回，不改变现有 fallback。
5. 不修改搜索逻辑、不修改 CSS、不改 IPC、不改可见文案。

**验收**：

- `LibraryPage.vue` 的定位和专辑查找路径不再出现 `tracks.findIndex`、`tracks.find` 或 `albumGroups.find(...some(...))` 的重复全量扫描；
- cover 定位不再通过循环临时累加前序组高度；
- flat / cover 搜索定位、当前曲定位、键盘 Home/End/方向键和右键整专辑行为保持不变；
- typecheck、lint、build、diff check 通过。

### Step 9.2：建立搜索归一化索引与单次扫描流程

**目的**：避免每次 Enter 对全部字段重复执行字符串归一化，并消除先收集、再扫描的双遍逻辑。

**实现要求**：

1. 在 `tracks` 变化时生成与曲目顺序一一对应的搜索记录，每条仅保存四个已归一化字段；
2. 查询字符串每次 Enter 只归一化一次；
3. 单次顺序扫描同时得到：
   - 总匹配数；
   - 当前应跳转的下一匹配 index；
   - 是否发生回绕；
   - 下一匹配在全部匹配中的 1-based 位置；
4. 不改变空值、繁简转换、NFKC、小写、前缀匹配和字段范围；
5. 新增纯函数级验证样例或可执行断言，覆盖无匹配、首次匹配、末尾回绕、多字段命中但单曲只计一次。

**验收**：

- `jumpToNextSearchMatch` 不再建立 `matchingIndices` 后再次调用全量查找；
- 搜索热路径不再为每个字段重复调用 `normalizeSearchText`；
- 三语反馈与 `aria-live` 行为不变；
- typecheck、lint、build、diff check 通过。

### Step 9.3：合并滚动帧更新并稳定 FOLIO/焦点定位

**目的**：使滚动热路径每帧最多更新一次派生可见索引，避免同步响应式写入和 cover 虚拟窗口边界抖动。

**实现要求**：

1. `scroll` 监听仅安排一次 rAF，重复事件复用待执行帧；
2. rAF 内读取最新 scrollTop 和最新 virtual items，计算并提交 first visible track index；
3. 路由、视图和 tracks 变化触发的同步更新走同一调度入口；
4. 卸载时取消待执行 rAF；
5. 复核 cover 第一可见组边界，避免组顶部临界点来回切换；
6. 不增加自动动效，不改变滚动位置和 FOLIO 每 50 首的定义。

**验收**：

- 一个 animation frame 内最多发生一次 `firstVisibleTrackIndex` 计算/提交；
- 快速滚动与滚轮停止后 FOLIO 最终值正确；
- flat / cover 切换和搜索定位后 FOLIO 立即收敛；
- rAF 无泄漏，typecheck、lint、build、diff check 通过。

### Step 9.4：加固异步刷新竞态与锚点连续性

**目的**：防止旧的全量加载覆盖新路由或较新的刷新结果，并让后台更新尽量维持用户上下文。

**实现要求**：

1. 为统一加载入口增加单调 request generation 或等价的旧请求失效机制；
2. 只有最新请求可以提交 tracks、view mode、loading/error 状态；
3. 区分初始/路由加载和后台刷新：后台失败保留已有曲目，初始失败继续展示可重试 error；
4. 后台刷新前记录稳定锚点（优先键盘焦点、选中、当前播放、首个可见 track），刷新后若仍存在则恢复；
5. 路由已切换时不得把旧路由数据或旧 view mode 写回；
6. 监听器卸载后未完成请求不得继续提交页面状态。

**验收**：

- 快速切换全部歌曲/歌单、连续 scan completed/onChanged 时以最后请求为准；
- 元数据保存后焦点返回契约不变；
- 后台刷新失败不会清空列表或覆盖 initial error；
- current/selected/keyboard focus fallback 顺序不变；
- typecheck、lint、build、diff check 通过。

### Step 9.5：大曲库、响应式与交付门禁

**目的**：用自动化和人工证据证明 Phase 9 没有以性能优化换取行为或视觉回归。

**自动检查**：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

对所有新增或修改的中文文件执行 UTF-8 字节解码校验，并检查无替换字符、无连续问号乱码。

**人工矩阵**：

| 维度   | 必验项                                                                        |
| ------ | ----------------------------------------------------------------------------- |
| 数据量 | 小曲库、真实大曲库或受控生成的 10k / 50k 级数据                               |
| 视图   | modern flat、modern cover、manuscript flat、manuscript cover                  |
| 路由   | 全部歌曲、普通歌单、智能歌单                                                  |
| 宽度   | 900x620、1279x800、1280x800、1600x900                                         |
| 缩放   | Windows 100%、125%、150%                                                      |
| 行为   | 搜索连续 Enter/回绕、键盘巡检、定位当前曲、视图切换锚点、右键菜单、编辑元数据 |
| 状态   | loading、empty、initial error、后台刷新失败、scan completed                   |

**交付记录**：

- 更新 `BASELINE.md` 与 `DELIVERY.md`；
- 记录每个 Step 的修改文件、审查 Finding、解决方案和验证命令；
- 当前曲库规模下的视觉与功能人工项已于 2026-08-13 按用户确认回填。10k / 50k 容量门禁仍延期，不得写成已实测完成。

## 6. 文件职责建议

| 文件                                | Phase 9 职责                                             |
| ----------------------------------- | -------------------------------------------------------- |
| `pages/LibraryPage.vue`             | 消费索引、协调搜索/滚动/刷新，不继续承载可独立测试的算法 |
| `constants/libraryLayoutMetrics.ts` | 继续作为虚拟几何单一事实源，原则上不改数值               |
| `utils/` 或 `composables/` 新文件   | 放置纯索引、搜索扫描或请求协调逻辑，保持 feature-scoped  |
| `styles/manuscript.css`             | 仅保护当前未提交的对比度修复，Phase 9 默认不改视觉       |
| `phase9/BASELINE.md`                | 记录起始 SHA、脏工作树、前置人工门禁与已知风险           |
| `phase9/DELIVERY.md`                | 按 Step 记录实现、Findings、解决方案与验收状态           |

## 7. 风险与解决方案

### 风险 1：索引过期

**表现**：tracks 更新后仍定位到旧 index 或旧专辑组。
**解决**：索引必须由响应式源同步派生，不允许手动增量维护多个 Map；所有消费者从同一快照读取。

### 风险 2：偏移与 virtualizer 不一致

**表现**：cover 搜索定位或视图切换发生空洞、重叠或漂移。
**解决**：offset 只能由 `getAlbumGroupSize` 生成，禁止复制高度公式。

### 风险 3：搜索优化改变产品语义

**表现**：contains 替代 prefix、同曲多字段重复计数、回绕位置错误。
**解决**：搜索记录按 track 为单位，字段只决定“该 track 是否匹配”；单遍扫描显式返回 total、targetIndex、position、wrapped。

### 风险 4：rAF 调度导致 FOLIO 延迟或卸载后写入

**表现**：滚动停止后页码不更新，或切路由后旧帧写状态。
**解决**：调度函数始终读取最新引用；视图切换后显式安排一帧；卸载取消帧。

### 风险 5：请求代次与现有焦点恢复冲突

**表现**：元数据保存完成后对话框关闭但焦点未返回，或后台刷新抢走滚动位置。
**解决**：请求代次只控制数据提交，不接管既有对话框 handoff；锚点恢复由调用方在最新请求成功后执行。

### 风险 6：优化误触 modern 或歌单

**表现**：歌单被强制手稿化，或 modern 搜索/列表行为变化。
**解决**：数据索引可以共享，但手稿专属 FOLIO 与键盘逻辑继续受 `isManuscriptLibrary` 门控；视觉文件不扩大作用域。

## 8. 完成定义

Phase 9 只有在以下条件全部满足时才算完全完成：

1. Step 9.1-9.5 均经 luna_worker 实现、主线程审查、Finding 修复与复查；
2. 自动检查全部通过；
3. UTF-8 与 diff check 通过；
4. 手稿与 modern、flat 与 cover、全部歌曲与歌单均无行为回归；
5. 大曲库、四档窗口、三档 Windows 缩放的人工矩阵有明确记录；
6. 当前未提交的平铺文字对比度修复没有丢失或被误归属；
7. `DELIVERY.md` 真实记录人工验收是否完成，不提前关闭门禁。
