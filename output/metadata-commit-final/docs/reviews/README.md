# 审查与验证记录

[返回文档入口](../README.md) · [完整文档索引](../CATALOG.md#审查记录) · [可复用经验](../lessons/README.md)

按问题查找审计、评估、修复与验证记录。每篇结论对应原文的版本和检查范围；日期较新不自动替代旧记录。部分资料沿用本机保留策略，其他工作区可能没有对应文件。

## 架构与重构

- [P1–P2 重构汇报](2026-10-23-p1-p2-refactor-report.md)：该轮交付与剩余项的汇总快照。
- [高复杂度单文件重构待办：P2–P3](2026-10-23-complexity-refactor-backlog.md)：原审计排序、指标和拆分边界，结合交付汇报阅读。
- [2026-10-16 代码审计](2026-10-16-1742-code-audit.md)：限定版本与工作区差异的只读审计。
- [架构 Review 落地修复汇总](2026-07-17-architecture-review-fixes.md)。
- [面向新产品重建的资产审查](product-rebuild-asset-audit-2026-09-27.md)：能力与职责的保留、拆分和迁移评估。

## 开源复用与替换评估

先读[自写实现与开源复用审计](2026-10-04-open-source-reuse-audit.md)，再按专题查看当轮评估或替换记录。候选建议和替换记录的阶段不同，具体落地范围以各篇原文为准。

- [封面聚类](2026-10-04-artwork-palette-replacement.md)
- [Culori 颜色计算](2026-10-04-culori-color-math-replacement.md)
- [Floating UI 定位](2026-10-04-floating-ui-positioning-replacement.md)
- [focus-trap 焦点管理](2026-10-04-focus-trap-replacement.md)
- [IPC Valibot 校验](2026-10-04-ipc-valibot-replacement.md)
- [日志 Worker transport](2026-10-04-logging-transport-replacement.md)
- [Chokidar 元数据监听](2026-10-04-metadata-watch-chokidar.md)
- [opencc-js 搜索繁简归一化](2026-10-04-opencc-search-normalization-evaluation.md)

## 环境、数据与界面诊断

- [Electron 启动崩溃与安装目录 ACL](2026-09-28-electron-startup-acl-crash.md)：当次环境对照、权限证据和验证边界；相似启动现象也可参考[徽章原型排查复盘](../lessons/2026-10-24-enamel-glsl-debugging-lessons.md)。
- [mpv 播放中标签保存](2026-10-08-mpv-buffered-tag-write.md)。
- [主题与颜色体系审计](播放器主题配色审计报告.md)。
- [专辑列表页 UI 审查](2026-07-25-albums-page-ui-audit-fixes.md)。
- [桌面歌词窗口生命周期审查](REVIEW-desktop-lyrics-window-lifecycle.md)：历史窗口行为记录。

## 清理与整理

- [2026-10-20 工作区清理与整理方案](2026-10-20-workspace-cleanup-plan.md)
- [第一批冗余清理记录](2026-10-06-confirmed-redundancy-cleanup.md)
- [第二批冗余筛查与清理记录](2026-10-06-redundancy-second-pass.md)

具体处理边界留在上述记录，可复用判断方法见[UI 冗余清理经验](../lessons/2026-10-06-ui-cleanup-lessons.md)。

## 教学示例

- [示范审查入口](2026-08-05-demo-audit/README.md)
- [Round 0：IPC／进程边界](2026-08-05-demo-audit/round-00-定尺-IPC边界.md)
- [Round 1：歌曲页](2026-08-05-demo-audit/round-01-模块-歌曲页.md)
- [示范评分卡](2026-08-05-demo-audit/scorecard-demo.md)

新增记录仍按日期与主题命名，并更新本页和完整索引；可复用方法另归入 `lessons/`。
