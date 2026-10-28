import { stat } from 'node:fs/promises'
import type { AudioResource } from '@shared/types/audioDecode'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import { isPathUnderAnyRoot } from '@main/features/audio/audioPathGuard'
import { probeAudioDecode } from '@main/features/audio/audioDecodeProbe'
import { isPlayableAudioExtension, buildAudioTrackUrl } from '@main/features/audio/audioProtocol'

interface PlaybackResourceDependencies {
  tracks: Pick<TrackRepository, 'getFilePathById' | 'markMissingByFilePaths'>
  getRootPaths(): string[]
  files: Pick<PlaybackFileCoordinator, 'acquireReadLease' | 'releaseReadLease'>
  libraryChanged(event: LibraryChangedEvent): void
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Resolves playable library resources while retaining file access and missing-track policy. */
export class PlaybackResourceService {
  constructor(private readonly dependencies: PlaybackResourceDependencies) {}

  private markFileMissing(filePath: string): void {
    const trackIds = this.dependencies.tracks.markMissingByFilePaths([filePath])
    if (trackIds.length > 0) {
      this.dependencies.libraryChanged({
        reason: 'track-missing',
        trackIds,
        filePaths: [filePath],
      })
    }
  }

  async getAudioUrl(trackId: number): Promise<AudioResource | null> {
    const filePath = this.dependencies.tracks.getFilePathById(trackId)

    if (!filePath || !isPlayableAudioExtension(filePath)) return null
    if (!isPathUnderAnyRoot(filePath, this.dependencies.getRootPaths())) return null

    const probeLease = await this.dependencies.files.acquireReadLease(filePath, 'audio-probe')
    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        this.markFileMissing(filePath)
        return null
      }
      return { url: buildAudioTrackUrl(trackId), decodeProbe: await probeAudioDecode(filePath) }
    } catch (error) {
      if (isMissingFileError(error)) this.markFileMissing(filePath)
      return null
    } finally {
      this.dependencies.files.releaseReadLease(probeLease.leaseId)
    }
  }

  async resolveTrack(trackId: number): Promise<string> {
    if (!(await this.getAudioUrl(trackId))) throw new Error('Audio file is unavailable')
    const path = this.dependencies.tracks.getFilePathById(trackId)
    if (!path) throw new Error('Audio file is unavailable')
    return path
  }
}
