# 2.5D 珐琅里程碑原型

用浏览器直接打开同目录 `index.html`，无需安装或启动服务。字体引用仓库现有本地资源，单独搬走此目录时会回退到系统字体。

小时系列静态资产：打开 [hours/index.html](hours/index.html) 并排查看 10、100、500、1000 小时四枚徽章，可下载 SVG 与透明 PNG。规格与生成方式见 [hours/README.md](hours/README.md)。

连续天数系列：打开 [days/index.html](days/index.html) 查看连续 7 天「一周相伴」的午夜蓝北斗星图，[days/30.html](days/30.html) 查看连续 30 天「月下相伴」的珍珠月牙与月相环，[days/100.html](days/100.html) 查看连续 100 天「百日留声」的数字唱针与双唱片，[days/365.html](days/365.html) 查看连续 365 天「一岁相伴」的金色太阳与四季周年轨道，或 [days/520.html](days/520.html) 查看连续 520 天「倾心相伴」的石榴红心形音轨。五枚均提供统一未点亮版本。规格与生成方式见 [days/README.md](days/README.md)。

- 移动鼠标观察倾斜和高光；拖动调整角度。
- 聚焦徽章后使用方向键调整，Home 或“复位视角”恢复。
- “展开结构”展示五层 SVG；三种釉色可切换。
- “重播达成时刻”在窗口中心启动授章：银色刻印背面登场，沿斜轴翻转约 180°，经过可见金属侧边，正面略微越过后回摆；金属、釉面、虹彩与数字接光并落定（共 2.5 秒）。背后墨色面板随后洇开（0.9 秒），再显示说明和操作。当前配色沿用观察台。
- 点击“收下勋章”、空白区域或按 Esc 关闭；“再看一次”从头重播。关闭会取消待执行阶段并把焦点还给入口。
- 遵循系统减少动态效果设置，授章直接展示完成态，保留观察台的手动视角与状态切换。

采用 SVG 渐变与 CSS 三维表面，没有 WebGL、GLSL、外部服务或真实用户数据。观察台保留薄片叠层；授章使用独立背板和沿轮廓构造的金属侧壁支持半圈翻面。材质为绘制近似，不提供真实折射。尚未接入播放器。

验证脚本 `verify.cjs` 通过现有 Electron 离屏渲染单独加载页面，检查层数、键盘、复位、三种配色、展开、授章先后顺序、居中、SVG ID 唯一性、重播、Esc、收下、退出清理、窄屏与矮窗口容纳范围和减少动态效果，并输出 `enamel-award-ink-restored-*` 截图（含背面、侧视、正面回摆、余光、墨水扩散及完成态）。追加验证初始与最终朝向、材质分时显现、结束后动画清理，以及登场中开启减少动态效果。失败时返回非零退出码。PowerShell 从仓库根目录执行：

```powershell
Start-Process -FilePath ./node_modules/electron/dist/electron.exe -ArgumentList 'demo/archive/enamel-milestone/verify.cjs' -WindowStyle Hidden -Wait
```

截图默认保存到系统临时目录，也可用 `BADGE_CHECK_OUTPUT` 指向已有目录。运行检查只使用独立的临时 Electron 配置目录。

授章为手动触发的独立演示，没有接入真实播放、里程碑检测、音乐或提示音。SVG 遮罩与位移滤镜模拟墨水边缘，不使用流体模拟或 GLSL。

首张专辑徽章：打开 [albums/index.html](albums/index.html) 查看「从头到尾」，以象牙白唱片封套、墨蓝唱片和连续银线表达首次完整听完一张专辑。提供已点亮／统一金属胚、透明 SVG/PNG、深浅背景与 96px 对照。见 [albums/README.md](albums/README.md)。

现场专辑徽章：打开 [albums/live.html](albums/live.html) 查看「现场回声」，以酒红幕帘、银色复古麦克风与观众席弧线纪念首次完整听完一张现场专辑；提供统一灰色LIVE胚、透明 SVG/PNG、深浅背景、96px与移动预览。见 [albums/README.md](albums/README.md)。
