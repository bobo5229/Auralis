import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { parseFile } from 'music-metadata'
import { isSupportedAudioFile } from '@main/features/libraryScan/audioFileFilter'
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

const WATCH_DEBOUNCE_MS = 1200
const RETRY_AFTER_ACTIVE_JOB_MS = 5000
const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_UNSTABLE_RETRIES = 40 // ~2 min total (40 * 3s)
const MISSING_CONFIRM_DELAY_MS = 5000
const RELOCATION_WINDOW_MS = 60000

export class MetadataWatchService {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly pendingFilePaths = new Map<string, number>()
  private readonly unstableRetries = new Map<string, number>()
  private readonly inFlightFilePaths = new Set<string>()
  private readonly deferredFilePaths = new Set<string>()
  private readonly pendingMissingFilePaths = new Map<string, number>()
  private readonly recentMissingCandidates = new Map<number, MissingTrackCandidate>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

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

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
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
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushPending()
    }, delay)
  }

  private async flushPending(): Promise<void> {
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

    for (let i = 0; i < incoming.length; i++) {
      const result = statResults[i]

      if (result.status === 'fulfilled') {
        existingPaths.push(incoming[i])
      } else {
        missingPaths.push(incoming[i])
      }
    }

    // Route existing tracks
    if (existingPaths.length > 0) {
      const knownPaths = this.trackRepository.getExistingFilePaths(existingPaths)
      const knownFilePaths = existingPaths.filter((p) => knownPaths.has(p))
      const newFilePaths = existingPaths.filter((p) => !knownPaths.has(p))

      // Known tracks: metadata refresh
      if (knownFilePaths.length > 0) {
        const trackIds = this.trackRepository.getTrackIdsByFilePaths(knownFilePaths)

        if (trackIds.length > 0) {
          try {
            this.metadataRefreshService.refreshTracksFromFileChanges(trackIds)
          } catch (error) {
            this.requeuePaths(knownFilePaths)
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
        this.importWithRelocationMatch(newFilePaths)
      }
    }

    // Route missing tracks to confirmation queue
    if (missingPaths.length > 0) {
      for (const filePath of missingPaths) {
        this.pendingMissingFilePaths.set(filePath, Date.now())
      }
      this.scheduleMissingConfirmation()
    }
  }

  private scheduleMissingConfirmation(): void {
    setTimeout(() => {
      this.confirmMissing()
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

    for (let i = 0; i < filePaths.length; i++) {
      if (statResults[i].status === 'fulfilled') {
        restoredPaths.push(filePaths[i])
      } else {
        confirmedMissing.push(filePaths[i])
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
      this.importWithRetry(unmatchedPaths)
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
      const normalized = normalizeMetadata(metadata)
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
        genre: normalized.genre,
        artworkCacheKey: null,
        lyricsText: normalized.lyricsText,
        lyricsFormat: normalized.lyricsFormat,
        isrc: identity.isrc,
        metadataSignature: signature,
      }

      if (identity.isrc) {
        for (const candidate of this.recentMissingCandidates.values()) {
          if (candidate.isrc === identity.isrc) {
            this.trackRepository.relocateTrack(candidate.trackId, scannedTrack)
            return candidate
          }
        }
      }

      for (const candidate of this.recentMissingCandidates.values()) {
        if (candidate.isrc) continue
        if (candidate.title !== identity.title) continue
        if (candidate.artist !== identity.artist) continue

        if (!candidate.durationSeconds || !normalized.durationSeconds) continue
        if (Math.abs(candidate.durationSeconds - normalized.durationSeconds) > 1) continue
        if (!candidate.fileSize) continue
        if (Math.abs(candidate.fileSize - fileStat.size) / candidate.fileSize > 0.02) continue

        const albumMatch =
          candidate.album === normalized.album ||
          !candidate.album ||
          !normalized.album ||
          candidate.album === 'Unknown Album' ||
          normalized.album === 'Unknown Album'

        if (!albumMatch) continue

        this.trackRepository.relocateTrack(candidate.trackId, scannedTrack)
        return candidate
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
