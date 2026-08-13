# Auralis 仓库协作指南

## 语言与工作环境

- 用户可能使用中文或英文发送指令，AI 必须始终用中文回复。
- 当前环境为 Windows 11 / PowerShell 7（`pwsh`），默认禁止使用 Bash 语法。
- 优先使用 PowerShell 原生命令处理文件：`Get-ChildItem`、`Get-Content`、`Copy-Item`、
  `Move-Item`、`Remove-Item`、`New-Item` 和 `Test-Path`。
- 不要在一次文件操作中混用 PowerShell、`cmd /c`、Bash 或其他 shell。
- 手工编辑优先使用 `apply_patch`；搜索优先使用 `rg`。如果 `rg` 失败，立即改用
  `Get-ChildItem`、`Select-String` 等原生 PowerShell 命令。
- 命令应保持短小、可检查。非简单任务按“发现、检查、编辑、验证”拆分执行。
- 禁止使用 `rm -rf` 或等价命令。递归删除或移动前必须解析并检查目标绝对路径，确认它位于
  工作区或用户明确指定的目录内。
- PowerShell 中复杂正则优先使用单引号。含通配符的目录必须先通过
  `Get-ChildItem -Filter` 展开，不能直接将带 `*` 的路径交给 `rg`。
- 多行 Python 使用 PowerShell here-string 并通过管道传给 `python -`，禁止使用 Bash
  heredoc。
- 如果命令因解析、权限、编码或 executable shim 失败，不要反复尝试同一种写法；改用更简单的
  原生命令、直接可执行文件路径或小型脚本。

### UTF-8 与中文安全

- Python、Node 等脚本读写文件时必须显式指定 UTF-8 编码，不能依赖系统默认编码。
- 通过命令行参数、stdin 或 API 传输中文时，使用 `ensure_ascii=True` 的 JSON 或 Unicode
  转义，避免传输裸中文字符串。
- 编辑包含中文的文件时优先使用 `apply_patch`。修改后应直接读取文件字节并执行 UTF-8
  解码校验，不以终端显示结果作为唯一依据。

## 项目定位与源码结构

Auralis 是面向个人大型音乐收藏的本地优先音乐播放器，不提供流媒体、社交、推荐或在线内容。
技术栈为 Electron 38、Vue 3、TypeScript 和 SQLite。功能状态以当前源码、路由和测试为准，
不要依赖文档中的历史完成度描述。

源码位于 `src/`：

- `src/main/`：Electron 主进程、数据库、服务、仓储、IPC、日志和 Worker。
- `src/preload/`：通过 context bridge 暴露类型化的 `window.auralis` API。
- `src/renderer/`：仅负责 Vue UI；功能页面位于 `src/renderer/features/`。
- `src/shared/`：跨进程类型、IPC contract 和共享常量。

`out/`、`data/`、`.electron-gyp/`、`.electron-home/`、`.npm-cache/` 和
`node_modules/` 是生成目录，不是源码。

## 常用命令

Windows PowerShell 中优先使用 `npm.cmd`。Node.js 版本必须不低于 20.19.0。

- `npm.cmd install --cache .npm-cache`：安装依赖。
- `npm.cmd run rebuild:native`：为 Electron 38 重建 `better-sqlite3`。
- `npm.cmd run dev`：启动开发环境。
- `npm.cmd test`：运行 Vitest 和静态视觉作用域检查。
- `npm.cmd run test:watch`：运行 Vitest watch 模式。
- `npm.cmd run typecheck`：运行 `vue-tsc --noEmit`。
- `npm.cmd run lint`：运行 ESLint。
- `npm.cmd run format`：运行 Prettier。
- `npm.cmd run build`：类型检查并通过 `electron-vite` 构建。
- `npm.cmd run preview`：预览构建产物。

不要随意升级 Electron 或 `better-sqlite3`。重新安装依赖或变更 Electron 后，启动应用前必须
执行 `npm.cmd run rebuild:native`。

## 编码规范

- 全部使用 TypeScript；Vue 组件使用 Vue 3 Composition API 和
  `<script setup lang="ts">`。
- Prettier 规则：无分号、单引号、每行 100 字符。
- 避免 `any`；确有必要时说明原因。
- 使用 feature-first 目录组织，避免建立宽泛的 `components/` 或 `utils/` 杂物目录。
- 样式优先使用 UnoCSS；主题颜色和稳定布局 shortcut 位于 `uno.config.ts`。
- 动画通过 `src/renderer/shared/animation/motion.ts` 封装使用。
- 主进程日志使用 `src/main/logging/logger.ts` 中的 Pino；Renderer 不使用 Pino。
- 数据库连接由 `src/main/database/connection.ts` 中的模块级单例管理。
- 路径别名为 `@main`、`@renderer` 和 `@shared`。

## 核心架构边界

Renderer 只负责渲染，数据流必须遵循：

```text
Repository -> Service -> Typed IPC -> UI
```

Renderer 不得直接访问 SQLite、文件系统、元数据解析、封面生成、扫描或搜索索引。昂贵的图片和
颜色计算应放入现有 Worker/canvas 流程，不能放进渲染循环。

### Typed IPC

新增 IPC invoke 时必须同步维护：

1. `src/shared/ipc/contracts.ts`
2. `src/shared/ipc/channels.ts`
3. `src/shared/ipc/api.ts`
4. `src/main/ipc/registerIpcHandlers.ts`
5. `src/preload/index.ts`

Renderer 通过 `src/renderer/shared/ipc/client.ts` 使用 preload API。主进程推送事件由 preload
包装监听器并返回 unsubscribe 函数。

### 曲库目录快照

All Songs 使用 `library:get-track-page`。主进程在
`src/main/features/libraryCatalog/libraryCatalogSnapshotStore.ts` 维护不可变、按拼音排序的
快照；游标不透明且必须绑定原快照。

当前 Renderer 会验证并聚合全部分页后再提交，因为封面分组、全局搜索和播放队列依赖完整的有序
快照。除非同时重构这些消费者，否则禁止：

- 改用 SQLite `OFFSET`；
- 静默复用过期游标；
- 向现有消费者暴露部分数组。

目录刷新必须保持 generation 控制并合并活跃的后台任务，优先级为：

```text
前台刷新 -> 元数据保存 -> 后台刷新
```

不得重新引入并发的完整快照构建。

### 数据库与扫描

- 数据库迁移位于 `src/main/database/schema.ts`，通过 `schema_migrations` 顺序执行。
- 数据库启用 WAL 和外键。
- 扫描必须在 Worker thread 中执行，不能阻塞 Electron 主进程。
- 保持基于 `file_size` 和 `file_mtime_ms` 的去重以及批量事务写入。

详细产品和技术背景见：

- `docs/2026-06-24/01-曲库加载/Auralis 曲库加载 PRD.md`
- `docs/2026-06-24/01-曲库加载/Auralis 曲库加载技术设计.md`
- `docs/2026-06-24/01-曲库加载/Auralis 悬浮 Playbar PRD.md`

## Renderer 视觉架构

### 窗口与术语

- 主窗口使用操作系统原生边框和标题栏：`frame: true`、`transparent: false`。
- 禁止重新引入 Renderer 自绘的主窗口控制按钮或主 shell 拖拽区域。
- **Playbar / PlayerBar**：主页面底部常驻播放栏，核心文件为
  `src/renderer/app/layout/PlayerBar.vue` 和 `TrackProgressInfo.vue`。
- **Miniplayer**：由 `MiniPlayer.vue` 和 `miniPlayerWindowController.ts` 控制的迷你窗口模式。
  它复用主 `BrowserWindow`，但 UI 和行为与 Playbar 完全隔离。
- 修改 Playbar 时不得误改 Miniplayer，反之亦然；主 `BrowserWindow` 配置会自然影响两种模式。
- 桌面歌词是独立的 frameless window，保留自身的 drag/no-drag 区域。

### 状态来源

- 播放视觉状态必须来自现有 playback composable，不得创建第二套 player store。
- `modern | manuscript` 视觉风格唯一来源是
  `src/renderer/features/appearance/composables/useVisualStyle.ts`。
- 视觉风格、全局 light/dark theme 和 PlayerBar material（`cover-tint | liquid-glass`）是三个
  相互独立的偏好，不能合并状态或互相重置。
- 页面 presentation 必须根据显式 Vue Router route name 解析，不能根据路径前缀推断。
- 普通主窗口可以使用 manuscript；Fullscreen 和 Miniplayer 始终保持 modern。
- 切换视觉风格不得 remount `AppSidebar`、`RouterView` 或设置页曲库区域，也不得清除已保存偏好。

### 样式所有权与隔离

manuscript 规则必须限定在对应 owner 下：

- Library：`.library-page[data-visual-style='manuscript']`
- Albums：`.albums-page[data-visual-style='manuscript']`
- Album detail：`.album-detail-page[data-visual-style='manuscript']`
- Archive：`.archive-page[data-visual-style='manuscript']`
- Settings：`.settings-page[data-visual-style='manuscript']`
- Sidebar：`.app-sidebar[data-shell-presentation='manuscript']`
- Shell：`.app-window[data-shell-presentation='manuscript']`
- Player：`.now-playing-panel[data-player-presentation='manuscript']`、
  `.player-bar[data-player-presentation='manuscript']`

Teleport overlay 必须携带所有者作用域：`.library-overlay`、`.albums-overlay`、
`.archive-overlay`、`.sidebar-overlay` 或 `.player-overlay`。不同 owner 的样式不得交叉污染。

共享 manuscript token 位于
`src/renderer/features/appearance/styles/manuscript.tokens.css`；页面组合样式继续由各 feature
拥有。禁止新增未限定作用域的 `html`、`body` 或 `#app` manuscript selector。

Shell manuscript 样式不得影响 Player、Fullscreen、Miniplayer 或桌面歌词。Player manuscript
样式不得影响 Sidebar、页面 owner、Fullscreen、Miniplayer 或桌面歌词窗口。

### Modern-only 效果

- 普通窗口的 shell chrome palette 和 `FluidArtworkBackground` 只在 modern shell 下运行。
- PlayerBar 的 artwork palette 和 album tint 只在 modern player presentation 下运行。
- Album detail 的 artwork canvas 和 pointer tilt 只在 modern 下运行。
- Archive 的 album-ranking artwork canvas 只在 modern 下运行。
- 切换到 manuscript 或卸载时必须停止并清理相关监听器、动画帧和进行中的图片工作；切回
  modern 时恢复一次，不能产生重复监听器、过期 tint 或重复定时器。

### 交互与几何不变量

- 新动画必须尊重 `prefers-reduced-motion`，并在卸载时清理 animation frame 和监听器。
- 视觉风格切换必须保留选择、播放队列、搜索、右键菜单、元数据、歌词状态和懒加载行为；图片
  保持 `decoding='async'`。
- 保持虚拟列表几何，除非同时修改 CSS 和 virtualizer estimate：平铺行 44px、封面轨道
  40px、封面 250px、轨道面板垂直 padding 合计 20px、专辑组垂直 padding 合计 56px。
- manuscript Library 根节点是无外框的主列纸面，不能恢复外 margin、border、radius、page
  shadow 或 paper highlight。
- 手稿 PlayerBar 是 260px 起、右/底贴边的连续页脚（Phase 23）：`left: 260px`、72px 高、仅
  顶角 16px 圆角、无悬浮外投影；modern 悬浮几何不变。manuscript safe area 为 88px（72 + 16，
  由 shell 作用域派生），全局 116px 不变；窄窗音量滑杆经 `manuscript-player-bar` 容器查询
  折叠并以向上 overlay 展开。

## 验证策略

验证应与改动风险匹配，并在交付时明确说明实际执行了哪些命令。

### 常规代码修改

至少运行：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

### 完整构建

修改构建配置、入口、IPC、主进程、原生依赖或准备发布时，再运行：

```powershell
npm.cmd run build
```

`build` 已包含类型检查；如果刚刚成功执行了完整构建，不必仅为重复验证再次运行
`typecheck`。

### 文档修改

纯文档或注释修改不强制执行完整应用构建，只需检查格式、链接和受影响内容。

### 视觉修改

除自动检查外，人工验证受影响页面的 `modern` / `manuscript`、light / dark、主要视图模式和
相关响应式断点。只检查本次改动涉及的 owner，同时确认被明确排除的 Shell、Player、
Fullscreen、Miniplayer 和桌面歌词没有被污染。

视觉检查必须覆盖本次改动相关的：

- 加载、错误、空状态、缺失封面和长混合语言文本；
- 搜索、选择、播放队列、菜单、overlay 和键盘焦点；
- 重复风格切换及 modern-only 工作的停止、清理和恢复；
- Library 的 flat / cover 和虚拟滚动几何；
- Albums 的 grid / perspective；
- `xl` 布局断点两侧（涉及主窗口布局时）。

测试文件与被测模块相邻，命名为 `*.test.ts`。纯状态、索引、搜索和几何逻辑应尽量从 Vue
组件中提取，以便直接测试。

## Git 与交付

- 默认在当前分支完成修改和验证。
- 只有用户明确要求时，才执行提交、推送、切换分支、合并或创建 Pull Request。
- 需要提交时使用中文 conventional commit，例如：
  - `feat：专辑详情页新增流体封面背景`
  - `fix：修复播放队列焦点循环`
  - `chore：更新检查脚本`
  - `refactor：重构曲库快照刷新流程`
  - `docs：更新视觉架构说明`
- 用户要求执行完整分支发布流程时，顺序为：在 `dev` 提交并推送，合并到 `master`，再推送
  `master`。
- Pull Request 应包含简短摘要、验证命令、UI 改动截图，以及原生模块或数据库变更说明。

修改过程中应保留用户已有的未提交改动，不得擅自覆盖、回退或清理无关文件。
