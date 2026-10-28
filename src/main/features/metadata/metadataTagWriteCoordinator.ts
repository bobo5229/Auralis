import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { AudioTagEdit as EditableTrackMetadata } from './audioTagEdit'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import { writeAudioTags, prepareAudioTagWrite } from './audioTagWriteService'
import { normalizeEditableMetadata } from './editableMetadataValidation'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import { logger } from '@main/logging/logger'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'
import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'
import { MetadataSaveError } from './metadataSaveError'

export interface MetadataWriteCoordinator {
  tryAcquireWriteLease: (
    filePath: string,
    sourceId?: string,
  ) => { ok: true; leaseId: string } | Extract<UpdateTrackMetadataResult, { ok: false }>
  releaseWriteLease: (leaseId: string) => void
  refreshPlaybackCapability?: (filePath: string) => void
  finishMetadataWrite?: (filePath: string) => void
}

export type PlaybackMetadataTagWrite = (
  filePath: string,
  metadata: EditableTrackMetadata,
  commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
) => Promise<UpdateTrackMetadataResult>

interface WriteLifecycle {
  isStopping: () => boolean
  hasActiveJob: () => boolean
  refreshTracksFromFileChanges: (ids: number[]) => { jobId: number }
  onUserEditCommitted?: (trackId: number, filePath: string) => string | void
}

export class MetadataTagWriteCoordinator {
  private playbackTagWrite: PlaybackMetadataTagWrite | null = null
  private onTagWriteSuccess: ((filePath: string) => void) | null = null
  private readonly trackGenerations = new Map<number, number>()
  private readonly writingTracks = new Set<number>()
  private readonly writingFiles = new Set<string>()
  private readonly pendingPublishedWrites = new Map<number, EditableTrackMetadata>()
  private reconciliation: Promise<void> | null = null
  private reconciliationRequested = false
  private readonly pendingWrites = new Set<Promise<UpdateTrackMetadataResult>>()

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    private readonly ffmpegPath: string,
    private readonly lifecycle: WriteLifecycle,
    private readonly coordinator?: MetadataWriteCoordinator,
  ) {}

  generationFor(trackId: number): number {
    return this.trackGenerations.get(trackId) ?? 0
  }

  isWriting(trackId: number): boolean {
    return this.writingTracks.has(trackId)
  }

  hasActiveWrites(): boolean {
    return this.writingTracks.size > 0
  }

  isWritingFile(filePath: string): boolean {
    return this.writingFiles.has(normalizeAudioFilePath(filePath))
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites])
  }

  /**
   * Called immediately before the audio file is rewritten so watchers can
   * suppress the incoming mtime events (e.g. skip a metadata refresh).
   */
  setTagWriteSuccessHandler(handler: (filePath: string) => void): void {
    this.onTagWriteSuccess = handler
  }

  setPlaybackTagWriteHandler(handler: PlaybackMetadataTagWrite): void {
    this.playbackTagWrite = handler
  }

  updateTrackMetadata(
    metadata: EditableTrackMetadata,
    beforeCommit?: () => Promise<void>,
    onDiskCommit?: () => void,
  ): Promise<UpdateTrackMetadataResult> {
    if (this.lifecycle.isStopping())
      return Promise.reject(new Error('Metadata refresh service is shutting down'))
    const request = this.writeTrackMetadata(metadata, beforeCommit, onDiskCommit)
    this.pendingWrites.add(request)
    void request.then(
      () => this.pendingWrites.delete(request),
      () => this.pendingWrites.delete(request),
    )
    return request
  }

  private async writeTrackMetadata(
    metadata: EditableTrackMetadata,
    beforeCommit?: () => Promise<void>,
    onDiskCommit?: () => void,
  ): Promise<UpdateTrackMetadataResult> {
    metadata = normalizeEditableMetadata(metadata)
    const filePath = this.repository.getTrackFilePath(metadata.trackId)

    if (!filePath) {
      throw new Error(`Audio file not found for track ${metadata.trackId}`)
    }

    if (this.writingTracks.has(metadata.trackId)) return { ok: false, reason: 'write-in-progress' }

    const existing = this.repository.getEditableTrackMetadata(metadata.trackId)
    if (
      metadata.lyricsText === undefined &&
      !metadata.commitFileTags &&
      !this.pendingPublishedWrites.has(metadata.trackId) &&
      existing &&
      isSameEditableMetadata(metadata, existing)
    )
      return { ok: true }

    // Old user overrides may contain independently edited year and date values.
    // Do not silently reconcile them while saving an unrelated field.
    if (
      metadata.lyricsText === undefined &&
      !metadata.commitFileTags &&
      !this.pendingPublishedWrites.has(metadata.trackId) &&
      existing?.year != null &&
      existing.releaseDate &&
      existing.year !== Number(existing.releaseDate.slice(0, 4)) &&
      metadata.releaseDate === existing.releaseDate
    )
      return { ok: false, reason: 'legacy-date-conflict' }

    let writeLeaseId: string | null = null
    let usesPlaybackWriter = false
    if (this.coordinator) {
      const leaseResult = this.coordinator.tryAcquireWriteLease(
        filePath,
        `track-${metadata.trackId}`,
      )
      if (!leaseResult.ok) {
        if (leaseResult.reason !== 'playback-in-use' || !this.playbackTagWrite) return leaseResult
        usesPlaybackWriter = true
      } else {
        writeLeaseId = leaseResult.leaseId
      }
    }

    const generation = (this.trackGenerations.get(metadata.trackId) ?? 0) + 1
    this.trackGenerations.set(metadata.trackId, generation)
    this.writingTracks.add(metadata.trackId)
    this.writingFiles.add(normalizeAudioFilePath(filePath))
    this.coordinator?.refreshPlaybackCapability?.(filePath)
    let libraryRevision: string | undefined
    let filePublished = false
    let databaseCommitted = false

    // Suppress before the file mutates: ffmpeg replace fires watch events while
    // the write is still in flight, and a 1200ms flush can start first.
    try {
      const commitAndReconcile = async (commit: () => Promise<void>) => {
        await beforeCommit?.()
        this.onTagWriteSuccess?.(filePath)
        await commit()
        filePublished = true
        onDiskCommit?.()
        const result = await readStableMetadata(
          metadata.trackId,
          filePath,
          this.artworkCacheDir,
          (actual) => verifyWrittenMetadata(metadata, actual),
        )
        await assertMetadataFingerprint(result)
        if (this.trackGenerations.get(metadata.trackId) !== generation)
          throw new Error('Tag write became stale')
        this.assertEditRevision(metadata)
        if (metadata.lyricsText !== undefined) this.repository.updateTrackLyrics(result)
        else if (metadata.commitFileTags) this.repository.commitVerifiedFileEdit(result)
        else this.repository.commitVerifiedUserEdit(metadata, result)
        this.pendingPublishedWrites.delete(metadata.trackId)
        databaseCommitted = true
        this.onTagWriteSuccess?.(filePath)
        try {
          const revision = this.lifecycle.onUserEditCommitted?.(metadata.trackId, filePath)
          if (typeof revision === 'string') libraryRevision = revision
        } catch (error) {
          logger.warn({ err: error }, 'Unable to notify committed metadata edit')
        }
      }
      if (usesPlaybackWriter) {
        const result = await this.playbackTagWrite!(filePath, metadata, commitAndReconcile)
        if (!result.ok && filePublished && !databaseCommitted) {
          this.pendingPublishedWrites.set(metadata.trackId, metadata)
        }
        if (result.ok && libraryRevision) return { ...result, libraryRevision }
        return result
      }
      if (metadata.lyricsText !== undefined || metadata.commitFileTags) {
        const prepared = await prepareAudioTagWrite(filePath, metadata, this.ffmpegPath)
        try {
          await commitAndReconcile(() => prepared.commit())
        } finally {
          await prepared.dispose()
        }
      } else await commitAndReconcile(() => writeAudioTags(filePath, metadata, this.ffmpegPath))
      return libraryRevision ? { ok: true, libraryRevision } : { ok: true }
    } catch (error) {
      if (filePublished && !databaseCommitted) {
        this.pendingPublishedWrites.set(metadata.trackId, metadata)
      }
      logger.warn(
        { err: error, trackId: metadata.trackId },
        'Tag write requires metadata reconciliation',
      )
      throw error
    } finally {
      if (writeLeaseId) {
        this.coordinator?.releaseWriteLease(writeLeaseId)
      }
      this.writingTracks.delete(metadata.trackId)
      this.writingFiles.delete(normalizeAudioFilePath(filePath))
      this.coordinator?.finishMetadataWrite?.(filePath)
      this.flushReconciliation()
    }
  }

  flushReconciliation(): void {
    if (this.lifecycle.isStopping() || this.lifecycle.hasActiveJob()) return
    if (this.pendingPublishedWrites.size === 0) return
    if (this.reconciliation) {
      this.reconciliationRequested = true
      return
    }
    this.reconciliationRequested = false
    const run = this.reconcilePublishedWrites()
    const reconciliation = run.finally(() => {
      if (this.reconciliation === reconciliation) {
        this.reconciliation = null
        // Only a new request schedules another pass. A persistent failure by
        // itself must not cause an unbounded retry loop.
        if (this.reconciliationRequested) this.flushReconciliation()
      }
    })
    this.reconciliation = reconciliation
  }

  private assertEditRevision(metadata: EditableTrackMetadata): void {
    if (
      metadata.expectedEditRevision !== undefined &&
      metadata.expectedEditRevision !== this.repository.getMetadataEditRevision(metadata.trackId)
    )
      throw new MetadataSaveError(
        'metadata-conflict',
        'Metadata changed before the database commit',
      )
  }

  async awaitReconciliation(): Promise<void> {
    while (this.reconciliation) await this.reconciliation
    await this.reconcilePublishedWrites()
  }

  private async reconcilePublishedWrites(): Promise<void> {
    for (const [trackId, metadata] of [...this.pendingPublishedWrites]) {
      if (this.pendingPublishedWrites.get(trackId) !== metadata || this.writingTracks.has(trackId))
        continue
      const generation = this.generationFor(trackId)
      try {
        const filePath = this.repository.getTrackFilePath(trackId)
        if (!filePath) {
          this.pendingPublishedWrites.delete(trackId)
          logger.warn({ trackId }, 'Published tag write has no track path')
          continue
        }
        const result = await readStableMetadata(trackId, filePath, this.artworkCacheDir, (actual) =>
          verifyWrittenMetadata(metadata, actual),
        )
        await assertMetadataFingerprint(result)
        if (
          this.writingTracks.has(trackId) ||
          this.pendingPublishedWrites.get(trackId) !== metadata ||
          this.generationFor(trackId) !== generation ||
          this.repository.getTrackFilePath(trackId) !== filePath
        )
          continue
        this.assertEditRevision(metadata)
        if (metadata.lyricsText !== undefined) this.repository.updateTrackLyrics(result)
        else if (metadata.commitFileTags) this.repository.commitVerifiedFileEdit(result)
        else this.repository.commitVerifiedUserEdit(metadata, result)
        this.pendingPublishedWrites.delete(trackId)
        this.onTagWriteSuccess?.(filePath)
        try {
          this.lifecycle.onUserEditCommitted?.(trackId, filePath)
        } catch (error) {
          logger.warn({ err: error }, 'Unable to notify committed metadata edit')
        }
      } catch (error) {
        logger.warn({ err: error, trackId }, 'Unable to reconcile published tag write')
      }
    }
  }
}
