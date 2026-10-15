import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { AudioTagEdit as EditableTrackMetadata } from './audioTagEdit'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import { writeAudioTags, prepareAudioTagWrite } from './audioTagWriteService'
import { normalizeEditableMetadata } from './editableMetadataValidation'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import { logger } from '@main/logging/logger'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'
import { normalizeAudioFilePath } from '../audio/playbackFileCoordinator'

export interface MetadataWriteCoordinator {
  tryAcquireWriteLease: (
    filePath: string,
    sourceId?: string,
  ) => { ok: true; leaseId: string } | Extract<UpdateTrackMetadataResult, { ok: false }>
  releaseWriteLease: (leaseId: string) => void
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
  private readonly pendingReconciliation = new Set<number>()
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
    if (metadata.lyricsText === undefined && existing && isSameEditableMetadata(metadata, existing))
      return { ok: true }

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
    let libraryRevision: string | undefined

    // Suppress before the file mutates: ffmpeg replace fires watch events while
    // the write is still in flight, and a 1200ms flush can start first.
    try {
      const commitAndReconcile = async (commit: () => Promise<void>) => {
        await beforeCommit?.()
        this.onTagWriteSuccess?.(filePath)
        await commit()
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
        if (metadata.lyricsText !== undefined) this.repository.updateTrackLyrics(result)
        else this.repository.commitVerifiedUserEdit(metadata, result)
        this.pendingReconciliation.delete(metadata.trackId)
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
        if (!result.ok) this.pendingReconciliation.add(metadata.trackId)
        if (result.ok && libraryRevision) return { ...result, libraryRevision }
        return result
      }
      if (metadata.lyricsText !== undefined) {
        const prepared = await prepareAudioTagWrite(filePath, metadata, this.ffmpegPath)
        try {
          await commitAndReconcile(() => prepared.commit())
        } finally {
          await prepared.dispose()
        }
      } else await commitAndReconcile(() => writeAudioTags(filePath, metadata, this.ffmpegPath))
      return libraryRevision ? { ok: true, libraryRevision } : { ok: true }
    } catch (error) {
      this.pendingReconciliation.add(metadata.trackId)
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
      this.flushReconciliation()
    }
  }

  flushReconciliation(): void {
    if (this.lifecycle.isStopping() || this.lifecycle.hasActiveJob()) return
    const ids = [...this.pendingReconciliation].filter((id) => !this.writingTracks.has(id))
    if (!ids.length) return
    for (const id of ids) this.pendingReconciliation.delete(id)
    try {
      this.lifecycle.refreshTracksFromFileChanges(ids)
    } catch (error) {
      logger.warn(
        { err: error, trackIds: ids },
        'Unable to start metadata reconciliation; explicit retry required',
      )
    }
  }
}
