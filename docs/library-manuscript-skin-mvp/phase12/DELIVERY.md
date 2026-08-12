# Phase 12 交付记录

**状态**：代码完成，待人工验收
**日期**：2026-08-13

## 已实现

- 视觉偏好与切换组件迁入 `features/appearance/`，保持唯一状态源和原存储键；
- 共享手稿 token 支持 Library 与 Albums 两个明确作用域；
- `/albums` 增加唱片目录页眉、真实统计与目录卡编号；
- 手稿 grid/perspective、搜索、状态和右键浮层形成视觉闭环；
- 未知元数据只改变显示文本，不改变专辑分组 key 或详情路由 query；
- `/albums/detail` 保持 modern；
- 静态视觉作用域检查扩展至 Albums；
- 增加专辑路由 presentation 单元测试；
- AGENTS 更新为跨页面视觉状态架构。

## 自审 Findings 与解决办法

### Finding 1：本地化 fallback 会破坏未知专辑的 identity

**问题**：若在专辑聚合时把 `Unknown Album` 改为本地化文本，打开详情时无法与详情页既有分组规则匹配。
**解决**：聚合 key 和 route query 继续使用稳定内部 fallback，只在 AlbumCard 显示层本地化。

### Finding 2：加载失败后重试无法重新绑定 ResizeObserver

**问题**：初始加载失败时滚动容器不存在，原 mounted 流程不会在重试成功后重新测量网格。
**解决**：成功加载后的 `nextTick` 内统一测量并重新绑定 observer，初始加载和 retry 共用同一路径。

### Finding 3：搜索反馈实现产生两次全量匹配扫描

**问题**：先收集匹配索引，再执行旧循环会重复归一化和匹配。
**解决**：查询仅归一化一次，由匹配索引直接选出下一项并判断回绕。

### Finding 4：页面卸载后初始请求可能继续绑定监听器

**问题**：用户在专辑加载完成前离开页面时，异步 mounted 流程仍可能提交 tracks、建立
ResizeObserver 或订阅 library changed。
**解决**：增加卸载失效标记，阻止请求完成后的状态提交、网格测量和监听器注册。

## 自动验证

以下检查已通过：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

- Vitest：10 个测试文件、27 项测试通过；
- Library/Albums 视觉作用域与虚拟几何静态检查通过；
- 三语 locale key 集合一致；
- production build 无 `artworkUrl` 资源解析警告；
- 所有新增或修改的中文文件执行严格 UTF-8 字节解码校验。

## 人工门禁

尚未执行 TECHDOC 第 5 节矩阵。人工验收完成前，本阶段不得标记为完全关闭。
