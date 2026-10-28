# Modern PlayerBar 播放按钮：取色与可用状态

日期：2026-08-28。主代理负责技术设计和验收，luna_worker 负责实现。

## 1. 目标与边界

本次只改变底部 PlayerBar 的 modern 播放/暂停按钮：

- 可用时，按钮底色直接使用当前封面第一强调色 `accents[0].rgb`。
- 默认、悬停、按下、禁用和等待状态均无 border、box-shadow，包括原来的内阴影。
- 无当前歌曲时明确禁用；音频启动请求尚未完成时提供真实等待反馈并防止重复点击。
- 图标根据最终底色选择可读的深/浅色，作为封面底色的必要配套。

明确不做：键盘焦点样式修复、现有 reduced-motion 修复、手稿按钮的视觉或交互改造、
Miniplayer/Fullscreen/桌面歌词改造、取色算法重写、音频引擎重构、IPC 改造。
不得改变播放队列、播放模式、无缝预加载和播放统计语义。

## 2. 当前实现与已有改动

- `src/renderer/app/layout/PlayerBar.vue` 的 modern 与 manuscript 使用不同模板分支。
- `albumAccentColor` 已提供封面第一强调色；`useArtworkPalette` 自带无封面/失败回退色板。
- `src/renderer/app/styles/main.css` 的 modern `.transport-control-primary` 目前采用固定米色底、
  深色图标、封面色边框/阴影，且 hover 单独重新声明阴影。
- `uno.config.ts` 的同名 shortcut 也含固定米色底，必须用局部 owner 规则覆盖，不改全局 shortcut。
- `usePlayback.ts` 只提供 `isPlaying`，没有可表示“音频启动尚未完成”的状态。
- `togglePlayPause()` 无当前歌曲时直接返回，现有模板没有 disabled/busy 反馈。

本次开始时已有未提交改动：`.gitignore`、`PlayerBar.vue`、`main.css`、
`manuscript.player.css`、`manuscript.player-overlays.css`。其中 PlayerBar/main.css 包含音量滑杆修复。
这些改动全部保留，不回退、不格式化无关区域，不修改后两个手稿样式文件。

## 3. 按钮状态模型

状态必须从现有 playback composable 派生，不建立第二套播放器 store。
在该 composable 增加只读的 `isPlaybackPending` 请求状态（可使用模块级 ref），
语义仅为当前音频启动/恢复请求未完成，不表示封面加载，也不表示后台下一首预取。

| 条件                         | modern 按钮行为                                                       |
| ---------------------------- | --------------------------------------------------------------------- |
| 无 currentTrack              | 原生 disabled，播放图标，固定中性底色，提示先选择歌曲，不发生播放调用 |
| 有歌曲且 isPlaybackPending   | 原生 disabled、aria-busy，静态等待图标与加载标签，不执行重复请求      |
| 有歌曲、无 pending、未播放   | 可用，播放图标，封面第一强调色底                                      |
| 有歌曲、无 pending、正在播放 | 可用，暂停图标，同一封面第一强调色底                                  |
| 当前请求失败                 | 清除 pending，恢复可重试按钮；保留已有错误状态，不永久锁死            |

等待图标使用现有图标库的静态 loader/hourglass，不新增动画，因此无需扩张到用户暂缓的动效问题。
标签通过现有 i18n 增补最少键值；同步英文、简体与生成的繁体。
不增加额外长文案占据播放栏，不改变按钮 40×40 几何。

## 4. 请求生命周期与竞态

在 `usePlayback.ts` 内为前台音频操作建立轻量 request token：

1. `playTrackFromResolvedQueue()` 选定当前歌曲后，在解析音频 URL 前进入 pending，
   覆盖 URL 解析、gapless 启动及 HTMLAudio 播放回退；所有成功/失败路径在 finally 结束。
2. `togglePlayPause()` 与 `play()` 的恢复播放 await 区段同样覆盖 pending。
   暂停不伪装成加载。modern 点击处理函数同时检查 currentTrack/pending，作为 disabled 之外的防线。
3. 每次前台操作取得新 token，只有仍拥有当前 token 的结束回调可以清除 pending。
   老歌曲请求的 finally 不得清除新歌曲的等待状态。
4. 当前曲目移除、播放实例销毁时失效 token 并清理 pending。
5. 不对后台 gapless 下一首预取设置 pending；无缝自然衔接不应使按钮闪烁或禁用。
6. 旧请求迟到不得覆盖新曲目的错误/播放状态。新增异步处理如捕获错误，必须检查请求身份。
7. URL 解析或装载失败后，重试必须针对当前曲目，不能调用仍持有上一首 src 的 Audio 实例
   播放旧歌曲。必要时复用既有前台曲目装载入口，以 `recordHistory: false` 避免重试重复记历史。

尽量以小型相邻纯逻辑模块封装 token 生命周期以便测试，避免散布计数器。
不得通过固定延时模拟 loading，也不得只在 PlayerBar 点击时设置本地 loading：
后者无法覆盖从曲库发起的首次播放/切歌。
全局新增状态只供 modern 按钮消费，其他界面的现有视觉和交互保持不变。

## 5. 颜色与 CSS 所有权

- 在 modern PlayerBar owner 上提供按钮专用底色和前景色变量，不改变全局主题 token。
- 有歌曲时使用现有色板第一强调色，无封面/取色失败继续沿用现有 fallback 色板。
- 无歌曲时使用现有中性控制色 token，不沿用上一张封面的强调色。
- 对最终 RGB 底色计算线性 sRGB 相对亮度，比较深色 `#1f1f1f` 与白色的对比度，
  选择更清楚的一方。此计算放到可测试的纯函数，不依赖固定的 `palette.textTone`。
- 不改变 accent 的色相、亮度或饱和度；不对整个有色按钮降低 opacity，以免图标一同变淡。
- modern 默认及 hover/active 必须明确 `border: none`、`box-shadow: none`，覆盖已有 important 和 shortcut。
- 保留可用状态现有 hover/active 几何反馈，不额外修改焦点或 reduced-motion 规则。
- 禁用/等待状态不响应 hover/active 位移缩放，光标为不可操作/等待；不影响其他按钮。
- cover-tint/liquid-glass 下规则一致；仅改按钮，不修改播放栏外框、材质或菜单样式。

## 6. 实现所有权

luna_worker 可修改：

- `src/renderer/app/layout/PlayerBar.vue`：仅 modern 模板、局部派生值、点击防线。
- `src/renderer/app/styles/main.css`：仅 modern 主播放按钮规则。
- `src/renderer/features/playback/composables/usePlayback.ts`：请求元状态与必要竞态保护。
- `src/renderer/features/playback/` 下相邻的小型 helper 和测试。
- `src/renderer/locales/en.json`、`zh-Hans.json`、生成后的 `zh-Hant.json`。

主代理拥有本技术文档。其他文件如确需修改，先反馈原因；不得修改依赖、构建配置、
手稿样式、Miniplayer、Fullscreen、全局 shortcut 或 settings.chrome.css。
工作区并非独占，不得覆盖其他智能体/用户的修改，不提交、不推送。

## 7. 验证与交付

自动验证至少包括：

- 深色、浅色、灰色以及 fallback 底色的图标色选择；无当前歌曲的中性回退。
- 空状态禁用、pending 禁用、播放/暂停正常、失败恢复可操作。
- 延迟 Promise：A 请求未结束时 B 请求开始，A 完成不清除 B 的 pending。
- 成功/失败/当前曲目删除/销毁后 pending 正确结束；下一首后台预取不设 pending。
- 当前歌曲 URL 解析失败后重试，不会播放上一首残留音源；不把 waiting/stalled 当成禁用暂停的条件。
- 核查真实 usePlayback 调用点与 helper 接线，不以纯 helper 测试代替所有集成覆盖。
- 核查 modern 默认/hover/active/disabled 无边框和内外阴影，排除 owner 未受影响。

运行 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`，以及相关文件定向 Prettier 检查、
`git diff --check` 和 UTF-8 字节解码校验。新增繁体通过 `npm.cmd run locales:zh-hant` 生成，
检查生成差异，不接收无关大面积变更。无需为纯 Renderer 改动强制重建原生模块或打包。

界面验收覆盖：modern 两种材质、无曲目、有/无封面、深/浅强调色、等待/失败、播放/暂停、
鼠标 hover/active；确认 manuscript、Miniplayer 和既有音量滑杆未被污染。
如果无法实际运行 GUI，明确标记界面验收未执行，不声称截图或运行结果已通过。

交付报告写清文件、测试实际结果、剩余风险及人工验收状态。
