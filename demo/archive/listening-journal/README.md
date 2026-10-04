# 声迹 · 私人聆听档案 Demo

直接用浏览器打开 [index.html](index.html)。无需安装、构建、联网或运行 Auralis。请保留它在仓库内的位置，字体引用仓库已有资产。

## 使用

- 右侧选择专辑：小封面移动到主画面，切换对应聆听数据。支持上下方向键。
- 日期箭头、底部日期带、顶部「日期索引」都可以切换日期。
- 日期带支持鼠标拖动、触屏横向滚动、左右方向键与 Home / End。
- 点击主封面查看该专辑当天的聆听片段。
- 日历支持方向键、Esc、点击外部关闭；提供「回到今天」。
- 演示日期固定在 2026-09-21 至 2026-10-05；09-23、09-27、10-02 展示无记录状态。
- 跟随系统的减少动态效果设置。连续切换、页面滚动、窗口变动可中断转场。

## 范围

独立 HTML / CSS / JavaScript 原型，仅浏览记录，不播放音频、不读写数据库、不调用 IPC。所有聆听日期、次数、分钟与片段都是演示数据；专辑名、音乐人与封面来自公开专辑信息。未接入正式 `/archive` 页面。

主视觉为浅暖纸色、衬线标题、非对称网格、完整专辑封面。该页的专用排版不改变项目普通界面的字号规则。

## 设计参考

- [Grids — Obys](https://grids.obys.agency/)：参考版面网格和随浏览位置延续的主视觉。[Communication Arts 的项目介绍](https://www.commarts.com/project/33907/grids)记录了该项目的 Awwwards Site of the Month 奖项。
- [Typography Principles — Obys](https://www.cssdesignawards.com/sites/typography-principles/38301)：CSS Design Awards，Website of the Day，2020-12-31。参考字体尺度、留白和内容的有序进入。

采用原创版面与原生 Web Animations API 转场；没有复制上述网站代码。已查看 Grids 的首屏与滚动位置截图；Typography Principles 的在线运行未成功加载，参考依据为项目和奖项页面。

## 素材

封面下载来源与专辑链接记录在 [assets/sources.json](assets/sources.json)，权利归对应音乐人与发行方；本地设计原型展示用途，未作为自由授权素材。字体复用仓库已有 Source Serif 4、源流明体、Plus Jakarta Sans；许可保留在原字体目录。箭头与日历图标使用简单 SVG 线条，参考 Lucide 图形语法。

本原型的演示资产独立存放于此目录；没有修改正式页面或已有 demo。

## 本次检查

在本会话通过 Electron / Chromium 打开实际静态页面，以演示数据检查；未创建独立审查代理。

- 查看了 1440×900、900×700、390×844 与窄屏完整页面截图。
- 实际操作了专辑切换、快速连续选择、日历、空日期、日期带拖动及键盘导航。
- 快速选择结束后临时封面图层为 0；日期带拖动产生了实际滚动；减少动态效果模式下切换后动画数为 0。
- 封面均完成加载，字体加载完成；最终预览未记录页面错误。
- `node --check journal.js` 通过。设计静态扫描指出的小字号与辅助文字对比度已调整；未重复运行扫描。
- 未运行自动化测试套件、全应用回归或其他浏览器验收。

[桌面预览](preview.png) · [窄屏完整预览](preview-mobile.png) · [视觉规格](DESIGN.md)
