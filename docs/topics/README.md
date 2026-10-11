# 主题方案

[返回文档入口](../README.md) · [逐篇完整索引](../CATALOG.md#主题方案)

这里按产品主题收拢独立方案。目录位置仅说明主题，不表示方案已选用、正在实施或已经完成。

| 主题                                               | 内容                                                        |
| -------------------------------------------------- | ----------------------------------------------------------- |
| [albums：专辑](../CATALOG.md#albums专辑)           | 专辑目录、详情页、头部视觉、退出与曲目推送动效              |
| [archive：音乐归档](../CATALOG.md#archive音乐归档) | `/archive` 当前为文字占位页；播放统计仍会记录并保留重置能力 |
| [artwork：封面](../CATALOG.md#artwork封面)         | 封面加载与缓存优化                                          |
| [library：曲库](../CATALOG.md#library曲库)         | 歌曲列表滚动、播放后视口恢复、初次扫描性能优化              |
| [metadata：元数据](../CATALOG.md#metadata元数据)   | 流派分隔及原子复合名称                                      |
| [playback：播放](../CATALOG.md#playback播放界面)   | 播放编排架构、PlayerBar、同窗全屏覆盖层与历史方案           |
| [shell：应用外壳](../CATALOG.md#shell应用外壳)     | 主窗口标题栏、Sidebar、浅色配色预设、品牌与工具区、界面语言 |

多阶段手稿皮肤和曲库页面编排材料见[项目档案](../projects/README.md)；早期同主题资料仍保留在[历史批次](../history/README.md)。

## 已知关系与待核实事项

- [歌曲改名与移动后的路径找回](library/TECHDOC-track-path-relocation-2026-10-04.md)记录唯一匹配时保留歌曲身份及关联数据的处理方案、扫描与监听实现和验证范围。
- [确认删除文件后的曲库清理](library/TECHDOC-deleted-track-cleanup-2026-10-04.md)记录全量扫描后移除曲库与歌单记录、保留收听历史的实现、验证与实际清理；独立复验通过，真实库已移除 24 条缺失记录。
- [当前曲库流派上层统计](metadata/REPORT-genre-upper-classification-2026-10-04.md)列出清理后 4,131 首歌曲、57 个原流派的上层统计与映射草案，原流派保留；分类与界面尚未实施。
- [音乐来源路径优先布局](library/TECHDOC-music-source-path-priority-2026-09-28.md)记录已接入设置页源码的布局；本轮仅核对源码，运行画面验收未确认。
- [歌曲页字重设置](library/TECHDOC-song-font-weight-settings-2026-09-28.md)记录已接入设置页、歌曲列表与封面视图的字重配置；偏好与常量有既有测试，本轮仅核对源码，组件运行画面验收未确认。
- [历史：MiniPlayer 弹层可用性与窗口状态同步修复](playback/TECHDOC-miniplayer-geometry-state-fixes-2026-09-28.md)记录弹层裁切、状态乱序、开关失配和极小工作区越界的修复方案与定向验收；迷你播放器已于 2026-09-28 移除。
- [主界面歌词面板收起与展开](shell/TECHDOC-collapsible-lyrics-panel-2026-09-28.md)记录偏好与主界面布局接入；专辑页当前动画和性能证据见[当前同步过渡说明](../CATALOG.md#albums专辑)。
- [封面视图当前播放曲目的动态音柱](library/TECHDOC-cover-track-playing-indicator-2026-09-28.md)规定音轨号位置的动态与静态状态、基线保持、动画清理和验收范围；方案已确认，待实施。

- [深色主题中性黑与霓虹玫红配色](shell/TECHDOC-dark-theme-midnight-rose-2026-09-27.md)记录已确认的黑灰层级、单强调色及普通 PlayerBar 动态染色边界；正式应用待实施，浅色主题保持现状。
- [更多作品封面内部悬停反馈](albums/TECHDOC-more-albums-cover-hover-2026-09-27.md)规定整张卡片触发、封面内部缩放与压暗、打开提示淡入的交互，以及与现有封面切换动画的衔接；状态为待实施。
- 2026-09-21 审查后的三项性能相关修复方案均待实施，建议按[曲库分页并发](library/TECHDOC-catalog-concurrent-load-2026-09-21.md)、[无缝解码预算](playback/TECHDOC-gapless-memory-budget-2026-09-21.md)、[元数据文件指纹](metadata/TECHDOC-refresh-file-fingerprint-2026-09-21.md)顺序处理。文档分别注明已复现证据和未测量风险，不代表修复已完成。
- AlbumsPage 的 Liquid Aurora、Obsidian Shelf、Recessed Metal 三组草案并存。选用、替代及实现关系待核实；不能按文件顺序判定最新版，也不能把三套叠加成一个实施要求。
- [旧无框窗口壳 TECHDOC](shell/techdoc-auralis-native-window-chrome.md)原文已标注废弃；其替代方向见[系统原生标题栏方案](shell/plan-native-window-chrome.md)。不要按旧壳文档恢复自绘无框主窗口。
- [播放按钮 PRD](playback/PRD-playerbar-matte-depth-2026-08-29.md)与[TECHDOC](playback/TECHDOC-playerbar-matte-depth-2026-08-29.md)已用“纽扣式内凹”取代“浅凸哑光”设计。保留 `matte-depth` 文件名仅为稳定引用，不应据文件名还原旧方向；文档方案不代表已实现。
- [`usePlayback` 播放编排拆分](playback/TECHDOC-use-playback-architecture-split-2026-08-30.md)是保持公开门面和现有播放语义不变的内部架构方案，不授权建立第二套 player store。
- 半成品或中断任务仅记录当时状态；旧播放加载 / 重试方案与[交接记录](../CATALOG.md#交接记录)不是自动继续执行的任务。
- [modern PlayerBar Liquid Glass 视觉保真修复](playback/TECHDOC-playerbar-liquid-glass-visual-fidelity-2026-09-05.md)
  记录当前移植与上游示意图的视觉偏差、待验证根因和分阶段修复门槛；文档不代表修复已经实施或通过视觉验收。
- [PlayerBar 与播放队列浮层材质统一](playback/TECHDOC-playerbar-queue-surface-unification-2026-09-06.md)
  规定两者共享材质语言但保留浮层几何与 elevation，并限定实现范围和视觉验收矩阵。
- [全局浅色配色预设](shell/light-theme-color-presets.md) 以 CD 浏览页为视觉依据，整理浅色 token
  建议值与现有 `--auralis-*` 映射；文档本身不代表已切换主题或已改代码。深色阶段背景见
  [播放器主题配色审计报告](../reviews/播放器主题配色审计报告.md)。

以上仅列出已知关系与歧义，不替每篇文档重判状态。开始实际工作前，先确认用户本次范围，再核对源码与对应方案。
