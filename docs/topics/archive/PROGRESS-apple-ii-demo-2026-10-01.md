# Apple II 原型进度记录

更新日期：2026-10-01。

## 当前决定

用户决定先回到 1984 版 Macintosh，Apple II 探索暂停。保留现有模型、Demo 和验证记录，供后续比较或恢复使用。

当前回到的设计基线为纯 CSS Macintosh 与实体舞台组合：[mac-stage-device.html](../../../demo/archive/mac-stage-device.html)。单独查看整机可打开 [classic-mac.html](../../../demo/archive/classic-mac.html)。本次切换为后续工作方向调整；Apple II 始终是独立 Demo，没有替换播放器生产页面，因此无需回滚播放器代码。

## 资产与技术栈

模型：[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)，作者 dark_igorek，许可证 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本地文件为 `demo/archive/assets/apple-ii/apple_ii_computer.glb`，原始文件保持不变。

| 项目 | 已检查结果 |
| --- | --- |
| 文件体积 | 14,405,116 字节，约 13.7 MiB |
| 三角形 | 76,865 |
| 网格 / 材质 / 节点 | 20 / 9 / 43 |
| 贴图 | 23 张内嵌 PNG/JPEG，均为 1024×1024 |
| 内置动画 | 无 |
| 可定位部件 | 独立屏幕、两个驱动器、部分插头、接口区域和线缆 |

Apple II 使用 Three.js 0.180.0 与 GLTFLoader，独立于原有 CSS Mac。舞台复用 `mac-stage-device-renderer.js`；星空复用 `night-well-background.js`；封面经 image-q Worker 转为 96×96、32 色。

glTF Transform 已调研，尚未安装或用于处理该模型。它适合整理节点、材质和资源，实际交互由 Three.js 与页面逻辑实现。模型中尚未找到可独立控制的驱动器门板节点。

## 已完成

### 整机与桌面

- 左键按住整机可旋转视角，初始为略俯视的三分之四角度。
- 双击整机或点击按钮可平滑放大屏幕，Esc 或按钮返回整机。
- 可切换原始屏幕材质与统计桌面；统计桌面使用克隆几何和临时 UV。
- 桌面从绿色终端改为约 2001—2005 年个人电脑风格：蓝色标题栏、浅色专辑列表、菜单、文件夹和任务栏，保留轻微 CRT 扫描线。
- 屏幕显示固定 Top 5 模拟数据。菜单、窗口按钮、快捷方式和任务栏目前为视觉元素。

### 与舞台组合

- 桌面视口左侧 Apple II、右侧实体舞台，使用统一星空背景；窄屏上下排列。
- 舞台展示五张模拟专辑，支持选择器切换及现有全息显现效果。
- 线缆接向后方 `connector_section_3` 接口区域。插头和靠近机身的线段为三维几何，末端投影到 SVG 并接向舞台；端点随视角变化更新，画面线段位于设备后方。
- 后方接口仅用于连接线缆，无点击、插拔等交互。

### 软盘装入

- 长按舞台正面封面 320ms 后，拖动时显示为带专辑文字的软盘。
- 两个驱动器均定义投放位置；靠近可见槽口时显示高亮提示。
- 松手装入后，用新增 Three.js 薄片模型播放约 1.1 秒插入动画，通过机身深度遮挡模拟进入槽口。
- 动画完成后显示从专辑第一首开始的演示播放反馈。按钮可装入第一个可见驱动器。
- Esc、失焦、页面隐藏、窗口尺寸变化或切换到屏幕特写可取消装入；减少动态效果设置下直接完成。

播放反馈为模拟状态，尚未调用播放器播放接口。原模型门板保持静态。

## 文件入口与维护

| 文件 | 用途 |
| --- | --- |
| `demo/archive/apple-ii-stage.html` | 当前组合 Demo 入口 |
| `demo/archive/apple-ii-stage.js` | 舞台、终端、线缆及组合页面逻辑 |
| `demo/archive/apple-ii-disk-drop.js` | 长按拖动、投放、取消与模拟播放反馈 |
| `demo/archive/apple-ii-preview.html` / `.js` | 单独资产预览及 Three.js 渲染 |
| `demo/archive/apple-ii-desktop.js` | Canvas 桌面绘制 |
| `demo/archive/apple-ii-drive.js` | 三维软盘、槽口投影与插入动画 |
| `demo/archive/apple-ii-stage-terminal.js` | 终端 iframe 消息桥接 |
| `demo/archive/apple-ii-stage-terminal.html` | 生成的透明终端页面 |

本地构建顺序：

```powershell
node demo/archive/apple-ii-preview-build.cjs
node demo/archive/apple-ii-stage-build.cjs
```

构建复用根目录 esbuild，以及 `.electron-home/retro-pc-build/node_modules/three`、`.electron-home/cover-filter-build/node_modules/image-q`。这些本机目录需在恢复工作时核对。生成的 bundle 和终端 HTML 可重建；逻辑修改应进入源文件。

为支持直接打开本地 HTML，当前模型以 base64 内嵌，预览 bundle 约 18.9 MiB。组合 Demo 用 iframe 复用终端，以限定消息类型并校验发送窗口的 postMessage 通信。正式集成的资源加载和页面结构尚未实施。

## 验证记录

已在 Electron 实际加载模型与贴图，检查整机拖动、双击放大、返回、舞台切换、窄屏布局和线缆端点随旋转变化。软盘检查覆盖长按拖放至上方驱动器、装入后第 1 首反馈、取消保留已有播放状态，以及减少动态效果。下方驱动器的投放逻辑已实现，尚未单独完成实际拖放验收。

桌面换肤后完成整机、屏幕特写和窄屏画面检查，无控制台错误；软盘交互测试证据来自换肤前。执行过生成脚本的语法检查，未运行无关的播放器全仓测试。

本机验证产物位于忽略目录 `.electron-home/archive-preview/`，包括 `apple-stage-results.json`、`apple-disk-results.json`、截图与测试脚本。目录为临时证据，跨机器恢复时应重新验证。

## 性能结果与解释

贴图按 RGBA8 计算，基础像素数据约 92 MiB，包含完整 mipmap 时约 123 MiB。这是数据规模估算，实际显存尚未测量。

2026-10-01 在 1440×1000、60 fps 的 Electron 离屏窗口中，对组合 Demo 测量进程工作集：

| 状态 | Renderer | GPU 进程 | 全部测量进程合计 |
| --- | ---: | ---: | ---: |
| 空白窗口 | 64.0 MiB | 204.8 MiB | 416.9 MiB |
| Demo 加载后 | 637.7 MiB | 463.1 MiB | 1291.6 MiB |
| 主动垃圾回收后 | 569.4 MiB | 463.0 MiB | 1236.0 MiB |

回收后较空白窗口增加约 819 MiB。测量包含模型、舞台、星空、base64 加载和离屏渲染开销；GPU 进程工作集为进程内存，不能作为显存或模型单独占用。结果表明当前 Demo 整体内存偏重，具体开销来源尚未拆分。

放大期间父页面 requestAnimationFrame 间隔均值约 16.7ms；该采样不等同于三维场景 GPU 完成时间，正式播放器内的帧率、启动峰值和释放效果仍需专项验证。证据：`apple-performance.json` 与 `apple-performance-collected.json`。

## 暂存待办

恢复 Apple II 路线后，先处理资源和性能，再决定生产集成：

1. 模型独立加载，取消 base64 内嵌；拆分测量模型、舞台和星空占用。
2. 用 glTF Transform 检查重复、未用资源并评估 KTX2；保留独立交互部件。
3. 明确页面挂载、退出、资源缓存与释放策略，评估统一渲染结构。
4. 验证优化后的画面、内存、加载峰值与旋转/放大/插盘帧率。
5. 再迁移日期选择、屏幕与舞台选中状态联动、真实统计和播放接口。

上述为恢复时的工作参考；当前继续推进 1984 版 Mac。
