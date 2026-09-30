# 声迹独立画布：真实听歌记录

本目录存放声迹独立画布的正式页面文件，以用户提供的 `archive-heatmap-refined.html` 为视觉依据。页面通过现有类型化 IPC 读取真实听歌记录。

切换日期载入专辑时，展台播放约 1.5 秒的全息入场：从哑光黑色托槽向上扫描生成，过程中横向拉扯失真，完成后闪烁一次并稳定。正反面与倒影使用同一动态纹理，托槽静止；底部专辑选择沿用旋转，不重播入场。封面最多等待 500 毫秒后使用占位图开始投影；动画结束后才到达的真实封面单独投影入场。减少动态效果时直接显示，切日期与卸载会取消旧动画。

- 入口沿用 `/archive`，页面为独立画布。隐藏主侧栏、歌词栏、底部播放栏；返回上一个应用路由，无历史时返回曲库。窗口控制保留，播放由应用级控制器持续管理。
- 保留三栏构图、深色金属外壳、CRT 扫描线、霓虹热力图和 Canvas 专辑旋转展台。配色固定为 Miami Synth 独占配色；顶部栏、Shadow DOM 与 Canvas 共用 `.archive-canvas-page` 上 `archive-tokens.css` 声明的语义角色。弱化文字为 `#7b8ca5`，热力图 Level 1 为 `#9f40d0`。
- 顶部年份选择默认今年，允许从最早记录年份到今年之间切换。今年默认今天；历史年份默认最后一个有播放记录的日期，无记录年份不自动选择日期。点击过去或今天的日期后，同时加载当天歌曲与专辑，未来日期不可选。
- 热力图直接复用 `useArchiveCalendar`：1/2/4/7 次对应四档非零热度，365/366 个日期，按原有每列七天、从一月一日开始的排列规则显示。专辑复用 `getListeningRanking({range:'day',target:'album',date})`，遵循后端播放次数降序、最近播放时间降序，取前五；歌曲复用每日详情接口，明确标为前十。专辑不足五张不补位，空日期不补其他日期的内容。
- 左侧显示本年播放次数、活跃天数、听歌时长；曲风雷达仅保留网格并标明暂未接入。独立语义字体体系采用方案一（战术机载工规 HUD 风格）：Display 角色为 `Chakra Petch`，Data 角色为 `JetBrains Mono`，UI 角色为 `Rajdhani`。`archive-fonts.css` 注册本地拉丁 WOFF2 和 `Auralis Archive CJK`。中文资源由 Adobe [Source Han Sans SC 可变字体](https://github.com/adobe-fonts/source-han-sans/blob/release/Variable/TTF/SourceHanSansSC-VF.ttf) Version 2.005 裁出基本汉字、标点和兼容字，输出为 `AuralisArchiveCJK-Basic.woff2`，保留 250–900 字重轴；扩展区罕见字由系统字体后备显示。字体目录保留授权文本，Canvas 从 `root.host` 的计算样式读取字体和颜色角色，字体加载完成后按 `albumRevision` 重绘缺封面文字。
- 在 1200px 以下缩小侧面板，在 700px 高度以下压缩雷达与展台最小高度。当前覆盖应用的 900×620 最小窗口，不扩展移动端布局。
- 中文字体可用 `python scripts/subset-archive-cjk-font.py <原版 SourceHanSansSC-VF.ttf> src/renderer/assets/fonts/archive/AuralisArchiveCJK-Basic.woff2` 复现；需要 `fonttools[woff]` 与 Brotli。子集覆盖 U+0000–33FF、U+4E00–9FFF、U+F900–FAFF、U+FE00–FEFF、U+FF00–FFEF，并更换派生字体的内部名称。原版 TTF 不随应用打包。
- `useArchiveCanvasData` 负责查询、年份和日期状态；`archiveCanvasView` 安全写入文字及图片；`archiveStage.js` 负责 Canvas 展台。使用 Shadow DOM 隔离样式与 DOM 查询，封面通过现有 `auralis-artwork` 协议加载，缺失或失败显示占位。脚本由构建器打包，无内联事件、动态脚本执行或新增 IPC；卸载时停止动画帧、计时器、观察器和全局监听。
- 年份和日期请求分别采用序号丢弃过期结果；更换年份即清空旧日期内容。歌曲或专辑请求失败时，各自显示重试状态，保留另一侧成功结果。统计更新时刷新当前年份并保留选中日期；卸载后不应用在途结果。
- 原 `ArchivePage.vue`、`RankingRecordShelf.vue`、`EditorialLinerNotesCard.vue` 及其依赖保留。热力图逻辑已复用；旧唱片架与票据的应用位置后续确定。页面只读取统计，不修改统计口径、不重置用户记录。

既有功能验收：类型检查、22 项数据及相关单元测试、定向 ESLint 与 Electron Vite 构建通过。真实 Electron 使用隔离数据库和测试封面验证今天、历史日期、闰年、空年份、空日期、五张／两张／一张专辑、封面协议加载、键盘导航、返回及元数据文本转义；检查 1180×760 与 900×620 布局。前一阶段已使用隔离合成 WAV 验证页面切换的播放连续性。字体与颜色角色的专项验收以本轮施工记录为准。测试退出时出现既有关闭阶段 `Application is shutting down` IPC 日志，页面运行期间无内容脚本错误。

本轮字体与颜色专项验收：隔离 Electron `file://` 构建确认打包 CJK WOFF2 字体离线加载，CJK 字符覆盖检查通过；合成数据覆盖 1180×760 与 900×620 下的五张专辑、单张专辑、空日期、缺封面、超长中英文标题和快速切日期，三栏与最下方选择器均留在视口内，过期请求未覆盖最新日期。CRT 最暗覆盖计算下，弱化文字对比度最低 4.70:1，Level 1 与 Level 0 为 3.27:1。隔离可视化夹具运行期间未请求 HTTP/HTTPS 资源。正式构建的 Renderer Fonts 为 109.43 MiB / 110 MiB，最大单文件 9.76 MiB / 20 MiB。
