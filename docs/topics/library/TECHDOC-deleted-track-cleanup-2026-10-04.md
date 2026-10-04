# 确认删除文件后的曲库清理

日期：2026-10-04。状态：**独立复验通过，真实数据库清理完成**。以下保留施工与复验阶段记录，实际执行结果见文末。

用户要求规划并实施“音乐文件确实删除”的处理，并选择“保留历史，只移除曲库与歌单中的歌曲”。本次实现该策略；改名和移动先沿用[路径找回方案](TECHDOC-track-path-relocation-2026-10-04.md)。音乐文件只读取，不写标签，不删除磁盘文件。

## 最终效果与判定

一次完整扫描正常结束后，满足全部条件的缺失歌曲会从曲库及歌单移除；仅由它使用的专辑与艺术家条目也会清理。过去的累计播放次数、逐日记录、收听日历、年度统计、排行及流派收听统计继续保留，历史封面继续可用。只剩历史记录的专辑没有可播放歌曲时，不提供专辑播放。

1. 当前配置的曲库根目录可访问，且此次全量扫描完整结束。
2. 没有文件读取、解析或导入失败，也没有未能读取的目录。出现任一错误时，本轮整体跳过记录删除。
3. 先完成缺失标记、新路径导入和唯一身份匹配后的路径找回。
4. 候选仍为 `missing`，且旧路径位于本次根目录之内。
5. 再次检查旧路径，只有 `ENOENT` 或 `ENOTDIR` 才视为不存在。路径仍存在、权限错误或其他 I/O 错误时保留。
6. 若已入库的可用歌曲仍符合现有身份匹配条件，则保留缺失记录，交由后续重复记录合并处理。

文件监听的短暂缺失事件继续只做标记，不直接删除。扫描取消、失败、根目录不可访问、目录之外的记录均不执行清理。这里的“确认”依赖本轮目录枚举和文件状态；没有增加音频内容哈希或外部工具的删除日志。

## 实现和数据保护

- `schemaMigrations.ts` 增加迁移 24：独立历史表 `removed_track_history`、历史逐日表 `removed_daily_track_play_stats`，以及统一历史查询视图 `listening_track_display`、`listening_daily_track_play_stats`。升级不会直接删除任何曲库记录。现有磁盘数据库迁移流程在迁移前生成备份。
- `missingTrackCleanupRepository.ts` 在扫描收尾事务内执行清理。删除前保存原歌曲、展示元数据、艺术家关系、歌单位置、播放统计、逐日记录以及相关专辑和艺术家行的 JSON 快照。历史条目保存删除时的有效展示值，包括用户编辑值。
- 清理歌曲及其曲库关联行，仅处理此次受影响且不再被曲库歌曲引用的专辑、艺术家。共享条目和无关孤立条目保留。全局逐日汇总保持原样。
- `libraryScanService.ts` 在完整扫描、路径找回和导入之后调用清理。删除、历史归档与扫描完成状态在同一事务中提交；任何收尾失败都回滚。提交后使用既有 `track-missing` 事件通知曲库和播放队列。
- `playStatsRepository.ts` 将历史查询改为读取当前歌曲与已移除歌曲的联合视图；新增播放仍只记录当前歌曲。清空收听统计也会清除归档统计，但保留历史 ID 的占位记录。
- `trackRepository.ts` 分配新 ID 时同时考虑曲库和归档记录的最大 ID，迁移触发器阻止复用归档 ID。以后重新导入同一文件会取得新 ID，旧历史不会误连到新歌。
- `artworkCacheGarbageCollector.ts` 将历史封面纳入两阶段引用检查，防止曲库关联清理后收听历史封面被回收。

删除前快照提供恢复依据，本轮没有增加自动恢复界面或恢复 API。现有数据库备份导出和校验已用包含新历史表的隔离数据库验证。

## 自测结果

验证使用 Electron 38.8.6（原生 ABI 139）、真实 SQLite，以及测试自行创建的临时目录和文件。没有迁移或清理用户真实数据库，没有修改真实音乐文件。

定向原生验证共 84 项通过，各测试组按相关改动分批运行：

| 测试组           | 项数 | 覆盖行为                                                                                                                              |
| ---------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------- |
| 数据库 schema    |    4 | 旧版本升级、迁移 23 至 24 保留已有歌曲及统计、外键                                                                                    |
| 缺失清理仓库     |   12 | 实际删除临时文件后清理、历史查询不变、快照、共享条目、目录边界、旧文件存在、可能移动、事务回滚、ID 保留、统计重置、备份校验、历史封面 |
| 全量扫描服务     |   23 | 先找回再清理、读取失败与未读目录跳过、收尾失败回滚、事件提交时机、既有路径找回边界                                                    |
| 每日专辑统计     |    6 | 展示与可播放状态                                                                                                                      |
| 封面缓存回收     |    8 | 既有引用与回收边界                                                                                                                    |
| 数据库备份       |   24 | 既有备份与恢复校验                                                                                                                    |
| 实际文件路径找回 |    6 | 临时 FLAC 改名、移动、复制及关联数据保留                                                                                              |
| 播放路径查询     |    1 | 按歌曲 ID 获取当前路径                                                                                                                |

定向单元验证共 37 项通过：身份匹配器 18、增量导入 12、文件监听 2、播放统计服务 5。最后生产代码变更后的缺失清理 12 项和扫描服务 23 项已复跑通过。

最终 `npm.cmd run build` 通过，包括语言键校验、Web / Node 类型检查、主进程、Preload 和 Renderer 构建及产物预算检查。相关 9 个源码与测试文件的 ESLint、Prettier 和差异空白检查通过。

复验入口：

```powershell
npm.cmd run test:native -- src/main/database/schema.native.test.ts src/main/repositories/missingTrackCleanup.native.test.ts src/main/features/libraryScan/libraryScanService.native.test.ts src/main/repositories/dailyAlbumStats.native.test.ts src/main/features/artwork/artworkCacheGarbageCollector.native.test.ts src/main/database/databaseBackupService.native.test.ts src/main/features/libraryScan/trackRelocation.native.test.ts src/main/repositories/playbackPath.native.test.ts
npm.cmd run test:unit -- src/main/features/libraryScan/trackRelocationMatcher.test.ts src/main/features/libraryScan/libraryIncrementalImportService.test.ts src/main/features/metadata/metadataWatchService.test.ts src/main/services/playStatsService.test.ts
npm.cmd run build
```

扫描服务测试保留真实 SQLite 和服务逻辑，用受控 worker 消息构造输入；文件不存在判定使用真实临时文件系统。尚未进行完整桌面操作、真实曲库扫描、实际播放出声或界面验收。

## 独立验收交接

[风险与验收规则](../../rules/validation.md)将“改变数据库迁移、音乐文件写回或删除策略”列为独立验收情形。本次改变数据库迁移和记录删除策略，因此施工自测后交付为“实现完成，待独立验收”。交付时没有执行真实数据清理；后续按用户确认的复验结果推进，实际执行见文末记录。

请在同一工作区只读验收，先根据用户目标独立推导检查项，再检查实现和上述证据；使用隔离数据库及临时文件补充必要验证。重点核对删除判定、读取及导入错误保护、移动歧义、事务原子性、历史统计和封面、ID 隔离、迁移与恢复。目录中含大量此前未提交工作，不应把全部工作区差异归为本次变更。

本次源码范围为迁移、清理仓库、历史统计查询、扫描接入、ID 分配与封面引用检查；关联测试为 schema、清理仓库和扫描服务。`trackRepository.ts`、`libraryScanService.ts` 及其测试也含前一轮路径找回变更，应结合该方案定位。

交付内容指纹保存于 `.electron-home/deleted-track-cleanup-20261004/delivery.json`，包含相关 9 个文件的 SHA-256、基准 commit、验证状态和文档路径。独立验收通过后，才进入真实数据库备份、迁移与全量扫描清理阶段。

## 独立验收问题修复：批量检查可能移动的歌曲

2026-10-04 的独立验收发现：每条缺失记录都执行一次 `availability='available' AND (isrc=? OR (title=? AND artist=?))`，查询计划只利用可用状态索引。10 万条可用歌曲、500 条缺失记录的清理耗时为 6.66 秒。验收尚未通过，用户授权修复此问题。

本轮只修改 `missingTrackCleanupRepository.ts` 及其原生测试。先按本轮缺失记录的 ISRC 或标题与艺术家构造分组，再用 `.iterate()` 遍历一次可用歌曲。只对对应身份组调用既有单候选匹配器，记录需要保留的缺失 ID；不缓存整个可用曲库。保留时长、大小、专辑和 ISRC 的原有判定，以及 SQL 中空值不能按标题与艺术家匹配的行为。歧义身份组中的每条旧记录分别检查，不能因整组不唯一而删除它们。没有新增数据库迁移或索引。

所有匹配检查仍在原清理事务内完成，删除前仍核对文件不存在；历史归档、清理、收尾回滚与提交后事件保持原路径。

使用改动前源码生成的基线和改动后仓库，分别运行实际 `removeConfirmedMissing` 调用及事务提交。Electron 38.8.6 / ABI 139，隔离内存 SQLite、实际临时根目录。合成歌曲使用同一艺术家、不同标题，避免艺术家查询的选择性掩盖瓶颈。各规模进行三次成对测量，插入数据和迁移耗时不计入清理耗时；每次核对删除数量、历史数量和外键。

| 可用 / 缺失记录 | 修复前中位数 | 修复后中位数 |  倍率 |
| --------------- | -----------: | -----------: | ----: |
| 50,000 / 250    |  1,423.35 ms |    117.02 ms | 12.16 |
| 100,000 / 500   |  6,191.77 ms |    230.44 ms | 26.87 |

这验证了该数据分布下整个清理事务的耗时改善。清理仍同步执行，尚未实测完整桌面 IPC 延迟；其他数据分布和磁盘数据库耗时需要按实际环境判断。

修复自测通过：缺失清理 14 项、全量扫描服务 23 项，共 37 项原生测试；`npm.cmd run build`、两个变更文件的 ESLint 和 Prettier 通过。新增测试覆盖同一身份组有多条缺失记录，以及混合批次中的 17 种身份与版本边界，包括空值、空字符串、ISRC 差异、时长与大小阈值、专辑回退和复合键碰撞。既有事务回滚、历史查询、封面保护及备份验证继续通过。

性能脚本、基线源码与原始测量位于 `.electron-home/deleted-track-cleanup-optimization-20261004/`，性能结果为 `performance.json`。本轮内容指纹及验证范围为该目录的 `delivery.json`；前一轮交付与审查证据保留原样。性能复验入口：

```powershell
node node_modules/electron/cli.js .electron-home/deleted-track-cleanup-optimization-20261004/benchmark.mjs
npm.cmd run test:native -- src/main/repositories/missingTrackCleanup.native.test.ts src/main/features/libraryScan/libraryScanService.native.test.ts
```

修复交付时状态：**修复完成，待独立复验**。复验范围为批量身份检查与删除边界、事务原子性和大曲库耗时；原验收的有效行为证据可按相关源码状态复用。该修复阶段没有操作真实数据库或音乐文件。随后用户确认复验通过，授权推进真实数据库清理。

## 真实数据库清理记录

执行时间：2026-10-04 16:38（Asia/Shanghai）。用户确认“通过，推进真实数据库清理”后执行。

- 实际数据库：`D:\VSCode\Auralis\data\user-data\data\auralis.sqlite`。
- 曲库目录：`E:\Songs.Collection`，执行前确认可访问。
- 执行前数据库已是版本 24，因此没有重复迁移。
- 正常关闭运行中的播放器，待其服务和数据库连接退出后维护，避免监听与播放统计并发。
- 用 SQLite 备份 API 生成一致快照，并通过完整性、结构和内容一致性校验。没有覆盖旧备份。
- 使用当前源代码的 `LibraryScanService` 和实际扫描 worker 执行全量扫描；窗口关闭期间不启动文件监听。没有直接用临时 SQL 删除歌曲。
- 扫描任务 87：4,131 个文件全部扫描成功，失败 0，未读目录 0。没有新导入歌曲或路径找回。

清理前备份：[before-confirmed-missing-cleanup-20261004-0b0557a3-69c8-4f2e-be6b-8c1bb7b6a8f8.sqlite](D:/VSCode/Auralis/data/user-data/backups/before-confirmed-missing-cleanup-20261004-0b0557a3-69c8-4f2e-be6b-8c1bb7b6a8f8.sqlite)，155,533,312 字节。

| 项目               | 清理前 | 清理后 |
| ------------------ | -----: | -----: |
| 曲库歌曲           |  4,155 |  4,131 |
| 可用歌曲           |  4,131 |  4,131 |
| 缺失记录           |     24 |      0 |
| 专辑条目           |    979 |    975 |
| 艺术家条目         |    615 |    612 |
| 歌单及歌单成员     |  0 / 0 |  0 / 0 |
| 当前歌曲播放统计行 |    647 |    646 |
| 当前歌曲逐日统计行 |    863 |    862 |
| 归档歌曲历史行     |      0 |     24 |
| 归档逐日统计行     |      0 |      1 |
| 全部歌曲逐日统计行 |    863 |    863 |
| 全局逐日汇总行     |     48 |     48 |

移除的原歌曲 ID 为：477–487、3975、4012–4016、4066、4087、4118–4122。共 24 条，包含此前流派为 `Pop, Live` 的缺失记录 4087。清理了 4 个不再使用的专辑和 3 个艺术家条目，没有保留待处理的缺失候选。

其中卫兰《李香兰》（4066）有 1 次历史播放；其累计次数和逐日记录已归档。其余被移除歌曲的累计播放次数为 0。全部歌曲累计播放次数仍为 1,030，全局逐日播放次数仍为 931；两者原本的统计口径与历史起始范围不同，本轮未改变这些值。

清理完成后关闭维护连接，再用新只读连接逐行比对：全局逐日汇总、包含归档的逐日歌曲记录、每个原歌曲 ID 的累计次数和最后播放时间均与备份前一致。核对归档展示值和恢复快照；24 条历史记录引用的封面缓存均存在。数据库 `quick_check` 为 `ok`，外键问题为 0。

执行证据位于 `.electron-home/real-track-cleanup-20261004/`：`backup.json`、`before.json`、`worker-evidence.json`、`scan-jobs.json`、`after.json`、`result.json`、`verification.json`。保存实际执行脚本与 worker 便于追溯。音乐文件与标签没有写回或删除。
