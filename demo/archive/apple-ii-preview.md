# Apple II 资产预览

直接用浏览器打开 `apple-ii-preview.html`，无需服务器或联网加载依赖。

- 左键按住模型拖动旋转；双击模型或点击“放大屏幕”进入特写。
- Esc 或“返回整机”恢复初始俯视角度。
- “显示统计屏幕”在原始屏幕材质与 Top 5 演示文字之间切换。

Three.js 0.180.0，GLTFLoader；模型、贴图与渲染代码打包到本地脚本。为支持 file:// 预览，GLB 使用 base64 内嵌，脚本会大于原模型。这是验证交互的打包方式；正式集成时应单独装入模型，并评估贴图压缩及资源占用。

构建：在工作区运行 `node demo/archive/apple-ii-preview-build.cjs`。复用根目录 esbuild 及 `.electron-home/retro-pc-build/node_modules/three`，不修改播放器依赖。

原始 `assets/apple-ii/apple_ii_computer.glb` 保持原样；预览只在内存中归一化整机位置和尺寸，克隆屏幕几何并为统计材质生成平面 UV。原屏幕材质与 UV 可切回。保留所有部件层级；两个驱动器可分别定位，尚未制作门板、托盘动画或播放接口。统计信息为模拟数据。

模型：[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)，作者 dark_igorek，许可证 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。修改说明：增加动态屏幕材质、临时 UV 与视角交互。Three.js 使用 MIT，许可证见其包内 LICENSE。
