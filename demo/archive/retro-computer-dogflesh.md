# Retro computer 高细节资产验证

直接打开 [retro-computer-dogflesh.html](./retro-computer-dogflesh.html) 即可离线查看。页面可拖动旋转，提供正面、屏幕特写、背面视角；屏幕曲目、键盘整体和机箱电源区域可点击。PLAY 仅更新演示状态，不播放真实音频，也不接入播放器数据。

模型来自 dogflesh 的 [Retro computer](https://sketchfab.com/3d-models/retro-computer-9439cb5e09cc44caa63dfbfb299df45f)，使用 CC BY 4.0；完整来源与修改说明见 [NOTICE.md](./assets/retro-computer-dogflesh/NOTICE.md)。3D 渲染使用 Three.js（MIT）。

原 GLB 约 1.6 MB，包含 23,848 个三角面、2 个网格、1 张内嵌贴图。它的键帽、机箱、显示器按钮、线缆有几何细节，但屏幕、键盘、电源没有独立命名为部件。此 Demo 采用按实际几何位置标定的覆盖层和点击代理。原材质使用 `KHR_materials_pbrSpecularGlossiness`，当前 Three.js 载入后无法正确显示贴图，因此从 GLB 提取 `diffuse.png` 并显式绑定到材质。贴图以 data URL 打入脚本，打开 HTML 时不再请求旁边的 PNG 文件。屏幕是平面覆盖，近距离或从斜侧观看时能看到它与原有曲面屏的差异。

如需重新打包脚本，在项目根目录运行：

```powershell
node -e 'require("esbuild").build({entryPoints:["demo/archive/retro-computer-dogflesh.js"],bundle:true,minify:true,legalComments:"none",format:"iife",target:"chrome120",loader:{".glb":"base64",".png":"dataurl"},nodePaths:[".electron-home/retro-pc-build/node_modules"],outfile:"demo/archive/retro-computer-dogflesh.bundle.js"}).catch(e=>{console.error(e);process.exit(1)})'
```

打包文件包含模型和贴图，方便直接打开 HTML 比较；模型原件与提取贴图分开放在 `assets/retro-computer-dogflesh/` 供追溯。此 Demo 不修改播放器页面。
