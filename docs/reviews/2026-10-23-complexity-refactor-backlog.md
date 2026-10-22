# 高复杂度单文件重构待办：P2–P3

更新日期：2026-10-23。当前代码基准：`bb495b40e4475e1762a4c82feb81a2df34dd2fcd`。

## 状态与来源

P1 六项已全部完成（按用户确认）：`bufferedTagPlayback.ts`、`playbackController.ts`、`App.vue`、`cdStageController.ts`、`nativeNextTrackScheduler.ts`、`metadataWatchService.ts`。

以下承接本聊天 2026-10-22 的高复杂度单文件审计，保留原排序：P2 共 11 项，P3 共 4 组、涉及 5 个文件，均作为后续待办。本次仅归档，不重新审计或实施重构。

优先级表示重构处理次序，不是已确认的故障等级。原排序综合考虑错误后果、职责耦合、异步状态、分支集中程度和拆分收益。

表中行数与复杂度均为**原审计快照**，来自 `4b3efe52` 加当时工作区修改，不代表当前代码重新测量结果。行数包含空行和注释；Vue 括号内为脚本行数。分支与最大 C 来自 AST 估算，计入条件、循环、异常处理及逻辑运算，嵌套函数独立计算；不代表运行性能或缺陷数量。开始某项任务前应重新核对源码与测试，尤其是已受 P1 拆分或同期改动影响的文件。

## P2：按原综合排序推进

| 原排名 | 文件                                                                                                       | 原总行数（脚本） | 原分支 / 最大 C | 主要问题与建议切入点                                                                                                                                       |
| -----: | ---------------------------------------------------------------------------------------------------------- | ---------------: | --------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
|      7 | [LyricsEditPanel.vue](../../src/renderer/features/lyrics/components/LyricsEditPanel.vue)                   |       971（570） |        170 / 29 | LRC/TTML 编辑会话、保存、重开基线、历史、焦点和关闭确认集中。优先抽离编辑会话生命周期，保留未保存内容的关闭确认及保存后的基线更新。                        |
|      8 | [AlbumsPage.vue](../../src/renderer/features/albums/pages/AlbumsPage.vue)                                  |   1,324（1,087） |        231 / 25 | 虚拟网格、搜索、菜单、封面预取、播放操作及跨组件布局过渡集中。先分离布局过渡参与者，再整理搜索与菜单会话；与已拆分的 App 布局控制器保持契约一致。          |
|      9 | [AppSidebar.vue](../../src/renderer/app/layout/AppSidebar.vue)                                             |   1,937（1,127） |        156 / 15 | 导航、歌单操作、多个菜单、日期范围选择、重命名与删除集中，另有 666 行模板。优先拆出歌单操作区和最近添加范围选择器。                                        |
|     10 | [LibraryPage.vue](../../src/renderer/features/library/pages/LibraryPage.vue)                               |     1,218（941） |        146 / 17 | 已有 composable 分层，页面仍集中管理路由恢复、视口、焦点、键盘、列调整和菜单。优先整理焦点与导航恢复协议，避免继续增加页面级状态。                         |
|     11 | [CdAlbumsPage.vue](../../src/renderer/features/albums/pages/CdAlbumsPage.vue)                              |     2,184（821） |        178 / 25 | 其中 1,048 行是样式；行为热点在加载、聚焦浏览、播放同步与信息区过渡。先拆行为，再判断样式迁移收益，并复用已拆分的舞台控制模块。                            |
|     12 | [nativePlaybackService.ts](../../src/main/features/audio/nativePlaybackService.ts)                         |              478 |        123 / 30 | 已拆出 session、scheduler 和 tag playback，剩余热点是事件分派与 `fileLoaded`。定向整理状态转换，保留租约、取消和迟到事件边界，不重新合并成更大的播放抽象。 |
|     13 | [useLibraryMetadataEditor.ts](../../src/renderer/features/library/composables/useLibraryMetadataEditor.ts) |              350 |         79 / 39 | `save` 原为 120 行，混合写入结果、已提交记录、刷新重试、提示与焦点恢复。区分“文件已提交”和“界面刷新完成”，避免因刷新失败重复写入。                         |
|     14 | [useLibraryCatalogLoader.ts](../../src/renderer/features/library/composables/useLibraryCatalogLoader.ts)   |              458 |         87 / 32 | 加载模式、快照有效性、路由范围与视口恢复耦合。分离快照提交和展示恢复，保留请求失效检查及完整有序曲库语义。                                                 |
|     15 | [playbackTransitionPlanner.ts](../../src/renderer/features/playback/core/playbackTransitionPlanner.ts)     |              328 |         55 / 43 | `resolvePlaybackAdvance` 原为 202 行，集中实现多种播放模式。职责边界已较清楚，可按模式提取决策函数，保持队列边界与推进结果。                               |
|     16 | [wholeLineLyricsViewport.ts](../../src/renderer/features/lyrics/composables/wholeLineLyricsViewport.ts)    |              456 |         85 / 39 | `update` 原为 264 行，混合 DOM 测量、缓存、歌词定位与动效更新。分离测量结果、布局计算和渲染应用，保留滚动及中断行为。                                      |
|     17 | [useLibraryViewport.ts](../../src/renderer/features/library/composables/useLibraryViewport.ts)             |              610 |        108 / 26 | 多种视图的导航恢复、滚动锚点与行高变化处理集中。按视图策略分解，保留统一的捕获、恢复入口和失效判断。                                                       |

## P3：渐进处理

下列顺序沿用原审计的列示次序，没有新增精确排名。

| 组别 | 文件与原指标                                                                                                                                                                     | 判断与建议                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| P3-1 | [main.css](../../src/renderer/app/styles/main.css)：3,490 行                                                                                                                     | 全局样式覆盖 token、壳层、播放栏、侧栏、曲库和菜单。按所属区域渐进拆分，保持加载顺序、选择器优先级及跨页面效果；不能用函数复杂度衡量。 |
| P3-2 | [lrcConversion.ts](../../src/main/features/lyrics/lrcConversion.ts)：180 行，最大 C=48；[ttmlConversion.ts](../../src/main/features/lyrics/ttmlConversion.ts)：306 行，最大 C=35 | 短文件中的复杂函数，格式规则本身贡献大量分支。先在文件内拆解解析阶段，保持格式兼容和转换结果，未必需要增加模块数量。                   |
| P3-3 | [FullscreenPlayerOverlay.vue](../../src/renderer/app/layout/FullscreenPlayerOverlay.vue)：1,494 行，脚本 520 行、样式 683 行，最大 C=7                                           | 已抽离背景等职责，综合优先级低于 App。先核对同期背景与布局改动，再决定剩余拆分边界，不单纯为缩短文件搬迁样式。                         |
| P3-4 | [registerIpcHandlers.ts](../../src/main/ipc/registerIpcHandlers.ts)：623 行、57 个 import，最大 C=10                                                                             | 装配依赖广，可整理服务装配与生命周期；集中注册本身有合理性。保持服务创建、注册和关闭顺序，不改变 IPC 契约及信任边界。                  |

## 执行与验收约束

1. 一次处理一个明确的状态或职责边界，以施工时工作区为基线，保留其他会话修改；不要按历史行号直接施工。
2. 默认保守拆分，保持公开接口、DOM、样式、动画参数、异步时序与可观察行为。新发现的行为缺陷应单独记录，明确与重构的关系。
3. 先核对已有测试，再按风险补充可控异步或组合行为测试。保留真实目标逻辑，不以替换核心逻辑、删除有效断言或跳过测试获得通过。
4. 界面与布局任务检查真实组件渲染、焦点及中断路径；播放和文件写回事务检查提交、取消、迟到回调和资源所有权；解析器检查格式样本与往返结果；曲库加载检查快照、竞态和视口恢复。
5. 涉及原生数据库或文件监听时，使用匹配 Electron ABI 的环境、内存数据库与临时音频，保护真实曲库。实际验证范围按[风险与验收](../rules/validation.md)及[环境与操作](../rules/environment.md)选择。
6. 高风险项按规则进行独立只读验收。记录实际执行、失败、跳过和限制，不将模拟或静态检查描述为完整应用验收。

完成一项后在本文件更新状态、对应提交与验证摘要。待办记录本身不构成批量施工授权；下一项建议从原排名 7 的 `LyricsEditPanel.vue` 开始。
