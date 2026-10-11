# 已确认冗余清理记录

日期：2026-10-06。范围：旧声迹实现、旧排行榜动效、无用途依赖及确认无消费者的样式。

## 删除与保留边界

- 删除旧 `archiveStage`、`macStage`、`coverPipeline`、封面量化 worker、`loadTray` 的实现及专属声明、样式、HTML 和测试，共 15 个文件。当前 `ArchiveMacPage` 继续使用 `mountArchiveMacView`、`macDevice` 和 `archiveDisks`。
- 删除 `scripts/capture-archive-mac-preview.mjs`：它仍加载已不产出的 `coverQuantize.worker`。保留现用 `capture-archive-mac.mjs` 及其“旧 worker 不进入产物”的断言。
- 保留 `archiveHologram.js` 和相邻测试：三个演示渲染器仍直接导入该工具。字体和演示素材均未删除。
- 删除三个无调用方的 `animateRanking*` 函数，移除 `@motionone/dom` 和 `pino-pretty` 直接依赖并同步锁文件。Pixi 是现用背景库的 peer dependency；`image-q` 仍被封面取色使用，均保留。
- 删除旧 `archive-overlay`、`player-bar-time`、`playlist-add-submenu` 和未使用危险按钮样式，以及始终隐藏的播放栏和菜单装饰伪元素规则。保留当前菜单的背景模糊和所有有效 Vue Transition 类。

未修改后台停帧、频谱订阅、全屏背景生命周期、数据库、音乐文件或 Preload/IPC。保留工作区已有的其他修改。

## CSS 变量复核

前轮 28 个候选中删除 25 个无读取定义。复核覆盖 `src`、`scripts`、`demo`、根目录配置；并检查脚本读取，不能仅搜索 `var(...)`。

保留的三个变量：

| 变量                           | 消费者                                   |
| ------------------------------ | ---------------------------------------- |
| `--auralis-shell-vertical-gap` | `uno.config.ts` 生成的侧栏样式           |
| `--auralis-now-playing-bg`     | `uno.config.ts`、播放栏材质演示          |
| `--auralis-cover-divider`      | `uno.config.ts` 生成的曲库封面分隔线样式 |

删除的定义涉及旧窗口强调色、播放中行辅助色、侧栏旧状态色、旧菜单边框/阴影、旧封面分组背景、旧背景光晕、返回按钮及统计卡片色。具体名称见 `main.css` 差异。

## 验证结果

- 9 个定向测试文件、53 项测试通过，覆盖保留的全息工具、现用声迹设备和星空、动效偏好、页面过渡、播放栏浮层及曲库菜单。
- `npm.cmd run build` 中的翻译检查、Renderer/Main 类型检查、Main/Preload/Renderer 编译通过。
- 默认 `postbuild` 预算检查失败：它递归计入 `out` 中已有的两份 GPU 审计目录，包含旧源码和旧构建产物。本次未删除或移动这些已有目录，也未修改预算阈值。
- 用同一预算脚本分别检查本次 `out/renderer`、`out/main`、`out/preload`，全部通过。Renderer JS 3.33 MB、CSS 375.47 KB、字体 100.72 MB；Main JS 1.29 MB，Preload JS 11.33 KB。这是当前产物大小，不是前后性能对比。
- 隔离 Electron 中以最小 DOM 加载修改前后的真实 CSS，对照 15 个代表元素，覆盖深浅主题、700/1180 宽度和减弱动效，共 8 组。播放栏、队列、模式菜单、更多菜单、右键菜单、搜索栏及内联音量控件的非自定义计算样式一致；移除的自定义属性不参与相等断言。
- 相关 ESLint、格式检查、视觉范围脚本及差异空白检查通过。

依赖同步使用 `--package-lock-only --ignore-scripts`，未触发安装脚本或原生依赖重建。隔离样式对照不是完整应用视觉验收；未测量 GPU/CPU 或启动速度，不据此宣称性能提升。
