# 专辑重排隔离 Demo

在项目根目录执行 `node demo/albums/grid-reflow/run.mjs`，或双击此目录的 `start.cmd`。
程序会构建并打开独立 Electron 窗口。关闭窗口即退出。

- 默认连续重排，可切换为现有淡入淡出；支持面板反向开关、时长、深浅主题和减弱动效。
- 1000 张是当前规模，5000 张观察增长，2 万张做压力检查，10 万张仅供极限探索。
- 支持跳到中段和尾部，记录准备时间、帧间隔及实际挂载卡片数。
- 保留真实 AlbumsPage、AlbumCard、TanStack 虚拟器、几何计算与滚动定位。
- 默认实验构建使用 ComparisonTransitionLayer.vue，保留旧淡入淡出与原型的对照；正式运行使用已接入的 500ms 动效。
- 模拟曲库、播放和本地 SVG 封面；每张专辑用一条占位曲目代表。数据规模以专辑计。
- Renderer 不连接真实 Preload、IPC、数据库或音乐目录；使用独立 userData 与 session。
- 不覆盖正式应用偏好。构建、独立 profile 与验证证据在 `.electron-home/grid-reflow-demo/`。
- 数据准备与动画采样分开；帧采样包含布局准备与交接，不能替代正式应用性能验收。
- 本地 SVG 和占位播放不代表真实 JPEG 解码、磁盘扫描、数据库或音频播放压力。

运行隔离验收：`node demo/albums/grid-reflow/run.mjs --verify`。

复验正式过渡层：`node demo/albums/grid-reflow/run.mjs --production --verify`。

FLIP 参考：[FLIP Your Animations](https://aerotwist.com/blog/flip-your-animations/)。
使用现有 Web Animations API 和项目虚拟器，不新增依赖。
