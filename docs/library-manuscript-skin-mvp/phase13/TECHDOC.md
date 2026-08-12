# TECHDOC：手稿皮肤覆盖专辑详情页（Phase 13）

**文档状态**：工程审查通过，待人工验收
**编写日期**：2026-08-13
**目标路由**：仅 `name: 'album-detail'`
**视觉偏好**：沿用 `modern | manuscript` 与 `auralis-visual-style` 唯一状态源

## 1. 目标与边界

Phase 13 把已有的手稿视觉语言扩展到专辑详情页。覆盖边界以 Vue Router 的路由名
`album-detail` 为准，不以 `/albums` 路径前缀推断。`modern` 模式和详情页现有产品行为必须完整保留，
包括返回、播放、随机播放、曲目选择与双击播放、多碟分组、收听统计、相关专辑跳转和搜索定位高亮。

以下区域明确排除，不继承详情页手稿结构或 token：应用窗口外壳、Sidebar、Now Playing、Playbar、
Miniplayer、desktop lyrics 和 fullscreen playback。Phase 13 不改变这些区域的 DOM、状态、材质或动画。

## 2. 状态与作用域契约

1. 详情页读取 `features/appearance/composables/useVisualStyle.ts` 的共享偏好，不建立页面级持久化状态。
2. 只有 `route.name === 'album-detail'` 且共享偏好为 `manuscript` 时，根节点才呈现手稿模式。
3. 根节点使用 `.album-detail-page` 和 `data-visual-style` 作为唯一页面作用域。
4. 共享纸张、墨色、暗红与衬线 token 在 `manuscript.tokens.css` 中纳入详情页作用域。
5. 详情页结构样式位于 `features/albums/styles/manuscript.detail.css`；其中每条视觉规则必须受
   `.album-detail-page[data-visual-style='manuscript']` 限制。
6. 页面样式不得选择应用外壳或任何排除区域。Phase 11/12 的 Library、Albums 与 Teleport 浮层边界
   继续有效。

## 3. 视觉与动效策略

手稿模式采用唱片档案页的层级：页眉与返回动作、封面身份区、曲目清单、统计附注和相关专辑形成一张
连续的纸面记录。长标题通过可换行或截断的稳定布局处理，中英文混排不改变信息层级；缺封面使用既有
占位图形，不创建远程资源或新的图片处理路径。

详情页现有动态极光画布与 pointer tilt 只属于 `modern`。进入 `manuscript` 时两者停用并清除残留的
内联变换；切回 `modern` 后恢复既有行为。`prefers-reduced-motion` 的保护、监听器释放和异步图片解码
约束继续保留。相关专辑图片仍必须使用 `loading='lazy'` 与 `decoding='async'`。

## 4. 国际化契约

详情页可见文案统一位于 `albums.detail.*`，三语 key 集合必须一致。覆盖返回、播放、随机播放、曲目与
碟片标签、曲目数单复数、时长、收听次数、未知年份与曲名、相关专辑、图片替代文本、页面状态和重试
动作。

`Unknown Artist` 与 `Unknown Album` 继续作为曲库分组和路由查询的内部 identity。国际化只作用于显示
文案，不翻译、覆写或回写这两个内部值。

## 5. 数据与状态

- loading：首次请求期间呈现明确、可读的加载状态；
- error：请求失败时呈现错误说明和重试动作；
- not-found：请求完成但当前 identity 无匹配曲目时呈现未找到状态和返回专辑目录动作；
- success：保持原排序、多碟划分、选中态、播放态、搜索高亮和统计计算；
- refresh：后台数据变化不得短暂误报 not-found，也不得破坏当前播放队列。

## 6. 静态守卫

`scripts/check-library-visual-scope.mjs` 在原 Library 与专辑目录检查之上增加以下契约：

- 详情页模板根节点同时具备 `.album-detail-page` 和 `data-visual-style`；
- 风格启用由 `album-detail` 路由名控制；
- 页面导入 `manuscript.detail.css`，且共享 token 包含详情页作用域；
- 详情页手稿 CSS 的每个普通选择器均带详情页作用域；
- 相关专辑图片保留 lazy loading 与 async decoding；
- 手稿 CSS 不选择 shell、Sidebar、Now Playing、Playbar、Miniplayer、desktop lyrics 或 fullscreen。

守卫按模板根标签、属性模式和 CSS 规则边界检查，不依赖整文件精确文本快照。

## 7. 人工验收矩阵

| 维度     | 必验项                                                                   |
| -------- | ------------------------------------------------------------------------ |
| 风格     | modern、manuscript；往返切换无残留样式或 transform                       |
| 状态     | loading、error + retry、not-found + return、正常数据                     |
| 标题     | 超长专辑名、超长艺人名、中英混排、符号与数字混排                         |
| 媒体     | 有封面、缺封面、相关专辑图片延迟加载与异步解码                           |
| 曲目     | 单碟、多碟、未知曲名、不同曲目数、时长为零/分钟/小时                     |
| 统计     | 无播放记录、仅次数、分钟级、小时级收听统计                               |
| 相关专辑 | 无相关项、单项、多项、横向滚动、键盘与点击跳转                           |
| 行为     | 返回、整张播放、随机播放、选择、双击播放、搜索定位高亮                   |
| 宽度     | 900x620、1279x800、1280x800、1600x900                                    |
| 缩放     | Windows 100%、125%、150%                                                 |
| 动效     | manuscript 停用动态极光与 pointer tilt；modern 保留；减少动态偏好有效    |
| 边界     | shell、Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词、全屏播放不变 |

## 8. 完成定义

代码整合、locale parity、静态守卫、测试、类型检查、lint 和构建均已完成。人工验收矩阵完成后，
Phase 13 才可标记完全完成。
