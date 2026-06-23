# Auralis

Auralis is a local-first music player foundation for large personal collections. This repository is
currently in the initialization phase only: it establishes the Electron, Vue, TypeScript, SQLite,
IPC, routing, styling, logging, and repository structure without implementing scanning, playback, or
Archive features.

## Product Direction

Auralis is designed to feel quiet, private, and durable. It is a personal music archive rather than a
streaming platform.

It does not include social features, recommendations, rankings, or online content. The long-term
focus is local library management, album browsing, listening history, and a future Archive memory
system.

## Architecture Rules

Renderer only renders:

- UI
- animation
- user interaction

Renderer must not own:

- database access
- filesystem access
- music scanning
- metadata parsing
- artwork generation
- search indexing

Data access flows through:

```text
Repository -> Service -> Typed IPC -> UI
```

## Stack

- Electron 38.x target
- Vue 3 with Composition API and `<script setup>`
- TypeScript
- Vue Router for top-level pages
- UnoCSS
- Motion One behind a small wrapper
- SQLite through better-sqlite3
- Pino logging
- TanStack Virtual example page
- ESLint and Prettier

## Project Layout

```text
src/
  main/
    app/
    database/
    ipc/
    logging/
    repositories/
    services/
  preload/
  renderer/
    app/
    features/
      albums/
      archive/
      library/
      playback/
      search/
      settings/
    shared/
  shared/
    ipc/
    types/
```

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Current Scope

Implemented in this phase:

- Electron main, preload, and renderer separation
- typed IPC contract
- Vue Router top-level pages
- Feature First renderer structure
- SQLite initialization and schema migration table
- repository and service foundation
- Pino logger
- UnoCSS setup
- Motion One wrapper
- TanStack Virtual example for 30,000 rows
- ESLint and Prettier configuration

Intentionally not implemented:

- music scanning
- playback
- metadata parsing
- artwork cache generation
- Archive behavior
- search indexing
