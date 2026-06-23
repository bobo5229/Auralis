# Repository Guidelines

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

## Testing Guidelines

No testing framework is configured yet. Until one is added, every change should at least pass:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

When tests are introduced, place them near the module they cover and prefer names such as `libraryRepository.test.ts`.

## Commit & Pull Request Guidelines

No commit convention is currently inferable from local Git history. Use concise imperative commits, for example `Fix renderer entry config` or `Add typed library IPC`.

Pull requests should include a short summary, verification commands, screenshots for UI changes, and notes for native-module or database changes.

## Security & Configuration Tips

Keep native Electron dependencies stable. Do not upgrade Electron or `better-sqlite3` casually. After reinstalling dependencies, run `npm.cmd run rebuild:native` before starting the app.
