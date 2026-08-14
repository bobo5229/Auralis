# Phase 13 交付与审查记录

**状态**：工程审查通过；用户已确认人工验收（2026-08-13 回填）
**日期**：2026-08-13
**范围**：仅 `name: 'album-detail'` 的专辑详情页

## 1. 交付结果

- 详情页接入共享 `modern | manuscript` 偏好，不新增第二状态源；
- 手稿模式形成连续纸面、档案内页 Hero、账册曲目和目录式相关专辑；
- 现代模式继续使用 artwork canvas、封面 pointer tilt 和既有视觉；
- 手稿模式停止并清理不可见的 canvas、ResizeObserver 与 pointer 监听，切回现代后恢复；
- 增加 loading、error、not-found、retry 完整状态；
- 三语可见文案统一迁入 `albums.detail.*`；
- 播放、随机播放、队列、选中、双击播放、搜索定位和相关专辑导航语义保持不变；
- 相关专辑图片继续使用 `loading='lazy'` 与 `decoding='async'`。

## 2. 审查 Findings 与解决方案

### Finding 1：Phase 12 的路由解析显式排除了详情页

**风险**：直接按 `/albums` 路径继承会让目录和详情边界模糊，也可能让其他子路由误入手稿模式。
**解决方案**：扩展纯函数 `resolveAlbumPresentation`，仅允许 `albums` 与 `album-detail` 两个明确路由名
消费共享偏好，并用单元测试覆盖无关和缺失路由名。

### Finding 2：现代视觉计算在手稿模式下仍可能后台运行

**风险**：隐藏 canvas 不能阻止封面取色、ResizeObserver、全局 pointer 监听和内联 transform 继续工作。
**解决方案**：把现代效果收口为成对的 enable/disable 生命周期。进入手稿时递增生成号、断开 observer、
移除监听并清除 transform；切回现代时在 `nextTick` 后恢复，使用绑定锁避免重复注册。

### Finding 3：原页面把加载中的空数组等同于未找到

**风险**：慢请求、请求失败和真实无匹配专辑会显示相同结果，后台刷新还可能让现有页面闪空。
**解决方案**：增加 `loading | ready | not-found | error` 状态；请求使用 generation 与卸载失效保护；
首次失败提供重试，后台失败保留已有快照。

### Finding 4：详情页文案混合硬编码中文和英文

**风险**：切换语言后页面只局部变化，未知元数据和无障碍文本不一致。
**解决方案**：新增三语 `albums.detail.*` 契约并校验叶子 key 一致。`Unknown Artist` 与
`Unknown Album` 仅作为内部 identity 保留，本地化只发生在显示层。

### Finding 5：原静态守卫仍把详情页手稿标记视为违规

**风险**：Phase 13 正确实现也会被 Phase 12 的历史断言阻止，或为了通过检查而弱化整个守卫。
**解决方案**：将断言升级为详情页正向契约，逐条检查根作用域、样式导入、共享 token、lazy/async
图片以及排除表面，同时保留 Library 与专辑目录的原有检查。

### Finding 6：组合交互状态和异步恢复存在边缘缺口

**风险**：首次失败后重试成功可能丢失搜索深链高亮；多个 effect 激活源会重复触发 observer 与图片解码；
切换专辑后横向画廊边界可能继承旧值。视觉上，搜索状态可能覆盖键盘焦点环和 selected 标记，相关专辑
卡片缺少 active 反馈。
**解决方案**：在非 ready 到 ready 的统一转换后恢复高亮；用 activation generation 使只有最新 modern
激活生效；在相关专辑集合变化后主动重算滚动边界；为 focus + search、selected + search 编写明确组合
规则，并补充受 reduced-motion 约束的卡片 active 状态。

## 3. 自动验证

主线程最终交付前执行：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

同时检查 locale key parity、UTF-8 严格字节解码、详情 CSS 作用域和可见文案中的禁止字符。

Finding 6 修复落盘后，主线程已完成最终回归：

- 10 个测试文件、28 项 Vitest 全部通过；
- Library、专辑目录与专辑详情视觉作用域守卫通过；
- 类型检查、lint 与生产构建通过；
- 三语 locale key parity 通过；
- Phase 13 相关文件 Prettier 检查通过；
- `git diff --check` 通过；
- 64 个修改或新增文本文件通过严格 UTF-8 字节解码，未发现替换字符或连续问号占位串。

工程审查已通过。用户已于 2026-08-13 确认既有人工验收通过。

## 4. 人工验收门

2026-08-13 按用户确认回填关闭。不补造截图，不填写未记录的分宽度 / DPI 像素表。已覆盖结论：

- modern 与 manuscript 往返切换，确认 canvas、tilt 和监听无残留或重复；
- loading、error + retry、not-found + return、正常专辑；
- 长标题、中英混排、未知曲名、缺封面、单碟与多碟；
- 播放、随机、选择、双击、搜索定位、相关专辑横向滚动与打开；
- 900、1279、1280、1600 像素宽度，以及 Windows 100%、125%、150% 缩放；
- shell、Sidebar、Now Playing、Playbar、Miniplayer、桌面歌词和全屏播放保持不变。
