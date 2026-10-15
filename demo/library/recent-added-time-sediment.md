# 最近添加方形歌单封面：时间沉积

入口：[HTML demo](recent-added-time-sediment.html)。直接使用 Chrome / Edge 打开 HTML；需联网获取 CDN 模块，并支持 WebGL2。无需启动 Auralis，也不访问真实曲库。

## 设计与交互

- 默认并排展示浅色和深色模式；可单独展示一个主题。每个预览左侧是 `aspect-ratio: 1` 的方形歌单封面，右侧是标题、统计和时间刻度，页面背景保持主题底色。
- 时间范围对应独立配色：7 天灰玫瑰与暖杏，30 天雾紫与灰蓝，90 天青灰与烟蓝，全部琥珀与褐紫。深浅模式保留同一组色相，调整明度。
- 7／30／90 天及全部共享范围状态。时间越长，色带尺度越小，层次随之展开，色带位置和形态同步改变。
- 方形封面内部用静态细颗粒与柔和的七色渐变表达“时间沉积”；标题和统计在封面外，不覆盖或模糊封面材质。
- 范围切换使用 900 ms 的形态及 RGBA 配色插值，结束后不保持动画循环；重复切换从当前参数和颜色继续。系统要求减少动态效果时立即应用新状态，标签页隐藏时结束过渡。
- 两组切换器支持方向键、Home／End 和可见键盘焦点。
- 曲目及统计全部为模拟数据；页面不播放音频、不修改资料库。列表用于观察封面信息区与下方内容的衔接；窄窗口中封面和信息纵向排列，封面保持方形。

## Paper 来源与许可证

使用官方 `@paper-design/shaders@0.0.81` 的 `ShaderMount`、`grainGradientFragmentShader`、`GrainGradientShapes.wave`、颜色转换和噪声纹理 API，通过固定版本 jsDelivr URL 导入发布包中的 ESM 文件，不使用 React 包，也不改变项目依赖或锁文件。

- [官方效果与参数](https://shaders.paper.design/grain-gradient)
- [项目源码](https://github.com/paper-design/shaders)
- [固定版本 npm 元信息](https://registry.npmjs.org/@paper-design/shaders/0.0.81)
- [固定版本 LICENSE](https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/LICENSE)
- [固定版本 NOTICE](https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/NOTICE)

Paper Shaders 使用 Apache-2.0，Copyright 2026 Paper。本 demo 引用上游模块，不复制或修改 shader 源码。模块加载失败或不支持 WebGL2 时显示明确提示和 CSS 占位渐变；占位渐变不代表 Paper 效果。

## 交付状态

实现完成，未测试。施工阶段仅阅读上游 API、编写原型及复查源码差异，未执行浏览器运行、shader 编译、交互或视觉验收。

待审查：联网模块加载与噪声纹理解码；两主题的实际渐变、颗粒及文字可读性；快速连续切换和减少动态效果；单主题布局、窄窗口、隐藏与恢复；网络失败和 WebGL2 不支持时的提示。参数为首轮设计值，最终观感以实际预览及用户反馈为准。
