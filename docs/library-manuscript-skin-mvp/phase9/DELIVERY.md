# Phase 9 交付记录：全部歌曲页视觉稳定性与大曲库耐久性

**记录日期**：2026-08-12
**分支**：`script-skin-dev`
**技术文档**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 实施状态

| Step | 目标                     | 状态     | 交付说明                                                           |
| ---- | ------------------------ | -------- | ------------------------------------------------------------------ |
| 9.0  | 冻结基线与技术边界       | 已完成   | TECHDOC、BASELINE、DELIVERY 已建立，格式、diff 与 UTF-8 校验通过。 |
| 9.1  | 派生索引与定位事实源     | 已完成   | luna_worker 实施完成，主线程复查通过，无待修复 Finding。           |
| 9.2  | 搜索索引与单次扫描       | 已完成   | luna_worker 实施完成，主线程复查通过，无待修复 Finding。           |
| 9.3  | 滚动帧合并与 FOLIO 稳定  | 已完成   | luna_worker 实施完成，主线程复查通过，无待修复 Finding。           |
| 9.4  | 异步刷新竞态与锚点连续性 | 已完成   | 两轮 Finding 修复后，主线程复查通过。                              |
| 9.5  | 回归、性能与人工门禁     | 代码完成 | 静态回归与自动检查通过，真实窗口/DPI/大曲库人工矩阵待执行。        |

## 2. 审查记录

### Step 9.1

- **修改文件**：`LibraryPage.vue`、新增 `utils/libraryDerivedIndex.ts`。
- **自动检查**：主线程独立执行 `typecheck`、`lint`、`build`、`git diff --check`，全部通过；UTF-8 字节解码检查通过。
- **Findings**：无阻断或需修复 Finding。
- **对应解决方案**：不适用。
- **复查结论**：通过。track、track index、album group index 与 group start offset 已成为响应式派生快照；cover offset 继续复用 `getAlbumGroupEstimatedHeight` 几何事实源；搜索扫描留待 Step 9.2。
- **人工验收**：纳入 Step 9.5 统一执行。

### Step 9.2

- **修改文件**：`LibraryPage.vue`、新增 `utils/librarySearchIndex.ts` 与 `utils/librarySearchScan.ts`。
- **自动检查**：主线程独立执行 `typecheck`、`lint`、`build`、`git diff --check`，全部通过；Node 原生 TypeScript 运行器执行搜索边界断言通过；断言辅助代码未进入 production bundle。
- **Findings**：无阻断或需修复 Finding。
- **对应解决方案**：不适用。
- **复查结论**：通过。搜索字段归一化随 tracks 快照缓存；每次 Enter 仅归一化一次 query；一次扫描返回 total、target、position 与 wrapped；多字段命中按单曲计数；旧双遍逻辑已删除。
- **人工验收**：连续 Enter、查询变化、无匹配与末尾回绕纳入 Step 9.5。

### Step 9.3

- **修改文件**：`LibraryPage.vue`。
- **自动检查**：主线程独立执行 `typecheck`、`lint`、`build`、`git diff --check`，全部通过。
- **Findings**：无阻断或需修复 Finding。
- **对应解决方案**：不适用。
- **复查结论**：通过。scroll、scrollRef、视图/数据 watch 与程序化定位均汇聚到单一 rAF 调度器；同帧重复事件复用 pending frame；cover 只检查当前 virtual items，并维持严格 `item.end > offset` 边界；卸载时失效并取消待执行帧。
- **人工验收**：快速滚动、程序化定位、flat/cover 切换与 FOLIO 最终收敛纳入 Step 9.5。

### Step 9.4

- **修改文件**：`LibraryPage.vue`。
- **自动检查**：主线程在最终修复后独立执行 `typecheck`、`lint`、`build`、`git diff --check`，全部通过。
- **Findings**：
  1. 后台刷新会淘汰活跃 foreground，并提前关闭 loading；若后台失败会遗留旧路由列表。
  2. 后台刷新会淘汰 metadata-save 快照；若后台随后失败，弹窗可能关闭但列表仍显示保存前元数据。
- **对应解决方案**：
  1. foreground 活跃时合并后台事件为单一 pending refresh；foreground 按 generation identity 清理后，再为当前 scope 启动最多一次后台刷新。
  2. 增加 active metadata-save generation；后台在 foreground 或 metadata-save 活跃时只排队；metadata-save 等待 foreground，独立完成快照提交；路由 foreground 可淘汰旧 metadata-save，且旧焦点不返回新路由。
- **复查结论**：通过。scope 在请求起点冻结；旧请求不得提交数据、view mode、loading/error 或旧路由跳转；卸载使 generation 失效并释放等待者。
- **人工验收**：连续路由切换、scan/onChanged 连发、后台失败和元数据保存交错纳入 Step 9.5。

### Step 9.5

- **修改文件**：无新增源码修改；主线程更新本交付记录。
- **自动检查**：最终独立执行 `typecheck`、`lint`、`build`、`git diff --check` 与 Phase 9 文件 Prettier check，全部通过；构建仅保留已有 `artworkUrl` runtime resolve warning。
- **边界断言**：搜索无匹配/首次匹配/回绕/多字段单曲计数断言通过；派生索引 lookup 与真实 `getAlbumGroupEstimatedHeight` offset 样例通过；production bundle 不含断言辅助代码。
- **静态回归**：手稿仍仅限 `route.name === 'library'`；歌单保持 modern；44/40/250px 等几何与 flat 12/cover 2 overscan 不变；lazy artwork、async decoding、队列、菜单、metadata 与视图持久化路径仍存在。
- **Findings**：无新增代码 Finding。
- **对应解决方案**：不适用。
- **复查结论**：代码实现与自动化门禁通过。
- **人工验收**：待用户执行，不能由静态审计替代。

## 3. 人工验收矩阵

以下项目尚未判定通过：

1. 在 900x620、1279x800、1280x800、1600x900 下分别验证 modern/manuscript 的 flat/cover。
2. 在 Windows 100%、125%、150% 缩放下复查列对齐、封面组稳定性、FOLIO 与焦点圈。
3. 验证全部歌曲、普通歌单、智能歌单；确认后两者始终 modern。
4. 连续 Enter 搜索至末尾并回绕，复查 matched/total/wrapped 与跳转位置。
5. 快速滚动后停止，复查 FOLIO 最终值；执行当前曲定位与 flat/cover 切换，复查 33% 锚点。
6. 验证键盘巡检、右键菜单、整专辑菜单、元数据保存后的刷新与焦点恢复。
7. 扫描完成与曲库 changed 连续触发时，确认刷新合并、列表不闪空；模拟后台刷新失败时保留已有列表。
8. 使用真实大曲库或受控 10k/50k 曲目数据复查首次加载、搜索、滚动和视图切换响应。

## 4. 当前门禁状态

Phase 9 代码实现已完成，自动化和主线程代码审查均通过。人工大曲库与多宽度/缩放矩阵尚未执行，因此当前状态为“代码完成，待人工验收”，不得标记为完全关闭。
