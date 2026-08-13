import { logger } from '@main/logging/logger'
import { ArtworkCacheMigrationService } from './artworkCacheMigrationService'
import { ArtworkCacheGarbageCollector } from './artworkCacheGarbageCollector'

export type ArtworkMaintenanceState = 'idle' | 'migrating-cache' | 'collecting-garbage'

export interface ArtworkMaintenanceGate {
  isScanActive: () => boolean
  isRefreshActive: () => boolean
  isImportActive: () => boolean
}

/**
 * Main-process coordinator that serializes artwork cache maintenance against
 * the writers that share the same cache directory (TechDoc §12). Image
 * conversion itself is content-addressed and safe under concurrency, but
 * garbage collection is not — it only runs when no scan / refresh / import
 * worker is active and after all migration transactions committed.
 */
export class ArtworkCacheMaintenanceService {
  private state: ArtworkMaintenanceState = 'idle'
  private activeRun: Promise<void> | null = null

  constructor(
    private readonly migration: ArtworkCacheMigrationService,
    private readonly garbageCollector: ArtworkCacheGarbageCollector,
    private readonly gate: ArtworkMaintenanceGate,
  ) {}

  getState(): ArtworkMaintenanceState {
    return this.state
  }

  isActive(): boolean {
    return this.state !== 'idle'
  }

  private isWriterBusy(): boolean {
    return this.gate.isScanActive() || this.gate.isRefreshActive() || this.gate.isImportActive()
  }

  /** Deferred startup maintenance — never blocks window first display (§10.1). */
  scheduleStartupMaintenance(delayMs = 2000): void {
    setTimeout(() => {
      void this.runStartupMaintenance().catch((error) => {
        logger.error({ error }, 'Scheduled artwork cache maintenance failed')
      })
    }, delayMs)
  }

  /** Migrate legacy keys when present, then GC once the migration committed. */
  runStartupMaintenance(): Promise<void> {
    return this.runGuarded(async () => {
      if (!this.migration.hasLegacyKeys()) {
        logger.info('Artwork cache already current — skipping migration')
        return
      }

      this.state = 'migrating-cache'
      await this.migration.runMigration()
      await this.collectGarbageInternal()
    })
  }

  /** GC after a full scan completed (§11.2) — no-op when any writer is active. */
  runAfterScanGarbageCollection(): Promise<void> {
    return this.runGuarded(async () => {
      await this.collectGarbageInternal()
    })
  }

  private async collectGarbageInternal(): Promise<void> {
    // The reference set is re-queried inside the collector; bail out if a
    // writer started while the migration was running (§11.2).
    if (this.isWriterBusy()) {
      logger.info('Skipping artwork cache garbage collection: a writer task is active')
      return
    }

    this.state = 'collecting-garbage'
    await this.garbageCollector.collectGarbage()
  }

  private runGuarded(run: () => Promise<void>): Promise<void> {
    if (this.activeRun) {
      return this.activeRun
    }

    const task = (async () => {
      if (this.isWriterBusy()) {
        logger.info('Skipping artwork cache maintenance: a writer task is active')
        return
      }

      try {
        await run()
      } finally {
        this.state = 'idle'
      }
    })()

    this.activeRun = task
    void task.then(
      () => {
        if (this.activeRun === task) {
          this.activeRun = null
        }
      },
      () => {
        if (this.activeRun === task) {
          this.activeRun = null
        }
      },
    )
    return task
  }
}
