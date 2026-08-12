# Phase 10 基线

**日期**：2026-08-12
**分支**：`script-skin-dev`

## 1. 开始状态

- Phase 9 源码和文档尚未提交，工作树包含用户已确认的曲目文字对比度修复。
- Phase 9 自动检查已通过，但真实窗口、DPI 和 10k/50k 曲库人工矩阵尚未执行。
- 仓库没有测试运行器，也没有 `npm test` 脚本。
- 搜索扫描仅有生产模块内的手写 assertion examples。
- 请求 generation、活跃 lane、pending refresh 和 Promise waiters 全部位于 `LibraryPage.vue`。

## 2. 必须保持的行为

- 搜索仍是 Enter 定位下一首，而不是过滤列表。
- 平铺与封面模式继续使用现有播放队列、选择、右键菜单和元数据编辑行为。
- 后台刷新不得淘汰 foreground 或 metadata-save。
- 路由切换后的旧请求不得提交数据、错误、loading 或跳转。
- 列表刷新继续按键盘焦点、selected、current、first-visible 的顺序恢复锚点。
- 页面卸载必须取消待执行帧、使异步请求失效并释放等待者。
- 手稿只允许在 route name 为 `library` 时生效。

## 3. 冻结几何

| 指标                | 值        |
| ------------------- | --------- |
| Flat row            | 44px      |
| Flat artwork        | 44px      |
| Cover track row     | 40px      |
| Cover artwork       | 250px     |
| Track panel padding | 每侧 10px |
| Album group padding | 每侧 28px |
| Flat overscan       | 12        |
| Cover overscan      | 2         |

## 4. 工作树保护

Phase 10 不覆盖或回滚下列既有改动：

- Phase 9 的 `LibraryPage.vue`、搜索索引和派生索引。
- Phase 9 文档目录。
- `manuscript.css` 中已经完成的文字对比度修复。
