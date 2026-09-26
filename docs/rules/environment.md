# 环境与操作

适用：执行命令、文件操作、编码处理、依赖安装和应用启动。授权判断见根目录 AGENTS.md。
通用文件操作和命令失败处理沿用全局规则，本文补充项目环境与工具入口。

## PowerShell

- 当前环境为 Windows 11 / PowerShell 7（`pwsh`），使用 `npm.cmd` 避免 executable shim 问题。
- 多行 Python 使用 PowerShell here-string 管道传给 `python -`，复杂脚本可使用独立文件。
- `foreach`、`if` 等语句块不能直接作为管道输入；先赋值，或用 `$()` / `@()` 包裹。
- 删除或递归移动前解析绝对目标，确认位于工作区或用户明确指定的目录内，并属于已授权范围。
  权限不足按工具提供的审批机制处理，不绕过限制。

## UTF-8 与中文

- 文本读写遵守全局 UTF-8 约定；PowerShell 读取文本显式使用 `-Encoding utf8`。
- 正常 UTF-8 通道直接传输中文；仅在已知不可靠的命令行、stdin 或 API 边界使用 ASCII 安全
  JSON（如 `ensure_ascii=True`）或 Unicode 转义。
- 修改含中文的文件后，读取实际字节并严格 UTF-8 解码，同时核对改动内容。

## 运行环境与开发入口

- Node.js 要求以 `package.json` 的 `engines` 为准；Electron、better-sqlite3 的版本以依赖声明
  和锁文件为准，不随意升级。
- 安装依赖：`npm.cmd install --cache .npm-cache`；不要为文档或样式小改动重新安装依赖。
- 重新安装依赖或变更 Electron 后，启动前执行 `npm.cmd run rebuild:native`，匹配 Electron ABI。
- 开发启动：`npm.cmd run dev`；已有构建预览：`npm.cmd run preview`。
- 格式化只针对本次文件；`npm.cmd run format` 会写入整个仓库，不作为日常小改动的默认步骤。
- 测试和构建选择见 [风险分级验收](validation.md)，发布步骤见 [Git 与发布](git-release.md)。

以上命令是工具入口，不是每次任务都必须依次执行的清单。
