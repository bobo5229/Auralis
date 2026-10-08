import { watch, type FSWatcher } from 'node:fs'
import { join, normalize } from 'node:path'
import { logger } from '@main/logging/logger'

export class MetadataRootWatchers {
  private readonly watchers = new Map<string, FSWatcher>()

  constructor(
    private readonly isStopped: () => boolean,
    private readonly onPath: (filePath: string) => void,
  ) {}

  close(): void {
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }

  sync(rootPaths: string[]): void {
    if (this.isStopped()) return
    const nextRootPaths = new Set(rootPaths.map((rootPath) => normalize(rootPath)))

    for (const rootPath of this.watchers.keys()) {
      if (!nextRootPaths.has(rootPath)) {
        this.watchers.get(rootPath)?.close()
        this.watchers.delete(rootPath)
      }
    }

    for (const rootPath of nextRootPaths) {
      if (this.watchers.has(rootPath)) {
        continue
      }

      this.watchRoot(rootPath)
    }
  }

  private watchRoot(rootPath: string): void {
    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (this.isStopped() || !filename) {
          return
        }

        this.onPath(normalize(join(rootPath, filename.toString())))
      })

      watcher.on('error', (error) => {
        logger.warn({ error, rootPath }, 'Metadata watcher failed')
        watcher.close()
        this.watchers.delete(rootPath)
      })

      this.watchers.set(rootPath, watcher)
      logger.info({ rootPath }, 'Metadata watcher started')
    } catch (error) {
      logger.warn({ error, rootPath }, 'Unable to start metadata watcher')
    }
  }
}
