# 完整文档索引

[返回文档入口](README.md)

按用途、产品主题与项目阶段组织；日期目录只在历史批次中保留，不使用 Windows 创建时间排序。
本地目录截至 2026-08-29 共收录 166 份 Markdown / HTML 文件，包含入口和本索引自身。

索引同时包含共享文档和本地研究资料；Git 检出不保证全部目标存在，缺资料不等于已删除。
当前忽略策略以仓库 `.gitignore` 为准；目录归类和收录不代表文件已提交或已同步。
标题沿用原文，以便搜索；“已交付”“待办”等原文措辞只代表当时记录，不是本索引重新确认的状态。

已知替代关系见[主题说明](topics/README.md)，阶段状态阅读限制见[项目说明](projects/README.md)。

## 入口与架构

- [Auralis 架构说明](ARCHITECTURE.md)
- [完整文档索引（本页）](CATALOG.md)
- [历史批次说明](history/README.md)
- [项目档案说明](projects/README.md)
- [文档入口](README.md)
- [主题方案说明](topics/README.md)

## 协作规则

- [架构与 IPC](rules/architecture.md)
- [环境与操作](rules/environment.md)
- [Git 与发布](rules/git-release.md)
- [曲库与数据](rules/library-data.md)
- [Renderer 视觉与交互](rules/renderer.md)
- [风险分级验收](rules/validation.md)

## 主题方案

独立方案按主题收拢；同主题早期资料仍可在下方历史批次中查找。

### albums：专辑

- [专辑详情页重构 MVP 实施计划 (Album Detail Page Redesign MVP Plan)](topics/albums/2026-07-25-album-detail-redesign-plan.md)
- [产品需求文档 (PRD)：专辑详情页退出景深沉降过渡](topics/albums/prd-album-detail-exit-transition.md)
- [产品需求文档 (PRD)：专辑详情页热门单曲右下角入口与物理推移联动](topics/albums/prd-album-detail-top-tracks-push.md)
- [产品需求文档 (PRD)：专辑列表页独立动态液态极光 Header 展架](topics/albums/prd-albums-page-liquid-aurora-header.md)
- [产品需求文档 (PRD)：专辑列表页 Hi-Fi 发烧唱片馆藏与黑曜石控制架](topics/albums/prd-albums-page-obsidian-shelf.md)
- [产品需求文档 (PRD)：专辑列表页阳极氧化拉丝金属内凹 Header 展架](topics/albums/prd-albums-page-recessed-metal-header.md)
- [技术方案文档 (TECHDOC)：专辑详情页退出景深沉降过渡](topics/albums/techdoc-album-detail-exit-transition-motion.md)
- [技术方案文档：专辑详情页沉浸式 Hero 巨幕重构 (Album Detail Hero Billboard Technical Spec)](topics/albums/techdoc-album-detail-hero-billboard-redesign.md)
- [技术方案文档 (TECHDOC)：热门单曲右下角入口与曲目行物理推移联动](topics/albums/techdoc-album-detail-top-tracks-push-motion.md)
- [技术方案文档 (TECHDOC)：专辑列表页独立动态液态极光 Header 展架](topics/albums/techdoc-albums-page-liquid-aurora-header.md)
- [技术方案文档 (TECHDOC)：专辑列表页 Hi-Fi 发烧唱片馆藏与黑曜石控制架](topics/albums/techdoc-albums-page-obsidian-shelf.md)
- [技术方案文档 (TECHDOC)：专辑列表页阳极氧化拉丝金属内凹 Header 展架](topics/albums/techdoc-albums-page-recessed-metal-header.md)

### archive：音乐归档

- [产品需求文档 (PRD)：声迹页面黑胶封套抽盘交互式年度摘要](topics/archive/prd-archive-annual-vinyl-jacket-summary.md)
- [PRD: 声迹页面“Music DNA 音乐基因与风格图谱”模块](topics/archive/prd-archive-music-dna-spectrum.md)
- [技术架构文档 (TECHDOC)：声迹页面黑胶封套抽盘交互式年度摘要实现方案](topics/archive/techdoc-archive-annual-vinyl-jacket-summary.md)
- [TECHDOC: Music DNA 环形图 Hover/锁定 → 流派 Top 3 曲目](topics/archive/techdoc-archive-music-dna-ring-top-tracks.md)
- [TECHDOC: 声迹页面“Music DNA 音乐基因与风格图谱”技术设计文档](topics/archive/techdoc-archive-music-dna-spectrum.md)
- [Archive 听歌排行历史回看技术方案](topics/archive/techdoc-archive-ranking-history.md)

### artwork：封面

- [Auralis 封面缓存压缩与迁移技术设计](topics/artwork/techdoc-artwork-cache-optimization.md)

### library：曲库

- [修复 Library 歌曲列表滚动掉帧](topics/library/fix-song-row-scroll-jank.md)
- [TECHDOC：播放后歌曲列表视口被拽回当前曲](topics/library/techdoc-library-playback-viewport-restore.md)

### metadata：元数据

- [流派多值分隔符与原子复合流派方案](topics/metadata/plan-genre-delimiter-atomic-compounds.md)

### playback：播放界面

- [TECHDOC：`usePlayback` 播放编排拆分](topics/playback/TECHDOC-use-playback-architecture-split-2026-08-30.md)
- [TECHDOC：迷你模式下桌面歌词必须继续同步](topics/playback/TECHDOC-desktop-lyrics-miniplayer-sync.md)
- [TECHDOC：桌面歌词窗口不得拖住进程](topics/playback/TECHDOC-desktop-lyrics-window-lifecycle.md)
- [PRD：PlayerBar 纽扣式内凹播放按钮](topics/playback/PRD-playerbar-matte-depth-2026-08-29.md)
- [全屏播放界面动态流体背景 TECHDOC](topics/playback/techdoc-fullscreen-album-palette-background.md)
- [全屏播放器动态流光背景 TECHDOC](topics/playback/techdoc-fullscreen-fluid-gradient.md)
- [TECHDOC：modern PlayerBar 纽扣式内凹播放按钮](topics/playback/TECHDOC-playerbar-matte-depth-2026-08-29.md)
- [Modern PlayerBar 播放按钮：取色与可用状态](topics/playback/TECHDOC-playerbar-modern-play-button-2026-08-28.md)
- [TECHDOC：modern PlayerBar 外壳圆角增大](topics/playback/TECHDOC-playerbar-radius-2026-08-29.md)

### shell：应用外壳

- [主窗口改用 Electron 原生标题栏方案](topics/shell/plan-native-window-chrome.md)
- [Sidebar 品牌区：仅保留「Auralis」完整显示](topics/shell/plan-sidebar-brand-auralis-only.md)
- [Sidebar 品牌区方案 A：品牌与工具分行](topics/shell/plan-sidebar-brand-two-row-header.md)
- [PRD: 侧边栏头部与工具栏重构 (Sidebar Header & Toolbar Redesign)](topics/shell/prd-sidebar-header-redesign.md)
- [Auralis 原生窗口壳（无框 + 专辑色融入）TECHDOC](topics/shell/techdoc-auralis-native-window-chrome.md)
- [TECHDOC: 侧边栏头部与工具栏重构技术设计文档](topics/shell/techdoc-sidebar-header-redesign.md)
- [Sidebar 工具簇：雾面薄壳 TECHDOC](topics/shell/techdoc-sidebar-tool-cluster-mist-capsule.md)
- [UI 界面语言：简 / 繁 / 英 TECHDOC](topics/shell/techdoc-ui-locale-zh-hans-hant-en.md)

## 项目档案

### 手稿皮肤

总体方案和旧交付快照；Phase 按数字自然排序，未出现的阶段不自动列为待办。

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

保留原批次及其内部主题结构；历史不等于废弃，也不表示任务继续生效。

### 批次 2026-06-24

#### 01-曲库加载

- [播放功能代码改动.md](history/2026-06-24/01-曲库加载/播放功能代码改动.md)
- [歌曲列表 UI 修复方案.md](history/2026-06-24/01-曲库加载/歌曲列表%20UI%20修复方案.md)
- [扫描内 Album Artwork Cache 改动记录](history/2026-06-24/01-曲库加载/扫描内%20Album%20Artwork%20Cache%20改动记录.md)
- [Auralis 播放次数记录模块 PRD](history/2026-06-24/01-曲库加载/Auralis%20播放次数记录模块%20PRD.md)
- [Auralis 播放次数记录模块 TECHDOC](history/2026-06-24/01-曲库加载/Auralis%20播放次数记录模块%20TECHDOC.md)
- [Auralis 播放功能第一版 PRD](history/2026-06-24/01-曲库加载/Auralis%20播放功能第一版%20PRD.md)
- [Auralis 播放功能第一版技术设计文档](history/2026-06-24/01-曲库加载/Auralis%20播放功能第一版技术设计文档.md)
- [Auralis 年份与完整日期 Metadata 技术设计](history/2026-06-24/01-曲库加载/Auralis%20年份与完整日期%20Metadata%20技术设计.md)
- [Auralis 年份与完整日期 Metadata PRD](history/2026-06-24/01-曲库加载/Auralis%20年份与完整日期%20Metadata%20PRD.md)
- [Auralis 曲库加载 PRD](history/2026-06-24/01-曲库加载/Auralis%20曲库加载%20PRD.md)
- [Auralis 曲库加载技术设计](history/2026-06-24/01-曲库加载/Auralis%20曲库加载技术设计.md)
- [Auralis 扫描内 Album Artwork Cache 技术设计](history/2026-06-24/01-曲库加载/Auralis%20扫描内%20Album%20Artwork%20Cache%20技术设计.md)
- [Auralis 悬浮 Playbar 技术设计](history/2026-06-24/01-曲库加载/Auralis%20悬浮%20Playbar%20技术设计.md)
- [Auralis 悬浮 Playbar PRD](history/2026-06-24/01-曲库加载/Auralis%20悬浮%20Playbar%20PRD.md)
- [Auralis 专辑封面加载系统 PRD](history/2026-06-24/01-曲库加载/Auralis%20专辑封面加载系统%20PRD.md)
- [Auralis 专辑封面加载系统技术设计](history/2026-06-24/01-曲库加载/Auralis%20专辑封面加载系统技术设计.md)
- [Auralis Library 封面视图 PRD.md](history/2026-06-24/01-曲库加载/Auralis%20Library%20封面视图%20PRD.md)
- [Auralis Library 封面视图 TECHDOC.md](history/2026-06-24/01-曲库加载/Auralis%20Library%20封面视图%20TECHDOC.md)
- [Auralis Library 歌曲列表 UI/UX 文档](history/2026-06-24/01-曲库加载/Auralis%20Library%20歌曲列表%20UI%20&%20UX%20文档.md)
- [Auralis Library 歌曲列表轻量搜索定位 TECHDOC](history/2026-06-24/01-曲库加载/Auralis%20Library%20歌曲列表轻量搜索定位%20TECHDOC.md)
- [Auralis Library 原生滚动歌曲列表 TECHDOC](history/2026-06-24/01-曲库加载/Auralis%20Library%20原生滚动歌曲列表%20TECHDOC.md)
- [Auralis Playbar 播放队列浮层 TECHDOC](history/2026-06-24/01-曲库加载/Auralis%20Playbar%20播放队列浮层%20TECHDOC.md)
- [Auralis Playbar 播放模式切换 TECHDOC](history/2026-06-24/01-曲库加载/Auralis%20Playbar%20播放模式切换%20TECHDOC.md)
- [Auralis Playbar 下方空白修复方案](history/2026-06-24/01-曲库加载/Auralis%20Playbar%20下方空白修复方案.md)

#### 02-主题与Sidebar

- [基础主题底色与 Sidebar 悬浮化 — 实现 Review](history/2026-06-24/02-主题与Sidebar/基础主题底色与Sidebar悬浮化%20—%20实现Review.md)
- [右侧歌词面板改动记录](history/2026-06-24/02-主题与Sidebar/右侧歌词面板改动记录.md)
- [Auralis 基础主题底色与 Sidebar 悬浮化 PRD](history/2026-06-24/02-主题与Sidebar/Auralis%20基础主题底色与%20Sidebar%20悬浮化%20PRD.md)
- [Auralis 基础主题底色与 Sidebar 悬浮化技术设计](history/2026-06-24/02-主题与Sidebar/Auralis%20基础主题底色与%20Sidebar%20悬浮化技术设计.md)
- [Auralis 深浅色主题切换按钮 PRD](history/2026-06-24/02-主题与Sidebar/Auralis%20深浅色主题切换按钮%20PRD.md)
- [Auralis 深浅色主题切换按钮技术设计](history/2026-06-24/02-主题与Sidebar/Auralis%20深浅色主题切换按钮技术设计.md)
- [Auralis 深浅色主题切换柔边墙纸覆盖 TECHDOC.md](history/2026-06-24/02-主题与Sidebar/Auralis%20深浅色主题切换柔边墙纸覆盖%20TECHDOC.md)
- [Auralis 深浅色主题切换柔和过渡 TECHDOC](history/2026-06-24/02-主题与Sidebar/Auralis%20深浅色主题切换柔和过渡%20TECHDOC.md)
- [Auralis 右侧歌词面板 PRD](history/2026-06-24/02-主题与Sidebar/Auralis%20右侧歌词面板%20PRD.md)
- [Auralis 右侧歌词面板技术设计](history/2026-06-24/02-主题与Sidebar/Auralis%20右侧歌词面板技术设计.md)
- [Auralis 自定义应用 Title Bar TECHDOC](history/2026-06-24/02-主题与Sidebar/Auralis%20自定义应用%20Title%20Bar%20TECHDOC.md)
- [Auralis AppShell 低饱和径向环境光背景 TECHDOC](history/2026-06-24/02-主题与Sidebar/Auralis%20AppShell%20低饱和径向环境光背景%20TECHDOC.md)

#### 03-Metadata系统

- [Auralis 自动库同步：删除、恢复、移动识别 Task 拆解](history/2026-06-24/03-Metadata系统/Auralis%20自动库同步%20删除恢复移动识别%20Task%20拆解.md)
- [Auralis Metadata System 技术设计](history/2026-06-24/03-Metadata系统/Auralis%20Metadata%20System%20技术设计.md)
- [Auralis Metadata System PRD](history/2026-06-24/03-Metadata系统/Auralis%20Metadata%20System%20PRD.md)
- [Metadata System 与自动入库改动记录](history/2026-06-24/03-Metadata系统/Metadata%20System%20与自动入库改动记录.md)

### 批次 2026-07-01

#### 02-主题与Sidebar

- [Auralis Wallpaper Switch 径向主题切换 TECHDOC](history/2026-07-01/02-主题与Sidebar/Auralis%20Wallpaper%20Switch%20径向主题切换%20TECHDOC.md)

### 批次 2026-07-18

- [Auralis 专辑漫游（Roam）MVP 技术设计](history/2026-07-18/Auralis%20专辑漫游%20MVP%20TECHDOC.md)
- [Auralis Android — Agent 交接与启动指南](history/2026-07-18/Auralis-Android-Agent-HANDOFF.md)
- [2026-07-18 会话工作与经验沉淀（摘要重建）](history/2026-07-18/session-notes.md)

### 批次 2026-07-23

- [Auralis 专辑详情页布局技术设计](history/2026-07-23/Auralis%20专辑详情页布局%20TECHDOC.md)

### 批次 2026-08-14

#### 01-Playbar-layout

- [Auralis manuscript Playbar 布局优化 PRD](history/2026-08-14/01-Playbar-layout/Auralis%20manuscript%20Playbar%20布局优化%20PRD.md)
- [Auralis manuscript Playbar 布局优化技术设计](history/2026-08-14/01-Playbar-layout/Auralis%20manuscript%20Playbar%20布局优化技术设计.md)

#### 02-modern-playbar-island

- [Auralis modern Playbar 浮岛重设计](history/2026-08-14/02-modern-playbar-island/Auralis%20modern%20Playbar%20浮岛重设计.md)

#### 03-settings-ia

- [Auralis 设置页信息结构重设计](history/2026-08-14/03-settings-ia/Auralis%20设置页信息结构重设计.md)
- [设置页信息结构重设计 Implementation Plan](history/2026-08-14/03-settings-ia/IMPLEMENTATION.md)

## 审查记录

- [桌面歌词窗口生命周期审查](reviews/REVIEW-desktop-lyrics-window-lifecycle.md)
- [架构 Review 落地修复汇总](reviews/2026-07-17-architecture-review-fixes.md)
- [专辑列表页 UI 审查与重构优化诊断报告 (Albums Page UI Audit & Optimization Spec)](reviews/2026-07-25-albums-page-ui-audit-fixes.md)
- [示范审查（教学用）](reviews/2026-08-05-demo-audit/README.md)
- [Round 0 — 定尺（IPC / 进程边界）](reviews/2026-08-05-demo-audit/round-00-定尺-IPC边界.md)
- [Round 1 — 模块：歌曲页（Library）](reviews/2026-08-05-demo-audit/round-01-模块-歌曲页.md)
- [示范评分卡（R0 + 歌曲页）](reviews/2026-08-05-demo-audit/scorecard-demo.md)

## 交接记录

- [Auralis 剩余优化工作交付文档](handoffs/HANDOFF-remaining-work-2026-08-28.md)

交接记录保留中断位置与当时待办，不构成继续执行授权。

## 演示

- [Auralis · 动态流光取色实验](demos/apple-music-flow-demo.html)
- [Auralis · 舞台幕布转场实验](demos/fullscreen-curtain-transition-demo.html)

HTML 演示是独立探索资料，不代表应用当前外观或实现。
