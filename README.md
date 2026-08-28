# Auralis

Auralis is a Windows-first, local-first music player for large personal collections. It scans music
folders on the user's machine, keeps the library and listening history in SQLite, and does not depend
on accounts, streaming services, recommendations, or cloud storage.

## Current Capabilities

- Full and incremental library scanning in worker threads, with filesystem change monitoring
- Metadata, artwork, and lyrics extraction, plus metadata editing and audio tag write-back
- Track, album, playlist, and smart-playlist browsing
- Local playback, queue management, listening statistics, and gapless playback support
- Archive views for listening history and rankings
- In-app, fullscreen, miniplayer, and desktop-lyrics experiences
- Simplified Chinese, Traditional Chinese, and English interfaces

Feature status is determined by the current source, routes, and tests. Design documents under
[Documentation](docs/README.md) includes topic designs and historical decisions; these are not a
release checklist. Use the [catalog](docs/CATALOG.md) to find individual records.

## Product Direction

Auralis is designed to feel quiet, private, and durable. It is a personal music archive rather than a
streaming platform. Music files, generated artwork, and the application database remain on the local
machine; the application currently has no account system, telemetry, social features, or online
content.

## Architecture Rules

The renderer owns UI, animation, user interaction, and view state. It must not directly access
SQLite, the filesystem, metadata parsers, artwork generation, scanning, or search indexing.

The primary data path is:

```text
Repository -> Service -> Typed IPC -> UI
```

Expensive scanning and metadata work runs in worker threads. Main-process services expose typed IPC
through the preload context bridge.

Both renderer windows run with context isolation, no Node integration, and Electron sandboxing.
Their self-contained CommonJS preloads expose only the APIs required by each surface. Window-open,
webview, permission, redirect, and navigation policies deny capabilities outside the configured
renderer entry.

Renderer diagnostics are structured, bounded, and redacted before being written locally to DevTools;
they are never uploaded as telemetry. Main-process fatal, startup, renderer-exit, and child-process
diagnostics are emitted through Pino after local paths and URLs are redacted.

## Stack

- Electron 38
- Vue 3 with Composition API and `<script setup lang="ts">`
- TypeScript 5.7
- Vue Router, UnoCSS, Motion One, PixiJS, and TanStack Virtual
- SQLite through `better-sqlite3`
- `music-metadata` for local audio metadata
- Pino logging in the main process
- Vitest, vue-tsc, ESLint, and Prettier

Node.js `>=20.19.0` is required.

## Project Layout

```text
src/
  main/       Electron main process, database, services, repositories, IPC, and workers
  preload/    Sandboxed CommonJS context-bridge APIs
  renderer/   Vue application and feature modules
  shared/     Cross-process types and IPC contracts
```

Generated or local-only directories such as `out/`, `release/`, `data/`, `.electron-home/`,
`.electron-gyp/`, `.npm-cache/`, and `node_modules/` are not source code.

## Development

Use PowerShell and `npm.cmd` on Windows:

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run rebuild:native
npm.cmd run dev
```

`better-sqlite3` must match Electron's native-module ABI. Run `rebuild:native` after installing
dependencies or changing Electron before starting the application or running the Electron-native
test channel.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

`npm.cmd test` runs three checks:

1. Ordinary Vitest tests in the Node.js process (`test:unit`), excluding `*.native.test.ts`.
2. `*.native.test.ts` through Vitest hosted by Electron (`test:native`), so SQLite and other
   `better-sqlite3` paths use the correct Electron ABI.
3. The static Library visual-scope check (`test:library-scope`).

The build script already runs type checking before the electron-vite production build. The Windows
CI workflow rebuilds native modules first, runs the complete test suite and lint, and then uses the
build script as the type-check and production-build gate.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`AGENTS.md`](AGENTS.md) for the current
architecture boundaries and repository-specific contribution rules.
