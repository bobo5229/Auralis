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

新增或修改 invoke 时，同步检查并维护相关定义和接线：

1. `src/shared/ipc/contracts.ts`
2. `src/shared/ipc/channels.ts`
3. `src/shared/ipc/api.ts`
4. `src/main/ipc/registerIpcHandlers.ts` 及实际 domain registrar
5. `src/preload/index.ts`

主进程现有 payload 校验与注册覆盖检查也必须保持一致，不能只修改 TypeScript 类型就假设输入安全。
具体注册点以当前源码为准，不维护容易过时的通道数量。

Renderer 从 `src/renderer/shared/ipc/client.ts` 使用 preload API。
主进程推送事件由 preload 包装监听器并返回 unsubscribe；使用方负责适时解除订阅。
