import { parseAudioMetadata as parseFile } from '../metadata/parseAudioMetadata'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import { resolveLyricsForFile } from '../metadata/resolveLyricsForFile'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'
import { checkFileStability } from './fileStabilityChecker'
import { findUniqueRelocations } from './trackRelocationMatcher'
import { stat } from 'node:fs/promises'
import { statSync, type Stats } from 'node:fs'
import { win32 } from 'node:path'
import { logger } from '../../logging/logger'
import type { TrackRepository, MissingTrackCandidate } from '../../repositories/trackRepository'
import type { ScannedTrack } from '@shared/types/libraryScan'
import type { RendererEventSender } from '@main/ipc/rendererEvents'

const MAX_STABILITY_RETRIES = 5
const IMPORT_BATCH_SIZE = 32

function hasSameFingerprint(before: Stats, after: Stats): boolean {
  return (
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs &&
    before.dev === after.dev &&
    before.ino === after.ino
  )
}

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
    const fingerprints = new Map<string, Stats>()
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
          const parsed = await this.parseAndNormalize(filePath)
          if (!parsed) {
            result.unstable.push(filePath)
            continue
          }
          parsedTracks.push(parsed.track)
          fingerprints.set(filePath, parsed.fingerprint)
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
        // Parsing other batches and checking old paths may have taken a long time.
        // Keep the last check and the synchronous DB mutation in the same turn.
        if (!this.isCurrentFile(track.filePath, fingerprints.get(track.filePath)!)) {
          result.unstable.push(track.filePath)
          continue
        }
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
        // Relocations and their event callbacks run before this batch upsert.
        const currentAdditions = additions.filter((track) => {
          if (this.isCurrentFile(track.filePath, fingerprints.get(track.filePath)!)) return true
          result.unstable.push(track.filePath)
          return false
        })
        if (!currentAdditions.length) continue
        try {
          this.trackRepository.upsertMany(currentAdditions)
        } catch (error) {
          for (const track of currentAdditions) recordFailure(track.filePath, error)
          continue
        }
        const addedPaths = currentAdditions.map((track) => track.filePath)
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

  private isCurrentFile(filePath: string, fingerprint: Stats): boolean {
    try {
      return hasSameFingerprint(fingerprint, statSync(filePath))
    } catch {
      return false
    }
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
  ): Promise<{ track: ScannedTrack; fingerprint: Stats } | null> {
    let fileStat: Stats
    try {
      fileStat = await stat(filePath)
    } catch {
      return null
    }
    try {
      const metadata = await parseFile(filePath, { duration: true })
      const normalized = normalizeMetadata(metadata, filePath)
      const lyrics = await resolveLyricsForFile(filePath, metadata)
      const artworkCacheKey = await resolveArtworkForFile(filePath, metadata, this.artworkCacheDir)
      try {
        if (!hasSameFingerprint(fileStat, await stat(filePath))) return null
      } catch {
        return null
      }
      const identity = normalizeIdentityText(metadata)
      const metadataSignature = buildMetadataSignature(
        identity,
        normalized.durationSeconds,
        fileStat.size,
      )

      return {
        track: {
          filePath,
          metadataParserVersion: getMetadataParserVersion(filePath),
          fileSize: fileStat.size,
          fileMtimeMs: fileStat.mtimeMs,
          title: normalized.title,
          artist: normalized.artist,
          album: normalized.album,
          albumArtist: normalized.albumArtist,
          trackNo: normalized.trackNo,
          discNo: normalized.discNo,
          durationSeconds: normalized.durationSeconds,
          bitrateBps: normalized.bitrateBps,
          codec: normalized.codec,
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
        fingerprint: fileStat,
      }
    } catch (error) {
      // A replacement/removal can also make the parser or asset reads throw.
      // Retry changed files; retain permanent failures for unchanged files.
      if (!this.isCurrentFile(filePath, fileStat)) return null
      throw error
    }
  }
}
