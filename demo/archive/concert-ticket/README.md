# 每日专辑纪念票 Demo

以演唱会纸质票为载体，记录某一天听得最久的一张专辑。每天首次打开领取昨日票面，领取后收入票夹；历史票面可从日期入口查看、补领。今日 23:55 可预览，零点后定稿。

这是独立的交互原型，使用固定日期和示例统计。尚未连接真实聆听档案、启动流程或时间调度。原型中的今日固定为 2026-10-30 的预览时段。

## 启动与检查

从仓库根目录运行：

```powershell
node demo/archive/concert-ticket/preview.cjs --show
```

预览脚本会先用仓库已安装的 esbuild 构建 `runtime.js`。也可以先运行 `node demo/archive/concert-ticket/build.mjs`，再在浏览器打开 [index.html](index.html)。构建直接引用正式播放器的封面取色代码，并将本地封面打包为 data URL；字体与纸纹仍从仓库本地加载，无新增依赖或在线资源请求。生成的 `runtime.js` 已忽略，不作为另一份取色算法维护。

支持领取盖章、票夹历史浏览、前后翻票、日期回看与补领、今日预览、明暗主题、键盘页签导航、Esc 关闭和焦点返回。主题与领取记录保存到 Demo 的 localStorage。底部“重新体验领取”只重置本原型的示例领取记录。

```powershell
node demo/archive/concert-ticket/preview.cjs --check
```

检查使用独立的临时 Electron profile，通过实际鼠标和键盘事件验证交互，并捕获深浅主题、窄窗口、125% 缩放、长标题与缺失封面的画面。报告和截图在 `output/concert-ticket-demo/`。这是独立原型验收，不代表完整播放器集成验收。

可见预览使用 `output/concert-ticket-demo/preview-profile/` 的独立 profile，重开后保留演示记录；不访问播放器 profile、数据库或音频文件。

## 通用模板

采用大图配大字的纸票版式。封面占据约半张票并贴边印刷，另一侧以大字号专辑名与艺术家构成主体；日期、时长、播放次数、曲目数和编号以少量文字排列。窄窗口下，封面和文字上下排列。取消表格、数据分栏、副券分隔线与条码，保留细纸纹、轻微纸色变化、切边厚度和两侧小凹口。票夹缩略票沿用同一版式。

- 固定元素：纸张材质、贴边大封面、大标题、日期与编号格式。
- 专辑差异：直接复用正式播放器的 `extractArtworkPalette`，以相同的 48 × 48 封面采样取得 `dominant` 作为纸面填充色；复用 `resolvePlayerPrimaryButtonTextColor` 选择深色或白色文字。主票、缩略票和弹窗同步配色，不受页面明暗主题影响。缺失封面或无法取色时使用中性纸色。
- 专辑名采用错位分行，四位数字标题拆为两组，长标题按文字长度分为两至三行；艺术家以斜体放在右上方，月与日用不同字号组合，编号沿票边竖排。票夹沿用同一套节奏。标题原文保留为无障碍名称，缺失封面使用文字占位。
- UI 文字复用 Auralis 的字号、字体与主题角色。票面作为印刷物，使用单独的展示排版；主题切换保留纸面本色。
- 票号按日期稳定生成。原型在页头标记 DEMO。界面仅保留标题、数据、状态和操作名称，规则与演示说明放在本文档。文本通过字号、换行和留白组织，不使用 middle dot。

调研依据见 [RESEARCH.md](RESEARCH.md)。

## 示例素材

统计均为虚构的演示数据。Taylor Swift《1989》、The Beatles《Abbey Road》、Lorde《Melodrama》的封面复用 `demo/playback/palette-comparison/assets/`，原始图片来源已记在该原型的 `samples.json`；Red Velvet 封面复用 `demo/albums/assets/album-sleeve-cover.webp`。没有重新获取或修改这些封面。

中文长标题为明确标识的虚构测试专辑，用于检查缺失封面与长文本。参考票照片仅用于调研，未作为 Demo 票面素材。
