# TECHDOC：手稿皮肤覆盖归档页（Phase 14）

**文档状态**：工程审查通过；用户已确认人工验收（2026-08-13 回填）
**编写日期**：2026-08-13
**目标路由**：仅 `name: 'archive'`
**视觉偏好**：沿用 `modern | manuscript` 与 `auralis-visual-style` 唯一状态源

## 1. 目标与边界

Phase 14 把手稿视觉语言扩展到归档页，使音乐日历、Music DNA、年度摘要、听歌排行、年度总结与每日
明细形成一组可识别的档案记录。页面可以改变材质、文字层级、分隔线、状态表达和响应式密度，但不得
改变年份、周期和排行类型选择，也不得改变统计数据、Top 10、重置确认或 IPC 请求语义。

覆盖边界只由 Vue Router 的 `archive` 路由名决定。应用窗口外壳、Sidebar、Now Playing、Playbar、
Miniplayer、desktop lyrics 和 fullscreen playback 继续排除。Phase 14 不新增后端接口，不修改数据库，
不改变归档统计口径。

## 2. 状态与作用域契约

1. 页面读取 `features/appearance/composables/useVisualStyle.ts` 的共享偏好，不新增页面级 ref 或存储 key。
2. `resolveArchivePresentation` 只有在 `route.name === 'archive'` 且偏好为 `manuscript` 时返回手稿呈现。
3. 页面根节点以 `.archive-page[data-visual-style='manuscript']` 作为唯一页面视觉作用域。
4. Teleport 内容由 `.archive-overlay[data-visual-style='manuscript']` 承载 owner scope。
5. 共享 token 只向上述两个作用域开放；页面规则不得选择 `html`、`body`、`#app` 或任何播放器表面。
6. `modern` 的原 scoped CSS 保持原样，手稿通过独立外部样式覆盖，不重写现代视觉实现。

## 3. 视觉编排

- 音乐日历：玻璃卡片改为带暗红索引线的纸面档案，热力等级使用同一暗红色阶，保留日期格与横向滚动。
- Music DNA：保留流派色谱和环形命中几何，去除辉光、投影与入场动画，右侧明细使用账册行。
- 年度摘要：四项数据改为有连续边线的统计账页，数字使用等宽数值角色，展开明细保持原交互。
- 听歌排行：周期、目标与日期控件使用纸面控制样式；单曲榜形成编号目录，专辑榜形成唱片索引卡。
- 页面状态：loading、error、empty 使用细虚线状态框，不以玻璃或大面积发光表达。
- 响应式：页面使用命名容器，在 900、680、460 像素附近调整列数、工具栏方向和专辑榜结构。

## 4. 现代特效门控

专辑榜的 `album-hero-static-canvas` 是现代模式的封面取色效果。手稿模式不能仅隐藏画布，而必须停止
创建图片和读取像素。页面以 generation 使在途 `Image.onload` 失效；进入手稿时卸载 canvas 并递增
generation，切回现代后等待 DOM 更新再重新绘制。页面卸载时同样使在途工作失效。

Music DNA 的交互命中、选中和展开状态继续运行，但手稿样式关闭辉光与自动条形动画。所有新增过渡均受
`prefers-reduced-motion` 约束。

## 5. Teleport 浮层

归档页现有一个 Teleport，内部包含日期选择器、热力图 tooltip、每日播放明细、年度总结与重置确认。
Phase 14 使用 `display: contents` 的 owner wrapper 传递 token，不改变各浮层原有 fixed 或 backdrop 定位。
手稿浮层统一使用纸面、墨色、细线和暗红状态，保留：

- 日期、周、月、年选择与回到当前周期；
- 每日 Top 10 的展开、滚动和关闭；
- 年度总结五页导航与分页状态；
- 重置数据的三秒按住确认、禁用态和错误态；
- 键盘 focus-visible 与 reduced-motion。

## 6. 数据、行为与媒体契约

- 保留 heatmap、annual insights、genre spectrum 和 ranking 的现有并发加载与错误分支；
- 保留排行 request id、每日明细 request id、年度总结 request id 和卸载清理；
- 保留 library changed 订阅及播放统计刷新；
- 保留长按显示重置入口与三秒确认，不缩短或绕过保护；
- 所有归档页与 Music DNA 封面继续使用现有 artwork URL 管线，并补齐 `loading='lazy'` 与
  `decoding='async'`；
- 可见文案和统计格式在本阶段保持现状，文案国际化不与视觉覆盖混改。

## 7. 静态守卫

`scripts/check-library-visual-scope.mjs` 增加归档页正向契约：

- 根节点、共享偏好、路由解析器、常驻视觉切换和 overlay owner scope 均存在；
- 共享 token 包含 archive page 与 archive overlay；
- 页面和浮层 CSS 的每条普通选择器都带对应根作用域；
- CSS 不跨入 shell、Sidebar、Now Playing、Playbar、Miniplayer、desktop lyrics 或 fullscreen；
- canvas 只在现代模式渲染，异步绘制带 generation 检查；
- ArchivePage 与 MusicDnaCard 的每个图片标签都有 lazy loading 和 async decoding。

## 8. 人工验收矩阵

| 维度     | 必验项                                                               |
| -------- | -------------------------------------------------------------------- |
| 风格     | modern、manuscript；连续往返切换无残留 canvas 或错误材质             |
| 日历     | 当前年、历史年、未来日期、五级热力、tooltip、点击每日明细            |
| DNA      | loading、empty、环段 hover、选中 Top 3、返回、展开与收起完整光谱     |
| 摘要     | 四项数据、长按入口、展开明细、峰值日打开每日 Top 10                  |
| 排行     | 日、周、月、年；单曲、专辑；日期选择器边界和空数据                   |
| 专辑榜   | 正常封面、缺封面、长标题、多项目切换、canvas 只在 modern 工作        |
| 浮层     | 日期 picker、tooltip、每日明细、年度总结五页、重置确认               |
| 数据刷新 | `play-stats-updated`、`play-stats-reset` 后页面更新且交互状态可预期  |
| 宽度     | 900x620、1279x800、1280x800、1600x900                                |
| 缩放     | Windows 100%、125%、150%                                             |
| 动效     | 正常与 reduced-motion；手稿无辉光和自动条形动画                      |
| 边界     | shell、Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词、全屏不变 |

## 9. 完成定义

11 个测试文件、30 项单元测试、视觉作用域守卫、类型检查、lint、生产构建、Prettier、diff 与严格
UTF-8 检查均已通过。用户已于 2026-08-13 确认既有人工验收通过；工作树提交仍属 Phase 14 所有权。
