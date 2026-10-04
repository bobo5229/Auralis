# Auralis 自写实现与开源复用审计

审计日期：2026-10-04。范围：音频处理、搜索与文本处理、界面基础设施、颜色算法、文件监听、IPC 校验和通用工具。

本轮最明确的复用候选是繁简转换、通用颜色计算和浮层定位。日志写入与封面聚类值得做性能或效果对照。文件监听和 IPC 校验可以部分复用库，但迁移时需要保留现有业务规则与资源限制。

本文记录源码检查及开源项目官方资料对照的结果。候选方案尚未接入，也未进行替代库性能实测；优先级是后续评估建议，不代表已经决定替换或授权施工。源码位置对应审计当日的工作区，包含已有未提交修改。

## 主要复用候选

| 优先级 | 当前实现与源码 | 可复用方案 | 预期收益与迁移边界 |
| --- | --- | --- | --- |
| 高 | [搜索繁简转换](../../src/renderer/features/library/utils/normalizeSearchText.ts)：约600行字表和替换逻辑，包含581条映射记录 | [opencc-js](https://github.com/nk2028/opencc-js) | 接管字表维护及词组转换。仅替换搜索归一化，保留原始显示文本和现有匹配方式；检查词典包体、索引构建耗时及繁简匹配变化。 |
| 高 | [Oklab 颜色计算](../../src/renderer/features/playback/utils/colorSpace.ts)、[HSL 转换](../../src/renderer/features/albums/utils/cdAccent.ts)、[主题对比度计算](../../src/renderer/features/appearance/utils/resolveDarkAccent.ts) | [Culori](https://culorijs.org/api/) | 统一 RGB、HSL、Oklab、亮度及对比度等通用计算。保留歌词、主题和强调色的选择规则；验证通道范围、取整、色域处理和最终颜色。 |
| 高 | [Tooltip 定位](../../src/renderer/shared/tooltip/tooltipGeometry.ts)与[右键菜单定位](../../src/renderer/features/library/components/LibraryContextMenu.vue)：手工计算边界、翻转和子菜单位置 | [Floating UI](https://floating-ui.com/docs/computeposition) | 复用防溢出、翻转、尺寸处理和锚点跟随。保留现有单例 Tooltip；[自动更新](https://floating-ui.com/docs/autoupdate)仅在浮层打开时启用并及时清理，避免给每个虚拟列表行增加监听。 |
| 中 | [Sidebar 弹窗焦点管理](../../src/renderer/app/utils/sidebarModalFocus.ts)、[播放器浮层焦点管理](../../src/renderer/app/utils/playerOverlayFocus.ts)、[元数据弹窗](../../src/renderer/features/library/components/MetadataEditDialog.vue)：多处手写 Tab 循环 | [focus-trap](https://github.com/focus-trap/focus-trap) | 统一可聚焦元素判断、焦点约束、弹窗叠加及关闭后回焦。保留菜单方向键导航、业务指定的初始焦点和弹窗生命周期。 |
| 中 | [日志写入与轮转](../../src/main/logging/rollingLogStore.ts)：同步追加、重命名和删除；[Pino 接入](../../src/main/logging/logger.ts)使用自建 destination | [Pino transport](https://github.com/pinojs/pino/blob/main/docs/transports.md)与[pino-roll](https://github.com/mcollina/pino-roll) | 有机会减少主进程同步文件操作造成的阻塞。保留脱敏、跨启动日志数量上限和诊断导出；验证 Electron 打包、写入失败处理与退出刷新。这不是已确认的 CD 进入动画卡顿根因。 |
| 中 | [封面颜色聚类](../../src/renderer/features/playback/utils/extractArtworkPalette.ts)：自写中心初始化、迭代和合并 | 已安装的[image-q](https://ibezkrovnyi.github.io/image-quantization/) | 可比较复用调色板量化底层。颜色权重统计、强调色排序和可读性策略仍需适配；先对照封面颜色输出及耗时，再决定是否替换。 |
| 低 | [IPC 参数校验](../../src/main/ipc/ipcPayloadValidation.ts)：约500行，包含自建结构校验工具和各通道策略 | [Valibot](https://valibot.dev/api/strictObject/) | 通用结构校验可由 schema 接管，减少手写工具和类型维护。保留 IPC 来源校验、总大小、节点数量、深度和危险属性限制；不将整个文件视为可直接删除的框架代码。 |
| 低 | [元数据文件监听](../../src/main/features/metadata/metadataWatchService.ts)：原生递归监听加事件整理、延迟确认和重试 | [Chokidar](https://github.com/paulmillr/chokidar) | 可复用事件规范化、原子写入及分块写入处理。保留缺失确认、文件迁移匹配和自身写入忽略规则；大曲库监听资源开销需要实测。扫描阶段的[文件稳定性检查](../../src/main/features/libraryScan/fileStabilityChecker.ts)不能直接随监听层一起删除。 |

封面取色目前通过[48 × 48 采样](../../src/renderer/features/playback/composables/useArtworkPalette.ts)和[Worker](../../src/renderer/features/playback/workers/artworkPalette.worker.ts)执行。项目另有[image-q Worker](../../src/renderer/features/archive/mac/coverQuantize.worker.ts)，因此这个候选可以优先复用现有依赖，但两种算法的颜色结果不保证一致。

## 有现成方案但暂不优先替换的实现

| 当前实现 | 现成方案 | 当前判断 |
| --- | --- | --- |
| [歌单拖拽排序](../../src/renderer/app/utils/useSidebarPlaylistReorder.ts) | [SortableJS](https://github.com/SortableJS/Sortable) | 当前是范围有限的列表排序。需要自动滚动、跨列表拖拽或更丰富的拖动反馈时，再评估接入；持久化和失败恢复仍由项目负责。 |
| [LRC 解析](../../src/renderer/features/lyrics/utils/parseLrc.ts) | [AMLL lyric](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/docs/src/content/docs/en/guides/lyric/quickstart.mdx) | 当前解析器较小，以行级时间戳为主。扩展逐字歌词、TTML 或其他格式时更值得复用；候选包[许可证](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/lyric/package.json)为 AGPL-3.0-only。 |
| [HTTP Range 解析](../../src/main/features/audio/audioProtocol.ts) | [range-parser](https://github.com/jshttp/range-parser) | 当前只处理单个字节区间，解析逻辑较小。复用可以减少协议细节维护，但需要适配无效请求、不可满足区间和多区间返回语义；路径校验和响应流仍需保留。 |
| [按曲库顺序定位的搜索](../../src/renderer/features/library/utils/librarySearchScan.ts) | [MiniSearch](https://github.com/lucaong/minisearch) | 当前是字段前缀匹配与循环定位。引入全文、分词或模糊搜索需要重新定义匹配与排序，并评估大曲库索引内存；暂无直接替换的充分理由。 |

## 建议保留的项目代码

以下实现承担明确的产品规则或适配职责。通用库可以辅助，但不能直接接管这些语义。

- **播放时钟和状态同步**：[nativePlaybackService](../../src/main/features/audio/nativePlaybackService.ts)与频谱播放同步涉及暂停、跳转、切曲和异步任务失效，属于播放器编排。
- **数字零静音裁剪**：[digitalSilence](../../src/main/features/audio/digitalSilence.ts)检测所有声道的精确零值，并限制相邻专辑曲目和裁剪范围；阈值式静音检测会改变其行为。
- **曲库快照和分页**：[libraryCatalogSnapshotStore](../../src/main/features/libraryCatalog/libraryCatalogSnapshotStore.ts)维护快照代际与游标一致性，普通缓存库不能替代这些规则。
- **旧 ID3 原始文本保留**：[parseAudioMetadata](../../src/main/features/metadata/parseAudioMetadata.ts)用于保留 `AC/DC` 等含斜线名称及重复文本帧，配有[针对性测试](../../src/main/features/metadata/parseAudioMetadata.test.ts)。应在上游提供等价能力后再考虑移除适配。
- **智能歌单查询语法**：[queryParser](../../src/shared/smartPlaylists/queryParser.ts)定义项目自己的字段和表达式。语法扩大后可以评估解析器生成工具，当前不优先引入额外框架。
- **小型缓存、串行队列和动效计算**：少量 Map 淘汰逻辑、Promise 串行执行、CD 几何及频谱包络具有较小实现成本或明确产品规则，按实际重复程度和维护负担决定是否抽象。

## 已经复用的核心能力

当前[依赖声明](../../package.json)与源码已复用以下实现，本轮不重复列为新增替换任务。

| 能力 | 当前采用的实现 | 源码依据 |
| --- | --- | --- |
| 音频播放与解码 | mpv、FFmpeg | [mpvClient](../../src/main/features/audio/mpvClient.ts)、[softTransition](../../src/main/features/audio/softTransition.ts) |
| FFT | fft.js | [spectrumAnalysis](../../src/shared/audio/spectrumAnalysis.ts) |
| 元数据读取与标签写入 | music-metadata、FFmpeg | [parseAudioMetadata](../../src/main/features/metadata/parseAudioMetadata.ts)、[audioTagWriteService](../../src/main/features/metadata/audioTagWriteService.ts) |
| 图片处理与颜色量化 | sharp、image-q | [封面缓存](../../src/main/features/artwork/artworkCache.ts)、[量化 Worker](../../src/renderer/features/archive/mac/coverQuantize.worker.ts) |
| 虚拟列表 | TanStack Virtual | [LibraryPage](../../src/renderer/features/library/pages/LibraryPage.vue)、[AlbumsPage](../../src/renderer/features/albums/pages/AlbumsPage.vue) |
| 拼音索引 | pinyin-pro | [cdAlbumIndex](../../src/renderer/features/albums/utils/cdAlbumIndex.ts) |
| 动画与流动背景 | Motion One、浏览器 WAAPI、AMLL、Pixi | [共享动效](../../src/renderer/shared/animation/motion.ts)、[FluidArtworkBackground](../../src/renderer/features/playback/components/FluidArtworkBackground.vue) |

## 建议推进顺序

1. **搜索归一化与通用颜色计算**：分别评估 opencc-js 和 Culori，验证搜索结果、颜色输出、包体和初始化成本，保持产品规则不变。
2. **浮层定位与焦点管理**：统一 Tooltip、菜单和弹窗底层行为；检查窗口边缘、滚动、缩放、键盘操作及卸载清理。
3. **日志与封面聚类对照**：分别测量主进程写入阻塞和取色算法耗时。封面聚类同时做代表性封面的颜色对照，满足效果要求后再选择实现。
4. **文件监听与 IPC 校验**：在有明确维护问题或功能扩展需求时单独规划迁移，验证资源开销、业务规则与既有边界。

每个候选应独立验证和决定，避免一次性更换多个底层库后难以定位行为变化。成熟实现是否更快、占用更少或更稳定，需要以 Auralis 的实际数据和运行环境为准。

## 检查状态

本轮完成源码检查、现有依赖核对和候选项目官方资料对照。未修改播放器实现，未安装候选依赖，未以真实音乐文件进行写入验证，也未运行替代库性能测试。本文提供的是复用评估清单，不是迁移完成报告。
