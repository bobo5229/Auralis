# 唱片室盘面材质对照

双击 `start.cmd`，或在项目根目录运行：

```powershell
node demo/albums/disc-material/run.mjs
```

左侧在构建时从当前 `CdAlbumsPage.vue` 提取正式盘面 CSS；右侧只用透明 WebGL / GLSL 涂层替换反光与黑胶沟槽。两侧保留同一封面图、400px 本地几何、4px 封面内缩、盘心金属件、中心遮罩及边缘阴影。展示阴影和同步姿态是此原型的统一控制，不是完整唱片室舞台。

- 默认展示黑胶纹理，可切换光滑盘面、素色样片及深浅背景。
- 移动指针可同时倾斜两侧；支持自动倾斜、旋转暂停、正面复位及右侧光泽/沟槽强度。
- 系统减弱动效偏好默认生效，可在原型中手动切换。页面隐藏停止绘制，WebGL 上下文丢失时回退到 CSS。
- 仅作材质视觉比较，旋转不播放音乐；不连接真实曲库、IPC 或用户偏好。
- 不新增依赖。独立 Electron profile、构建及截图保存在 `.electron-home/disc-material-demo/`。
- 右侧 shader 已接入正式唱片室的聚焦盘面；此对照原型保留独立控制，不代表已验证性能提升。

隔离运行验证及截图：

```powershell
node demo/albums/disc-material/run.mjs --verify
```

正式组件隔离预览与验证：

```powershell
node demo/albums/disc-material/run-production.mjs
node demo/albums/disc-material/run-production.mjs --verify
```

该入口运行真实 `CdAlbumsPage`、舞台控制器和正式 shader，只替换曲库、封面及音频服务，使用示例专辑，不访问真实音乐数据。验证涵盖原生键盘进入、右键倾斜、材质与主题按钮、静止停止绘制、上下文丢失与恢复、减弱动效、缩放、重复聚焦和路由退出释放；截图及结果保存在 `.electron-home/disc-material-demo/production/`。这属于正式页面的隔离运行检查，不包含完整应用音频验收。
