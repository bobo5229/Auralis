# 曲库与数据

适用：曲库分页与快照、依赖完整列表的搜索/分组/队列消费者、数据库和扫描。

## 曲库目录快照

- All Songs 使用 `library:get-track-page`。主进程的
  `src/main/features/libraryCatalog/libraryCatalogSnapshotStore.ts` 维护不可变、按拼音排序的快照。
- 游标不透明且绑定原快照；不得静默复用过期游标。
- Renderer 验证并聚合全部分页后再提交；封面分组、全局搜索和播放队列依赖完整有序快照。
  除非同时重构这些消费者，否则不能改用 SQLite `OFFSET`，也不能向它们暴露部分数组。
- 刷新保持 generation 控制并合并活跃后台任务，优先级为前台刷新、元数据保存、后台刷新。
  不得重新引入并发的完整快照构建。

## 数据库与扫描

- 数据库连接由 `src/main/database/connection.ts` 的模块级单例管理。
- 迁移位于 `src/main/database/schema.ts`，通过 `schema_migrations` 顺序执行。
- 数据库启用 WAL 和外键。
- 扫描在 Worker thread 中执行，不得阻塞 Electron 主进程。
- 保持基于 `file_size`、`file_mtime_ms` 的去重以及批量事务写入。
- 数据库、原生模块的验证依据 [风险分级验收](validation.md) 选择，不能用纯 Node 环境测试
  替代要求 Electron ABI 的 native 测试；不得使用用户真实曲库进行破坏性测试。

## 按需参考的背景资料

只有任务需要产品或历史设计背景时才读取，不作为常驻规则或新的验收门槛：

- [曲库加载 PRD](<../history/2026-06-24/01-曲库加载/Auralis 曲库加载 PRD.md>)
- [曲库加载技术设计](<../history/2026-06-24/01-曲库加载/Auralis 曲库加载技术设计.md>)
- [悬浮 Playbar PRD](<../history/2026-06-24/01-曲库加载/Auralis 悬浮 Playbar PRD.md>)
