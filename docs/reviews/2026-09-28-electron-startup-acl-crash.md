# 2026-09-28 Electron 启动崩溃：安装目录 ACL 与沙箱兼容问题

## 结论

本次启动崩溃由 Electron 安装目录继承的三组 AppContainer 授权触发。移除该目录内对应授权后，同一份 Electron 在原路径恢复启动，NVIDIA 硬件渲染与 GPU 沙箱同时正常工作。

已验证的是这三组授权在本机环境中的触发作用；尚未确定具体哪一组单独足以触发、底层失败调用栈，以及最初写入权限的程序和时间。目录中存在 `CodexSandboxUsers` 权限，不能据此将权限变更归因于某个工具，也不能把未解析为名称的 SID 一概视为无效账户。

## 现象与时间线

环境：Windows、Electron **38.8.6**，NVIDIA GeForce RTX 5060 Laptop GPU 与 AMD Radeon 610M。已安装 Electron 与锁文件版本一致。

| 时间（Asia/Shanghai） | 证据                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 当天下午至约 18 点    | 用户描述：下午开发正常，随后启动出现问题；无精确首次失败记录                                                                   |
| 18:39:22–18:39:23     | 当前 `electron.exe` 的创建和修改时间，表明文件在此时重新生成；不能单凭时间戳推断操作来源或故障起点                             |
| 19:17 左右            | Windows 事件日志记录同一路径 Electron 三次 `0x80000003` 异常，故障模块和偏移一致                                               |
| 20:12                 | 终端记录 GPU 与 Renderer 连续退出，退出码 `-2147483645`；软件 GL 回退失败，最终主进程报告 `GPU process isn't usable. Goodbye.` |
| 20:17–20:20           | 完成目录对照、局部权限修复、硬件渲染验证与应用冒烟检查                                                                         |

`-2147483645` 对应 `0x80000003 / STATUS_BREAKPOINT`，表示原生断点异常；它不是显卡故障的唯一标志。`Failed to collect GPU diagnostics` 出现在子进程崩溃之后，是无法获取 GPU 信息的后续结果。

## 因果验证

最小探针只加载本地内存页面，使用独立空白用户数据目录，不读取真实曲库。两处使用同一份 Electron 和相同启动开关，均未禁用沙箱或硬件加速；复制前后的 `electron.exe` SHA-256 一致。

| 对照                                         | 结果                                                                   | 说明                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| 原安装目录，独立 profile                     | GPU 与 Renderer 均以 `-2147483645` 崩溃                                | 故障可脱离业务页面和原 profile 复现                      |
| 相同运行时复制至权限干净的目录，独立 profile | 页面加载成功，退出码 0                                                 | 二进制内容和当前驱动能够完成启动，安装路径或权限成为重点 |
| 仅修复原安装目录 ACL，再用独立 profile 启动  | 页面加载成功，退出码 0                                                 | 将本次触发条件锁定到被移除的权限项                       |
| 原路径额外创建 WebGL2 上下文                 | NVIDIA RTX 5060、ANGLE / D3D11；`sandboxed=true`，`inProcessGpu=false` | 硬件加速与独立 GPU 沙箱进程均正常                        |

GPU `basic` 信息在初始化早期可能尚未反映实际渲染进程。验收应创建真实 WebGL 上下文，再读取 `getGPUInfo('complete')`，核对渲染器和沙箱状态。

## 实际修复

修复边界为 `node_modules/electron/dist`，共备份并核对 **78 个文件和目录**的 SDDL。操作如下：

1. 保存原始权限，包括继承状态；确认三组目标 `S-1-15-2-…` 授权由父目录继承，子项没有对应显式授权。
2. 在 `dist` 根目录停止权限继承，并保留原有授权副本，防止上级问题授权立即重新进入。
3. 仅移除三组已确认的 AppContainer `Allow` 授权，让变化传播到继承该目录权限的子项。其他账户、能力 SID 和权限保持原样。
4. 重新读取全部 78 个对象；核对目标授权已清除，其他授权的主体、类型、权限值和传播标志无变化。
5. 从原路径运行最小探针及 WebGL2 探针，随后运行 `npm.cmd run smoke:electron`。

实施时，PowerShell 在“转换继承权限并立即按原规则对象删除”后仍留下目标授权，后续 `Set-Acl` 又报 `SeSecurityPrivilege`。最终使用 `icacls /remove:g` 按确切 SID 处理 `dist` 根目录成功。经验是每步写入后重新读取实际 ACL，以最终权限与运行结果验收，不能只看命令是否返回。

本次未修改业务源码、真实用户数据或上级目录权限，也未新增关闭沙箱的启动开关。应用验证基于当时已有构建产物，隔离数据的 **15 项冒烟检查全部通过**；硬件路径由独立 WebGL2 探针验证，未做完整人工视觉验收。

## 复用排查与复发处理

首次遇到类似故障时，先做只读检查：

```powershell
(Get-Content node_modules/electron/package.json -Raw | ConvertFrom-Json).version
Get-Item node_modules/electron/dist/electron.exe |
  Select-Object CreationTime, LastWriteTime
Get-Acl node_modules/electron/dist | Format-List Sddl, AccessToString
Get-Acl node_modules/electron/dist/electron.exe | Format-List Sddl, AccessToString
```

同时检查父目录 ACL、实际启动开关、Windows 应用事件和完整 Chromium 日志。默认 `dev` 脚本会降低日志级别，可参考当前 `dev:verbose-gpu` 脚本收集更早的失败信息。

本项目的 `dev:software-rendering` 同时改变硬件加速和 GPU 沙箱两个变量；该模式成功只能作为线索。优先使用独立 profile 与干净目录对照，避免清空真实用户数据或反复重装依赖。

局部修复随当前 `dist` 目录保存。删除并重新安装 Electron 时，新目录可能重新继承项目目录的问题 ACL。复发时先重新核对安装时间、权限和最小复现，再备份并修复当前目标；不能把本次三个 SID 当成跨机器通用黑名单。上级目录权限的长期调整需要明确其使用者与影响范围，属于另一项环境治理工作。

## 证据保存与参考

本机证据目录：`D:\Auralis-gpu-diagnostic-20260928-201735`，包含：

- `electron-dist-acl-before.json`、`electron-dist-acl-after.json`：权限前后快照。
- `repair-result.json`：修复范围、检查结果与剩余限制。
- `probe.cjs`、`probe-webgl.cjs` 及对应输出：最小复现与硬件验证。

这些证据保留在本机，不随 Git 分发；本文保存可共享的结论和方法。

- [Electron #51761：目录 DACL 与同类 GPU 沙箱崩溃的上游复现报告](https://github.com/electron/electron/issues/51761)。该报告提供排查线索，本次结论依据本机对照实验。
- [Microsoft：包含 STATUS_BREAKPOINT 的异常代码说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-0x3b--system-service-exception)。
- [项目环境规则](../rules/environment.md)。
