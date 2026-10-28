# TECHDOC：元数据刷新后的文件指纹一致性

状态：已实施，隔离数据库、Worker/Service 模拟及真实 FFmpeg 写回定向验证通过。日期：2026-09-21。

## 实施记录（2026-09-21）

- 抽取稳定读取函数供 Worker 与写后核验复用；读取前后核对原始 size/mtime，变化最多重读一次。Worker 结果携带 job、generation、源路径和指纹。
- Service 串行处理结果、进度、完成和 exit；提交前后检查 job、路径和写回代际，仅把实际提交计为成功，提交失败记入任务失败与日志。
- Repository 在现有事务内校验路径身份，原子提交标签、技术字段、file_size/file_mtime_ms 和显式 checked mtime；保留 user_edit 展示字段，无数据库迁移。歌词模式遇新音频指纹直接升级完整提交，同指纹只推进歌词检查。
- 用户写回在替换前检查原文件及备份指纹；写后完整稳定读取并核对实际标签，再在同一数据库事务提交 user_edit 和已验证技术字段/指纹。失败不标记新指纹成功，合并安排一次现有刷新任务。
- 实测 MP3 的 ID3v2.3 年份/日期分别位于 TYER 与 TDAT，核验兼容这一原始标签证据，不假定 common.date 一定存在。未修改日期合法性校验顺序或重构整个文件写回事务。
- 普通定向测试 26 项通过（稳定读取 4、Service 9、事件过滤 10、封面键 3）。Electron ABI native 测试覆盖指纹事务及真实写回 12 项、既有 Repository 2 项、受输入契约影响的封面迁移 12 项，合计 26 项通过。
- 使用独立 SQLite 内存数据库及临时合成音频；真实 FFmpeg 验证 FLAC、MP3、M4A 完整日期写回、损坏文件失败和替换前外部变更保护，未触碰真实曲库。
- 最新 Main `tsc`、独立 `electron-vite build` 及本次代码定向 ESLint 通过；全项目类型检查仍有曲库文档记录的三处范围外错误。未运行全仓测试、Electron GUI smoke 或发布流程。
- size/mtime 无法识别同大小同时间戳替换；文件系统与 SQLite 仍非统一事务。未测真实 watcher 事件频率、全曲库 CPU/磁盘开销。无法核验的写入会报告失败并请求刷新，刷新启动失败记录需显式重试。下文为原始设计依据。

## 问题与证据

Watcher 根据文件 size/mtime 与 tracks 中 `file_size`、`file_mtime_ms` 比较决定刷新。
Worker 虽然调用 stat 并用 size 计算 metadataSignature，但结果消息不包含文件 size/mtime；Repository 写入新标签时没有更新它们，checked_mtime 又取数据库里的旧 file_mtime_ms。

因此一次刷新成功后，后续同文件事件仍可能判定指纹不同，再次解析标签与处理封面。此处是重复事件下的重复工作，不代表已证实自动产生无限循环。
用户写标签路径同样没有同步写后的文件指纹，短时 watch 抑制只能推迟问题，不能维持持久一致性。

## 目标与边界

- 成功提交的标签和音频指纹对应同一次稳定读取。
- 刷新失败、解析中变化、过期任务或路径已改变时，不把未读取的新状态标成已处理。
- `user_edit` 的展示字段优先级保持不变；仅歌词刷新不能冒充完整元数据已刷新。
- 后续相同指纹事件跳过，新指纹事件仍触发，外置歌词事件仍可独立触发。
- 复用现有字段与事务，原则上无需数据库迁移，不新增轮询或全文件哈希。

## 建议实现

### 1. Worker 结果携带稳定读取证据

为 Worker 结果及 Repository 输入补齐 sourceFilePath、fileSize、fileMtimeMs；名称在实施时按现有类型统一。
在读取标签前及读取结束后分别 stat；只有指纹一致才生成可提交结果。指纹沿用仓库 size/mtime 语义，不声称能够检测相同大小、相同 mtime 的全部内容替换。

解析期间发生变化时进入现有失败或有界重试路径；建议每个 job 内最多重试一次，持续变化则记录可恢复失败。不要提交旧标签却附带变化后的新指纹。
主进程接受结果时再验证路径、job 和任务代际；必要的提交前 stat 也必须与结果一致。这个检查不能使文件系统与 SQLite 形成事务，只是缩小竞态窗口；提交后的新变化仍由 watcher 处理。

### 2. 完整元数据与指纹原子提交

在 `updateTrackMetadata` 现有事务中同步更新 file_size、file_mtime_ms、metadata_checked_mtime_ms 和本次确实完成解析的 lyrics_checked_mtime_ms。
checked 字段显式使用结果携带的已读取 mtime；不要依赖同一 SQL SET 中其他列赋值后的取值顺序。

普通 file_tag 分支及保留 user_edit 的技术字段分支都必须更新指纹，但后者不得覆盖用户展示字段。UPDATE 增加 trackId、预期路径或等价身份保护；不存在或已移动的 track 不接受旧结果。
事务失败时标签和指纹一起回滚，不能先更新指纹让后续事件误判已处理。服务层记录提交失败，不把 worker 已解析计数当作数据库写入成功。

### 3. 单独处理歌词模式

当前 writeMode 为 lyrics 时仅调用 `updateTrackLyrics`，并未提交完整标签。不得把 Worker 读到的新音频指纹无条件写为“全量已同步”，否则音频标签变化可能被后续 watcher 跳过。

若音频指纹与数据库一致，允许更新歌词及对应检查标记，外置 .lrc 变化仍通过现有歌词意图处理。
若音频指纹已改变，升级或排队一次完整刷新，或者保留旧指纹等待完整处理；不能只写歌词就推进 metadata_checked_mtime_ms。选定一种实现并用测试明确行为。

### 4. 用户标签写入

文件写入完成后获取对应文件指纹，并与 user_edit 数据在同一数据库事务中更新。若无法证明写入结果与获取指纹之间未被外部改写，则保持待重新核对状态，通过现有刷新流程收敛；不要仅靠写后 stat 宣称所有字段均已重新解析。
只更新已得到验证的 checked 标记；标签重写不等于歌词也已检查。保留现有提前抑制 watcher 的作用，不延长抑制时间替代指纹修复。
此处会接触音频写回链路，须用隔离文件验证成功和失败。此前发现的“业务日期校验晚于文件写入”是另一项数据安全问题，本方案不把它默认为已修复，也不顺带扩大到整个写回事务重构。

## 代码定位

- [监控与刷新选择](../../../src/main/features/metadata/metadataWatchService.ts)
- [文件变化过滤](../../../src/main/features/metadata/metadataFileChangeFilter.ts)
- [Worker 解析](../../../src/main/features/metadata/metadataRefreshWorker.ts)
- [Worker 消息类型](../../../src/main/features/metadata/metadataRefreshTypes.ts)
- [刷新与写标签服务](../../../src/main/features/metadata/metadataRefreshService.ts)
- [数据库写入](../../../src/main/repositories/metadataRefreshRepository.ts)

## 实施与验收

先测试完整刷新和 user_edit 两分支的指纹变化，再扩展 Worker 证据、原子提交、歌词模式以及用户写标签路径。测试使用临时数据库及合成/复制的音频，不连接真实曲库。

| 场景                              | 验收结果                                               |
| --------------------------------- | ------------------------------------------------------ |
| A 指纹变 B，完整刷新成功          | 标签与 B 同时提交；再次收到 B 事件不解析；C 事件仍解析 |
| user_edit 已存在                  | 展示字段和 source 不变，技术字段与指纹正常推进         |
| 解析中变化、文件消失、旧 job 返回 | 不提交混合版本或旧路径结果，有界处理失败               |
| 数据库写入失败                    | 标签和指纹均回滚，后续事件仍能触发处理                 |
| 仅 .lrc 变化                      | 音频指纹不变也更新歌词                                 |
| lyrics 模式遇音频指纹变化         | 不吞掉完整标签刷新，不提前推进全量检查标记             |
| 用户写入成功或失败                | 成功按证据更新指纹；失败不误标已检查，不覆盖外部更新   |

优先扩展 metadataFileChangeFilter 和 Repository 定向测试，并增加 Worker/Service 必要的模拟测试；数据库 SQL 与写回路径按高风险规则用隔离数据验证。涉及 better-sqlite3 时使用项目 Electron ABI 的 native 测试，不能以 Node 内存 SQLite 模拟代替。
性能观察记录相同事件序列下的解析次数、封面处理次数及 job 次数，目标是一次成功刷新后的同指纹事件不再触发解析；不预先承诺固定百分比提速。

## 关联方案

推荐顺序：[曲库分页并发](../library/TECHDOC-catalog-concurrent-load-2026-09-21.md)、[无缝解码预算](../playback/TECHDOC-gapless-memory-budget-2026-09-21.md)、本项。实施完成后在本文补充实际验证和剩余限制，不把本文预定验收当作已经执行。
