# TECHDOC：专辑详情页本地分类兜底画廊

- **文档状态**：方案就绪 / 待其他 Session 实施
- **设计日期**：2026-09-16
- **目标模块**：专辑详情数据契约、专辑聚合与详情页底部画廊
- **风险等级**：常规（扩展既有 Typed IPC 响应与 Renderer 业务逻辑；不新增通道、请求字段、数据库迁移或文件写入）
- **核心目标**：当当前艺人在本地曲库中没有其他专辑时，用确定、可解释的本地分类结果替代空缺的
  “更多专辑”区域，同时保持同艺人画廊的原有优先级、入口一致性和页面稳定性。

## 1. 背景与问题定义

专辑详情页底部当前只展示“`{artist} 的更多专辑`”。数据来自当前艺人的其他本地专辑；当艺人在
曲库中只有当前作品时，整个画廊隐藏。对于曲目数较少、且没有同艺人其他作品的专辑，详情页中下部会
留下大面积空白，也失去继续浏览本地曲库的入口。

本需求不是建立推荐系统，而是为既有画廊增加一个本地分类浏览兜底：

```text
存在同艺人其他专辑
→ 继续显示“{artist} 的更多专辑”

不存在同艺人其他专辑
→ 按已确认的分类等级选择第一组非空候选

没有任何合格候选
→ 隐藏整个画廊
```

候选仅来自用户本地曲库。不得访问网络、补全外部唱片目录、推测用户偏好或记录推荐反馈。

## 2. 当前实现基线

实施前必须以施工时源码为准重新核对；本文基于 2026-09-16 工作区现状记录以下基线：

1. `src/shared/types/albumDetail.ts` 已定义 `AlbumDetailRequest`、`AlbumDetailSummary` 和
   `AlbumDetailResult`；结果目前包含当前专辑 `tracks` 与同艺人 `moreAlbums`。
2. `library:get-album-detail` 已贯通 `contracts.ts`、`api.ts`、Preload、payload validation、Library
   registrar、`LibraryService` 和 `TrackRepository`，无需新增 IPC channel。
3. `TrackRepository.getAlbumDetailTracks()` 只查询当前专辑；
   `getArtistAlbumSummaries()` 查询同艺人其他专辑。
4. 从专辑列表进入详情前，`AlbumsPage.vue` 会向 `albumDetailSnapshot.ts` 写入当前专辑、同艺人专辑与
   `catalogTracks`；直接打开或刷新详情页时由 `getAlbumDetail()` 兜底。
5. `useAlbumDetailTracks.ts` 会优先读取内存快照，缺失时调用专用详情 IPC，不应恢复使用全量
   `library.getTracks()`。
6. `AlbumDetailPage.vue` 已有完整横向专辑卡片画廊、滚轮横移、边缘 mask、封面懒加载和卡片导航。

本方案是对上述路径的增量扩展，不建立第二个画廊组件、第二条 IPC 通道或独立推荐缓存。

## 3. 已确认的产品边界

### 3.1 触发条件

- 只有同艺人其他专辑数量为 `0` 时，才启用分类兜底。
- 只要存在至少一张同艺人其他专辑，就继续显示原画廊；不得混入分类候选补足数量。
- 同艺人画廊和分类兜底互斥，一个详情页最多显示一组底部画廊。
- 候选数量不足 12 张时按实际数量展示，不重复卡片，也不进入下一等级补足。

### 3.2 本地与有效性边界

候选专辑必须：

- 来自本地数据库中 `availability = 'available'` 的曲目；
- 至少包含一首可用曲目；
- 具有有效的专辑名和专辑艺术家；
- 不等于当前专辑；
- 不使用 `Unknown Album` 或 `Unknown Artist` 身份；
- 按现有“专辑艺术家 + 专辑名”身份键去重。

合辑不做额外推断，完全采用现有 `albumArtist` 元数据。不得根据曲目艺术家猜测合辑归属，不合并名称
相似但身份键不同的专辑。

### 3.3 明确非目标

本次不增加：

- 在线搜索、流媒体或第三方元数据；
- 用户画像、机器学习、相似度模型、隐式评分或反馈历史；
- 推荐结果数据库表、迁移或持久化缓存；
- “查看更多”页面、筛选器、标签页或新的设置项；
- 推荐理由、匹配分数或算法解释 UI；
- 对专辑列表布局、Hero、路由动画、播放逻辑、搜索逻辑和纵向滚动所有权的修改。

## 4. 术语与数据模型

### 4.1 专辑身份

继续使用现有身份语义：

```ts
type AlbumIdentity = {
  albumArtist: string
  title: string
}

const key = `${albumArtist}\u0000${title}`
```

所有排除、去重和最终稳定排序都必须使用同一身份函数，不在 Main 与 Renderer 分别拼接不同格式。

### 4.2 候选摘要

将现有 `AlbumDetailSummary` 扩展为足以完成分类与排序的轻量摘要。字段名可按施工时命名惯例微调，
但语义必须完整：

```ts
export interface AlbumDetailSummary {
  title: string
  albumArtist: string
  releaseDate: string | null
  artworkCacheKey: string | null
  genres: string[]
  latestPlayedAt: string | null
}
```

- `genres` 是专辑全部可用曲目的规范化流派并集，展示标签保留首次出现时的原始大小写。
- `latestPlayedAt` 是专辑全部可用曲目中最新的非空 `lastPlayedAt`；没有播放记录时为 `null`。
- 摘要不得携带完整曲目数组。当前专辑曲目仍通过 `AlbumDetailResult.tracks` 返回。

### 4.3 画廊描述

详情结果应返回已选定的画廊，而不是让页面从数组形状猜测画廊类型：

```ts
export type AlbumDetailGalleryKind =
  | 'artist'
  | 'genre-decade'
  | 'genre-nearby-years'
  | 'decade'
  | 'genre'

export interface AlbumDetailGallery {
  kind: AlbumDetailGalleryKind
  albums: AlbumDetailSummary[]
  artist: string | null
  genre: string | null
  decadeStart: number | null
}

export interface AlbumDetailResult {
  tracks: TrackListItem[]
  gallery: AlbumDetailGallery | null
}
```

约束：

- `artist` 只在 `kind === 'artist'` 时非空。
- `genre` 只在包含流派的 kind 中非空。
- `decadeStart` 只在包含年代的 kind 中非空，值为十年起点，如 `2000`。
- `albums` 必须已经排好序并截断到最多 12 张。
- `albums.length === 0` 时必须返回 `null`，不返回空画廊对象。

若施工者为了降低当前未提交改动的冲突而暂时保留 `moreAlbums` 字段，也必须将其视为过渡兼容字段，
不能让页面同时消费 `moreAlbums` 与 `gallery` 两套真相。最终应以 `gallery` 为唯一展示契约。

## 5. 元数据规范化

### 5.1 流派拆分

流派拆分必须复用 `src/shared/utils/delimitedValues.ts` 的 `splitDelimitedValues()` 语义。不得在 SQL、
Main 和 Renderer 各自新增不同分隔符规则。

每张专辑的流派集合按以下方式产生：

1. 遍历专辑全部可用曲目；
2. 对每首曲目的 `genre` 执行共享多值拆分；
3. 同一首曲目内先按忽略大小写去重，避免 `Pop / Pop` 重复计数；
4. 跨曲目按 `toLocaleLowerCase()` 键聚合；
5. 展示标签保留第一次出现的原始文本；
6. 记录每个流派出现于多少首曲目，以及第一次出现顺序。

当前专辑的流派优先级为：出现曲目数降序，其次首次出现顺序升序。候选专辑只需要保存去重后的
`genres`；流派频次只用于选择当前专辑的标题锚点。

### 5.2 年份解析

提供一个共享的纯函数解析发行年份：

```ts
function parseReleaseYear(releaseDate: string | null): number | null
```

规则：

- 只接受字符串开头的四位年份；`2003` 和 `2003-01-01` 均解析为 `2003`；
- 必须校验为合理整数；无效、空白或缺失返回 `null`；
- 不根据文件创建时间、扫描时间或其他字段推测发行年份；
- 年代起点为 `Math.floor(year / 10) * 10`，例如 2003 对应 2000–2009。

专辑摘要的 `releaseDate` 继续沿用当前确定规则；选择器只从最终摘要解析年份，不混用不同曲目的年份。

### 5.3 最近播放时间

- 专辑最近播放时间取所有可用曲目的最大 `lastPlayedAt`。
- 无法解析或为空的值视为无播放记录，排在所有有效时间之后。
- 该字段只用于同级候选的排序，不影响是否入选。

## 6. 分类选择算法

选择逻辑必须实现为无 Vue、无 Electron、无数据库依赖的纯函数，供 Main 和 Renderer 两条入口复用。
建议位置为 `src/shared/features/albums/selectAlbumDetailGallery.ts`；若仓库不采用 `shared/features`，可置于
相邻的 `src/shared/utils/`，但不得放在 Vue 页面内部。

建议函数契约：

```ts
interface SelectAlbumDetailGalleryInput {
  current: AlbumDetailSummary
  currentGenrePriority: string[]
  candidates: AlbumDetailSummary[]
  limit?: number
}

function selectAlbumDetailGallery(input: SelectAlbumDetailGalleryInput): AlbumDetailGallery | null
```

默认 `limit` 固定为 `12`。生产调用不暴露用户设置。

### 6.1 第零级：同艺人优先

先筛选与当前 `albumArtist` 完全相同、身份键不同的专辑：

- 非空时，按现有同艺人语义排序并返回 `kind: 'artist'`；
- 返回后立即停止，不计算或混入分类候选；
- 为保持现有行为，默认排序为发行年份升序、标题稳定排序；不得借本需求擅自改为推荐排序。

### 6.2 同时具有年份和流派

按当前专辑的 `currentGenrePriority` 顺序选择“标题锚点流派”。对每一个流派依次检查以下等级；一旦某个
等级存在候选，就用该流派作为 `gallery.genre`，仅返回共享该流派的候选，确保标题描述真实：

1. **相同流派 + 同一年代**：`kind: 'genre-decade'`；
2. **相同流派 + 年份距离不超过 5 年**：`kind: 'genre-nearby-years'`。

如果所有流派在以上两级均无结果，再检查：

3. **同一年代，不限流派**：`kind: 'decade'`。

“命中即停止”同时适用于等级和锚点流派。不得从下一流派或下一等级继续补足 12 张。

### 6.3 只有流派、没有年份

按 `currentGenrePriority` 顺序查找第一种存在候选的流派：

- 候选不限制年份；
- 返回 `kind: 'genre'`；
- 只返回共享该锚点流派的专辑；
- 命中后停止，不混入其他流派。

### 6.4 只有年份、没有流派

- 选择同一年代的候选；
- 返回 `kind: 'decade'`；
- 没有候选则返回 `null`。

### 6.5 年份和流派都缺失

直接返回 `null`。不得退化为随机专辑、最近播放、最近添加或全曲库热门作品。

### 6.6 分类候选排序

分类等级内按以下顺序稳定排序：

1. 与当前专辑共享的流派数量降序；
2. 双方年份都有效时，发行年份绝对距离升序；无法计算距离的候选排后；
3. `latestPlayedAt` 降序；无播放记录排后；
4. 专辑标题按项目现有 locale/sensitivity 语义排序；
5. 专辑艺术家稳定排序；
6. 专辑身份键作最终兜底。

排序完成后截取前 12 张。排序函数不得修改调用方数组。

## 7. 单一算法与双数据入口

### 7.1 从专辑列表进入

`AlbumsPage.vue` 已拥有完整本地曲库快照。点击专辑时：

1. 使用现有 `groupAlbums()` 聚合专辑；
2. 将当前专辑和全部候选转换成共享选择器所需的轻量摘要；
3. 调用唯一的 `selectAlbumDetailGallery()`；
4. 将结果连同当前专辑曲目写入 `albumDetailSnapshot.ts`；
5. 详情页首帧直接使用该快照，不等待额外 IPC。

不得为了这个画廊在点击时再次调用 `library.getTracks()`。不得等待分类计算后才开始路由动画；对当前
曲库规模应使用已有内存数据同步完成，若实际性能录制显示超出单帧预算，再另行设计列表期缓存，不能先
引入固定延时。

### 7.2 直接打开、刷新或快照失效

`LibraryService.getAlbumDetail()` 继续作为唯一冷入口：

1. 查询当前专辑完整 `TrackListItem[]`；
2. 构建当前专辑摘要与流派优先级；
3. 查询同艺人其他专辑；
4. 同艺人结果非空时直接构造 `artist` 画廊，不查询分类候选；
5. 同艺人结果为空时，查询轻量本地候选摘要并调用同一个共享选择器；
6. 一次返回 `tracks + gallery`。

不得在 Renderer 冷入口获取完整曲库后再分类。IPC 响应只传当前专辑曲目和最多 12 张最终画廊摘要。

### 7.3 Repository 查询建议

保留现有 `getAlbumDetailTracks()`。将同艺人摘要查询补齐 `genres` 与 `latestPlayedAt`，或由 Service 使用
轻量行聚合这些字段。

分类候选建议新增 Repository 查询，返回“专辑身份 + 原始 genre + 汇总字段”的轻量行，而不是
`TrackListItem[]`。示意：

```ts
interface AlbumBrowseCandidateRow {
  albumArtist: string
  title: string
  releaseDate: string | null
  artworkCacheKey: string | null
  rawGenre: string | null
  latestPlayedAt: string | null
  firstTrackId: number
}
```

SQL 应：

- 只读 `library_track_display`；
- 限定 `availability = 'available'`；
- 排除当前身份与 Unknown 身份；
- 按专辑身份和原始 `genre` 分组，以保留共享拆分器处理多值流派的能力；
- 使用确定的 `MIN(release_date)`、`MIN(NULLIF(artwork_cache_key, ''))`、`MAX(last_played_at)` 与
  `MIN(id)`；
- 不使用不安全的 `GROUP_CONCAT` 再按逗号拆分，因为流派字段本身可能包含多值分隔符；
- 不新增数据库索引或迁移，除非实际查询计划与基线证明有必要；索引必须另行评估。

Service 将同一专辑的多条 rawGenre 行折叠为一个 `AlbumDetailSummary`，再调用共享选择器。由于这些行只在
Main 内部流转，不得加入 IPC contract。

### 7.4 结果一致性

以下入口对同一数据库状态必须得到相同的 `gallery.kind`、标题参数、顺序和前 12 张身份：

- 专辑列表点击进入；
- 刷新详情页；
- 直接打开详情路由；
- 从底部画廊打开另一张专辑。

一致性由共享选择器保证。测试不得只分别断言“都有结果”，必须比较完整身份序列。

## 8. 快照与生命周期

### 8.1 快照结构

`AlbumDetailSnapshot` 应保存 `gallery: AlbumDetailGallery | null`，替代仅表达同艺人的 `moreAlbums`。
`catalogTracks` 是否继续保留由施工时现状决定；若保留，它只作为列表来源的快速数据，不是第二套画廊
真相。

### 8.2 从画廊继续导航

当前 `openAlbum()` 不能简单把“当前画廊去掉被点击项”写成下一专辑的画廊，因为下一专辑可能：

- 属于另一个艺人；
- 拥有自己的同艺人其他作品；
- 命中不同流派或年代等级；
- 应使用完全不同的标题参数和排序。

正确行为：

- 有 `catalogTracks` 时，为目标专辑重新调用共享选择器并写入完整目标快照；
- 没有完整 catalog 时，只写目标专辑的可用预览字段，目标路由调用 `getAlbumDetail()` 获取真实画廊；
- 不复用上一张专辑的 `gallery` 数组作为下一张专辑的结果。

### 8.3 稳定性与失效

- 页面打开后，画廊身份与顺序保持稳定。
- `play-stats-updated` / `play-stats-reset` 可以刷新当前专辑播放统计，但不得实时重排当前画廊。
- 曲库扫描、曲目可用性或元数据发生结构性变化时，使快照失效；当前专辑数据按既有逻辑刷新，但画廊
  的新顺序在下次进入该详情页时生效，避免用户正在浏览时卡片跳位。
- 当前专辑在结构性变化后不存在时，继续进入既有 `not-found` 状态，不保留陈旧画廊。

不得新增持久化缓存。模块级快照与页面生命周期足以满足个人本地应用的需求。

## 9. Renderer 展示契约

### 9.1 单一画廊视图模型

将页面当前的 `moreAlbumsByArtist` 语义收敛为通用视图模型，例如：

```ts
const albumGallery = computed(() => detailGallery.value)
const showAlbumGallery = computed(() => Boolean(albumGallery.value?.albums.length))
```

现有 `.album-more-gallery*` CSS 类可继续复用，避免无价值的样式重命名；脚本变量、aria 和文案不能继续
假设所有卡片都属于当前艺人。

### 9.2 标题与 i18n

Renderer 根据 `gallery.kind` 和参数选择 i18n key，不接收 Main 返回的已本地化字符串。

简体中文文案固定为：

| kind                 | 标题                             |
| -------------------- | -------------------------------- |
| `artist`             | `{artist} 的更多专辑`            |
| `genre-decade`       | `曲库中的 {decade} 年代 {genre}` |
| `genre-nearby-years` | `曲库中的相近年份 {genre}`       |
| `decade`             | `曲库中的 {decade} 年代作品`     |
| `genre`              | `曲库中的 {genre}`               |

`decade` 参数传十年起点数字，例如 `2000`；文案负责组合为“2000 年代”。英文 locale 必须补齐语义对应的
标题与 aria 文案，不能回退到中文或复用不准确的 `More albums by {artist}`。

### 9.3 卡片与交互

- 继续复用现有卡片尺寸、横向间距、mask 和 scroll snap。
- 最多 12 张；不足时不拉伸、不重复。
- 封面继续 `loading="lazy"`、`decoding="async"`。
- 点击行为与原画廊一致，进入目标专辑详情。
- `aria-label` 使用与可见标题相同的分类语义。
- 不新增空状态；`gallery === null` 时不渲染 section、分隔线或占位高度。
- 不改 Hero、曲目列表与 PlayerBar 的 DOM 或层级。

## 10. Typed IPC 施工范围

继续使用现有 `library:get-album-detail`，请求结构不变：

```ts
{
  albumArtist: string
  albumTitle: string
}
```

需要更新的契约链路：

1. `src/shared/types/albumDetail.ts`：摘要与 gallery 类型；
2. `src/shared/ipc/contracts.ts`：自动引用更新后的 `AlbumDetailResult`，通常无需改通道条目形状；
3. `src/shared/ipc/api.ts`：继续从 contract 推导，不重复声明；
4. `src/preload/index.ts`：方法签名和通道不变，通常无需逻辑修改；
5. `src/main/ipc/registerLibraryIpcHandlers.ts`：注册方式不变；
6. `LibraryService` / `TrackRepository`：构建新的结果；
7. Renderer composable、snapshot 与页面：消费 `gallery`。

请求 payload 没有新增字段，因此现有 payload validator 可保持不变；仍需确认 channel coverage 测试通过。
不得因为响应类型变化而新增 generic invoke、绕过 Preload 或削弱 sender/trusted URL 校验。

## 11. 建议文件范围

| 文件或模块                                                              | 计划改动                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `src/shared/types/albumDetail.ts`                                       | 扩展摘要，新增 gallery kind 与结果结构         |
| `src/shared/features/albums/selectAlbumDetailGallery.ts`                | 新增唯一纯选择器、年份和稳定排序逻辑           |
| `src/shared/features/albums/selectAlbumDetailGallery.test.ts`           | 分类等级、标题参数、排序、缺失元数据与上限测试 |
| `src/main/repositories/trackRepository.ts`                              | 同艺人摘要补充字段；新增轻量分类候选查询       |
| 相邻 Repository 测试（以当前测试组织为准）                              | SQLite 隔离数据下验证可用性、身份、汇总字段    |
| `src/main/services/libraryService.ts`                                   | 冷入口构建摘要并调用共享选择器                 |
| 相邻 LibraryService 测试（以当前测试组织为准）                          | 同艺人短路、分类兜底及响应一致性               |
| `src/renderer/features/albums/albumDetailSnapshot.ts`                   | 快照保存通用 gallery                           |
| `src/renderer/features/albums/utils/albumGrouping.ts`                   | 提供从内存 Track/AlbumSummary 到共享摘要的适配 |
| `src/renderer/features/albums/pages/AlbumsPage.vue`                     | 点击时计算目标 gallery 并写入快照              |
| `src/renderer/features/albums/composables/useAlbumDetailTracks.ts`      | 合并快照/IPC gallery，保持页面期顺序稳定       |
| `src/renderer/features/albums/composables/useAlbumDetailTracks.test.ts` | 快照、冷入口、失效、播放统计不重排             |
| `src/renderer/features/albums/pages/AlbumDetailPage.vue`                | 通用标题、aria、渲染与目标导航                 |
| `src/renderer/locales/zh-Hans.json`、`src/renderer/locales/en.json`     | 新增五类标题和 aria 文案                       |

路径是设计意图，不要求施工者机械创建所有测试文件。若当前仓库已有更相邻的测试位置，应复用现有组织。

默认不修改：

- `src/shared/ipc/channels.ts`；
- `src/main/ipc/ipcPayloadValidation.ts` 的请求策略；
- 数据库 schema 与 migrations；
- `src/renderer/App.vue`、路由、动画、Hero、PlayerBar；
- 专辑列表视觉布局和滚动结构。

## 12. 实施顺序

### Step 1：建立共享类型与纯选择器

1. 定义 gallery discriminated union/descriptor。
2. 实现流派规范化、年份解析、身份排除和稳定排序。
3. 先用纯单元测试锁定所有等级与“首个非空即停止”。
4. 确认输入数组不被原地修改。

### Step 2：扩展 Main 冷入口

1. Repository 生成同艺人摘要与轻量分类候选行。
2. Service 先查询当前专辑与同艺人；同艺人非空时短路。
3. 只有需要兜底时才查询分类候选。
4. Service 调用共享选择器并返回 `tracks + gallery`。
5. 保持既有 IPC channel、请求验证与 Preload 能力不变。

### Step 3：扩展列表快照入口

1. 从现有 `catalogTracks` 构建与 Main 等价的摘要输入。
2. 使用同一个选择器生成目标 gallery。
3. 更新 snapshot schema，不保留歧义的 `moreAlbums` 第二真相。
4. 保证点击后不新增 IPC，也不推迟路由动画。

### Step 4：收敛详情 composable

1. 详情状态同时持有当前专辑 tracks 与通用 gallery。
2. 快照存在时同步提交首屏；冷入口使用 IPC 结果。
3. 播放统计后台刷新只更新当前专辑所需字段，不替换当前页面 gallery 顺序。
4. 结构性曲库变化使快照失效；下一次进入重新选择。

### Step 5：更新页面文案与导航

1. 页面根据 kind 选择标题和 aria。
2. 复用现有画廊 DOM/CSS，不增加第二套布局。
3. 修正从画廊进入下一专辑时的目标快照计算。
4. 补齐中英文 locale。

## 13. 验证计划

本节是其他 Session 获得施工授权后的建议，不是本 TECHDOC 编写任务自动触发的命令清单。按仓库轻量
验收规则选择最小充分验证，不默认运行 smoke、完整测试或完整构建。

### 13.1 纯选择器定向测试

至少覆盖：

1. 同艺人存在时优先返回 `artist`，不混入分类候选；
2. 同艺人只有一张时也停止，不为凑数放宽；
3. `genre-decade` 命中；
4. 第一级为空后命中 `genre-nearby-years`；
5. 前两级为空后命中 `decade`；
6. 只有 genre 时命中 `genre`；
7. 只有 year 时命中 `decade`；
8. year/genre 均缺失时返回 `null`；
9. 多值流派、大小写、重复值和多曲目频次；
10. 标题锚点流派与所有返回卡片真实匹配；
11. Unknown、当前专辑、不可用与重复身份被排除；
12. 共享流派数、年份距离、最近播放、标题、艺人与身份键的完整排序链；
13. `latestPlayedAt = null` 排后；
14. 结果最多 12 张，输入数组未被修改；
15. 候选只有一张时返回一张，不进入下一等级。

### 13.2 Main 数据测试

使用隔离 SQLite 数据，不能操作用户真实曲库：

- Repository 只返回 `available` 专辑；
- 同一专辑多种原始 genre 正确汇总；
- `releaseDate`、`artworkCacheKey`、`latestPlayedAt` 聚合确定；
- 同艺人非空时 Service 不执行分类候选查询；
- IPC 结果只包含当前 tracks 与最多 12 张摘要，不传整库 tracks；
- 现有 payload validation channel coverage 继续通过。

### 13.3 Renderer 定向测试

- 列表快照入口和冷 IPC 入口产生同一身份序列；
- `gallery === null` 时 section 与分隔线均不渲染；
- 五种 kind 选择正确 i18n key 与参数；
- 点击分类卡片不会把上一专辑 gallery 错写给目标专辑；
- 播放统计事件不实时重排当前画廊；
- 结构性曲库事件使下一次进入重新计算。

### 13.4 人工验收

只检查本功能实际影响的详情页状态：

1. 有多张同艺人专辑：标题、顺序和现有交互保持不变；
2. 单一艺人作品且有同年代同流派候选：显示对应分类标题；
3. 逐级准备数据验证第二、第三等级；
4. 缺年份、缺流派、两者都缺失；
5. 候选 1 张、少于 12 张、超过 12 张；
6. 从列表进入、刷新、直接打开、点击底部卡片连续进入；
7. 画廊滚轮、mask、封面懒加载与键盘焦点保持可用；
8. 页面停留期间播放歌曲，卡片不跳位。

Electron smoke 默认不运行；该功能不修改应用启动、窗口创建或 Preload capability。只有施工实际改动了
这些边界，或定向验证无法发现接线问题时，才升级验证范围。

## 14. 性能约束

- 列表入口复用已有内存快照，不新增全量 IPC。
- 冷入口不向 Renderer 传输完整曲库；最终候选摘要最多 12 张。
- 同艺人结果非空时必须短路分类候选查询。
- 分类选择器复杂度目标为 `O(n log n)` 以内，其中排序只对当前等级候选执行。
- 不在 computed/render 循环中反复 group 全曲库；对一次详情导航最多构建一次候选摘要和一次 gallery。
- 不因候选变化触发 Hero Canvas、调色板或路由动画重建。
- 不添加固定 timeout、debounce 来掩盖计算时间。

如真实大型曲库下 Main 候选摘要查询产生可感知延迟，应先记录查询计划和耗时，再单独评估进程内、按曲库
generation 失效的专辑摘要缓存；不得在本任务中直接增加持久化推荐缓存或数据库迁移。

## 15. 风险与控制

| 风险                        | 控制措施                                                     |
| --------------------------- | ------------------------------------------------------------ |
| 列表入口与冷入口结果不同    | 共享唯一纯选择器；测试比较完整身份序列                       |
| 分类标题与卡片实际流派不符  | 以锚点流派限定候选；命中后不混入其他流派                     |
| `GROUP_CONCAT` 破坏多值流派 | Repository 返回 rawGenre 分组行，统一用共享拆分器            |
| 点击下一专辑复用错误画廊    | 有 catalog 时重新选择；无 catalog 时走目标专辑 IPC           |
| 播放统计导致卡片实时换位    | 页面期冻结 gallery；新排序下次进入生效                       |
| 冷入口重新传输全曲库        | IPC 只返回当前 tracks 与最多 12 张摘要                       |
| 功能膨胀为推荐系统          | 禁止在线数据、画像、评分、反馈、推荐表和随机兜底             |
| 当前未提交改动发生冲突      | 施工前检查 diff，基于现状增量修改，不回退其他 Session 的工作 |

## 16. Definition of Done

- 同艺人其他专辑存在时，原“`{artist} 的更多专辑`”行为保持不变；
- 同艺人结果为空时，严格按分类等级返回第一组非空候选；
- 不跨等级、流派或条件补足 12 张；一张候选也可独立展示；
- 分类标题参数与所有展示卡片的实际范围一致；
- 当前专辑、Unknown、不可用和重复专辑不会出现；
- 排序满足共享流派、年份距离、最近播放和稳定兜底链；
- 列表、刷新、直接路由和画廊连续导航的结果一致；
- 页面停留期间播放统计变化不会导致卡片跳位；
- 无候选时 section、分隔线和占位高度完全隐藏；
- 最多展示 12 张，复用现有横向画廊和卡片交互；
- 不调用全量 `getTracks()`，不新增 IPC channel、数据库迁移、在线请求或推荐持久化；
- 定向选择器、Main 数据与 Renderer 状态测试按实际修改范围通过；
- 人工确认有同艺人、各兜底等级、无候选和连续导航场景；未进行的视觉检查如实记录；
- 不修改 Hero、路由动画、PlayerBar、专辑列表布局或纵向滚动所有权。

本 TECHDOC 只定义后续 Session 的施工边界与验收口径。本轮仅写文档，不修改应用源码，也不声明该功能
已经实现。
