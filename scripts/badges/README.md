# 徽章 GLSL 工具

从原始 SVG 生成材质，以产品同一套 GLSL 渲染预览，并检查资产和运行行为。当前已配置全部 11 枚徽章、22 个外观状态；生成、预览和检查均从配置／manifest 读取徽章清单。

## 常用命令

在仓库根目录执行，使用已有本地依赖，无 CDN 或下载步骤：

```powershell
npm.cmd run badges:build
npm.cmd run badges:check -- --materials-only
npm.cmd run badges:render
npm.cmd run badges:check
npm.cmd run badges:preview
```

观察台：<http://127.0.0.1:4197>。支持任意已生成徽章、点亮／未点亮、原版／底色／GLSL 对照、反光开关、深浅背景，以及 96／70／44px 预览。鼠标倾斜最大 ±8°，方向键调整，Home 归位；静置停止绘制。只有一个 WebGL 上下文。

```powershell
# 查看已配置徽章
npm.cmd run badges:build -- --list
# 单枚或子集生成；保留 manifest 中的其他已生成徽章
npm.cmd run badges:build -- --badge days-30
npm.cmd run badges:build -- --badge hours-100,days-30 --size 660
npm.cmd run badges:check -- --badge days-30 --materials-only
# 独立实验目录；不会改变产品资产
npm.cmd run badges:build -- --badge days-30 --output output/badge-experiment
npm.cmd run badges:check -- --badge days-30 --output output/badge-experiment --materials-only
node --test scripts/badges/materialPipeline.test.mjs
```

默认尺寸 1320×1480；`--size` 为宽度，应是 330～2640 范围内的 33 的整数倍。`badges:render`、`badges:preview` 固定读取产品材质目录，渲染全部 manifest 条目；实验目录只用于生成与材质检查。默认 `badges:check` 还会核对静态 GLSL 预览指纹，材质或共享 shader 变化后必须重新运行 `badges:render`。

## 新增徽章

1. 保留点亮／未点亮 SVG 和 PNG，放到 `demo/archive/enamel-milestone/<series>/assets/`；当前支持的系列是 `hours`、`days`、`albums`。SVG 几何协议为 `viewBox="0 0 330 370"`；首个 `path` 的 `d` 提供徽章外轮廓，供实体与海绵共用，沿用现有 11 枚的结构。
2. 在 `source-hashes.json` 登记原始文件 SHA-256。核对新来源后增加记录，不为绕过检查而更新已有来源的哈希。
3. 在 `profiles.mjs` 增加一条 `profile(...)`，配置底色、渐变语义、特殊图层材料和应移除的旧高光；无须修改生成器、shader、观察台的徽章列表或产品目录。
4. 按上述命令生成、检查、渲染；在观察台检查两种状态、大图和小图，核对原版几何。
5. 产品会读取 manifest 的身份、名称、系列和数量。可在两份 locale 中增加翻译；未配置翻译时显示 profile 名称。首页精选仍由 `featuredMilestoneBadges` 人工选择。

例如，新增的图层可以直接声明纸张，不需要为徽章 ID 写条件：

```js
profile('albums-example', '新纪念', '#245b55', {
  gradients: {
    ivory: paint('paper', '#e5ddbe', 0.58),
  },
  groups: [{ attribute: 'data-sleeve', material: 'paper', height: 0.58 }],
  removeStrokes: ['#fffef2'],
})
```

`gradients` 的键对应源 SVG 渐变名的语义后缀。`groups` 通过源图层的语义属性标注材料和高度。公共转换器识别现有设计家族的 `metal*`、`bevel*`、`enamel*`、文字、裁切、接触遮蔽与罩面结构；不推测任意 SVG 的材料。未知渐变、未知材料和不支持的脚本、外链图像、文字节点等会报错，需要先明确适配。

## 文件职责与输出

| 文件                        | 职责                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `profiles.mjs`              | 每枚的艺术适配和共享材料库：silver、gold、enamel、opal、pearl、paper、vinyl、velvet |
| `materialPipeline.mjs`      | 去固定反光、映射材料与结构高度、栅格化准备、浮点法线生成                            |
| `build.mjs` / `check.mjs`   | 批量生成、来源和产物校验；拒绝未知命令参数                                          |
| `serve.mjs` / `workbench.*` | 本地观察台，直接复用产品 renderer 与 shader                                         |
| `render.mjs` / `run.mjs`    | 隔离 Electron 渲染全部状态、运行检查与截图，无需启动生产主进程                      |
| `fingerprint.mjs`           | 核对预览与五张运行贴图、shader、renderer 的版本一致性                               |

默认输出位于 `src/renderer/features/archive/assets/milestones/materials/`：

- 每状态 `base`、`material`、`normal`、`ao`、`finish` PNG 为运行贴图。
- `height` PNG 和 `base.svg` 为生成诊断产物，产品不加载。
- `finish` 的 RG 为粗糙度、罩层强度；`material` 的 RGB 为金属、介电材料、局部虹彩权重。
- `manifest.json` 记录身份、尺寸、来源哈希、移除的旧反光、两种状态贴图、参数和三维实体／海绵共用的 `contour` 外轮廓。
- `previews/` 保存共享 GLSL 导出的 330×370 PNG 及指纹清单；列表与 WebGL 回退使用这些图。

`badges:render` 的报告和总览位于 `output/badge-glsl-validation/run-<时间戳>/`，`latest.json` 指向最近通过的一轮。每轮检查贴图数量、状态切换、四向倾斜、键盘、静置停止、DPR、减弱动态效果和上下文丢失回退。失败记录留在自己的运行目录。生成与渲染不访问播放器数据库或音乐文件。

## 产品复用方式

正式入口为聆听档案的 `ArchiveMilestoneCase.vue` → `ArchiveMilestoneGallery.vue`。展开图鉴使用铝盒与海绵；小徽章始终使用导出 PNG。`useBadgeInspection.ts` 管理取出翻转、悬停、键盘、取消和放回，`badgeInspectRenderer.ts` 管理一个 WebGL 上下文、当前贴图、实体背面与侧边，正面仍复用 `badgeShaders.ts`。点亮／未点亮是外观浏览，不是个人达成记录。

`badgePressureSurface.ts` 管理海绵压力、几何与生命周期；`badgePressurePainter.ts` 是 Worker 与兼容路径共用的局部像素内核，`badgePressure.worker.ts` 合并后台绘制工作。所有模块均留在 archive 功能内。关闭收藏盒会卸载检视与海绵，终止 Worker 并释放 WebGL。

观察台与静态导出继续使用 `badgeMaterialRenderer.ts`，保留已有二维参考视图与指纹检查；正式检视的三维动作不改变静态导出。新增徽章仍通过 profiles／manifest 接入，无需在展示或渲染模块增加徽章 ID 分支。

100 小时「成章」保留兼容基准，其原有 12 份派生产物不变；其他材料通过 finish map 表达差异。旧 `demo/.../glsl` 是历史样板，后续维护使用本工具。完整执行标准见 [GLSL 工作流](../../docs/topics/archive/WORKFLOW-enamel-badge-glsl.md)。
