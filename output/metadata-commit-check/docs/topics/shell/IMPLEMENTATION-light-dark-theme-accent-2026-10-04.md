# 浅色与深色强调色独立配置施工文档

- 日期：2026-10-04。
- 状态：已实施；交互按当前应用主题编辑。
- 需求入口：将“深色强调色”扩展为“强调色”，浅色模式编辑浅色强调色，深色模式编辑深色强调色。
- 执行方式：面向 GPT6 Luna Max，按下文批次串行实施，每批完成对应检查后进入下一批。
- 当前交互：编辑对象随应用主题切换，保留两套独立偏好。

## 1. 目标与可观察行为

“外观 → 界面”的强调色设置支持浅色、深色两套颜色。两套颜色分别保存，色板、HEX/RGB、预设、效果预览和恢复默认始终操作当前应用主题。上方“主题”设置负责切换应用主题。

| 操作                       | 结果                                           |
| -------------------------- | ---------------------------------------------- |
| 在浅色模式展开或修改强调色 | 编辑并保存浅色强调色                           |
| 在深色模式展开或修改强调色 | 编辑并保存深色强调色                           |
| 点击“恢复默认”             | 只恢复当前主题的默认颜色，并保存结果           |
| 展开期间切换应用主题       | 色板、数字、预设和预览立即切换，清除旧输入草稿 |
| 收起后再次展开             | 显示当前应用主题的颜色                         |
| 重启播放器                 | 两套偏好分别恢复，开屏首帧与主界面颜色一致     |

展开区域只保留色板和预览布局，原有“编辑主题”行与选择器已经移除。保留当前折叠动效、数字字体、鼠标细焦点和键盘焦点区分。桌面预览卡片与左侧色板底部对齐，“效果预览”位于左上角，“恢复默认”位于右上角并使用 `--auralis-danger`。

## 2. 施工边界

本次实施覆盖 Renderer 的强调色偏好、颜色解析、语义 token 接入、设置组件、简体中文文案、开屏引导脚本以及对应测试。沿用 localStorage，保留深色旧键，新建浅色键。

应用主题、减少动态效果、歌曲页参数及数据库维护沿用现有行为。封面取色、全屏播放器的专辑色、艺术图像调色板与静态播放器备用色属于独立色彩来源，继续遵循各自逻辑；本次只接入已有主题强调色消费链。

施工文件以第 8 节清单为准。无需新增依赖、IPC、Preload、数据库迁移或主进程配置。验证使用隔离偏好与测试 DOM。真实用户的两套偏好只在用户实际修改或恢复默认时写入。

工作区存在其他任务的未提交修改。执行者先读取 `AGENTS.md`、施工者规则、Renderer 规则、环境规则和风险与验收规则，核对目标文件当前内容，保留其他任务的差异。实施过程在同一会话串行完成；Git 提交、代理、新会话与发布按用户授权执行。

## 3. 当前源码事实

| 文件                                                               | 当前职责                                                  | 本次处理                       |
| ------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------ |
| `src/renderer/features/appearance/constants/darkAccent.ts`         | 深色默认 `#1DD55F`、存储键、预设、诊断 scope              | 保留深色值与键，复用预设       |
| `src/renderer/features/appearance/composables/useDarkAccent.ts`    | 模块级状态、读取、保存、重试、恢复默认、写入深色 CSS 变量 | 保持 API 与行为                |
| `src/renderer/features/appearance/utils/resolveDarkAccent.ts`      | 不透明六位 HEX 校验、深色提亮、前景色与对比度             | 保留深色算法，复用其规范化函数 |
| `src/renderer/features/settings/components/DarkAccentSettings.vue` | SketchPicker、辅助标签、焦点方式、折叠、预览              | 改为双主题编辑器               |
| `src/renderer/features/settings/components/AppearanceSettings.vue` | 主题切换及强调色组件装配                                  | 更新组件导入                   |
| `src/renderer/composables/useTheme.ts`                             | 应用主题唯一状态来源                                      | 供编辑器读取当前主题           |
| `src/renderer/main.ts`                                             | 挂载前初始化主题与深色强调色                              | 添加浅色初始化                 |
| `src/renderer/app/styles/main.css`                                 | 深色动态强调色；浅色固定强调色与浅填充                    | 接入浅色动态变量               |
| `src/renderer/public/splash/theme-boot.js`                         | 首帧同步读取主题、深色强调色、动效偏好                    | 添加浅色独立读取与解析         |
| `src/renderer/public/splash/splash.css`                            | 深色动态强调色；浅色固定灰色                              | 浅色使用动态变量               |
| `src/renderer/locales/zh-Hans.json`                                | 当前 `settings.appearance.darkAccent` 文案                | 迁移到主题通用命名             |

当前浅色强调色为 `#585B5F`，浅填充为 `#DFE2E5`，主按钮前景为白色。这三个默认外观应保留。深色默认保持 `#1DD55F`。

开屏脚本是首次绘制前执行的经典脚本。它与应用 TypeScript 解析器存在一份必要的同步算法副本，由行为测试维持一致。

## 4. 状态、保存与接口

### 4.1 两个独立存储键

| 主题 | 存储键                 | 默认输入色 |
| ---- | ---------------------- | ---------- |
| 深色 | `auralis-dark-accent`  | `#1DD55F`  |
| 浅色 | `auralis-light-accent` | `#585B5F`  |

值统一为 `#RRGGBB` 大写、不透明字符串。继续保存用户输入色 `source`，界面实际使用解析后的 `display`。已有深色值直接读取；浅色键缺失时使用默认。初始化不写入默认值，不重写无效旧值。

每个主题分别维护颜色、解析结果和 `persistFailed`。一次读取失败只影响该主题的本次显示；一次写入失败保留该主题的会话值。相同颜色的再次提交在保存失败时重试，恢复默认始终尝试保存。

### 4.2 采用增量结构

新增 `constants/lightAccent.ts`，声明 `LIGHT_ACCENT_STORAGE_KEY`、`DEFAULT_LIGHT_ACCENT`、`DEFAULT_LIGHT_ACCENT_SOFT`、`LIGHT_ACCENT_DIAGNOSTIC_SCOPE`。

新增 `composables/useLightAccent.ts`，沿用深色 composable 的小型模块结构，提供以下接口：

```ts
useLightAccent(): {
  lightAccent: Readonly<Ref<string>>
  resolution: ComputedRef<LightAccentResolution>
  persistFailed: Readonly<Ref<boolean>>
  initLightAccent(): void
  setLightAccent(value: unknown, persistWhenUnchanged?: boolean): boolean
  resetLightAccent(): void
}
```

上面的签名用于说明接口，具体 Vue 类型由现有代码风格推导。`useDarkAccent` 继续提供现有深色 API。两个 composable 均不依赖应用主题，初始化时各自写入自身变量；CSS 按应用主题消费变量。

设置组件直接读取 `useTheme().theme`，通过 computed 和明确的浅／深分支取得当前颜色、解析结果与保存状态。写入和恢复默认按应用主题分派。

## 5. 浅色解析与语义颜色

### 5.1 解析接口与规则

新增 `utils/resolveLightAccent.ts`：

```ts
interface LightAccentResolution {
  source: string
  display: string
  soft: string
  onAccent: string
  darkened: boolean
}
```

输入校验复用现有 `normalizeDarkAccent`，它实际校验的是主题通用的六位 HEX 格式。这个名字的全仓迁移不属于本次依赖；后续可以单独整理命名。

浅色算法按下列确定步骤实现：

1. 规范化输入；无效输入回退 `DEFAULT_LIGHT_ACCENT`。
2. 将 RGB 按 0% 至 100%、1% 步进向黑色混合，通道使用整数四舍五入。
3. 每个候选 `display` 先计算 `soft`。当候选等于默认 `#585B5F` 时使用 `#DFE2E5`；其他候选使用 16% 候选色与 84% `#F8F9FA` 的 RGB 混合。
4. `softHover` 使用 90% `soft` 加 10% 候选色。`soft` 输出为整数 HEX；hover 混合保留 RGB 通道小数，与 CSS `color-mix(in srgb, ...)` 一致。解析判定、开屏脚本和测试均使用该小数精度；该比例保留默认浅色外观并满足默认 hover 对比度阈值。
5. 选取第一个同时满足以下条件的候选：在 `#F0F1F2`、`#E7E9EB`、`#F8F9FA`、白色表面上文字对比度至少 4.5；在 `soft`、`softHover` 上强调色文字对比度至少 4.5；白色文字在候选填充上至少 4.5。
6. `onAccent` 固定为 `#FFFFFF`；解析结果已验证该前景。`darkened` 表示 `display !== source`。完整遍历以黑色终止，黑色与本方案浅表面满足阈值。

复用 `src/renderer/shared/color/colorMath.ts` 的 `getContrastRatio`。HEX/RGB 转换与少量混合函数在浅色解析文件内完成，颜色计算依赖沿用项目现状。深色提亮算法继续通过既有测试。

颜色输入可以与最终显示色不同。色板、数字与存储显示输入色；预览及应用使用显示色。沿用当前无提亮提示的简洁界面，补充一条主题通用说明：“颜色会按对应主题调整，以保持界面可读。”

### 5.2 新增浅色变量

`initLightAccent` 与有效写入将下列属性写到 `document.documentElement.style`：

| 属性                            | 值                    |
| ------------------------------- | --------------------- |
| `--auralis-light-accent-source` | `resolution.source`   |
| `--auralis-light-accent`        | `resolution.display`  |
| `--auralis-light-accent-soft`   | `resolution.soft`     |
| `--auralis-light-on-accent`     | `resolution.onAccent` |

`main.css` 的浅色主题块改为：

```css
--auralis-theme-accent: var(--auralis-light-accent, #585b5f);
--auralis-theme-accent-soft: var(--auralis-light-accent-soft, #dfe2e5);
--auralis-control-primary-text: var(--auralis-light-on-accent, #ffffff);
```

将 `--auralis-theme-accent-soft-hover` 的浅色混合比例设为 90% `soft` 与 10% 强调色。侧边栏选中态、歌曲播放行、控件状态、选区、焦点、进度与音量条通过现有语义引用同步更新。深色 token、共享暗红色和基础表面色保持当前定义。

`main.ts` 在 `initTheme()` 后调用 `initDarkAccent()` 和 `initLightAccent()`，两者均在应用挂载前执行。颜色修改不直接写 `--auralis-theme-accent`，保持主题映射层负责选择。

## 6. 设置编辑器与主题跟随

### 6.1 编辑对象与输入绑定

组件为 `ThemeAccentSettings.vue`，通过应用主题选择浅色或深色 composable。当前行色块、HEX 和展开内容使用同一主题。保留现有 `.dark-accent-*` 样式类，移除选择器、独立编辑主题状态及专用键盘导航。

SketchPicker 使用 `:key="theme"` 重建内部输入草稿。`pickerBinding` 的颜色和更新回调捕获生成时的主题；应用主题发生变化后，忽略旧色板的延迟更新，避免旧事件写入新主题。新色板的输入继续保存当前主题源色。

监听应用主题变化时清除当前输入错误，等待 `nextTick` 后同步 picker 全部辅助标签、预设状态和 slider 数值。两套保存失败状态仍独立保存，页面只显示当前主题的失败提示。Escape 收起展开区域后返回触发按钮焦点。

### 6.2 预览与颜色

预览基础表面、描边、标题、空轨道和恢复默认字色直接引用应用主题的语义变量，分别使用 `--auralis-surface-raised`、`--auralis-border-subtle`、`--auralis-text-muted`、`--auralis-progress-track`、`--auralis-danger`。原有跨主题预览属性和硬编码主题投影已移除。

图标、开关启用背景、样本文字块和进度填充使用当前主题的 `resolution.display`，样本文字使用 `resolution.onAccent`。保留局部绑定 `--dark-accent-preview` 和 `--dark-accent-on-preview`。

桌面继续保持左侧 4:3 色板、右侧控件和卡片，预览卡片在第四网格行拉伸以对齐色板底部。760px 以下采用单列布局，检查 360px、760px 及桌面宽度无横向溢出。

### 6.3 文案与辅助功能

标题为“强调色”，文案位于 `settings.appearance.accent`。移除仅供编辑主题行使用的 `editingTheme` 和 `description`。pickerLabel 使用“{theme}强调色选择器”，其中 theme 取当前应用主题名称。

保留不透明颜色校验、六位 HEX 错误提示、保存失败提示与颜色辅助标签。输入的鼠标细焦点和 Tab 键盘焦点沿用现有行为。

## 7. 首帧与重启

`theme-boot.js` 增加浅色默认值与浅色键。主题、深色颜色、浅色颜色分别使用独立 try/catch 读取，任何一个键失败都保留其他键的有效结果。

脚本加入与 TypeScript 版本一致的浅色解析步骤，并写入第 5.2 节四个浅色变量。继续保存经典同步脚本加载方式、减少动态效果计算、reload 跳过开屏行为。此处只读取偏好。

`splash.css` 浅色 `--splash-accent` 改为 `var(--auralis-light-accent, #585b5f)`。更新 `splashContract.test.ts`：浅色强调色从固定 HEX 契约变为变量引用契约，浅色背景与文字仍保留 HEX 检查。深色已有首帧行为继续成立。

`themeBoot.test.ts` 通过真实脚本执行结果与 `resolveLightAccent` 比对，覆盖默认、自定义、极亮输入、无效输入、读取失败以及两个键同时存在。额外断言启动期间不会改写存储。

## 8. 分批施工

每批以当前工作区源码为准；交付说明当前批次、修改文件、通过检查和剩余批次。发现前序批次缺陷时修复相关文件并重跑受影响检查。

### A：浅色纯函数与默认值

**文件**：新增 `constants/lightAccent.ts`、`utils/resolveLightAccent.ts`、`utils/resolveLightAccent.test.ts`。

1. 写入默认值、键与诊断 scope。
2. 实现 source、display、soft、onAccent、darkened。
3. 为默认灰色、白、黑、红、绿、蓝、浅黄、无效输入建立行为测试。
4. 对全部样本验证基础表面、soft、softHover 与主按钮文字阈值；验证默认输入保留原始 display 和 soft。

**完成条件**：纯函数测试通过，现有深色解析测试继续通过。此批不涉及 Vue 和 DOM。

### B：浅色偏好与主题 token

**文件**：新增 `composables/useLightAccent.ts`、`composables/useLightAccent.test.ts`；修改 `main.ts` 与 `app/styles/main.css`。

1. 复用深色偏好的读写结构，分别写入浅色变量。
2. 接入初始化和浅色主题映射。
3. 测试缺失、有效、无效、读取异常、写入异常、同值重试、恢复默认。
4. 同时加载深浅 composable，验证浅色写入只改变浅色键与浅色 CSS 变量；深色操作只改变深色值。

**完成条件**：两套颜色独立保存；默认浅色外观保持；应用主题切换自动选择对应颜色。

### C：开屏与初始化一致性

**文件**：修改 `public/splash/theme-boot.js`、`public/splash/splash.css`、`app/splash/themeBoot.test.ts`、`app/splash/splashContract.test.ts`。

1. 增加独立读取与浅色解析副本。
2. 修改浅色开屏变量引用。
3. 按第 7 节扩展测试，检查源色、显示色、浅填充、前景色。

**完成条件**：两种主题首帧与挂载后使用同一解析结果；某个偏好读取失败不会吞掉另一主题有效值。

### D：编辑器与文案

**文件**：`ThemeAccentSettings.vue`、`AppearanceSettings.vue`、`locales/zh-Hans.json`。

1. 引入两套 composable，由应用主题决定当前颜色、解析结果及保存状态。
2. 移除独立编辑主题状态、选择器、工具行及其专用样式和文案。
3. 输入、预设与恢复默认按当前主题分派。
4. 按应用主题重建 picker，清理输入草稿并同步辅助标签。
5. 为旧 picker 更新回调捕获主题，拒绝主题切换后迟到的旧事件。

**完成条件**：浅色模式只编辑浅色强调色，深色模式只编辑深色强调色；切换应用主题后编辑内容立即更新，两套偏好互不覆盖。

### E：预览与交互验证

**文件**：`ThemeAccentSettings.vue`、`ThemeAccentSettings.test.ts`。

1. 预览基础颜色直接引用当前应用主题语义变量。
2. 保持卡片底部对齐、左右标题和暗红文字按钮。
3. 测试浅色和深色模式下的输入、预设、恢复默认与预览。
4. 测试展开期间切换应用主题、旧草稿清理及旧事件隔离。
5. 检查辅助标签、Escape、收起重开以及各主题的失败提示。

**完成条件**：两种主题下预览正确，操作只写当前主题颜色键。

## 9. 验证与交付

先检查当前 `package.json` 脚本及 pre/post 钩子，采用最终代码状态对应的定向检查。以下是本方案基于当前入口的命令，执行者按实际新增测试名称补齐：

```powershell
npx.cmd vitest run src/renderer/features/appearance/utils/resolveDarkAccent.test.ts src/renderer/features/appearance/utils/resolveLightAccent.test.ts src/renderer/features/appearance/composables/useDarkAccent.test.ts src/renderer/features/appearance/composables/useLightAccent.test.ts src/renderer/composables/useTheme.test.ts src/renderer/app/splash/themeBoot.test.ts src/renderer/app/splash/splashContract.test.ts src/renderer/features/settings/components/ThemeAccentSettings.test.ts
npm.cmd run build
git diff --check
```

当前 `build` 包含 locale 检查、Renderer 与 Node 类型检查、Electron Vite 构建和预算检查，通过后复用这些结果。另对本次修改的 TS/Vue 执行定向 ESLint，对本次修改文件执行 Prettier 检查。

运行验收使用隔离 Electron userData 或测试页面。按浅色和深色应用主题各检查一次，确认以下行为：

- 两个颜色分别保存，重载和重启后可读取；已有深色颜色完整保留。
- 展开期间切换应用主题，编辑内容与预览立即跟随；旧色板事件不能写入新主题。
- 浅色预览和深色预览基础表面、显示色与前景色分别正确。
- 图标、开关、样本文字、进度填充、浅色侧边栏选中态与主题参数一致。
- 桌面卡片底部与色板对齐；760px 单列与 360px 紧凑宽度无横向溢出。
- 鼠标点击颜色输入为细焦点，Tab 焦点保持清晰；方向键与 Escape 正常。
- 编辑输入后立即切换目标，没有旧草稿进入另一主题；错误提示与保存重试分别归属各自主题。

截图需覆盖浅色、深色主题及展开期间的主题切换。采用一次合并检查，发现问题后批量修复，再进行一次确认。静态测试记录与视觉验收记录分别说明。

交付报告写清改动结果、有效验证、剩余问题与文档相对路径。完成标志是两套独立偏好、主题跟随、独立保存、可读颜色、预览和首帧全部满足本方案；普通任务由施工会话自测后交付。
