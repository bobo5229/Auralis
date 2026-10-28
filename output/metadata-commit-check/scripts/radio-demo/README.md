# Auralis 收音机隔离 demo

在现有播放器的 Electron 38、Vue 3、TypeScript 和 Vite 环境中运行。独立窗口、独立 userData，无 Preload 或 IPC；不启动播放器主进程，不读取曲库、偏好或音乐文件。

## 启动

在 `D:\VSCode\Auralis` 中执行：

```powershell
# 首次准备 demo 的独立依赖；不改根目录依赖或运行安装脚本。
npm.cmd ci --prefix scripts/radio-demo --ignore-scripts --no-audit --no-fund
node scripts/radio-demo/run.mjs
```

现有工作区根目录依赖需已准备好。Three.js 及其类型只安装在此目录，根项目无需引入 React、Next.js 或 TresJS。模型与贴图已随 demo 保存，运行时无需联网。

## 观察与操作

- 拖动设备外壳或背景：水平 360° 环绕，垂直从侧面到俯视；相机不能进入底面下方。滚轮缩放，按钮跳转正面、两侧、背面与顶部。
- 电源按钮：开始／暂停合成和弦试听，有按压动画。
- 三个前置旋钮：左右拖动调整音量、调谐和低音。调谐改变合成音高，同时移动刻度指针。
- 七个频率预设按钮：选择频率，联动按压状态。
- 天线：上下拖动调整倾角。顶部与侧面的两个旋钮保持原模型的装饰用途。
- 右侧面板提供相同操作的键盘替代；range 控件支持方向键。拖动部件时相机锁定，松开、取消指针、失焦或按 Esc 后恢复。

试听音频由 demo 自行合成，不包含 Radiai 的在线音乐或音效。这个版本验证设备外观和交互，尚未接入 Auralis 的播放后端。

## 隔离与性能

输出、截图和 Electron profile 位于 `.electron-home/radio-demo/`。独立依赖位于 `scripts/radio-demo/node_modules/`。

使用 Three.js OrbitControls、GLTFLoader 和本地生成的 RoomEnvironment。限制 DPR 为 1.5；1024 阴影贴图仅在部件变化时更新。按钮与指针动画结束后停止绘制；隐藏窗口时取消绘制，恢复时刷新。几何、材质、贴图和环境贴图有显式释放路径。

模型 3,754,164 bytes；构建后 Renderer JS 约 674 kB（gzip 约 182 kB）。这是 demo 构建规格，不代表正式播放器包体或 CPU/GPU 占用。

## 自测

```powershell
node node_modules/vue-tsc/bin/vue-tsc.js -p scripts/radio-demo/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js scripts/radio-demo --max-warnings 0
node scripts/radio-demo/run.mjs --test
```

`--test` 会短暂显示隔离窗口，通过真实 Electron 鼠标与键盘事件检查模型按钮、三个旋钮、七个预设、天线、相机旋转和滚轮缩放；另检查 Esc 取消拖动、底面限制、静止／隐藏时停止绘制、恢复刷新及小窗口布局。试听链路检查 AudioContext 启动、输出采样能量和暂停后挂起。

结果写入 `.electron-home/radio-demo/verification.json`，截图为 `home.png`、`front-playing.png`、`left.png`、`back.png`、`right.png`、`top.png`、`compact.png`。测试专用探针不会出现在正常构建中。

已在当前 Windows 环境完成上述检查，WebGL 使用 NVIDIA GeForce RTX 5060 Laptop GPU 的 ANGLE / D3D11 路径，未关闭沙箱。已查看实际截图。尚未测量长期 GPU 占用、低端集显表现及真实音频后端同步；AudioContext 能量检查不等同于人工试听或声卡 loopback。

## 开源来源

- 项目：[blenderskool/radiai](https://github.com/blenderskool/radiai)
- 参考版本：`2f812ce4e678db963bde7878e8b29f363bf29bb3`
- 模型：`public/radio-1.glb`，在本 demo 中保持原始字节。
- 模型 SHA-256：`ddc93ccfdac183267a1e9820163aaa213b8e1a54b7ca1ed3635a6c605660ce75`
- 原项目版权及 MIT 许可保存在 [assets/RADIAI-LICENSE.txt](assets/RADIAI-LICENSE.txt)。部件交互与频率映射参考其 `src/components/Radio.tsx`，在本 demo 中用 Vue 与原生 Three.js 适配。

本次保留仓库许可与作者署名；仓库内贴图的第三方来源未独立确认。正式随产品分发前仍应核实素材来源，不能将仓库 MIT 声明视为对所有第三方素材来源的独立验证。
