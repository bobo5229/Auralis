# 环境与操作

开发环境为 Windows 11 / PowerShell 7；使用 npm.cmd 可避开当前环境的 npm executable shim 问题。Node、Electron、原生依赖版本及可用脚本以 package.json 和锁文件为准。

原生二进制、运行环境变化或 ABI 匹配未确认时，准备匹配当前 Electron ABI 的原生依赖；已有效验证匹配状态时可以复用。常用入口由 package.json 提供，本文件不重复命令清单。

## Electron 启动时 GPU / Renderer 连续崩溃

- 遇到 `exitCode=-2147483645`（`0x80000003`）、软件 GL 回退失败和 `GPU process isn't usable` 时，将安装目录 ACL 与沙箱兼容性纳入排查；错误码本身不能确定根因。
- 先检查实际 Electron 版本、启动参数、安装目录及父目录权限。用同一份 Electron、同一最小页面和独立空白 profile，在原目录与权限干净的临时目录做对照，保持沙箱和硬件加速开启。
- 经对照确认 ACL 触发后，备份受影响目录及子项的权限，仅在 Electron 安装目录处理已验证的问题授权，保留其他权限并核对差异。不要按 `S-1-15-*` 前缀批量删除权限，也不要对工作区、用户目录或磁盘做递归权限重置。
- 修复后从原路径验证页面加载、实际 WebGL 渲染器和 GPU 沙箱状态，再运行使用隔离数据的相关应用检查。现有软件渲染启动脚本同时关闭 GPU 沙箱，不能用其成功启动单独证明显卡驱动有问题；软件渲染冒烟检查也不能替代硬件路径验证。
- 重建 `node_modules/electron/dist` 可能重新继承父目录的问题 ACL。复发时复查权限与对照证据，不直接沿用旧 SID 清单或把关闭沙箱固化为默认配置。

本次证据、修复范围与时间线见 [2026-09-28 Electron 启动崩溃复盘](../reviews/2026-09-28-electron-startup-acl-crash.md)。
