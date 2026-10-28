# M4A 播放中保存：正式接入与验收

2026-10-13。实现完成、自测通过后交付，**待独立验收**。需求：正在播放及已经预读的下一首 M4A 可以保存元数据，保持播放连续，并正确协调文件访问、刷新元数据和恢复保存失败。

## 实现

- `PlaybackFileCoordinator` 增加文件替换意图：只允许已知 `mpv-current`/`mpv-next` 读取者保留旧文件对象；准备阶段允许频谱占用，发布前必须释放频谱。其他读取者仍阻止保存；新打开请求等待磁盘校验和数据库提交结束。原有独占写入及其他格式的缓冲路径保留。
- `m4aFileReplacement.ts` 接入 `NativePlaybackService.writeMetadata`。不暂停、跳转、重载、清空播放列表或释放 mpv 的读取租约。暂停、自然切曲、用户换歌可以与副本准备并存。
- `NativeNextTrackScheduler` 等待已有文件分析完成，保存期间推迟新的分析，结束后恢复仍有效的最新分析请求；不因保存重建下一首。频谱暂停按路径计数，支持不同文件或同一路径的重叠请求。
- `prepareAudioTagWrite` 继续负责副本写入、可编辑字段校验及封面/私有字段保留；Windows M4A 改用本目录的原生发布 helper。helper 不存在时不提供播放中编辑能力，已经进入保留读取者的保存也不会退回两次改名。
- 发布前在原生句柄上校验精确文件 ID、大小和纳秒修改时间，并禁止新写入；刷新 staging 后，使用 `SetFileInformationByHandle(FileRenameInfoEx)`，启用 `REPLACE_IF_EXISTS | POSIX_SEMANTICS`，一次替换路径。旧句柄继续读旧对象，新打开者读新对象。
- 保存后的数据库写入继续经过 `readStableMetadata`、文件指纹核对和 `commitVerifiedUserEdit`；成功通过现有 `library:changed` 通知。播放控制器只刷新当前曲、队列和已提交切曲计划的标题/艺术家/专辑字段，不调用音频重载或下一首重排。异步旧响应不能覆盖新响应。
- 文件监听在用户保存期间推迟存在性和缺失确认，保存完成后延长原有 watcher 抑制。音频 URL/解码探测也取得读取租约，避免与发布并发。

新增的是主进程内部能力；没有新增 Renderer 文件访问权限、任意命令接口或 IPC 通道。

## 发布与恢复语义

Windows 的 Node `rename(staging, original)` 在目标被 mpv 打开时实际返回 EPERM；之前隔离实验的“两次改名”则有路径暂时不存在的窗口。因此正式接入没有使用这两种方式发布播放中的 M4A。

原生 helper 只接受原文件及其同目录、固定命名的 staging。先打开原文件，要求现有句柄允许删除共享，再验证文件身份；不符合条件、权限不足、staging 刷新失败或底层不支持替换时，发布失败，原路径和原文件内容保持不变。文件发布成功后没有后续可能失败的文件系统步骤。正常结束会清理 staging，并释放写入意图、恢复频谱和分析。

文件发布与 SQLite 无法组成一个跨系统原子事务。如果新文件已发布，但磁盘解析/数据库提交失败，保存返回失败，由既有 generation 检查和 reconciliation 从磁盘恢复数据库；不重载音频。重试成功会取消尚未执行的旧失败刷新，避免旧任务覆盖用户编辑。现有 reconciliation 启动失败仍会记录日志并需要显式重试。

原生 API 保留旧句柄语义的依据见 [Microsoft FILE_RENAME_INFORMATION](https://learn.microsoft.com/zh-cn/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)。本次实际验证为 Windows 11 / NTFS；没有宣称任意文件系统支持、断电持久性或对外部写入程序的无条件兼容。崩溃可能留下未发布 staging；没有自动扫描或删除来源不明的残留文件。

## 构建与分发

```powershell
npm.cmd run build:file-replace
npm.cmd run build
```

需要 VS 2022 C++ Build Tools 和 Windows SDK。`build:file-replace` 通过 vswhere 找 MSBuild，输出静态 CRT 的 `resources/audio/auralis-file-replace.exe`，中间文件在忽略目录 `.electron-home/native-file-replace`。常规 `prebuild` 会构建 helper；现有 `extraResources` 将 audio 目录随应用分发，`verify:artifacts` 也已加入 helper 缺失检查。源码入库，exe 与其他音频运行时一样在本机生成/暂存。

## 自测证据

证据位于 [evidence](evidence)，最终相关源码和运行时指纹见 [state.json](evidence/state.json)。先前隔离报告在 [mpv-m4a-write-probe](../mpv-m4a-write-probe/README.md)，其旧写入器指纹不能作为本次正式发布路径的运行证据。

- [数字矩阵](evidence/digital.json)：真实随附 mpv 与正式写入器，8 组 AAC/ALAC、`moov` 前/后、24 次播放中保存，全长 PCM 逐字节一致；包含 396000 字节标题的增长/缩小及封面/私有字段保留。
- [WASAPI 进程回环](evidence/device.json)：AAC/ALAC 的编辑和未编辑对照均通过，样本对齐位置变化 0 帧，内部 5ms 静音窗 0。仅测试进程树音频，未采集其他应用或麦克风；没有人工听感验收。
- [真实 Electron/SQLite 集成](evidence/native-test.txt)：使用正式 `NativePlaybackService`、协调器、`MetadataRefreshService`、写入器和内存 SQLite。AAC/ALAC 两首队列，确认下一首实际被 mpv 打开后保存当前曲及下一首（下一首重复保存）；整段输出与未编辑队列逐字节一致，数据库/指纹及成功通知一致。额外读取者禁止删除共享时，失败保留原文件、数据库和暂停位置，释放占用后重试成功；精确文件身份不匹配也被拒绝。失败后的刷新任务在这项集成测试中模拟为已有任务占用，自动 reconciliation 另有下述回归覆盖。
- [协调、频谱、Watcher、Renderer 回归](evidence/unit-test.txt)：保留播放租约、新读取等待至数据库提交、预读租约转为当前曲、准备/发布/数据库异常后的资源释放、未知读取者、重叠频谱暂停、保存期间缺失确认、元数据异步顺序及不重建预读。
- [数据库失败恢复回归](evidence/reconciliation-test.txt)：发布后 SQL 提交失败时不发成功通知，接受磁盘刷新结果后恢复并通知；已有刷新任务阻塞期间，重试成功取消延后的旧失败刷新。
- [分析与租约回归](evidence/analysis-test.txt)：等待已有分析、恢复推迟的分析且不重建播放列表，以及自然切曲/取消期间的租约生命周期。生命周期测试补齐真实 transport 绑定，保留原有等待取消 ACK 的断言。
- [相邻播放/编辑回归](evidence/regression-test.txt)：原有其他格式缓冲写入、软过渡、播放命令、曲库监听、元数据编辑器等。真实收藏诊断依赖外部报告的既有用例未启用。
- [构建](evidence/build.txt)：本地 helper 编译、locale 校验、完整前后端类型检查、Electron/Vue 构建及资产预算；定向 ESLint 和 `git diff --check` 通过。Vite 的 chunk size 提示不影响资产预算结果。

主要复现命令：

```powershell
node_modules/.bin/electron.cmd scripts/run-electron-vitest.mjs src/main/features/metadata/m4aPlaybackWrite.native.test.ts
node_modules/.bin/vitest.cmd run src/main/features/audio/m4aFileReplacement.test.ts src/main/features/audio/playbackFileCoordinator.test.ts src/main/features/audio/playbackSpectrumService.test.ts src/main/features/metadata/metadataRefreshService.test.ts src/main/features/metadata/metadataWatchService.boundaries.test.ts src/renderer/features/playback/runtime/playbackController.gapless.test.ts
node_modules/.bin/vitest.cmd run src/main/features/audio/nativePlaybackService.softTransition.test.ts src/main/features/audio/nativePlaybackLeaseLifecycle.test.ts
node scripts/mpv-m4a-write-probe/run.mjs
node scripts/mpv-m4a-write-probe/run.mjs --device
```

全部音乐来自临时目录中的合成文件；SQLite 为内存数据库。没有修改真实收藏、启动真实曲库应用进行验收、操作已有 mpv 进程、提交或发布。

## 独立验收交接

默认只读，先从需求独立推导检查项，再核对实现和证据；不要把上述自测项目当作验收范围上限。重点审查保留旧句柄的能力边界、准备与自然切曲/暂停/跳转/停止/并发保存、分析和频谱恢复、文件身份校验与权限失败、文件已发布但数据库失败的恢复，以及刷新信息不重建预读。对验收目标的修改与复验串行进行。

工作区原有未提交的播放与界面改动已保留；`state.json` 记录最终相关完整文件指纹，不能仅凭 HEAD 判断状态。未运行安装包验收、完整真实界面人工操作、跨设备听感、网络盘/其他文件系统、HE-AAC/DRM、大文件/断电测试。应在隔离收藏中补充代表性的完整应用操作，不能用真实音乐做破坏性验证。
