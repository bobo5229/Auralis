# Auralis 曲库加载 PRD

## 1. 结论

推荐将“加载曲库”入口放在 Settings 页面，但功能归属不应属于 Settings。Settings 只负责选择音乐目录、展示扫描状态和管理曲库路径；真正的扫描、Metadata 解析、入库、Artwork 缓存必须在 Main Process 或 Worker 中完成。

这是 Auralis 从“空壳播放器”进入“本地音乐档案馆”的核心能力。P0 阶段目标不是做完整音乐管理系统，而是建立稳定、可恢复、可扩展的曲库导入管线。

## 2. 产品目标

用户可以从 Settings 中选择本地音乐文件夹，Auralis 在后台扫描文件，读取基础 metadata，并将歌曲、专辑等信息写入 SQLite。扫描过程中 UI 保持可用，用户能看到进度、当前状态和失败数量。

完成后，Library / Albums 等页面可以基于数据库展示真实曲库数据。

## 3. 用户入口

Settings 页面增加一个 `Music Library` 区域：

1. 选择音乐文件夹。
2. 显示当前已添加的曲库目录。
3. 提供 `Scan Library` / `Rescan` 按钮。
4. 展示扫描状态：未扫描、扫描中、完成、失败、已取消。
5. 展示基础统计：歌曲数、专辑数、失败文件数、上次扫描时间。

P0 推荐先支持单个根目录。多目录支持可以在数据模型中预留，但 UI 不急着复杂化。

## 4. P0 范围

P0 实现：

- 从 Settings 选择本地目录。
- 后台递归扫描音频文件。
- 支持常见格式：mp3、flac、m4a、aac、wav、ogg、opus。
- 读取基础 metadata：title、artist、album、albumArtist、trackNo、discNo、duration、year、genre。
- 将文件路径、文件大小、mtime、metadata 写入 SQLite。
- 基于 `file_path` 做 upsert，避免重复导入。
- 扫描进度通过 typed IPC 推送到 Renderer。
- 支持取消当前扫描。
- 扫描失败不阻断整个任务，记录失败原因。

P0 不实现：

- 在线 metadata 补全。
- 声纹识别。
- 歌词。
- 播放器联动。
- 手动编辑 metadata。
- 复杂去重合并。
- 完整 Artwork 生成流水线。

## 5. 架构方案

推荐链路：

```text
Settings UI -> Typed IPC -> LibraryScanService -> Scan Worker -> Repository -> SQLite
```

Renderer 只负责触发和展示状态，不直接访问文件系统、数据库或 metadata parser。

Main Process 负责：

- 打开系统目录选择框。
- 管理扫描任务生命周期。
- 创建 Worker。
- 接收 Worker 结果并批量写入数据库。
- 向 Renderer 发布扫描进度。

Worker 负责：

- 遍历目录。
- 过滤音频文件。
- 解析 metadata。
- 返回结构化扫描结果。

Repository 负责：

- 曲库目录表写入。
- 歌曲 upsert。
- 专辑基础聚合。
- 扫描任务状态记录。

## 6. 数据模型建议

在现有 SQLite schema 上新增迁移，不直接重写旧表。

建议新增或扩展：

```text
library_roots
  id
  path
  created_at
  last_scanned_at

scan_jobs
  id
  root_id
  status
  total_files
  scanned_files
  failed_files
  started_at
  finished_at
  error_message

tracks
  file_path
  file_size
  file_mtime_ms
  title
  artist
  album
  album_artist
  track_no
  disc_no
  duration_seconds
  year
  genre
  updated_at

scan_failures
  id
  job_id
  file_path
  reason
```

P0 不建议过早抽出复杂的 `artists` 关系表。原因是本地 metadata 很脏，过早规范化会放大合并、别名、合集专辑的问题。先以 tracks/albums 为主，更稳定。

## 7. IPC 设计

新增 typed IPC：

```text
library:select-root
library:get-roots
library:start-scan
library:cancel-scan
library:get-scan-status
library:on-scan-progress
```

其中 progress 事件建议包含：

```text
jobId
status
totalFiles
scannedFiles
failedFiles
currentFile
message
```

## 8. Metadata 策略

推荐使用成熟 metadata parser，而不是手写解析 ID3 / FLAC / MP4 tag。候选库为 `music-metadata`，实现前再确认版本与 Electron 38、打包方式、ESM/CJS 兼容性。

风险说明：metadata 解析库可能涉及大量格式边界。必须放在 Worker 中运行，避免 UI 卡顿；解析失败必须降级为“使用文件名作为标题”，不能中断整次扫描。

## 9. 性能要求

目标规模：

```text
4,000 -> 必须流畅
10,000 -> 必须可接受
30,000+ -> 架构必须能扩展
```

实现要求：

- 批量写入 SQLite，不允许每首歌单独提交事务。
- 进度事件节流，例如每 200ms 或每 100 个文件推送一次。
- 对未变化文件使用 `file_size + file_mtime_ms` 跳过重复解析。
- 扫描任务同一时间只允许一个运行。

## 10. 错误与恢复

扫描必须可恢复。应用退出或崩溃后，下一次启动应能识别未完成任务，并允许用户重新扫描。

常见错误处理：

- 无权限目录：记录失败并提示用户。
- 单个损坏文件：记录失败，不中断任务。
- metadata 缺失：使用文件名兜底。
- 文件被移动：下次 rescan 标记为 missing 或从库中移除，P0 可先只记录。

## 11. 验收标准

P0 完成时应满足：

1. 用户能在 Settings 选择音乐目录。
2. 扫描过程不会阻塞 UI。
3. 扫描进度可见。
4. 扫描结果写入 SQLite。
5. Library 统计能显示真实歌曲数。
6. 重复扫描不会重复插入同一文件。
7. 单个文件解析失败不会导致整体失败。
8. `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 通过。

## 12. 风险

最大风险不是 UI，而是本地音乐文件的复杂度：路径编码、损坏文件、缺失 metadata、合集专辑、超大目录、权限问题都会出现。

因此第一版必须克制：先做稳定扫描和可靠入库，不急着做漂亮的专辑归并、封面缓存和复杂清洗规则。
