# 从头到尾 · 首张专辑徽章

打开 [index.html](index.html) 预览。条件为「首次完整听完一张专辑」，当前仅提供静态设计资产。

- 已点亮：[SVG](assets/albums-1.svg) / [透明 PNG](assets/albums-1@2x.png)。
- 未点亮：[SVG](assets/albums-1-unlit.svg) / [透明 PNG](assets/albums-1-unlit@2x.png)。
- SVG 为 330 × 370 viewBox，PNG 为 660 × 740。图案和铭文均为可编辑矢量轮廓，没有外部图片或字体依赖。

保留既有银色六边形外框，深孔雀绿底釉承托略向左倾的象牙白银边唱片封套。右上半露深墨蓝唱片，沟槽与香槟金唱片标区分唱片层次；封套上的连续银线向内收束，表达完整聆听。SIDE A · B 独立位于下方。已点亮正面不使用大数字 1；未点亮由小时系列的统一灰色金属胚派生，仅保留浅浮雕 1 与 ALBUM。

预览复用现有小时／天数画廊样式，支持状态切换、深浅背景、96px 两态对照和对应格式下载。760px 以下纵向排列。

## 生成与检查

仓库根目录运行：

```powershell
node demo/archive/enamel-milestone/albums/build-assets.cjs
$albumCheck = Start-Process -FilePath ./node_modules/electron/dist/electron.exe -ArgumentList 'demo/archive/enamel-milestone/albums/render-assets.cjs' -WindowStyle Hidden -Wait -PassThru
$albumCheck.ExitCode
```

`render-assets.cjs` 在独立临时 userData 中离屏加载 SVG 并生成两种透明 PNG，检查素材引用、矢量结构、封套／唱片层、PNG 尺寸和透明边角、页面素材加载、两态下载、背景与 390px 无横向溢出。截图默认输出系统临时目录，可通过 `BADGE_CHECK_OUTPUT` 指向已存在目录。

已通过上述隔离 Electron 检查与大图、浅色桌面、深色移动、未点亮和 96px 画面复查。96px 保留封套／唱片与银框识别，铭文不承担该尺寸下的主要信息。未进行真实触屏验收；未接入播放器、里程碑检测或授章动画。

## 现场回声 · 现场专辑

打开 [live.html](live.html)，条件为「首次完整听完一张现场专辑」。已点亮提供 [SVG](assets/albums-live.svg) / [透明 PNG](assets/albums-live@2x.png)，未点亮提供 [SVG](assets/albums-live-unlit.svg) / [透明 PNG](assets/albums-live-unlit@2x.png)。尺寸与专辑系列一致。

午夜蓝近黑舞台背景内，酒红幕帘采用独立釉面单元、明暗积色与银线分区；中央复古银色麦克风采用缩小的音头、细长落地立杆与小型椭圆底座，立杆保留明暗金属面和高度调节环。香槟金仅用于扎帘与麦克风小细节，下方三道弧线象征观众席，LIVE 铭文独立置于弧线下方。未点亮复用统一灰色金属胚，仅刻浅浮雕 LIVE。

两张专辑页面导航互通，共用状态和下载联动脚本。生成脚本一次输出两枚徽章的 SVG；隔离渲染器按 manifest 的页面与素材路径导出、检查，两枚均已通过素材解析、透明 PNG、导航当前项、状态／下载、深浅背景及390px检查。已批量复查现场徽章大图、浅底桌面含96px、深底移动和未点亮画面。96px仍可辨认中央麦克风与幕帘框景，铭文及细槽不是该尺寸的主要信息。

当前只提供静态原型；「首次完整听完现场专辑」为设计条件文案，未接入现场专辑识别、真实授章规则或播放器。未进行真实触屏验收。


现场麦克风采用朝左略俯倾的四分之三视角，窄正面音栅与暗银侧壳区分朝向，侧面转轴连接弯折支架；细长立杆保持竖直，扁椭圆底座以偏移接触阴影落在舞台上。
