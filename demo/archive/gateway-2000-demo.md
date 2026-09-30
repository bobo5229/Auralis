# Gateway 2000 交互验证 Demo

直接打开 `gateway-2000-demo.html` 即可离线运行。Demo 使用真实 GLB，检验旋转、屏幕选曲、模拟播放、机箱电源与整体键盘点击；不连接 Auralis 播放器，也不输出音频。

源码为 `gateway-2000-demo.js`。`gateway-2000-demo.bundle.js` 是已打包的 Three.js 与模型副本，供本地 HTML 直接加载。修改源码后，在仓库根目录执行：

```powershell
npm install --prefix .electron-home/retro-pc-build --no-save --no-package-lock three@0.180.0
node -e 'require("esbuild").build({entryPoints:["demo/archive/gateway-2000-demo.js"],bundle:true,minify:true,legalComments:"none",format:"iife",target:"chrome120",loader:{".glb":"base64"},nodePaths:[".electron-home/retro-pc-build/node_modules"],outfile:"demo/archive/gateway-2000-demo.bundle.js"}).catch(e=>{console.error(e);process.exit(1)})'
```

模型与第三方代码的许可见 `assets/gateway-2000/NOTICE.md` 和 `assets/gateway-2000/THREE-LICENSE.txt`。模型是约 270 三角面的低多边形资产，键盘没有逐键网格；当前 Demo 的键盘点击作用于整块模型。
