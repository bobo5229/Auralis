# 主题方案

[返回文档入口](../README.md) · [逐篇完整索引](../CATALOG.md#主题方案)

这里按产品主题收拢独立方案。目录位置仅说明主题，不表示方案已选用、正在实施或已经完成。

| 主题                                               | 内容                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [albums：专辑](../CATALOG.md#albums专辑)           | 专辑目录、详情页、唱片室排版、控件样式与页面过渡                      |
| [archive：音乐归档](../CATALOG.md#archive音乐归档) | 归档页面的设计参考；独立材质与交互实验见 [demo](../../demo/README.md) |
| [artwork：封面](../CATALOG.md#artwork封面)         | 封面加载与缓存优化                                                    |
| [library：曲库](../CATALOG.md#library曲库)         | 歌曲列表滚动、播放后视口恢复、初次扫描性能优化                        |
| [metadata：元数据](../CATALOG.md#metadata元数据)   | 多值元数据、流派分类、文件指纹与播放占用下的编辑策略                  |
| [playback：播放](../CATALOG.md#playback播放界面)   | 播放编排架构、PlayerBar、同窗全屏覆盖层与历史方案                     |
| [shell：应用外壳](../CATALOG.md#shell应用外壳)     | 主窗口标题栏、Sidebar、浅色配色预设、品牌与工具区、界面语言           |

多阶段手稿皮肤和曲库页面编排材料见[项目档案](../projects/README.md)；早期同主题资料仍保留在[历史批次](../history/README.md)。

## 方案关系与阅读顺序

下列说明用于理解各篇记录的范围和相互关系，文中的数据与验收结论属于对应记录，不作为实时产品状态。

- [歌曲改名与移动后的路径找回](library/TECHDOC-track-path-relocation-2026-10-04.md)记录唯一匹配时保留歌曲身份及关联数据的处理方案、扫描与监听实现和验证范围。
- [确认删除文件后的曲库清理](library/TECHDOC-deleted-track-cleanup-2026-10-04.md)记录全量扫描后的曲库、歌单与收听历史处理，以及当时的实现和验证证据。
- [曲库流派上层统计](metadata/REPORT-genre-upper-classification-2026-10-04.md)保存 2026-10-04 的样本统计和映射草案，数值不代表实时曲库。
- [元数据体系优化技术方案](metadata/TECHDOC-metadata-system-optimization-2026-10-28.md)承接 2026-10-28 审计，规划文件值、历史覆盖、日期、多值写回与封面来源的统一；附 S1–S5 实施与独立验收记录。
- [元数据编辑面板扩展技术方案](metadata/TECHDOC-metadata-editor-roadmap-2026-10-28.md)承接面板功能审计，规划编辑恢复、编号、专辑批量和内嵌封面等 E1–E6 阶段；待实施。
- [音乐来源路径优先布局](library/TECHDOC-music-source-path-priority-2026-09-28.md)记录来源行布局与当时的源码核对范围。
- [歌曲页字重设置](library/TECHDOC-song-font-weight-settings-2026-09-28.md)记录字重配置在设置页、歌曲列表与封面视图中的设计和证据边界。
- [历史：MiniPlayer 弹层可用性与窗口状态同步修复](playback/TECHDOC-miniplayer-geometry-state-fixes-2026-09-28.md)记录弹层裁切、状态乱序、开关失配和极小工作区越界的修复方案与定向验收；迷你播放器已于 2026-09-28 移除。
- [主界面歌词面板收起与展开](shell/TECHDOC-collapsible-lyrics-panel-2026-09-28.md)记录偏好与主界面布局接入；专辑页当前动画和性能证据见[当前同步过渡说明](../CATALOG.md#albums专辑)。
- [增强型 LRC 首期支持技术方案](playback/TECHDOC-enhanced-lrc-support-2026-10-28.md)记录普通面板与全屏的片段同步、歌词原文编辑保护、复用调研与格式降级规则；L1–L4 完成，包含独立复验及全应用 smoke 的既有阻塞说明。
- [封面视图当前播放曲目的动态音柱](library/TECHDOC-cover-track-playing-indicator-2026-09-28.md)记录音轨号位置的动态与静态状态、基线保持、动画清理和验收范围。

- [深色主题中性黑与霓虹玫红配色](shell/TECHDOC-dark-theme-midnight-rose-2026-09-27.md)记录该轮黑灰层级、强调色与普通 PlayerBar 动态染色的设计边界。
- [更多作品封面内部悬停反馈](albums/TECHDOC-more-albums-cover-hover-2026-09-27.md)记录卡片触发、封面缩放与压暗、提示淡入及封面切换之间的衔接。
- 2026-09-21 审查的三项后续方案分别见[曲库分页并发](library/TECHDOC-catalog-concurrent-load-2026-09-21.md)、[无缝解码预算](playback/TECHDOC-gapless-memory-budget-2026-09-21.md)和[元数据文件指纹](metadata/TECHDOC-refresh-file-fingerprint-2026-09-21.md)。结合原文的复现证据与未测量风险阅读，不从索引推断实施进度。
- AlbumsPage 的 Liquid Aurora、Obsidian Shelf、Recessed Metal 三组草案并存。选用、替代及实现关系待核实；不能按文件顺序判定最新版，也不能把三套叠加成一个实施要求。
- [旧无框窗口壳 TECHDOC](shell/techdoc-auralis-native-window-chrome.md)原文已标注废弃；其替代方向见[系统原生标题栏方案](shell/plan-native-window-chrome.md)。不要按旧壳文档恢复自绘无框主窗口。
- [播放按钮 PRD](playback/PRD-playerbar-matte-depth-2026-08-29.md)与[TECHDOC](playback/TECHDOC-playerbar-matte-depth-2026-08-29.md)已用“纽扣式内凹”取代“浅凸哑光”设计。保留 `matte-depth` 文件名仅为稳定引用，不应据文件名还原旧方向；文档方案不代表已实现。
- [`usePlayback` 播放编排拆分](playback/TECHDOC-use-playback-architecture-split-2026-08-30.md)是保持公开门面和现有播放语义不变的内部架构方案，不授权建立第二套 player store。
- 半成品或中断任务仅记录当时状态；旧播放加载 / 重试方案与[交接记录](../handoffs/README.md)不是自动继续执行的任务。
- [modern PlayerBar Liquid Glass 视觉保真修复](playback/TECHDOC-playerbar-liquid-glass-visual-fidelity-2026-09-05.md)
  记录当前移植与上游示意图的视觉偏差、待验证根因和分阶段修复门槛；文档不代表修复已经实施或通过视觉验收。
- [PlayerBar 与播放队列浮层材质统一](playback/TECHDOC-playerbar-queue-surface-unification-2026-09-06.md)
  规定两者共享材质语言但保留浮层几何与 elevation，并限定实现范围和视觉验收矩阵。
- [全局浅色配色预设](shell/light-theme-color-presets.md) 以 CD 浏览页为视觉依据，整理浅色 token
  建议值与现有 `--auralis-*` 映射；文档本身不代表已切换主题或已改代码。深色阶段背景见
  [播放器主题配色审计报告](../reviews/播放器主题配色审计报告.md)。

以上仅列出已知关系与歧义，不替每篇文档重判状态。开始实际工作前，先确认用户本次范围，再核对源码与对应方案。
