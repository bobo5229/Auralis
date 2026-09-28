# Auralis 协作入口

Auralis 面向个人大型音乐收藏，是本地优先播放器；不扩展流媒体、社交或在线内容/推荐服务，基于本地收藏的关联浏览不受此限。功能实现状态以当前源码、路由和测试为准。

Renderer 不直接访问数据库、文件系统或 Electron 主进程能力；跨进程访问必须经过显式、类型化的 Preload/IPC。涉及曲库、数据库或音乐文件的工作应保护用户真实数据，不以真实数据做破坏性验证。

专项规则按任务相关性参考，不构成默认必读清单或固定验收流程：

| 主题 | 按需参考 |
| --- | --- |
| Windows 环境与工具链 | [环境与操作](docs/rules/environment.md) |
| 进程边界与 IPC | [架构与 IPC](docs/rules/architecture.md) |
| 曲库、数据库与文件数据 | [曲库与数据](docs/rules/library-data.md) |
| Renderer、播放界面与窗口几何 | [Renderer 视觉与交互](docs/rules/renderer.md) |
| 验收范围 | [风险与验收](docs/rules/validation.md) |
| 交给其他会话执行的提示词 | [施工提示词](docs/rules/handoff-prompts.md) |
| 用户要求 Git 操作或发布 | [Git 与发布](docs/rules/git-release.md) |
