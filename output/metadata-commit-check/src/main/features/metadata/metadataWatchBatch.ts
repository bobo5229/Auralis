import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { scanFileFingerprint } from '../libraryScan/libraryScanFileFingerprint'
import { normalizeAudioFilePath } from '../audio/playbackFileCoordinator'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import { resolveWatchRefreshPaths, type WatchedFileStat } from './metadataFileChangeFilter'
import type { MetadataWatchImportQueue } from './metadataWatchImportQueue'
import type { MetadataMissingConfirmation } from './metadataMissingConfirmation'
import { isTransientStatError } from './metadataWatchStatErrors'
import type { MetadataWatchState } from './metadataWatchState'

const RETRY_AFTER_ACTIVE_JOB_MS = 5000
const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_STAT_RETRIES = 10

interface KnownWatchEntry extends WatchedFileStat {
  eventPath: string
  resolvedPath: string
}

interface MetadataWatchBatchContext {
  trackRepository: Pick<
    TrackRepository,
    | 'getExistingFilePaths'
    | 'getTrackIdsByPlaybackPath'
    | 'getFilePathById'
    | 'adoptPlaybackPath'
    | 'getFileFingerprintsByFilePaths'
    | 'getTrackIdsByFilePaths'
  >
  metadataRefreshService: Pick<
    MetadataRefreshService,
    'isWritingFile' | 'refreshTracksFromFileChanges'
  >
  importQueue: Pick<MetadataWatchImportQueue, 'deferIfInFlight' | 'importFiles'>
  missingConfirmation: Pick<MetadataMissingConfirmation, 'restorePaths' | 'enqueue'>
  isCurrentPath: (filePath: string) => boolean
  scheduleFlush: (delay?: number) => void
  hasScheduledFlush: () => boolean
}

/** Routes one observed batch through stat, refresh, import and missing confirmation. */
export class MetadataWatchBatch {
  constructor(
    private readonly state: MetadataWatchState,
    private readonly context: MetadataWatchBatchContext,
  ) {}

  async flushPending(selectedPaths?: readonly string[]): Promise<void> {
    if (this.state.flushPaused) {
      return
    }

    const filePaths = selectedPaths ? [...selectedPaths] : [...this.state.pendingFilePaths.keys()]
    for (const path of filePaths) this.state.pendingFilePaths.delete(path)

    if (filePaths.length === 0) {
      return
    }

    // Separate in-flight paths into deferred set
    const incoming: string[] = []

    for (const filePath of filePaths) {
      if (this.context.metadataRefreshService.isWritingFile?.(filePath)) {
        this.state.pendingFilePaths.set(filePath, Date.now())
        this.context.scheduleFlush()
        continue
      }
      if (
        this.context.isCurrentPath(filePath) &&
        !this.context.importQueue.deferIfInFlight(filePath)
      ) {
        incoming.push(filePath)
      }
    }

    if (incoming.length === 0) {
      return
    }

    // Stat all files to determine existence
    const rootsVersion = this.state.rootsVersion
    const statResults = await Promise.allSettled(incoming.map((p) => stat(p)))
    if (this.state.stopped) return
    if (rootsVersion !== this.state.rootsVersion) {
      // Re-observe retained paths; an old stat must not become authoritative
      // after a root has been removed (even if it was subsequently re-added).
      this.requeuePaths(incoming)
      if (this.state.pendingFilePaths.size > 0) this.context.scheduleFlush()
      return
    }
    const { existingEntries, missingPaths } = this.classifyStatResults(incoming, statResults)

    if (existingEntries.length > 0) {
      const newFilePaths = this.reconcileExistingFiles(existingEntries)
      // New tracks: import with relocation matching. Keep the only asynchronous
      // boundary in this phase on the import, after known tracks are reconciled.
      if (newFilePaths.length > 0) {
        await this.context.importQueue.importFiles(newFilePaths)
      }
    }

    // Route missing tracks to confirmation queue
    if (missingPaths.length > 0) {
      for (const filePath of missingPaths) {
        this.context.missingConfirmation.enqueue(filePath)
      }
    }

    // Drop lyrics intent for paths this batch finished. Deferred and
    // requeued (transient stat / refresh defer) paths keep their intent.
    for (const filePath of incoming) {
      if (!this.state.pendingFilePaths.has(filePath)) {
        this.state.pendingLyricsIntentPaths.delete(filePath)
        this.state.pendingArtworkIntentPaths.delete(filePath)
      }
    }
  }

  private classifyStatResults(
    incoming: string[],
    statResults: PromiseSettledResult<Stats>[],
  ): { existingEntries: WatchedFileStat[]; missingPaths: string[] } {
    const existingEntries: WatchedFileStat[] = []
    const missingPaths: string[] = []
    const transientErrorPaths: string[] = []

    for (let i = 0; i < incoming.length; i++) {
      if (this.context.metadataRefreshService.isWritingFile?.(incoming[i])) {
        this.state.pendingFilePaths.set(incoming[i], Date.now())
        this.context.scheduleFlush()
        continue
      }
      const result = statResults[i]

      if (result.status === 'fulfilled' && result.value.isFile()) {
        existingEntries.push({
          filePath: incoming[i],
          ...scanFileFingerprint(result.value),
        })
        this.state.statRetries.delete(incoming[i])
      } else if (result.status === 'rejected' && isTransientStatError(result.reason)) {
        transientErrorPaths.push(incoming[i])
      } else {
        missingPaths.push(incoming[i])
      }
    }

    // Requeue transient errors for retry (with limit)
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.state.statRetries.get(filePath) ?? 0) + 1
        if (retries >= MAX_STAT_RETRIES) {
          this.state.statRetries.delete(filePath)
          logger.warn({ filePath, retries }, 'Dropping file after max stat retries')
        } else {
          this.state.statRetries.set(filePath, retries)
          this.state.pendingFilePaths.set(filePath, Date.now())
        }
      }
      this.context.scheduleFlush(UNSTABLE_RETRY_DELAY_MS)
    }
    return { existingEntries, missingPaths }
  }

  private reconcileExistingFiles(existingEntries: WatchedFileStat[]): string[] {
    const knownEntries: KnownWatchEntry[] = []
    const newFilePaths: string[] = []
    for (const entry of existingEntries) {
      const resolved = this.resolveKnownWatchPaths(entry.filePath)
      if (resolved.length === 0) {
        newFilePaths.push(entry.filePath)
        continue
      }
      for (const resolvedPath of resolved) {
        knownEntries.push({
          ...entry,
          eventPath: entry.filePath,
          resolvedPath,
        })
      }
    }

    // Availability depends on a regular file returning, independently of
    // whether its metadata fingerprint changed or tag writes are suppressed.
    this.context.missingConfirmation.restorePaths(knownEntries.map((entry) => entry.resolvedPath))

    this.refreshKnownEntries(knownEntries)

    return newFilePaths
  }

  private refreshKnownEntries(knownEntries: KnownWatchEntry[]): void {
    // Refresh changed/unknown audio fingerprints and explicit sidecar intent.
    // Ordinary reads leave a verified fingerprint intact and stay on the fast
    // path. Tag-write suppression delays only this metadata decision.
    let suppressionRetryDelay = Infinity
    const refreshCandidates = knownEntries.filter((entry) => {
      if (!this.isRefreshSuppressed(entry.eventPath)) return true
      this.state.pendingFilePaths.set(entry.eventPath, Date.now())
      suppressionRetryDelay = Math.min(
        suppressionRetryDelay,
        this.state.suppressRefreshUntil.get(normalizeAudioFilePath(entry.eventPath))! - Date.now(),
      )
      return false
    })
    if (Number.isFinite(suppressionRetryDelay) && !this.context.hasScheduledFlush()) {
      this.context.scheduleFlush(Math.max(1, suppressionRetryDelay))
    }
    const fingerprints = this.context.trackRepository.getFileFingerprintsByFilePaths(
      refreshCandidates.map((entry) => entry.resolvedPath),
    )
    const changedPaths = resolveWatchRefreshPaths({
      stats: refreshCandidates.map((entry) => ({
        ...scanFileFingerprint(entry),
        filePath: entry.resolvedPath,
      })),
      fingerprints,
      lyricsIntentPaths: refreshCandidates
        .filter((entry) => this.state.pendingLyricsIntentPaths.has(entry.eventPath))
        .map((entry) => entry.resolvedPath),
      artworkIntentPaths: refreshCandidates
        .filter((entry) => this.state.pendingArtworkIntentPaths.has(entry.eventPath))
        .map((entry) => entry.resolvedPath),
    })

    if (changedPaths.length > 0) {
      const trackIds = this.context.trackRepository.getTrackIdsByFilePaths(changedPaths)

      if (trackIds.length > 0) {
        try {
          this.context.metadataRefreshService.refreshTracksFromFileChanges(trackIds)
        } catch (error) {
          this.requeuePaths(changedPaths)
          logger.info(
            { error, count: trackIds.length },
            'Deferring metadata refresh for file changes',
          )
          this.context.scheduleFlush(RETRY_AFTER_ACTIVE_JOB_MS)
        }
      }
    } else if (refreshCandidates.length > 0) {
      logger.debug(
        { count: refreshCandidates.length },
        'Metadata watcher: files unchanged since last scan, skipping refresh',
      )
    }
  }

  private resolveKnownWatchPaths(filePath: string): string[] {
    if (this.context.trackRepository.getExistingFilePaths([filePath]).has(filePath))
      return [filePath]
    const ids = this.context.trackRepository.getTrackIdsByPlaybackPath(filePath)
    if (ids.length === 0) return []
    if (ids.length > 1) {
      return ids
        .map((id) => this.context.trackRepository.getFilePathById(id))
        .filter((stored): stored is string => stored !== null)
    }
    const id = ids[0]
    if (id === undefined) return []
    const stored = this.context.trackRepository.getFilePathById(id)
    if (!stored || stored === filePath) return stored ? [stored] : []
    return this.context.trackRepository.adoptPlaybackPath(id, stored, filePath)
      ? [filePath]
      : [stored]
  }

  private isRefreshSuppressed(filePath: string): boolean {
    const normalizedPath = normalizeAudioFilePath(filePath)
    const until = this.state.suppressRefreshUntil.get(normalizedPath)
    if (until === undefined) {
      return false
    }
    if (Date.now() >= until) {
      this.state.suppressRefreshUntil.delete(normalizedPath)
      return false
    }
    return true
  }

  private requeuePaths(filePaths: string[]): void {
    for (const filePath of filePaths) {
      if (!this.context.isCurrentPath(filePath)) continue
      this.state.pendingFilePaths.set(filePath, Date.now())
    }
  }
}
