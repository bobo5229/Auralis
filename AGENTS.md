# Repository Guidelines

## 语言规范

用户可能使用中文或英文发送指令，AI 必须始终用中文回复。

## Project Overview

Auralis 是一个面向个人大型音乐收藏的本地优先（local-first）音乐播放器——不是流媒体平台，无社交功能、推荐或在线内容。技术栈：Electron 38、Vue 3、TypeScript、SQLite。

已实现：曲库扫描（基于 Worker 的后台扫描与元数据解析）、设置 UI（文件夹选择与扫描管理）、应用外壳布局（侧边栏 + 主内容 + 正在播放面板 + 播放栏）。播放、专辑浏览、搜索、归档功能尚未实现。

## Project Structure & Module Organization

Auralis is an Electron + Vue + TypeScript local music archive. Source lives in `src/`:

- `src/main/`: Electron main process (Node.js), database, services, repositories, IPC handlers, logging, Worker threads.
- `src/preload/`: context bridge exposing the typed `window.auralis` API.
- `src/renderer/`: Vue UI only. Feature pages live under `src/renderer/features/`.
- `src/shared/`: shared IPC contracts and cross-process types.

Generated folders such as `out/`, `data/`, `.electron-gyp/`, `.electron-home/`, `.npm-cache/`, and `node_modules/` are not source. There is no test suite yet.

## Build, Test, and Development Commands

Use `npm.cmd` on Windows PowerShell if `npm.ps1` is blocked. Node >= 20.19.0 required.

- `npm.cmd install --cache .npm-cache`: install dependencies with project-local cache.
- `npm.cmd run rebuild:native`: rebuild `better-sqlite3` for Electron 38 after install or Electron changes.
- `npm.cmd run dev`: start the Electron development app.
- `npm.cmd run typecheck`: run `vue-tsc --noEmit`.
- `npm.cmd run lint`: lint source and config files.
- `npm.cmd run format`: format files with Prettier.
- `npm.cmd run build`: typecheck and build with `electron-vite` (`vue-tsc --noEmit && electron-vite build`).
- `npm.cmd run preview`: preview the electron-vite build.

## Coding Style & Naming Conventions

Use TypeScript throughout. Vue components must use Vue 3 Composition API with `<script setup lang="ts">`. Prefer feature-first organization over broad `components/` or `utils/` buckets.

Prettier handles formatting: no semicolons, single quotes, 100-character print width. ESLint uses Vue, TypeScript, and Prettier rules. Avoid `any`; it is allowed only with a warning and should be justified.

- UnoCSS for styling — custom theme colors (ink, paper, linen, moss, brass, dusk) and shortcuts defined in `uno.config.ts`
- Path aliases: `@main`, `@renderer`, `@shared` (configured in `electron.vite.config.ts`)
- Animation through Motion One via `src/renderer/shared/animation/motion.ts` wrapper (currently only `fadeIn`)
- Pino for logging in main process only (`src/main/logging/logger.ts`)
- Database connections are managed as module-level singletons in `src/main/database/connection.ts`

## Architecture Overview

Renderer only renders. It must not access SQLite, filesystem APIs, metadata parsing, artwork generation, scanning, or search indexing directly.

Data flow is strict:

```text
Repository -> Service -> Typed IPC -> UI
```

### App shell layout

CSS grid layout defined in `uno.config.ts` shortcuts:

```text
┌──────────┬─────────────────────┬──────────────┐
│ Sidebar  │     Main Content    │ Now Playing  │
│ (232px)  │                     │  (292px, xl) │
│          │                     │              │
└──────────┴─────────────────────┴──────────────┘
│              Player Bar (fixed bottom)         │
└────────────────────────────────────────────────┘
```

- `AppSidebar.vue` — left nav with primary + utility links
- `NowPlayingPanel.vue` — right panel (hidden below xl breakpoint)
- `PlayerBar.vue` — fixed bottom transport controls

### Typed IPC system

All IPC is defined in `src/shared/ipc/`:

- **contracts.ts** — `IpcInvokeContract` maps channel names to `{ request, response }` types. Every new IPC call starts here.
- **channels.ts** — Runtime channel string constants derived from contract keys.
- **api.ts** — `AuralisApi` interface matching the shape exposed on `window.auralis`.

Two IPC patterns are in use:

1. **Invoke** (request/response) — standard `ipcMain.handle` / `ipcRenderer.invoke` for most calls.
2. **Push** (main → renderer) — `window.webContents.send` + `ipcRenderer.on` for streaming events like `library:scan-progress`. Preload wraps these with `onScanProgress(callback)` that returns an unsubscribe function.

Preload (`src/preload/index.ts`) exposes `window.auralis` via `contextBridge.exposeInMainWorld`. Renderer accesses IPC through `src/renderer/shared/ipc/client.ts` which re-exports `window.auralis`.

Adding a new IPC call:

1. Add the channel type to `IpcInvokeContract` in `src/shared/ipc/contracts.ts`
2. Add the channel string to `ipcChannels` in `src/shared/ipc/channels.ts`
3. Add the method to `AuralisApi` in `src/shared/ipc/api.ts`
4. Add the handler in `src/main/ipc/registerIpcHandlers.ts`
5. Add the preload bridge method in `src/preload/index.ts`

### Repository pattern

- `BaseRepository` (`src/main/repositories/baseRepository.ts`) — abstract class holding a `Database.Database` reference
- Concrete repositories extend it: `LibraryRepository`, `LibraryRootRepository`, `ScanJobRepository`, `TrackRepository`, `ScanFailureRepository`
- Services wrap repositories and are instantiated in `registerIpcHandlers.ts`

### Library scanning architecture

Scanning runs in a background Worker thread to avoid blocking the main process:

```text
Settings UI → Typed IPC → LibraryScanService → Worker thread → Repository → SQLite
```

- `src/main/features/libraryScan/libraryScanService.ts` — lifecycle manager (start, cancel, progress publishing)
- `src/main/features/libraryScan/libraryScanWorker.ts` — runs in `node:worker_threads`, traverses directories, parses metadata via `music-metadata`
- Worker is built as a separate Rollup entry point in `electron.vite.config.ts`
- Progress is pushed to renderer via `webContents.send('library:scan-progress')`
- Supported formats: mp3, flac, m4a, aac, wav, ogg, opus
- Scan deduplication: compares `file_size` + `file_mtime_ms` to skip unchanged files
- Batch writes: tracks are upserted in batches of 300 within SQLite transactions

### Database

SQLite via `better-sqlite3`. Schema migrations are defined in `src/main/database/schema.ts` as an ordered array of `{ id, name, sql }` objects. The migration runner tracks applied migrations in a `schema_migrations` table.

Current tables:

- **tracks** — audio files with metadata (file_path is unique, indexed with file_size + file_mtime_ms for scan dedup)
- **albums** — album titles with artist (unique on title + artist)
- **library_roots** — user-selected music directories
- **scan_jobs** — scan task lifecycle (status: idle → scanning → completed/canceled/failed)
- **scan_failures** — individual file parse errors per job

Database lives at `data/auralis.sqlite` relative to the app root (dev) or `userData` (packaged). WAL mode and foreign keys are enabled by default.

### Renderer structure

Feature-first organization under `src/renderer/features/`:

```text
features/
  albums/
  archive/
  library/       # LibraryPage + VirtualListPage
  playback/
  search/
  settings/      # SettingsPage + components/MusicLibrarySettings.vue
```

App layout components in `src/renderer/app/layout/`: `AppSidebar.vue`, `NowPlayingPanel.vue`, `PlayerBar.vue`. Routes registered in `src/renderer/app/router/index.ts` using Vue Router with hash history.

### Documentation

Design docs in `docs/` (written in Chinese):

- `Auralis 曲库加载 PRD.md` — library scanning product requirements
- `Auralis 曲库加载技术设计.md` — library scanning technical design
- `Auralis 悬浮 Playbar PRD.md` — floating playbar product requirements (P0 not yet implemented)

## Renderer Visual Architecture

The main window is a custom frameless transparent shell (`frame: false`, `transparent: true`,
`backgroundColor: '#00000000'`). Window chrome (background / inset border / control hover) is
driven by the current track's artwork palette via `--auralis-window-chrome-*` CSS variables on
`.app-window`, falling back to theme tokens without a track. Custom Windows-style min/max/close
controls live in `src/renderer/app/layout/WindowChromeControls.vue` (top-right, `no-drag`).
Drag regions exist in the sidebar header, the main-area top strip, Miniplayer, and desktop
lyrics windows.

- `src/renderer/app/layout/PlayerBar.vue`: playback controls, progress, volume, queue/mode
  popovers, desktop-lyrics sync, and artwork-palette CSS variables.
- `src/renderer/features/playback/`: shared playback state, artwork palette worker, fluid
  background, fullscreen player, and animation scheduling.
- `src/renderer/features/albums/pages/AlbumDetailPage.vue`: album hero, play statistics,
  track heat indicators, related-album scroller, and pointer-driven cover projection.
- `src/renderer/app/styles/main.css`: global theme tokens and cross-component shell/player
  effects; `uno.config.ts`: stable layout shortcuts. Keep page-only styles scoped locally.

### Library visual styles

The library's `modern | manuscript` visual style is a feature-scoped preference. It is
independent of the global light/dark theme and the PlayerBar material preference. Keep its
state and persistence in `src/renderer/features/library/composables/useVisualStyle.ts`; do not
fold it into `ThemeMode` or introduce another source of truth.

- The manuscript style currently applies only to the `/` All Songs route, whose route name is
  `library`. Smart and regular playlists reuse `LibraryPage.vue` but must render as `modern`
  without clearing the saved manuscript preference.
- Keep manuscript rules in `src/renderer/features/library/styles/manuscript.css`, scoped under
  `.library-page[data-visual-style='manuscript']`. Do not add unscoped `html`, `body`, `#app`, or
  shell-level manuscript selectors.
- Sidebar, Now Playing, Playbar, Miniplayer, desktop lyrics, and fullscreen playback remain outside this MVP. Teleport overlays owned by the All Songs library page (`LibraryContextMenu` and `MetadataEditDialog`) are scoped under `.library-overlay[data-visual-style='manuscript']` in `src/renderer/features/library/styles/manuscript.overlays.css`; other Teleport overlays remain outside.
- Preserve virtualization geometry unless the CSS and virtualizer estimates are updated
  together: flat rows are 44px, cover tracks are 40px, cover artwork is 250px, track-panel
  vertical padding totals 20px, and album-group vertical padding totals 56px.
- A visual-style change must preserve existing selection, playback queue, search, context-menu,
  metadata, lazy artwork loading, and `decoding='async'` behavior.

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

For library visual-style changes, also manually verify both `modern` and `manuscript` in the
`flat` and `cover` views, confirm playlist routes remain modern, and check both sides of the
`xl` layout breakpoint.

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

Keep native Electron dependencies stable. Do not upgrade Electron or `better-sqlite3` casually. After reinstalling dependencies, run `npm.cmd run rebuild:native` before starting the app to ensure native modules are compiled against the correct Electron ABI.
