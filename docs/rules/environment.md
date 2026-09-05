# 环境与操作

适用：执行命令、文件操作、编码处理、依赖安装和应用启动。全局授权与范围见根目录 AGENTS.md。

## PowerShell

- 当前环境为 Windows 11 / PowerShell 7（`pwsh`），使用 `npm.cmd` 避免 executable shim 问题。
- 文件操作使用 `Get-ChildItem`、`Get-Content`、`Copy-Item`、`Move-Item`、`Remove-Item`、
  `New-Item`、`Test-Path` 等原生命令；用户路径优先使用 `-LiteralPath`。
- 不在一次文件操作中混用 PowerShell、`cmd /c` 或 Bash，也不把枚举出的路径交给其他 shell 删除或移动。
- 操作分成发现、检查、编辑、验证，命令保持短小可检查。`rg` 失败后改用原生 PowerShell 搜索。
- 复杂正则优先单引号；带通配符的目录先用 `Get-ChildItem -Filter` 展开，不能直接作为 `rg` 搜索路径。
- 多行 Python 使用 PowerShell here-string 管道传给 `python -`，禁止 Bash heredoc。
- `foreach`、`if` 等语句块不能直接作为管道输入；先赋值，或用 `$()` / `@()` 包裹。
- 解析、权限、编码、别名或 shim 导致命令失败时，不重复同一种失败写法；改用简单原生命令、
  直接可执行文件路径或小脚本。权限不足按工具提供的审批机制处理，不绕过限制。
- 递归删除或移动前检查解析后的绝对目标必须在工作区或用户明确指定的目录内。

## UTF-8 与中文

- Python、Node 等脚本读写文本显式指定 UTF-8，PowerShell 读取文本显式使用 `-Encoding utf8`。
- 命令行参数、stdin 或 API 传输中文时，使用 ASCII 安全 JSON 序列化（如 `ensure_ascii=True`）
  或 Unicode 转义，避免编码链路损坏中文。
- 中文手工编辑优先使用安全编辑工具；写入后读取文件字节进行严格 UTF-8 解码，不只看终端显示。
- JSON、CSV、XML 或较大转换优先使用小型脚本、项目生成器或格式化工具，不构造复杂 shell 字符串。

## 运行环境与开发入口

- Node.js 不低于 20.19.0；Electron、better-sqlite3 的实际版本以 `package.json` 为准，不随意升级。
- 安装依赖：`npm.cmd install --cache .npm-cache`；不要为文档或样式小改动重新安装依赖。
- 重新安装依赖或变更 Electron 后，启动前执行 `npm.cmd run rebuild:native`，匹配 Electron ABI。
- 开发启动：`npm.cmd run dev`；已有构建预览：`npm.cmd run preview`。
- 格式化只针对本次文件；`npm.cmd run format` 会写入整个仓库，不作为日常小改动的默认步骤。
- 测试和构建选择见 [风险分级验收](validation.md)，发布步骤见 [Git 与发布](git-release.md)。

以上命令是工具入口，不是每次任务都必须依次执行的清单。
