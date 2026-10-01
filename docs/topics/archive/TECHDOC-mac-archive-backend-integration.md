# Mac 声迹页面：后端接入施工方案

日期：2026-10-01。状态：源码审查完成，施工待执行。

本方案为另一个施工 Agent 提供明确的后端任务。完成每日专辑 Top5 查询、类型化 IPC 和验证，再把已实现的契约交给前端。第一阶段覆盖每日专辑统计与专辑播放所需数据。

## 1. 交付目标与职责

后端提供 `auralis.archive.getDailyAlbumStats(date)`，返回指定本地日期最多五张专辑。每项包含显示信息、统计值、封面缓存键、可用于现有播放查询的专辑标识，以及是否存在可用曲目。

前端负责独立声迹页面、Mac/CRT/舞台、日期菜单、拖放和动画；后端施工负责 `src/main`、`src/shared`、`src/preload` 与对应测试。本文中的前端调用示例用于约束交接契约，前端代码由后续施工执行。

复用现有能力：

| 能力 | 直接复用的入口 | 责任 |
| --- | --- | --- |
| 年度日期记录 | `archive.getListeningHeatmap(year)` | 主进程返回实际记录；前端补齐全年日期和空白日 |
| 每日专辑 Top5 | 新增 `archive.getDailyAlbumStats(date)` | 主进程完成聚合、排序、身份与可播放性判断 |
| 专辑封面 | `artworkCacheKey` + `getArtworkUrl()` | 主进程沿用 `auralis-artwork` 协议；前端加载、降色和兜底 |
| 专辑完整曲目 | `playback.getAlbumTracks(albumKey)` | 主进程返回当前可用曲目及既有排序 |
| 实际播放 | `usePlayback().playTrackFromQueue()` | 前端复用全局播放控制器 |
| 统计更新通知 | `library.onChanged()` | 前端订阅统计变化并刷新；后端沿用现有通知 |

本次施工不需要数据库迁移，不增加后端播放命令，不复制音频引擎。新增查询经过现有受信发送方校验和 payload 校验链路。

## 2. 源码审查结论

本次审查基于工作区当前源码，包含已有未提交修改。以下是接入能力与源码可证明的缺口；未进行真实曲库或整机视觉验收。

### 2.1 统计基础已齐备

- `src/main/services/playStatsService.ts` 的 `recordEffectivePlay()` 使用播放时间的本地日期写入统计，带 session 去重。
- `src/main/repositories/playStatsRepository.ts` 将单曲总次数、每日总次数和每日单曲统计放在同一事务中更新。
- `getListeningHeatmap()` 返回一年实际有记录的日期和全库最早记录年份。
- `getListeningRanking()` 已支持日、周、月、年以及专辑聚合。专辑排序优先播放次数，再按最近播放时间；当前最多返回 50 项。
- `src/renderer/features/archive/composables/useArchiveCanvasData.ts` 已将每日专辑排行截取为五项，处理年份与日期请求过期。

统计中的 `durationSeconds` 是有效播放记录累加的曲目时长，沿用现有口径，不是精确采集的实际收听秒数。新接口直接使用已存储的值。

### 2.2 现有排行缺少可直接播放的身份

`ListeningRankingItem` 只有 `key/title/artist/artworkCacheKey/playCount/durationSeconds`。专辑排行将缺失标题和艺术家分别展示为“未知专辑”“未知艺术家”；播放查询按 `library_track_display` 中的专辑标题和有效专辑艺术家匹配。

因此，前端不能把展示兜底文案当成专辑身份，也不能靠拆开排行 `key` 还原身份。元数据为空时，展示值与查询条件不同。

现有 key 使用 `album + '::' + artist`，存在可构造的碰撞：`['A::B', 'C']` 与 `['A', 'B::C']` 都产生 `A::B::C`。两张专辑可能被前端当成同一项。新接口使用结构化标识和 JSON 元组键；旧接口及其消费者保持兼容。

### 2.3 历史记录和可播放性需要分开表达

现有专辑排行聚合未过滤 `availability`，所以文件被标为 missing 后，历史播放仍出现在排行里。`TrackRepository.getAlbumTracks()` 只返回 `availability = 'available'` 的曲目。

新接口保留历史统计，并给出 `canPlay`。专辑全部 missing 时仍展示排行，播放操作禁用。`canPlay` 反映查询时的数据库状态；实际装入时再次调用专辑曲目查询，随后沿用现有音频播放错误处理。

### 2.4 现有播放与封面入口可以复用

`LibraryService.getAlbumTracks()` 返回 `RandomAlbumTracksResult | null`，其中曲目已经按碟号、曲号、标题、ID 排序。返回的 `PlaybackTrackDto` 与前端 `PlaybackTrack` 字段兼容。

`usePlayback()` 持有全局控制器；页面进入或退出无需创建、销毁另一份播放状态。主进程负责查询曲目，播放行为仍由该控制器协调。

封面使用 `auralis-artwork://<cacheKey>`。现有协议校验缓存键、限制缓存目录并提供 CORS 响应，支持 Canvas 处理。新统计响应只返回缓存键，封面文件缺失由前端显示兜底。

### 2.5 日期校验分为两层

`ipcPayloadValidation.ts` 的 `dateKey` 校验 `YYYY-MM-DD` 形式；`PlayStatsService` 的 `isValidDateKey()` 校验真实日历日期。现有测试明确允许 `2026-02-30` 通过结构校验，再由 Service 拒绝。

新增接口按这套层次接入：IPC 检查结构，Service 检查日历有效性、1970 年下界与未来日期。保留旧接口校验行为。

### 2.6 本次运行证据

已运行：

```powershell
npx vitest run src/main/services/playStatsService.test.ts src/main/ipc/ipcPayloadValidation.test.ts src/main/ipc/validatedIpcRegistrar.test.ts
```

结果：3 个文件、28 项测试通过。它们验证现有日期规则、payload 与发送方校验。新增查询尚未实现，因此本次没有其 SQL、IPC 或真实播放运行证据。施工阶段按第 7 节补齐。

## 3. 固定数据契约

在 `src/shared/types/archive.ts` 增加以下类型，名称与字段按本文执行：

```typescript
export interface ArchiveAlbumKey {
  albumArtist: string
  album: string
}

export interface DailyAlbumStatsItem {
  key: string
  albumKey: ArchiveAlbumKey | null
  title: string | null
  artist: string | null
  artworkCacheKey: string | null
  playCount: number
  durationSeconds: number
  canPlay: boolean
}

export interface DailyAlbumStats {
  date: string
  items: DailyAlbumStatsItem[]
}
```

字段语义：

- `date`：请求的本地日历日期，严格 `YYYY-MM-DD`。
- `title`：视图中的专辑标题，空字符串转换为 `null`。
- `artist`：有效专辑艺术家，先取非空 `album_artist`，再取 `artist`；最终空字符串转换为 `null`。
- `albumKey`：当 `title` 和 `artist` 均非空时，为 `{album: title, albumArtist: artist}`；否则 `null`。保留原始非空字符串，包括空格、大小写和分隔符，不 trim 或自行拆分艺术家。
- `key`：`JSON.stringify([title, artist])`，用于该数据快照中的项目身份。它不是永久数据库 ID，元数据变更后可变化。播放直接使用 `albumKey`。
- `artworkCacheKey`：沿用现有聚合策略 `MAX(display.artwork_cache_key)`，无封面为 `null`。
- `playCount/durationSeconds`：当日该组所有单曲记录的累计值。
- `canPlay`：`albumKey` 非空，并且当前库中该专辑至少有一首 `available` 曲目。
- `items`：已排好序的 0～5 项；空日期为 `[]`，属于成功响应。

展示兜底由前端提供“未知专辑”“未知艺术家”。缺失字段形成的分组，与字面值就是“未知专辑”或“未知艺术家”的专辑分开。多个都缺少相同身份字段的记录会合并在同一未知组，沿用当前以元数据分组的模型。

统计按当前 `library_track_display` 的元数据显示，不建立历史元数据快照。被硬删除的曲目受现有外键级联规则影响；本阶段保留该行为。

## 4. 按顺序施工

### 步骤 1：检查施工基线

执行 `git status --short`，阅读实际修改文件。当前 `trackRepository.ts`、`registerIpcHandlers.ts`、`ipcPayloadValidation.ts`、shared IPC 文件和 preload 存在其他任务的修改。保留它们，在当前内容上补充本次能力。

读取项目施工、IPC、曲库和验证规则。随后按步骤执行。业务实现局限于本节列出的目标和必要测试；前端视图与 Demo 继续由前端施工处理。

### 步骤 2：增加类型与 IPC 契约

1. 在 `src/shared/types/archive.ts` 增加第 3 节三个类型。
2. 在 `src/shared/ipc/contracts.ts` 导入 `DailyAlbumStats` 并增加：

   ```typescript
   'archive:get-daily-album-stats': {
     request: { date: string }
     response: DailyAlbumStats
   }
   ```

3. 在 `src/shared/ipc/channels.ts` 的 `archive` 下增加 `getDailyAlbumStats: 'archive:get-daily-album-stats'`。
4. 在 `src/shared/ipc/api.ts` 的 `archive` API 下，仿照 `getDailyListeningDetail`，使用 `Req/Result` 派生入参与返回类型。
5. 在 `src/preload/index.ts` 的 `archive` 暴露 `getDailyAlbumStats: (date) => invoke(ipcChannels.archive.getDailyAlbumStats, { date })`。

这一组修改只增加显式方法，不改变现有 API 的名称与响应。

### 步骤 3：实现 Repository 查询

在 `src/main/repositories/playStatsRepository.ts` 增加 `getDailyAlbumStats(date: string): DailyAlbumStatsItem[]`。类型从 shared 导入。使用参数绑定，一次 SQL 返回 Top5 聚合与可播放判断。

按以下 SQL 结构实现；实际别名可与局部 TypeScript 行类型一致：

```sql
WITH album_stats AS (
  SELECT
    NULLIF(display.album, '') AS title,
    NULLIF(COALESCE(NULLIF(display.album_artist, ''), display.artist), '') AS artist,
    MAX(display.artwork_cache_key) AS artworkCacheKey,
    SUM(stats.play_count) AS playCount,
    SUM(stats.duration_seconds) AS durationSeconds,
    MAX(stats.last_played_at) AS lastPlayedAt
  FROM daily_track_play_stats stats
  JOIN library_track_display display ON display.id = stats.track_id
  WHERE stats.play_date = ?
  GROUP BY
    NULLIF(display.album, ''),
    NULLIF(COALESCE(NULLIF(display.album_artist, ''), display.artist), '')
), top_albums AS (
  SELECT * FROM album_stats
  ORDER BY playCount DESC, lastPlayedAt DESC,
           title COLLATE BINARY ASC, artist COLLATE BINARY ASC
  LIMIT 5
)
SELECT top_albums.*,
  CASE WHEN title IS NOT NULL AND artist IS NOT NULL AND EXISTS (
    SELECT 1 FROM library_track_display playable
    WHERE playable.availability = 'available'
      AND playable.album = top_albums.title
      AND COALESCE(NULLIF(playable.album_artist, ''), playable.artist) = top_albums.artist
  ) THEN 1 ELSE 0 END AS canPlay
FROM top_albums
ORDER BY playCount DESC, lastPlayedAt DESC,
         title COLLATE BINARY ASC, artist COLLATE BINARY ASC
```

实现要求：

1. 主聚合包括 missing 曲目的历史统计；EXISTS 判断专辑当前全部曲目，允许当日没播过的 available 曲目使专辑可播放。
2. 次数优先、最近播放时间次之，标题和艺术家的二进制顺序补足稳定排序。旧排行只按前两项排序；新接口在完全并列时提供确定顺序。
3. 将 SQLite `canPlay` 的 0/1 映射为 boolean。
4. 在 TypeScript 映射阶段生成 `albumKey` 与 JSON 元组 `key`；响应去掉内部 `lastPlayedAt`。
5. 保持 SQL 聚合为有界查询，响应最多五项。直接复用现有表、视图与日期索引，不加载全库到 Renderer。
6. 查询、可播放判断都使用当前视图元数据，保证 identity 与 `TrackRepository.getAlbumTracks()` 匹配。

### 步骤 4：实现 Service 校验

在 `PlayStatsService` 增加 `getDailyAlbumStats(date: string): DailyAlbumStats`：

1. 复用当前文件内的 `isValidDateKey(date)`，无效时抛 `Date must use the YYYY-MM-DD format`。
2. 对合法日期检查年份至少为 1970，否则抛 `Date must be on or after 1970-01-01`。
3. 使用 `formatDateKey(new Date())` 得到机器本地今天；请求晚于今天时抛 `Date must not be in the future`。
4. 校验成功后返回 `{date, items: this.playStatsRepo.getDailyAlbumStats(date)}`。

请求要求显式日期，不提供隐式默认日期。今天由前端初始化选择；主进程只校验和查询。使用本地日期规则，避免通过 `toISOString().slice(0, 10)` 产生 UTC 日期偏移。

### 步骤 5：注册受校验 IPC

1. 在 `ipcPayloadValidation.ts` 的 policy map 增加：

   ```typescript
   [ipcChannels.archive.getDailyAlbumStats]: required(
     objectShape({ date: field(dateKey) }),
   ),
   ```

2. 在 `registerPlaybackArchiveIpcHandlers.ts` 的 `PlayStatsOperations` Pick 中加入 `getDailyAlbumStats`。
3. 在相同文件通过 `registrar.handle()` 注册该方法，payload 类型从 Service 参数或契约派生，将 `payload.date` 交给 Service。
4. 沿用 `registerIpcHandlers.ts` 当前装配的 validated registrar。现有 Service 实例已注入该注册函数，预计无需改 composition root。
5. 查询只读，不发送 `library:changed`。有效播放记录与重置统计继续沿用原有通知。

## 5. 日期、封面与刷新交接

这些规则写入后端交付报告，供前端施工直接执行：

- 初始日期为机器本地今天。
- 日期范围与热力图复用：已有 `getListeningHeatmap(year)` 提供记录和 `firstRecordedYear`；前端补齐日期，并允许选择没有记录的历史日期。空白日期查询返回空列表。
- 年份范围从最早记录年份到当前年份；没有记录时仅当前年份。日历生成和切换属于前端能力，本次不增加重复年份接口。
- 前端只请求当前日期 Top5；专辑完整曲目在确认装入时按需获取。
- 数据库给出的 nullable 元数据在 UI 层生成兜底文字，用 `textContent` 或 Vue 插值呈现。前端不解析 `key`。
- 封面通过 `getArtworkUrl(item.artworkCacheKey)` 生成现有协议 URL。缺失或加载失败保留文字和统计，封面显示兜底；Canvas 降色前设置适当跨域加载方式。
- 快速切日期时前端使用请求序号，只提交最新日期响应。页面离开时使请求失效并解除订阅。
- 订阅 `library.onChanged()` 的统计更新、统计重置与会改变曲目/元数据的事件，刷新当前数据并保留日期。具体事件列表由前端检查 shared 的现有类型后实现。
- Mac 整机/屏幕视角切换保留统计页与日期，日期变化再切换 Top5；已开始播放的队列沿用全局播放状态。

## 6. 真实播放调用边界

后端返回可定位的专辑，前端按以下顺序完成装入播放：

```typescript
// Renderer；后续前端施工使用此调用顺序。
if (!item.albumKey || !item.canPlay) return
const result = await auralis.playback.getAlbumTracks(item.albumKey)
if (!result?.tracks.length) {
  // 显示“该专辑当前没有可播放曲目”，保留原播放队列。
  return
}
await playback.playTrackFromQueue(result.tracks, result.tracks[0].id)
```

“第一首”指现有专辑曲目排序中的第一首 available 曲目，不是当天听得最多的一首。多碟专辑按碟号、曲号排序；没有编号的曲目沿用现有后置与标题/ID 排序。

此次调用保留播放器当前 playbackMode，指定起始曲目为第一首。若用户以后要求整张专辑强制顺序播放，再由产品需求单独确定模式行为。

动画结束和数据响应都需要前端操作 token：取消装入、退出页面或被新操作替代后，旧查询结果不能触发新播放。实际进入播放控制器后，播放并发与资源租约继续由现有控制器处理。

`playTrackFromQueue()` 返回 Promise<void>；前端按共享播放状态判断成功与错误，不把 Promise 完成或托盘动画完成等同于声音已开始。后端本次不修改播放引擎、租约或音频 IPC。

## 7. 施工验证

### 7.1 Service 单元测试

扩展 `src/main/services/playStatsService.test.ts` 的 Repository mock，并新增测试：

1. 合法日期原样调用 Repository，并包装 `{date,items}`。
2. 无记录返回 `items: []`。
3. 格式错误、`2026-02-30`、非闰年的 2 月 29 日被拒绝。
4. 固定系统时间后，合法闰日、1970-01-01、今天通过；1969-12-31 和明天拒绝。
5. 拒绝输入时 Repository 没有被调用。固定时间测试结束后恢复时间。

### 7.2 Repository 原生测试

新增 `src/main/repositories/dailyAlbumStats.native.test.ts`。仿照现有 `albumGenreRecommendations.native.test.ts` 使用 Electron ABI 的 better-sqlite3、`:memory:` 数据库、`migrateDatabase()` 和测试轨道。结束后关闭数据库。

使用真实 Repository 查询与 `LibraryService.getAlbumTracks()` 验证：

1. 同一专辑多首、多次播放合并；另一日期的记录不进入查询。
2. 大于五个组只返回五项，次数、最近播放时间和完全并列排序符合第 4 节。
3. 同名不同艺术家保持分开；有 album_artist 时优先它，没有时使用 artist。
4. `['A::B','C']` 与 `['A','B::C']` 产生不同 key 和不同 albumKey，曲目查询各自命中。
5. 空值、空字符串与字面“未知专辑/未知艺术家”的分组符合契约，null 身份 `canPlay=false`。
6. 全部 missing 的专辑仍有统计且不可播放；当日仅 missing 曲目有播放记录、但同专辑另有 available 曲目时 `canPlay=true`。
7. 可播放项目的 albumKey 可直接交给 LibraryService，返回第一首和完整 available 曲目，顺序包含多碟、缺失编号和相同标题场景。
8. 封面键和时长聚合正确，无封面为 null。
9. 元数据展示覆盖生效时，统计身份与播放身份一致；至少构造一例 `track_metadata` 覆盖原始专辑标题/艺术家。
10. 空日期返回空数组。

使用内存库和伪造音乐路径；SQL测试不读取音乐文件。不加载用户数据库，也不执行 resetAll() 清理真实数据。

### 7.3 IPC 测试

1. 扩展 `ipcPayloadValidation.test.ts`：合法 `{date}` 通过；缺失、非字符串、格式错误、额外属性和多余参数拒绝。保持“无效日历日期由 Service 拒绝”的现有规则。
2. 为 `registerPlaybackArchiveIpcHandlers` 增加针对新通道的测试，使用真实 `createValidatedIpcRegistrar()` 和捕获 register listener 的测试装配。
3. 可信事件和合法 payload 调用 Service；无效 payload 不调用 Service；不可信事件在 Service 前拒绝；Service 错误能传播。
4. 复用 `validatedIpcRegistrar.test.ts` 对顶层 frame、可信 URL 与窗口身份的既有测试。保持生产发送方策略不变。

### 7.4 执行命令与交付检查

```powershell
npx vitest run src/main/services/playStatsService.test.ts src/main/ipc/ipcPayloadValidation.test.ts src/main/ipc/validatedIpcRegistrar.test.ts src/main/ipc/registerPlaybackArchiveIpcHandlers.test.ts
npm run test:native -- src/main/repositories/dailyAlbumStats.native.test.ts
npm run typecheck
```

执行目标文件的 ESLint。运行前核对脚本与文件命名；新注册测试按本方案命名创建。原生 ABI 不匹配时先说明实际错误，并按项目环境规则解决；Node 下的模拟 SQL 不能替代 Electron 原生结果。

差异检查确认：旧排行契约、统计写入、热力图、播放控制器、数据库 schema、现有通知语义与已有未提交修改得到保留。测试只验证本次相关能力；不执行打包、发布或全仓格式化。

## 8. 完成条件与交付报告

交付时提供：

1. 修改文件与新方法名，实际完成的行为。
2. 每个查询边界与播放身份测试的结果，执行命令和未完成检查。
3. 一份合法有数据响应和空日期响应示例，使用测试数据。
4. 前端唯一新增调用 `auralis.archive.getDailyAlbumStats(date)`，现有封面、热力图与专辑曲目查询调用方式。
5. 已知语义：日期按本地日历、统计时长沿用现有累计口径、元数据为当前展示值、不可播放的历史专辑保留。

通过上述定向验证后，后端实现可交给前端施工。前端集成后，再按真实数据准确性、装入播放、日期请求竞态、页面退出资源释放与持续播放进行集成审查。

## 9. 给施工 Agent 的启动指令

> 读取 AGENTS.md 与本施工文档。执行第 4 节后端改动、第 7 节验证，按第 8 节交付。使用第 3 节固定契约和第 4 节聚合规则；前端由后续 Agent 接入。保留已有工作区修改。遇到源码变化使本文步骤无法执行时，先报告具体位置和冲突，不自行改统计口径、播放模式或公开接口。完成本次业务实现与测试后停止，等待审查。
