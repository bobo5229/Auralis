# Phase 14 基线

**记录日期**：2026-08-13
**状态**：工程审查通过；用户已确认人工验收（2026-08-13 回填）；工作树尚未提交
**目标范围**：仅归档路由 `name: 'archive'`

## 1. 现状基线

归档页由一个大型页面和 `MusicDnaCard` 组成，已有现代玻璃视觉、年度热力图、Music DNA、年度摘要、
单曲与专辑排行、每日 Top 10、年度总结和重置保护。页面使用现有 archive typed IPC，Phase 14 只建立
Renderer 视觉呈现层，不改动 Repository、Service、IPC contract 或统计查询。

## 2. 必须保留的产品行为

- 进入页面后加载 heatmap、annual insights、genre spectrum、当前排行和年度排行；
- 在日、周、月、年间切换，并选择对应日期、周、月和年份；
- 在单曲榜与专辑榜间切换，专辑榜可通过 hover 改变主卡；
- 热力图 tooltip、每日 Top 10、年度摘要展开和年度总结五页导航；
- Music DNA 环形 hit test、流派选择、Top 3、返回与完整光谱展开；
- 长按年度摘要显示重置入口，再按住三秒确认；
- 播放统计变化后刷新，卸载时释放订阅、计时器和 document 监听。

## 3. 明确排除

不覆盖应用窗口外壳、Sidebar、Now Playing、Playbar、Miniplayer、desktop lyrics 或 fullscreen playback。
不改变归档统计口径，不新增持久化偏好，不调整重置时长，不重写现代 scoped CSS，不在本阶段推进文案
国际化。

## 4. 风险基线

1. 归档页的 Teleport 浮层离开页面 DOM，若没有 owner scope 会丢失手稿 token 或污染其他浮层。
2. 隐藏专辑榜 canvas 不会停止图片解码和像素读取，必须从运行时门控。
3. 页面已有大量动态颜色、blur、shadow 和动画，仅换根 token 无法形成手稿编排。
4. 浮层各自使用不同定位模型，手稿覆盖不得统一重设 position。
5. Music DNA 的色彩同时承担数据含义，不能为了单色风格删除流派区分。
6. 归档页位于可滚动主区，响应式规则不得改变热力图最小宽度和内部日期几何。
7. 重置确认是破坏性操作，视觉重构不得降低三秒按住保护和错误反馈可见性。

## 5. 验证基线

Phase 14 增加纯函数测试与视觉作用域守卫。11 个测试文件、30 项单元测试、视觉作用域守卫、typecheck、
lint、build、Prettier、`git diff --check` 和严格 UTF-8 解码均已通过。自动检查不替代 Electron 内的
浮层位置、缩放和真实统计数据验收。
