# TECHDOC：Auralis 语义字体体系

日期：2026-09-29  
状态：历史方案；其中“数字优先 Georgia”的首轮规则已由 2026-10-02 方案替代。

## 后续规则（2026-10-02）

本文件保留 2026-09-29 的字体角色设计背景。2026-10-02 确认：普通界面文字中的拉丁字母与数字统一优先使用现有 Plus Jakarta Sans；Georgia 仅用于碟片标题。中文继续使用各模块原有中文字体和后备顺序。该规则取代本文旧版 `--auralis-font-ui`、示例代码和混排说明中“数字优先 Georgia”的目标。

现行实现与施工证据见 [`IMPLEMENTATION-latin-numeral-font-unification-2026-10-02.md`](IMPLEMENTATION-latin-numeral-font-unification-2026-10-02.md)。

## 1. 目标

建立按文字用途命名的字体家族变量。组件声明文字的语义角色，字体资源与后备顺序集中维护。首轮迁移保持当前显示效果；以后调整界面字体或碟片标题字体时，只修改对应角色的定义。

本方案管理 `font-family`。已有的歌曲页参数继续管理 `font-weight`；字号、行高、字距、颜色和截断规则仍由各组件控制。字体角色是开发侧样式体系，本方案不增加用户可见的设置项、持久化状态或 IPC。

## 2. 2026-09-29 源码状态（历史快照）

- [`main.css`](../../../src/renderer/app/styles/main.css) 注册 `Auralis Numerals`、`Plus Jakarta Sans`、`Auralis Desktop Lyrics SC`，并在 `:root` 直接写入全局字体栈。`Auralis Numerals` 通过 `unicode-range` 只匹配 ASCII 数字，英文继续落到 Plus Jakarta Sans，中文继续落到 HarmonyOS Sans SC。
- [`harmony-fonts.css`](../../../src/renderer/app/styles/harmony-fonts.css) 注册 HarmonyOS Sans SC 的本地字重资源。
- 歌曲封面视图的 [碟片标题](../../../src/renderer/features/library/components/AlbumCoverGroup.vue)与 [设置预览](../../../src/renderer/features/settings/components/SongFontWeightPreview.vue)分别写有 `Georgia, 'HarmonyOS Sans SC', sans-serif`。两处属于同一语义角色。
- [`CdFocusLyrics.vue`](../../../src/renderer/features/albums/components/CdFocusLyrics.vue)、CD 页面与桌面歌词在局部使用各自的衬线字体栈；[`EditorialLinerNotesCard.vue`](../../../src/renderer/features/archive/components/EditorialLinerNotesCard.vue)已有 `--liner-font-*` 局部变量。
- 音乐来源路径目前继承设置页字体；这一行为应保持。歌曲页字重配置中的 `--auralis-song-*weight` 变量与字体家族角色相互独立。

## 3. Token 结构

采用“全局角色 + 页面局部角色”两级结构。只为存在明确用途、且需要集中管理的字体建立 token；同一角色的正式界面和预览共用同一个 token。

| 角色           | 变量                                               | 现行映射                                                                           | 消费位置                                                    |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 拉丁字母与数字 | `--auralis-font-latin`                             | `'Plus Jakarta Sans'`                                                              | 供通用界面、页面局部角色、Shadow DOM 与 Canvas 角色优先引用 |
| 通用界面       | `--auralis-font-ui`                                | `var(--auralis-font-latin), 'HarmonyOS Sans SC', ...`                              | 根节点继承；设置、音乐来源路径、常规控件                    |
| 颜色数值       | `--auralis-font-color-value`                       | `var(--auralis-font-latin), ui-sans-serif, system-ui, sans-serif`                  | HEX、RGB 输入与显示                                         |
| 碟片标题       | `--auralis-font-disc-heading`                      | `Georgia, 'HarmonyOS Sans SC', sans-serif`                                         | 歌曲封面视图、设置预览、专辑详情和 CD 曲目列表的碟片标题    |
| 桌面歌词       | `--auralis-font-desktop-lyrics`                    | `var(--auralis-font-latin), 'Auralis Desktop Lyrics SC', 'Times New Roman', serif` | 桌面歌词窗口                                                |
| 声迹局部角色   | `--archive-font-*`、`--mac-font`、`--liner-font-*` | Plus Jakarta Sans 优先，保留模块中文字体后备                                       | 声迹 DOM、Shadow DOM 与 Canvas                              |

CD 页保留各自的中文后备栈，并在拉丁字母与数字位置优先引用共享角色；只有跨组件共享需求明确时再抽取 `--auralis-font-cd-*` 局部角色。Archive 继续使用 `--liner-font-*`。技术文本可在确有跨组件共用需求时建立 `--auralis-font-mono`，音乐来源路径仍使用 `--auralis-font-ui`。

变量定义放在 `src/renderer/app/styles/typography.css`，由 `main.css` 在其他样式规则之前导入。字体资源的 `@font-face` 声明继续保留在现有文件中。字体角色不按浅色、深色重复定义，因为当前两种主题的字体一致。

```css
/* typography.css：现行字体角色 */
:root {
  --auralis-font-latin: 'Plus Jakarta Sans';
  --auralis-font-ui:
    var(--auralis-font-latin), 'HarmonyOS Sans SC', 'Arial Unicode MS', 'Nirmala UI',
    'Microsoft Himalaya', 'Leelawadee UI', 'Segoe UI Symbol', ui-sans-serif, system-ui,
    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --auralis-font-color-value: var(--auralis-font-latin), ui-sans-serif, system-ui, sans-serif;
  --auralis-font-disc-heading: Georgia, 'HarmonyOS Sans SC', sans-serif;
  --auralis-font-desktop-lyrics:
    var(--auralis-font-latin), 'Auralis Desktop Lyrics SC', 'Times New Roman', serif;
}
```

`main.css` 的 `:root` 使用 `font-family: var(--auralis-font-ui);`。碟片标题消费位置使用 `font-family: var(--auralis-font-disc-heading);`。桌面歌词容器使用 `font-family: var(--auralis-font-desktop-lyrics);`。其余元素通过继承获得通用界面字体；局部明确指定的艺术化字体继续生效。

### 现行混排规则

`--auralis-font-ui` 是完整字体栈。普通英文和数字由栈首的 Plus Jakarta Sans 提供，中文按各模块原有顺序落到 HarmonyOS Sans SC 或页面专用字体。应用 Renderer 中不再注册或消费 `Auralis Numerals`；Georgia 不参与普通界面数字排版。

`--auralis-font-disc-heading` 独立于通用界面：碟片标题中的英文与数字使用 Georgia，其他文字走后备字体。设置预览与真实标题使用同一变量，并保留各自字号、字重与布局。

## 4. 首轮实施步骤（历史记录）

以下步骤记录 2026-09-29 的初始技术方案。它们描述的“数字优先 Georgia”目标已经被 2026-10-02 方案取代；当前施工批次见后续实现文档。

1. 在 `typography.css` 建立上述三个角色，导入 `main.css`；将根节点和桌面歌词的既有字体声明替换为变量引用。
2. 将碟片标题及设置预览改为共享的 `--auralis-font-disc-heading`；核对正式界面和预览的中英数混排。
3. 清点 CD 页相同与不同的衬线字体栈。只有用途及后备顺序一致的声明才合并为同一局部角色。Archive 的 `--liner-font-*` 保持局部作用域。
4. 后续新增字体样式时优先使用已有角色；新角色以用途命名，记录消费位置与后备字体。避免以具体字体名或某个 CSS 属性值命名语义角色。

首轮修改限于字体家族声明，字号、字重和 UnoCSS shortcut 按现有实现保留。

## 5. 首轮验收设想（历史记录）

- 对照迁移前后 `getComputedStyle(...).fontFamily`，核对普通设置项、音乐来源路径、歌曲封面视图碟片标题、设置预览和桌面歌词。
- 在真实渲染中检查 `Disc 01`、中英数混排的碟片标题及包含英文、数字、中文的音乐来源路径；确认字形、换行、截断和行高不变。
- 核对浅色与深色主题，以及歌曲页自定义字重和“恢复默认参数”后的显示；字体家族不应随字重设置改变。
- 运行 Renderer 相关的类型检查与构建检查。若第三步实施了 CD 局部角色，再对相关 CD 页面做渲染核对。

验收以当前源码与实际渲染为准；本文记录迁移目标，不表示字体体系已经接入应用。
