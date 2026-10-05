# Mac 声迹预览：前端分阶段施工文档

> 历史方案说明（2026-10-06）：当前声迹已使用新的设备与唱片实现；本文涉及的旧舞台、封面量化和装载托盘代码已移除。下文保留原方案，删除边界及验证见[清理记录](../../reviews/2026-10-06-confirmed-redundancy-cleanup.md)。

日期：2026-10-01。状态：方案完成，前端施工待执行。

需求入口：在当前声迹页增加临时入口，进入独立 Mac 声迹页面。先完成真实每日专辑统计与舞台联动，再接入拖放播放。当前声迹页继续使用原路由和原实现。

后端契约与口径见[后端施工方案](TECHDOC-mac-archive-backend-integration.md)。该后端已通过审查：37 项单元测试、6 项 Electron 原生数据库测试、补充身份/IPC 检查、类型检查与目标 ESLint 通过。

## 1. 第一版完成后的行为

1. 当前 `/archive` 页头出现“Mac 声迹预览”按钮。
2. 点击进入 `/archive/mac`，路由名称 `archive-mac`。显示星空、左侧 1984 Mac、右侧实体舞台。
3. 页面仅提供返回导航；操作系统窗口按钮沿用播放器现有实现。侧栏、播放栏、右侧歌词面板和播放器动态封面背景隐藏，音乐继续播放。
4. Mac 初始姿态为现有 Demo 的俯视三分之四角度，闲置一分钟完整旋转一圈。左键长按拖动旋转，双击或键盘进入屏幕。
5. CRT 桌面有单曲、专辑、年度总结三个入口。单曲和年度总结选中时显示“尚未开放”；专辑进入经典 Mac 统计窗口。
6. 专辑统计默认今天，支持历史年份与具体日期；屏幕最多五行文字，舞台展示对应最多五张封面。
7. 屏幕选择和舞台选择双向同步。返回整机仍保留专辑统计页、日期和选择；线缆始终连接接口。
8. 长按封面拖向槽口，托盘弹出；装入成功后查询完整专辑，从第一首可用曲目播放。失败或取消时显示实际结果。
9. 退出页面释放其动画、Worker、计时器、观察器、监听和封面缓存。全局播放控制器继续工作。

## 2. 范围与实现结构

### 2.1 施工文件范围

| 位置 | 操作 |
| --- | --- |
| `src/renderer/features/archive/pages/ArchiveCanvasPage.vue` | 增加临时入口与入口样式 |
| `src/renderer/features/archive/pages/ArchiveMacPage.vue` | 新独立页面、挂载、返回与 IPC 事件订阅 |
| `src/renderer/features/archive/mac/` | 新页面 markup、样式、Mac/星空/舞台/托盘/封面模块 |
| `src/renderer/features/archive/composables/useArchiveMacData.ts` | 新日期、查询和选择状态 |
| `src/renderer/features/archive/composables/useArchiveMacPlayback.ts` | 新装入操作与现有播放控制器的适配 |
| `src/renderer/app/router/index.ts` | 新路由 |
| `src/renderer/app/router/routeComponentLoaders.ts` | 新懒加载入口 |
| `src/renderer/App.vue` | 将新路由纳入既有独立声迹布局 |
| `src/renderer/assets/fonts/archive-mac/` | 单份派生字体与许可证 |
| `scripts/subset-archive-mac-font.py` | 可重现的字体子集脚本 |
| `package.json`、`package-lock.json` | 正式引入 Demo 已使用的 `image-q@4.0.0` |
| 对应定向测试、阶段交付记录 | 验证行为与保存证据 |

保持原 `ArchiveCanvasPage` 数据流和 `archive/canvas/` 视觉模块、旧唱片架和年度票据资产。新页面调用已验收的后端，不修改主进程、Preload、shared 契约、数据库或音频引擎。后端异常先报告位置和复现，不由前端施工自行改变接口。

### 2.2 固定的新模块划分

在 `src/renderer/features/archive/mac/` 创建：

```text
archiveMac.html                 # 静态画布与 Mac 外壳 markup
archiveMac.css                  # 页面、Mac 外壳、布局与局部 tokens
archiveMacFonts.css             # 专用 @font-face
macAlbumWindow.css              # 经典 Mac 窗口、列表、日期弹层
mountArchiveMacView.ts          # 组合模块，更新模型和发出操作意图
macDevice.ts                    # 旋转、视角、CRT、桌面入口、机器时间
nightSky.ts                    # 星空与页面尺寸/可见性响应
macStage.ts                    # 现有实体舞台绘制，真实数据输入
loadTray.ts                    # 托盘几何、命中和装入动画
loadTray.css                   # 托盘样式
coverPipeline.ts               # 图片加载、Worker 任务与有界缓存
coverQuantize.worker.ts        # image-q 32 色处理
macViewTypes.ts                # 页面内部模型与动作类型
```

允许按内部职责补充小型工具文件；以上边界保持明确。页面/composable 调 IPC 与播放 API，视觉模块只接收数据与动作回调。

### 2.3 Demo 的复用来源

| 来源 | 接入方式 |
| --- | --- |
| `demo/archive/mac-stage-device.html` | 提取最终 Mac 外壳和实体舞台布局；样式分离 |
| `demo/archive/mac-stage-classic.js` | 提取已生成控制器，改成显式 root、options 和 dispose |
| `demo/archive/mac-stage-device.js` | 复用联动、线缆和拖放行为；替换模拟数据与演示播放 |
| `demo/archive/mac-stage-device-renderer.js` | 复用当前哑光实体舞台，而非像素舞台版本 |
| `demo/archive/mac-album-window.css` | 保留黑白横纹、关闭框、反白列表和自定义日期菜单语法 |
| `demo/archive/mac-stage-tray.js/.css` | 复用托盘动画和几何；补齐主动取消与卸载 |
| `demo/archive/night-well-background.js` | 复用星空绘制，去掉自动执行和全局挂载 |
| `demo/archive/cover-lofi-worker.js` | 复用 WuQuant、32 色和 Floyd–Steinberg 处理流程 |
| `src/renderer/features/archive/canvas/archiveHologram.js` | 继续复用舞台全息动效 |

生产页面由 Electron Vite 构建。使用源码模块，移除 Demo 的自动执行脚本、内联 script、模拟封面、构建期 `WORKER_SOURCE` 和全局调试入口。不要将完整 HTML 或 bundle 塞入 iframe，也不要在生产构建中执行 Demo 的字符串替换生成器。

## 3. Phase 0：建立施工基线

### Task 0.1：读规则、确认当前代码

读取 AGENTS.md、施工者规则、Renderer 规则、IPC 规则和风险与验收规则。执行 `git status --short`，记录与目标相交的已有修改。保持其他音频和元数据任务的修改。

检查以下现状：

- `/archive` 当前加载 `ArchiveCanvasPage.vue`，不是旧 `ArchivePage.vue`。
- `App.vue` 使用 `isArchiveCanvas/isStandaloneCanvas` 隐藏播放界面组件，播放控制器仍存在。
- `usePlayback()` 为全局控制器入口。
- `getDailyAlbumStats(date)` 已由 `@renderer/shared/ipc/client` 的 `auralis` 暴露。
- 应用最小窗口为 900×620，本阶段验证桌面窗口，延续原型在较窄视口的合理布局。

### Task 0.2：保存现有视觉基准

打开最新 `mac-stage-device.html`，分别记录整机、CRT 桌面、专辑统计和日期下拉画面。复核最近已修复行为：视角切换保留专辑统计，线缆在视角动画期间逐帧跟随。

截图与运行记录写入 `.electron-home/archive-mac-preview/`，施工交付报告引用其绝对路径。Demo 作为对照保留，新页面源码独立维护。

完成条件：已列清源文件、当前工作区冲突点、视觉基准和正式依赖来源。继续 Phase 1。

## 4. Phase 1：入口、路由与字体资源

### Task 1.1：增加临时入口

在 `ArchiveCanvasPage.vue` 页头，名称之后、年份控件之前增加“Mac 声迹预览”按钮，`router.push({name: 'archive-mac'})`。按钮沿用当前声迹页头的语义字体与按钮样式，设置 `-webkit-app-region: no-drag`。

900×620 下页头允许调整局部间距，入口、返回和年份控件都可见。原页的数据订阅、热力图和舞台保持原行为。

### Task 1.2：懒加载新路由

1. `router/index.ts` 增加 `/archive/mac`、名称 `archive-mac`、component `routeLoaders.archiveMac`。
2. `routeComponentLoaders.ts` 在 `rawRouteLoaders` 增加 `archiveMac: () => import('@renderer/features/archive/pages/ArchiveMacPage.vue')`。
3. 在 registry 的 `routeLoaders` 增加对应 `getOrLoad('archiveMac', loaders.archiveMac)`。
4. 参照 CD 页面，将该入口保持为按需加载；`PRIMARY_WARMABLE_ROUTES` 和 `WarmableRouteName` 继续沿用现有四个主入口。
5. 为新入口补充并发加载去重测试，原主路由预热断言继续保留。

### Task 1.3：独立页面布局与返回

扩展 `App.vue` 的 `isArchiveCanvas`：匹配 `archive` 或 `archive-mac`。复用既有独立画布类和窗口控制按钮，保留其他路由逻辑。

新页面提供一个返回按钮：若 router history 的 back 是内部路径且不是当前 `/archive/mac`，使用 `router.back()`；直接访问、无历史或回指自身时，`router.replace({name: 'archive'})`。

屏幕放大是页面内部状态，不调用浏览器 Fullscreen API、不改 BrowserWindow 尺寸。实际画布可用区域避让播放器已有窗口控制与顶部拖动区域；所有控件设置 no-drag。

### Task 1.4：正式接入 Fusion Pixel，并守住字体预算

中文与英文使用一套专用 Fusion Pixel 12px 等宽字体。已检查原 `zh_hans` 文件包含 ASCII；只引入该版本的派生子集，省去重复 Latin 字体。

源文件：

```text
demo/archive/assets/fusion-pixel/
  fusion-pixel-font-12px-monospaced-otf.woff2-v2026.09.25/
    fusion-pixel-12px-monospaced-zh_hans.otf.woff2
```

该原文件为 666,240 字节，包含 36,980 个码位。现有字体构建预算接近 110 MiB 上限，直接额外打包完整字体需要检查预算余量。

执行步骤：

1. 新建 `scripts/subset-archive-mac-font.py`，参考已有 `subset-archive-cjk-font.py` 的 fontTools 工作流，输入上述原字体，输出 `src/renderer/assets/fonts/archive-mac/AuralisMacPixel.woff2`。
2. 固定子集范围为 `U+0000-024F,U+2000-206F,U+3000-303F,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF`，保留原字体实际具备的字符。源字体不具备的生僻字通过系统后备字体显示。
3. 派生字体 family/PostScript 名分别使用 `Auralis Mac Pixel`、`AuralisMacPixel`。更新相应 name 记录，保留版权与授权记录，复制原目录 `OFL.txt` 和 `LICENSES/` 到目标字体目录，并记录派生过程。
4. 子集只输出一份 WOFF2，生产资源不导入整个下载目录。
5. `archiveMacFonts.css` 定义专属 `@font-face`，只在新路由模块导入。定义局部变量 `--mac-font: 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif`。旧声迹语义字体与全局字体保持原值。
6. 页面挂载时等待 `document.fonts.load('12px "Auralis Mac Pixel"', '专辑统计 Album 0123')`，完成后重绘 CRT 和舞台文字。加载失败使用后备字体，并在诊断中记录；视觉初始化需允许页面退出取消。
7. 构建后执行预算检查。预算超限时报告实际增量与来源，调整本次派生字体或重复打包问题，不提高现有预算或删除其他页面字体。

字体应用：桌面入口标签、菜单栏、日期控件、统计文字和 CRT 时间都使用这套字体；图标的现有像素图形保留。Mac 壳体、星空和舞台材质保留当前风格。

实体舞台读取的 `--archive-font-display/--archive-font-data/--archive-font-ui` 在新宿主局部映射到 `--mac-font`，颜色变量在该宿主定义或继承当前实体舞台需要的值。舞台初始化与字体就绪重绘都读取本页面的值，避免沿用旧声迹字体。像素字体只注册正常字重，文字通过尺寸、反白和布局建立层级，避免浏览器合成粗体破坏像素形状。

完成条件：新路由可进入和返回，旧页正常，字体离线加载、既有播放持续。Phase 1 可使用简单挂载占位，但进入 Phase 2 后替换为实际资产。

## 5. Phase 2：迁移视觉与交互模块

### Task 2.1：沿用现有 Shadow DOM 组织方式

参照当前 `ArchiveCanvasPage.vue`，在新页面宿主上 `attachShadow({mode: 'open'})`，加载打包的静态 markup 与局部样式。

`@font-face` 从路由 CSS 注册；普通页面样式放 ShadowRoot 内。`archiveMac.css` 把原 `html/body/main` 等选择器改为局部容器，避免操作应用 body。

实现：

```typescript
mountArchiveMacView(root: ShadowRoot, actions: MacViewActions): {
  update(model: MacViewModel): void
  dispose(): void
}
```

页面只负责生命周期、数据绑定、动作转发。所有 lookup 在 root 内进行；子模块接受元素或 root，不使用 `document.getElementById()` 查页面元素。

建议 `MacViewModel` 包含：`selectedDate`、`years`、`calendarDays`、`calendarLoading/calendarError`、`dayLoading/dayError`、`items`、`selectedAlbumKey`、装入状态和真实播放状态。类型直接引用 `DailyAlbumStatsItem` 与既有 `CalendarDay`。

动作明确为日期/年份选择、专辑选择、重试、装入请求。Mac 整机与屏幕视角、桌面与专辑页、日期菜单开关是视觉模块局部状态，数据刷新不重置它们。

### Task 2.2：迁移 Mac 控制器

将 `mountClassicMac()` 改成 `mountMacDevice(root, options)`，返回 `setMode()`、`setBusy()`、`setDesktopPage()`、`onGeometry()` 所需能力及 `dispose()`。具体函数内部可复用原实现。

按顺序落实：

1. 保留初始 yaw -32°、pitch -16°，完整一圈/分钟的自转、拖动暂停和拖动后恢复。
2. 排除按钮、列表、日期菜单、槽口区域触发整机拖动/双击。
3. 用页面宿主尺寸计算整机和屏幕布局，替代全局 innerWidth/innerHeight。
4. 原 `body.mac-screen-mode` 改为 ShadowRoot 内画布容器的 `.is-screen-focused`，在该容器内占满可用区域。放大时隐藏舞台与线缆，返回时恢复。
5. 完成视角动画、CRT 去噪、开机按钮、返回整机和三个桌面入口。
6. 返回整机只切换视角，不清空专辑页；窗口关闭按钮才返回三个图标。
7. 机器时间按本地 `HH:mm` 显示，分钟边界重采样；窗口恢复可见时立即更新时间。
8. 旋转、拖动和视角动画都通知线缆布局。旋转先提交 transform，再读取接口坐标；视角过渡期间逐帧更新线缆，结束时再更新一次。
9. 废除 document 上的 `mac-*` 跨模块事件，改为实例回调或实例 EventTarget。模块之间的状态不向全应用广播。
10. 所有键盘操作限定新页面/活动画布，处于菜单或输入控件时不抢快捷键。Esc 先关闭日期菜单，再取消装入，再退出屏幕视角；整机无待处理交互时不自动退出路由。

### Task 2.3：统一 CRT 的逻辑坐标与文字尺寸

复用现有 CRT 的 512×342 逻辑画布。桌面绘制文字改用已加载的 Fusion Pixel，保留原图标绘制和黑白点阵背景。

DOM 统计控件使用同一 512×342 逻辑平面：在 glass 内建立逻辑 UI 容器，width/height 为 512/342，transform-origin 为左上角，按 glass 的实际宽高缩放到玻璃区域。更新尺寸时统一处理 Canvas 与 DOM。避免把 12px 字体直接塞进小尺寸物理玻璃区域造成五行溢出。

具体布局：

- 菜单栏占逻辑平面顶部 20px，时钟仍在右上。
- 专辑窗口起点约 x=12、y=32，宽488、高约296；黑白横纹标题栏与左上关闭框。
- 窗口依次为标题、日期工具栏、列标题、五行列表、底部信息条。
- 基础字体12px，行高至少16px；五行均完整可见。
- 列宽按排名、可伸缩专辑名、次数分配；数值右对齐。
- 标题过长截断，提供完整可访问名称/悬停文本；底部显示选中艺术家、次数和分钟数。

整体放大沿用 CSS 3D 与现有去噪。页面操作动画保持平滑，静态封面允许 lo-fi；不对旋转、拖放或相机过渡主动降帧。

### Task 2.4：迁移星空、实体舞台与线缆

1. `nightSky.ts` 从自动执行脚本改成 `mountNightSky(canvas, options)`，基于 canvas 区域映射鼠标位置，返回暂停与 dispose。
2. 缩放过渡期间保留当前暂停星空的优化，完成后恢复。
3. `macStage.ts` 使用实体舞台 renderer，保留当前哑光材质、刻字、环形灯带、全息封面和透视文字。
4. 通过适配对象提供 stage 的 `getElementById/querySelector/host/coverDragging/onSelection/onGeometry`，全部绑定当前 root。继续关闭专辑自动轮播，选择由用户触发。
5. 专辑数量为0时清空实际舞台数据并显示空状态；不足五张只创建实际项和对应选择器。
6. root 中的舞台按钮监听也纳入 dispose，覆盖原 renderer 中直接 addEventListener 的位置。
7. 线缆几何仍基于实际 jack 与 stage 的 DOMRect；由组合视图拥有一个可停止的过渡更新 RAF，避免多个循环竞争写入路径。

### Task 2.5：资源生命周期

每个 mount 返回幂等 `dispose()`。解除 pointer capture，取消 WAAPI、RAF、timeout、ResizeObserver、MediaQuery 监听和全局事件，停止图片回调与 Worker；页面退出还使异步回调失效。

可使用模块专属 AbortController 管理监听；Observer、计时器和动画仍逐一清理。SPA 路由退出调用 dispose，不依赖浏览器 pagehide。页面隐藏暂停自转、星空与持续动画，恢复后按当前状态重绘。减少动态效果时关闭自转、缩短或跳过过渡；所有控件仍可操作。

完成条件：新页面视觉及交互与最新 Demo 一致，卸载不会遗留后台循环。继续 Phase 3。

## 6. Phase 3：真实日期与 Top5，完成第一次验收

### Task 3.1：新增独立数据 composable

`useArchiveMacData.ts` 直接调用 `getDailyAlbumStats()`。不修改旧 `useArchiveCanvasData()`，也不请求旧排行、每日歌曲详情或年度总结。

固定状态：`selectedYear` 默认当前年，`selectedDate` 默认本地今天，`items` 默认空，`selectedAlbumKey` 默认 null。分别持有年度/日请求序号、loading/error 和 disposed 状态。

复用 `useArchiveCalendar(selectedYear, {loadAnnualInsights:false})` 的日历生成与活跃度规则。组合其返回值时明确区分 calendarLoading 与 dayLoading，保持独立请求状态。

初始化并行请求年度日历与今天 Top5。年度日历失败仍允许今天数据展示；重试分别提供明确操作。

### Task 3.2：日期与年份选择

保留黑白自定义弹层，取代 Demo 两个模拟日期。弹层内部用月份日历选择实际日期，支持键盘与鼠标。

1. 触发按钮显示当前日期与简短说明；展开状态反白。
2. 弹层提供年份选择、月份前后切换和七列日期格。可选年份从 firstRecordedYear 到当前年；无记录时仅当前年。
3. 年份菜单使用自定义黑白菜单；月份浏览不发每日数据请求，点击日期格才切换日期。
4. 年份切换后，请求该年热力图。当前年初始选今天；历史年选该年最近有记录日期，全年无记录则选该年1月1日。空白日期均可选择，未来日期禁用。
5. 日历浏览的月份游标与 selectedDate 分开；月切换不清空当前统计页。
6. 日期选择完成后关闭弹层，焦点回触发按钮。点击外部、Esc 或返回整机关闭弹层。
7. 弹层受 CRT 逻辑窗口约束，文字和按钮保持12px逻辑字体。放大时能容纳月份网格；整机视角保持可点击并优先提示双击查看。
8. 前一天/后一天控件按真正日历日增减，而非在两条模拟记录间切换；受年份范围和今天上界限制。

请求时只通过本地年月日格式化，不使用 UTC 截取。

跨年日切换作为显式日期选择处理：先保存目标日期，再同步 selectedYear；年度加载完成后保留这次明确选择，不能被“历史年默认最近记录日”覆盖。只有用户单独切换年份、未指定日期时应用年份默认规则。

### Task 3.3：正确提交数据与选择

手动换日期时：增加请求序号，清空旧列表、选择和舞台，取消待装入动作，显示加载状态。成功且序号仍有效时原样提交0～5项，默认选择第一项。

收到刷新事件时：保留 selectedDate；请求成功后按 key 保留当前专辑，如果不存在则选择第一项。相同日期和相同封面内容避免重新播放全息出现动效。刷新失败时可保留上次成功数据，但显式标注“刷新失败”，不能把它标为当前成功结果。

日查询失败显示“无法读取当天专辑”与重试；空数组显示“当天没有专辑播放记录”，舞台没有虚构封面或演示专辑。数据项的 key 仅作为身份，不拆分；播放使用 albumKey。

用户选择列表项只变更选择与舞台，不启动播放。舞台选择触发同一 `selectAlbum(key)`，避免双向循环与多次 reveal。次数和时长使用后端原值，分钟数沿用 `formatArchiveMinutes()`。

### Task 3.4：接入刷新通知

在页面 mounted 订阅 `auralis.library.onChanged()`，处理：

```text
play-stats-updated、play-stats-reset、metadata-refresh、
track-added、track-missing、track-restored、track-relocated、file-change
```

使用当前 shared 枚举，合并短时间的重复事件为一次刷新。更新会使身份/日期数据失效时取消未提交装入操作。监听卸载解除；请求过期与卸载后都不提交结果。

年度请求返回时，只能更新它所属年份的日历；旧年份请求不得触发旧日期查询覆盖用户最新选择。历史年份范围变化时，必要的回到当前年操作只执行一次。

### Task 3.5：真实封面处理管线

将 `image-q@4.0.0` 加入正式依赖：`npm.cmd install --save-exact image-q@4.0.0`。Worker 从包名导入，不引用 `.electron-home` 或 Demo 中的 node_modules 路径。

Worker 创建方式：

```typescript
new Worker(new URL('./coverQuantize.worker.ts', import.meta.url), {type: 'module'})
```

处理契约：输入 taskId、页面数据 revision、96×96 RGBA transferable buffer；输出相同标识和32色结果 buffer，或明确错误。复用 Demo 的 WuQuant + EuclideanBT709 + Floyd–Steinberg，strength=.65。星空和实体舞台不做像素化。

1. `getArtworkUrl()` 得到封面 URL，Image 在 src 设置之前指定 `crossOrigin='anonymous'`；中心裁成方形96×96。
2. 每次最多处理当前五项；按 artworkCacheKey、尺寸和算法配置缓存结果，页面实例内 LRU 上限24项。
3. 同一缓存键的在途任务去重。切日期后旧任务允许完成进入有界缓存，但不能写入当前舞台。
4. 缺图、404、decode失败、Canvas错误或Worker错误，使用局部生成的占位图；文字统计与选择继续工作。
5. Worker失败后清理在途请求并退化为未降色封面/占位，保留错误诊断；不在主线程同步执行批量量化。
6. 为舞台每项提供处理后的封面。适配 renderer，避免 Worker 已处理后 renderer 又加载原图绕过结果。
7. 页面退出终止Worker、清缓存、撤销ObjectURL并使异步任务失效。生产版不使用base64样例封面或整批导出dataURL缓存。
8. 复制现有 image-q MIT 许可证到该模块的第三方说明位置；保留 Unifont 图标资产及其已有授权说明。

### Phase 3 完成条件

真实今天、历史日期、空日期、1～5张专辑、缺封面和超长标题均可浏览；整机/屏幕切换保留状态，当前播放持续。装入按钮及拖放播放在这一阶段明确禁用或隐藏。

交付第一阶段报告并标记“统计与舞台实现完成，待独立验收”。提交审查后保持该阶段验收目标稳定，等待用户安排进入 Phase 4。

## 7. Phase 4：托盘与真实专辑播放

### Task 4.1：迁移拖放状态机

在独立模块中实现 `idle → pressing → dragging → inserting → querying → submitted`，取消和失败回到 idle。

1. 长按阈值沿用Demo；阈值前移动超过既有阈值取消长按，避免误拖。
2. 仅对当前选中、出现动效结束且可播放的封面发起拖动。
3. 开始时固定 item、date、key 和已处理封面快照，暂停整机自转，长按与装入期间保持busy。
4. 接近槽口时打开托盘，命中高亮；远离恢复。投放采用真实几何命中，不只按封面矩形。
5. 命中后固定装入操作token，托盘完成才进入查询；未命中返回舞台。
6. 取消来源：Esc、失焦、隐藏、resize、切日期、退出页面、开始新操作或必要数据失效。取消停止动画并复位托盘，不提交播放。
7. 保留“装入”按钮作为键盘等价操作。不可播放时禁用，并显示“该专辑当前没有可播放曲目”。

托盘模块需要主动 `cancel()`：其 dispose 必须中止内部WAAPI与计时器，而不只是 ResizeObserver。调用方也持有 AbortController，防止卸载或取消后执行后续流程。

### Task 4.2：复用全局播放控制器

`useArchiveMacPlayback.ts` 调用现有 `usePlayback()` 与 `auralis.playback.getAlbumTracks()`：

```typescript
const result = await auralis.playback.getAlbumTracks(snapshot.albumKey)
if (!isCurrentOperation(token)) return
if (!result?.tracks.length) {
  // 提示无可播放曲目，不改变已有播放队列。
  return
}
await playback.playTrackFromQueue(result.tracks, result.tracks[0].id)
```

使用完整 available 曲目与既有排序，从第一首开始，保留当前 playbackMode。取消token检查位于每个异步边界之后，尤其是曲目查询完成、调用播放控制器之前。

调用播放控制器即完成提交边界；已提交的播放继续由全局控制器管理，退出页面不停止音乐，也不尝试通过页面token撤销全局播放。

查询错误、空曲目响应和装入取消保留原队列。音频实际启动失败按播放器共享状态展示错误，不将 Promise<void> 完成视作播放成功。页内“当前播放”信息由共享 currentTrack/isPlaying/error 推导，删除 Demo 的本地 `playing={...album,track:1}` 模拟状态。

### Task 4.3：真实播放联动验收

在隔离用户目录和合成曲库验证：

- 拖入成功，从可用第一首启动，后续按现有播放器模式推进。
- 第一首missing、另一首available时，从返回列表的第一首启动。
- 全部missing、查询期间专辑被删除、IPC失败时显示结果，保留已有播放队列。
- 查询未完成时Esc取消、切日期或退出页面，旧结果不触发播放。
- 重复快速装入不会提交过期请求；实际播放竞态交给现有控制器。
- 进入预览、屏幕放大、返回整机、返回旧声迹页都不重建或停止全局播放。

完成条件：托盘动画与真实状态匹配，取消与失败路径准确。交付第二阶段报告，进入 Phase 5。

## 8. Phase 5：集成验证与交付

### Task 5.1：有针对性的自动化测试

新增以下有行为价值的测试，沿用项目 Node/Vue 与 Electron 测试结构：

| 测试文件 | 必须覆盖 |
| --- | --- |
| `useArchiveMacData.test.ts` | 默认今天、空日期、年度范围、错误重试、日期/年份过期响应、卸载失效、刷新保留key |
| `useArchiveMacPlayback.test.ts` | 完整专辑第一首、不可播放/空返回、取消后旧结果不提交、新操作替代、沿用播放器模式 |
| `mac/coverPipeline.test.ts` | 在途去重、有界缓存、过期结果、加载/Worker失败和dispose |
| `mac/macDevice.test.ts` 或定向Electron用例 | 视角切换保留专辑页、日期菜单Esc优先、拖动不误触控件、卸载停止循环 |
| 原 `routeComponentLoaders.test.ts` | 新路由懒加载、并发去重、预热入口不变 |

Canvas/3D几何、拖放和字体需实际Electron检查，不能只靠mock断言。播放适配测试可mockIPC和控制器调用；真实播放检查使用隔离合成音乐验证声音/时间状态。

### Task 5.2：窗口、数据和生命周期矩阵

实际Electron检查1180×760、900×620，至少覆盖DPR1及一个缩放倍率：

1. 整机、CRT桌面、统计窗口与展开日期菜单；顶部返回和窗口控制不相互覆盖。
2. 0、1、2、5张专辑；中英文超长标题、缺失元数据、含HTML符号文字；数据均通过安全文本赋值。
3. 字体离线加载，Canvas与DOM文字体系一致，列表五行无裁切。
4. 连续切日期、年份、返回整机；旧数据不覆盖新选择，线缆过渡无脱离。
5. 至少连续进入/退出预览10次；离开后页面动画、Worker与监听解除，不出现残留键盘操作。
6. 视角动画与拖放保持流畅，窗口隐藏暂停页面动态，恢复与reduced-motion仍可操作。
7. 旧声迹页的热力图、舞台、返回和旧字体继续正常。
8. 音乐持续播放，新页面不会创建另一份音频或播放控制器。

记录前后内存趋势和动画帧表现。区分Renderer工作集、GPU进程内存与RAF采样；不把RAF均值当作GPU实际帧率。出现持续增长或重复模块实例先定位资源引用，再交付。

### Task 5.3：正式构建

按阶段运行相关检查，最终执行：

```powershell
npx.cmd vitest run src/renderer/features/archive/composables/useArchiveMacData.test.ts src/renderer/features/archive/composables/useArchiveMacPlayback.test.ts src/renderer/features/archive/mac/coverPipeline.test.ts src/renderer/app/router/routeComponentLoaders.test.ts
npm.cmd run typecheck
npm.cmd run build
```

执行新增/修改前端文件的目标ESLint。build包含现有资源预算检查，记录字体与Renderer JS增量。直接用构建产物、隔离用户目录和合成曲库启动Electron，验证hash路由、字体、Worker与封面协议离线可用。

dev模式成功不能替代file://构建产物的Worker/字体验证。真实用户曲库只读观察不用于破坏性测试；合成库用于missing、删除、错误和统计夹具。

### Task 5.4：交付格式

每个阶段记录到 `docs/topics/archive/REPORT-mac-archive-frontend-phase-N.md`，内容包括：

1. 本阶段完成的可观察行为与修改文件。
2. 实际测试命令和结果，未执行项及原因。
3. 整机、桌面、统计、日期菜单截图的绝对路径，真实测试窗口尺寸和DPR。
4. 资产/依赖增量、字体预算、Worker和监听清理证据。
5. 后端契约的使用情况、剩余问题及下一阶段。

Phase 3交付后等待独立审查；Phase 4～5完成后标记“前端集成实现完成，待独立验收”。审查期间保持目标稳定。当前临时入口与旧声迹页一直保留，正式替换由后续用户决定。

## 9. 给施工 Agent 的分阶段启动指令

### 第一阶段指令

> 读取AGENTS.md、本施工文档和后端契约文档。执行Phase 0～3：临时入口、独立路由、生命周期完整的Mac与实体舞台、Fusion Pixel、真实每日Top5和日期选择。保留当前声迹页面，不接入真实拖放播放。按各Task完成、自测并交付Phase 3报告后停止，等待独立审查。使用最新实体舞台Demo作为视觉基准，生产实现放在本方案规定的前端模块中。

### 第二阶段指令

> 在第一阶段审查通过后，读取最新审查结果与本施工文档，执行Phase 4～5：托盘拖放、专辑完整曲目查询、全局播放控制器接入、取消竞态、正式构建及隔离Electron验证。保留先前已验收的统计和视觉行为。完成后提交阶段报告与证据，等待集成验收。
