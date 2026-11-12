---
target: 全屏播放界面的组件布局、交互
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:D:\\VSCode\\Auralis\\src\\renderer\\app\\layout\\FullscreenPlayerOverlay.vue"
target_fingerprint: "sha256:98dd2727ecf9b7b4350fcd3f3930872ac915f61d81c5f48f5e0b43d760ea7404"
target_path: "D:\\VSCode\\Auralis\\src\\renderer\\app\\layout\\FullscreenPlayerOverlay.vue"
timestamp: 2026-11-10T18-20-13Z
slug: er-app-layout-fullscreenplayeroverlay-vue-356456ee
---
# Auralis 全屏聆听：源码审视与 HTML 提案

Target: src/renderer/app/layout/FullscreenPlayerOverlay.vue
Provenance: two independent assessments. A reviewed design/source; B independently ran deterministic scan and source geometry. No current production-screen visual capture. Scores are provisional source judgments. Demo screenshots are not incumbent screenshots.

## 优先结论

1. P1 布局风险：左侧封面与元数据、进度、五个主控制和音量共同争用高度，短屏封面收缩。建议固定底部控制区、舞台双栏宽度设上限。
2. P2 模式入口职责重叠：菜单与循环入口共用 playbackMode。建议合并为单一模式入口。
3. P2 阅读：所有非当前LRC行 blur(3px)/opacity .34，包括过去和未来。建议保留可读预览句，仅上下边界渐隐。
4. P2 状态：手动滚动暂停跟随但无显式恢复入口。建议显示“回到当前歌词”。
5. P2 空状态/响应式：无歌词仍留右侧空栏；900px处loading/plain/empty与LRC采用不同结构，可能引起布局跳变。建议显式封面/歌词视图与短屏稳定控制区。

## 优点与用户

本地收藏的封面＋歌词基础明确，已有封面失败、加载及无歌词回退；Esc、焦点陷阱、键盘歌词跳转和减少动态效果均有实现。初次用户可能忽略右键菜单，主动预读者受模糊影响，长标题依赖悬停。情绪高点是封面和当前歌词，低点是无歌词空栏与隐式恢复跟随。

## 暂定启发式评分

| 状态可见 | 现实语言 | 控制自由 | 一致性 | 预防错误 | 识别优先 | 效率 | 精简 | 错误恢复 | 帮助 |
|---|---|---|---|---|---|---|---|---|---|
|3|3|3|3|3|2|3|2|2|3|

合计27/40，源码暂定，非像素或可用性测试评分。认知负担中等：分组与主次层级是两项主要问题。

## 独立证据与提案

B: impeccable detect --json 目标绝对路径，exit0，stdout []。检测器无发现不代表布局或认知问题不存在。B另指出进度aria-valuetext用百分比覆盖秒单位，建议正式实施时改可读时间。

官方参考：Apple Music Windows Mini/Full-Screen Player https://support.apple.com/en-hk/guide/music-windows/mus71d7dcfce/windows ；Spotify lyrics https://support.spotify.com/au/article/lyrics/ 。它们支持歌词、进度、队列等能力的组织；本提案的具体双栏/底部布局是设计判断，不声称逐像素复刻或所有平台现版一致。

HTML: artifacts/ui/fullscreen-player-demo/index.html。深色封面取色氛围、居中双栏、统一底部控制、一个模式入口、明示跟随恢复、队列按需展开、无歌词封面舞台。原创演示文字，复用本地封面及现有字体；没有真实音频/IPC。Actual demo QA: 3 viewports, 11 interaction assertions, 0 console errors; independent reviewer disposition ship at prototype scope.

Questions skipped: 用户已明确要求直接交付可查看的HTML提案，具体方向由demo供下一轮反馈；本轮不接入产品。
