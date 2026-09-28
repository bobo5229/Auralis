# 架构与 IPC

Renderer 不直接访问数据库、文件系统或 Electron 主进程能力。跨进程能力通过 context isolation 下显式暴露的类型化 Preload API 提供，不暴露通用 ipcRenderer 或任意通道调用。

IPC 必须验证发送方、顶层 frame 和可信 URL；运行时 payload 也要按结构与资源边界校验，不能把 TypeScript 类型当作输入验证。

IPC transport 契约以 src/shared/ipc/contracts.ts 为单一类型来源；src/shared/ipc/channels.ts 定义运行时通道名，src/preload/index.ts 显式暴露能力，src/main/ipc/registerIpcHandlers.ts 装配处理器。新增或修改 IPC 时保持这些契约、暴露能力、处理器和运行时校验一致。
