# Auralis 架构说明

> 本文描述当前仓库中的真实实现，供开发、评审和故障排查使用。
> 若本文与代码冲突，以代码为准，并应在同一变更中更新本文。

## 1. 项目目的与主要用户

Auralis 是一个 Windows 优先、local-first 的个人音乐档案与播放器。
它面向拥有本地音乐文件、希望长期整理和回顾个人收藏的用户，
而不是面向依赖云端曲库、社交推荐或流媒体服务的用户。

主要能力包括添加并扫描本地音乐目录，提取和编辑音频标签、封面与歌词，
浏览曲目、专辑、普通/智能播放列表，本地播放并记录收听历史，
通过 Archive 回顾统计，以及显示应用内歌词和独立桌面歌词。

隐私与耐久性是产品方向：音乐文件和数据库留在本机，当前没有账号系统、
遥测、在线推荐或云同步。

## 2. 技术栈和运行环境

- 桌面容器：Electron 38，主进程运行于 Node.js，界面运行于 Chromium。
- 语言：TypeScript 5.7；Vue 文件使用 Vue 3 Composition API 和 `<script setup>`。
- UI：Vue 3、Vue Router、UnoCSS、Motion One、TanStack Virtual。
- 视觉与歌词：PixiJS、`@applemusic-like-lyrics/core`、OpenCC JS。
- 数据库：SQLite，通过同步原生模块 `better-sqlite3` 访问。
- 元数据：`music-metadata`，耗时扫描和刷新运行在 Node worker thread。
- 日志与诊断：主进程使用 Pino（开发环境 `debug`、生产环境 `info`）；Renderer 使用仅写入本地
  DevTools 的结构化诊断封装，不上传遥测。
- 构建：electron-vite/Vite；安装包由 electron-builder 生成。
- 质量检查：Vitest（Node 普通测试与 Electron ABI 原生测试）、vue-tsc、TypeScript、ESLint、
  Prettier，以及 Library 视觉作用域静态检查。
- Node.js：`package.json` 要求 `>=20.19.0`。
- 发布目标：当前 electron-builder 配置 Windows x64 的 NSIS 安装包与 portable 包。

`better-sqlite3` 必须与 Electron ABI 匹配；安装依赖或改变 Electron 版本后，
必须运行 `npm.cmd run rebuild:native`。

## 3. 顶层目录职责

- `src/`：所有应用源代码。
- `src/main/`：Electron 主进程、文件系统、数据库、后台任务和 IPC 实现。
- `src/preload/`：受控的 context bridge；向 renderer 暴露 `window.auralis`。
- `src/renderer/`：Vue 界面、路由、视图状态、播放元素和视觉效果。
- `src/shared/`：跨进程 IPC 合约、领域类型和纯函数。
- `docs/`：设计演示、技术记录和本文；当前仅本文不被 `.gitignore` 忽略。
- `data/`：开发环境用户数据；包含数据库和缓存，不是源代码。
- `out/`：electron-vite 构建产物，不应手工编辑。
- `release/`：electron-builder 打包产物。
- `artifacts/`：本地性能分析等临时产物。
- `node_modules/`：安装依赖。
- `.electron-home/`、`.electron-gyp/`、`.npm-cache/`：本地构建和依赖缓存。
- `AppData/`：本地应用数据目录，不是源代码。

根目录的关键文件：

- 应用元数据、脚本、依赖和打包配置：`package.json`
- 三进程构建入口和别名：`electron.vite.config.ts`
- TypeScript 工程引用：`tsconfig.json`
- 主进程与 preload 配置：`tsconfig.node.json`
- renderer 配置：`tsconfig.web.json`
- lint 规则：`eslint.config.js`
- 格式化规则：`.prettierrc.json`
- UnoCSS 设计配置：`uno.config.ts`

## 4. 程序入口

- Electron 主进程入口：`src/main/index.ts`
- 主窗口创建：`src/main/app/createWindow.ts`
- 桌面歌词窗口：`src/main/app/desktopLyricsWindow.ts`
- 主窗口/桌面歌词 preload：`src/preload/index.ts`、`src/preload/desktopLyrics.ts`
- renderer HTML 入口：`src/renderer/index.html`
- Vue 启动入口：`src/renderer/main.ts`
- 主 Vue 应用：`src/renderer/App.vue`
- 桌面歌词 Vue 应用：`src/renderer/DesktopLyricsApp.vue`
- 顶层路由注册：`src/renderer/app/router/index.ts`
- IPC handler 注册/依赖组装：`src/main/ipc/registerIpcHandlers.ts`
- 全库扫描 worker：`src/main/features/libraryScan/libraryScanWorker.ts`
- 元数据刷新 worker：`src/main/features/metadata/metadataRefreshWorker.ts`

启动时，`src/main/index.ts` 设置开发数据目录和 GPU 开关，注册桌面歌词 IPC，
等待 Electron ready，随后注册封面/音频协议、初始化并迁移数据库、注册业务 IPC，
最后创建窗口。退出前会关闭 SQLite。

## 5. 核心模块与依赖方向

强制依赖方向是：

```text
Vue UI -> preload typed API -> Electron IPC handler -> Service -> Repository -> SQLite
                                           |             |
                                           |             +-> worker thread
                                           +-> Electron / filesystem
```

### 5.1 跨进程合约

- IPC channel 常量：`src/shared/ipc/channels.ts`
- 请求和响应映射：`src/shared/ipc/contracts.ts`
- renderer 可见 API：`src/shared/ipc/api.ts`
- preload 实现：`src/preload/index.ts`、`src/preload/desktopLyrics.ts`
- renderer 端调用辅助：`src/renderer/shared/ipc/client.ts`

新增或修改 IPC 时，必须同步维护 channels、contracts、api、preload 和 handler。
renderer 不得绕过 `window.auralis` 直接使用 Electron 能力。

主窗口与桌面歌词窗口均启用 `contextIsolation`、`webSecurity` 和 Electron sandbox，并关闭
Node integration。preload 构建为自包含的 CommonJS `index.cjs` 与 `desktopLyrics.cjs`；桌面歌词
只暴露自身所需的最小订阅 API。`src/main/app/webContentsSecurity.ts` 拒绝新窗口、webview 和权限
请求，并阻止偏离已配置 renderer 入口的导航与重定向。

### 5.2 主进程业务层

- 媒体库查询：`src/main/services/libraryService.ts`
- 普通播放列表：`src/main/services/playlistService.ts`
- 智能播放列表：`src/main/services/smartPlaylistService.ts`
- 播放统计：`src/main/services/playStatsService.ts`
- 全量扫描：`src/main/features/libraryScan/libraryScanService.ts`
- 增量导入：`src/main/features/libraryScan/libraryIncrementalImportService.ts`
- 文件变更监听：`src/main/features/metadata/metadataWatchService.ts`
- 元数据刷新：`src/main/features/metadata/metadataRefreshService.ts`
- 标签写回：`src/main/features/metadata/audioTagWriteService.ts`
- 元数据标准化：`src/main/features/metadata/metadataNormalizer.ts`
- 歌词解析：`src/main/features/metadata/resolveLyricsForFile.ts`
- 封面解析与缓存：`src/main/features/artwork/`
- 音频协议与路径校验：`src/main/features/audio/`

### 5.3 数据访问层

所有 SQL 数据访问应集中在 `src/main/repositories/`。
基础事务辅助位于 `src/main/repositories/baseRepository.ts`；曲目、媒体库根目录、
扫描任务、刷新任务、播放统计和两类播放列表均有各自 repository。

`src/main/ipc/registerIpcHandlers.ts` 当前承担 composition root：构造 repository、
service 和 watcher，并把它们绑定到 typed IPC。业务规则不应继续堆进 handler。

### 5.4 renderer

- 应用外壳：`src/renderer/App.vue`；持有侧边栏、路由页、歌词面板、悬浮播放栏和全屏播放层。
- 全局布局与播放控件：`src/renderer/app/layout/`
- 专辑：`src/renderer/features/albums/`
- Archive：`src/renderer/features/archive/`
- 媒体库和标签编辑：`src/renderer/features/library/`
- 歌词：`src/renderer/features/lyrics/`
- 播放状态与视觉效果：`src/renderer/features/playback/`
- 设置：`src/renderer/features/settings/`
- 跨 feature 的 UI 工具：`src/renderer/shared/`
- UI 语言（简/繁/英）：`src/renderer/i18n/`（vue-i18n 实例）+ `src/renderer/locales/`（`zh-Hans` 唯一手写源、`en` 人工、`zh-Hant` 由 `scripts/generate-zh-hant.mjs` s2tw 生成）+ `src/renderer/composables/useLocale.ts`（localStorage 持久化与热切换，键 `auralis-locale`）

主窗口使用操作系统原生窗口框架（`frame: true` + `transparent: false`），Windows 原生提供
标题栏及最小化、最大化 / 还原、关闭按钮，Renderer 不再绘制主窗口控制按钮或主壳拖拽区。
客户区壳底与内描边仍可跟随当前曲专辑色板（`--auralis-window-chrome-*`），无曲时回退主题
token。Miniplayer 当前复用同一主 `BrowserWindow`，因此也继承原生窗口框架；桌面歌词仍是
独立无框透明窗口，保留自身 drag / no-drag 区域。

播放视觉链路以 `src/renderer/features/playback/composables/usePlayback.ts` 为唯一状态源：
当前曲目封面 key 经 `getArtworkUrl` 转成 `auralis-artwork://` URL；`src/renderer/App.vue`
将 `FluidArtworkBackground.vue` 放在整个网格底层，歌词面板和页面共享其磨砂背景。
`PlayerBar.vue` 再通过 `useArtworkPalette.ts` 和 `artworkPalette.worker.ts` 提取主色，写入
CSS 变量，驱动玻璃染色、按钮、进度和音量反馈。全局 token/跨组件效果集中在
`src/renderer/app/styles/main.css`，稳定布局 shortcut 位于 `uno.config.ts`。

`src/renderer/features/albums/pages/AlbumDetailPage.vue` 负责专辑统计、曲目热度、艺术家
更多作品横滑区和指针驱动的 3D 封面投影。高频指针更新必须经 `requestAnimationFrame`
合并；流体背景和 3D 动效都必须尊重 `prefers-reduced-motion` 并在卸载时清理资源。

renderer 可以持有 UI 状态、播放用的 HTML media element、动画和派生展示数据，
但不能读取数据库、扫描目录或解析音频标签。

Renderer 错误统一通过 `src/renderer/shared/diagnostics/rendererDiagnostics.ts` 输出结构化事件。
该封装限制字符串、对象深度和条目数量，脱敏路径、URL 及敏感上下文字段，只写入本地 DevTools，
不会发送遥测。主进程的 `src/main/logging/mainProcessDiagnostics.ts` 捕获未处理异常、未处理
Promise rejection、启动失败，以及 renderer/child process 退出；错误名称、消息、栈、路径和 URL
在交给 Pino 前会归一化、截断和脱敏。致命主进程错误记录一次后以失败状态退出，诊断本身不得
替代或掩盖原始故障。

## 6. 一次典型请求与数据流

以“用户选择音乐目录并扫描”为例：

1. 设置页面通过 `window.auralis.library.selectRoot()` 发起调用。
2. `src/preload/index.ts` 使用定义在 shared 中的 channel 调用 `ipcRenderer.invoke`。
3. `src/main/ipc/registerIpcHandlers.ts` 打开系统目录选择器并保存 library root。
4. renderer 随后调用 `startScan(rootId)`。
5. `src/main/features/libraryScan/libraryScanService.ts` 创建 scan job 并启动 worker。
6. `src/main/features/libraryScan/libraryScanWorker.ts` 递归发现音频文件，读取标签、
   歌词和封面，并把批次与进度消息发回主线程。
7. 主线程通过 repositories 在事务中更新曲目、专辑、失败记录和任务状态。
8. 主进程发送 `library:scan-progress` 或 `library:changed` 事件。
9. preload 将事件转换为可取消订阅，Vue 页面重新查询并渲染结果。

应用启动后，`src/main/features/metadata/metadataWatchService.ts` 还会监听已登记目录。
它对事件去抖、检查文件稳定性，区分新增、修改、暂时不可访问、删除和移动，
然后触发增量导入、元数据刷新或可用性更新。

## 7. 数据库、缓存与消息队列

### 7.1 SQLite

- 连接管理：`src/main/database/connection.ts`
- schema 与顺序迁移：`src/main/database/schema.ts`
- 开发数据库：`data/user-data/data/auralis.sqlite`
- 打包后数据库：Electron `app.getPath('userData')/data/auralis.sqlite`
- SQLite 开启 WAL 和 foreign keys。

核心数据包含曲目/专辑、library roots、扫描与刷新任务及失败、规范化元数据、
艺术家关联、播放统计、每日统计、智能播放列表、普通播放列表及条目。
展示查询依赖 `library_track_display` view。

迁移仅可追加，不能修改已发布 migration 的含义。旧开发数据库
`data/auralis.sqlite` 会在新位置不存在时被一次性复制，包括 WAL/SHM 文件。

### 7.2 缓存

封面缓存由 `src/main/features/artwork/artworkCache.ts` 管理，位置为
`app.getPath('userData')/artwork-cache`。内容按 SHA-256 命名，并通过
`auralis-artwork://` 自定义协议提供给 renderer；协议实现位于
`src/main/features/artwork/artworkProtocol.ts`。

全量扫描 worker 内另有仅在单次扫描期间存活的专辑和目录封面 Map 缓存。
开发环境还把 Chromium cache 放在 `data/user-data/cache`。

### 7.3 消息队列

项目没有外部消息队列。异步消息来自两类本地机制：

- Electron IPC：renderer 请求/响应，以及扫描、刷新、媒体库变化等事件。
- Node worker thread：扫描和元数据刷新任务向主线程发送进度、结果和失败批次。

扫描/刷新 job 也会持久化到 SQLite，但它们不是独立队列服务。

## 8. 外部服务和接口

当前没有 HTTP server、REST/GraphQL API、云数据库、认证提供商、遥测、
流媒体 API 或第三方在线服务。应用的“外部接口”是：

- 用户选择的本地音频文件与同名 `.lrc` 歌词文件。
- Electron 操作系统接口，如窗口、目录选择器和文件监听。
- renderer 与主进程之间的 typed IPC API。
- 只读封面自定义协议 `auralis-artwork://`。
- 音频协议 `auralis-audio://`；主进程校验曲目、扩展名和 library root 后流式响应。

若未来增加网络服务，调用必须位于主进程 service 层，并通过 typed IPC 暴露；
renderer 不应直接持有密钥或实现持久化业务逻辑。

## 9. 配置文件与环境变量

仓库没有必需的 `.env` 文件，也没有 `.env.example`。当前使用的变量有：

- `ELECTRON_RENDERER_URL`：electron-vite 开发服务器地址，由工具链注入。
- `NODE_ENV`：控制日志级别等开发/生产行为。
- `AURALIS_QUIET_GPU_LOGS=1`：降低 Chromium GPU 日志级别；默认 dev 脚本启用。
- `AURALIS_DISABLE_DIRECT_COMPOSITION=1`：禁用 Windows DirectComposition。
- `AURALIS_SOFTWARE_RENDERING=1`：禁用硬件加速和多项 GPU 能力。
- `AURALIS_HARDWARE_VIDEO_PROCESSING=1`：保留硬件视频解码相关能力。
- `USERPROFILE`、`HOME`：`rebuild:native` 临时指向项目内 `.electron-home`。

开发环境会把 Electron userData 重定向到 `data/user-data`，避免污染系统目录。
GPU 变量是故障诊断开关，不应在不理解性能与兼容性影响时改变默认值。

## 10. 构建、测试与格式化命令

PowerShell 中使用 `npm.cmd`：

```text
npm.cmd install --cache .npm-cache
npm.cmd run rebuild:native
npm.cmd run dev
npm.cmd run dev:no-direct-composition
npm.cmd run dev:software-rendering
npm.cmd test
npm.cmd run test:unit
npm.cmd run test:native
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format
npm.cmd run build
npm.cmd run pack
npm.cmd run dist
```

测试分为两个 Vitest 执行通道，并由 `npm.cmd test` 统一编排：

- `test:unit` 在普通 Node.js 进程中执行 `src/**/*.test.ts`，明确排除
  `src/**/*.native.test.ts`，适合纯状态、索引、搜索、几何与不加载 Electron ABI 原生模块的
  主进程逻辑。
- `test:native` 由 Electron 启动 `scripts/run-electron-vitest.mjs`，再按
  `vitest.native.config.ts` 执行 `src/**/*.native.test.ts`。数据库迁移、扫描服务、音频协议和
  封面缓存等需要 `better-sqlite3` 的测试在这里运行，不能用普通 Node ABI 的执行结果替代。
- `test:library-scope` 检查 Library 视觉样式的所有者作用域，防止跨页面污染。

依赖安装后必须先运行 `npm.cmd run rebuild:native`，确保 `better-sqlite3` 与 Electron 38 ABI
匹配，再执行完整测试。常规代码变更至少应通过：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

修改构建配置、入口、IPC、主进程、原生依赖或准备发布时，再运行 `npm.cmd run build`。
`build` 已经把 `typecheck` 作为前置步骤；CI 因此在完整测试和 lint 后直接运行 `build`，同时
完成类型检查和生产构建，避免重复执行同一轮类型检查。`lint` 的 pre-script 也会先检查 locale
键，`build` 的 pre-script 会生成繁体中文资源并再次校验 locale。

`format` 会写入整个仓库，应在运行后检查变更范围。

## 11. 不能破坏的架构约束

- renderer 只负责渲染、动画、用户交互和界面状态。
- renderer 禁止直接访问 SQLite、Node 文件系统、元数据解析或扫描逻辑。
- 数据主路径保持 `Repository -> Service -> Typed IPC -> UI`。
- preload 必须使用 context bridge；不要开启 renderer 的 Node integration。
- 主窗口与桌面歌词窗口必须保持 sandbox；preload 保持自包含 CommonJS 输出和最小暴露面。
- 所有 renderer 窗口必须复用导航、权限、新窗口和 webview 拒绝策略。
- 跨进程数据必须有 shared 类型，不能用未声明的字符串 channel 或 `any` 漂移。
- SQL 留在 repositories/schema；业务规则留在 services/features；handler 只做适配和组装。
- 长时间扫描和元数据解析不能阻塞 Electron 主线程。
- 所有数据库写入要保持事务边界，并继续启用 foreign keys。
- 数据库迁移只能前进；删除表/列或重建 view 前必须考虑现有用户数据。
- 本地文件路径、协议 key 和可播放扩展名必须在主进程校验。
- 封面缓存 key 必须保持内容寻址，避免把任意文件路径暴露给 renderer。
- Vue 组件继续使用 Vue 3 Composition API 与 `<script setup lang="ts">`。
- 播放视觉状态必须派生自共享 `usePlayback`，不能建立第二套播放器状态源。
- 封面取色、流体渲染等重计算不得进入 Vue 同步渲染或无节流的事件回调。
- 动效必须支持 reduced-motion，并在组件卸载时清理 worker、RAF、timer 和全局监听。
- 不随意升级 Electron 或 `better-sqlite3`；升级后二者 ABI 必须重新验证。
- 不提交 `data/`、缓存、构建产物、数据库、日志或用户媒体文件。

## 12. 已知历史包袱与危险区域

- `docs/` 中仍可能存在落后于实现的历史演示或阶段性设计文档；功能状态以当前源码、路由和测试
  为准。
- `.gitignore` 默认忽略 `docs/`，仅放行本文、2026-07-17 修复记录和手稿皮肤验收资料；新增
  正式文档需明确决定是否跟踪。
- 主窗和桌面歌词窗已启用 sandbox、context isolation、`webSecurity` 与统一导航/权限策略；安全
  边界仍依赖 preload、typed IPC 和自定义媒体协议的输入校验，新增能力时必须同步扩展相应测试，
  不能假设 renderer 内容可信。
- 主窗口使用操作系统原生边框和标题栏（`frame: true`、`transparent: false`）；不要根据历史
  无框窗口设计文档重新引入 Renderer 自绘窗口控件或主壳拖拽区。桌面歌词仍是独立无框透明
  窗口。启动仍依赖 renderer ready 与 fallback，需验证白屏、崩溃和加载失败路径。
- 全局流体背景、播放器玻璃层、歌词磨砂层和页面局部样式共同叠加；改动 z-index、
  backdrop-filter、透明度或网格尺寸时，必须同时检查明暗主题、GPU 占用和低动态模式。
- Renderer 的业务错误已接入本地结构化诊断；新增诊断必须继续经过字段限制与脱敏，不能直接
  输出媒体路径、任意 URL 或大对象，也不能借此引入遥测上传。
- `src/main/ipc/registerIpcHandlers.ts` 同时负责依赖组装和大量 handler，体积与耦合较高。
- `src/main/database/schema.ts` 是长期顺序迁移文件且多次重建同一 view；不能改写早期 migration。
- 数据库是同步 `better-sqlite3`；大查询或大事务放在主线程会造成界面卡顿。
- 文件监听包含去抖、稳定性重试、暂时错误、缺失确认和移动匹配；
  网络盘、批量重命名和编辑器原子写入很容易触发竞态。
- 移动匹配依赖时间窗口和元数据/文件特征，存在误匹配与漏匹配风险。
- 扫描递归与媒体解析面对超大曲库、权限/网络路径及不可信封面、歌词、标签时需谨慎验证。
- 元数据编辑会写回用户音频文件，属于不可轻易撤销的操作，必须防止部分写入。
- 开发环境数据路径经历过迁移，`copyLegacyDevDatabaseIfNeeded` 是兼容逻辑；
  删除前必须确认旧 `data/auralis.sqlite` 用户已完成迁移。
- `track_artists` 等预留规范化结构的写入与读取并不完全对称。
- 自动化测试已覆盖 Node 普通逻辑、部分 Electron ABI 原生链路和 Library 视觉作用域，但文件
  系统竞态、IPC 合约完整性、无缝播放故障恢复和超大曲库性能仍需继续补强；不能只凭现有绿灯
  推断这些路径均已覆盖。
