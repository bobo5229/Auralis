# 封面取色方案对比

直接用 Chrome 或 Edge 打开 `index.html`；页面是独立的离线构建，不连接播放器或曲库。点击「选择本地图片」替换封面，图片仅在页面内处理。四组模拟同一专辑详情页，展示算法选出的原始颜色，以及通过正式 `albumDetailColors` 生成的主面板、两侧面板、推荐区和文字颜色。

比较约定：统一从封面缩放得到 48 × 48 采样。当前算法直接调用 `analyzeArtworkColors`；Material 使用 Celebi（最多 128 色）和默认 Score，无合适色时明确显示官方默认回退色；node-vibrant 优先 Vibrant、DarkVibrant、LightVibrant，随后选择 Muted 系列；Color Thief 使用默认 OKLCH 主色，设置 `quality: 1` 和 `ignoreWhite: false`。各库自身的透明像素和过滤规则可能不同。静态预览帮助比较色彩，不代表完整播放器视觉验收。

在仓库根目录重建：`npm.cmd ci --prefix demo/albums/palette-study`，然后执行 `node demo/albums/palette-study/build.mjs`。构建复用仓库的 esbuild、image-q 和 culori。执行 `node -e "const p=require('child_process');const e={...process.env};delete e.ELECTRON_RUN_AS_NODE;const s=p.spawnSync(require('electron'),['demo/albums/palette-study/verify.cjs'],{stdio:'inherit',env:e,windowsHide:true});process.exit(s.status??1)"` 可进行隔离 Electron 检查。

依赖：Material Color Utilities（Apache-2.0）、node-vibrant 和 Color Thief（MIT），以及仓库依赖 image-q 和 culori（MIT）。许可文本随构建嵌入页面底部。示例封面复用仓库 `demo/assets/test-cover.png`。
