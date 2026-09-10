# TECHDOC：Sidebar 首次路由切换预热

- **文档状态**：方案就绪 / 待实施
- **设计日期**：2026-09-04
- **目标模块**：`src/renderer/app/router/`、`src/renderer/app/layout/AppSidebar.vue`、
  `src/renderer/main.ts`
- **风险等级**：C（共享路由加载行为；不改 IPC 与业务数据语义）
- **核心目标**：保留页面级懒加载和冷启动收益，同时消除主窗口启动后首次进入 Albums、Archive、
  Settings 时可感知的额外等待。

## 1. 问题定义

主窗口第一次打开后，用户首次点击 Sidebar 中尚未访问的一级页面时，导航响应比之后访问同一页面
略慢。当前实现已经在 `pointerdown` 时提前更新 Sidebar 高亮，因此延迟主要表现为内容区域仍短暂保留旧页，
而不是按钮没有反馈。

本方案只处理一级内容路由的首次代码加载差异：

- `/albums`（`albums`）；
- `/archive`（`archive`）；
- `/settings`（`settings`）。

`library` 是默认入口，启动时已由 `router.isReady()` 加载；`album-detail` 没有固定 Sidebar 入口，
继续在用户打开专辑时按需加载。普通歌单和智能歌单复用已经加载的 `LibraryPage`，不单独预热。

## 2. 根因与证据

### 2.1 首要根因：路由 chunk 只在第一次导航时加载

`src/renderer/app/router/index.ts` 使用动态 `import()` 注册五个页面。Vue Router 在确认异步路由组件前
必须等待模块 Promise 完成。首次访问需要从本地构建产物读取、解析并执行页面 JS，同时装载该页面的
抽离 CSS；再次访问会命中 Chromium 的模块缓存，因此没有同等的一次性成本。

该行为由提交 `4e6b5d9` 引入。在此之前，页面为静态导入。现有 `electron.vite.config.ts` 未配置页面
预加载，生产构建的 `index.html` 也只引用入口 JS/CSS，因此一级页面 chunk 不会在启动后主动变热。

当前构建产物提供了量级证据，但不是最终性能基线：

| 页面     | JS（约） | CSS（约） | 首访附加工作             |
| -------- | -------: | --------: | ------------------------ |
| Albums   |    31 KB |     17 KB | 解析模块与样式           |
| Archive  |   121 KB |    109 KB | 解析较大的页面模块与样式 |
| Settings |    48 KB |     40 KB | 静态依赖三个设置分区组件 |

这些是未压缩的本地产物大小，只用于解释页面间差异，不可直接当作耗时结论。

### 2.2 次要放大因素：页面首挂载数据工作

- Albums 在 `onMounted` 后调用 `library.getTracks()`，主进程重新查询、排序并通过 IPC 返回全部曲目；
  Renderer 随后按专辑同步分组。
- Archive 在挂载时并行启动热力图、年度洞察、流派、当前排行和年度双排行等请求；部分 SQLite 聚合
  在 Electron 主进程同步执行。
- Library 提交初始快照后，以不超过约 8 ms 的分片构建搜索索引。如果用户刚启动就导航，旧页面在
  异步路由组件解析完成前仍可能执行分片任务。

这些工作会放大首访体感，但不是“同一页面第二次更快”的完整解释：当前 `RouterView` 没有
`KeepAlive`，Albums 和 Archive 返回时仍会卸载、重新挂载并重新请求数据。首次与后续访问最稳定的
差异是模块已经加载。

### 2.3 明确排除

- Sidebar 点击处理没有人为 debounce 或定时等待；`pointerdown` 已提供乐观高亮。
- 通用 `fade` 路由过渡当前没有对应的全局 CSS 时长，不是固定延迟来源。
- 这不是损坏的业务缓存；它是路由代码分割的预期缓存行为。

## 3. 设计原则

1. **保留懒加载**：不能把所有页面恢复为入口静态导入，否则只是把首次导航成本转移到冷启动。
2. **首屏优先**：任何自动预热必须发生在 `rendererReady()` 之后，不阻塞 `router.isReady()`、首屏挂载
   或主窗口显示。
3. **只预热代码**：预热不得挂载页面、执行页面 `onMounted`、发起曲库/归档 IPC 或预取业务数据。
4. **意图优先、空闲兜底**：鼠标/键盘显示导航意图时立即预取目标；无交互时在空闲片段顺序预热。
5. **精确路由身份**：使用显式 route name 映射，不以路径前缀推断页面。
6. **可失败、可重试**：预热失败不能阻止正常导航，也不能永久缓存 rejected Promise。
7. **不建立第二套缓存**：不引入页面实例缓存、曲目副本或跨页面业务 store。

## 4. 选定方案

采用“两级预热”，共用路由本身的动态加载函数。

```text
主窗口首屏完成
    ├─ 用户 hover / focus 某 Sidebar 一级入口
    │      └─ 立即预取该路由组件 chunk
    └─ 浏览器进入 idle
           └─ Albums → Archive → Settings 顺序预热

用户 click
    └─ Vue Router 调用同一个 loader
           ├─ 已完成：立即复用模块
           ├─ 进行中：复用同一个 Promise
           └─ 未开始/曾失败：正常加载或重试
```

优先级选择为 Albums、Archive、Settings：Albums 是紧邻默认 Library 的高频入口；Archive chunk 较大，
但不应抢占首个空闲片段；Settings 频率较低。用户意图预取始终覆盖后台顺序。

### 4.1 集中管理路由组件 loader

新增 `src/renderer/app/router/routeComponentLoaders.ts`：

- 导出 Library、Albums、AlbumDetail、Archive、Settings 的 loader；
- `router/index.ts` 只引用这些 loader，确保导航和预热不会形成两套 import 表达式；
- 导出严格的可预热 route name 类型与映射；
- 可选的 in-flight Promise 只用于去重，失败时必须清除，成功后由模块系统缓存结果。

不要在该模块顶层导入任何页面组件。顶层只能保存返回 `import()` Promise 的函数和轻量状态。

### 4.2 导航意图预取

在 `AppSidebar.vue` 为三个一级入口和 Settings 工具入口增加：

- `pointerenter`：预取目标 route name；
- `focusin`：键盘导航获得焦点时预取；
- 保留现有 `pointerdown` 乐观高亮，不改变 click、drag、长按或焦点恢复逻辑。

预取函数应是 fire-and-forget，并自行捕获错误。UI 不增加 loading spinner，不改变 active 状态。
触屏没有 hover 时仍由空闲预热与正常路由加载兜底。

### 4.3 首屏后的空闲预热

新增 `src/renderer/app/router/routeWarmup.ts`，由 `src/renderer/main.ts` 在以下顺序之后启动：

1. `router.isReady()`；
2. `app.mount('#app')`；
3. `await nextTick()`；
4. `auralis.app.rendererReady()`；
5. `schedulePrimaryRouteWarmup()`。

调度器使用 `requestIdleCallback`；测试环境或不支持该 API 时，以短 `setTimeout` 作为后备。每次 idle
只启动一个页面 loader，再为下一项重新排队，避免三个 chunk 同时解析造成长任务。若
`IdleDeadline.timeRemaining()` 已耗尽且未超时，本轮不加载并继续排队。

调度器不得等待业务 IPC，不得从 Electron 主进程预读文件，不修改 preload 或安全策略。

### 4.4 生命周期与诊断

- Desktop Lyrics 启动分支在进入主 App 前已经 return，不参与预热。
- 主窗口销毁后，尚未执行的 timeout/idle callback 应可取消；已经开始的动态 import 无需强制中止。
- DEV 模式通过 `rendererDiagnostics` 记录 route name、触发来源（`intent | idle`）、耗时及失败原因；
  不记录用户曲库路径或其他隐私数据。
- 生产模式不输出高频日志。

## 5. 不采用的方案

### 5.1 全部恢复静态导入

虽然能消除首次切页差异，但会扩大入口 chunk，并让 Archive、Settings 等低频页面参与冷启动解析。
这违背“保留懒加载行为”的 Renderer 约束，也会掩盖而非消除成本。

### 5.2 给 `RouterView` 增加 `KeepAlive`

`KeepAlive` 不能解决第一次加载 chunk；它还会让曲目数组、虚拟列表、页面订阅和滚动状态长期驻留，
需要重新设计 activated/deactivated 生命周期。当前问题不值得引入该内存与正确性风险。

### 5.3 启动时预取全部页面数据

这会让 SQLite 查询、IPC 序列化和 Renderer 聚合与首屏竞争，并产生失效与 generation 语义问题。
本阶段只预热代码，不预热业务数据。

### 5.4 立即新增跨层缓存或 IPC

Albums 专用摘要查询、Archive 聚合缓存可能有独立价值，但会扩大到 Repository、Service、Typed IPC
和数据失效策略。在性能录制证明代码预热后仍未达标之前，不进入本次实现范围。

## 6. 实施步骤

### Step 1：建立可复用 loader 契约

1. 新增 `routeComponentLoaders.ts` 与相邻单元测试。
2. 将 `router/index.ts` 改为引用集中 loader。
3. 验证每个 route name 映射唯一，Library/playlist/smart-playlist 仍复用同一 Library loader。

### Step 2：实现预热调度器

1. 新增可注入 scheduler/clock/loader 的 `routeWarmup.ts`，避免测试依赖真实 chunk。
2. 实现 intent 去重、idle 顺序、失败后重试与 dispose。
3. DEV 诊断必须异步且不改变导航结果。

### Step 3：接入 Sidebar 与启动流程

1. Sidebar 的一级入口按显式 route name 触发 intent 预取。
2. `main.ts` 在 `rendererReady()` 之后启动 idle warmup。
3. 不改 Sidebar activePath、RouterLink 目标、路由 key、Transition 或页面生命周期。

### Step 4：测量并决定是否进入数据阶段

完成代码预热后再录制生产构建。如果 click 到目标页首个 paint 已达标，停止，不修改数据层。只有
Albums 或 Archive 仍存在超过门槛的长任务，才另开方案处理对应页面：

- Albums：评估 Repository 层专辑摘要查询与 Typed IPC，避免把全部 Track DTO 传到 Renderer 后分组；
- Archive：评估合并首屏统计查询、推迟非首屏年度排行，或增加按播放统计 generation 失效的缓存。

这两项都必须单独读取架构、曲库数据和验收规则，并按 C 级重新设计，不能作为本方案的顺手改动。

## 7. 预计文件范围

| 文件                                                    | 计划改动                            |
| ------------------------------------------------------- | ----------------------------------- |
| `src/renderer/app/router/routeComponentLoaders.ts`      | 新增唯一 loader 表与预热 route 类型 |
| `src/renderer/app/router/routeComponentLoaders.test.ts` | loader 映射与失败重试测试           |
| `src/renderer/app/router/routeWarmup.ts`                | intent/idle 调度、去重、取消、诊断  |
| `src/renderer/app/router/routeWarmup.test.ts`           | 顺序、降级、失败、dispose 测试      |
| `src/renderer/app/router/index.ts`                      | 复用集中 loader                     |
| `src/renderer/app/layout/AppSidebar.vue`                | 接入 pointer/focus 意图预取         |
| `src/renderer/main.ts`                                  | rendererReady 后启动空闲预热        |

默认不修改 `electron.vite.config.ts`、主进程、preload、shared IPC、业务页面和数据库。

## 8. 验证计划

### 8.1 自动验证

按 C 级最低充分范围执行：

1. 定向运行 `routeComponentLoaders.test.ts`、`routeWarmup.test.ts` 及已有 router/Sidebar 相关测试；
2. 对实际修改的 Renderer 文件运行定向 ESLint；
3. 运行 `npm.cmd run typecheck`；
4. 运行 `npm.cmd run build`，确认页面仍为独立 chunk，且 bundle budget 通过；
5. 使用已有生产构建运行 Electron smoke，确认主窗口、Sidebar 路由、MiniPlayer 与 Desktop Lyrics
   启动分支未被预热接线破坏。

### 8.2 性能基线与验收

性能结论必须来自生产构建，不使用 Vite dev server 的模块请求代替。使用同一台 Windows 设备、同一
曲库和同一窗口尺寸，分别记录至少 10 次冷启动：

- `rendererReady` 前耗时；
- Sidebar pointer/focus 到目标异步组件 resolve；
- click 到目标页面根节点首次 paint；
- 第一次访问与第二次访问的差值；
- 50 ms 以上 Renderer long task；
- idle 预热期间是否出现可感知输入延迟。

验收门槛：

- `rendererReady` 的 P95 不得比基线回退超过 25 ms；
- 已完成 intent/idle 预热的一级页面，首次与第二次导航的 P95 差值不超过 25 ms 或 20%，取较宽者；
- 预热本身不得产生 50 ms 以上 Renderer long task；
- 点击时目标尚未预热完成，Sidebar 乐观高亮仍须在下一帧可见；
- 断网状态不影响结果，因为所有 chunk 均来自本地应用资源。

上述数值是实施验收门槛，不是已测结果。当前尚未完成运行时基线录制。

### 8.3 人工矩阵

- 输入：鼠标 hover 后点击、快速直接点击、键盘 Tab + Enter、触屏式无 hover 点击；
- 路由：Library → Albums、Archive、Settings，以及重复往返；
- 时机：窗口刚显示立即点击、空闲预热完成后点击；
- 表面：modern 与 manuscript；Fullscreen、MiniPlayer、Desktop Lyrics 不应触发主路由预热副作用；
- 降级：模拟 loader 首次 reject，正常导航可再次加载并展示现有错误行为，而不是永久失效。

没有可用 GUI 时必须记录“性能与视觉人工矩阵未验证”，不能用单元测试或 build 替代。

## 9. 风险与回滚

| 风险                        | 控制措施                                                  |
| --------------------------- | --------------------------------------------------------- |
| 预热反而争抢首屏            | 严格置于 `rendererReady()` 后，并一次只加载一个 chunk     |
| intent 与 idle 重复加载     | 共用 loader/in-flight 状态；模块系统缓存成功结果          |
| rejected Promise 被永久缓存 | catch 后清除 in-flight，正常导航允许重试                  |
| 低端设备 idle 时间不足      | intent 预取和正常导航始终可用；不以预热完成为导航前提     |
| 预热扩大为业务数据缓存      | 文件范围和 Step 4 决策门明确禁止                          |
| Desktop Lyrics 引入无用代码 | 保持其 bootstrap 提前 return，预热模块只在主 App 分支导入 |

若生产基线显示冷启动或交互性能回退，回滚顺序为：先关闭 idle 调度，保留 intent 预取；仍回退时移除
intent 接线并恢复原动态 loader 引用。整个回滚不涉及数据库、IPC 或用户数据迁移。

## 10. Definition of Done

- 路由仍保持按页动态 import，入口 bundle 未静态吞入所有页面；
- 主屏 `rendererReady()` 之前不启动页面预热；
- Albums、Archive、Settings 支持 intent 预取和 idle 顺序预热；
- 预热只加载模块，不挂载页面、不发起业务 IPC；
- 同一路由并发预热去重，失败后可重试，dispose 后不再排新任务；
- Sidebar 点击、拖拽、焦点、active 高亮及 route name 行为不变；
- 定向测试、typecheck、build、bundle budget 和 Electron smoke 按 §8 通过；
- 生产构建性能记录满足 §8.2，或明确记录未达标并停止交付；
- 人工矩阵结果如实记录，不把静态检查表述为视觉或性能验收通过。

本 TECHDOC 只定义后续获授权的实现。本轮不修改应用源码，也不声称性能问题已经修复。
