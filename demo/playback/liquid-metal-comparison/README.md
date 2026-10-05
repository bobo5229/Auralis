# Paper LiquidMetal 与 Auralis 对比

直接用 Chrome / Edge 打开 [index.html](index.html)。这是已打包的独立页面，离线可用，无需启动 Auralis。

也可在项目根目录运行 `node demo/playback/liquid-metal-comparison/serve.mjs`，然后打开 <http://127.0.0.1:4177/>。

功能：并排或单独观察、同步时间轴与暂停、速度和材质调节、预设与自定义单色、本地封面取色、示例文字。

比较约定：

- Paper 使用 `@paper-design/shaders@0.0.81` 的官方 `LiquidMetal` 与 `ShaderMount`，初始材质参数采用官方 Backdrop 预设，`shape=none`，不使用图片遮罩。
- Auralis 直接打包当前 `src/renderer/features/playback/runtime/liquidMetalShader.ts` 的生产 shader 和默认材质参数。这里使用独立的 demo 绘制器，不加载完整播放器及其生命周期/切歌逻辑。
- 两侧使用相同累计时间、同一速度倍率，暂停时停止公共动画循环。算法内部的时间缩放不同，因此同步输入不代表形态或视觉流速相同。
- 并排时画布尺寸一致，按 1× CSS 像素渲染；Paper 通过公开像素预算 API 限制高 DPI 放大，不以默认 2× 与 Auralis 1× 混比。
- 单色模式向两侧提供相同颜色。多色模式中 Auralis 使用完整配色和权重，Paper 使用主色染色；它的原生接口不支持六色权重。页面明确显示该差异。
- 本地封面复用已有原型的 `image-q` 取色器，仅在浏览器内处理。示例文字用于观察可读性，没有额外底板。
- demo 不显示 FPS 或声称性能胜负；需另外按正式播放器调用路径测量。

重建：

```powershell
node demo/playback/liquid-metal-comparison/build.cjs
```

首次缺少 `vendor/paper-shaders.js` 时，构建脚本下载固定版本的 npm 发布包，校验 SHA-512，使用项目现有 esbuild 打包所需导出，并保留 `vendor/LICENSE`、`vendor/NOTICE`。后续重建复用本地 vendor 文件；不修改项目依赖或锁文件。`index.html` 内嵌脚本、样式和许可证。

运行隔离 Electron 验证：

```powershell
node demo/playback/liquid-metal-comparison/verify.cjs
```

验证覆盖实际 shader 编译与绘制、动画、暂停、材质与速度、重置、有效/无效封面、单独显示及窄窗口。窗口隐藏、Renderer 沙箱开启、独立临时 userData，不访问真实曲库。截图和结果写入 Git 忽略的 `captures/`。

来源：[官方文档](https://shaders.paper.design/liquid-metal)、[上游源码](https://github.com/paper-design/shaders)、[固定 npm 发布包](https://registry.npmjs.org/@paper-design/shaders/-/shaders-0.0.81.tgz)。Paper Shaders 以 Apache-2.0 发布，版权与许可文本见本目录 vendor 和页面底部。
