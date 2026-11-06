import { Worker } from 'node:worker_threads'
import { win32 } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  LibraryRoot,
  LibraryScanStatus,
  SelectLibraryRootResult,
} from '@shared/types/libraryScan'
import { logger } from '@main/logging/logger'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { ScanStagingRepository } from '@main/repositories/scanStagingRepository'
import type { LibraryScanEvents } from './libraryScanEvents'

import { LibraryScanPersistence } from './libraryScanPersistence'
import { LibraryScanWorkerHost, type LibraryScanWorkerFactory } from './libraryScanWorkerHost'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import type { LibraryScanSettlementHost } from './libraryScanSettlementHost'

export type { LibraryScanWorkerFactory } from './libraryScanWorkerHost'

export class LibraryScanService {
  private readonly db: Database.Database
  private readonly libraryRootRepository: LibraryRootRepository
  private readonly scanJobRepository: ScanJobRepository
  private readonly trackRepository: TrackRepository
  private readonly artworkCacheDir: string
  private readonly persistence: LibraryScanPersistence
  private readonly workerHost: LibraryScanWorkerHost
  private stopping = false
  private rootChanging = false
  private rootChange: Promise<SelectLibraryRootResult> | null = null
  private preparation: {
    jobId: number
    canceled: boolean
    done: Promise<void>
    resolve: () => void
  } | null = null
  private readonly cancellations = new Map<number, Promise<{ ok: boolean }>>()
  private failedPreparation: { jobId: number; reason: string } | null = null
  private onRootChange: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  } = {}
  private readonly pendingStarts = new Set<Promise<{ jobId: number }>>()
  private onScanLifecycle: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  } = {}

  constructor(
    db: Database.Database,
    artworkCacheDir: string,
    private readonly selectDirectory: () => Promise<string | null>,
    events: LibraryScanEvents,
    createWorker: LibraryScanWorkerFactory = (fileName, options) => new Worker(fileName, options),
    private readonly writeAdmission?: DatabaseWriteAdmission,
    private readonly settlement?: LibraryScanSettlementHost,
  ) {
    this.db = db
    this.libraryRootRepository = new LibraryRootRepository(db)
    this.scanJobRepository = new ScanJobRepository(db)
    this.trackRepository = new TrackRepository(db)
    this.artworkCacheDir = artworkCacheDir
    this.persistence = new LibraryScanPersistence(
      db,
      this.libraryRootRepository,
      this.scanJobRepository,
      this.trackRepository,
      events,
    )
    this.workerHost = new LibraryScanWorkerHost(
      createWorker,
      {
        onMessage: (message, jobId) => this.persistence.handleMessage(message, jobId),
        onComplete: settlement
          ? (message, jobId) => {
              if (
                !settlement.owns(jobId) &&
                this.scanJobRepository.getById(jobId)?.status !== 'scanning'
              )
                return Promise.resolve()
              return settlement.settle(jobId, this.persistence.exportSettlement(), message.payload)
            }
          : undefined,
        onFailure: (jobId, reason) => this.persistence.fail(jobId, reason),
        onClear: () => this.persistence.clearPendingTracks(),
        onEnd: () => this.onScanLifecycle.onEnd?.(),
      },
      writeAdmission,
    )
    this.scanJobRepository.markInterruptedJobs()
  }

  private write<T>(operation: () => T): Promise<T> {
    return this.writeAdmission
      ? this.writeAdmission.runWrite(operation)
      : Promise.resolve(operation())
  }

  /**
   * Optional hooks so watch flush can pause during a full scan
   * (prevents watch-imported tracks from being markMissing'd on complete).
   */
  setScanLifecycleHooks(hooks: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  }): void {
    this.onScanLifecycle = hooks
  }

  /** True while a scan worker (or a scan in preparation) is running. */
  isScanActive(): boolean {
    return this.workerHost.isActive() || (this.settlement?.isActive() ?? false)
  }

  async selectRoot(): Promise<SelectLibraryRootResult> {
    const selectedPath = await this.selectDirectory()

    if (selectedPath === null) {
      return { canceled: true }
    }

    // The dialog can stay open while another request starts a scan. Recheck here.
    if (this.stopping || this.rootChanging || this.isScanActive() || this.cancellations.size > 0) {
      throw new Error('Cannot change library root while a scan or library change is active')
    }
    const existingRoots = this.libraryRootRepository.list()
    if (existingRoots.length === 1 && win32.relative(existingRoots[0].path, selectedPath) === '') {
      return { canceled: false, root: existingRoots[0] }
    }

    this.rootChanging = true
    const change = this.replaceRoot(selectedPath)
    this.rootChange = change
    try {
      return await change
    } finally {
      this.rootChange = null
      this.rootChanging = false
    }
  }

  setRootChangeHooks(hooks: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  }): void {
    this.onRootChange = hooks
  }

  private async replaceRoot(selectedPath: string): Promise<SelectLibraryRootResult> {
    try {
      await this.onRootChange.onStart?.()
      if (this.stopping) throw new Error('Library root change interrupted by application shutdown')
      const result = await this.write(() =>
        this.db.transaction(() => {
          if (this.stopping)
            throw new Error('Library root change interrupted by application shutdown')
          const missingIds = new Set<number>()
          for (const oldRoot of this.libraryRootRepository.list()) {
            // Keep tracks covered by the new root available, including overlapping roots.
            for (const id of this.trackRepository.markMissingUnderRootExcept(
              oldRoot.path,
              [],
              [selectedPath],
            )) {
              missingIds.add(id)
            }
            this.libraryRootRepository.deleteById(oldRoot.id)
          }
          const root = this.libraryRootRepository.upsertByPath(selectedPath)
          return { root, missingIds: [...missingIds] }
        })(),
      )
      if (result.missingIds.length > 0) this.persistence.publishMissingTracks(result.missingIds)
      return { canceled: false, root: result.root }
    } finally {
      try {
        await this.onRootChange.onEnd?.()
      } catch (error) {
        logger.error({ error }, 'Failed to end library root change lifecycle')
      }
    }
  }

  getRoots(): LibraryRoot[] {
    return this.libraryRootRepository.list()
  }

  getScanStatus(jobId?: number): LibraryScanStatus | null {
    const status = jobId
      ? this.scanJobRepository.getById(jobId)
      : this.scanJobRepository.getLatest()
    return status?.status === 'scanning' ? { ...status, phase: this.persistence.phase } : status
  }

  startScan(rootId: number): Promise<{ jobId: number }> {
    if (this.stopping) return Promise.reject(new Error('Library scan service is shutting down'))
    const request = this.startScanInternal(rootId)
    this.pendingStarts.add(request)
    void request.then(
      () => this.pendingStarts.delete(request),
      () => this.pendingStarts.delete(request),
    )
    return request
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    await Promise.allSettled([
      ...this.pendingStarts,
      ...this.cancellations.values(),
      ...(this.rootChange ? [this.rootChange] : []),
    ])
    await this.settlement?.shutdown()
    if (this.failedPreparation) await this.finishFailedPreparation()
    await this.workerHost.retryPendingFailure()
    await this.workerHost.waitForCleanup()
    if (this.workerHost.activeJobId !== null) await this.cancelScan(this.workerHost.activeJobId)
  }

  private async startScanInternal(rootId: number): Promise<{ jobId: number }> {
    if (this.cancellations.size > 0) await Promise.all([...this.cancellations.values()])
    const settlementRecovery = this.settlement?.recoverPending()
    if (settlementRecovery) await settlementRecovery
    if (this.failedPreparation) await this.finishFailedPreparation()
    const recovery = this.workerHost.retryPendingFailure()
    if (recovery) await recovery
    const cleanup = this.workerHost.waitForCleanup()
    if (cleanup) await cleanup
    if (this.stopping) throw new Error('Library scan service is shutting down')
    if (this.rootChanging) throw new Error('Cannot start a scan while the library root is changing')
    const prepare = () => {
      if (this.stopping) throw new Error('Library scan service is shutting down')
      if (this.rootChanging)
        throw new Error('Cannot start a scan while the library root is changing')
      // COMMIT may already be visible while the settlement host still owns its
      // connection/lease or the old lifecycle has not finished. Keep that owner.
      if (this.workerHost.activeJobId !== null)
        return { existing: true as const, jobId: this.workerHost.activeJobId }
      const activeJob = this.scanJobRepository.getActive()

      if (activeJob) {
        // This service still owns the job (it may be waiting for the async
        // lifecycle start hook before the worker is created) — return existing.
        if (this.workerHost.activeJobId === activeJob.jobId) {
          return { existing: true as const, jobId: activeJob.jobId }
        }

        // Orphan scanning row without a live worker — heal then start fresh.
        logger.warn(
          { jobId: activeJob.jobId },
          'Healing orphan scanning job without an active worker',
        )
        this.scanJobRepository.fail(
          activeJob.jobId,
          'Scan job recovered after unexpected interruption',
        )
      }

      const root = this.libraryRootRepository.getById(rootId)

      if (!root) {
        throw new Error(`Library root not found: ${rootId}`)
      }

      const job = this.scanJobRepository.create(root.id)
      new ScanStagingRepository(this.db).pruneInventories()
      this.persistence.begin()
      this.workerHost.prepare(job.jobId)
      return { existing: false as const, jobId: job.jobId, root }
    }
    const pending = this.writeAdmission ? this.writeAdmission.runWriteMaybe(prepare) : prepare()
    const prepared = pending instanceof Promise ? await pending : pending
    if (prepared.existing) return { jobId: prepared.jobId }
    const { root, jobId } = prepared
    let resolvePreparation!: () => void
    const preparation = {
      jobId,
      canceled: false,
      done: new Promise<void>((resolve) => {
        resolvePreparation = resolve
      }),
      resolve: () => resolvePreparation(),
    }
    this.preparation = preparation

    try {
      await this.onScanLifecycle.onStart?.()
      if (this.stopping) throw new Error('Library scan interrupted by application shutdown')
      if (preparation.canceled) return { jobId }
      this.workerHost.start({
        jobId,
        rootPath: root.path,
        knownFiles:
          this.db.name && this.db.name !== ':memory:'
            ? []
            : this.trackRepository.getKnownFiles(root.path),
        databasePath: this.db.name && this.db.name !== ':memory:' ? this.db.name : undefined,
        rootId: root.id,
        artworkCacheDir: this.artworkCacheDir,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to prepare library scan'
      if (!preparation.canceled) {
        this.failedPreparation = { jobId, reason }
        await this.finishFailedPreparation()
      }
      throw error
    } finally {
      if (this.preparation === preparation) this.preparation = null
      preparation.resolve()
    }

    return { jobId }
  }

  private async finishFailedPreparation(): Promise<void> {
    const failure = this.failedPreparation
    if (!failure) return
    await this.write(() => this.scanJobRepository.fail(failure.jobId, failure.reason))
    if (this.failedPreparation === failure) this.failedPreparation = null
    await this.workerHost.finish(failure.jobId)
  }

  cancelScan(jobId: number): Promise<{ ok: boolean }> {
    const existing = this.cancellations.get(jobId)
    if (existing) return existing
    if (this.workerHost.activeJobId !== jobId || this.workerHost.waitForCleanup()) {
      return Promise.resolve({ ok: false })
    }
    if (this.preparation?.jobId === jobId) this.preparation.canceled = true
    const cancel = this.cancelScanInternal(jobId)
    this.cancellations.set(jobId, cancel)
    void cancel.then(
      () => this.cancellations.delete(jobId),
      () => this.cancellations.delete(jobId),
    )
    return cancel
  }

  private async cancelScanInternal(jobId: number): Promise<{ ok: boolean }> {
    if (this.preparation?.jobId === jobId) await this.preparation.done
    if (this.settlement?.owns(jobId)) {
      const accepted = this.settlement.requestCancel(jobId)
      await this.settlement.wait(jobId)
      await this.workerHost.finish(jobId)
      return { ok: accepted }
    }
    if (this.scanJobRepository.getById(jobId)?.status !== 'scanning') {
      await this.workerHost.finish(jobId)
      return { ok: false }
    }
    if (!(await this.workerHost.terminate(jobId))) return { ok: false }
    // Keep ownership when persistence fails so cancellation or shutdown can retry
    // the terminal write before releasing the lifecycle pause.
    const canceled = await this.write(() => this.scanJobRepository.finish(jobId, 'canceled'))
    if (this.failedPreparation?.jobId === jobId) this.failedPreparation = null
    await this.workerHost.finish(jobId)
    if (!canceled) return { ok: false }
    const status = this.scanJobRepository.getById(jobId)

    if (status) {
      this.persistence.publishProgress({
        jobId,
        status: 'canceled',
        totalFiles: status.totalFiles,
        scannedFiles: status.scannedFiles,
        failedFiles: status.failedFiles,
        currentFile: null,
        message: 'Scan canceled',
      })
    }

    return { ok: true }
  }
}
