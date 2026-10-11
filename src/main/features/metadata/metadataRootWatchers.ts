import { watch, type FSWatcher } from 'node:fs'
import { join, normalize, win32 } from 'node:path'
import { logger } from '@main/logging/logger'

export class MetadataRootWatchers {
  private readonly watchers = new Map<string, FSWatcher>()
  private rootPaths = new Map<string, string>()

  constructor(
    private readonly isStopped: () => boolean,
    private readonly onPath: (filePath: string) => void,
  ) {}

  close(): void {
    const watchers = [...this.watchers.values()]
    this.watchers.clear()
    this.rootPaths.clear()
    for (const watcher of watchers) watcher.close()
  }

  containsPath(filePath: string): boolean {
    for (const rootPath of this.rootPaths.values()) {
      const relative = win32.relative(rootPath, filePath)
      if (
        relative === '' ||
        (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative))
      ) {
        return true
      }
    }
    return false
  }

  sync(rootPaths: string[]): boolean {
    if (this.isStopped()) return false
    const nextRootPaths = new Map(
      rootPaths.map((rootPath) => [win32.resolve(rootPath).toLowerCase(), normalize(rootPath)]),
    )
    const changed =
      nextRootPaths.size !== this.rootPaths.size ||
      [...nextRootPaths.keys()].some((key) => !this.rootPaths.has(key))
    this.rootPaths = nextRootPaths

    for (const [key, watcher] of this.watchers) {
      if (!nextRootPaths.has(key)) {
        this.watchers.delete(key)
        watcher.close()
      }
    }

    for (const [key, rootPath] of nextRootPaths) {
      if (this.watchers.has(key)) {
        continue
      }

      this.watchRoot(key, rootPath)
    }
    return changed
  }

  private watchRoot(key: string, rootPath: string): void {
    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (this.isStopped() || this.watchers.get(key) !== watcher || !filename) {
          return
        }

        this.onPath(normalize(join(rootPath, filename.toString())))
      })

      watcher.on('error', (error) => {
        if (this.watchers.get(key) !== watcher) return
        logger.warn({ error, rootPath }, 'Metadata watcher failed')
        this.watchers.delete(key)
        watcher.close()
      })

      this.watchers.set(key, watcher)
      logger.info({ rootPath }, 'Metadata watcher started')
    } catch (error) {
      logger.warn({ error, rootPath }, 'Unable to start metadata watcher')
    }
  }
}
