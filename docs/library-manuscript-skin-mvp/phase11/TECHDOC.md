# Phase 11 技术设计：大曲库稳定快照与分块 IPC

**日期**：2026-08-13
**前置阶段**：Phase 10 自动化回归护栏已完成
**实施线程**：主线程，不派出子代理

## 1. 背景与结论

Phase 9 已降低 Renderer 内部查找和滚动开销，Phase 10 已建立测试护栏。剩余加载链路仍是：

```text
SQLite 全量读取 → 主进程 JavaScript 拼音排序 → 单次巨型 IPC → Renderer 全量快照
```

审查确认，当前展示顺序由 `Intl.Collator('zh-Hans-u-co-pinyin')` 生成，SQLite 默认 collation 无法等价复现。同时，封面分组、全局 Enter 搜索和播放队列仍依赖完整有序快照。

因此本阶段采用安全迁移：

```text
SQLite 全量读取并保持既有排序
  → 主进程不可变 catalog snapshot
  → 稳定 cursor 分块 IPC
  → Renderer 校验并聚合完整展示快照
  → 播放继续即时使用已提交的完整展示快照
```

本阶段消除“单次巨型 IPC”，建立真实耗时诊断和后续按需分页协议；不在缺少持久化拼音排序键时强行改成 SQL keyset pagination。

## 2. 目标

1. 新增 typed、bounded、stable 的曲库 page 协议。
2. 所有页面来自同一个不可变、有序主进程快照。
3. 新快照替换旧快照后，旧 cursor 必须显式失效。
4. Renderer 必须检测 snapshot id、total count、遗漏和中途 generation 失效。
5. 播放继续使用完整聚合数组，顺序不得漂移或增加二次等待。
6. 保留全部歌曲页现有搜索、封面分组、虚拟滚动、刷新锚点和菜单行为。
7. 为 50k 受控数据建立无重复、无遗漏的自动回归。
8. 在开发环境输出 snapshot build、page slice 和 Renderer 总加载耗时。

## 3. 非目标

- 不在本阶段新增持久化拼音 sort key 或数据库迁移。
- 不使用 SQLite `OFFSET` 作为大曲库游标。
- 不让虚拟列表渲染未加载 placeholder。
- 不改变 cover grouping、搜索和 FOLIO 的全量语义。
- 不把普通/智能歌单迁移到 catalog snapshot。
- 不改变播放器内部 next/previous/repeat/shuffle 逻辑。

## 4. 协议

### 4.1 Track page

请求：

```ts
interface LibraryTrackPageRequest {
  cursor?: string
  limit?: number
  refresh?: boolean
}
```

响应：

```ts
interface LibraryTrackPage {
  snapshotId: string
  totalTracks: number
  tracks: TrackListItem[]
  nextCursor: string | null
  diagnostics: {
    snapshotBuildMs: number | null
    pageSliceMs: number
  }
}
```

约束：

- 默认 page size 500，最大 1000，最小 1。
- `refresh + cursor` 非法。
- 第一页 `refresh: true` 创建新快照。
- cursor 包含 snapshot id 和下一 offset，但对 Renderer 视为 opaque string。
- 主进程只保留一个当前快照；旧 cursor 不得静默指向新快照。

## 5. 模块职责

### Main process

`LibraryCatalogSnapshotStore`：

- 调用既有 `TrackRepository.getAll()`，保留拼音顺序。
- 冻结数组快照，生成单调 snapshot id。
- 解析和验证 cursor。
- bounded slice。
- 记录 snapshot build 与 page slice 耗时。

### Typed IPC

新增：

- `library:get-track-page`

遵循 contracts → channels → API → handler → preload 五层接线。旧 `library:get-tracks` 暂时保留，供兼容与其他主进程服务使用，但全部歌曲页不再调用它。

### Renderer

`loadLibraryCatalogSnapshot`：

- 每页最多请求 1000 首。
- 每次 await 前后检查 Phase 10 generation。
- 校验所有 page 的 snapshot id 和 total count。
- 最终校验聚合数量与 total 完全一致。
- 只有完整聚合成功后才交给 `LibraryPage` commit，避免暴露半个曲库。
- 完整聚合数组继续直接作为播放队列，避免播放前新增一次全量 IPC。

## 6. 性能诊断

开发环境在一次完整加载后输出：

- `totalTracks`
- `totalPages`
- `snapshotBuildMs`：数据库读取和既有拼音排序时间。
- `pageSliceMs`：主进程所有 slice 累计时间。
- `rendererLoadMs`：包含所有 IPC round trip 和结构化克隆的 Renderer 总耗时。

该诊断用于真实 10k/50k 曲库验收，不设置依赖机器性能的单元测试硬阈值。

## 7. 分步实施

| Step | 内容                                          | 交付物                          |
| ---- | --------------------------------------------- | ------------------------------- |
| 11.0 | 冻结全量加载、排序、搜索、cover 和 queue 基线 | TECHDOC、BASELINE               |
| 11.1 | 定义 page shared contracts                    | shared types、Typed IPC         |
| 11.2 | 实现不可变 catalog snapshot store             | main store、cursor validation   |
| 11.3 | 接入 Service、handler 和 preload              | 五层 IPC 接线                   |
| 11.4 | Renderer 分块聚合与 generation 取消           | loader utility、LibraryPage     |
| 11.5 | 后台刷新合并与播放队列保护                    | background lane、零额外播放等待 |
| 11.6 | 50k、竞态、格式和构建门禁                     | tests、DELIVERY                 |

## 8. 验收标准

1. 50,005 首受控数据遍历无重复、无遗漏、顺序一致。
2. page size 始终限制在 1–1000。
3. 新快照创建后旧 cursor 必须失败。
4. Renderer 检测 snapshot/total 改变和聚合数量不一致。
5. generation 失效后不继续请求下一页。
6. 全部歌曲页不再调用单次 `getTracks()`。
7. 双击和右键播放继续立即使用完整聚合队列；专辑播放仍只使用专辑组。
8. 普通/智能歌单行为不变。
9. `test`、`typecheck`、`lint`、`build`、diff、Prettier 和 UTF-8 全部通过。

## 9. 后续架构门槛

真正减少 Renderer 全量驻留需要同时完成：

1. 为 albumArtist/releaseDate/discNo/trackNo/id 建立可持久化、版本化的拼音排序键。
2. 让封面分组拥有服务端 group catalog，而不是依赖 Renderer 全量分组。
3. 让全局搜索返回服务端位置和 snapshot cursor。
4. 让播放器队列支持 snapshot token 或惰性窗口，而不是一次持有所有对象。

这些条件未满足前，不应把当前完整快照替换成稀疏 placeholder 数组。
