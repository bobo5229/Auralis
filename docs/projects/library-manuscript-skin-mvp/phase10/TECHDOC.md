# Phase 10 技术设计：全部歌曲页自动化回归护栏

**日期**：2026-08-12
**前置阶段**：Phase 9 代码完成，人工验收仍待执行
**实施线程**：主线程，不派出子代理

## 1. 目标

Phase 10 将 Phase 9 已经投入生产的搜索索引、派生索引、刷新竞态控制、虚拟滚动几何和手稿作用域转换为可重复执行的自动化契约。

本阶段不新增界面、不改变产品行为，也不替代 Phase 9 的真实窗口、DPI 和大曲库人工验收。

## 2. 非目标

- 不实现主进程分页、服务端搜索或增量 IPC。
- 不重写虚拟列表和播放队列。
- 不扩展手稿皮肤到歌单、播放栏、迷你播放器或全屏播放页。
- 不引入浏览器端组件快照和脆弱的像素截图测试。
- 不修改 44 / 40 / 250 / 10 / 28 等既有几何值。

## 3. 技术方案

### 3.1 测试运行器

引入 Vitest 3，并提供统一命令：

```text
npm.cmd test
```

该命令依次执行：

1. `vitest run`：纯 TypeScript 行为测试。
2. `test:library-scope`：读取真实源码的皮肤作用域和几何绑定静态检查。

测试文件与被测模块相邻，使用显式 `vitest` 导入，不依赖全局测试类型。

### 3.2 请求仲裁器

把 `LibraryPage.vue` 内下列状态抽到 `LibraryRequestCoordinator`：

- 最新请求 generation。
- 活跃 foreground generation。
- 活跃 metadata-save generation。
- 合并后的 pending background refresh。
- 等待 foreground 空闲的 Promise 队列。
- 页面卸载后的整体失效。

路由 scope、IPC 获取、列表提交、滚动锚点和错误提示仍留在页面。这样模块只负责确定“谁有权继续”，不接触 Vue、DOM 或业务数据。

核心次序保持为：

```text
foreground active
  ├─ background event → 合并为一个 pending
  └─ metadata-save → 等待 foreground
foreground finish
  ├─ 无等待者 → 放行 pending background
  └─ 有 metadata 等待者 → 先交棒给 metadata-save
metadata-save finish
  └─ 放行其间合并的 pending background
```

### 3.3 行为测试

自动覆盖：

- 搜索无结果、单曲多字段命中、继续查找、末尾回绕。
- nullable 元数据归一化、NFKC 和大小写折叠。
- track / group / cumulative offset 派生索引。
- 重复 track id 的首个快照语义。
- foreground 期间后台刷新合并。
- metadata-save 优先于 pending background。
- 新 generation 淘汰旧请求。
- 卸载使请求失效并释放等待者。
- library / playlist / smart-playlist scope 比较。
- 手稿 presentation 仅允许在 `library` 路由生效。

### 3.4 几何和作用域静态门禁

几何单元测试冻结以下事实源：

- flat row：44px。
- flat artwork：44px。
- cover artwork：250px。
- cover track row：40px。
- panel 单侧 padding：10px。
- album group 单侧 padding：28px。
- 封面列与曲目列的 estimated height 公式。

静态脚本还检查：

- 页面保留 `library + manuscript` 路由门禁。
- 页面与 Teleport overlay 分别保留独立命名空间。
- main shell 和 Uno 配置中不存在全局 manuscript shell selector。
- 关键 CSS 几何变量仍被真实页面、组件或 Uno shortcut 消费。

## 4. 分步实施

| Step | 内容                                  | 交付物                                    |
| ---- | ------------------------------------- | ----------------------------------------- |
| 10.0 | 冻结基线与技术边界                    | TECHDOC、BASELINE、DELIVERY               |
| 10.1 | 引入 Vitest 与统一测试命令            | package、lock、Vitest config              |
| 10.2 | 覆盖搜索、派生索引和路由 presentation | 相邻单元测试                              |
| 10.3 | 抽离请求仲裁器并接回真实页面          | coordinator、页面改造、竞态测试           |
| 10.4 | 固化虚拟几何与皮肤作用域              | geometry tests、静态检查脚本              |
| 10.5 | 主线程审查与完整门禁                  | test、typecheck、lint、build、diff、UTF-8 |

## 5. 验收标准

1. `npm.cmd test` 稳定通过，测试直接导入生产模块。
2. 页面中不再保留请求 generation、活跃 lane、pending refresh 的第二份状态。
3. Phase 9 两项竞态修复均有自动测试保护。
4. 搜索和派生索引的边界断言从生产源码移入测试文件，不进入构建产物。
5. 手稿仍只作用于全部歌曲页，歌单路由仍为 modern。
6. 原有 `typecheck`、`lint`、`build` 全部通过。
7. Phase 9 人工验收状态不得因本阶段自动化而被误标为完成。

## 6. 风险与控制

- **抽离改变竞态次序**：仲裁器只接管状态转换，scope、提交和 UI 副作用不迁移；以 generation ownership 测试约束。
- **静态检查误报**：只验证稳定锚点与禁止的全局 selector，不尝试解析完整 CSS 语义。
- **测试只验证副本**：删除生产源码中的手写 assertion helper，所有测试直接导入正式模块。
- **升级工具链**：固定 Vitest 3.x，不升级 Electron、Vite 或原生依赖。
