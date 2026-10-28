import { watch, type FSWatcher } from 'node:fs'
import { join, normalize, win32 } from 'node:path'
import { logger } from '@main/logging/logger'

const RETRY_INITIAL_MS = 1000
const RETRY_MAX_MS = 30000

export class MetadataRootWatchers {
  private readonly watchers = new Map<string, FSWatcher>()
  private rootPaths = new Map<string, string>()
  private readonly retries = new Map<
    string,
    { attempt: number; timer: ReturnType<typeof setTimeout> | null }
  >()

  constructor(
    private readonly isStopped: () => boolean,
    private readonly onPath: (filePath: string) => void,
    private readonly onRecovered: (rootPath: string, isCurrent: () => boolean) => void,
  ) {}

  close(): void {
    const watchers = [...this.watchers.values()]
    this.watchers.clear()
    this.rootPaths.clear()
    for (const key of this.retries.keys()) this.clearRetry(key)
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
    for (const key of this.retries.keys()) {
      if (!nextRootPaths.has(key)) this.clearRetry(key)
    }

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
        this.scheduleRetry(key)
      })

      this.watchers.set(key, watcher)
      const recovered = this.retries.has(key)
      this.clearRetry(key)
      logger.info({ rootPath }, 'Metadata watcher started')
      if (recovered)
        this.onRecovered(rootPath, () => !this.isStopped() && this.watchers.get(key) === watcher)
    } catch (error) {
      logger.warn({ error, rootPath }, 'Unable to start metadata watcher')
      this.scheduleRetry(key)
    }
  }

  private clearRetry(key: string): void {
    const retry = this.retries.get(key)
    if (retry?.timer) clearTimeout(retry.timer)
    this.retries.delete(key)
  }

  private scheduleRetry(key: string): void {
    if (this.isStopped() || !this.rootPaths.has(key)) return
    let retry = this.retries.get(key)
    if (!retry) {
      retry = { attempt: 0, timer: null }
      this.retries.set(key, retry)
    }
    if (retry.timer) return
    const delay = Math.min(RETRY_INITIAL_MS * 2 ** Math.min(retry.attempt, 5), RETRY_MAX_MS)
    retry.attempt += 1
    const currentRetry = retry
    retry.timer = setTimeout(() => {
      if (this.retries.get(key) !== currentRetry) return
      currentRetry.timer = null
      const rootPath = this.rootPaths.get(key)
      if (!this.isStopped() && rootPath && !this.watchers.has(key)) this.watchRoot(key, rootPath)
    }, delay)
    retry.timer.unref()
  }
}
