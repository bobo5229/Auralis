import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerInput } from './metadataRefreshTypes'
import type { MetadataRefreshEvents } from './metadataRefreshEvents'
import { MetadataRefreshWorkerHost } from './metadataRefreshWorkerHost'
import { logger } from '@main/logging/logger'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'

export type { MetadataRefreshProgress } from './metadataRefreshWorkerHost'

export class MetadataRefreshService {
  private readonly workerHost: MetadataRefreshWorkerHost
  private stopping = false
  private legacyRecoveryEnabled = false
  private legacyRecoveryPaused = false
  private legacyRecoveryJob: number | null = null
  private legacyRecoveryCursor = 0
  private legacyRecoveryAttempt = 0
  private legacyRecoveryTimer: ReturnType<typeof setTimeout> | null = null
  private legacyRecoveryWaiters: Array<() => void> = []
  private pendingManualJob: number | null = null
  private pendingManualFinalization: (() => void) | null = null
  private preemption: Promise<void> | null = null

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    private readonly events: MetadataRefreshEvents,
    private readonly writeAdmission?: DatabaseWriteAdmission,
  ) {
    this.workerHost = new MetadataRefreshWorkerHost(
      repository,
      events,
      () => {
        this.finishLegacyRecovery()
        this.scheduleLegacyRecovery(0)
      },
      writeAdmission,
    )
    this.repository.markInterruptedJobs()
  }

  startLegacyLyricsRecovery(): void {
    this.legacyRecoveryEnabled = true
    this.scheduleLegacyRecovery(0)
  }

  async pauseLegacyLyricsRecovery(): Promise<void> {
    this.legacyRecoveryPaused = true
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer)
    this.legacyRecoveryTimer = null
    if (this.legacyRecoveryJob !== null)
      await new Promise<void>((resolve) => this.legacyRecoveryWaiters.push(resolve))
  }

  resumeLegacyLyricsRecovery(): void {
    this.legacyRecoveryPaused = false
    this.scheduleLegacyRecovery(0)
  }

  private scheduleLegacyRecovery(delay: number): void {
    if (
      !this.legacyRecoveryEnabled ||
      this.legacyRecoveryPaused ||
      this.stopping ||
      this.legacyRecoveryTimer
    )
      return
    this.legacyRecoveryTimer = setTimeout(() => {
      this.legacyRecoveryTimer = null
      this.runLegacyRecovery()
    }, delay)
    this.legacyRecoveryTimer.unref()
  }

  private runLegacyRecovery(): void {
    if (this.writeAdmission) {
      try {
        const result = this.writeAdmission.runWriteMaybe(() => this.runLegacyRecoveryAdmitted())
        if (result instanceof Promise)
          void result.catch((error: unknown) => {
            logger.warn({ error }, 'Unable to admit legacy lyric recovery')
            this.scheduleLegacyRecovery(60000)
          })
      } catch (error) {
        logger.warn({ error }, 'Unable to admit legacy lyric recovery')
        this.scheduleLegacyRecovery(60000)
      }
      return
    }
    this.runLegacyRecoveryAdmitted()
  }

  private runLegacyRecoveryAdmitted(): void {
    if (this.stopping || this.legacyRecoveryPaused) return
    this.recoverPendingManualFinalizationAdmitted()
    this.workerHost.recoverPendingFinalizationAdmitted()
    if (this.hasActiveJob()) {
      this.scheduleLegacyRecovery(1000)
      return
    }
    let jobId: number | undefined
    try {
      const tracks = this.repository.getLegacyTtmlTracks(this.legacyRecoveryCursor, 128)
      if (!tracks.length) {
        this.legacyRecoveryCursor = 0
        const delay = Math.min(60000 * 2 ** Math.min(this.legacyRecoveryAttempt, 4), 900000)
        this.legacyRecoveryAttempt += 1
        this.scheduleLegacyRecovery(delay)
        return
      }
      this.repository.pruneLegacyLyricsJobs()
      jobId = this.repository.createJob('legacy-lyrics', tracks.length)
      this.workerHost.start({
        jobId,
        tracks,
        artworkCacheDir: this.artworkCacheDir,
        writeMode: 'legacy-ttml',
      })
      this.legacyRecoveryCursor = tracks[tracks.length - 1].trackId
      this.legacyRecoveryJob = jobId
    } catch (error) {
      if (jobId !== undefined)
        this.repository.completeJob(jobId, 'Legacy lyric recovery failed to start')
      logger.warn({ error }, 'Unable to start legacy lyric recovery')
      this.scheduleLegacyRecovery(60000)
    }
  }

  hasActiveJob(): boolean {
    return this.pendingManualJob !== null || this.workerHost.jobId !== null
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    // Stop accepting worker results before awaiting in-flight I/O.
    const workerShutdown = this.workerHost.shutdown()
    void workerShutdown.catch(() => undefined)
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer)
    this.legacyRecoveryTimer = null
    try {
      if (this.preemption) await this.preemption
      await workerShutdown
      if (this.pendingManualFinalization) {
        if (this.writeAdmission)
          await this.writeAdmission.runWrite(() => this.recoverPendingManualFinalizationAdmitted())
        else this.recoverPendingManualFinalizationAdmitted()
      }
    } finally {
      this.legacyRecoveryJob = null
      for (const resolve of this.legacyRecoveryWaiters.splice(0)) resolve()
    }
  }

  private assertRunning(): void {
    if (this.stopping) throw new Error('Metadata refresh service is shutting down')
  }

  private finishLegacyRecovery(): void {
    if (this.legacyRecoveryJob === null) return
    this.legacyRecoveryJob = null
    for (const resolve of this.legacyRecoveryWaiters.splice(0)) resolve()
  }

  private recoverPendingManualFinalizationAdmitted(): void {
    const finalize = this.pendingManualFinalization
    if (!finalize) return
    finalize()
    if (this.pendingManualFinalization === finalize) this.pendingManualFinalization = null
    this.pendingManualJob = null
  }

  private startUserRefresh(input: MetadataRefreshWorkerInput): void {
    if (this.legacyRecoveryJob === null) {
      try {
        this.workerHost.start(input)
      } catch (error) {
        this.repository.completeJob(
          input.jobId,
          error instanceof Error ? error.message : 'Unable to start metadata refresh',
        )
        throw error
      }
      return
    }

    this.pendingManualJob = input.jobId
    this.legacyRecoveryCursor = 0
    const preemption = (async () => {
      try {
        // This synchronous entry may itself hold write admission. A previously
        // terminated worker can finalize without any I/O await, so always leave
        // the admitted callback before asking the Host to acquire admission again.
        await Promise.resolve()
        await this.workerHost.shutdown('Background lyric recovery yielded to user refresh')
        this.finishLegacyRecovery()
        if (this.stopping) throw new Error('Metadata refresh service is shutting down')
        this.workerHost.start(input)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unable to start metadata refresh'
        const complete = () => {
          this.repository.completeJob(input.jobId, reason)
          this.events.refreshProgress({
            jobId: input.jobId,
            status: 'failed',
            totalTracks: input.tracks.length,
            processedTracks: 0,
            failedTracks: 0,
          })
        }
        try {
          if (this.writeAdmission) await this.writeAdmission.runWrite(complete)
          else complete()
        } catch (finalizationError) {
          this.pendingManualFinalization = complete
          this.writeAdmission?.onAvailable(() => {
            if (!this.pendingManualFinalization) return
            void this.writeAdmission!.runWrite(() =>
              this.recoverPendingManualFinalizationAdmitted(),
            ).catch((recoveryError: unknown) =>
              logger.error(
                { error: recoveryError },
                'Unable to recover manual refresh finalization',
              ),
            )
          })
          throw finalizationError
        }
      } finally {
        if (!this.pendingManualFinalization) this.pendingManualJob = null
        this.scheduleLegacyRecovery(0)
      }
    })()
    this.preemption = preemption
    const clearPreemption = () => {
      if (this.preemption === preemption) this.preemption = null
    }
    void preemption.then(clearPreemption, clearPreemption)
  }

  refreshTrack(trackId: number): { jobId: number } {
    return this.refreshTracks([trackId])
  }

  refreshTracks(trackIds: number[]): { jobId: number } {
    return this.refreshTracksForScope(trackIds, 'tracks')
  }

  refreshTracksFromFileChanges(trackIds: number[]): { jobId: number } {
    return this.refreshTracksForScope(trackIds, 'file-change')
  }

  private refreshTracksForScope(trackIds: number[], scope: string): { jobId: number } {
    this.assertRunning()
    this.recoverPendingManualFinalizationAdmitted()
    this.workerHost.recoverPendingFinalizationAdmitted()
    const activeJob = this.pendingManualJob ?? this.workerHost.jobId
    if (activeJob !== null && (activeJob !== this.legacyRecoveryJob || scope === 'file-change')) {
      throw new Error(`A refresh job is already running (job ${activeJob})`)
    }

    const tracks = this.repository.getTracksByIds(trackIds)

    if (tracks.length === 0) {
      throw new Error('No matching tracks found')
    }

    const jobId = this.repository.createJob(scope, tracks.length)
    const workerInput: MetadataRefreshWorkerInput = {
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'metadata',
    }

    this.startUserRefresh(workerInput)

    return { jobId }
  }

  refreshLyricsForMissing(limit = 5000): { jobId: number } {
    this.assertRunning()
    this.recoverPendingManualFinalizationAdmitted()
    this.workerHost.recoverPendingFinalizationAdmitted()
    const activeJob = this.pendingManualJob ?? this.workerHost.jobId
    if (activeJob !== null && activeJob !== this.legacyRecoveryJob) {
      throw new Error(`A refresh job is already running (job ${activeJob})`)
    }

    const tracks = this.repository.getTracksWithMissingLyrics(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing lyrics found')
    }

    const jobId = this.repository.createJob('missing-lyrics', tracks.length)
    this.startUserRefresh({
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'lyrics',
    })

    return { jobId }
  }

  getJobStatus(jobId: number) {
    return this.repository.getJobById(jobId)
  }

  listFailures(limit?: number) {
    return this.repository.listFailures(limit)
  }

  clearFailures(): { deletedCount: number } {
    return { deletedCount: this.repository.clearFailures() }
  }
}
