import { stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
import type { AudioDecodeProbe, AudioResource } from '@shared/types/audioDecode'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import { isPathUnderAnyRoot } from '@main/features/audio/audioPathGuard'
import { probeAudioDecode } from '@main/features/audio/audioDecodeProbe'
import { isPlayableAudioExtension, buildAudioTrackUrl } from '@main/features/audio/audioProtocol'
import {
  DatabaseWriteAdmissionError,
  type DatabaseWriteAdmission,
} from '@main/database/databaseWriteAdmission'

interface PlaybackResourceDependencies {
  tracks: Pick<TrackRepository, 'getFilePathById' | 'markMissingByFilePaths'>
  getRootPaths(): string[]
  files: Pick<PlaybackFileCoordinator, 'acquireReadLease' | 'releaseReadLease'>
  libraryChanged(event: LibraryChangedEvent): void
  writeAdmission?: Pick<DatabaseWriteAdmission, 'runWrite'>
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Resolves playable library resources while retaining file access and missing-track policy. */
export class PlaybackResourceService {
  constructor(private readonly dependencies: PlaybackResourceDependencies) {}

  private async markFileMissing(trackId: number, filePath: string): Promise<void> {
    const mark = () => {
      if (this.dependencies.tracks.getFilePathById(trackId) !== filePath) return
      if (!isPathUnderAnyRoot(filePath, this.dependencies.getRootPaths())) return
      try {
        if (statSync(filePath).isFile()) return
      } catch (error) {
        if (!isMissingFileError(error)) throw error
      }
      const trackIds = this.dependencies.tracks.markMissingByFilePaths([filePath])
      if (trackIds.length > 0) {
        this.dependencies.libraryChanged({
          reason: 'track-missing',
          trackIds,
          filePaths: [filePath],
        })
      }
    }
    if (this.dependencies.writeAdmission) await this.dependencies.writeAdmission.runWrite(mark)
    else mark()
  }

  private async resolveResource(
    trackId: number,
    includeDecodeProbe: boolean,
  ): Promise<{ filePath: string; decodeProbe: AudioDecodeProbe | null } | null> {
    const filePath = this.dependencies.tracks.getFilePathById(trackId)

    if (!filePath || !isPlayableAudioExtension(filePath)) return null
    if (!isPathUnderAnyRoot(filePath, this.dependencies.getRootPaths())) return null

    const probeLease = await this.dependencies.files.acquireReadLease(filePath, 'audio-probe')
    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        await this.markFileMissing(trackId, filePath)
        return null
      }
      const decodeProbe = includeDecodeProbe ? await probeAudioDecode(filePath) : null
      if (
        this.dependencies.tracks.getFilePathById(trackId) !== filePath ||
        !isPathUnderAnyRoot(filePath, this.dependencies.getRootPaths())
      ) {
        return null
      }
      return { filePath, decodeProbe }
    } catch (error) {
      if (error instanceof DatabaseWriteAdmissionError) throw error
      if (isMissingFileError(error)) await this.markFileMissing(trackId, filePath)
      return null
    } finally {
      this.dependencies.files.releaseReadLease(probeLease.leaseId)
    }
  }

  async getAudioUrl(trackId: number): Promise<AudioResource | null> {
    const result = await this.resolveResource(trackId, true)
    return result ? { url: buildAudioTrackUrl(trackId), decodeProbe: result.decodeProbe } : null
  }

  async resolveTrack(trackId: number): Promise<string> {
    const result = await this.resolveResource(trackId, false)
    if (!result) throw new Error('Audio file is unavailable')
    return result.filePath
  }
}
