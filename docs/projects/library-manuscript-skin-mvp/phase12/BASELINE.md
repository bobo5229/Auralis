# Phase 12 基线

**记录日期**：2026-08-13
**工作分支**：`script-skin-dev`
**起始状态**：工作树包含尚未提交的 Phase 9-11、AGENTS 更新与 artworkUrl 构建警告修复。

## 保留项

- 不回退或重写既有未提交内容；
- LibraryPage 的 Phase 9 请求协调、Phase 10 测试与 Phase 11 分块 IPC 保持不变；
- AlbumDetailPage 的 artworkUrl 警告修复保持不变；
- `auralis-visual-style` 存储键和值保持不变。

## 现状审计

- `/albums` 使用 `AlbumsPage.vue` 和 `AlbumCard.vue`；
- 两种视图为 `grid | perspective`，视图偏好独立持久化；
- 专辑网格按行虚拟化，列数根据宽度在 3-6 之间变化；
- 搜索语义为 Enter 定位下一项，不过滤结果；
- 右键菜单支持定位当前专辑、播放、插播和视图切换；
- `/albums/detail` 包含独立流体背景和封面跟踪，不适合与目录页同阶段覆盖。

## 风险

1. 视觉状态迁移产生第二状态源；
2. 卡片装帧改变虚拟行几何；
3. Teleport 菜单无法继承页面 token；
4. 未知元数据本地化改变专辑 identity；
5. `/albums/detail` 被路径关系意外手稿化。

对应方案已写入 TECHDOC，并由静态检查和单元测试覆盖关键边界。
