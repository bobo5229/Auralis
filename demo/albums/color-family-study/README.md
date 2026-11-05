# 突出色系对照 demo

使用 Chrome 或 Edge 直接打开 `index.html`。支持点击内置封面和选择本地图片，图片只在本页面内读取和处理，不访问播放器曲库、不联网、不保存。左右分别使用当前播放器的共享调色板和实验补丁；两边复用实际的温和面板、文字与歌词配色函数。界面展示原始选色，可展开查看归并后的色系、面积和中心集中比例。

当当前主色接近黑、白或无彩时，对相同 48 × 48 像素进行最多 16 色的细分。仅把彩度至少 0.06 的色群按相近色相合并，不人为填充像素；候选色系需占有效像素至少 7%，平均彩度至少 0.08，至少 50% 的像素位于中央 28 × 28 范围。符合条件时按面积与彩度排序，使用加权 OKLab 均色作为代表。其他情况沿用原色。此策略仅为启发式，不会识别对象，可能受封面构图影响；阈值只用于实验。

示例封面用于本地设计比较：Pink Pony Club 来自 [Apple Music](https://music.apple.com/us/album/pink-pony-club-single/1675173434) 的公开封面图片；Doja、Lover、The White Album、Unknown Pleasures 复用仓库已有 demo 素材及其来源说明。版权归各自权利人。image-q、culori 的 MIT 许可文本已嵌入页面。

在仓库根目录重建和检查：

```powershell
node node_modules/typescript/bin/tsc -p demo/albums/color-family-study/tsconfig.json
node demo/albums/color-family-study/build.mjs
node demo/albums/color-family-study/verify.cjs
```

构建复用仓库现有依赖。`index.html` 是自包含的构建快照；源代码或播放器共享取色变化后需重建。验证启动隔离的 Electron 窗口，不启动播放器或访问真实曲库。
