# 架构 Review 落地修复汇总

> 日期：2026-07-17  
> 背景：在阅读 `docs/ARCHITECTURE.md` 并完成五模块代码 review 后，按建议落地顺序派出 5 个并行子智能体实施修复。  
> 本文汇总修复范围、各子智能体结果、验证状态与剩余风险。  
> 若本文与代码冲突，以代码为准。

---

## 1. 背景与落地顺序

Review 后的优先落地清单（跨模块）：

| 顺序 | 主题                                       | 原优先级       |
| ---- | ------------------------------------------ | -------------- |
| 1    | 修复普通歌单详情曲目顺序                   | P0 正确性      |
| 2    | 音频自定义协议 + 收紧 `webSecurity`        | P0 安全        |
| 3    | 桌面歌词独立最小 preload                   | P0 安全        |
| 4    | `library.onChanged` 按 reason 分流         | P0 性能        |
| 5    | 保护 `user_edit` + 写标签后 suppress watch | P1 正确性      |
| 6    | 全量扫描期间 pause watch flush             | P1 正确性      |
| 7    | Job 状态 CAS + scan exit 自愈              | P1 正确性      |
| 8    | 智能歌单校验/缓存 + 播放 session 幂等增强  | P1 性能/正确性 |

并行拆分时按**文件所有权**分成 5 路，避免互相覆盖：

| 子智能体 | 任务代号               | 职责                                      |
| -------- | ---------------------- | ----------------------------------------- |
| A        | Playlist order         | 歌单详情顺序                              |
| B        | Security shell         | 音频协议 / webSecurity / 桌面歌词 preload |
| C        | Scan-metadata pipeline | user_edit / CAS / watch / ISRC / relocate |
| D        | Renderer events        | onChanged 分流 / 歌词单例 / 桌面歌词 IPC  |
| E        | Domain services        | 智能歌单校验缓存 / 播放幂等               |

主线程在合并后做了冲突收敛、无关样式回滚、artwork CORS 补丁，以及 typecheck / lint / build 验证。

---

## 2. 模块划分回顾（Review 时）

```text
┌─────────────────────────────────────────────────────────────┐
│ 5 Renderer UI  (library / albums / playback / lyrics / …)  │
├─────────────────────────────────────────────────────────────┤
│ 1 Preload + Typed IPC                                      │
├─────────────────────────────────────────────────────────────┤
│ 4 Domain Services     │  3 Scan / Watch / Tag Write        │
├───────────────────────┴────────────────────────────────────┤
│ 2 Repositories + SQLite schema                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 各子智能体结果

### 3.1 Agent A — 歌单详情顺序

**状态：完成**

| 项   | 内容                                                                                |
| ---- | ----------------------------------------------------------------------------------- |
| 问题 | `getDetail` 用 `Set` + `getAll().filter`，丢失 `playlist_tracks.position`           |
| 修复 | `PlaylistRepository.getTracks(id)`：`JOIN library_track_display`，按 `position ASC` |
| 服务 | `PlaylistService.getDetail` 改为调用上述方法；移除无用的 `TrackRepository` 依赖     |

**修改文件**

- `src/main/repositories/playlistRepository.ts`
- `src/main/services/playlistService.ts`
- `src/main/ipc/registerIpcHandlers.ts`（构造参数同步）

**行为前后**

|     | 行为                     |
| --- | ------------------------ |
| 前  | 曲库排序覆盖歌单顺序     |
| 后  | 按添加/position 顺序返回 |

**残留风险**

- 不可用曲目仍被过滤（与旧 `getAll` 行为一致）。
- 歌单内拖拽重排 UI 若尚未实现，顺序仍由 position 写入路径决定。

---

### 3.2 Agent B — 音频协议 / webSecurity / 桌面歌词 preload

**状态：完成**

| 项          | 内容                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------ |
| 音频        | 新增 `auralis-audio://track/<id>` 协议；`getAudioUrl` 不再返回 `file://`                         |
| 校验        | 扩展名 + 文件存在 + **路径必须落在已登记 library root**（`path.relative`，Windows 大小写不敏感） |
| Seeking     | 协议转发 `Range` 头                                                                              |
| webSecurity | 主窗与桌面歌词窗均为 **`true`**                                                                  |
| CSP         | `media-src` 改为 `auralis-audio:`                                                                |
| 桌面歌词    | 独立 `src/preload/desktopLyrics.ts`，仅暴露 `desktopLyrics.onUpdate`                             |
| Artwork     | 路径校验改 `relative`；增加 CORS 头供 canvas 采样                                                |

**新增/关键文件**

- `src/main/features/audio/audioProtocol.ts`（新建）
- `src/main/features/audio/audioPathGuard.ts`（新建）
- `src/preload/desktopLyrics.ts`（新建）
- `src/main/index.ts`、`createWindow.ts`、`desktopLyricsWindow.ts`
- `src/main/ipc/registerIpcHandlers.ts`（getAudioUrl）
- `src/main/features/artwork/artworkProtocol.ts`
- `electron.vite.config.ts`（第二 preload 入口）
- `src/renderer/index.html`（CSP）

**数据流**

```text
UI getAudioUrl(trackId)
  → main: track / 扩展名 / root / isFile
  → { url: "auralis-audio://track/42" }
<audio src="...">
  → protocol.handle → DB path → 再校验 → stream（含 Range）
```

**残留风险**

- `sandbox: false` 仍在（preload/ESM 兼容；未在本轮开启 sandbox）。
- 符号链接跳出 library root 的极端路径未做 `realpath` 硬化。
- 根目录删除后曲目仍在库中时，播放会 403/null（有意收紧）。

**主线程补丁**

- `useArtworkPalette` 设置 `image.crossOrigin = 'anonymous'`，避免 `webSecurity: true` 下 canvas 污染导致调色盘回退。

---

### 3.3 Agent C — 扫描 / 元数据管线

**状态：全部 7 项目标完成**

| #   | 目标                                        | 结果 |
| --- | ------------------------------------------- | ---- |
| 1   | 保护 `user_edit` 不被 file_tag 覆盖展示字段 | Done |
| 2   | 写标签成功后 suppress watch 刷新（8s）      | Done |
| 3   | scan / refresh job CAS                      | Done |
| 4   | scan worker exit / orphan job 自愈          | Done |
| 5   | 全量扫描 pause watch flush                  | Done |
| 6   | ISRC 0 命中回落 Rule 2                      | Done |
| 7   | relocate UNIQUE / 占用失败隔离              | Done |

**行为要点**

- `source === 'user_edit'` 时，file_tag 刷新仍可更新时长/曲序/ISRC/歌词等技术字段，但**不覆盖展示字段、不把 source 改回 file_tag**。
- 标签写回成功 → `suppressRefreshForPath`；同时 `user_edit` 作为第二道防线。
- `finish/fail/updateProgress` 仅在 `scanning`/`running` 时生效。
- Worker 异常退出会 fail job；`startScan` 发现 orphan scanning 会先 heal。
- 扫描 `onStart/onEnd` 联动 `pauseFlush/resumeFlush`，避免扫描期 watch 导入被 complete missing 误杀。
- ISRC：1 命中 relocate；>1 放弃；**0 命中 fall-through**。
- relocate 失败 → upsert 回退；批处理单行失败不拖垮整批。

**修改文件（摘要）**

- `scanJobRepository.ts`、`metadataRefreshRepository.ts`、`trackRepository.ts`
- `libraryScanService.ts`、`libraryIncrementalImportService.ts`、`trackRelocationMatcher.ts`
- `metadataWatchService.ts`、`metadataRefreshService.ts`
- `registerIpcHandlers.ts`（lifecycle + suppress 接线）

**残留风险**

- suppress 为时间窗；极慢外部写盘仍可能触发 refresh（user_edit 兜底）。
- 路径大小写变体可能导致 suppress 未命中。
- 整行 `user_edit` 粒度，尚无字段级 source。
- 写标签后未主动回写 `file_mtime_ms`（全量扫描可能再解析，展示仍受保护）。

---

### 3.4 Agent D — Renderer 事件 / 歌词 / 桌面歌词 IPC

**状态：完成**

| 目标                  | 结果                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| onChanged reason 过滤 | Library / Albums / AlbumDetail / Facets 在 `play-stats-updated` / `play-stats-reset` 时**不再全量 reload** |
| `useTrackLyrics` 单例 | 模块级状态 + 单次订阅 + request token 防竞态                                                               |
| 桌面歌词 IPC 节流     | 不可见不推；去掉 currentTime 绑定；payload 指纹去重；打开时 force sync                                     |

**修改文件**

- `LibraryPage.vue`、`AlbumsPage.vue`、`AlbumDetailPage.vue`、`FacetsDialog.vue`
- `useTrackLyrics.ts`
- `PlayerBar.vue`

**残留风险**

- 若库列表将来展示 play count，统计变更后不会即时刷新行内数字（当前 UI 基本不展示）。
- 歌词单例订阅与应用同生命周期（符合主窗单例模型）。

---

### 3.5 Agent E — 智能歌单 / 播放统计服务

**状态：完成（session 表未引入，采用内存增强）**

| 目标                | 结果                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------ |
| 拒绝空规则匹配全库  | `assertValidSmartPlaylistRule`：空 conditions / 空 AND·OR / 非法 field·operator 拒绝 |
| 减少重复 `getAll()` | 服务内 **3s TTL** 缓存；`listTrackCounts` 一次加载复用                               |
| 播放 session 幂等   | 内存 cap 1000→5000；写前 `trackExists`；renderer 仅 `result.ok` 时 `counted = true`  |
| smart `sort_order`  | 创建时跨 `playlists ∪ smart_playlists` 取 `MAX(sort_order)`                          |

**修改文件**

- `smartPlaylistService.ts`、`smartPlaylistRepository.ts`
- `playStatsService.ts`、`playStatsRepository.ts`
- `usePlayback.ts`

**未做**

- 未新增 `play_sessions` 表（避免迁移与无限增长；进程内重试已覆盖主要场景）。

**残留风险**

- TTL 最多约 3s 陈旧；尚未挂到 `library:changed` 主动失效。
- 库中已存在的空规则不会被自动清理。
- 跨进程重启的 session 幂等仍依赖 renderer 使用新 sessionId（当前行为如此）。

---

## 4. 主线程合并与验证

### 4.1 合并处理

| 动作         | 说明                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| 接线一致性   | 确认 `registerIpcHandlers` 同时包含音频协议、watch suppress、scan lifecycle |
| 回滚无关改动 | 还原误触的 `main.css` / `TrackProgressInfo.vue` 样式实验                    |
| Preload 配置 | 去掉无效的 `isolatedEntries`；桌面歌词 preload 避免共享 runtime chunk       |
| CORS 补丁    | `useArtworkPalette` `crossOrigin = 'anonymous'`                             |
| Lint         | 移除 `PlaylistService` 未使用构造参数                                       |

### 4.2 验证命令（均已通过）

```text
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

构建产物确认：

- `out/preload/index.mjs`（完整 API）
- `out/preload/desktopLyrics.mjs`（最小 API）
- main / renderer 生产构建成功

### 4.3 建议手测清单

1. 普通歌单添加多首后打开详情，顺序与添加/position 一致。
2. 播放控制台/网络侧确认 `audio.src` 为 `auralis-audio://track/...`，可 seek。
3. 桌面歌词开窗仍能同步；该窗不应能调扫描/改元数据 API。
4. 有效播放后 Library 列表不整库闪烁/重载。
5. 编辑元数据写回后展示不被立刻冲掉。
6. 扫描进行中复制新文件入目录，扫描结束后新文件仍为 available。
7. 智能歌单空规则 / 非法规则创建失败；侧边栏计数正常。

---

## 5. 变更文件总表

### 新建

- `src/main/features/audio/audioProtocol.ts`
- `src/main/features/audio/audioPathGuard.ts`
- `src/preload/desktopLyrics.ts`
- `docs/2026-07-17-architecture-review-fixes.md`（本文）

### 修改（核心）

| 区域      | 文件                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建      | `electron.vite.config.ts`                                                                                                                   |
| 窗口/启动 | `src/main/index.ts`、`createWindow.ts`、`desktopLyricsWindow.ts`                                                                            |
| IPC 装配  | `src/main/ipc/registerIpcHandlers.ts`                                                                                                       |
| 协议      | `artworkProtocol.ts`、audio/\*                                                                                                              |
| 扫描      | `libraryScanService.ts`、`libraryIncrementalImportService.ts`、`trackRelocationMatcher.ts`                                                  |
| 元数据    | `metadataWatchService.ts`、`metadataRefreshService.ts`                                                                                      |
| 仓库      | `playlistRepository`、`scanJobRepository`、`metadataRefreshRepository`、`trackRepository`、`smartPlaylistRepository`、`playStatsRepository` |
| 服务      | `playlistService`、`smartPlaylistService`、`playStatsService`                                                                               |
| Renderer  | Library/Albums/Facets pages、`useTrackLyrics`、`PlayerBar`、`usePlayback`、`useArtworkPalette`、`index.html`                                |

---

## 6. 仍未在本轮落地的 Review 项

以下来自 review，**有意未做或仅部分覆盖**，供后续排期：

| 项                                       | 说明                              |
| ---------------------------------------- | --------------------------------- |
| `sandbox: true`                          | 仍 false；需系统验证 preload 兼容 |
| Push channel 类型化（`IpcPushContract`） | 裸字符串 push 仍在                |
| 主窗 / 歌词窗 navigation 护栏            | 未加 `setWindowOpenHandler` 等    |
| 增量 import 移出主线程 parse             | watch 热路径仍可能主线程解析      |
| `getAll` 真分页 / SQL 排序下沉           | 仅智能歌单侧 TTL 缓存缓解         |
| 持久化 `play_sessions`                   | 未加表                            |
| albums 视图 join 键一致性                | 封面丢失类问题未本轮修            |
| macOS `activate` 多窗                    | 未改（当前主目标 Windows）        |
| 自动化测试框架                           | 仍无                              |

---

## 7. 与 `ARCHITECTURE.md` 的关系

本文是独立变更记录；修复完成后的稳定架构事实已同步到 `docs/ARCHITECTURE.md`。

下列事实已在代码与架构说明中同步：

- 窗口 `webSecurity` 现为 `true`（`sandbox: false` 仍在）。
- 播放 URL 使用 `auralis-audio://`，并校验 library root。
- 桌面歌词窗口使用最小 preload，不再暴露完整 `window.auralis`。
- 扫描与 watch 之间存在 lifecycle 互斥（pause flush）。
- 标签写回与 `user_edit` 有 suppress + source 保护策略。

---

## 8. 复评后的补充修复

首次落地完成后再次逐项评审，发现并修复以下问题：

1. `pauseFlush()` 改为异步屏障，等待已启动的 flush、缺失确认和增量导入排空；扫描 worker 只在屏障完成后启动。
2. 扫描终态仅在处理成功后结算；完成操作纳入数据库事务，message/error/exit 异常统一 fail 并幂等恢复 watcher。
3. 播放统计结果增加 `recorded`，幂等重试不再发送虚假的 `play-stats-updated`。
4. `AppSidebar.vue` 跳过播放统计事件，避免无意义地重算歌单统计。
5. 桌面歌词使用独立 `DesktopLyricsApi` 类型与 renderer client，类型检查不再假定其拥有完整 API。
6. `docs/ARCHITECTURE.md` 已同步音频协议、双 preload 和 `webSecurity: true`，本文也已加入 Git 跟踪例外。
7. 回滚 `PlayerBar.vue` 中与本轮目标无关的专辑强调色和音量条配色改动。

补充修复后再次通过 `typecheck`、`lint`、`build` 和 `git diff --check`。

---

## 9. 结论

本轮按 review 落地顺序，用 5 个并行子智能体覆盖了 **正确性（歌单顺序、user_edit、扫描竞态、ISRC）**、**安全（音频协议、webSecurity、歌词窗权限面）** 与 **性能（曲库无谓重载、歌词单例、桌面歌词 IPC、智能歌单缓存）** 三类最高收益项。

`typecheck` / `lint` / `build` 已通过。建议在真实曲库上完成第 4.3 节手测后再合入主开发分支。
