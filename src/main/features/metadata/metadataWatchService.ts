import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { parseFile } from 'music-metadata'
import {
  isSupportedAudioFile,
  supportedAudioExtensions,
} from '@main/features/libraryScan/audioFileFilter'
import {
  normalizeIdentityText,
  normalizeMetadata,
  buildMetadataSignature,
} from '@main/features/metadata/metadataNormalizer'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import type { MissingTrackCandidate } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import { resolveLyricsForFile } from './resolveLyricsForFile'
import {
  findUniqueRelocationCandidate,
  type FileIdentity,
} from '@main/features/libraryScan/trackRelocationMatcher'

const WATCH_DEBOUNCE_MS = 1200
const RETRY_AFTER_ACTIVE_JOB_MS = 5000
const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_UNSTABLE_RETRIES = 40 // ~2 min total (40 * 3s)
const MISSING_CONFIRM_DELAY_MS = 5000
const RELOCATION_WINDOW_MS = 60000
const MAX_STAT_RETRIES = 10
/** Suppress watch-triggered metadata refresh after a successful user tag write. */
const TAG_WRITE_REFRESH_SUPPRESS_MS = 8000

/**
 * Error codes that indicate a file is temporarily inaccessible rather than deleted.
 * These should trigger a retry instead of marking the track as missing.
 */
const TRANSIENT_STAT_ERROR_CODES = new Set([
  'EACCES',
  'EPERM',
  'EBUSY',
  'ETIMEDOUT',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAGAIN',
])

function isTransientStatError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as NodeJS.ErrnoException).code
  return typeof code === 'string' && TRANSIENT_STAT_ERROR_CODES.has(code)
}

export class MetadataWatchService {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly pendingFilePaths = new Map<string, number>()
  private readonly unstableRetries = new Map<string, number>()
  private readonly inFlightFilePaths = new Set<string>()
  private readonly deferredFilePaths = new Set<string>()
  private readonly pendingMissingFilePaths = new Map<string, number>()
  private readonly recentMissingCandidates = new Map<number, MissingTrackCandidate>()
  private readonly statRetries = new Map<string, number>()
  /** filePath → suppress refresh until epoch ms */
  private readonly suppressRefreshUntil = new Map<string, number>()
  /** Watch work that may eventually write to the library database. */
  private readonly activeOperations = new Set<Promise<void>>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private missingConfirmationTimer: ReturnType<typeof setTimeout> | null = null
  private flushPaused = false

  constructor(
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly trackRepository: TrackRepository,
    private readonly metadataRefreshService: MetadataRefreshService,
    private readonly incrementalImportService: LibraryIncrementalImportService,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
  ) {}

  start(): void {
    this.syncRoots()
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }

    this.watchers.clear()
    this.statRetries.clear()
    this.suppressRefreshUntil.clear()
    this.flushPaused = false

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer)
      this.missingConfirmationTimer = null
    }
  }

  /**
   * Pause pending-file flush while a full library scan runs so watch imports
   * cannot race markMissingUnderRootExcept on scan complete.
   */
  async pauseFlush(): Promise<void> {
    this.flushPaused = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer)
      this.missingConfirmationTimer = null
    }

    // A flush may already be past its initial pause check and waiting on file
    // I/O. Full scans must not start until all such work (including imports
    // spawned by that flush) has completed.
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations])
    }
  }

  resumeFlush(): void {
    this.flushPaused = false
    if (this.pendingFilePaths.size > 0) {
      this.scheduleFlush()
    }
    if (this.pendingMissingFilePaths.size > 0) {
      this.scheduleMissingConfirmation()
    }
  }

  /**
   * After a successful tag write, ignore watch-driven metadata refresh for this
   * path briefly so the write mtime change cannot clobber user_edit via refresh.
   */
  suppressRefreshForPath(filePath: string, durationMs = TAG_WRITE_REFRESH_SUPPRESS_MS): void {
    const normalizedPath = normalize(filePath)
    this.suppressRefreshUntil.set(normalizedPath, Date.now() + durationMs)
    // Drop any already-queued refresh for this path.
    this.pendingFilePaths.delete(normalizedPath)
    this.deferredFilePaths.delete(normalizedPath)
  }

  private isRefreshSuppressed(filePath: string): boolean {
    const until = this.suppressRefreshUntil.get(normalize(filePath))
    if (until === undefined) {
      return false
    }
    if (Date.now() >= until) {
      this.suppressRefreshUntil.delete(normalize(filePath))
      return false
    }
    return true
  }

  syncRoots(): void {
    const roots = this.libraryRootRepository.list()
    const nextRootPaths = new Set(roots.map((root) => normalize(root.path)))

    for (const rootPath of this.watchers.keys()) {
      if (!nextRootPaths.has(rootPath)) {
        this.watchers.get(rootPath)?.close()
        this.watchers.delete(rootPath)
      }
    }

    for (const rootPath of nextRootPaths) {
      if (this.watchers.has(rootPath)) {
        continue
      }

      this.watchRoot(rootPath)
    }
  }

  private watchRoot(rootPath: string): void {
    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) {
          return
        }

        const filePath = normalize(join(rootPath, filename.toString()))

        if (extname(filePath).toLowerCase() === '.lrc') {
          const basePath = filePath.slice(0, -extname(filePath).length)
          const audioCandidates = supportedAudioExtensions.flatMap((extension) => [
            `${basePath}${extension}`,
            `${basePath}${extension.toUpperCase()}`,
          ])
          const knownAudioPaths = this.trackRepository.getExistingFilePaths(audioCandidates)

          for (const audioPath of knownAudioPaths) {
            this.pendingFilePaths.set(audioPath, Date.now())
          }

          if (knownAudioPaths.size > 0) {
            this.scheduleFlush()
          }
          return
        }

        if (!isSupportedAudioFile(filePath)) {
          return
        }

        this.pendingFilePaths.set(filePath, Date.now())
        this.scheduleFlush()
      })

      watcher.on('error', (error) => {
        logger.warn({ error, rootPath }, 'Metadata watcher failed')
        watcher.close()
        this.watchers.delete(rootPath)
      })

      this.watchers.set(rootPath, watcher)
      logger.info({ rootPath }, 'Metadata watcher started')
    } catch (error) {
      logger.warn({ error, rootPath }, 'Unable to start metadata watcher')
    }
  }

  private scheduleFlush(delay = WATCH_DEBOUNCE_MS): void {
    if (this.flushPaused) {
      return
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.runOperation(() => this.flushPending())
    }, delay)
  }

  private runOperation(operation: () => Promise<void>): void {
    const promise = operation().catch((error) => {
      logger.warn({ error }, 'Metadata watch operation failed')
    })
    this.activeOperations.add(promise)
    void promise.finally(() => this.activeOperations.delete(promise))
  }

  private async flushPending(): Promise<void> {
    if (this.flushPaused) {
      return
    }

    const filePaths = [...this.pendingFilePaths.keys()]
    this.pendingFilePaths.clear()

    if (filePaths.length === 0) {
      return
    }

    // Separate in-flight paths into deferred set
    const incoming: string[] = []

    for (const filePath of filePaths) {
      if (this.inFlightFilePaths.has(filePath)) {
        this.deferredFilePaths.add(filePath)
      } else {
        incoming.push(filePath)
      }
    }

    if (incoming.length === 0) {
      return
    }

    // Stat all files to determine existence
    const statResults = await Promise.allSettled(incoming.map((p) => stat(p)))
    const existingPaths: string[] = []
    const missingPaths: string[] = []
    const transientErrorPaths: string[] = []

    for (let i = 0; i < incoming.length; i++) {
      const result = statResults[i]

      if (result.status === 'fulfilled') {
        existingPaths.push(incoming[i])
        this.statRetries.delete(incoming[i])
      } else if (isTransientStatError(result.reason)) {
        transientErrorPaths.push(incoming[i])
      } else {
        missingPaths.push(incoming[i])
      }
    }

    // Requeue transient errors for retry (with limit)
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.statRetries.get(filePath) ?? 0) + 1
        if (retries >= MAX_STAT_RETRIES) {
          this.statRetries.delete(filePath)
          logger.warn({ filePath, retries }, 'Dropping file after max stat retries')
        } else {
          this.statRetries.set(filePath, retries)
          this.pendingFilePaths.set(filePath, Date.now())
        }
      }
      this.scheduleFlush(UNSTABLE_RETRY_DELAY_MS)
    }

    // Route existing tracks
    if (existingPaths.length > 0) {
      const knownPaths = this.trackRepository.getExistingFilePaths(existingPaths)
      const knownFilePaths = existingPaths.filter((p) => knownPaths.has(p))
      const newFilePaths = existingPaths.filter((p) => !knownPaths.has(p))

      // Known tracks: metadata refresh (skip paths suppressed after tag write)
      const refreshablePaths = knownFilePaths.filter((p) => !this.isRefreshSuppressed(p))
      if (refreshablePaths.length > 0) {
        const trackIds = this.trackRepository.getTrackIdsByFilePaths(refreshablePaths)

        if (trackIds.length > 0) {
          try {
            this.metadataRefreshService.refreshTracksFromFileChanges(trackIds)
          } catch (error) {
            this.requeuePaths(refreshablePaths)
            logger.info(
              { error, count: trackIds.length },
              'Deferring metadata refresh for file changes',
            )
            this.scheduleFlush(RETRY_AFTER_ACTIVE_JOB_MS)
          }
        }
      }

      // New tracks: import with relocation matching
      if (newFilePaths.length > 0) {
        await this.importWithRelocationMatch(newFilePaths)
      }
    }

    // Route missing tracks to confirmation queue
    if (missingPaths.length > 0) {
      for (const filePath of missingPaths) {
        this.enqueueMissingFile(filePath)
      }
    }
  }

  private enqueueMissingFile(filePath: string): void {
    this.pendingMissingFilePaths.set(filePath, Date.now())
    this.scheduleMissingConfirmation()
  }

  private scheduleMissingConfirmation(): void {
    if (this.flushPaused) {
      return
    }

    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer)
    }
    this.missingConfirmationTimer = setTimeout(() => {
      this.missingConfirmationTimer = null
      this.runOperation(() => this.confirmMissing())
    }, MISSING_CONFIRM_DELAY_MS)
  }

  private async confirmMissing(): Promise<void> {
    const entries = [...this.pendingMissingFilePaths.entries()]
    this.pendingMissingFilePaths.clear()

    if (entries.length === 0) {
      return
    }

    // Stat again to confirm files are still missing
    const filePaths = entries.map(([p]) => p)
    const statResults = await Promise.allSettled(filePaths.map((p) => stat(p)))
    const confirmedMissing: string[] = []
    const restoredPaths: string[] = []
    const transientErrorPaths: string[] = []

    for (let i = 0; i < filePaths.length; i++) {
      const result = statResults[i]
      if (result.status === 'fulfilled') {
        restoredPaths.push(filePaths[i])
        this.statRetries.delete(filePaths[i])
      } else if (isTransientStatError(result.reason)) {
        transientErrorPaths.push(filePaths[i])
      } else {
        confirmedMissing.push(filePaths[i])
      }
    }

    // Requeue transient errors for retry
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.statRetries.get(filePath) ?? 0) + 1
        if (retries >= MAX_STAT_RETRIES) {
          this.statRetries.delete(filePath)
          logger.warn({ filePath, retries }, 'Dropping file after max stat retries (confirm phase)')
        } else {
          this.statRetries.set(filePath, retries)
          this.enqueueMissingFile(filePath)
        }
      }
    }

    // Handle restored files
    if (restoredPaths.length > 0) {
      const restoredIds = this.trackRepository.markAvailableByFilePaths(restoredPaths)

      if (restoredIds.length > 0) {
        this.sendChanged('track-restored', restoredIds, restoredPaths)

        for (const trackId of restoredIds) {
          this.recentMissingCandidates.delete(trackId)
        }
      }
    }

    // Handle confirmed missing files
    if (confirmedMissing.length > 0) {
      const missingIds = this.trackRepository.markMissingByFilePaths(confirmedMissing)

      if (missingIds.length > 0) {
        // Store recent candidates for relocation matching
        const candidates = this.trackRepository.getMissingCandidates()

        for (const candidate of candidates) {
          if (missingIds.includes(candidate.trackId)) {
            this.recentMissingCandidates.set(candidate.trackId, candidate)
            this.scheduleRelocationExpiry(candidate.trackId)
          }
        }

        this.sendChanged('track-missing', missingIds, confirmedMissing)
      }
    }
  }

  private scheduleRelocationExpiry(trackId: number): void {
    setTimeout(() => {
      this.recentMissingCandidates.delete(trackId)
    }, RELOCATION_WINDOW_MS)
  }

  private async importWithRelocationMatch(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      this.inFlightFilePaths.add(filePath)
    }

    const relocatedTrackIds: number[] = []
    const relocatedFilePaths: string[] = []
    const unmatchedPaths: string[] = []

    for (const filePath of filePaths) {
      try {
        const matched = await this.matchRecentCandidate(filePath)

        if (matched) {
          this.recentMissingCandidates.delete(matched.trackId)
          relocatedTrackIds.push(matched.trackId)
          relocatedFilePaths.push(filePath)
          this.releaseInFlight(filePath)
        } else {
          unmatchedPaths.push(filePath)
        }
      } catch {
        unmatchedPaths.push(filePath)
      }
    }

    // Send relocated event
    if (relocatedTrackIds.length > 0) {
      this.sendChanged('track-relocated', relocatedTrackIds, relocatedFilePaths)
    }

    // Import unmatched files via normal import (includes DB matching)
    if (unmatchedPaths.length > 0) {
      await this.importWithRetry(unmatchedPaths)
    } else {
      // All relocated, release in-flight for relocated paths
      for (const filePath of relocatedFilePaths) {
        this.releaseInFlight(filePath)
      }
    }
  }

  private async matchRecentCandidate(filePath: string): Promise<MissingTrackCandidate | null> {
    if (this.recentMissingCandidates.size === 0) return null

    try {
      const metadata = await parseFile(filePath, { duration: true })
      const identity = normalizeIdentityText(metadata)
      const fileStat = await stat(filePath)
      const normalized = normalizeMetadata(metadata, filePath)
      const lyrics = await resolveLyricsForFile(filePath, metadata)
      const signature = buildMetadataSignature(identity, normalized.durationSeconds, fileStat.size)

      const scannedTrack = {
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
        genre: normalized.genre,
        artworkCacheKey: null,
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        isrc: identity.isrc,
        metadataSignature: signature,
      }

      const fileIdentity: FileIdentity = {
        title: normalized.title,
        artist: normalized.artist,
        album: normalized.album,
        isrc: identity.isrc,
        durationSeconds: normalized.durationSeconds,
        fileSize: fileStat.size,
      }

      const candidates = [...this.recentMissingCandidates.values()]
      const match = findUniqueRelocationCandidate(candidates, fileIdentity)
      if (match) {
        const relocated = this.trackRepository.relocateTrack(match.trackId, scannedTrack)
        if (!relocated) {
          logger.warn(
            { filePath, trackId: match.trackId },
            'Relocation skipped due to path occupancy or UNIQUE conflict',
          )
          return null
        }
        return match
      }
    } catch (error) {
      logger.debug({ error, filePath }, 'Failed to match recent candidate')
    }

    return null
  }

  private async importWithRetry(filePaths: string[]): Promise<void> {
    try {
      const result = await this.incrementalImportService.importFiles(filePaths)

      // Release in-flight and drain deferred for imported files
      for (const filePath of result.imported) {
        this.unstableRetries.delete(filePath)
        this.releaseInFlight(filePath)
      }

      // Release in-flight and drain deferred for permanently failed files
      for (const failure of result.failed) {
        this.unstableRetries.delete(failure.filePath)
        this.releaseInFlight(failure.filePath)
      }

      // Handle unstable files: release in-flight first, then requeue for retry
      if (result.unstable.length > 0) {
        for (const filePath of result.unstable) {
          // Release in-flight before requeue so the next flush won't defer it
          this.inFlightFilePaths.delete(filePath)

          const retries = (this.unstableRetries.get(filePath) ?? 0) + 1

          if (retries >= MAX_UNSTABLE_RETRIES) {
            this.unstableRetries.delete(filePath)
            this.drainDeferred(filePath)
            logger.warn({ filePath, retries }, 'Dropping unstable file after max retries')
          } else {
            this.unstableRetries.set(filePath, retries)
            this.pendingFilePaths.set(filePath, Date.now())
          }
        }

        this.scheduleFlush(UNSTABLE_RETRY_DELAY_MS)
      }
    } catch (error) {
      // Release all in-flight on unexpected error and drain deferred
      for (const filePath of filePaths) {
        this.releaseInFlight(filePath)
      }
      logger.warn({ error, count: filePaths.length }, 'Incremental import failed')
    }
  }

  /**
   * Release a path from in-flight and re-add any deferred events for it to pending.
   */
  private releaseInFlight(filePath: string): void {
    this.inFlightFilePaths.delete(filePath)
    this.drainDeferred(filePath)
  }

  /**
   * If a path was deferred while in-flight, move it to pending and schedule a flush.
   */
  private drainDeferred(filePath: string): void {
    if (this.deferredFilePaths.delete(filePath)) {
      this.pendingFilePaths.set(filePath, Date.now())
      this.scheduleFlush()
    }
  }

  private requeuePaths(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.pendingFilePaths.set(filePath, Date.now())
    }
  }

  private sendChanged(
    reason: 'track-missing' | 'track-restored' | 'track-relocated',
    trackIds: number[],
    filePaths: string[],
  ): void {
    this.sendToRenderer('library:changed', {
      reason,
      trackIds,
      filePaths,
    })
  }
}
