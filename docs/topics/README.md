# 主题方案

[返回文档入口](../README.md) · [逐篇完整索引](../CATALOG.md#主题方案)

这里按产品主题收拢独立方案。目录位置仅说明主题，不表示方案已选用、正在实施或已经完成。

| 主题                                               | 内容                                                      |
| -------------------------------------------------- | --------------------------------------------------------- |
| [albums：专辑](../CATALOG.md#albums专辑)           | 专辑目录、详情页、头部视觉、退出与曲目推送动效            |
| [archive：音乐归档](../CATALOG.md#archive音乐归档) | 收听排行、年度总结、Music DNA；不是文档历史归档           |
| [artwork：封面](../CATALOG.md#artwork封面)         | 封面加载与缓存优化                                        |
| [library：曲库](../CATALOG.md#library曲库)         | 歌曲列表滚动、播放后视口恢复、初次扫描性能优化            |
| [metadata：元数据](../CATALOG.md#metadata元数据)   | 流派分隔及原子复合名称                                    |
| [playback：播放](../CATALOG.md#playback播放界面)   | 播放编排架构、PlayerBar、全屏背景、桌面歌词与迷你模式同步 |
| [shell：应用外壳](../CATALOG.md#shell应用外壳)     | 主窗口标题栏、Sidebar 品牌与工具区、界面语言              |

多阶段手稿皮肤和曲库页面编排材料见[项目档案](../projects/README.md)；早期同主题资料仍保留在[历史批次](../history/README.md)。

## 已知关系与待核实事项

- AlbumsPage 的 Liquid Aurora、Obsidian Shelf、Recessed Metal 三组草案并存。选用、替代及实现关系待核实；不能按文件顺序判定最新版，也不能把三套叠加成一个实施要求。
- [旧无框窗口壳 TECHDOC](shell/techdoc-auralis-native-window-chrome.md)原文已标注废弃；其替代方向见[系统原生标题栏方案](shell/plan-native-window-chrome.md)。不要按旧壳文档恢复自绘无框主窗口。
- [播放按钮 PRD](playback/PRD-playerbar-matte-depth-2026-08-29.md)与[TECHDOC](playback/TECHDOC-playerbar-matte-depth-2026-08-29.md)已用“纽扣式内凹”取代“浅凸哑光”设计。保留 `matte-depth` 文件名仅为稳定引用，不应据文件名还原旧方向；文档方案不代表已实现。
- [`usePlayback` 播放编排拆分](playback/TECHDOC-use-playback-architecture-split-2026-08-30.md)是保持公开门面和现有播放语义不变的内部架构方案，不授权建立第二套 player store。
- 半成品或中断任务仅记录当时状态；旧播放加载 / 重试方案与[交接记录](../CATALOG.md#交接记录)不是自动继续执行的任务。
- 液态玻璃改造已暂缓，本次不创建实施任务；已有液态视觉文档仅作为原资料保留。

以上仅列出已知关系与歧义，不替每篇文档重判状态。开始实际工作前，先确认用户本次范围，再核对源码与对应方案。
