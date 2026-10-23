# 界面原型

封面取色比较：[Wu / 调整后的 Wu / OKLab K-means](playback/palette-comparison/index.html)，离线打开；内置代表性封面，支持三列并排、全样本总览、本地封面导入与单列放大，统一背景适配规则，未接入正式界面。[说明与验证](playback/palette-comparison/README.md)。

侧立专辑：[2.5D 专辑侧放](archive/album-spines/index.html)，离线打开；接近侧面的窄封面与书脊排列，悬停向前抽出、转正，离开归位，支持明暗主题和角度调节。[原型说明](archive/album-spines/README.md)。

专辑详情控件：[拉丝金属 / 阳极氧化 / 内页纸 / 钢琴漆](albums/album-detail-control-materials.html)，离线打开；深浅底并排，可切换绿色与浅色默认灰强调色。悬停和按下可看高光与内凹。未接入正式界面。续稿：[搪瓷 / 丝印油墨 / 喷砂 / 扁平](albums/album-detail-control-materials-more.html)，扁平没有边、阴影和高光。

金属品牌图标：[渐变金属 A](brand/enamel-icon.html)，直接在浏览器打开；沿用正式图标轮廓，提供钛蓝、银铬、香槟金三种渐变、原版对照、32/64/128px 尺寸预览及高光、倒角、渐变方向调节。独立 SVG 材质原型，未替换正式应用图标。

季节拨盘：[四季聆听档案](archive/season-dial/index.html)，直接在浏览器打开；左侧拨盘切换春夏秋冬，右侧展示示例歌曲，支持明暗主题，不连接后端。[原型说明](archive/season-dial/README.md)。

独立 HTML 原型统一按主题放在本目录，可直接在浏览器打开。它们记录设计探索；
自动化测试仍与源码相邻，使用 `src/**/*.test.ts`。

| 目录               | 内容与入口                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `albums/`          | [控件材质](albums/album-detail-control-materials.html)、[控件材质续](albums/album-detail-control-materials-more.html)、[专辑展开](albums/album-open-transition.html)、[CD 聚焦](albums/cd-focus-demo.html)、[CD 动效](albums/cd-motion-demo.html)、[CD 启动](albums/cd-startup-demo.html)、[2.5D 专辑预览](albums/album-2.5d-preview.html)（[目标参考图](albums/user-target-reference.png)） |
| `assets/`          | [test-cover.png](assets/test-cover.png)：保留的封面图片，归属尚未确认                                                                                                                                                                                                                                                                                                                        |
| `archive/`         | [Macintosh 128K 立体](archive/classic-mac.html)、[夜井星空](archive/night-well.html)、[日期软盘](archive/mac-diskbox-demo.html)、[油灰软盘](archive/floppy-putty.html)、[包装袋撕开交互](archive/pouch-tear.html)                                                                                                                                                                            |
| `playback/`        | [播放栏材质](playback/playbar-liquid-glass-material-demo.html)、[音量浮层](playback/playbar-vertical-volume-popover-demo.html)、[Deepika Liquid Glass](playback/deepika-liquid-glass/index.html)                                                                                                                                                                                             |
| `smart-playlists/` | [智能歌单编辑器](smart-playlists/smart-playlist-builder.html)                                                                                                                                                                                                                                                                                                                                |
| `library/`         | [最近添加的时间范围](library/recent-added-range.html)：句子标尺、目录行、密度窗；[时间沉积歌单封面](library/recent-added-time-sediment.html)：自有 WebGL 方形封面、分范围配色与深浅主题（离线可用）                                                                                                                                                                                          |
| `brand/`           | [Logo 设计比较](brand/logo-exploration.html)：原创字母构形、深浅主题、小尺寸与应用位置示意；[品牌动效](brand/brand-motion.html)                                                                                                                                                                                                                                                              |
| `shell/`           | [侧边栏收起交互](shell/sidebar-collapse.html)                                                                                                                                                                                                                                                                                                                                                |
| `local/albums/`    | [专辑布局方案入口](local/albums/album-layout-index.html)、专辑头部与材质草稿                                                                                                                                                                                                                                                                                                                 |
| `local/archive/`   | 年度总结与唱片封套草稿                                                                                                                                                                                                                                                                                                                                                                       |
| `local/playback/`  | [动态流光](local/playback/apple-music-flow-demo.html)、[幕布转场](local/playback/fullscreen-curtain-transition-demo.html)                                                                                                                                                                                                                                                                    |
| `local/shell/`     | 主题切换转场草稿                                                                                                                                                                                                                                                                                                                                                                             |

声迹星空交互：[星空与光标](archive/starfield-cursor-demo.html)，离线打开；双击中央圆点进行约 5 秒穿梭（加速 0.6 秒、巡航 3.6 秒、减速 0.8 秒），远处持续补充多色星光，镜头随速度震动；抵达时拖尾收束为星点，保留最终位置并切换星系配色。移动光标产生视差与星点响应，点击背景产生光波。

中文字体对照：[MiSans / HarmonyOS Sans SC / 思源黑体](local/shell/chinese-fonts.html)，支持深浅主题和自定义文字。

`local/` 收纳原 `test/` 和 `docs/demos/` 中的本地资料，继续由 Git 忽略；其他主题目录
用于共享原型。新原型沿用对应主题目录。关联脚本随原型放置，跨主题共享素材通过相对路径引用。
部分旧原型使用在线示例图片，离线时这些图片可能不可用。

像素旅途：[原型说明](playback/pixel-journey/README.md)。运行 `node demo/playback/pixel-journey/serve.mjs` 后打开 `http://127.0.0.1:4188/demo/playback/pixel-journey/`；支持音乐播放驱动奔跑、暂停待机、进度跳转、常驻音量及小窗口提示。

浅色强调色对照：[灰玫瑰 / 酒红 / 灰紫 / 当前鼠尾草](local/shell/light-accent-colors.html)，沿用当前播放器浅色底色。
