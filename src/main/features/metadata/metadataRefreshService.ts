import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'
import { writeAudioTags } from './audioTagWriteService'
import { normalizeEditableReleaseDate, normalizeEditableYear } from './editableMetadataValidation'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import { logger } from '../../logging/logger'
import type { RendererEventSender } from '@main/ipc/rendererEvents'

function getWorkerPath(): string {
  return join(__dirname, 'features/metadata/metadataRefreshWorker.js')
}

export interface MetadataRefreshProgress {
  jobId: number
  status: 'running' | 'completed' | 'failed'
  totalTracks: number
  processedTracks: number
  failedTracks: number
}

export class MetadataRefreshService {
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private onTagWriteSuccess: ((filePath: string) => void) | null = null
  private readonly trackGenerations = new Map<number, number>()
  private readonly writingTracks = new Set<number>()
  private readonly pendingReconciliation = new Set<number>()
  private stopping = false
  private readonly pendingMessages = new Set<Promise<void>>()
  private readonly pendingWrites = new Set<Promise<{ ok: boolean }>>()

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    private readonly sendToRenderer: RendererEventSender,
    private readonly ffmpegPath: string,
  ) {
    this.repository.markInterruptedJobs()
  }

  /**
   * Called immediately before the audio file is rewritten so watchers can
   * suppress the incoming mtime events (e.g. skip a metadata refresh).
   */
  setTagWriteSuccessHandler(handler: (filePath: string) => void): void {
    this.onTagWriteSuccess = handler
  }

  /** True while a metadata refresh worker job is running. */
  hasActiveArtworkWrites(): boolean {
    return this.hasActiveJob() || this.writingTracks.size > 0
  }

  hasActiveJob(): boolean {
    return this.activeJobId !== null
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    await Promise.allSettled([...this.pendingWrites])
    const worker = this.activeWorker
    const jobId = this.activeJobId
    this.activeWorker = null
    this.activeJobId = null
    if (worker) {
      try {
        await worker.terminate()
      } catch (error) {
        this.activeWorker = worker
        this.activeJobId = jobId
        throw error
      }
    }
    while (this.pendingMessages.size > 0) await Promise.allSettled([...this.pendingMessages])
    if (jobId !== null)
      this.repository.completeJob(jobId, 'Application shutdown interrupted refresh')
  }

  private assertRunning(): void {
    if (this.stopping) throw new Error('Metadata refresh service is shutting down')
  }

  refreshMissingMetadata(limit = 5000): { jobId: number } {
    this.assertRunning()
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
    }

    const tracks = this.repository.getTracksWithMissingMetadata(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing metadata found')
    }

    const jobId = this.repository.createJob('missing-metadata', tracks.length)
    const workerInput: MetadataRefreshWorkerInput = {
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'metadata',
    }

    this.startWorker(workerInput)

    return { jobId }
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
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
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

    this.startWorker(workerInput)

    return { jobId }
  }

  refreshLyricsForMissing(limit = 5000): { jobId: number } {
    this.assertRunning()
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
    }

    const tracks = this.repository.getTracksWithMissingLyrics(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing lyrics found')
    }

    const jobId = this.repository.createJob('missing-lyrics', tracks.length)
    this.startWorker({
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'lyrics',
    })

    return { jobId }
  }

  private startWorker(input: MetadataRefreshWorkerInput): void {
    input = {
      ...input,
      tracks: input.tracks.map((track) => ({
        ...track,
        generation: this.trackGenerations.get(track.trackId) ?? 0,
      })),
    }
    const worker = new Worker(getWorkerPath(), {
      workerData: input,
    })

    this.activeWorker = worker
    this.activeJobId = input.jobId

    let failed = 0
    let committed = 0
    const expectedTracks = new Map(input.tracks.map((track) => [track.trackId, track]))
    const committedTrackIds: number[] = []
    let messages = Promise.resolve()

    const cleanup = (): void => {
      if (this.activeWorker === worker) {
        this.activeWorker = null
        this.activeJobId = null
        queueMicrotask(() => this.flushReconciliation())
      }
    }

    const handleMessage = async (message: MetadataRefreshWorkerMessage): Promise<void> => {
      if (this.activeWorker !== worker || this.activeJobId !== input.jobId) return
      switch (message.type) {
        case 'result': {
          const r = message.payload
          try {
            const matches = () =>
              r.jobId === input.jobId &&
              expectedTracks.get(r.trackId)?.filePath === r.sourceFilePath &&
              expectedTracks.get(r.trackId)?.generation === r.generation &&
              r.generation === (this.trackGenerations.get(r.trackId) ?? 0) &&
              !this.writingTracks.has(r.trackId) &&
              this.activeWorker === worker &&
              this.repository.getTrackFilePath(r.trackId) === r.sourceFilePath
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            await assertMetadataFingerprint(r)
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            if (input.writeMode === 'lyrics') this.repository.updateTrackLyrics(r)
            else this.repository.updateTrackMetadata(r)
            committed++
            committedTrackIds.push(r.trackId)
          } catch (error) {
            failed++
            const reason = error instanceof Error ? error.message : 'Metadata commit failed'
            this.repository.addFailure(input.jobId, r.trackId, r.sourceFilePath, reason)
            logger.warn(
              { err: error, jobId: input.jobId, trackId: r.trackId },
              'Metadata result was not committed',
            )
          }
          break
        }

        case 'failure': {
          const f = message.payload

          const source = expectedTracks.get(f.trackId)
          if (f.jobId !== input.jobId || !source || source.filePath !== f.filePath) break
          if (
            this.isMissingFileFailure(f.reason) &&
            source.generation === (this.trackGenerations.get(f.trackId) ?? 0) &&
            !this.writingTracks.has(f.trackId) &&
            this.repository.getTrackFilePath(f.trackId) === f.filePath
          ) {
            this.repository.markTrackMissing(f.trackId)
            this.pushChanged([f.trackId], 'track-missing')
          } else {
            this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
          }

          failed += 1
          break
        }

        case 'progress': {
          this.repository.updateJobProgress(input.jobId, committed, failed)
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, 'running')
          break
        }

        case 'complete': {
          this.repository.updateJobProgress(input.jobId, committed, failed)
          this.repository.completeJob(input.jobId)
          this.pushProgress(
            input.jobId,
            committed + failed,
            input.tracks.length,
            failed,
            'completed',
          )
          if (committedTrackIds.length)
            this.pushChanged(committedTrackIds, this.getChangedReason(input.jobId))
          cleanup()
          break
        }

        case 'fatal': {
          cleanup()
          this.repository.completeJob(input.jobId, message.payload.reason)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
          break
        }
      }
    }

    const enqueue = (operation: () => Promise<void> | void): void => {
      messages = messages.then(operation).catch((error: unknown) => {
        logger.error({ err: error, jobId: input.jobId }, 'Metadata message processing failed')
        if (this.activeWorker === worker) {
          cleanup()
          this.repository.completeJob(
            input.jobId,
            error instanceof Error ? error.message : 'Metadata commit failed',
          )
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, 'failed')
        }
      })
      const pending = messages
      this.pendingMessages.add(pending)
      void pending.then(
        () => this.pendingMessages.delete(pending),
        () => this.pendingMessages.delete(pending),
      )
    }
    worker.on('message', (message: MetadataRefreshWorkerMessage) =>
      enqueue(() => handleMessage(message)),
    )

    worker.on('error', (error) =>
      enqueue(() => {
        if (this.activeWorker !== worker) return
        cleanup()
        this.repository.completeJob(input.jobId, error.message)
        this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
      }),
    )

    worker.on('exit', (code) =>
      enqueue(() => {
        // Only handle unexpected exit — normal completion is handled by the
        // 'complete' or 'fatal' message handlers which call cleanup() first.
        if (this.activeWorker === worker && this.activeJobId === input.jobId) {
          cleanup()
          this.repository.completeJob(input.jobId, `Worker exited unexpectedly (code ${code})`)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
        }
      }),
    )
  }

  private pushProgress(
    jobId: number,
    processedTracks: number,
    totalTracks: number,
    failedTracks: number,
    overrideStatus?: 'running' | 'completed' | 'failed',
  ): void {
    const status = overrideStatus ?? (processedTracks >= totalTracks ? 'completed' : 'running')
    const progress: MetadataRefreshProgress = {
      jobId,
      status: status as 'running' | 'completed' | 'failed',
      totalTracks,
      processedTracks,
      failedTracks,
    }

    this.sendToRenderer('metadata:refresh-progress', progress)
  }

  private isMissingFileFailure(reason: string): boolean {
    return /\bENOENT\b|no such file or directory/i.test(reason)
  }

  private getChangedReason(jobId: number): 'metadata-refresh' | 'file-change' {
    const job = this.repository.getJobById(jobId)

    return job?.scope === 'file-change' ? 'file-change' : 'metadata-refresh'
  }

  private pushChanged(
    trackIds: number[],
    reason: 'metadata-refresh' | 'file-change' | 'track-missing',
  ): void {
    this.sendToRenderer('library:changed', {
      trackIds: [...new Set(trackIds)],
      filePaths: [],
      reason,
    })
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

  getTrackMetadata(trackId: number) {
    return this.repository.getEditableTrackMetadata(trackId)
  }

  updateTrackMetadata(metadata: EditableTrackMetadata): Promise<{ ok: boolean }> {
    if (this.stopping) return Promise.reject(new Error('Metadata refresh service is shutting down'))
    const request = this.writeTrackMetadata(metadata)
    this.pendingWrites.add(request)
    void request.then(
      () => this.pendingWrites.delete(request),
      () => this.pendingWrites.delete(request),
    )
    return request
  }

  private async writeTrackMetadata(metadata: EditableTrackMetadata) {
    normalizeEditableReleaseDate(metadata.releaseDate)
    normalizeEditableYear(metadata.year)
    const filePath = this.repository.getTrackFilePath(metadata.trackId)

    if (!filePath) {
      throw new Error(`Audio file not found for track ${metadata.trackId}`)
    }

    if (this.writingTracks.has(metadata.trackId))
      throw new Error('A tag write is already running for this track')
    const generation = (this.trackGenerations.get(metadata.trackId) ?? 0) + 1
    this.trackGenerations.set(metadata.trackId, generation)
    this.writingTracks.add(metadata.trackId)

    // Suppress before the file mutates: ffmpeg replace fires watch events while
    // the write is still in flight, and a 1200ms flush can start first.
    try {
      this.onTagWriteSuccess?.(filePath)
      await writeAudioTags(filePath, metadata, this.ffmpegPath)
      const result = await readStableMetadata(
        metadata.trackId,
        filePath,
        this.artworkCacheDir,
        (actual) => verifyWrittenMetadata(metadata, actual),
      )
      await assertMetadataFingerprint(result)
      if (this.trackGenerations.get(metadata.trackId) !== generation)
        throw new Error('Tag write became stale')
      this.repository.commitVerifiedUserEdit(metadata, result)
      return { ok: true }
    } catch (error) {
      this.pendingReconciliation.add(metadata.trackId)
      logger.warn(
        { err: error, trackId: metadata.trackId },
        'Tag write requires metadata reconciliation',
      )
      throw error
    } finally {
      this.writingTracks.delete(metadata.trackId)
      this.flushReconciliation()
    }
  }

  private flushReconciliation(): void {
    if (this.stopping || this.activeJobId !== null) return
    const ids = [...this.pendingReconciliation].filter((id) => !this.writingTracks.has(id))
    if (!ids.length) return
    for (const id of ids) this.pendingReconciliation.delete(id)
    try {
      this.refreshTracksFromFileChanges(ids)
    } catch (error) {
      logger.warn(
        { err: error, trackIds: ids },
        'Unable to start metadata reconciliation; explicit retry required',
      )
    }
  }
}
