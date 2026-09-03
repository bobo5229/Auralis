# Phase 9 基线记录：全部歌曲页视觉稳定性与大曲库耐久性

**记录日期**：2026-08-12
**分支**：`script-skin-dev`
**基线提交**：`d2975e0473ad623951b2bd65154775b585b7e925`
**技术文档**：[`TECHDOC.md`](./TECHDOC.md)

## 1. 前置门禁

- Phase 8 自动化交付记录为通过；
- Phase 8 截图目录仍只有验收说明，未形成完整截图证据；
- 用户此前已对 Phase 5 做过人工验收，但本基线不把 Phase 8 人工矩阵推定为完成；
- Phase 9 可以开始代码实施，最终只能在人工矩阵补齐后关闭门禁。

## 2. 工作树边界

Phase 9 开始时存在一项用户范围内、尚未提交的修改：

- `src/renderer/features/library/styles/manuscript.css`：flat 曲目行文字对比度修复。

该修改已经通过 typecheck、lint、build、diff check 与 UTF-8 校验。Phase 9 各 Step 必须保留它，不得覆盖，不得在未说明的情况下归入性能改造提交。

## 3. 已知事实

- flat grid 的 Flex 覆盖问题已由提交 `d2975e0` 修复；
- Phase 8 菜单主/子菜单焦点映射已由提交 `9063a0d` 修复；
- renderer 仍通过单次 IPC 全量加载所有可用曲目；
- 主进程查询后仍用 JavaScript `Intl.Collator` 执行全量排序；
- renderer 已使用虚拟滚动，但定位、搜索和刷新路径仍存在重复 O(n) 工作；
- Phase 9 不处理数据库分页和 IPC 协议扩张。

## 4. 自动检查基线

每个 Step 至少执行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

## 5. 人工基线

Phase 9 最终人工验收需要覆盖：

- 900x620、1279x800、1280x800、1600x900；
- Windows 100%、125%、150%；
- modern/manuscript × flat/cover；
- 全部歌曲、普通歌单、智能歌单；
- 连续搜索与回绕、当前曲定位、视图切换、键盘巡检、菜单、元数据保存和扫描刷新；
- 真实大曲库或受控的 10k / 50k 级数据。
