# Auralis 剩余优化工作交付文档

日期：2026-08-28  
仓库：`D:\VSCode\Auralis`  
用途：交给接手智能体继续完成未交付事项；本文不是完成报告。

## 1. 中断位置与任务范围

上一轮在第三波 P2 刚派发时因额度中断。第一波已有独立验证；第二波代码已写入，但最终版本未完成全量验收；第三波没有实现落地。

接手范围：

1. 验证并修复第二波已有实现，不要直接重做。
2. 实现 CI 格式、零警告、包体预算、真实启动和打包验证门禁。
3. 实现 SQLite 完整性检查、迁移前备份、受控备份与恢复。
4. 完成统一自动化及相关人工视觉验收，同步文档并交付证据。

用户未授权提交、推送、换分支或清理已有修改。不要把本文件理解为这些操作的授权。

## 2. 接手前必须知道

- 先完整阅读仓库 `AGENTS.md`，以当前源码和执行结果为准。
- Windows / PowerShell；使用 `npm.cmd`，避免 Bash 和跨 shell 文件操作。
- 当前工作区包含大量未提交、未跟踪文件，既包括前几轮成果，也包括用户修改。不要 reset、checkout、clean 或覆盖。
- `src/renderer/features/settings/styles/settings.chrome.css` 是用户已有修改，不属于本轮优化任务；禁止擅自修改或回退。
- 字体 OTF 删除与同名 WOFF2 新增属于已完成的无损转换，不是意外丢文件；零引用华康字体的删除也属于上一轮改动。
- `out/`、`data/`、缓存、依赖及 `release/` 都不是源码。不要对真实用户曲库、数据库做测试或恢复演练。
- 依赖变更后须先 `npm.cmd run rebuild:native`。不要顺手升级 Electron 或 better-sqlite3。
- 所有手工修改优先 `apply_patch`；中文文件需严格 UTF-8 字节解码校验。
- 历史测试结果只证明当时版本，不证明当前最终工作区。不能把类型检查通过当成运行时、视觉或数据恢复验收。

## 3. 已有成果：保留并复核，不要重复实现

| 工作           | 已落地内容                                                                | 历史验证边界                                                        |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 字体与路由     | 7 个 GenRyuMin 字重无损转 WOFF2；全部字符映射保留；5 个页面动态导入       | 当时 build、lint、unit 通过；字体约 130.26 → 65.33 MiB              |
| Electron smoke | 实际启动生产构建、sandboxed preload、路由、导航拒绝、Miniplayer、桌面歌词 | 当时真实 10 项检查通过；第二波之后未统一复跑                        |
| IPC 边界       | payload 类型/形状/大小及可信主窗口顶层 frame 校验                         | 第一波 unit 52 文件 / 294 项通过；随后新增诊断导出 channel          |
| 曲库性能       | 5k 有界分页、预分配聚合、单遍分组/lookup、搜索缓存、8ms 可取消分片预热    | 最终版 typecheck/lint 通过；最终测试、新版 benchmark/build 未跑完   |
| 生产诊断       | 生产日志 2 MiB × 4、全局脱敏、设置页 JSONL 导出                           | 目标 5 文件 / 28 项测试曾通过；最后新增 logger.test.ts 尚未实际运行 |
| Renderer 拆分  | Archive 每日详情、Album 曲目列表、MiniPlayer popover 抽离                 | typecheck/lint/作用域检查通过；新测试和完整构建未完成，无 GUI 验收  |

当前领域 invoke 注册覆盖数量为 **54**，包含 `app:export-diagnostics`；桌面歌词另有 5 个独立 invoke。新增数据库能力后必须同步覆盖，不能继续硬编码旧的 53。

### 关键文件索引（路径均相对仓库根目录）

- 路由与字体：`src/renderer/app/router/index.ts`、`src/renderer/app/styles/main.css`、`src/renderer/assets/fonts/`。
- Smoke：`scripts/electron-smoke/run-electron-smoke.mjs`、`src/main/app/smoke/`、`src/main/index.ts`。
- IPC：`src/main/ipc/ipcPayloadValidation.ts`、`validatedIpcRegistrar.ts`、`registerDomainIpcHandlers.test.ts`。
- 曲库：`src/main/features/libraryCatalog/libraryCatalogSnapshotStore.ts`、`src/shared/types/libraryCatalog.ts`、`src/renderer/features/library/pages/LibraryPage.vue`、`utils/loadLibraryCatalogSnapshot.ts`、`utils/libraryCatalogViewIndex.ts`、`utils/librarySearchIndex.ts`、`utils/normalizeSearchText.ts`。
- 基准：`src/main/features/libraryCatalog/libraryCatalog.bench.ts`、`src/renderer/features/library/benchmarks/libraryCatalog.bench.ts`。
- 日志：`src/main/logging/logger.ts`、`rollingLogStore.ts`、`logSanitizer.ts`、`diagnosticExport.ts` 及相邻测试；UI 为 `src/renderer/features/settings/components/AboutSettings.vue`。
- 组件：`src/renderer/features/archive/components/ArchiveDailyDetailDialog.vue`、`src/renderer/features/albums/components/AlbumDetailTrackList.vue`、`src/renderer/app/layout/miniPlayer/` 及对应页面、样式和测试。

## 4. 任务 A：补齐已有实现的验收与必要修复

优先执行一次基线检查，记录失败项及其归属。修复真实问题，不通过跳过测试、降低断言或调整阈值掩盖问题。

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run benchmark:library
npm.cmd run build
npm.cmd run smoke:electron
git diff --check
```

说明：`build` 包含 typecheck；`smoke:electron` 复用已有构建，`test:smoke` 会再次 build。正式最终验收可避免重复 typecheck/build。

重点验收：

- [ ] 新增 logger、曲库完整性/取消、组件纯逻辑测试实际运行成功。
- [ ] 5k 分页与 contract、payload validator、Renderer 请求一致；100k 恰好 20 页且不丢失、不重复。
- [ ] 主进程快照游标不能跨 snapshot 复用；禁止 SQLite OFFSET。
- [ ] UI 只接收完整有序快照；旧 generation 的分片索引不能覆盖新状态，半成品索引不暴露。
- [ ] 刷新仍遵循前台 > 元数据保存 > 后台，不能并发完整快照构建。
- [ ] 首次搜索等待预热时不丢用户输入；搜索、封面分组、选择和播放队列行为保持。
- [ ] 运行新版 benchmark，保存环境、命令、均值/样本数；区分真实测量与结构化克隆近似，不把中间优化数字当最终结果。
- [ ] 全局日志脱敏、容量/轮转/写入失败降级成立；导出只含受控日志与非敏感摘要，不含 DB、音乐或任意目录文件。
- [ ] 日志导出 channel 经过相同来源/payload 校验；renderer 不能提供输出路径。
- [ ] 最终 build 后重新执行真实 smoke，检查隔离 userData 被清理、子进程退出，不遗留 Electron。

### 人工视觉与交互验收

本轮存在组件抽离及设置页新增控件，纯逻辑测试不能替代以下验收：

- Archive：modern/manuscript × light/dark；每日详情加载/错误/空/有内容；关闭方式、长文本、缺封面、reduced motion。
- Album Detail：两种风格与主题、单碟/多碟、选择/播放/搜索高亮、单击/双击、长文本。
- Miniplayer：light/dark；队列/模式/音量 popover、空队列、缺封面、上下展开、Escape/外部点击、静音 tooltip、重复开关、reduced motion。
- Library：flat/cover、100k 滚动、刷新期间搜索/选择、元数据保存、过期请求取消；保持虚拟列表几何。
- Settings：诊断导出及后续备份/恢复入口的取消、成功、失败状态；两种风格与主题。
- 确认 Playbar、Fullscreen、桌面歌词和各 Teleport owner 未被交叉污染。

缺少真实 GUI 条件时明确标记“未验收”，不要声称全部完成。

## 5. 任务 B：CI 门禁（尚未实现）

当前 `.github/workflows/windows-ci.yml` 仅执行安装、原生模块重建、完整测试、lint、build。`package.json` 尚无 `format:check`、包体预算或打包校验脚本。

实施要求：

1. 增加只读 `format:check`；限定合理源码/配置/正式文档范围，排除生成目录。不要用 `prettier --write .` 清理整个脏工作区。
2. ESLint 零 warning 门禁；处理本任务引入问题，遇用户无关改动单独报告。
3. 增加生产构建资产预算脚本，分别约束 JS、CSS、字体及异常大文件；根据优化后实测设置合理余量，超限错误列出具体文件。
4. 将真实 `smoke:electron` 接入 Windows CI，复用刚生成的 build。
5. 增加 `electron-builder --dir` 验证；检查可执行文件、app.asar、两个 CJS preload，以及 unpacked 原生模块存在。避免生产构建重复执行。
6. benchmark 使用手动/可选工作流并归档结果，不设每个 PR 都必须通过的机器耗时硬阈值。
7. YAML、脚本失败退出码和 Windows 路径均需验证。打包检查不能仅检查旧 release 目录碰巧存在。

建议流水线：安装 → rebuild:native → format/lint → 完整测试 → build → 资产预算 → Electron smoke → --dir 打包 → 打包产物验证。

验收：新脚本本地实际执行；用可控超限输入证明预算会失败；格式/警告/缺失产物能使门禁失败。远端 CI 未运行就注明未运行，不声称绿灯。

## 6. 任务 C：SQLite 备份与恢复（尚未实现）

当前数据库入口为 `src/main/database/connection.ts`，迁移为 `schema.ts`。已启用 WAL/外键，但没有完整性检查、迁移前备份和恢复实现。`initializeDatabase()` 当前是同步 API，改变启动顺序或返回类型时须审计全部调用者。

### C1. 完整性与迁移前备份

- 对已有正式文件 DB 执行明确的 `quick_check` 策略；异常时阻止危险写入/迁移并给出可操作提示，不能直接覆盖或自动清库。
- 仅在确有待执行迁移时自动生成迁移前备份；新空库按单独规则处理。
- 使用 SQLite 一致性备份能力；不能只复制主文件忽略 WAL，也不能把分别复制 DB/WAL/SHM 当成可靠在线备份。
- 备份写到受控临时文件，校验成功后原子发布；定义有限保留数量/总量，清理仅限应用管理的备份文件。
- 备份失败时不得冒险继续升级已有数据库；原库和已有有效备份必须保留。
- 明确迁移失败后的连接关闭、启动失败提示和恢复路线；日志不得泄露用户路径。

### C2. 用户备份与受控恢复

- 设置页提供“立即备份”“从备份恢复”，三语文案说明包含数据库而不含音乐文件。
- 输入/输出位置由主进程原生对话框或受控备份列表决定；Renderer 不传任意路径。
- 恢复是破坏性业务操作，必须明确确认，并先为当前库生成一致性安全备份。
- 不得热替换服务仍持有连接的 SQLite 文件。建议采用校验后 staged restore、受控重启、启动早期恢复的流程。
- 校验文件类型、完整性、schema 兼容性；拒绝不支持的未来 schema 和损坏文件。
- 恢复过程失败能回滚，保留原库/安全备份；重启后 repository/service/watchers 必须全部使用同一新连接。
- 审计数据目录、WAL/SHM、待恢复标记的处理；避免中途退出导致无法启动或再次重复恢复。
- 同步 shared contract/channel/API、preload、领域 registrar、runtime validator、注册覆盖测试和 UI。

### C3. 必须有真实原生测试

- [ ] 含未 checkpoint WAL 数据的备份仍完整。
- [ ] 无迁移不重复备份；有迁移先完成备份；备份失败不迁移。
- [ ] 临时备份失败不替换有效备份；保留策略不删除非管理文件。
- [ ] corrupt/非数据库/未来 schema 能被拒绝。
- [ ] staged restore 成功、失败回滚、中断重试和恢复前安全备份。
- [ ] 用户取消不改变数据库或待恢复状态。
- [ ] 不用真实用户库演练，不在测试中访问真实曲库。

## 7. 推荐分工与最终交付

- CI 智能体负责 workflow、质量/预算/打包 scripts 和 package.json。
- 数据库智能体负责 database、启动流程、维护 IPC/preload、设置组件和 locale。
- 集成负责人统一处理跨模块接口、重跑检查、审阅 diff 和组织视觉验收。共享文件尤其 `src/main/index.ts`、`src/main/ipc/**` 必须协调所有权。

最终交付需包含：

1. 所有任务逐项完成/未完成清单及对应源码、测试或运行证据。
2. 实际运行的命令、退出结果、测试数量、最终 benchmark 环境与指标。
3. 字体/JS/CSS 与打包产物大小、预算阈值及检查结果。
4. 备份目录、保留限制、恢复步骤、失败回滚方式；诊断日志位置与隐私边界。
5. 视觉验收矩阵及实际截图/记录；未做的检查明确标注。
6. 更新 `README.md` 和 `docs/ARCHITECTURE.md`，避免宣称未验证能力。

不要求提交或推送。只有当前最终状态通过相应范围的验证，才可把任务标为完成。
