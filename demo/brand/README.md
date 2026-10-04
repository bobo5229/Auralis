# Auralis Logo 设计草案

在浏览器直接打开 [logo-exploration.html](logo-exploration.html)。全部 SVG、字体和样式使用本地文件，无需联网或启动播放器。

品牌艺术字比较：[wordmark-exploration.html](wordmark-exploration.html)。提供共鸣圆体（推荐）、几何切面、唱片衬线、连笔流线和电子刻字五款原创路径字标，支持深浅画布、Music 后缀开关、选定方案的深浅侧栏及开屏示意、SVG 下载。各 SVG 不含字体、外部资源或第三方字形；`node demo/brand/create-wordmarks.mjs` 可从原创坐标重新生成。Music 为单独的普通文字后缀，不包含在字标 SVG 中。正式播放器保持当前字标，等待选定方案。

本次隔离 Electron 页面检查了五款素材加载、方案切换、主题、后缀隐藏、下载目标与 390 px 窄屏无横向溢出，控制台无错误；已复查实际渲染的字形与侧栏组合。预览：[浅色比较](wordmark-light.png)、[深色比较](wordmark-dark.png)。未运行播放器构建，未改动播放器组件。

开屏动效 demo：[一声成形](splash-motion.html)。约 900 ms，声波横杠先展开，A 的两侧从下向上汇合，横杠轻微回响后定格。支持重播、暂停、0.5×／0.25× 慢速、时间轴拖动、深浅主题和减少动态效果；默认遵循系统动态效果偏好。用户确认后已接入正式开屏；demo 保留用于回看与动效评估。

动效预览：[GIF](splash-motion-preview.gif)。隔离 Electron 页面实际检查了播放、暂停、重播、慢速、拖动、主题及减少动态效果；连续采样 59 帧，最终路径与正式 Logo 一致，控制台无错误，窄窗口无横向溢出。已查看深色与窄窗口截图，JavaScript 语法和新文件格式检查通过。

这轮目标是解决通用声波缺少 Auralis 自身辨识度的问题。名称沿用当前应用：侧栏为 `AuralisMusic`，启动页与应用名为 `Auralis`。

| 方案           | 源文件                                    | 构形                                                 |
| -------------- | ----------------------------------------- | ---------------------------------------------------- |
| 共鸣 A（推荐） | [resonance-a.svg](assets/resonance-a.svg) | 大写 A 的横画变成声波，延续声音线索并建立字母识别。  |
| 回环 a         | [loop-a.svg](assets/loop-a.svg)           | 唱片圆环构成小写 a，圆心与向外延伸的末端增加记忆点。 |
| 藏音 A         | [record-a.svg](assets/record-a.svg)       | 厚实的大写 A 使用圆形字腔，呼应唱片圆心与厂牌印记。  |

三枚图形均为本轮原创矢量草案，`viewBox="0 0 64 64"`，使用 `currentColor`，不包含字体、外部图片或第三方图形。独立 SVG 默认单色；比较页的试色由 CSS 滤镜实现，确定配色后导出时应直接写入颜色值。

比较页支持浅色、深色、三种试色、16/20/24/32 px 对比，以及所选方案的侧栏、启动页和桌面图标示意。点击“查看”只切换本页预览，下载提供对应 SVG 源文件。

已选定「共鸣 A」并同步接入侧栏、启动页和应用图标。正式单色源文件为 [auralis-mark.svg](../../resources/icons/auralis-mark.svg)，PNG／ICO 使用 `node scripts/export-app-icon.mjs` 重新导出。启动页使用「一声成形」，完整 Logo 在应用就绪后以 300 ms 淡出；减少动态效果时保留静态 Logo 并直接切换。

侧栏品牌区已接入「共鸣传递」：悬停或键盘聚焦时，A 的声波横杠回应一次，强调色依次经过 `AuralisMusic` 各字母，约 400 ms 后恢复原样；停留时不循环。字标随侧栏折叠收拢、展开舒展，Logo 保持位置。减少动态效果时使用静态颜色反馈。隔离 Vue 预览复用正式品牌模板、动效指令和主样式，在真实 Electron 窗口中检查了深浅主题、Tab 聚焦、快速移入移出、折叠锚点、悬浮布局与减少动态效果；28 项相关测试、定向 lint 和构建通过。未以真实曲库运行完整播放器验收。

接入验证：41 项开屏形态、契约、时序与主题测试通过，定向 lint 与 `npm.cmd run build`（含 Renderer／Main 类型检查、语言键和构建预算）通过。
隔离的 Electron 离屏页面使用正式开屏 HTML、CSS 和控制器，检查了深浅主题、成形过程、最终路径、
减少动态效果、应用提前就绪／延后就绪、启动失败退场、inert 解除及焦点恢复；已查看更新后的深浅开屏截图。
比较页素材与切换、Windows `LoadImageW` 读取 ICO 七个尺寸的既有验证继续适用。未重新打包安装版或执行完整应用的冷启动验收。

预览：[最终图标](auralis-logo-preview.png)、[浅色开屏](splash-integrated-light.png)、[深色开屏](splash-integrated-dark.png)。
