# Phase 23 交付记录：手稿 PlayerBar 吸底页脚

**状态**：工程完成；Electron 人工矩阵待确认
**日期**：2026-08-13
**分支**：`script-skin-dev`
**TECHDOC**：[`TECHDOC.md`](./TECHDOC.md)
**基线**：[`BASELINE.md`](./BASELINE.md)

## 1. 起止提交

| Step  | 提交                  | 说明                                          |
| ----- | --------------------- | --------------------------------------------- |
| 23.0  | `ed323e2`             | `docs：冻结 Phase 23 吸底页脚基线`            |
| 23.1  | `d3c3f39`             | `feat：手稿 PlayerBar 改为 260px 起吸底页脚`  |
| 23.2  | `3d4f737`             | `feat：手稿 PlayerBar 重排三区并主栏居中`     |
| 23.3  | `8cf7645`             | `feat：手稿吸底页脚双 safe-area 契约`         |
| 23.4  | `806675a`             | `feat：手稿窄窗音量滑杆折叠与向上展开`        |
| 23.5  | 并入 23.1–23.4        | overlay 与视觉校准验证完成，无独立 diff       |
| 23.6  | `904e7f4`             | `test：固化手稿 PlayerBar 吸底页脚作用域门禁` |
| 收尾  | `c48f2d1` / `c254a55` | `chore：格式化…` / `chore：修正音量测试 mock` |
| 23.6c | `f5ac49e`             | `docs：交付 Phase 23 手稿 PlayerBar 吸底页脚` |

**源码范围**：`d3c3f39..c254a55`
**含交付文档**：`ed323e2..f5ac49e`

## 2. 已实现

- 吸底几何（23.1）：manuscript PlayerBar 改为 `position: fixed; left: 260px; right: 0;
bottom: 0; height: 72px; width: auto; min-width: 0; transform: none;
border-radius: 0; overflow: visible`；顶部 hairline 细线 + 轻内阴影
  （新增 `--manuscript-effect-dock-shadow` token），取消外投影与全边框；建立
  `container-type/container-name: manuscript-player-bar`；
- 经典三区（23.2）：新增 `display: contents` 基线 wrapper（dock-main / dock-actions /
  dock-rule），modern 的 flex 三段顺序与焦点完全不变；manuscript 下 dock-main 内层
  `1fr auto 1fr` 使传输控制相对主内容列居中；xl(≥1280px) 外 grid 为 main | rule | 20vw，
  actions 移入 Now Playing 列并画 hairline 竖线，与壳层 20% 第三列边界对齐；bar 自身
  padding 0，内容留白归各区；
- 双 safe-area（23.3）：`.app-window[data-shell-presentation='manuscript']` 作用域重定义
  `--auralis-playbar-safe-area: 88px`（72 + 16）；全局 116px 保持不变；Library/Albums/
  AlbumDetail(+40)/Archive(+40)/Settings 与 Now Playing 的既有 var 消费自动解析，页面自有
  额外 inset 保留；
- 窄窗音量（23.4）：容器宽度 ≤760px 时折叠常驻滑杆，启用向上展开的紧凑音量 overlay
  （`.player-overlay` owner marker）；`useVolumeOverlay` 状态机覆盖 hover / focus-within /
  拖动保持 / Escape 回焦 / 外点关闭，Escape 后组内焦点移动不触发重开；音量按钮点击仍
  静音；8 个纯状态测试；
- 守卫（23.6）：吸底六件套、safe-area 双值、禁裸 `.player-bar` 吸底改动、dock wrapper 与
  volume overlay 标记、容器查询在位断言。

未新增视觉偏好、locale key、IPC、数据库迁移或窗口架构改动。未改 modern PlayerBar 几何 /
材质 / 行为，未改 Fullscreen、Miniplayer、桌面歌词、播放引擎与虚拟几何常量。

## 3. 审查 Findings 与解决方案

工程阶段未产生审查 Findings。Electron 人工矩阵完成后按需补充。

## 4. 自动验证

| 命令                    | 结果                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `npm.cmd test`          | 通过；30 files / 161 tests passed / 18 skipped；视觉作用域通过 |
| `npm.cmd run typecheck` | 通过                                                           |
| `npm.cmd run lint`      | 通过（Prettier 与 mock 修正已收尾）                            |
| `npm.cmd run build`     | 通过                                                           |
| `git diff --check`      | 通过；范围 `d3c3f39..c254a55`                                  |

## 5. 所有权边界

Phase 23 提交不包含：

- modern PlayerBar、Fullscreen、Miniplayer、桌面歌词独立窗口；
- 播放引擎、队列算法、歌词同步、桌面歌词 typed IPC、material 偏好定义；
- IPC contract、preload、repository、service、SQLite schema；
- Library / Albums / Album detail / Archive / Settings 的页面视觉重做（仅 safe-area var 经
  shell 作用域接线）；
- 工作树中用户未提交的 Phase 22 扩权在途改动（LibraryArchiveHeader 删除、库内组件/CSS、
  `uno.config.ts`、相关 docs）。守卫提交 `904e7f4` 因组件已删除而必须携带用户对守卫的
  Phase 22 更新，已在提交说明中如实标注。

## 6. 人工验收门

TECHDOC §15 Electron 人工矩阵**待用户执行确认**：modern/manuscript 往返 ≥5 次、light/dark、
900px / 容器查询两侧 / 1279px / 1280px / 宽屏；无曲 / 暂停 / 播放 / 换曲 / 队列末端；七条
路由滚动至末项 ≥16px 避让；`xl` 两侧 Now Playing 与竖线对齐；queue / mode / lyrics toast /
窄窗 volume overlay 的 Escape 返回、roving focus、Tab containment、hover / focus-within /
拖动保持；Fullscreen、Miniplayer、桌面歌词窗口不受影响；风格切换无几何动画、无 remount、
无 palette decode；material 偏好往返保持。

确认后本阶段由「工程完成」更新为「完全交付」。不补造截图，不填写未实测的数字。

## 7. 与其它阶段的关系

Phase 23 依赖 Phase 18 的 player presentation / owner / palette gate / overlay 焦点模型与
Phase 22 的页根纸面；覆盖 Phase 18「手稿与 modern 共用悬浮几何」与 Phase 22「手稿 Playbar
继续浮在连续主栏纸面上」两处描述。19–21 未实施期间不依赖它们。

## 8. 方案 A 校正

用户否决「跨 Now Playing 的通栏页脚」以及事后手改的「悬浮卡片」后，将手稿 PlayerBar 收回主栏
页脚：

- 几何：`left: 260px`、`bottom: 0`、`<xl` `right: 0`；`xl` `right: 20%`（对齐壳层第三列，
  禁止 `20vw`）；四角直角 `border-radius: 0`（覆盖 Uno `rounded-full`）。用户确认左右上角
  必须对称为直角。
- 不再跨进 Now Playing，不再把 actions 放进 20% 列，`.player-bar-dock-rule` 全宽隐藏；
- 传输相对整条主栏页脚居中：`.player-bar-dock-main { display: contents }`；
- 用户确认四个按钮收向播放键：`.player-bar-dock-actions` 改为
  `justify-content: flex-start` + `padding-left: 24px`，不再钉页脚右缘；
- 用户确认右缘时间题署填空：`PlayerBarTimeColophon` 仅 manuscript 挂载，
  `margin-left: auto` 停在 actions 列右缘，显示 `m:ss / m:ss`（空态 `--:-- / --:--`）；
  独立子组件避免 `currentTime` 重绘整条 PlayerBar；`aria-hidden`，不另做 live region；
- 删除根节点 `:hover` 外投影，纸面 + 顶边 + `--manuscript-effect-dock-shadow` 内阴影；
- 空态增加 `track-info-empty`：modern 仍居中，manuscript 左对齐且进度线 max-width 160px；
- 右区图标补 `--auralis-text-muted` 与 `.playbar-action-icon` 二次色；音量线改为 2px 且隐藏
  thumb，不改 `volumeSliderStyle` JS。

工程可写完成；Electron 人工矩阵仍待用户确认，本阶段不标为已交付签收。
