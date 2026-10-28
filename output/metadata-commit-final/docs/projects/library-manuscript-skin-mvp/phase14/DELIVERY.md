# Phase 14 交付与审查记录

**状态**：工程审查通过；用户已确认人工验收（2026-08-13 回填）；源码与文档尚未提交
**日期**：2026-08-13
**范围**：仅 `name: 'archive'` 的归档页及其自有 Teleport 浮层

## 1. 交付结果

- 新增纯函数 `resolveArchivePresentation`，只有 archive 路由消费共享手稿偏好；
- ArchivePage 增加常驻视觉切换、页面 data marker 与归档专属样式入口；
- 音乐日历、Music DNA、年度摘要、单曲榜和专辑榜形成统一档案账册视觉；
- 日期选择、tooltip、每日明细、年度总结和重置确认统一由 archive owner scope 管理；
- 手稿模式不渲染或计算专辑榜 artwork canvas，切回现代后按最新状态恢复；
- 所有归档封面补齐 lazy loading 与 async decoding；
- 扩展静态守卫，检查路由、作用域、媒体、canvas 生命周期和排除表面。

## 2. 审查 Findings 与解决方案

### Finding 1：共享偏好没有归档路由边界

**风险**：直接读取 `visualStyle` 会让复用组件或无关路由意外进入手稿模式。
**解决方案**：新增纯解析器，只接受精确路由名 `archive`，并以单元测试覆盖 modern、无关和缺失路由。

### Finding 2：Teleport 浮层无法继承页面根作用域

**风险**：只写 `.archive-page` 子选择器无法命中 teleport 到 body 的 picker 和 dialog；写全局选择器又会污染
其他页面。
**解决方案**：在唯一 Teleport 内加入 `.archive-overlay` owner wrapper，以 `display: contents` 传递 token，
所有浮层规则要求显式 archive overlay 前缀。

### Finding 3：专辑榜 canvas 在手稿状态仍做不可见计算

**风险**：CSS `display: none` 不能取消在途图片解码、16x16 canvas 采样和主 canvas 绘制。
**解决方案**：模板只在 modern 渲染 canvas；每次绘制、风格切换和卸载都递增 generation，旧 `onload`
回调只有在 generation 与当前风格同时匹配时才能读取像素和绘制。

### Finding 4：归档视觉不是纯 token 可替换结构

**风险**：玻璃、辉光、金银铜排行、圆角、阴影和动画分散在页面与 MusicDnaCard 的 scoped CSS 中。
**解决方案**：保留 modern 原实现，增加 archive-owned 外部覆盖。用纸面、细线、暗红索引和衬线层级替换
材质语义，并通过更高但受控的根作用域优先级覆盖 scoped 样式。

### Finding 5：浮层使用不同定位模型

**风险**：日期 picker 和每日明细是 fixed，年度总结与重置 dialog 由 backdrop 居中；统一设置 position 会造成
浮层错位。
**解决方案**：手稿 CSS 只重写材质；保留 fixed 元素既有 position，仅给需要承载索引伪元素的居中 dialog
增加 `position: relative`。

### Finding 6：图片加载契约不完整

**风险**：排行、年度总结和 Music DNA 的多张封面会在页面进入时同时解码，增加首屏压力。
**解决方案**：不改 artwork URL 或占位逻辑，只为全部归档图片补齐 `loading='lazy'` 和
`decoding='async'`，并由静态守卫逐个检查。

## 3. 自动验证

主线程审查已通过：

- 11 个测试文件、30 项 Vitest 测试；
- Library、专辑目录、专辑详情与归档页视觉作用域守卫；
- Vue/TypeScript 类型检查、三语 locale parity 与 ESLint；
- Electron main、preload 和 renderer 生产构建；
- Phase 14 相关文件 Prettier 检查；
- `git diff --check`；
- 12 个修改或新增文本文件的严格 UTF-8 字节解码，无替换字符或连续问号占位串。

## 4. 人工验收门

用户已于 2026-08-13 确认既有人工验收通过。回填该结论，不补造截图，不填写未记录的分宽度 / DPI
像素表。现代与手稿往返、五类浮层、真实年度数据、Music DNA、专辑榜、重置保护与排除表面视为已通过。

Phase 14 工作树仍未提交，所有权不属于 Phase 15。
