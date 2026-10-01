# Renderer 视觉与交互

普通主界面与全屏播放器共享播放状态。调整主 BrowserWindow 尺寸和生命周期时，验证主界面布局及全屏播放器的进入与退出。

播放状态沿用现有 playback composable，避免在 Renderer 建立互相竞争的状态来源。

曲库虚拟列表的 CSS 实际几何必须与 virtualizer 使用的估算高度一致；相关指标集中在 src/renderer/features/library/constants/libraryLayoutMetrics.ts。

细线粗细或缩放问题结合原始截图、运行时 `devicePixelRatio` 和实际坐标排查；非整数缩放效果须经实际渲染验证，静态检查不能替代视觉验收。绘制方案与检查方法按需参考[封面视图分割线与设备像素取整](../topics/library/TECHDOC-cover-track-divider-pixel-snapping-2026-09-28.md)。
