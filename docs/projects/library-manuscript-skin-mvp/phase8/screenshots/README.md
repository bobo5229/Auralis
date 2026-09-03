# Phase 8 截图归档说明

本目录用于归档 Phase 8 交互闭环与无障碍视觉交付截图。

## 必需测试窗口

- `900x620` (Compact 视口与浮层边界)
- `1279x800` (xl 前中央列)
- `1280x800` (xl 后 Now Playing Panel 出现)
- `1600x900` (Spacious 视口)

## 必验交互状态截图

1. **右键菜单** (`context-menu-*.png`)：
   - Modern 右键菜单（主菜单 + 歌单子菜单）
   - Manuscript 手稿纸质右键菜单（主菜单 + 歌单子菜单）
   - 窗口四角夹取与向左翻转子菜单
2. **元数据编辑弹窗** (`metadata-dialog-*.png`)：
   - Manuscript 手稿编辑记录单（Default / Validation Error / Saving / Save Error）
   - Modern 元数据编辑弹窗
3. **搜索与状态** (`search-status-*.png`)：
   - 搜索框 `/` 快捷键唤起与聚焦
   - 匹配结果反馈（`matched` / `wrapped` / `not-found`）
   - 加载骨架线（`loading`）、空态（`empty`）、错误重试（`error`）
4. **键盘巡检与焦点** (`keyboard-focus-*.png`)：
   - 平铺行 Focus 态 (`SongRow`)
   - 封面曲目行 Focus 态 (`AlbumCoverTrackRow`)
   - 封面 Artwork Focus 态 (`album-cover-artwork`)
