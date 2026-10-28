# mpv 播放 M4A 时写标签：隔离验证

本文保留第一轮隔离实验的结果和代码状态。后续正式接入及新版发布路径的证据见 [M4A 播放中保存：正式接入与验收](../native-file-replace/README.md)。

2026-10-13：本机 Windows 11 / NTFS 上已验证可行。使用 Auralis 随附 mpv 和现有标签写入器，**让 mpv 保留旧文件对象，另写副本，再发布到原路径**，播放中的 PCM 没有因保存而改变。无需让解码器关闭、重开或重新定位，也无需接入 foobar2000 SDK。

这只是隔离实验：没有修改正式播放服务、文件协调器、数据库或 Renderer，没有解除产品内 M4A 的编辑限制。所有音频均由脚本合成；没有修改真实收藏。结果不等于完整应用验收。

## 机制与真实调用

`probe.ts` 使用真实 `openMpvClient`、`prepareAudioTagWrite`、`parseAudioMetadata`、`verifyPreservedAudioTags`，以及真实 `resources/audio/mpv.exe`、`ffmpeg.exe`。输入为生成的 AAC/ALAC M4A，附带封面、私有标签与未知 atom。实验直接调用写入器，没有经过仍会阻止播放中文件写入的产品协调器。

现有 `prepareAudioTagWrite().commit()` 已会：同目录复制并编辑 staging，校验，原文件改名为 backup，staging 发布为原路径，删除 backup。实验未改写这个 commit。

Windows 下 mpv 持有旧文件句柄，允许改名/删除共享。发布后，同一路径指向新文件对象；正在播放或已经预读的解码器继续读取旧对象，文件中的 `moov`/偏移表因此不会突然改变。文件 ID 变化、原路径不存在时仍能跳转，以及旧文件名删除后仍能跳转和继续播放，共同验证了这一点。

[mpv Windows 文件打开实现](https://github.com/mpv-player/mpv/blob/master/osdep/io.c)中的 `mp_open` 使用 `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`。这是上游源码解释；当前随附二进制的实际行为由本实验确认，不能仅凭上游 master 推断其他二进制。

## 已运行结果

| 场景                   | 对照与结果                                                                                                                                     | 原始报告                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 单曲完整数字输出       | 8 组，每组播放中保存 3 次，共 24 次；全长 PCM 长度及每个字节与原文件单次解码一致；每组只有一次 start-file 和正常 EOF                           | [digital.json](evidence/digital.json)         |
| 实际 WASAPI 输出       | AAC/ALAC 各有未编辑、编辑组；编辑组各保存 3 次；4 组全部对齐偏移变化 0 帧，中间 5ms 静音窗 0；最低窗口相关系数 > 0.9999999                     | [device.json](evidence/device.json)           |
| 暂停、跳转、重复保存   | AAC/ALAC；暂停保存保持暂停与位置；原路径缺失时跳转成功；删除旧文件名后跳转/继续播放成功；重载得到新标签                                        | [controls.json](evidence/controls.json)       |
| 文件共享与失败         | 禁止删除共享的额外读取者使真实 commit 返回 EBUSY，原文件字节不变；自定义实验事务在第一次改名后注入异常，恢复 backup 后字节一致                 | [controls.json](evidence/controls.json)       |
| 下一首已预读及自然切曲 | Win32 独占打开失败确认下一首确实被 mpv 持有；当前曲保存一次、下一首保存两次；AAC/ALAC 两首完整输出分别与未编辑的同队列逐字节一致，正常两次 EOF | [queue.json](evidence/queue.json)             |
| 回环检测器校准         | 健康合成数据通过；插入、删除 10ms 样本与 10ms 静音均被检出                                                                                     | [calibration.json](evidence/calibration.json) |

数字矩阵是 AAC 48kHz 双声道、AAC 44.1kHz 单声道、ALAC 48kHz 双声道、ALAC 96kHz 双声道，各有 `moov` 在前/后两种布局，每组 12 秒。第 2 次保存写入 396000 字节 UTF-8 标题，其他两次为短标题，同时修改其他支持的标签字段；数字输出模式每次检查 `mdat` SHA256 与封面/私有标签保留。

数字输出 AO 默认无时钟，使用 FFmpeg `arealtime` 滤镜节流；单曲关闭 cache 和 demux readahead、stream buffer 设为 4096，避免在写入前已将文件全部读入内存。控制测试还在原路径不存在时执行超出小缓冲范围的跳转。队列测试则显式开启 mpv 自身预读。这些是实际 mpv 读写测试，不是模拟解码器。

WASAPI 使用 Windows **指定进程树回环**，只采集测试 Node 进程及其 mpv 子进程，不使用麦克风。18 秒非周期合成信号每 0.25 秒匹配一个 0.25 秒窗口，搜索范围 ±0.1 秒，并检查内部 5ms 静音窗。记录覆盖播放全程，匹配窗口覆盖 1～16.75 秒；不据此宣称首尾延迟相同或进行过人工试听。回环接口本次 devicePosition 总为 0，未将其作为连续性证据。

两次初始验证的限制也保留：

- 系统全局回环混入其他播放器，第一次检测失败；混合录音已删除。后续改为指定进程树回环并通过，没有保留其他应用音频。[失败报告](evidence/initial-global-loopback-failure.json)
- AAC 两首连播与“逐首独立解码后拼接”存在差异；补跑同配置未编辑队列后，编辑前后输出完全一致。该差异是基线已有现象，实验没有修复 AAC 队列播放问题。[首次队列报告](evidence/initial-queue-failure.json)

## 复现

在仓库根目录运行。依赖当前项目已安装的 Node/esbuild/node-taglib-sharp；Python 需要 NumPy。C++ helper 需要 VS 2022 C++ Build Tools / Windows SDK，且进程回环要求支持该接口的 Windows（本次为 Windows 11）。脚本每次创建唯一 `%TEMP%/auralis-mpv-m4a-*`，产物不会覆盖收藏；生成的音频、报告及事件日志保留在对应目录。编译输出在忽略目录 `.electron-home/mpv-m4a-write-probe`。

```powershell
node scripts/mpv-m4a-write-probe/run.mjs --quick   # 约 12 秒，一组数字输出
node scripts/mpv-m4a-write-probe/run.mjs           # 约 100 秒，8 组矩阵
node scripts/mpv-m4a-write-probe/run.mjs --controls
node scripts/mpv-m4a-write-probe/run.mjs --queue   # 约 80 秒，编辑前后同队列对照

& 'D:\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\amd64\MSBuild.exe' scripts/mpv-m4a-write-probe/capture.vcxproj /p:Configuration=Release /p:Platform=x64 /v:minimal /nologo
node scripts/mpv-m4a-write-probe/run.mjs --device  # 约 80 秒，会播放低音量合成测试声
python scripts/mpv-m4a-write-probe/calibrate-loopback.py
```

`--controls` 的 WASAPI 输出音量为 0；`--device` 音量为 20。其余使用 PCM 文件输出。不得将脚本改为接收真实收藏作为 fixture，也不要复用用户正在运行的 mpv 进程。

## 正式接入的判断

可继续基于此机制设计 Auralis 的 M4A 播放中保存，优先复用现有 staging/校验/发布流程。当前结论是**已知 mpv 读取旧版本可以与新版本发布并存**，不是所有占用都允许忽略。

1. 文件协调器需显式识别可安全保留旧版本的 mpv 读取租约；其他 FFmpeg/频谱/外部程序可能禁止替换，仍需正确协调或返回保存失败，不能全局取消锁。
2. 播放与元数据刷新分开处理：已有 mpv 的缓存标题仍是旧值，磁盘与新打开者看到新值；界面/曲库应采用已提交的新元数据，避免为了刷新标题重载播放。
3. 当前 commit 是两次 rename，原路径短暂缺失；并非原子事务。本实验的自定义回滚不证明产品在断电、崩溃或第二次 rename 故障时完备。正式接入需检查回滚、崩溃恢复、路径监听及并发读取行为。`ReplaceFileW` 可单独评估，但本次没有测试，不能宣称已实现原子发布。
4. 下一首测试覆盖 mpv 自身预读，没有覆盖 Auralis 的完整 `NativePlaybackService`、调度器、UI 或数据库并发流程。正式改动属于音乐文件写回/播放并发行为，需要按项目规则独立验收。

本次数据在 C: NTFS 上运行；未覆盖其他文件系统、网络盘、超大文件、磁盘耗尽、硬链接/特殊权限、HE-AAC/DRM、不同 mpv/FFmpeg 版本与不同音频设备。现有成功证据不扩展到这些场景。

## 环境与参考

随附 mpv 为 `v0.41.0-dev-gc64675679`，SHA256 为 `acabdf60eee6d3bf92b5dddde2f1371774e1ef1fceab3e674cf7a7f594ddc060`。每份报告保存 mpv 版本及写入器/传输模块指纹；其他相关源文件和工具指纹见 [environment.json](evidence/environment.json)。原始临时路径写在各报告 `root`，证据复制不包含音频二进制。

- [FFmpeg realtime/arealtime](https://ffmpeg.org/ffmpeg-filters.html#realtime_002c-arealtime)
- [Microsoft ApplicationLoopback 示例](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback)
- [Microsoft WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [ReplaceFileW 的失败状态及共享语义](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)
