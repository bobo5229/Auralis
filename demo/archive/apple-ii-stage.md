# Apple II 与舞台构图

入口：`apple-ii-stage.html`。可直接本地打开，所有模型与封面均来自现有本地资产。

桌面布局为左侧 Apple II、右侧实体舞台，沿用星空背景。窄屏改为上下排列。Apple II 可拖动旋转、双击放大屏幕、Esc 或按钮返回；舞台展示五张模拟专辑并支持选择器切换。

屏幕采用约 2001—2005 年的个人电脑桌面视觉：蓝色标题栏、浅色列表、菜单栏、文件夹图形与底部任务栏，保留轻微 CRT 扫描线。内容为固定 Top 5 演示数据，窗口按钮、桌面快捷方式和任务栏暂为视觉元素。长按舞台正面的封面 320ms 后，拖动时显示为软盘；靠近可见驱动器槽口时亮起投放提示，松手播放 1.1 秒插入动画，随后反馈从专辑第一首开始演示播放。两个驱动器均可接受投放。“装入选中专辑”按钮可装入第一个可见驱动器。Esc、窗口失焦、窗口尺寸变化或进入屏幕特写取消装入；取消不会改变已完成的演示播放状态。减少动态效果设置下直接完成装入。

软盘为新增 Three.js 薄片模型，靠机身自身深度遮挡模拟进入槽口，未拆分门板或制作开门动作。尚未迁移日期选择、屏幕选中状态联动和真实播放。线缆从 connector_section_3 后方接口区域引出，插头与靠近机身的线段使用 Three.js 绘制；末端投影到 SVG，接向舞台。旋转和缩放时更新端点，并由设备层遮挡画面线段；接口无交互行为。

复用 `apple-ii-preview.bundle.js` 渲染终端，`mac-stage-device-renderer.js` 渲染舞台，image-q Worker 生成 96×96 / 32 色封面。终端 iframe 使用限定消息类型及发送窗口校验的 postMessage 通道；无需读取跨文件 DOM，不承载生产 IPC。

构建：`node demo/archive/apple-ii-stage-build.cjs`。生成 `apple-ii-stage-terminal.html` 与 `apple-ii-stage.bundle.js`，保留原始 Apple II 和 Mac 对照 Demo。

模型与 Three.js 署名、许可见 `apple-ii-preview.md` 和 `assets/apple-ii/THREE-LICENSE.txt`；image-q 许可见 `assets/image-q/LICENSE`。
