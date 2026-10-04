import { parseAudioMetadata as parseFile } from '../metadata/parseAudioMetadata'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import type { NormalizedIdentity } from '../metadata/metadataNormalizer'
import { resolveLyricsForFile } from '../metadata/resolveLyricsForFile'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'
import { checkFileStability } from './fileStabilityChecker'
import { findUniqueRelocations } from './trackRelocationMatcher'
import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { logger } from '../../logging/logger'
import type { TrackRepository, MissingTrackCandidate } from '../../repositories/trackRepository'
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
    const parsedTracks: ScannedTrack[] = []
    const recordFailure = (filePath: string, error: unknown) => {
      const reason = error instanceof Error ? error.message : 'Unable to import audio file'
      result.failed.push({ filePath, reason })
      logger.warn({ filePath, reason }, 'Incremental import failed for file')
    }

    for (let offset = 0; offset < uniquePaths.length; offset += IMPORT_BATCH_SIZE) {
      const batch = uniquePaths.slice(offset, offset + IMPORT_BATCH_SIZE)
      // Overlap the stability delays; keep parsing serial to bound artwork memory.
      const stable = await Promise.all(batch.map((filePath) => this.waitForStability(filePath)))
      for (const [index, filePath] of batch.entries()) {
        if (!stable[index]) {
          result.unstable.push(filePath)
          continue
        }

        try {
          const { track } = await this.parseAndNormalize(filePath)
          parsedTracks.push(track)
        } catch (error) {
          recordFailure(filePath, error)
        }
      }
    }

    const candidates = new Map<number, MissingTrackCandidate>()
    for (const track of parsedTracks) {
      for (const candidate of this.trackRepository.findRelocationCandidatesByIdentity(
        track,
        true,
      )) {
        candidates.set(candidate.trackId, candidate)
      }
    }
    // Also handles add-before-unlink watcher events: an available DB row can have
    // an absent old file. A present or unreadable old file must never be relocated.
    const absentCandidates: MissingTrackCandidate[] = []
    const pathAliasIds = new Set<number>()
    const incomingPaths = new Set(
      parsedTracks.map((track) => win32.normalize(track.filePath).toLowerCase()),
    )
    for (const candidate of candidates.values()) {
      // Windows keeps the old spelling readable after a case-only rename.
      if (incomingPaths.has(win32.normalize(candidate.filePath).toLowerCase())) {
        absentCandidates.push(candidate)
        pathAliasIds.add(candidate.trackId)
        continue
      }
      try {
        await stat(candidate.filePath)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT' || code === 'ENOTDIR') absentCandidates.push(candidate)
      }
    }
    const matches = findUniqueRelocations(
      absentCandidates,
      parsedTracks,
      (candidate, track) =>
        !pathAliasIds.has(candidate.trackId) ||
        win32.normalize(candidate.filePath).toLowerCase() ===
          win32.normalize(track.filePath).toLowerCase(),
    )

    for (let offset = 0; offset < parsedTracks.length; offset += IMPORT_BATCH_SIZE) {
      const additions: ScannedTrack[] = []
      const relocatedIds: number[] = []
      const relocatedPaths: string[] = []
      for (const track of parsedTracks.slice(offset, offset + IMPORT_BATCH_SIZE)) {
        try {
          const match = matches.get(track.filePath)
          if (match && this.trackRepository.relocateTrack(match.trackId, track, match.filePath)) {
            result.imported.push(track.filePath)
            relocatedIds.push(match.trackId)
            relocatedPaths.push(track.filePath)
          } else additions.push(track)
        } catch (error) {
          recordFailure(track.filePath, error)
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
