# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auralis is a local-first music player for large personal collections. It is a personal music archive — not a streaming platform — with no social features, recommendations, or online content. Built with Electron 38, Vue 3, TypeScript, and SQLite.

Implemented so far: library scanning (Worker-based background scan with metadata parsing), settings UI for folder selection and scan management, and app shell layout with sidebar + main content + now playing panel + player bar. Playback, albums browsing, search, and archive features are not yet implemented.

## Commands

On Windows, use `npm.cmd` if `npm.ps1` is blocked.

```bash
npm install --cache .npm-cache   # install dependencies with project-local cache
npm run dev                      # start electron-vite dev server
npm run build                    # typecheck + build (vue-tsc --noEmit && electron-vite build)
npm run typecheck                # vue-tsc --noEmit only
npm run lint                     # eslint on src/, electron.vite.config.ts, eslint.config.js, uno.config.ts
npm run format                   # prettier --write .
npm run preview                  # electron-vite preview
npm run rebuild:native           # rebuild better-sqlite3 for Electron 38 (run after install or Electron changes)
```

Node >= 20.19.0 required. After reinstalling dependencies, always run `rebuild:native` before starting the app.

## Architecture

### Three-process Electron model

```
src/
  main/        # Node.js process — database, filesystem, services, Worker threads
  preload/     # Context bridge — exposes typed IPC to renderer
  renderer/    # Vue 3 SPA — UI only, no direct data/system access
  shared/      # Code shared across all three processes
```

### App shell layout

CSS grid layout defined in `uno.config.ts` shortcuts:

```
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

### Data flow (strict)

```
Repository → Service → Typed IPC → UI
```

The renderer must **never** own: database access, filesystem access, music scanning, metadata parsing, artwork generation, or search indexing. It only renders UI, handles animation, and processes user interaction.

### Typed IPC system

All IPC is defined in `src/shared/ipc/`:

- **contracts.ts** — `IpcInvokeContract` maps channel names to `{ request, response }` types. Every new IPC call starts here.
- **channels.ts** — Runtime channel string constants derived from contract keys.
- **api.ts** — `AuralisApi` interface matching the shape exposed on `window.auralis`.

Two IPC patterns are in use:

1. **Invoke** (request/response) — standard `ipcMain.handle` / `ipcRenderer.invoke` for most calls.
2. **Push** (main → renderer) — `window.webContents.send` + `ipcRenderer.on` for streaming events like `library:scan-progress`. Preload wraps these with `onScanProgress(callback)` that returns an unsubscribe function.

Preload (`src/preload/index.ts`) exposes `window.auralis` via `contextBridge.exposeInMainWorld`. Renderer accesses IPC through `src/renderer/shared/ipc/client.ts` which re-exports `window.auralis`.

### Adding a new IPC call

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

```
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

```
features/
  albums/
  archive/
  library/       # LibraryPage + VirtualListPage
  playback/
  search/
  settings/      # SettingsPage + components/MusicLibrarySettings.vue
```

App layout components in `src/renderer/app/layout/`: `AppSidebar.vue`, `NowPlayingPanel.vue`, `PlayerBar.vue`.

Routes registered in `src/renderer/app/router/index.ts` using Vue Router with hash history.

### Documentation

Design docs in `docs/` (written in Chinese):
- `Auralis 曲库加载 PRD.md` — library scanning product requirements
- `Auralis 曲库加载技术设计.md` — library scanning technical design
- `Auralis 悬浮 Playbar PRD.md` — floating playbar product requirements (P0 not yet implemented)

## Conventions

- Vue components use `<script setup lang="ts">` with Composition API exclusively
- Prefer feature-first organization over broad `components/` or `utils/` buckets
- Prettier: no semicolons, single quotes, 100-character print width
- UnoCSS for styling — custom theme colors (ink, paper, linen, moss, brass, dusk) and shortcuts defined in `uno.config.ts`
- Path aliases: `@main`, `@renderer`, `@shared` (configured in `electron.vite.config.ts`)
- Animation through Motion One via `src/renderer/shared/animation/motion.ts` wrapper (currently only `fadeIn`)
- ESLint flat config with vue + typescript-eslint + prettier; `vue/multi-word-component-names` is off, `@typescript-eslint/no-explicit-any` is warn — avoid `any`, justify it if used
- Pino for logging in main process only (`src/main/logging/logger.ts`)
- Database connections are managed as module-level singletons in `src/main/database/connection.ts`

## Testing

No testing framework is configured yet. Until one is added, every change should pass:

```bash
npm run typecheck
npm run lint
npm run build
```

When tests are introduced, place them near the module they cover (e.g., `libraryRepository.test.ts`).

## Commits & Pull Requests

Use concise imperative commit messages, e.g. `Fix renderer entry config` or `Add typed library IPC`.

PRs should include: a short summary, verification commands run, screenshots for UI changes, and notes for native-module or database changes.

## Tech Stack

- Electron 38.x
- Vue 3 (Composition API, `<script setup>`)
- TypeScript ~5.7
- Vue Router 4 (hash history)
- UnoCSS (Tailwind preset + icons)
- Motion One (`@motionone/dom`)
- better-sqlite3
- music-metadata (audio tag parsing in Worker)
- TanStack Vue Virtual (used in example virtual list page)
- Pino + pino-pretty
- electron-vite 3.x
- ESLint 9 + Prettier

## Security

Do not upgrade Electron or `better-sqlite3` casually. After reinstalling dependencies, run `npm run rebuild:native` before starting the app to ensure native modules are compiled against the correct Electron ABI.
