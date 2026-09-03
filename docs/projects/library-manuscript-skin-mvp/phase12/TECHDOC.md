# TECHDOC：手稿皮肤覆盖专辑目录（Phase 12）

**文档状态**：工程完成；用户已确认人工验收（2026-08-13 回填）
**编写日期**：2026-08-13
**目标路由**：`/albums`（`name: 'albums'`）
**明确排除**：`/albums/detail`、播放器外壳、Playbar、Miniplayer、全屏播放
**视觉参数**：`DESIGN_VARIANCE: 6`、`MOTION_INTENSITY: 2`、`VISUAL_DENSITY: 6`

## 1. 目标

把全部歌曲页已经建立的纸面、石墨、暗红和衬线语言扩展到专辑目录。现代模式和所有产品行为保持
不变。即使去掉纸面颜色，用户仍能通过目录页眉、目录编号、封面装帧和元信息层级识别手稿风格。

## 2. 架构决策

1. `modern | manuscript` 是跨已覆盖页面共享的 Renderer 偏好，不属于 Library 数据域。
2. 唯一状态源迁至 `features/appearance/composables/useVisualStyle.ts`，存储键继续使用
   `auralis-visual-style`。
3. 共享 token 迁至 `features/appearance/styles/manuscript.tokens.css`。
4. 页面规则保持 feature-scoped：`.library-page` 与 `.albums-page` 不互相继承结构样式。
5. `/albums/detail` 显式解析为 modern，避免父路径导致意外覆盖。
6. Teleport 右键菜单使用 `.albums-overlay` 单独命名空间。

## 3. 实现步骤

### 3.1 共享视觉状态

- 迁移 composable 与切换组件到 `features/appearance/`；
- 保持原 union、默认值、localStorage 校验和失败降级；
- LibraryPage 和 AlbumsPage 消费同一 module-scope ref；
- 不扩展 `ThemeMode`，不触碰 PlayerBar 材质状态。

### 3.2 专辑目录编排

- 增加“唱片目录”页眉；
- 展示真实专辑数和曲目数；
- 保留原自适应 3-6 列网格与虚拟滚动；
- 目录页眉位于虚拟滚动容器外，不改变行高估算。

### 3.3 目录卡

- 为每张专辑显示由当前排序位置生成的 `CAT` 编号；
- 封面改为近直角纸面装帧和墨色投影；
- grid 不再缩放封面，perspective 仍保留倾斜与转正行为；
- 处理未知专辑、未知艺术家、未知日期和缺失封面；
- 保留 `loading='lazy'`、`decoding='async'`、键盘打开与右键行为。

### 3.4 控件、搜索和状态

- 视觉风格切换器、grid/perspective 切换器改用手稿材质；
- 搜索继续采用 Enter 定位下一项和前缀匹配；
- 增加命中、回绕和未找到的 `aria-live` 反馈；
- 增加本地化 loading、empty、load error 与 retry 状态；
- 后台刷新失败保留现有专辑，不清空页面。

### 3.5 浮层与边界

- 专辑右键菜单在 manuscript 下关闭折射和 blur；
- 动作集合、禁用条件、菜单位置与播放/插播队列语义不变；
- 静态检查确保 AlbumDetailPage 未出现 `data-visual-style`。

## 4. 几何不变量

- `GRID_PADDING_X = 40`
- `COLUMN_GAP = 20`
- `ROW_GAP = 28`
- `CARD_METADATA_HEIGHT = 70`
- `TARGET_CARD_WIDTH = 190`
- 列数仍限制为 3-6

目录卡的描边与内缩在既有舞台尺寸内部实现，不额外增加卡片外高。

## 5. 验收矩阵

| 维度 | 必验项                                             |
| ---- | -------------------------------------------------- |
| 风格 | modern、manuscript                                 |
| 视图 | grid、perspective                                  |
| 宽度 | 900x620、1279x800、1280x800、1600x900              |
| 缩放 | Windows 100%、125%、150%                           |
| 数据 | 长标题、中英混排、未知艺术家、未知年份、缺封面     |
| 搜索 | 首次命中、连续 Enter、回绕、未找到、清空           |
| 行为 | 打开专辑、右键、播放、插播、定位当前专辑、滚动恢复 |
| 边界 | `/albums/detail` 保持 modern，播放器外壳不变       |

## 6. 完成定义

自动检查全部通过。用户已于 2026-08-13 确认既有人工验收通过，本阶段按该结论关闭人工门禁。
不补造截图，也不填写未实测的分宽度 / DPI 数据。
