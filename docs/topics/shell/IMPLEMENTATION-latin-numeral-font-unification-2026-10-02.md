# 施工文档：英文与数字字体统一，Georgia 仅用于碟片标题

日期：2026-10-02  
状态：源码施工与自动验证完成；实际渲染及 Rendered Fonts 核验待人工完成。  
执行方式：面向 GPT-6 Luna Max 的顺序分批施工。

## 1. 目标与授权范围

将播放器所有用户可见文字中的英文与数字统一为现有的 Plus Jakarta Sans。碟片标题中的英文与数字继续使用 Georgia，并由独立语义字体变量管理。各处中文继续沿用当前中文字体。

用户已经确认迁移范围包含通用界面、启动页、歌曲和专辑页面、CD 浏览、歌词、声迹页面以及 Canvas 绘制。这里的“碟片标题”指曲目分组标题，例如 `Disc 01`；专辑标题、歌曲标题、页面标题、轨道序号、CD 数量、时间和日期属于通用英文数字规则。

本轮管理字体家族、字体栈及字体加载。字号、字重、行高、字距、布局、颜色、动画和歌曲页参数保持原值。字体字形变化会改变文字宽度，验收需检查现有布局的截断、换行和对齐。

施工授权为实现、自测及必要配套文档更新。保留工作区已有修改。Git 提交、分支操作、新会话、代理、发布及真实数据库操作仍按项目授权规则处理。

## 2. 阅读入口与执行方法

施工前读取 `docs/rules/implementation.md`、`docs/rules/renderer.md` 和 `docs/rules/validation.md`。历史参考为 `docs/topics/shell/TECHDOC-semantic-font-system-2026-09-29.md`，其中首轮“保留 Georgia 数字”目标由本文更新；文件位置和实际行为以当前源码为准。

按第 5 节的批次依次完成。每个批次先读取目标声明及其消费位置，再编辑，随后检查相关差异。当前批次完成后继续下一批。不要把多个模块交给一次全仓字符串替换。

每批记录四项：改动文件、使用的字体角色、完成的检查、剩余事项。遇到测试失败先定位；字体变化造成的宽度差异与原有行为缺陷分别处理。需要修改播放、数据库、IPC 或窗口生命周期逻辑才能继续时，记录准确阻碍及证据，交由用户决定扩展范围。

本文采用小批次、明确文件、可观察结果的组织方式；这是一种任务分解策略，不将文档执行过程描述为已完成的视觉验收。

## 3. 已收集的源码事实

以下事实来自 2026-10-02 的只读检查。

| 位置                                                                             | 当前行为                                                                                         | 迁移要点                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `app/styles/main.css`                                                            | 两个 `Auralis Numerals` 字体声明分别引用 `Georgia` 和 `Georgia Bold`，只覆盖 `U+0030-0039`       | 删除通用数字别名声明，保留 Plus Jakarta Sans 本地资源 |
| `app/styles/typography.css`                                                      | `--auralis-font-ui` 先匹配 Auralis Numerals；已有 disc-heading、desktop-lyrics、color-value 角色 | 调整角色的字体优先级                                  |
| `public/splash/splash.css`                                                       | `#splash-brand` 独立复制通用字体栈                                                               | 同步修改；保留首帧结构                                |
| `AlbumCoverGroup.vue`、`SongFontWeightPreview.vue`、`albumDetail.track-list.css` | 碟片标题已引用 disc-heading 角色                                                                 | 保留并复查作用范围                                    |
| `CdTrackList.vue`                                                                | 碟片标题、轨道序号、歌曲标题等分别使用含 Georgia 的 `font` 简写                                  | 分开处理碟片标题与其他文字                            |
| CD 页面及控件                                                                    | 多处直接声明 Georgia                                                                             | 英文数字统一，保留原中文后备顺序                      |
| 专辑详情标题、桌面歌词                                                           | 直接或通过角色使用源流明朝等衬线字体栈                                                           | 在原中文字体之前插入 Plus Jakarta Sans                |
| 声迹页面                                                                         | 局部字体角色覆盖通用字体，包括 Shadow DOM 样式和 Canvas                                          | 逐个角色及绘制路径迁移                                |
| 颜色输入                                                                         | HEX、RGB 已使用 Plus Jakarta Sans 的独立角色                                                     | 接入共享英文数字角色，保持当前效果                    |
| 侧栏数量、年度摘要数量、失败路径                                                 | 存在 Outfit、Inter 或 monospace 的局部覆盖                                                       | 移除这些位置对英文数字字体的覆盖                      |

Renderer 相对路径在本表及后文统一以 `src/renderer/` 为起点。第三方依赖源码、`demo/` 原型、历史文档和封面图像中的文字不属于应用文字样式迁移。

## 4. 字体体系的确定设计

### 4.1 共享英文数字字体

在 `app/styles/typography.css` 增加一个共享角色：

```css
--auralis-font-latin: 'Plus Jakarta Sans';
```

该变量只包含指定字体家族。各消费角色在其后保留原有的中文和其他文字后备字体，避免用一套通用中文字体覆盖整个播放器。

通用界面改为：

```css
--auralis-font-ui:
  var(--auralis-font-latin), 'HarmonyOS Sans SC', 'Arial Unicode MS', 'Nirmala UI',
  'Microsoft Himalaya', 'Leelawadee UI', 'Segoe UI Symbol', ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, 'Segoe UI', sans-serif;

--auralis-font-color-value: var(--auralis-font-latin), ui-sans-serif, system-ui, sans-serif;

--auralis-font-disc-heading: Georgia, 'HarmonyOS Sans SC', sans-serif;

--auralis-font-desktop-lyrics:
  var(--auralis-font-latin), 'Auralis Desktop Lyrics SC', 'Times New Roman', serif;
```

Plus Jakarta Sans 已由本地 WOFF2 注册，字重范围是 200–800；现有资源的字符覆盖包含 ASCII 英文与数字。继续使用该资源和现有加载策略。检查到其他字符缺失时沿用字体栈后备，并记录样例；本轮不引入新字体下载。

### 4.2 局部中文字体保留

CD 页原规则：

```css
font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
```

迁移为：

```css
font-family: var(--auralis-font-latin), 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
```

原来没有 HarmonyOS Sans SC 的 CD、歌词或声迹局部角色继续保留其原有中文后备字体。字体选择按字形覆盖进行，英文数字命中 Plus Jakarta Sans，中文落到现有后备字体。

### 4.3 字体简写

遇到 `font: 400 14px/1.5 Georgia, ...` 时，保留原字重、字号及行高，将字体部分改为语义变量。需要拆写时保留简写原有属性效果，再用 `font-family` 指定角色；避免因拆写丢失原来简写重置的属性。

`CdTrackList.vue` 的 `.cd-disc-heading` 改为独立 disc-heading 角色，并保留其 `400`、`11px` 和字距。其 `h2` 是曲目面板标题，按通用英文数字规则处理。

### 4.4 启动页同步规则

启动页在应用主样式加载前显示。`#splash-brand` 使用一份与通用界面角色等价的完整字体栈。若主角色使用 `var(--auralis-font-latin)`，启动页同样声明该变量，并保持其在首帧即可解析。

现有 `app/splash/splashContract.test.ts` 比较启动页与主字体栈。保留这一一致性要求，必要时扩展检查共享变量的值，确保两个字体栈即使文本相同也能解析到同一字体。更新规则后仍检查启动页错误提示字体。

### 4.5 声迹角色与 Canvas

声迹局部角色继续表达 display、ui、data、mono 等用途，英文数字家族统一。保留每个角色原有的中文字体与后备顺序。例如：

```css
--archive-font-display: var(--auralis-font-latin), 'Auralis Archive CJK', sans-serif;
--archive-font-data: var(--auralis-font-latin), 'Auralis Archive CJK', monospace;
--archive-font-ui: var(--auralis-font-latin), 'Auralis Archive CJK', sans-serif;
--mac-font: var(--auralis-font-latin), 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif;
```

`monospace` 作为后备保留，正常加载时英文数字使用 Plus Jakarta Sans。Canvas 的 `ctx.font` 接收可解析的字体家族字符串：从 `getComputedStyle(host).getPropertyValue(...)` 取得角色值，检查是否仍包含未解析的 `var(...)`，再构造字体字符串。Shadow DOM 中主文档变量可通过 host 继承，内部覆盖仍需逐项核对。

## 5. 顺序施工批次

### 批次 A：通用字体与启动页

目标文件：

- `app/styles/typography.css`
- `app/styles/main.css`
- `public/splash/splash.css`
- `app/splash/splashContract.test.ts`

步骤：

1. 建立 latin 角色，调整 ui、color-value 和 desktop-lyrics，保留 disc-heading。
2. 删除 main.css 两个 Auralis Numerals 注册块，更新相关注释。
3. 核对 `.sidebar-link-count` 的 Outfit/Inter 覆盖，改用通用界面角色。
4. 同步启动页完整字体栈与共享变量；检查错误提示。
5. 全仓搜索 Auralis Numerals。应用源码与测试中完成清理，历史资料引用按第 7 节处理。
6. 运行启动页定向测试，检查本批差异。

完成条件：普通界面数字不再映射 Georgia，启动页字体契约通过，已有三处碟片标题仍引用 disc-heading。

### 批次 B：碟片标题及 CD 页面

目标文件：

- `features/library/components/AlbumCoverGroup.vue`
- `features/settings/components/SongFontWeightPreview.vue`
- `features/albums/styles/albumDetail.track-list.css`
- `features/albums/components/CdTrackList.vue`
- `features/albums/components/CdViewSwitch.vue`
- `features/albums/components/CdFocusLyrics.vue`
- `features/albums/pages/CdAlbumsPage.vue`
- `features/albums/pages/CdAlbumIndexPage.vue`

步骤：

1. 先核对全部碟片标题消费位置。保留已正确接入的声明，将 CD 曲目列表碟片标题接入 disc-heading。
2. 处理 CD 浏览页的切换按钮、导航按钮、分隔符、专辑标题、计数、播放信息、专辑链接、时间、属性名称和值。
3. 处理 CD 索引页的艺术家、专辑名称、日期、字母索引。
4. 处理 CD 曲目列表的面板标题、模式按钮、轨道序号、音轨标题和艺术家。
5. 处理 CD 歌词正文及空状态，保留现有中文后备。
6. 搜索这些文件中的 Georgia 和字体简写。除碟片角色定义外，直接 Georgia 声明应全部迁移。

完成条件：CD 页面普通英文数字使用 Plus Jakarta Sans；`Disc 01` 仍使用 Georgia；字号、字重和中文字体保持。

### 批次 C：专辑标题、歌词与设置局部覆盖

目标文件：

- `features/albums/pages/AlbumDetailPage.vue`
- `app/styles/main.css` 的桌面歌词容器
- `features/settings/styles/settings.chrome.css`
- `features/settings/components/MusicLibrarySettings.vue`
- `features/settings/components/DarkAccentSettings.vue`

步骤：

1. 在专辑详情 `.album-hero-title` 的原字体栈最前方加入 latin 角色。
2. 核对桌面歌词实际挂载入口和 `.desktop-lyrics-lines`，确保接入更新后的 desktop-lyrics 角色。
3. 核对数据库路径与元数据失败路径的 monospace 声明。英文数字使用通用界面角色，保留方向、截断和可复制行为。
4. HEX/RGB 已符合字体需求；仅检查 color-value 角色的共享映射及库控件覆盖，不重复添加新角色。

完成条件：专辑标题、桌面歌词英文数字、设置数值和路径符合规则；各处中文字体保留。

### 批次 D：声迹 DOM 字体

目标文件：

- `app/styles/archive-tokens.css`
- `features/archive/components/EditorialLinerNotesCard.vue`
- `features/archive/styles/archive.annual-recap.css`
- `features/archive/pages/ArchiveCanvasPage.vue`
- `features/archive/canvas/archiveCanvas.css`
- `features/archive/pages/ArchiveMacPage.vue`
- `features/archive/mac/archiveMacFonts.css`
- `features/archive/mac/archiveMac.css`
- `features/archive/mac/macAlbumWindow.css`

步骤：

1. 调整 archive display、ui、data 的优先家族，保留 Auralis Archive CJK。
2. 核对 liner 的 body、ui、mono、number 四个局部变量；统一英文数字家族，保留变量名和现有中文后备顺序。消费声明继续引用角色。
3. 将年度摘要数量的 Outfit/Inter 覆盖接入通用角色。
4. 处理 Mac 的三处 `--mac-font` 声明：全局字体文件、页面 host 继承来源、Shadow DOM 内部样式。保留 Auralis Mac Pixel 作为中文字体来源。
5. 核对 `macAlbumWindow.css` 中 `var(--mac-font, ...)` 的后备也包含指定英文数字字体，防止变量缺失时回到像素英文。
6. 核对字母、数字、中文混排的 DOM 与 Shadow DOM 消费位置，检查同名局部变量是否覆盖修改。

完成条件：声迹正常加载时英文数字统一，中文像素和中文归档字体保留，局部样式不再以其他家族优先匹配英文数字。

### 批次 E：声迹 Canvas 与字体加载

目标文件：

- `features/archive/canvas/archiveStage.js`
- `features/archive/mac/macStageRenderer.js`
- `features/archive/mac/coverPipeline.ts`
- `features/archive/pages/ArchiveMacPage.vue`
- 与上述行为直接相关的现有测试

步骤：

1. 检查两份舞台脚本读取的 display、ui、data token，迁移 Chakra Petch、JetBrains Mono、Rajdhani 的硬编码后备。正常与变量缺失状态均应优先 Plus Jakarta Sans，中文后备沿用对应模块。
2. 保留所有 Canvas 绘制字号和字重，统一实际 `ctx.font` 家族；核对标题、字幕、日期及统计数值。
3. 使用具体的英文数字和中文样例检查 `document.fonts.load`。等待现有首次绘制所需字体，再执行首帧绘制；沿用已有加载与重绘机制。
4. `ArchiveMacPage.vue` 已预加载 Auralis Mac Pixel。继续保障中文像素字体可用，同时加载绘制所需的 Plus Jakarta Sans，避免首次绘制缓存后备字形。
5. `coverPipeline.ts` 的无封面占位图标题目前硬编码 Auralis Mac Pixel。将英文数字字体改为共享角色解析后的 Plus Jakarta Sans，保留中文像素后备。先读构造及调用位置，再选择最小接入：通过现有 options 传入已解析家族或在有效绘制上下文读取角色。保留 worker、缓存键、缓存容量及封面处理流程。
6. 检查无封面缓存的创建时机，保证字体就绪后创建。字体等待留在现有页面初始化路径，避免新增播放或数据状态。
7. 运行现有 archiveStage、coverPipeline 定向测试；变化涉及字体解析/加载时补充有价值的行为断言。

完成条件：DOM 与 Canvas 中的同类英文数字字体一致；首次进入声迹和无封面情况下也使用指定字体。

### 批次 F：最终扫描与交付

1. 扫描整个 Renderer 的 `font-family`、`font:`、字体变量及 Canvas `.font =`。
2. 将剩余直接英文数字家族分为有效后备、已停用资源注册或遗漏消费；修复遗漏消费。保留字体资源文件和注册，只有本轮 Auralis Numerals 别名属于明确删除目标。
3. 运行第 6 节检查并完成实际渲染核验。
4. 更新语义字体文档，记录英文数字新规则及碟片标题例外。
5. 复查本轮差异，列出已验证、未验证及需要用户协助核验的位置。

## 6. 验证与验收

### 6.1 源码扫描

从项目根目录运行：

```powershell
rg -n -i 'Georgia|Auralis Numerals|font-family|fontFamily|font\s*:|\.font\s*=|--.*font-' src/renderer -g '*.css' -g '*.vue' -g '*.ts' -g '*.js' -g '*.html'
```

验收规则：

- 应用中 Georgia 的有效使用集中到 disc-heading 角色；碟片标题通过该角色消费。
- 应用源码中 Auralis Numerals 的注册和消费全部清理。
- 所有正常英文数字消费角色优先 Plus Jakarta Sans。
- 资源注册中保留的其他字体，以及中文和缺字后备，分别记录用途。
- 不把 `font-weight`、`font-variant-numeric: tabular-nums` 或行高误当作字体家族迁移目标。

### 6.2 自动检查

先运行定向测试：

```powershell
npx vitest run src/renderer/app/splash/splashContract.test.ts
npx vitest run src/renderer/features/archive/canvas/archiveStage.test.ts src/renderer/features/archive/mac/coverPipeline.test.ts
npx vue-tsc -p tsconfig.web.json --noEmit --tsBuildInfoFile .electron-home/tsconfig.web.tsbuildinfo
git diff --check
```

ESLint 和 Prettier 按实际修改的源码文件列表运行，文档只进行格式检查。既有测试文件变动时一起检查。若新增运行时解析辅助函数，测试应检查 token 缺失和已解析家族两种行为，不用只复述实现的断言替代结果验证。

本轮跨模块字体加载、CSS 变量和打包资源有变化，最终运行一次 `npm run build` 确认打包。遇到工作区已有的非本轮错误，记录准确日志和来源，保留相关修改并说明验证缺口。

### 6.3 实际渲染核验

`getComputedStyle(...).fontFamily` 可确认 CSS 字体栈；它无法单独证明每个字符实际使用哪种字体。结合 Chromium DevTools 的 Rendered Fonts 或可用的 CDP 字形字体信息核验英文与数字。Canvas 用字体就绪检查、实际绘制字体字符串和画面对照共同验证。

使用已有样例或隔离测试内容，避免更改真实歌曲元数据。至少检查以下场景：

| 场景                                  | 样例                             | 预期                                           |
| ------------------------------------- | -------------------------------- | ---------------------------------------------- |
| 设置页                                | `1.1.0`、`400`、`12 px`、HEX/RGB | 英文数字为 Plus Jakarta Sans                   |
| 歌曲列表与播放栏                      | `Track 01`、`03:42`              | 标题、序号、时长符合通用规则                   |
| 歌曲封面、专辑详情、预览、CD 曲目列表 | `Disc 01`、混排碟片标题          | 英文数字为 Georgia；中文保持原后备规则         |
| 专辑详情 Hero 与 CD 专辑标题          | `Album 2026 中文标题`            | 英文数字为 Plus Jakarta Sans；中文保持现有字体 |
| CD 索引与导航                         | 字母索引、日期、数量、模式按钮   | 英文数字统一，布局保持                         |
| CD 歌词与桌面歌词                     | `Hello 123 你好`                 | 英文数字统一；中文衬线字体保留                 |
| 声迹 DOM 和 Shadow DOM                | 年度统计、日期、票根、属性表     | 英文数字统一；中文保持                         |
| 声迹 Canvas 和无封面占位              | 首次进入时的标题、字幕、日期     | 字体就绪后正确绘制，缓存不固定旧字形           |
| 启动页                                | 品牌与错误提示                   | 与通用规则一致，无首帧新增异常                 |

主界面检查浅色和深色各一次，重点页面补充窄窗口及长标题。字体迁移保持 virtualizer 的行高、单行截断和固定轨道几何；换行超出原设计时检查字体覆盖与既有容器规则，避免通过随意缩小字号掩盖问题。

自动检查、Canvas 模拟测试与真实画面分别记录证据。运行环境不足时明确列出未核验项，交付中不宣称视觉验收完成。

## 7. 文档更新与资源处理

更新 `TECHDOC-semantic-font-system-2026-09-29.md` 的现行字体表和混排规则，保留其日期与历史背景并标注本次迁移依据。将“数字优先 Georgia”的历史目标明确标记为已由本方案替代。

本轮复用已有字体资源。Auralis Numerals 是系统 Georgia 的数字别名，没有需要删除的资源文件。其他字体文件仍可能提供中文、历史页面或其他角色；资源裁剪与包体预算调整单独处理。

不新增字体用户设置、持久化字段或 IPC。Plus Jakarta Sans 作为全局已加载资源供页面、Shadow DOM 与 Canvas 使用。

## 8. 完成条件与交付格式

完成需同时满足：普通英文数字使用 Plus Jakarta Sans，碟片标题英文数字使用 Georgia，各模块中文字体保持，字体加载与首帧绘制正确，现有布局和功能通过本轮检查。

交付报告包含：

1. 修改的字体角色和模块。
2. 碟片标题保留 Georgia 的消费位置。
3. 源码扫描剩余字体声明的用途。
4. 检查命令、结果及实际渲染覆盖范围。
5. 未验证项与准确原因。

## 9. 本次施工状态（2026-10-02）

### 已完成

- A–E 批次已施工：建立共享 Plus Jakarta Sans 拉丁与数字角色；保留 Georgia 碟片标题角色；迁移通用界面、启动页、专辑/CD 页面、歌词、设置、声迹 DOM、Shadow DOM 和 Canvas 字体栈。
- `Auralis Numerals` 注册与消费已从 Renderer 清除；全 Renderer 源码扫描中仅 `typography.css` 的 `--auralis-font-disc-heading` 保留有效 Georgia 声明。
- 声迹 Canvas 与 Mac 封面占位画布在首绘前等待相应字体，并通过字体家族解析辅助函数处理 CSS token；保留已有字体资源和中文后备。
- 历史方案 [`TECHDOC-semantic-font-system-2026-09-29.md`](TECHDOC-semantic-font-system-2026-09-29.md) 已标记旧数字规则被替代，并更新现行字体角色和混排规则。

### 自动检查结果

- `npx.cmd vitest run src/renderer/app/splash/splashContract.test.ts src/renderer/features/archive/canvas/archiveStage.test.ts src/renderer/features/archive/mac/coverPipeline.test.ts src/renderer/features/archive/utils/resolveArchiveFontFamily.test.ts`：4 个测试文件、34 项通过。Canvas/封面失败分支产生的诊断 warning 是对应测试的预期输出。
- `npx.cmd vue-tsc -p tsconfig.web.json --noEmit --tsBuildInfoFile .electron-home/tsconfig.web.tsbuildinfo`：通过。
- 定向 ESLint、改动源码 Prettier 检查、`git diff --check`：通过。
- `npm.cmd run build`：完整 typecheck、Renderer/Main/Preload 构建和产物预算检查通过。
- Renderer 字体扫描：Georgia 仅留作碟片标题角色；`Auralis Numerals` 无命中。HarmonyOS Sans SC、Auralis Archive CJK、Auralis Mac Pixel 和 Desktop Lyrics SC 继续作为中文或歌词后备；Chakra Petch、JetBrains Mono、Rajdhani 的既有 `@font-face` 注册保留，但目标声迹角色不再优先使用它们。

### 待完成的实际渲染核验

本次未读取 Chromium `Rendered Fonts`/CDP 字形信息，也未实际逐页检查设置、歌曲列表与播放栏、专辑/CD、歌词、声迹 DOM/Canvas、启动页的中英数混排、换行与窄窗口布局。正在运行的开发 Electron 未提供本次可访问的远程调试接口；为保留用户已启动的进程，没有重启或替换它。自动测试和生产构建不能替代这项实际画面验收，因此当前状态不标记为全部验收完成。

## 10. 可复制的施工提示词

```text
请按 docs/topics/shell/IMPLEMENTATION-latin-numeral-font-unification-2026-10-02.md
完成英文与数字字体迁移。所有普通英文数字使用现有 Plus Jakarta Sans，
仅碟片标题英文数字使用 Georgia；保留各模块原中文字体、字号、字重和布局。
按 A–F 批次顺序施工，覆盖启动页、CD、歌词、声迹 DOM、Shadow DOM、Canvas
与无封面占位绘制。每批检查相关差异，最后完成定向测试、Renderer 类型检查、
构建及实际字体核验，并报告真实完成状态。保留已有未提交修改与真实用户数据。
```
