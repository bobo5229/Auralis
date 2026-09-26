import { parseFile } from 'music-metadata'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import type { NormalizedIdentity } from '../metadata/metadataNormalizer'
import { resolveLyricsForFile } from '../metadata/resolveLyricsForFile'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'
import { checkFileStability } from './fileStabilityChecker'
import { tryRelocateMissingCandidate } from './trackRelocationMatcher'
import { logger } from '../../logging/logger'
import type { TrackRepository } from '../../repositories/trackRepository'
import type { ScannedTrack } from '@shared/types/libraryScan'
import type { RendererEventSender } from '@main/ipc/rendererEvents'

const MAX_STABILITY_RETRIES = 5
const IMPORT_BATCH_SIZE = 32

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
  private activeImports = 0

  constructor(
    private readonly trackRepository: TrackRepository,
    private readonly artworkCacheDir: string,
    private readonly sendToRenderer: RendererEventSender,
  ) {}

  /** True while an import pass is in flight (used to gate cache GC). */
  isImportActive(): boolean {
    return this.activeImports > 0
  }

  async importFiles(filePaths: string[]): Promise<ImportResult> {
    this.activeImports += 1

    try {
      return await this.doImport(filePaths)
    } finally {
      this.activeImports -= 1
    }
  }

  private async doImport(filePaths: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], unstable: [], failed: [] }

    const uniquePaths = [...new Set(filePaths)]
    const recordFailure = (filePath: string, error: unknown) => {
      const reason = error instanceof Error ? error.message : 'Unable to import audio file'
      result.failed.push({ filePath, reason })
      logger.warn({ filePath, reason }, 'Incremental import failed for file')
    }

    for (let offset = 0; offset < uniquePaths.length; offset += IMPORT_BATCH_SIZE) {
      const batch = uniquePaths.slice(offset, offset + IMPORT_BATCH_SIZE)
      // Overlap the stability delays; keep parsing serial to bound artwork memory.
      const stable = await Promise.all(batch.map((filePath) => this.waitForStability(filePath)))
      const additions: ScannedTrack[] = []
      const relocatedIds: number[] = []
      const relocatedPaths: string[] = []
      for (const [index, filePath] of batch.entries()) {
        if (!stable[index]) {
          result.unstable.push(filePath)
          continue
        }

        try {
          const { track } = await this.parseAndNormalize(filePath)
          const match = tryRelocateMissingCandidate(this.trackRepository, track)
          if (match && this.trackRepository.relocateTrack(match.candidate.trackId, track)) {
            result.imported.push(filePath)
            relocatedIds.push(match.candidate.trackId)
            relocatedPaths.push(filePath)
          } else {
            // Includes a failed relocation due to an occupied path / UNIQUE race.
            additions.push(track)
          }
        } catch (error) {
          recordFailure(filePath, error)
        }
      }

      if (relocatedIds.length) {
        this.sendToRenderer('library:changed', {
          reason: 'track-relocated',
          trackIds: relocatedIds,
          filePaths: relocatedPaths,
        })
      }
      if (additions.length) {
        try {
          this.trackRepository.upsertMany(additions)
        } catch (error) {
          for (const track of additions) recordFailure(track.filePath, error)
          continue
        }
        const addedPaths = additions.map((track) => track.filePath)
        result.imported.push(...addedPaths)
        this.sendToRenderer('library:changed', {
          reason: 'track-added',
          trackIds: [],
          filePaths: addedPaths,
        })
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
    const normalized = normalizeMetadata(metadata, filePath)
    const lyrics = await resolveLyricsForFile(filePath, metadata)
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
        copyright: normalized.copyright,
        composer: normalized.composer,
        genre: normalized.genre,
        artworkCacheKey,
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        isrc: identity.isrc,
        metadataSignature,
      },
      identity,
    }
  }
}
