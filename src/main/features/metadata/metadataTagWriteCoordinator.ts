import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import { writeAudioTags } from './audioTagWriteService'
import { normalizeEditableMetadata } from './editableMetadataValidation'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import { logger } from '@main/logging/logger'

export interface MetadataWriteCoordinator {
  tryAcquireWriteLease: (
    filePath: string,
    sourceId?: string,
  ) => { ok: true; leaseId: string } | Extract<UpdateTrackMetadataResult, { ok: false }>
  releaseWriteLease: (leaseId: string) => void
}

export type BufferedMetadataTagWrite = (
  filePath: string,
  metadata: EditableTrackMetadata,
  commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
) => Promise<UpdateTrackMetadataResult>

interface WriteLifecycle {
  isStopping: () => boolean
  hasActiveJob: () => boolean
  refreshTracksFromFileChanges: (ids: number[]) => { jobId: number }
}

export class MetadataTagWriteCoordinator {
  private bufferedTagWrite:
    | ((
        filePath: string,
        metadata: EditableTrackMetadata,
        commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
      ) => Promise<UpdateTrackMetadataResult>)
    | null = null
  private onTagWriteSuccess: ((filePath: string) => void) | null = null
  private readonly trackGenerations = new Map<number, number>()
  private readonly writingTracks = new Set<number>()
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

  setBufferedTagWriteHandler(handler: BufferedMetadataTagWrite): void {
    this.bufferedTagWrite = handler
  }

  updateTrackMetadata(metadata: EditableTrackMetadata): Promise<UpdateTrackMetadataResult> {
    if (this.lifecycle.isStopping())
      return Promise.reject(new Error('Metadata refresh service is shutting down'))
    const request = this.writeTrackMetadata(metadata)
    this.pendingWrites.add(request)
    void request.then(
      () => this.pendingWrites.delete(request),
      () => this.pendingWrites.delete(request),
    )
    return request
  }

  private async writeTrackMetadata(
    metadata: EditableTrackMetadata,
  ): Promise<UpdateTrackMetadataResult> {
    metadata = normalizeEditableMetadata(metadata)
    const filePath = this.repository.getTrackFilePath(metadata.trackId)

    if (!filePath) {
      throw new Error(`Audio file not found for track ${metadata.trackId}`)
    }

    if (this.writingTracks.has(metadata.trackId)) return { ok: false, reason: 'write-in-progress' }

    let writeLeaseId: string | null = null
    let buffered = false
    if (this.coordinator) {
      const leaseResult = this.coordinator.tryAcquireWriteLease(
        filePath,
        `track-${metadata.trackId}`,
      )
      if (!leaseResult.ok) {
        if (leaseResult.reason !== 'playback-in-use' || !this.bufferedTagWrite) return leaseResult
        buffered = true
      } else {
        writeLeaseId = leaseResult.leaseId
      }
    }

    const generation = (this.trackGenerations.get(metadata.trackId) ?? 0) + 1
    this.trackGenerations.set(metadata.trackId, generation)
    this.writingTracks.add(metadata.trackId)

    // Suppress before the file mutates: ffmpeg replace fires watch events while
    // the write is still in flight, and a 1200ms flush can start first.
    try {
      const commitAndReconcile = async (commit: () => Promise<void>) => {
        this.onTagWriteSuccess?.(filePath)
        await commit()
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
      }
      if (buffered) {
        const result = await this.bufferedTagWrite!(filePath, metadata, commitAndReconcile)
        if (!result.ok) this.pendingReconciliation.add(metadata.trackId)
        return result
      }
      await commitAndReconcile(() => writeAudioTags(filePath, metadata, this.ffmpegPath))
      return { ok: true }
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
