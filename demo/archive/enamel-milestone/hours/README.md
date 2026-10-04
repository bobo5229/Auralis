# 聆听时光 · 小时里程碑资产

直接打开 `index.html` 查看并排大图、96px 预览和深浅背景。默认展示未点亮状态，可切换已点亮状态，下载链接跟随所选状态。每枚提供独立 SVG 与透明 PNG。当前为设计提案，未接入正式播放器或成就规则。

| 时长      | 名称 | 主要图案                 | 釉色           |
| --------- | ---- | ------------------------ | -------------- |
| 10 小时   | 初响 | 唱针落下与第一段音轨     | 晨光青蓝       |
| 100 小时  | 成章 | 唱片年轮与完整虹彩环     | 深海蓝         |
| 500 小时  | 共鸣 | 两组交织声波与交汇处虹彩 | 孔雀绿         |
| 1000 小时 | 久伴 | 珍藏唱片与收藏套         | 靛紫，局部暖金 |

## 资产规格

- `assets/hours-{时长}.svg`：330 × 370 画布，透明背景、完整矢量字形、自包含颜色与滤镜，不依赖字体、CSS、脚本或外部图片。SVG 内 ID 按小时数隔离；重复内联同一枚仍应为实例重新分配 ID，或直接通过 `<img>` 引用。
- `assets/hours-{时长}@2x.png`：660 × 740 透明 PNG，由 SVG 渲染导出。
- `assets/hours-{时长}-unlit.svg` 与 `hours-{时长}-unlit@2x.png`：统一未点亮版本，只改变浅浮雕小时数。哑银包边、深灰凹面和 HOURS 字形保持一致，不包含彩釉、虹彩或各枚专属图案。
- `assets/hours-unlit-template.svg` 与 `hours-unlit-template@2x.png`：不带小时数的空白金属胚，保留 HOURS 单位。生成源为 `build-assets.cjs` 的 `unlitBadge(value)`，数字图层具有独立 ID，便于继续派生资产。
- `manifest.json`：时长、提案名称、图案说明、配色、文件路径与原始画布尺寸。
- 这批是正面静态资产：金属厚度、倒角与釉面光泽绘制在图中。现有翻面演示仍使用原来的分层徽章；新的三枚尚未接入翻面动效。
- 96px 下以数字、轮廓和图案识别为主；HOURS 和细刻纹不作为小尺寸信息载体，实际产品中应配外部里程碑名称。

100 小时款直接复用现有 `../demo.js` 的五层正面几何与材质，将 HOURS 替换为矢量字形。其余三枚复用同一底座、包边、刻纹和罩面，以独立内部几何表达阶段差异。静态导出未改变原来的百小时观察台或墨水授章动效。

## 重新生成

从仓库根目录执行，沿用现有 Node 与 Electron：

```powershell
node demo/archive/enamel-milestone/hours/build-assets.cjs
Start-Process -FilePath ./node_modules/electron/dist/electron.exe -ArgumentList 'demo/archive/enamel-milestone/hours/render-assets.cjs' -WindowStyle Hidden -Wait
```

第一步生成两种状态的 SVG、空白模板与清单，第二步导出 PNG 并检查 SVG 引用、透明度、图片加载、状态与下载链接切换、背景切换和窄屏布局。PNG 输出到 `assets/`，预览截图默认输出到系统临时目录，也可通过 `BADGE_CHECK_OUTPUT` 指向已有目录。隔离渲染不访问真实曲库。
