# 条件式封面选色补丁 demo

直接用 Chrome 或 Edge 打开 `index.html`，默认展示《Doja》，可切换《Lover》或选择本地图片。图片仅在页面内处理，不访问曲库、不上传、不保存。两列共用生产的封面分析和温和面板配色；补丁只在当前主色彩度低时执行，不修改生产代码。

实验先从现有候选色开始。由于《Doja》的鲜明青色已与其他颜色合并，偏灰主色触发时才对同一份 48 × 48 像素使用 `image-q` WuQuant 细分至最多 16 色。候选需达到面积、彩度、中心集中度及色相门槛，具体数值见页面。中心集中是可计算的启发式，不是主体识别。原主色有一定色度时，只选择与其色相相近的候选；不符合条件则原样回退。面积以不透明像素为分母。展开候选色可查看比例和选中情况。

示例图为本地对比使用，来源：[Doja / TIDAL](https://tidal.com/album/237821202)、[Lover / Apple Music](https://music.apple.com/us/album/lover/1468058165)，版权归权利人所有。image-q 和 culori 使用 MIT 许可，许可文本嵌入页面。

重建：在仓库根目录执行 `node demo/albums/selection-patch/build.mjs`，复用项目现有依赖。构建产物是自包含的 `index.html`。运行 `node demo/albums/selection-patch/verify.cjs` 会启动隔离 Electron 验证，不启动播放器和曲库。
