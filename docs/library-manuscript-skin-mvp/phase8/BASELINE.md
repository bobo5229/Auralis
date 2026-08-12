# Phase 8 基线记录：全部歌曲页交互视觉闭环与可访问性

**记录日期**：2026-08-12  
**技术文档**：[`TECHDOC.md`](./TECHDOC.md)  
**前置门禁状态**：Phase 7 代码实现与人工验收已全部完成并通过，门禁已成功关闭。

---

## 1. 代码库基线状态

- **仓库分支**：`script-skin-dev`
- **基线工作树**：已完成 Phase 7 中 missing release date 线高修正、FOLIO 无延迟滚动与数据刷新自动定位、元数据 Missing Fallback 全项补齐、播放/暂停视觉分级与 `aria-current` 可访问性修正、Token 与 Typography 统一重构、Windows DPI 抖动消除及曲序号 `trackNo` 宽度居右锁定。

---

## 2. 交互现状审计与基线记录

| 模块               | 现状基线描述                                                                                                                                    | Phase 8 改进目标                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **右键菜单**       | 菜单硬编码在 `LibraryPage.vue` 模板内，Teleport 到 `body`，手稿模式下仍显示 Modern 玻璃材质，缺少 `role="menu"`、`role="menuitem"` 与键盘导航。 | 抽取 `LibraryContextMenu.vue`，在手稿模式下呈现不透明纸面档案卡样式；补充完整键盘与 ARIA 巡检模型；视口动态夹取与子菜单翻转；关闭后焦点精准还原。 |
| **元数据编辑弹窗** | `MetadataEditDialog.vue` Teleport 到 `body`，无手稿纸质视觉，缺失 `role="dialog"`、`aria-modal` 与焦点圈闭，无保存中防护。                      | 接入手稿 Teleport 作用域与纸面样式；补齐对话框 ARIA 语义、打开聚焦与焦点圈闭；文案接入三语 i18n；保存中禁用关闭及二次提交。                       |
| **曲库搜索**       | 依靠鼠标移入顶部 48px 带唤起，缺少键盘进入快捷键；匹配跳转静默完成，缺失找到/未找到/回绕的视效与 `aria-live` 播报。                             | 支持 `/` 快捷键唤起与聚焦；增加两阶段 Escape 处理；补充 `aria-live="polite"` 结果播报；维持 48px 检索带与前缀跳转语义不变。                       |
| **虚拟列表键盘**   | `SongRow` 与 `AlbumCoverTrackRow` 根节点为 `div`，不可获焦；无键盘巡检机制与封面整专辑菜单快捷键。                                              | 增加 `role="button"`、`data-track-id`、`tabindex` 与 ARIA 状态；实现上下键/Home/End 跨屏巡检与单曲/封面键盘唤起菜单。                             |
| **页面状态**       | 仅有基础 `loading` 与 `empty` 装饰，初次/路由加载失败缺失错误分支与重试按钮；后台刷新失败会覆盖列表。                                           | 抽取 `LibraryStatusState.vue`；补齐静态账册骨架线、功能性空态与带重试按钮的错误态；后台刷新失败保护保留已有曲目。                                 |

---

## 3. 几何与性能几何指标保留

- **Flat Row Height**: `44px`
- **Cover Track Row Height**: `40px`
- **Cover Artwork Size**: `250px`
- **Cover Panel Side Padding**: `10px`
- **Cover Group Top/Bottom Padding**: `28px` (CAT 编号与字段头绝对定位不占用布局流)

---

## 4. 自动校验指令

在后续各 Step 实施完成后，均需验证以下指令：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```
