import { stat } from 'node:fs/promises'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import type { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import type { LrcEditorDependencies } from '@main/features/lyrics/lrcEditorService'
import { LyricsEditorError } from '@main/features/lyrics/lyricsEditorError'
import { parseAudioMetadata } from '@main/features/metadata/parseAudioMetadata'
import { hasEmbeddedTtml } from '@main/features/metadata/metadataNormalizer'
import {
  getLyricsSidecarFingerprint,
  resolveLyricsForFile,
} from '@main/features/metadata/resolveLyricsForFile'
import { logger } from '@main/logging/logger'

interface LrcEditorMetadataDependencies {
  tracks: Pick<TrackRepository, 'getFilePathById' | 'patchLyrics'>
  metadata: Pick<MetadataRefreshService, 'updateTrackLyrics' | 'refreshTracksFromFileChanges'>
  files: Pick<PlaybackFileCoordinator, 'acquireReadLease' | 'releaseReadLease'>
  libraryChanged(event: LibraryChangedEvent): void
}

/** Connects LRC editing to guarded metadata reads, tag saves and library reconciliation. */
export class LrcEditorMetadataService {
  constructor(private readonly dependencies: LrcEditorMetadataDependencies) {}

  async readSource(filePath: string): ReturnType<LrcEditorDependencies['readSource']> {
    const lease = await this.dependencies.files.acquireReadLease(filePath, 'lrc-editor')
    try {
      const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false })
      const lyrics = await resolveLyricsForFile(filePath, metadata, true)
      const protectedTag = hasEmbeddedTtml(metadata)
      if (!lyrics && !protectedTag) return null
      return {
        lyricsText: lyrics?.text ?? '',
        lyricsFormat: lyrics?.format ?? 'plain',
        ...(protectedTag ? { hasEmbeddedTtml: true } : {}),
      }
    } finally {
      this.dependencies.files.releaseReadLease(lease.leaseId)
    }
  }

  async writeTag(
    trackId: number,
    text: string,
    beforeCommit: () => Promise<void>,
  ): ReturnType<LrcEditorDependencies['writeTag']> {
    let committed = false
    let result: Awaited<ReturnType<MetadataRefreshService['updateTrackLyrics']>>
    try {
      result = await this.dependencies.metadata.updateTrackLyrics(
        trackId,
        text,
        beforeCommit,
        () => {
          committed = true
        },
      )
    } catch (error) {
      if (committed) return { warning: true }
      throw error
    }
    if (!result.ok && committed) return { warning: true }
    if (!result.ok)
      throw new LyricsEditorError(
        result.reason === 'file-changed' || result.reason === 'file-not-found'
          ? 'file-changed'
          : result.reason === 'write-in-progress'
            ? 'busy'
            : 'save-failed',
      )
    return { warning: false }
  }

  async reconcile(
    trackId: number,
    filePath: string,
    text: string,
  ): ReturnType<LrcEditorDependencies['reconcile']> {
    let cacheUpdated = false
    let active = false
    const lease = await this.dependencies.files.acquireReadLease(filePath, 'lrc-editor-reconcile')
    try {
      if (this.dependencies.tracks.getFilePathById(trackId) !== filePath)
        return { cacheUpdated, active }
      const before = await stat(filePath)
      const fingerprint = await getLyricsSidecarFingerprint(filePath)
      const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false })
      const lyrics = await resolveLyricsForFile(filePath, metadata)
      const after = await stat(filePath)
      if (
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        fingerprint !== (await getLyricsSidecarFingerprint(filePath))
      )
        return { cacheUpdated, active }
      this.dependencies.tracks.patchLyrics([
        {
          filePath,
          lyricsText: lyrics?.text ?? null,
          lyricsFormat: lyrics?.format ?? null,
          lyricsCheckedMtimeMs: after.mtimeMs,
          lyricsSidecarFingerprint: fingerprint,
        },
      ])
      cacheUpdated = true
      active = (lyrics?.text.trim() ?? '') === text.trim()
      return { cacheUpdated, active }
    } finally {
      this.dependencies.files.releaseReadLease(lease.leaseId)
      this.dependencies.libraryChanged({
        reason: 'file-change',
        trackIds: [trackId],
        filePaths: [filePath],
      })
      if (!cacheUpdated) {
        try {
          this.dependencies.metadata.refreshTracksFromFileChanges([trackId])
        } catch (error) {
          logger.warn({ error, trackId }, 'LRC save requires cache reconciliation')
        }
      }
    }
  }
}
