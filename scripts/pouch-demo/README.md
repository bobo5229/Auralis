# 镀铝包装袋隔离 demo

在 Auralis 根目录启动：

```powershell
node scripts/pouch-demo/run.mjs
```

独立 Vue + Three.js + Electron 窗口，标题 `Auralis · Pouch Demo`。不读取曲库、音乐、数据库或正式用户设置。没有 Preload、IPC 或网络请求，交互运行使用 `.electron-home/pouch-demo/interactive-profile`，自测使用独立 `test-profile`；交互窗口限制为单实例，重复启动会激活已有窗口。构建输出和验证截图均在 `.electron-home/pouch-demo/`；正式播放器与收音机 demo 不受影响。

## 体验

- 抓住右上角撕口向左拖，沿顶部撕开封边。松手保留进度，继续从提示圈处撕；反向拖动不会重新封口。
- 拖动袋身，观察局部薄膜弯折及松手回弹；移动鼠标观察银膜反光。
- 撕开后松手，包装在约 0.75 秒内加速掉落出画面，只留下闪卡；减弱动效时直接隐藏。点击卡片或“查看闪卡”放大查看，再点击可收起。“重新拆一遍”恢复包装和初始位置。
- 包装固定为镭射膜。“条带虹彩 / 细闪点”比较同一张虚构专辑封面的两种闪膜工艺，围绕卡片移动鼠标观察倾角与反光。正反面采用连续闪膜，文字也受到虹彩影响，信息区没有独立印刷底色。
- 正面为完整方形封面、最多两行专辑名、艺术家、年份与曲目数；样张共用中性闪膜基底和深色文字。布局样张可切换深色、浅色和长标题。抽出后“查看曲目”只翻卡片，背面显示八首虚构曲目和总时长。
- 卡片下方提供 Play / Discard，选择后显示结果并禁止重复选择，焦点回到“重新拆一遍”。本隔离 demo 只记录选择，不播放真实专辑、不删除数据，也未接入正式播放器。更换样张或重新拆袋会清除选择。
- Discard 将卡面变为 28 × 40 个粗像素方块，保留各位置的纹理采样色，从左上方向右下依次脱离、向侧上方飘散并缩小，约 1.6 秒结束。实例化方块由 GPU 着色器驱动，结束后停止渲染；减弱动效时直接消失。实现独立编写，参考开源调研中的网格分块与实例化思路，没有引入 React、BAS 或新的依赖。
- “翻看袋背”观察背封边，“重新拆一遍”重置；重置保留所选闪卡工艺和布局样张。
- “键盘操作”展开后，“撕开一段”每次完成四分之一。Esc、失焦或窗口隐藏会释放抓取，保留裂口。

袋体为无印刷的前后薄膜、背面纵向搭接封边、上下锯齿边与上方可分离撕条。封边和锯齿均为真实网格；背封边的顶部会随撕条分离。当前为固定顶部撕裂路径和受控几何形变，底部锯齿仅为包装结构，并非任意位置破坏或完整薄膜物理模拟。细折痕为程序生成法线，主要折痕及受拉形变为网格变化。闪卡为圆角薄卡网格、覆膜高光和视角驱动的虹彩/固定微片闪点，不使用持续时间动画，静止后停绘制。“蓝调之后”为本地程序绘制的虚构专辑样张，不读取真实封面，不包含专辑抽取、播放或冷启动接入。本版无音效。

## 开源溯源

箔面着色器参考并适配 [Dmitry Kurash / Holocloth](https://github.com/dmitrykurash/holocloth/blob/main/src/holoMaterial.ts) 的视角驱动色相、微粒相位和金属反射染色代码，保留 [MIT 许可](./HOLOCLOTH-LICENSE.txt)（Copyright 2026 Dmitry Kurash）。去掉布料 sheen、发光、景深与后处理，不引入其 React UI 和物理系统。包装结构、受控撕裂、纹理与占位图形为本 demo 编写，素材均本地生成。

闪卡以 [Pokémon Cards CSS](https://poke-holo.simey.me/) 的条带与闪点效果作为视觉参考，卡片几何、着色器、样张和交互为独立实现；未复制该项目 GPL 代码、宝可梦素材或未明确许可的 Card Renderer 代码。闪卡和包装使用同一个 Three.js renderer 与场景。

Three.js 与类型依赖锁定在本目录，Vue / Electron / Vite / esbuild / TypeScript 使用现有项目工具。根依赖和锁文件未修改。首次准备依赖：

```powershell
npm.cmd install --prefix scripts/pouch-demo --ignore-scripts --no-audit --no-fund
```

## 验证

```powershell
node node_modules/vue-tsc/bin/vue-tsc.js -p scripts/pouch-demo/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js scripts/pouch-demo --max-warnings 0
node scripts/pouch-demo/run.mjs --test
```

自测模式使用真实 Electron 鼠标与键盘输入，检查袋身拖动不误撕、半撕后续撕、反向拖动、开封、卡片抽出、两种闪卡工艺切换、鼠标驱动卡片倾斜、卡片曲目表翻面、三种布局样张、Play / Discard、选择后的焦点、Esc 释放、重置、键盘替代、闲置与隐藏停绘制、小窗口及退出资源释放。测试窗口置于屏幕外，交互期间取消后台节流以保证动画推进，隐藏检查恢复正常节流；正常启动沿用后台节流。仅测试构建注入 `pouchDemoProbe`，正常启动不包含此接口。

成功结果写入 `verification.json`，截图包含 `sealed-holo.png`、`half-torn.png`、`opened.png`、`card-out.png`、`card-bands.png`、`card-bands-tilted.png`、`card-glitter.png`、`card-light.png`、`card-long-title.png`、`card-tracklist.png`、`card-discard.png`、`back.png`、`compact.png`、`compact-card.png`。材质与形变以这些运行画面和实际交互反馈评估，不把程序断言当作真实包装的触感验收；尚未做集显、长期 GPU 使用或正式应用集成测量。
