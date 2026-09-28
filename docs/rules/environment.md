# 环境与操作

开发环境为 Windows 11 / PowerShell 7；使用 npm.cmd 可避开当前环境的 npm executable shim 问题。Node、Electron、原生依赖版本及可用脚本以 package.json 和锁文件为准。

原生二进制、运行环境变化或 ABI 匹配未确认时，准备匹配当前 Electron ABI 的原生依赖；已有效验证匹配状态时可以复用。常用入口由 package.json 提供，本文件不重复命令清单。
