# 唱片室字体资源

仅供 CD 浏览页的独立排版体系使用。角色、字号与行高集中在 features/albums/styles/cdTypography.css。

- EB Garamond：专辑标题、曲目、艺术家、Composer 与歌词的英文。正体与斜体，400–600 字重。
- Source Serif 4：导航、信息标签、版权小字与数字。正体与斜体，400–600 字重，自动光学尺寸。
- 数字通过仅覆盖 U+0030–0039 的字体别名优先匹配 Source Serif 4；日期、时间、编号和数量使用独立数字角色。时间、日期和列表数据使用齐线等宽数字。
- 中文沿用 Auralis Desktop Lyrics SC（GenRyuMin2TC），资源和字重定义继续由全局字体文件维护。
- Latin 与 Latin Extended 子集均为本地 WOFF2，页面运行不访问字体服务。

字体来自 Google Fonts 官方分发（2026-10-04）：

- https://fonts.google.com/specimen/EB+Garamond
- https://fonts.google.com/specimen/Source+Serif+4

许可证随字体保存在 EBGaramond-OFL.txt 和 SourceSerif4-OFL.txt；均为 SIL Open Font License 1.1。字体文件未修改。
