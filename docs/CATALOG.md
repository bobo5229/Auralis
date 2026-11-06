# 完整文档索引

[返回文档入口](README.md)

按用途、产品主题与项目阶段组织；日期目录只在历史批次中保留，不使用 Windows 创建时间排序。
独立 HTML 原型统一见[原型目录](../demo/README.md)；本页保留文档分类与现存演示入口。

索引同时包含共享文档和本地研究资料；Git 检出不保证全部目标存在，缺资料不等于已删除。
当前忽略策略以仓库 `.gitignore` 为准；目录归类和收录不代表文件已提交或已同步。
标题沿用原文，以便搜索；“已交付”“待办”等原文措辞只代表当时记录，不是本索引重新确认的状态。

已知替代关系见[主题说明](topics/README.md)，阶段状态阅读限制见[项目说明](projects/README.md)。

快速跳转：[协作规则](#协作规则) · [主题方案](#主题方案) · [项目档案](#项目档案) · [历史批次](#历史批次) · [可复用经验](#可复用经验) · [审查记录](#审查记录) · [交接记录](#交接记录) · [演示](#演示)

## 入口与架构

- [Auralis 架构说明](ARCHITECTURE.md)
- [Auralis UI 设计基准](DESIGN-BASELINE.html) — 面向 Agent 的视觉语言登记册：主题、色彩、字体、排版、几何、材质与设计判断基准；提炼快照，数值以源码为准。
- [完整文档索引（本页）](CATALOG.md)
- [历史批次说明](history/README.md)
- [项目档案说明](projects/README.md)
- [文档入口](README.md)
- [主题方案说明](topics/README.md)
- [审查与验证记录入口](reviews/README.md)
- [施工提示词与交接记录入口](handoffs/README.md)

## 协作规则

- [施工者规则](rules/implementation.md)
- [低耦合与高内聚](rules/coupling-cohesion.md)
- [审查者规则](rules/review.md)
- [子代理派遣与额度](rules/agent-dispatch.md)
- [架构与 IPC](rules/architecture.md)
- [环境与操作](rules/environment.md)
- [Git 与发布](rules/git-release.md)
- [曲库与数据](rules/library-data.md)
- [Renderer 视觉与交互](rules/renderer.md)
- [风险分级验收](rules/validation.md)
- [施工提示词写法](rules/handoff-prompts.md)
- [6LunaMax 施工提示词撰写规则](rules/6lunamax-construction-prompts.md)

## 主题方案

独立方案按主题收拢；同主题早期资料仍可在下方历史批次中查找。

### albums：专辑

- [唱片室语义字号体系](topics/albums/TECHDOC-cd-room-semantic-typography-2026-10-04.md)
- [当前实现与历史诊断：歌词面板收起与专辑网格同步过渡](topics/albums/TECHDOC-lyrics-collapse-album-grid-sync-2026-09-30.md#当前实现-2026-10-08) — 记录 fixed grid group-opacity 淡切、Sidebar/歌词/Playbar 协同及隔离性能证据边界。
- [历史：专辑列表页收起歌词动画性能施工方案](topics/albums/IMPLEMENTATION-lyrics-collapse-performance-fix-2026-10-02.md) — 原移动缩放方案与任务清单已被当前实现替代，性能未宣称对真实曲库完全通过。
- [历史：歌词面板收起与专辑网格同步过渡方案](topics/albums/TECHDOC-lyrics-collapse-album-grid-sync-2026-09-30.md) — 保留 2026-09-30 的诊断与设计记录；现行行为见上方当前实现说明。
- [TECHDOC：更多作品封面内部悬停反馈](topics/albums/TECHDOC-more-albums-cover-hover-2026-09-27.md)
- [PRD：CD 专辑封面索引页](topics/albums/PRD-cd-album-cover-index-2026-09-25.md)
- [TECHDOC：CD 专辑封面索引页](topics/albums/TECHDOC-cd-album-cover-index-2026-09-25.md)
- [TECHDOC：CD 目录全量顺序播放](topics/albums/TECHDOC-cd-catalog-sequential-playback-2026-09-26.md)
- [TECHDOC：CD 聚焦状态与双目标返回](topics/albums/TECHDOC-cd-focus-return-navigation-2026-09-25.md)
- [PRD：专辑详情页 Banner 模块视觉与交互重构](topics/albums/PRD%EF%BC%9A%E4%B8%93%E8%BE%91%E8%AF%A6%E6%83%85%E9%A1%B5%20Banner%20%E6%A8%A1%E5%9D%97%E8%A7%86%E8%A7%89%E4%B8%8E%E4%BA%A4%E4%BA%92%E9%87%8D%E6%9E%84.md)
- [TECHDOC：专辑列表进入详情的交叉淡入淡出](topics/albums/techdoc-album-detail-enter-transition-motion.md)
- [TECHDOC：专辑列表虚拟行定位与视觉动效解耦](topics/albums/techdoc-albums-virtual-row-transition-fix.md)
- [TECHDOC：专辑详情页本地分类兜底画廊](topics/albums/techdoc-album-detail-local-catalog-fallback-gallery.md)
- [历史 PRD：专辑详情页退出景深沉降过渡](topics/albums/prd-album-detail-exit-transition.md)
- [产品需求文档 (PRD)：专辑列表页独立动态液态极光 Header 展架](topics/albums/prd-albums-page-liquid-aurora-header.md)
- [产品需求文档 (PRD)：专辑列表页 Hi-Fi 发烧唱片馆藏与黑曜石控制架](topics/albums/prd-albums-page-obsidian-shelf.md)
- [产品需求文档 (PRD)：专辑列表页阳极氧化拉丝金属内凹 Header 展架](topics/albums/prd-albums-page-recessed-metal-header.md)
- [TECHDOC：专辑详情退出的对称淡入淡出](topics/albums/techdoc-album-detail-exit-transition-motion.md)
- [Stage 1：专辑详情控件样式的前端切换器](topics/albums/DELIVERY-album-detail-control-style-stage1-2026-10-23.md) — 设置页在拉丝金属与阳极氧化之间选择，并记在本地。
- [Stage 2：专辑详情按钮读取组件样式](topics/albums/DELIVERY-album-detail-control-style-stage2-2026-10-23.md) — 播放和随机按钮读取该选择。拉丝金属保持原样，阳极氧化换成平色金属。仍不经过主进程。
- [技术方案文档：专辑详情页沉浸式 Hero 巨幕重构 (Album Detail Hero Billboard Technical Spec)](topics/albums/techdoc-album-detail-hero-billboard-redesign.md)
- [技术方案文档 (TECHDOC)：热门单曲右下角入口与曲目行物理推移联动](topics/albums/techdoc-album-detail-top-tracks-push-motion.md)
- [技术方案文档 (TECHDOC)：专辑列表页独立动态液态极光 Header 展架](topics/albums/techdoc-albums-page-liquid-aurora-header.md)
- [技术方案文档 (TECHDOC)：专辑列表页 Hi-Fi 发烧唱片馆藏与黑曜石控制架](topics/albums/techdoc-albums-page-obsidian-shelf.md)
- [技术方案文档 (TECHDOC)：专辑列表页阳极氧化拉丝金属内凹 Header 展架](topics/albums/techdoc-albums-page-recessed-metal-header.md)

### archive：音乐归档

- [聆听纪念成就判定与生命周期](topics/archive/TECHDOC-badge-achievements.md) — 按有效播放、日历日和完整专辑进度派生成就，不持久化点亮状态。
- [珐琅徽章浅肌理复用方案](topics/archive/TECHDOC-enamel-badge-surface-texture.md) — 同色微浮雕、参数模板、确定性几何生成、旧徽章适配与新徽章制作。

- [珐琅徽章 GLSL 美化工作流](topics/archive/WORKFLOW-enamel-badge-glsl.md) — 全部 11 枚徽章的通用配置、材质生成、共享渲染、预览导出与验证；命令见[工具说明](../scripts/badges/README.md)。
- [设计参考：复古未来主义](topics/archive/REFERENCE-retrofuturism-design.md) — 用户提供的原文参考，按需采用，不作为项目强制规范。界面与材质原型见[原型目录](../demo/README.md)。

### artwork：封面

- [Auralis 封面缓存压缩与迁移技术设计](topics/artwork/techdoc-artwork-cache-optimization.md)

### library：曲库

- [TECHDOC：确认删除文件后的曲库清理](topics/library/TECHDOC-deleted-track-cleanup-2026-10-04.md)
- [TECHDOC：歌曲改名与移动后的路径找回](topics/library/TECHDOC-track-path-relocation-2026-10-04.md)
- [TECHDOC：封面视图分割线与设备像素取整](topics/library/TECHDOC-cover-track-divider-pixel-snapping-2026-09-28.md)
- [TECHDOC：音乐来源行采用路径优先布局](topics/library/TECHDOC-music-source-path-priority-2026-09-28.md)
- [TECHDOC：歌曲页字重设置](topics/library/TECHDOC-song-font-weight-settings-2026-09-28.md)
- [TECHDOC：封面视图当前播放曲目的动态音柱](topics/library/TECHDOC-cover-track-playing-indicator-2026-09-28.md)

- [TECHDOC：曲库分页并发加载与快照生命周期](topics/library/TECHDOC-catalog-concurrent-load-2026-09-21.md)
- [TECHDOC：播放后歌曲列表视口被拽回当前曲](topics/library/techdoc-library-playback-viewport-restore.md)
- [TECHDOC：曲库初次加载文件夹扫描性能优化方案](topics/library/techdoc-library-initial-scan-performance-optimization.md)

### metadata：元数据

- [TECHDOC：外部元数据同步](topics/metadata/TECHDOC-external-metadata-sync-2026-11-06.md) — 当前只读文件边界、历史覆盖读回、备份恢复及播放读租约。

- [TECHDOC：元数据编辑面板扩展技术方案](topics/metadata/TECHDOC-metadata-editor-roadmap-2026-10-28.md) — E1–E6 的历史交付快照；内置元数据编辑及播放中编辑能力已移除。
- [TECHDOC：元数据体系优化技术方案](topics/metadata/TECHDOC-metadata-system-optimization-2026-10-28.md) — 审计发现、数据权威与历史覆盖、日期与格式适配、编辑契约、封面来源及分阶段验收；含 2026-10-28 实施与独立验收记录。
- [REPORT：当前曲库流派上层统计与映射草案](topics/metadata/REPORT-genre-upper-classification-2026-10-04.md)
- [TECHDOC：多值元数据统一处理规则](topics/metadata/TECHDOC-multivalue-metadata-2026-10-03.md)
- [TECHDOC：播放器占用歌曲的元数据编辑限制](topics/metadata/TECHDOC-playback-metadata-edit-guard-2026-09-30.md) — 历史方案；编辑能力已移除，正常播放读租约与旧备份恢复保留。
- [TECHDOC：元数据刷新后的文件指纹一致性](topics/metadata/TECHDOC-refresh-file-fingerprint-2026-09-21.md)
- [流派多值分隔符与原子复合流派方案](topics/metadata/plan-genre-delimiter-atomic-compounds.md)

### playback：播放界面

- [增强型 LRC 首期支持技术方案](topics/playback/TECHDOC-enhanced-lrc-support-2026-10-28.md) — 复用调研、A2 格式契约、片段同步、原文编辑保护及验收记录；L1–L4 完成，独立复验通过，全应用 smoke 的既有阻塞见文内。
- [全屏右侧歌词繁简右键菜单：施工技术文档](topics/playback/TECHDOC-fullscreen-lyrics-script-context-menu-2026-10-11.md) — 复用繁简偏好的方案记录，涵盖菜单、焦点、持久化、文字重测与施工提示词。
- [全屏歌词排版参数：施工技术文档](topics/playback/TECHDOC-fullscreen-lyrics-typography-settings-2026-10-10.md) — 设置分组、持久化、换行与定位刷新的方案记录。
- [TECHDOC：PlayerBar 控件颜色语义收敛](topics/playback/TECHDOC-playerbar-control-color-semantics-2026-09-27.md)
- [历史：TECHDOC：播放器颜色变量体系补全](topics/playback/TECHDOC-player-color-token-completion-2026-09-26.md) — 保留颜色变量迁移记录；MiniPlayer 与桌面歌词已移除，PlayerBar 与全屏覆盖层相关内容仅作历史及源码参考。
- [历史：TECHDOC：MiniPlayer 弹层可用性与窗口状态同步修复](topics/playback/TECHDOC-miniplayer-geometry-state-fixes-2026-09-28.md)
- [FullscreenPlayerOverlay 职责拆分技术设计](topics/playback/TECHDOC-fullscreen-player-overlay-refactor-2026-08-30.md)
- [历史：MiniPlayer 脚本职责拆分技术设计](topics/playback/TECHDOC-mini-player-script-refactor-2026-08-30.md)
- [PlayerBar 浮层控制器重构技术设计](topics/playback/TECHDOC-player-bar-overlay-controller-2026-08-30.md)
- [TECHDOC：无缝播放解码前的内存预算与回退](topics/playback/TECHDOC-gapless-memory-budget-2026-09-21.md)
- [TECHDOC：PlayerBar 与播放队列浮层材质统一](topics/playback/TECHDOC-playerbar-queue-surface-unification-2026-09-06.md)
- [TECHDOC：modern PlayerBar Liquid Glass 视觉保真修复](topics/playback/TECHDOC-playerbar-liquid-glass-visual-fidelity-2026-09-05.md)
- [TECHDOC：`usePlayback` 播放编排拆分](topics/playback/TECHDOC-use-playback-architecture-split-2026-08-30.md)
- [历史：TECHDOC：迷你模式下桌面歌词必须继续同步](topics/playback/TECHDOC-desktop-lyrics-miniplayer-sync.md)
- [TECHDOC：桌面歌词窗口不得拖住进程](topics/playback/TECHDOC-desktop-lyrics-window-lifecycle.md)
- [PRD：全局悬浮播放条交互与空间自适应重构](topics/playback/prd-playerbar-floating-adaptive.md)
- [TECHDOC：全局悬浮播放条交互与空间自适应重构](topics/playback/techdoc-playerbar-floating-adaptive.md)
- [PRD：PlayerBar 纽扣式内凹播放按钮](topics/playback/PRD-playerbar-matte-depth-2026-08-29.md)
- [全屏播放界面动态流体背景 TECHDOC](topics/playback/techdoc-fullscreen-album-palette-background.md)
- [TECHDOC：modern PlayerBar 纽扣式内凹播放按钮](topics/playback/TECHDOC-playerbar-matte-depth-2026-08-29.md)
- [Modern PlayerBar 播放按钮：取色与可用状态](topics/playback/TECHDOC-playerbar-modern-play-button-2026-08-28.md)
- [TECHDOC：modern PlayerBar 外壳圆角增大](topics/playback/TECHDOC-playerbar-radius-2026-08-29.md)

### shell：应用外壳

- [侧边栏过场风格文案模式](topics/shell/spec-sidebar-footer-flavor-modes.md)
- [施工文档：浅色与深色强调色独立配置](topics/shell/IMPLEMENTATION-light-dark-theme-accent-2026-10-04.md) — 独立偏好、跟随应用主题编辑、可读颜色、效果预览与开屏首帧。

- [施工文档：英文与数字字体统一，Georgia 仅用于碟片标题](topics/shell/IMPLEMENTATION-latin-numeral-font-unification-2026-10-02.md) — 顺序分批迁移通用界面、CD、歌词、声迹 DOM 与 Canvas，保留现有中文字体。

- [历史：TECHDOC 深色模式自定义强调色](topics/shell/TECHDOC-custom-dark-accent-2026-10-02.md) — 原深色单主题提案；已由后续浅色与深色双主题实施记录替代。
- [TECHDOC：跟随主题的 Logo 开屏动画](topics/shell/TECHDOC-theme-aware-splash-logo-2026-09-29.md) — 2026-09-29 施工方案快照；开屏已接入，后续默认色与时序以当前源码为准。
- [TECHDOC：Auralis 语义字体体系](topics/shell/TECHDOC-semantic-font-system-2026-09-29.md)
- [TECHDOC：主界面歌词面板收起与展开](topics/shell/TECHDOC-collapsible-lyrics-panel-2026-09-28.md)
- [TECHDOC：深色主题中性黑与霓虹玫红配色](topics/shell/TECHDOC-dark-theme-midnight-rose-2026-09-27.md)
- [全局浅色配色预设](topics/shell/light-theme-color-presets.md)
- [主窗口改用 Electron 原生标题栏方案](topics/shell/plan-native-window-chrome.md)
- [Sidebar 品牌区方案 A：品牌与工具分行](topics/shell/plan-sidebar-brand-two-row-header.md)
- [Auralis 原生窗口壳（无框 + 专辑色融入）TECHDOC](topics/shell/techdoc-auralis-native-window-chrome.md)
- [TECHDOC：Sidebar 首次路由切换预热](topics/shell/techdoc-sidebar-first-navigation-warmup.md)
- [Sidebar 工具簇：雾面薄壳 TECHDOC](topics/shell/techdoc-sidebar-tool-cluster-mist-capsule.md)

## 项目档案

### 架构减重

以下为同一轮项目的方案和阶段提示词，按 Phase 顺序阅读。原文状态对应当时的工作快照。

- [目标架构与 Phase 1 IPC 重构方案](projects/architecture-simplification/Auralis%20%E7%9B%AE%E6%A0%87%E6%9E%B6%E6%9E%84%E4%B8%8E%20Phase%201%20IPC%20%E9%87%8D%E6%9E%84%E6%96%B9%E6%A1%88.md)
- [Phase 2：PlaybackController 精修提示词](projects/architecture-simplification/Auralis%20Phase%202%20PlaybackController%20%E7%B2%BE%E4%BF%AE%E6%8F%90%E7%A4%BA%E8%AF%8D.md)
- [Phase 3：Renderer 大组件减重提示词](projects/architecture-simplification/Auralis%20Phase%203%20Renderer%20%E5%A4%A7%E7%BB%84%E4%BB%B6%E5%87%8F%E9%87%8D%E6%8F%90%E7%A4%BA%E8%AF%8D.md)
- [Phase 4：Gate Review 提示词](projects/architecture-simplification/Auralis%20Phase%204%20Gate%20Review%20%E6%8F%90%E7%A4%BA%E8%AF%8D.md)

### AMDL 接入

- [AMDL 施工阶段计划](projects/amdl-integration/AMDL%E6%96%BD%E5%B7%A5PHASE.md)
- [AMDL Phase 0 架构确认记录](projects/amdl-integration/Gemini%E5%85%B3%E4%BA%8EPhase0%E7%9A%84%E5%9B%9E%E5%A4%8D.md)

### 播放栏可见性恢复

- [PlayerBar 可见性恢复技术文档](projects/playerbar-visibility-recovery/TECHDOC.md)

### 手稿皮肤（已移除，历史归档）

该皮肤已从当前产品移除。以下内容仅为总体方案和旧交付快照；Phase 按数字自然排序，未出现的阶段不自动列为待办。

#### 总体材料

- [Auralis 手稿皮肤交付状态与后续路线图](projects/library-manuscript-skin-mvp/DELIVERY-ROADMAP.md)
- [TECHDOC：全部歌曲页手稿皮肤 MVP](projects/library-manuscript-skin-mvp/TECHDOC.md)

#### Phase 5

- [手稿皮肤 MVP — Phase 5 交付记录](projects/library-manuscript-skin-mvp/phase5/DELIVERY.md)
- [Phase 5 验收截图](projects/library-manuscript-skin-mvp/phase5/screenshots/README.md)

#### Phase 6

- [Phase 6 基线（Step 6.0）](projects/library-manuscript-skin-mvp/phase6/BASELINE.md)
- [手稿视觉系统固化 — Phase 6 交付记录](projects/library-manuscript-skin-mvp/phase6/DELIVERY.md)
- [Phase 6 实现审查报告](projects/library-manuscript-skin-mvp/phase6/REVIEW.md)
- [Phase 6 截图](projects/library-manuscript-skin-mvp/phase6/screenshots/README.md)
- [TECHDOC：手稿视觉系统固化（Phase 6）](projects/library-manuscript-skin-mvp/phase6/TECHDOC.md)

#### Phase 7

- [手稿曲库编排 Phase 7 基线](projects/library-manuscript-skin-mvp/phase7/BASELINE.md)
- [手稿曲库编排 Phase 7 交付记录](projects/library-manuscript-skin-mvp/phase7/DELIVERY.md)
- [Phase 7 截图归档说明](projects/library-manuscript-skin-mvp/phase7/screenshots/README.md)
- [TECHDOC：深化全部歌曲页的视觉编排（Phase 7）](projects/library-manuscript-skin-mvp/phase7/TECHDOC.md)

#### Phase 8

- [Phase 8 基线记录：全部歌曲页交互视觉闭环与可访问性](projects/library-manuscript-skin-mvp/phase8/BASELINE.md)
- [Phase 8 交付记录：全部歌曲页交互视觉闭环与可访问性](projects/library-manuscript-skin-mvp/phase8/DELIVERY.md)
- [Phase 8 截图归档说明](projects/library-manuscript-skin-mvp/phase8/screenshots/README.md)
- [TECHDOC：全部歌曲页交互视觉闭环与可访问性（Phase 8）](projects/library-manuscript-skin-mvp/phase8/TECHDOC.md)

#### Phase 9

- [Phase 9 基线记录：全部歌曲页视觉稳定性与大曲库耐久性](projects/library-manuscript-skin-mvp/phase9/BASELINE.md)
- [Phase 9 交付记录：全部歌曲页视觉稳定性与大曲库耐久性](projects/library-manuscript-skin-mvp/phase9/DELIVERY.md)
- [TECHDOC：全部歌曲页视觉稳定性与大曲库耐久性（Phase 9）](projects/library-manuscript-skin-mvp/phase9/TECHDOC.md)

#### Phase 10

- [Phase 10 基线](projects/library-manuscript-skin-mvp/phase10/BASELINE.md)
- [Phase 10 交付记录：全部歌曲页自动化回归护栏](projects/library-manuscript-skin-mvp/phase10/DELIVERY.md)
- [Phase 10 技术设计：全部歌曲页自动化回归护栏](projects/library-manuscript-skin-mvp/phase10/TECHDOC.md)

#### Phase 11

- [Phase 11 基线](projects/library-manuscript-skin-mvp/phase11/BASELINE.md)
- [Phase 11 交付记录：大曲库稳定快照与分块 IPC](projects/library-manuscript-skin-mvp/phase11/DELIVERY.md)
- [Phase 11 技术设计：大曲库稳定快照与分块 IPC](projects/library-manuscript-skin-mvp/phase11/TECHDOC.md)

#### Phase 12

- [Phase 12 基线](projects/library-manuscript-skin-mvp/phase12/BASELINE.md)
- [Phase 12 交付记录](projects/library-manuscript-skin-mvp/phase12/DELIVERY.md)
- [TECHDOC：手稿皮肤覆盖专辑目录（Phase 12）](projects/library-manuscript-skin-mvp/phase12/TECHDOC.md)

#### Phase 13

- [Phase 13 基线](projects/library-manuscript-skin-mvp/phase13/BASELINE.md)
- [Phase 13 交付与审查记录](projects/library-manuscript-skin-mvp/phase13/DELIVERY.md)
- [TECHDOC：手稿皮肤覆盖专辑详情页（Phase 13）](projects/library-manuscript-skin-mvp/phase13/TECHDOC.md)

#### Phase 14

- [Phase 14 基线](projects/library-manuscript-skin-mvp/phase14/BASELINE.md)
- [Phase 14 交付与审查记录](projects/library-manuscript-skin-mvp/phase14/DELIVERY.md)
- [TECHDOC：手稿皮肤覆盖归档页（Phase 14）](projects/library-manuscript-skin-mvp/phase14/TECHDOC.md)

#### Phase 15

- [Phase 15 基线](projects/library-manuscript-skin-mvp/phase15/BASELINE.md)
- [Phase 15 交付记录：手稿皮肤覆盖普通与智能歌单](projects/library-manuscript-skin-mvp/phase15/DELIVERY.md)
- [TECHDOC：手稿皮肤覆盖普通歌单与智能歌单（Phase 15）](projects/library-manuscript-skin-mvp/phase15/TECHDOC.md)

#### Phase 16

- [Phase 16 基线](projects/library-manuscript-skin-mvp/phase16/BASELINE.md)
- [Phase 16 交付记录：设置页手稿化与集中外观入口](projects/library-manuscript-skin-mvp/phase16/DELIVERY.md)
- [TECHDOC：设置页手稿化与集中外观入口（Phase 16）](projects/library-manuscript-skin-mvp/phase16/TECHDOC.md)

#### Phase 17

- [Phase 17 基线](projects/library-manuscript-skin-mvp/phase17/BASELINE.md)
- [Phase 17 交付记录：应用外壳与 Sidebar 手稿化](projects/library-manuscript-skin-mvp/phase17/DELIVERY.md)
- [TECHDOC：应用外壳与 Sidebar 手稿化（Phase 17）](projects/library-manuscript-skin-mvp/phase17/TECHDOC.md)

#### Phase 18

- [Phase 18 基线](projects/library-manuscript-skin-mvp/phase18/BASELINE.md)
- [Phase 18 交付记录：Now Playing 与 PlayerBar 手稿化](projects/library-manuscript-skin-mvp/phase18/DELIVERY.md)
- [TECHDOC：Now Playing 与 PlayerBar 手稿化（Phase 18）](projects/library-manuscript-skin-mvp/phase18/TECHDOC.md)

#### Phase 22

- [Phase 22 基线](projects/library-manuscript-skin-mvp/phase22/BASELINE.md)
- [Phase 22 交付记录：歌曲列表页取消整页卡片](projects/library-manuscript-skin-mvp/phase22/DELIVERY.md)
- [TECHDOC：歌曲列表页取消整页卡片（Phase 22）](projects/library-manuscript-skin-mvp/phase22/TECHDOC.md)

#### Phase 23

- [Phase 23 基线](projects/library-manuscript-skin-mvp/phase23/BASELINE.md)
- [Phase 23 交付记录：手稿 PlayerBar 吸底页脚](projects/library-manuscript-skin-mvp/phase23/DELIVERY.md)
- [TECHDOC：手稿 PlayerBar 主栏页脚（Phase 23 方案 A）](projects/library-manuscript-skin-mvp/phase23/TECHDOC.md)

### 曲库页面编排

- [LibraryPage 编排拆分实现报告](projects/library-page-orchestration/IMPLEMENTATION-REPORT.md)
- [LibraryPage 编排拆分代码审查](projects/library-page-orchestration/REVIEW.md)
- [TECHDOC：LibraryPage 编排拆分](projects/library-page-orchestration/TECHDOC.md)

## 历史批次

仅索引仍保留的较新批次；历史不等于废弃，也不表示任务继续生效。

### 批次 2026-08-14

#### 01-Playbar-layout

- [Auralis manuscript Playbar 布局优化 PRD](history/2026-08-14/01-Playbar-layout/Auralis%20manuscript%20Playbar%20%E5%B8%83%E5%B1%80%E4%BC%98%E5%8C%96%20PRD.md)
- [Auralis manuscript Playbar 布局优化技术设计](history/2026-08-14/01-Playbar-layout/Auralis%20manuscript%20Playbar%20%E5%B8%83%E5%B1%80%E4%BC%98%E5%8C%96%E6%8A%80%E6%9C%AF%E8%AE%BE%E8%AE%A1.md)

#### 02-modern-playbar-island

- [Auralis modern Playbar 浮岛重设计](history/2026-08-14/02-modern-playbar-island/Auralis%20modern%20Playbar%20%E6%B5%AE%E5%B2%9B%E9%87%8D%E8%AE%BE%E8%AE%A1.md)

#### 03-settings-ia

- [Auralis 设置页信息结构重设计](history/2026-08-14/03-settings-ia/Auralis%20%E8%AE%BE%E7%BD%AE%E9%A1%B5%E4%BF%A1%E6%81%AF%E7%BB%93%E6%9E%84%E9%87%8D%E8%AE%BE%E8%AE%A1.md)
- [设置页信息结构重设计 Implementation Plan](history/2026-08-14/03-settings-ia/IMPLEMENTATION.md)

## 可复用经验

- [GPT-6.1 Sol 任务与推理档位参考](lessons/gpt-6.1-sol-reasoning-reference.md) — 典型任务映射、升降档条件、分阶段选择与官方依据；作为参考，不修改协作规则。
- [经验索引](lessons/README.md) — 按任务选择复盘与对应清理证据。
- [UI 冗余清理经验](lessons/2026-10-06-ui-cleanup-lessons.md) — 入口、生命周期、CSS 匹配、共享边界与验证证据。
- [CD 浏览页开发复盘](lessons/2026-10-04-cd-browser-development-lessons.md) — 原型选择、真实操作、音频效果、短时动效、动态配色、开源复用及旧方案清理经验。
- [侧边栏 UI 迭代经验](lessons/2026-10-14-sidebar-ui-iteration-lessons.md) — 图标重量、对齐、文案边界、状态来源与配色材质。
- [珐琅徽章 GLSL 原型排查复盘](lessons/2026-10-24-enamel-glsl-debugging-lessons.md) — 阶段日志、验收调用时序、异步输入、DPR 与法线精度。
- [深浅主题切换性能优化复盘](lessons/2026-11-06-theme-transition-performance-lessons.md) — 共享动效范围、继承变量、样式读写时序、同色序列化、文字对比度与可见窗口测量。

## 审查记录

[按问题查找审查与验证记录](reviews/README.md)。以下保留逐篇入口，进度与结论属于原文记录的时间和范围。

### 架构、重构与清理

- [后端模块优化建议](reviews/2026-11-06-backend-module-optimization-review.md) — 按模块持续追加代码依据、优化顺序与验收方式。
- [后端模块性能与行为优化建议](reviews/2026-11-06-backend-optimization-review.md) — 频谱分析与播放资源解析的只读审查、优化优先级及验收条件。
- [后端模块改进建议](reviews/2026-11-06-backend-optimization-notes.md) — 曲库快照、全量扫描与文件监听，记录建议及验收边界，尚未实施。
- [P1–P2 重构汇报](reviews/2026-10-23-p1-p2-refactor-report.md)
- [高复杂度单文件重构待办：P2–P3](reviews/2026-10-23-complexity-refactor-backlog.md) — 原审计排序、指标与后续拆分边界，结合交付汇报阅读。
- [2026-10-16 代码审计](reviews/2026-10-16-1742-code-audit.md)
- [面向新产品重建的资产审查](reviews/product-rebuild-asset-audit-2026-09-27.md)
- [2026-10-20 工作区清理与整理方案](reviews/2026-10-20-workspace-cleanup-plan.md) — 当时的清理候选、演示迁移及执行限制。
- [第一批冗余清理记录](reviews/2026-10-06-confirmed-redundancy-cleanup.md)。
- [第二批冗余筛查与清理记录](reviews/2026-10-06-redundancy-second-pass.md)。
- [架构 Review 落地修复汇总](reviews/2026-07-17-architecture-review-fixes.md)

### 开源复用与替换评估

- [Auralis 自写实现与开源复用审计](reviews/2026-10-04-open-source-reuse-audit.md) — 源码与成熟实现对照、替换优先级、迁移边界及建议保留项。
- [封面聚类替换记录](reviews/2026-10-04-artwork-palette-replacement.md)
- [Culori 颜色计算替换](reviews/2026-10-04-culori-color-math-replacement.md)
- [Floating UI 定位替换](reviews/2026-10-04-floating-ui-positioning-replacement.md)
- [focus-trap 焦点管理替换](reviews/2026-10-04-focus-trap-replacement.md)
- [IPC Valibot 替换与验收交接](reviews/2026-10-04-ipc-valibot-replacement.md)
- [日志 Worker transport 替换](reviews/2026-10-04-logging-transport-replacement.md)
- [Chokidar 元数据监听替换](reviews/2026-10-04-metadata-watch-chokidar.md)
- [opencc-js 搜索繁简归一化评估](reviews/2026-10-04-opencc-search-normalization-evaluation.md)

### 环境、数据与界面诊断

- [液态玻璃参数设置项：布局审查与建议方案](reviews/2026-10-25-liquid-glass-parameter-layout-review.md) — 基于用户截图的布局问题、三列与窄屏方案、实施边界及待验收清单。
- [2026-09-28 Electron 启动崩溃：安装目录 ACL 与沙箱兼容问题](reviews/2026-09-28-electron-startup-acl-crash.md)
- [mpv 播放中标签保存施工交接](reviews/2026-10-08-mpv-buffered-tag-write.md)
- [Auralis 主题与颜色体系审计报告](reviews/%E6%92%AD%E6%94%BE%E5%99%A8%E4%B8%BB%E9%A2%98%E9%85%8D%E8%89%B2%E5%AE%A1%E8%AE%A1%E6%8A%A5%E5%91%8A.md)
- [桌面歌词窗口生命周期审查](reviews/REVIEW-desktop-lyrics-window-lifecycle.md)
- [专辑列表页 UI 审查与重构优化诊断报告 (Albums Page UI Audit & Optimization Spec)](reviews/2026-07-25-albums-page-ui-audit-fixes.md)

## 交接记录

[按任务查找施工提示词与交接记录](handoffs/README.md)。

- [2026-09-12：曲库滚动条布局修复提示词](handoffs/20260912%E4%BF%AE%E5%A4%8D1.md)
- [Auralis 剩余优化工作交付文档](handoffs/HANDOFF-remaining-work-2026-08-28.md)
- [标签写回、播放租约与退出对账施工提示词](handoffs/2026-10-15-tag-write-lease-shutdown-construction.md)
- [Playbar Liquid Glass 隔离原型施工提示词](handoffs/2026-10-15-playbar-liquid-glass-prototype-construction.md)
- [Playbar 毛玻璃与样式切换接入施工提示词](handoffs/2026-10-15-playbar-material-switch-construction.md)
- [最近添加固定资料库入口施工提示词](handoffs/2026-10-15-recent-added-library-6lunamax.md)
- [Mac CRT 去噪入场动效施工说明](handoffs/mac-crt-denoise-transition.md)
- [完整移除迷你播放器施工提示词](handoffs/PROMPT-remove-miniplayer-2026-09-28.md)

交接记录保留中断位置与当时待办，不构成继续执行授权。

## 演示

- [珐琅徽章 GLSL 反光替换样板](../demo/archive/enamel-milestone/glsl/README.md) — 100 小时徽章的原版／动态材质对照、材质生成和隔离验证。
- [唱片材质原型](../demo/albums/disc-material/README.md) — 独立材质实验及其运行说明。

- [原型目录与分类](../demo/README.md)

HTML 演示是独立探索资料，不代表应用当前外观或实现。
