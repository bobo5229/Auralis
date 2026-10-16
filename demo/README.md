# 界面原型

金属品牌图标：[渐变金属 A](brand/enamel-icon.html)，直接在浏览器打开；沿用正式图标轮廓，提供钛蓝、银铬、香槟金三种渐变、原版对照、32/64/128px 尺寸预览及高光、倒角、渐变方向调节。独立 SVG 材质原型，未替换正式应用图标。

季节拨盘：[四季聆听档案](archive/season-dial/index.html)，直接在浏览器打开；左侧拨盘切换春夏秋冬，右侧展示示例歌曲，支持明暗主题，不连接后端。[原型说明](archive/season-dial/README.md)。

独立 HTML 原型统一按主题放在本目录，可直接在浏览器打开。它们记录设计探索；
自动化测试仍与源码相邻，使用 `src/**/*.test.ts`。

歌词互转与对唱标记：[隔离 Demo](lyrics/duet-editor/README.md)。在项目根目录运行
`node demo/lyrics/duet-editor/start.mjs`，再打开 `http://127.0.0.1:4186/`；使用模拟 LRC
调用真实后端，支持 LRC / TTML 互转、两位演唱者及合唱的批量标记和左右预览。
此原型需要本机服务，不直接双击 HTML；不连接真实曲库。

| 目录               | 内容与入口                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `albums/`          | [专辑展开](albums/album-open-transition.html)、[CD 聚焦](albums/cd-focus-demo.html)、[CD 动效](albums/cd-motion-demo.html)、[CD 启动](albums/cd-startup-demo.html) |
| `archive/`         | [Macintosh 128K 立体](archive/classic-mac.html)、[夜井星空](archive/night-well.html)、[日期软盘](archive/mac-diskbox-demo.html)、[油灰软盘](archive/floppy-putty.html)                                                                 |
| `playback/`        | [播放栏材质](playback/playbar-liquid-glass-material-demo.html)、[音量浮层](playback/playbar-vertical-volume-popover-demo.html)                                     |
| `smart-playlists/` | [智能歌单编辑器](smart-playlists/smart-playlist-builder.html)                                                                                                      |
| `library/`         | [最近添加的时间范围](library/recent-added-range.html)：句子标尺、目录行、密度窗；[时间沉积歌单封面](library/recent-added-time-sediment.html)：自有 WebGL 方形封面、分范围配色与深浅主题（离线可用） |
| `brand/`          | [Logo 设计比较](brand/logo-exploration.html)：原创字母构形、深浅主题、小尺寸与应用位置示意                                                                          |
| `local/albums/`    | [专辑布局方案入口](local/albums/album-layout-index.html)、专辑头部与材质草稿                                                                                       |
| `local/archive/`   | 年度总结与唱片封套草稿                                                                                                                                             |
| `local/playback/`  | [动态流光](local/playback/apple-music-flow-demo.html)、[幕布转场](local/playback/fullscreen-curtain-transition-demo.html)                                          |
| `local/shell/`     | 主题切换转场草稿                                                                                                                                                   |

声迹星空交互：[星空与光标](archive/starfield-cursor-demo.html)，离线打开；双击中央圆点进行约 5 秒穿梭（加速 0.6 秒、巡航 3.6 秒、减速 0.8 秒），远处持续补充多色星光，镜头随速度震动；抵达时拖尾收束为星点，保留最终位置并切换星系配色。移动光标产生视差与星点响应，点击背景产生光波。

中文字体对照：[MiSans / HarmonyOS Sans SC / 思源黑体](local/shell/chinese-fonts.html)，支持深浅主题和自定义文字。

`local/` 收纳原 `test/` 和 `docs/demos/` 中的本地资料，继续由 Git 忽略；其他主题目录
用于共享原型。新原型沿用对应主题目录。关联脚本随原型放置，跨主题共享素材通过相对路径引用。
部分旧原型使用在线示例图片，离线时这些图片可能不可用。

流光与液态金属之间的材质演化：[原型说明](playback/background-morph/README.md)。运行
`node demo/playback/background-morph/run.mjs` 打开独立交互窗口，支持正反向切换、慢放、
手动进度和封面配色对照。

像素旅途：[原型说明](playback/pixel-journey/README.md)。运行 `node demo/playback/pixel-journey/serve.mjs` 后打开 `http://127.0.0.1:4188/demo/playback/pixel-journey/`；支持音乐播放驱动奔跑、暂停待机、进度跳转、常驻音量及小窗口提示。

液态金属背景：[原型说明与接入计划](playback/liquid-metal/README.md)。在项目根目录运行
`node demo/playback/liquid-metal/serve.mjs` 后打开 `http://127.0.0.1:4176/`；支持本地封面取色、
动态金属曲面、材质调节和模拟歌词预览。

液态金属对比：[Paper LiquidMetal / Auralis](playback/liquid-metal-comparison/index.html)，离线打开；支持同步暂停、配色、封面取色及材质调节。[运行与重建说明](playback/liquid-metal-comparison/README.md)。

浅色强调色对照：[灰玫瑰 / 酒红 / 灰紫 / 当前鼠尾草](local/shell/light-accent-colors.html)，沿用当前播放器浅色底色。
