# 架构与 IPC

适用：源码组织、跨层调用、IPC、主进程服务和日志。纯局部 CSS 调整无需加载本文。

## 源码地图

项目使用 Electron、Vue 3、TypeScript 和 SQLite，依赖版本以 `package.json` 为准。

- `src/main/`：主进程、数据库、服务、仓储、IPC、日志、Worker。
- `src/preload/`：通过 context bridge 暴露类型化的 `window.auralis` API。
- `src/renderer/`：Vue UI，功能按 `features/` 组织。
- `src/shared/`：跨进程类型、IPC contract、共享常量。
- `out/`、`data/`、`.electron-gyp/`、`.electron-home/`、`.npm-cache/`、`node_modules/`
  是生成目录，不是源码；不要在这些目录修复应用实现。

## 代码组织

- 业务代码使用 TypeScript；Vue 使用 Composition API 与 `<script setup lang="ts">`。
- 遵守现有 Prettier 配置：无分号、单引号、每行 100 字符。
- 避免 `any`，确有必要时说明原因。
- 使用 feature-first 组织，避免新建宽泛的 `components/`、`utils/` 杂物目录。
- 路径别名为 `@main`、`@renderer`、`@shared`。
- 主进程日志通过 `src/main/logging/logger.ts` 中的 Pino；Renderer 不使用 Pino。
- 不绕过根目录的数据分层边界。元数据解析、封面生成、扫描、搜索索引不能直接放到 UI；
  昂贵的图片或颜色计算复用现有 Worker/canvas 流程，不进入渲染循环。

## Typed IPC

跨进程访问必须经过类型化 Preload/IPC。必须保留 contextIsolation、显式 preload API，以及
sender / top-frame / trusted URL 校验。新增简单能力不再默认新建 Service、Domain registrar、
Dependency interface 或中间 Router。

各文件真实职责：

| 文件                                                   | 职责                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/shared/ipc/channels.ts`                           | 运行时通道名                                                                    |
| `src/shared/ipc/contracts.ts`                          | 唯一 transport 类型来源（invoke request/response、event payload、send payload） |
| `src/shared/ipc/api.ts`                                | Renderer-facing API 人体工学，从 contract 推导，不重新定义数据结构              |
| `src/preload/index.ts`                                 | 显式 capability；不暴露 `ipcRenderer` 或 generic `invoke(channel)`              |
| `src/main/ipc/registerIpcHandlers.ts`                  | Main composition root：装配依赖、注册 IPC                                       |
| 保留的 domain registrar                                | 仅 Library / Playlist / PlaybackArchive / Metadata / Download                   |
| `validatedIpcRegistrar.ts` + `ipcPayloadValidation.ts` | sender 信任 + payload 结构/资源安全；业务合法性在 Service                       |

新增或修改通道时，更新通道名、contract、preload 显式方法和 composition root / 已有 registrar
的注册。payload 校验覆盖必须与通道一致，不能只改 TypeScript 类型就假设输入安全。具体注册点
以当前源码为准，不维护容易过时的通道数量。

`api.ts` 从 contract 推导方法签名，保留 positional 参数人体工学，不把 UI 改成一律对象参数。
Renderer 从 `src/renderer/shared/ipc/client.ts` 使用 preload API。
主进程推送事件由 preload 包装监听器并返回 unsubscribe；使用方负责适时解除订阅。
