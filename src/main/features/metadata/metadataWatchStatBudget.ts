import { stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'

export const WATCH_STAT_BATCH_SIZE = 512
export const WATCH_STAT_CONCURRENCY = 128

/** Shared across ordinary, recovery and missing-confirmation work. */
export class MetadataWatchStatBudget {
  private active = 0
  private readonly waiting: Array<{ canRun: () => boolean; resolve: (granted: boolean) => void }> =
    []

  async stat(filePath: string, canRun: () => boolean): Promise<Stats> {
    if (!(await this.acquire(canRun))) throw new WatchStatCancelled()
    try {
      if (!canRun()) throw new WatchStatCancelled()
      return await stat(filePath)
    } finally {
      this.active--
      this.drain()
    }
  }

  async settle(
    filePaths: readonly string[],
    canRun: () => boolean,
  ): Promise<Array<PromiseSettledResult<Stats> | null>> {
    const results: Array<PromiseSettledResult<Stats> | null> = Array(filePaths.length).fill(null)
    let next = 0
    const worker = async (): Promise<void> => {
      while (canRun()) {
        const index = next++
        if (index >= filePaths.length) return
        try {
          results[index] = { status: 'fulfilled', value: await this.stat(filePaths[index], canRun) }
        } catch (error) {
          if (error instanceof WatchStatCancelled) return
          results[index] = { status: 'rejected', reason: error }
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(WATCH_STAT_CONCURRENCY, filePaths.length) }, worker),
    )
    return results
  }

  private acquire(canRun: () => boolean): Promise<boolean> {
    if (!canRun()) return Promise.resolve(false)
    if (this.active < WATCH_STAT_CONCURRENCY) {
      this.active++
      return Promise.resolve(true)
    }
    return new Promise((resolve) => this.waiting.push({ canRun, resolve }))
  }

  private drain(): void {
    while (this.active < WATCH_STAT_CONCURRENCY && this.waiting.length) {
      const item = this.waiting.shift()!
      if (!item.canRun()) item.resolve(false)
      else {
        this.active++
        item.resolve(true)
      }
    }
  }
}

export class WatchStatCancelled extends Error {}
