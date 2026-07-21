# Repository Guidelines

## 语言规范

用户可能使用中文或英文发送指令，AI 必须始终用中文回复。

## Project Structure & Module Organization

Auralis is an Electron + Vue + TypeScript local music archive. Source lives in `src/`:

- `src/main/`: Electron main process, database, services, repositories, IPC handlers, logging.
- `src/preload/`: context bridge exposing the typed `window.auralis` API.
- `src/renderer/`: Vue UI only. Feature pages live under `src/renderer/features/`.
- `src/shared/`: shared IPC contracts and cross-process types.

Generated folders such as `out/`, `data/`, `.electron-gyp/`, `.electron-home/`, `.npm-cache/`, and `node_modules/` are not source. There is no test suite yet.

## Build, Test, and Development Commands

Use `npm.cmd` on Windows PowerShell if `npm.ps1` is blocked.

- `npm.cmd install --cache .npm-cache`: install dependencies with project-local cache.
- `npm.cmd run rebuild:native`: rebuild `better-sqlite3` for Electron 38 after install or Electron changes.
- `npm.cmd run dev`: start the Electron development app.
- `npm.cmd run typecheck`: run `vue-tsc --noEmit`.
- `npm.cmd run lint`: lint source and config files.
- `npm.cmd run format`: format files with Prettier.
- `npm.cmd run build`: typecheck and build with `electron-vite`.

## Coding Style & Naming Conventions

Use TypeScript throughout. Vue components must use Vue 3 Composition API with `<script setup lang="ts">`. Prefer feature-first organization over broad `components/` or `utils/` buckets.

Prettier handles formatting: no semicolons, single quotes, 100-character print width. ESLint uses Vue, TypeScript, and Prettier rules. Avoid `any`; it is allowed only with a warning and should be justified.

## Architecture Overview

Renderer only renders. It must not access SQLite, filesystem APIs, metadata parsing, artwork generation, scanning, or search indexing directly.

Data flow is strict:

```text
Repository -> Service -> Typed IPC -> UI
```

Add IPC calls through `src/shared/ipc/contracts.ts`, `channels.ts`, `api.ts`, the preload bridge, then `src/main/ipc/registerIpcHandlers.ts`.

## Renderer Visual Architecture

The main window is frameless. `src/renderer/App.vue` owns the persistent shell and renders
the current track's `FluidArtworkBackground` beneath the sidebar, routed page, lyrics panel,
and floating player bar. Native-style close/minimize/maximize controls live in
`src/renderer/app/layout/AppSidebar.vue`; interactive controls must remain in
`-webkit-app-region: no-drag` regions.

- `src/renderer/app/layout/PlayerBar.vue`: playback controls, progress, volume, queue/mode
  popovers, desktop-lyrics sync, and artwork-palette CSS variables.
- `src/renderer/features/playback/`: shared playback state, artwork palette worker, fluid
  background, fullscreen player, and animation scheduling.
- `src/renderer/features/albums/pages/AlbumDetailPage.vue`: album hero, play statistics,
  track heat indicators, related-album scroller, and pointer-driven cover projection.
- `src/renderer/app/styles/main.css`: global theme tokens and cross-component shell/player
  effects; `uno.config.ts`: stable layout shortcuts. Keep page-only styles scoped locally.

> [!IMPORTANT]
> **术语与概念澄清 (Terminology Clarification)**
>
> - **Playbar (或 PlayerBar)**：特指**主页面底部常驻的播放控制栏组件**（即 `src/renderer/app/layout/PlayerBar.vue` 及其核心子组件 `TrackProgressInfo.vue`）。
> - **Miniplayer (迷你播放器)**：特指由 `MiniPlayer.vue` 和主进程 `miniPlayerWindowController.ts` 控制的**独立小窗口**。尺寸按封面优先自适应（见 `src/shared/constants/miniPlayer.ts`）：先定正方形封面边长，再推导窗口宽高。
> - 这两者在架构、DOM流及物理窗口层面上完全独立隔离。在后续迭代或执行 UI/UX 优化指令时，**切勿混淆二者**，修改 Playbar 时不得误触或改动 Miniplayer 的文件，反之亦然。

Derive visual state from the existing playback composable instead of introducing a second
player store. Expensive image/color work belongs in the existing worker/canvas pipeline, not
in render loops. New motion must honor `prefers-reduced-motion`, clean up animation frames and
listeners on unmount, and preserve both light and dark themes.

## Testing Guidelines

No testing framework is configured yet. Until one is added, every change should at least pass:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

When tests are introduced, place them near the module they cover and prefer names such as `libraryRepository.test.ts`.

## Commit & Pull Request Guidelines

Use Chinese commit messages with conventional format:

- `feat：新功能描述`
- `fix：修复描述`
- `chore：维护性工作描述`
- `refactor：重构描述`
- `docs：文档更新描述`

示例：`feat：专辑详情页新增流体封面背景`、`chore：将 issues/ 添加到忽略文件`

### Git 分支工作流

1. 在 `dev` 分支开发并提交
2. 推送到 `origin/dev`
3. 合并到 `master`：`git checkout master && git merge dev --no-edit`
4. 推送到 `origin/master`

Pull requests should include a short summary, verification commands, screenshots for UI changes, and notes for native-module or database changes.

## Security & Configuration Tips

Keep native Electron dependencies stable. Do not upgrade Electron or `better-sqlite3` casually. After reinstalling dependencies, run `npm.cmd run rebuild:native` before starting the app.
