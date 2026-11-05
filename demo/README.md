# 原型索引

这里收录独立 HTML、Vue 和 Electron 原型，供设计探索与交互复现使用；它们不代表播放器当前界面或已接入功能。判断现状请以源码、路由和适用测试为准。

## 按主题浏览

| 主题                  | 内容                                       |
| --------------------- | ------------------------------------------ |
| [专辑](#专辑)         | 封面、唱片、专辑详情与网格交互             |
| [播放](#播放)         | 播放栏材质、封面取色、静音检测及播放器图标 |
| [曲库](#曲库)         | 最近添加、时间沉积封面与歌曲文字排版       |
| [歌词](#歌词)         | LRC 编辑与歌词强调交互                     |
| [品牌](#品牌)         | Logo、字标与开屏动效                       |
| [界面外壳](#界面外壳) | 侧栏及页脚探索                             |
| [智能歌单](#智能歌单) | 智能歌单编辑器                             |
| [唱片机](#唱片机)     | 换片视觉原型                               |
| [共享素材](#共享素材) | 尚未归属到单个原型的素材                   |
| [归档原型](#归档原型) | 已结束迭代的早期探索，保留供回看           |
| [本机草稿](#本机草稿) | Git 忽略的本地设计资料                     |

需要启动方式和隔离验证说明时，优先打开对应目录的 `README.md`。独立原型目录以 index.html 为入口；通常可直接在浏览器打开，部分页面依赖仓库内脚本或资源。

## 专辑

### 独立原型目录

| 原型             | 入口                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5D 专辑预览    | [打开](albums/album-2.5d-preview/index.html)                                                                                                                                                                     |
| 专辑详情配色     | [打开](albums/album-detail-color-demo/index.html)                                                                                                                                                                |
| 专辑详情控件材质 | [主稿](albums/album-detail-control-materials/index.html)、[续稿](albums/album-detail-control-materials-more/index.html)                                                                                          |
| 专辑详情拆分布局 | [打开](albums/album-detail-split-layout/index.html)                                                                                                                                                              |
| 专辑展开过渡     | [打开](albums/album-open-transition/index.html)                                                                                                                                                                  |
| 专辑封套 Hero    | [打开](albums/album-sleeve-hero/index.html)                                                                                                                                                                      |
| CD 聚焦          | [打开](albums/cd-focus-demo/index.html)                                                                                                                                                                          |
| CD 动效          | [打开](albums/cd-motion-demo/index.html)                                                                                                                                                                         |
| CD 常规动效      | [打开](albums/cd-normal-motion/index.html)                                                                                                                                                                       |
| CD 进度环        | [静态](albums/cd-progress-rings-static/index.html)、[诗意](albums/cd-progress-rings-poetic/index.html)、[动效](albums/cd-progress-rings-motion/index.html)、[扩展](albums/cd-progress-rings-extended/index.html) |
| CD 频谱          | [打开](albums/cd-spectrum-live/index.html)                                                                                                                                                                       |
| CD 启动          | [打开](albums/cd-startup-demo/index.html)                                                                                                                                                                        |
| 鲜艳专辑配色     | [打开](albums/vibrant-album-demo/index.html)                                                                                                                                                                     |

### 独立目录原型

- [专辑拖放](albums/album-drop/README.md)
- [封面颜色族研究](albums/color-family-study/README.md)
- [唱片材质与正式页面隔离预览](albums/disc-material/README.md)
- [扁平播放按钮](albums/flat-play-button/index.html)
- [专辑网格重排](albums/grid-reflow/README.md)
- [封面取色算法比较](albums/palette-study/README.md)
- [代表色算法研究](albums/representative-color-study/index.html)
- [专辑选择补丁](albums/selection-patch/README.md)

## 播放

### 独立原型目录

- [歌词倒计时](playback/lyrics-countdown/index.html)
- [正在播放图标](playback/now-playing-icons/index.html)
- [Playbar Liquid Glass 材质](playback/playbar-liquid-glass-material-demo/index.html)
- [Playbar 竖向音量浮层](playback/playbar-vertical-volume-popover-demo/index.html)
- [历史 Playbar 草稿](playback/auralis-playbar-prototype/index.html)

### 独立目录原型

- [Deepika Liquid Glass](playback/deepika-liquid-glass/index.html)
- [封面调色算法比较](playback/palette-comparison/README.md)
- [静音区间检测](playback/silence-detection/README.md)
- `playback/liquid-metal/`、`playback/liquid-metal-comparison/`、`playback/liquid-metal-refinement/`：实验素材与忽略配置，当前没有独立入口页。

## 曲库

- [最近添加时间范围](library/recent-added-range/index.html)
- [最近添加时间沉积封面](library/recent-added-time-sediment/index.html)，附[说明](library/recent-added-time-sediment/README.md)
- [歌曲平面排版](library/song-flat-typography/index.html)

## 歌词

- [LRC 编辑器历史原型](lyrics/lrc-editor/index.html)，[说明](lyrics/lrc-editor/README.md)；正式应用已移除编辑与保存功能。
- [歌词强调交互](lyrics/emphasis/README.md)

## 品牌

- [品牌动效](brand/brand-motion/index.html)
- [字标动效](brand/brand-text-motion/index.html)
- [珐琅金属 A 图标](brand/enamel-icon/index.html)
- [Logo 探索比较](brand/logo-exploration/index.html)，[说明与素材索引](brand/README.md)
- [开屏动效](brand/splash-motion/index.html)
- [字标探索](brand/wordmark-exploration/index.html)

## 界面外壳

- [侧栏收起交互](shell/sidebar-collapse/index.html)
- [侧栏页脚优化草稿](shell/sidebar-footer-optimized/index.html)
- [侧栏页脚重设计草稿](shell/sidebar-footer-redesign/index.html)

## 智能歌单

- [智能歌单编辑器](smart-playlists/smart-playlist-builder/index.html)

## 唱片机

- [换片视觉原型](turntable/index.html)，[运行方式与交互说明](turntable/README.md)

## 共享素材

- [test-cover.png](assets/test-cover.png)：旧封面测试图，当前归属和用途尚未确认。
- [OPPO Sans 4.0](assets/fonts/OPPO_Sans_4.0.woff2)：本地字体文件。

## 归档原型

这些原型已停止作为当前设计入口继续迭代。归档表示保留历史探索，不代表其中方案已实现或仍是产品方向。

### 音乐归档与物件

- [经典 Macintosh](archive/classic-mac/index.html)
- [软盘材质](archive/floppy-material-prototype/index.html)
- [软盘与花卉](archive/floppy-putty/index.html)
- [日期软盘交互（Macintosh）](archive/mac-diskbox-demo/index.html)
- [Mac 磁盘盒（早期版本）](archive/mac-diskbox-original-study/index.html)
- [新归档页草稿](archive/new-archive-prototype/index.html)
- [夜井星空](archive/night-well/index.html)
- [包装袋撕开交互](archive/pouch-tear/index.html)
- [雨窗原型](archive/rainy-window-prototype/index.html)
- [星际光标交互](archive/starfield-cursor-demo/index.html)
- [季节拨盘](archive/season-dial/README.md)

### 已独立成目录的原型

- [2.5D 专辑侧立](archive/album-spines/README.md)
- [Aluminum Radio](archive/Aluminum-Radio/index.html)
- [徽章收藏盒材质](archive/badge-case-material/README.md)
- [每日演唱会纪念票](archive/concert-ticket/README.md)
- [珐琅徽章材质](archive/enamel-milestone/glsl/README.md)

归档素材集中在 [archive/assets/](archive/assets)；品牌素材见 [brand/assets/](brand/assets)，专辑素材见 [albums/assets/](albums/assets) 和各专辑原型目录。

## 本机草稿

`local/` 收纳仅在本机保留的设计草稿，并由 Git 忽略。索引收录不代表这些文件会随检出同步。

### 专辑

- [专辑布局方案入口](local/albums/album-layout-index/index.html)
- [专辑高亮流派](local/albums/album-highlighted-genres/index.html)

### 界面外壳

- [中文字体对照](local/shell/chinese-fonts/index.html)
- [浅色强调色对照](local/shell/light-accent-colors/index.html)
- [氛围交叉淡化](local/shell/style-transition-atmospheric-crossfade-demo/index.html)
- [幕布展开](local/shell/style-transition-curtain-unfurl-demo/index.html)
- [墨迹显现](local/shell/style-transition-ink-reveal-demo/index.html)
