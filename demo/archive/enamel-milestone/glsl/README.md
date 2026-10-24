# 成章 · GLSL 反光替换样板

此目录保留已认可的单枚历史基准。全部徽章的生成、观察、导出与产品复用现使用[通用 GLSL 工具](../../../../scripts/badges/README.md)，从仓库根目录运行 `npm.cmd run badges:preview`；不要为后续徽章复制本目录。

100 小时徽章的独立材质对照，包含点亮和未点亮状态。保留原始资产，通过派生的底色、材质遮罩、法线和接触遮蔽替换固定反光。未接入播放器、曲库或成就规则。

从仓库根目录启动：

```powershell
node demo/archive/enamel-milestone/glsl/server.mjs
```

打开 <http://127.0.0.1:4196/glsl/index.html>。依赖已安装的本地 Three.js，无 CDN 或网络素材；使用 HTTP 加载模块与贴图，不能直接双击 HTML。端口被占用时可设置 `BADGE_PORT`。

## 使用

- 在任一大图上移动鼠标，两侧同步倾斜，最大 ±8°；光源始终固定。
- 离开后归位；新材质区域可 Tab 聚焦，用方向键调整、Home 复位。
- 可切换点亮状态、深浅背景，以及关闭表面反光以检查底色。
- 下方为 96px 对照，新材质小图从同一个 WebGL 画布复制，不创建第二个 WebGL 上下文。
- 静置后停止绘制，隐藏页面暂停；系统减弱动态效果时停用悬停倾斜，保留键盘手动观察。
- WebGL 不可用或上下文丢失时显示原始静态图。`?fallback` 可直接检查回退界面。

## 材质生成

```powershell
node demo/archive/enamel-milestone/glsl/build-materials.mjs
node demo/archive/enamel-milestone/glsl/check-assets.mjs
```

生成器只写本目录的 `assets/`，适配 `hours-100.svg` 和 `hours-100-unlit.svg`，不作为其他十枚徽章的通用转换器。原 SVG 的路径、孔洞、裁切及文字轮廓继续作为几何来源。

- 移除 gloss、pool、罩面亮斑、偏移高光线；用均匀材料底色替换 metal、bevel、enamel 等固定受光渐变。
- 保留虹彩碎片的颜色组织与微弱刻纹；接触阴影居中后单独存入 AO。
- 遮罩 RGB 分别表示银色、珐琅、虹彩。不同结构的高度结合轻微平滑生成法线，不从原图亮度推断高度。
- 每种状态提供 1320×1480 的 base、material、height、normal、ao PNG 和可检查的底色 SVG。height 是生成诊断产物，不在运行时加载。
- `assets/manifest.json` 记录源文件 SHA-256、移除的反光元素和 44 个历史资产的哈希；相同输入重复生成的结果一致。

渲染使用 Three.js 0.180 的 ShaderMaterial，在同一平面上计算银色金属反射、釉面罩层和局部虹彩。光照采用程序化摄影棚柔光与弱条形反射，无 HDR 下载。底色按 sRGB 解码，数据贴图保持线性，输出使用 ACES 色调映射和 sRGB。粗糙度初值集中在 `app.js` 的 `materialDefaults`。

这是正面 2.5D 样板：法线与浅浮雕描绘厚度，不包含可翻转背面、真实折射或完整三维侧壁。虹彩使用受区域约束的角度色彩近似。

## 隔离验证

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
$badgeCheck = Start-Process -FilePath ./node_modules/electron/dist/electron.exe -ArgumentList 'demo/archive/enamel-milestone/glsl/verify.cjs' -WindowStyle Hidden -Wait -PassThru
$badgeCheck.ExitCode
```

验证器使用临时 Electron profile、临时端口和真实页面，不打开播放器。检查实际输入路径、静置停止、状态／背景／反光切换、DPR 1／1.25／2、390px 布局、减弱动态效果和上下文丢失回退。默认将截图、交互 WebM 和报告输出到 `output/enamel-glsl-validation/`，可用 `BADGE_CHECK_OUTPUT` 改变目录。

报告中的性能数据是录制期间的 rAF 帧间隔，包含录制开销，不等于 GPU 单帧耗时。Windows 安装目录权限导致原生启动失败时，沿项目环境规则以相同二进制的干净临时目录作对照，不关闭沙箱冒充硬件验证。

本轮验证（2026-10-24）：Electron 38.8.6 / Chromium 140、NVIDIA RTX 5060 Laptop / ANGLE D3D11，GPU 沙箱开启。上述隔离运行检查通过；4 秒录制采样 240 帧，帧间隔 P50／P95 均约 16.7ms，无超过 33.4ms 的采样。13 个派生产物重复生成哈希一致，44 个历史资产与 `f6820ab9` 逐文件一致。深浅背景、大图和 96px 已做画面复查，结果仅代表这枚样板及本机环境。
