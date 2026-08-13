# Phase 11 交付记录：大曲库稳定快照与分块 IPC

**记录日期**：2026-08-13
**分支**：`script-skin-dev`
**技术文档**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 实施状态

| Step | 目标                          | 状态   | 交付说明                                                  |
| ---- | ----------------------------- | ------ | --------------------------------------------------------- |
| 11.0 | 冻结数据、排序和队列基线      | 已完成 | 明确拼音排序、cover 与完整 queue 约束。                   |
| 11.1 | Shared contracts 与 Typed IPC | 已完成 | page types 和五层 IPC 已接通。                            |
| 11.2 | 主进程稳定 catalog snapshot   | 已完成 | cursor、bounded page、expiry 与 diagnostics 已实现。      |
| 11.3 | Renderer 分块聚合             | 已完成 | generation-aware loader 已接入全部歌曲页。                |
| 11.4 | 后台刷新与播放队列保护        | 已完成 | background lane 合并事件；播放不增加二次全量 IPC。        |
| 11.5 | 自动回归与 50k 基线           | 已完成 | 50,005 首遍历、过期 cursor、聚合校验已覆盖。              |
| 11.6 | 主线程审查与完整门禁          | 已完成 | test、typecheck、lint、build、diff、格式与 UTF-8 均通过。 |

## 2. 实现摘要

- 新增主进程 `LibraryCatalogSnapshotStore`。
- 新增 `library:get-track-page`。
- Renderer 每页最多接收 1000 首，完整聚合成功后一次 commit。
- 后台/前台竞态继续使用 Phase 10 request coordinator。
- 播放继续即时使用完整聚合数组，不在用户双击后追加全量 queue IPC。
- request coordinator 新增 active background lane，连续 changed/scan 事件最多补一次刷新。
- 开发模式输出 build/slice/Renderer 总加载诊断。

## 3. 自动测试

- Phase 10 原有 16 项测试继续保留。
- 新增主进程 snapshot store 测试 3 项。
- 新增 Renderer catalog 聚合测试 3 项。
- Phase 10 request coordinator 新增 background 合并测试 1 项。
- 当前合计：8 files / 23 tests。

覆盖：

- 50,005 首、51 页完整遍历。
- 无重复、无遗漏、顺序不变。
- refresh 淘汰旧 cursor。
- page size clamp 与非法 cursor。
- Renderer 多页聚合和 diagnostics。
- snapshot/total 改变。
- 数量不一致。
- generation 失效后停止请求。

## 4. Findings 与解决办法

### Finding 1：播放前追加完整 queue IPC 会造成响应回退

- **问题**：首版实现计划在双击后以 snapshot id 再请求完整轻量播放队列；50k 曲库会让播放动作等待第二次全量结构化克隆。
- **解决办法**：移除 queue endpoint 和 Renderer queue promise；本阶段完成聚合后已有完整有序数组，继续直接交给现有播放器。
- **复查标准**：双击和右键播放入口与 Phase 10 一样直接使用 `tracks.value`；没有新增 await 或第二次 IPC。

### Finding 2：并发 background 事件可能重复构建 catalog snapshot

- **问题**：原 request coordinator 只记录 foreground 和 metadata-save；changed 与 scan-completed 连续到达时可同时启动多个 background refresh。
- **解决办法**：新增 active background generation；后台刷新活跃时后续事件只设置一个 pending flag，完成后最多补一次刷新。
- **复查标准**：自动测试验证连续两个 background begin 均被合并，并在当前 background finish 后只放行一次 pending refresh。

## 5. 当前验证结果

- `npm.cmd test`：通过，8 files / 23 tests。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，三语 locale key 一致。
- `npm.cmd run build`：通过；仅保留既有 `artworkUrl` runtime resolve warning。
- `git diff --check`：通过。
- Phase 9–11 改动文件 Prettier check：通过。
- UTF-8 字节严格解码通过，无 replacement character 或连续问号。
- 测试描述字符串未进入 production bundle。

## 6. 主线程复查结论

- 两项 Finding 均已按解决办法修复并由自动测试覆盖。
- 全部歌曲页运行时已不再调用 `auralis.library.getTracks()`，其他专辑与 facets 消费者继续使用兼容接口。
- cursor 对单个 immutable snapshot 稳定；refresh 后旧 cursor 显式失败。
- Renderer 只有在 page 数量、snapshot id 和 total count 全部一致时才 commit。
- 播放入口没有新增 await，继续使用完整 `tracks.value` 队列。
- changed/scan 连续事件在 active background 期间合并为一次 pending refresh。
- 无剩余阻断或需修复代码 Finding。

## 7. 人工性能验收

自动测试只验证完整性，不替代真实性能记录。约 10k 和 50k 曲库下的
`[Auralis] Library catalog snapshot loaded` 耗时、以及首次双击播放体感 **仍未实测，保持延期**。
不填写虚构数字，也不因 Phase 15 视觉工作将其标为完成。
