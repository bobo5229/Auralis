# Auralis 曲库加载技术设计

## 1. 技术结论

曲库加载必须按后台任务实现，不能放在 Renderer 中。推荐 P0 采用：

```text
Settings UI -> Preload API -> Main IPC -> LibraryScanService -> Worker -> Repository -> SQLite
```

Settings 只展示入口和状态；Main 管理任务；Worker 做文件遍历与 metadata 解析；Repository 负责事务写入。

## 2. 设计原则

1. Renderer 不接触文件系统、SQLite、metadata parser。
2. 扫描任务不可阻塞窗口、路由和播放 UI。
3. SQLite 写入必须批量事务化。
4. 单文件失败不能导致整体扫描失败。
5. P0 只做稳定导入，不做复杂清洗、封面缓存、在线补全。

## 3. 目录结构规划

新增模块建议：

```text
src/main/
  features/libraryScan/
    libraryScanService.ts
    libraryScanWorker.ts
    libraryScanTypes.ts
    audioFileFilter.ts
  repositories/
    libraryRootRepository.ts
    scanJobRepository.ts
    trackRepository.ts

src/renderer/features/settings/
  components/
    MusicLibrarySettings.vue

src/shared/types/
  libraryScan.ts
```

说明：扫描属于 Main 侧业务能力，不放入 Renderer `features/library`。Renderer 的 Settings 只是 UI 入口。

## 4. 数据库迁移

在 `src/main/database/schema.ts` 中新增 migration，不重写已有表。

推荐表：

```sql
CREATE TABLE IF NOT EXISTS library_roots (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS scan_jobs (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  scanned_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_message TEXT,
  FOREIGN KEY(root_id) REFERENCES library_roots(id)
);

CREATE TABLE IF NOT EXISTS scan_failures (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(job_id) REFERENCES scan_jobs(id)
);
```

扩展 `tracks`：

```sql
ALTER TABLE tracks ADD COLUMN file_size INTEGER;
ALTER TABLE tracks ADD COLUMN file_mtime_ms INTEGER;
ALTER TABLE tracks ADD COLUMN album_artist TEXT;
ALTER TABLE tracks ADD COLUMN track_no INTEGER;
ALTER TABLE tracks ADD COLUMN disc_no INTEGER;
ALTER TABLE tracks ADD COLUMN year INTEGER;
ALTER TABLE tracks ADD COLUMN genre TEXT;
```

注意：SQLite 不支持简单的 `ADD COLUMN IF NOT EXISTS`。实现迁移时每个 migration 只执行一次，避免重复添加列。

## 5. IPC Contract

新增到 `src/shared/ipc/contracts.ts`：

```ts
'library:select-root': {
  request: void
  response: { canceled: boolean; root?: LibraryRoot }
}

'library:get-roots': {
  request: void
  response: LibraryRoot[]
}

'library:start-scan': {
  request: { rootId: number }
  response: { jobId: number }
}

'library:cancel-scan': {
  request: { jobId: number }
  response: { ok: boolean }
}

'library:get-scan-status': {
  request: { jobId?: number }
  response: LibraryScanStatus | null
}
```

进度事件使用 send/on 模式，不用 invoke：

```text
library:scan-progress
```

Preload 暴露：

```ts
auralis.library.selectRoot()
auralis.library.getRoots()
auralis.library.startScan(rootId)
auralis.library.cancelScan(jobId)
auralis.library.getScanStatus(jobId?)
auralis.library.onScanProgress(callback)
```

## 6. Worker 设计

Worker 输入：

```ts
{
  jobId: number
  rootPath: string
  knownFiles: Array<{
    filePath: string
    fileSize: number | null
    fileMtimeMs: number | null
  }>
}
```

Worker 输出消息：

```ts
type ScanWorkerMessage =
  | { type: 'progress'; payload: LibraryScanProgress }
  | { type: 'track'; payload: ScannedTrack }
  | { type: 'failure'; payload: ScanFailure }
  | { type: 'complete' }
```

Worker 职责：

- 递归遍历目录。
- 根据扩展名过滤音频文件。
- 对未变化文件跳过 metadata 解析。
- 解析 metadata。
- 每批返回结果，避免一次性把 30,000 首歌塞回 Main。

推荐每 100 首或每 200ms 向 Main 汇报一次进度。

## 7. Metadata 解析

推荐使用 `music-metadata`，但在实现前单独验证：

1. Electron 38 兼容性。
2. electron-vite Main/Worker 打包兼容性。
3. Windows 路径和中文文件名兼容性。

解析失败降级规则：

```text
title = metadata.title ?? file basename
artist = metadata.artist ?? 'Unknown Artist'
album = metadata.album ?? 'Unknown Album'
duration = metadata.duration ?? null
```

不要在 P0 做复杂 artist 拆分，例如 `A / B / C`、`feat.`、合集 artist 归并。

## 8. Repository 写入策略

Main 收到 Worker 批量结果后交给 Repository。

推荐方法：

```ts
trackRepository.upsertMany(scannedTracks)
scanJobRepository.updateProgress(jobId, progress)
scanJobRepository.finish(jobId)
scanJobRepository.fail(jobId, error)
scanFailureRepository.insertMany(failures)
```

`upsertMany` 必须包在 `db.transaction()` 中。建议每 200 至 500 首提交一批，避免长事务锁定过久。

tracks 使用 `file_path` 唯一索引。更新条件基于 `file_size` 和 `file_mtime_ms`，未变化文件跳过解析和写入。

## 9. 任务状态机

P0 状态：

```text
idle -> scanning -> completed
idle -> scanning -> canceled
idle -> scanning -> failed
```

约束：

- 同一时间只允许一个扫描任务。
- 如果已有 `scanning` 任务，再次 start 应返回当前 job，而不是创建新任务。
- App 启动时发现历史 `scanning` 状态，应标记为 `failed` 或 `interrupted`，并允许用户重新扫描。

## 10. Settings UI 技术方案

新增 `MusicLibrarySettings.vue`，嵌入现有 Settings 页面。

UI 数据来自 preload API：

- 初次加载调用 `getRoots()` 和 `getScanStatus()`。
- 点击选择目录调用 `selectRoot()`。
- 点击扫描调用 `startScan(rootId)`。
- 组件挂载时订阅 `onScanProgress()`。
- 组件卸载时取消订阅，避免内存泄漏。

P0 UI 只展示：

- 曲库目录路径。
- 扫描按钮。
- 状态文本。
- 进度条。
- 已扫描 / 总数 / 失败数。

## 11. 性能与稳定性

必须避免：

- Renderer 遍历文件。
- 每首歌单独写一次事务。
- 扫描时频繁推送 IPC 事件。
- 对 30,000 文件一次性读入内存。
- 扫描过程中阻塞主窗口。

建议：

- 文件遍历流式处理。
- 批量结果写库。
- 进度事件节流。
- 错误文件单独记录。
- 日志中记录 jobId、rootPath、耗时、失败数量。

## 12. 实施顺序

推荐按以下顺序实现：

1. 数据库 migration。
2. shared 类型与 IPC contract。
3. Repository：roots、jobs、tracks、failures。
4. Main IPC handler：选择目录、获取 roots、启动/取消扫描。
5. Worker：先只扫描文件路径，不解析 metadata。
6. Settings UI 展示根目录与扫描进度。
7. 接入 metadata 解析。
8. Library 页面使用真实 tracks 统计。
9. 补充失败记录与重扫跳过逻辑。

原因：先让“任务管线”跑通，再增加 metadata 复杂度，可以降低调试成本。

## 13. 验收检查

每个阶段至少运行：

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

手动验证：

1. 选择一个小目录，能完成扫描。
2. 重复扫描不重复插入。
3. 扫描中 UI 可操作。
4. 损坏或不支持文件不会中断任务。
5. 关闭重启后仍能重新扫描。

## 14. 主要风险

最大技术风险是 metadata 解析库与 Electron Worker 打包兼容性。实现时必须先做小样本验证，不要一次性把完整扫描、入库、UI 全部写完。

第二个风险是本地音乐 metadata 非常脏。P0 不做复杂归并是刻意选择，目的是保证稳定导入，而不是追求一开始就“整理得很漂亮”。
