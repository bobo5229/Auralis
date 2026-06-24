import { parseFile } from 'music-metadata'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import type { NormalizedIdentity } from '../metadata/metadataNormalizer'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'
import { checkFileStability } from './fileStabilityChecker'
import { tryRelocateMissingCandidate } from './trackRelocationMatcher'
import { logger } from '../../logging/logger'
import type { TrackRepository } from '../../repositories/trackRepository'
import type { ScannedTrack } from '@shared/types/libraryScan'

const MAX_STABILITY_RETRIES = 5

export interface ImportFailure {
  filePath: string
  reason: string
}

export interface ImportResult {
  imported: string[]
  unstable: string[]
  failed: ImportFailure[]
}

export class LibraryIncrementalImportService {
  constructor(
    private readonly trackRepository: TrackRepository,
    private readonly artworkCacheDir: string,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
  ) {}

  async importFiles(filePaths: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], unstable: [], failed: [] }

    for (const filePath of filePaths) {
      const stable = await this.waitForStability(filePath)

      if (!stable) {
        result.unstable.push(filePath)
        continue
      }

      try {
        const { track } = await this.parseAndNormalize(filePath)
        const match = tryRelocateMissingCandidate(this.trackRepository, track)

        if (match) {
          this.trackRepository.relocateTrack(match.candidate.trackId, track)
          result.imported.push(filePath)

          this.sendToRenderer('library:changed', {
            reason: 'track-relocated',
            trackIds: [match.candidate.trackId],
            filePaths: [filePath],
          })
        } else {
          this.trackRepository.upsertMany([track])
          result.imported.push(filePath)

          this.sendToRenderer('library:changed', {
            reason: 'track-added',
            trackIds: [],
            filePaths: [filePath],
          })
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unable to parse audio file'
        result.failed.push({ filePath, reason })
        logger.warn({ filePath, reason }, 'Incremental import failed for file')
      }
    }

    return result
  }

  private async waitForStability(filePath: string): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_STABILITY_RETRIES; attempt++) {
      const result = await checkFileStability(filePath)

      if (result.stable) {
        return true
      }

      if (result.fileSize === 0) {
        return false
      }
    }

    return false
  }

  private async parseAndNormalize(
    filePath: string,
  ): Promise<{ track: ScannedTrack; identity: NormalizedIdentity }> {
    const { stat } = await import('node:fs/promises')
    const fileStat = await stat(filePath)
    const metadata = await parseFile(filePath, { duration: true })
    const normalized = normalizeMetadata(metadata)
    const artworkCacheKey = await resolveArtworkForFile(filePath, metadata, this.artworkCacheDir)
    const identity = normalizeIdentityText(metadata)
    const metadataSignature = buildMetadataSignature(
      identity,
      normalized.durationSeconds,
      fileStat.size,
    )

    return {
      track: {
        filePath,
        fileSize: fileStat.size,
        fileMtimeMs: fileStat.mtimeMs,
        title: normalized.title,
        artist: normalized.artist,
        album: normalized.album,
        albumArtist: normalized.albumArtist,
        trackNo: normalized.trackNo,
        discNo: normalized.discNo,
        durationSeconds: normalized.durationSeconds,
        year: normalized.year,
        releaseDate: normalized.releaseDate,
        genre: normalized.genre,
        artworkCacheKey,
        lyricsText: normalized.lyricsText,
        lyricsFormat: normalized.lyricsFormat,
        isrc: identity.isrc,
        metadataSignature,
      },
      identity,
    }
  }
}
