# 流光 → 液态金属 · 材质演化原型

在项目根目录运行：

```powershell
node demo/playback/background-morph/run.mjs
```

打开独立 Electron 演示窗口。关闭窗口会停止本次演示服务。需要用浏览器观看时运行：

```powershell
node demo/playback/background-morph/run.mjs --serve
```

打开 `http://127.0.0.1:4179/`，`Ctrl+C` 停止服务。依赖沿用项目已安装的 Vite、Electron、AMLL；不需要安装新依赖。

## 观看方式

- 点击“流光”或“液态金属”，观察正反向演化；默认切换时长 0.95 秒。
- 开启“慢放 ×3”放慢切换，或拖动“柔软 → 凝结”进度停在任意阶段。
- “停住背景”固定纹理运动，切换仍可演示，便于比较连续性。
- “往返演示”自动循环，中间停留 1.8 秒。
- 三组内置原创 SVG 封面用于暖色、冷色、红色对照，也可选择本地封面。图片仅在演示内读取。
- 遵循系统减少动态效果设置：冻结持续背景动画、直接切换、禁用自动往返。

这是无音频的视觉原型。封面与演示文字固定，不连接播放器、曲库、用户偏好、Preload 或 IPC。

## 实现与边界

流光使用项目现有 AMLL `MeshGradientRenderer`，封面取色使用现有 `extractArtworkPalette` / `toLiquidMetalPalette`。在流光绘制完成的同一调用内复制 GPU 画布纹理，避免 WebGL 默认帧缓冲已清空造成黑帧。

过渡使用一个输出着色器：先折射流光颜色、逐渐建立曲面法线和褶皱，再收紧反光带、增加金属反射与色调映射。没有对两张完整背景做透明度交叉淡化。金属端点复用正式 shader 的曲面、配色和反射函数，并使用相同默认参数与连续时钟；流光端点采用近似羽化与暗角。原型不修改正式背景组件。

两种原始渲染器没有共用同一曲面。当前形变将源流光颜色场引向金属曲面，仍需主观观察纹理交接是否自然。演化中从流光采样切到金属色域的过程，后续可根据观看反馈调整。

本原型在过渡期运行 AMLL 与输出 WebGL 上下文，存在跨上下文纹理复制成本；它用于评估质感，不作为正式接入后的性能结论。原型输出长边上限 1440 像素；金属完成后暂停流光更新，反向切换时恢复。首次初始化完成后才允许切换。

## 隔离验证

```powershell
node demo/playback/background-morph/run.mjs --verify
```

运行真实 Electron / WebGL，检查素材加载、五个演化阶段的非空像素、前景位置、金属端点与正式 shader 的像素差异、正反向与中断切换、手动进度、慢放、往返和减少动态效果。截图与结果输出至 `.electron-home/background-morph-check/`。性能字段分别记录帧间隔和 CPU 提交耗时，不能单独解释为 GPU 耗时或完整播放器性能。

AMLL 使用已安装的 `@applemusic-like-lyrics/core`，许可证及来源见 `node_modules/@applemusic-like-lyrics/core/LICENSE` 与其 `package.json`。本轮只做本地原型。
