# 界面原型

独立 HTML 原型统一按主题放在本目录，可直接在浏览器打开。它们记录设计探索；
自动化测试仍与源码相邻，使用 `src/**/*.test.ts`。

| 目录               | 内容与入口                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `albums/`          | [专辑展开](albums/album-open-transition.html)、[CD 聚焦](albums/cd-focus-demo.html)、[CD 动效](albums/cd-motion-demo.html)、[CD 启动](albums/cd-startup-demo.html) |
| `archive/`         | [唱片排行](archive/ranking-record-shelf.html)、[曲目列表](archive/ranking-track-list.html)、[曲目飘带](archive/ranking-track-ribbons.html)                         |
| `playback/`        | [播放栏材质](playback/playbar-liquid-glass-material-demo.html)、[音量浮层](playback/playbar-vertical-volume-popover-demo.html)                                     |
| `smart-playlists/` | [智能歌单编辑器](smart-playlists/smart-playlist-builder.html)                                                                                                      |
| `local/albums/`    | [专辑布局方案入口](local/albums/album-layout-index.html)、专辑头部与材质草稿                                                                                       |
| `local/archive/`   | 年度总结与唱片封套草稿                                                                                                                                             |
| `local/playback/`  | [动态流光](local/playback/apple-music-flow-demo.html)、[幕布转场](local/playback/fullscreen-curtain-transition-demo.html)                                          |
| `local/shell/`     | 主题切换转场草稿                                                                                                                                                   |

`local/` 收纳原 `test/` 和 `docs/demos/` 中的本地资料，继续由 Git 忽略；其他主题目录
用于共享原型。新原型沿用对应主题目录。关联脚本随原型放置，跨主题共享素材通过相对路径引用。
部分旧原型使用在线示例图片，离线时这些图片可能不可用。
