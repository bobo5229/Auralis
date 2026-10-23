import { normalize, win32 } from 'node:path'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import { collectAudioFiles } from '../libraryScan/libraryScanInventory'
import { getLyricsSidecarFingerprint } from './resolveLyricsForFile'
import type { MetadataWatchState } from './metadataWatchState'

const RECOVERY_BATCH_SIZE = 128

interface WatchRecovery {
  isCurrent: () => boolean
  retryAttempt: number
  retryTimer: ReturnType<typeof setTimeout> | null
}

interface MetadataWatchRecoveryContext {
  trackRepository: Pick<TrackRepository, 'getWatchRecoveryTracks'>
  runOperation: (operation: () => Promise<void>) => void
  flushPending: (selectedPaths: readonly string[]) => Promise<void>
}

/** Reconciles watcher gaps, retaining the current watcher's recovery and retry timer. */
export class MetadataWatchRecovery {
  private readonly pendingRecoveries = new Map<string, WatchRecovery>()

  constructor(
    private readonly state: MetadataWatchState,
    private readonly context: MetadataWatchRecoveryContext,
  ) {}

  enqueue(rootPath: string, isCurrent: () => boolean): void {
    this.clearRecoveryTimer(this.pendingRecoveries.get(rootPath))
    this.pendingRecoveries.set(rootPath, { isCurrent, retryAttempt: 0, retryTimer: null })
    this.resume()
  }

  pause(): void {
    for (const recovery of this.pendingRecoveries.values()) this.clearRecoveryTimer(recovery)
  }

  clear(): void {
    this.pause()
    this.pendingRecoveries.clear()
  }

  pruneInactiveRoots(): void {
    for (const [root, recovery] of this.pendingRecoveries) {
      if (!recovery.isCurrent()) {
        this.clearRecoveryTimer(recovery)
        this.pendingRecoveries.delete(root)
      }
    }
  }

  resume(): void {
    if (this.state.stopped || this.state.flushPaused) return
    for (const [root, recovery] of this.pendingRecoveries) {
      if (recovery.retryTimer) continue
      this.pendingRecoveries.delete(root)
      if (recovery.isCurrent())
        this.context.runOperation(() => this.reconcileRecoveredRoot(root, recovery))
    }
  }

  private clearRecoveryTimer(recovery: WatchRecovery | undefined): void {
    if (recovery?.retryTimer) clearTimeout(recovery.retryTimer)
    if (recovery) recovery.retryTimer = null
  }

  private async reconcileRecoveredRoot(root: string, recovery: WatchRecovery): Promise<void> {
    const canContinue = () => !this.state.stopped && !this.state.flushPaused && recovery.isCurrent()
    let needsRetry = false
    try {
      // Install the new watcher first, then reconcile the gap. Reuse the normal
      // fingerprint, tag-write suppression, import and missing-confirmation paths.
      const files = await collectAudioFiles(
        root,
        (directory) => {
          needsRetry = true
          logger.warn({ directory }, 'Unable to read directory during metadata watch recovery')
        },
        canContinue,
      )
      if (!canContinue()) return
      const known = this.context.trackRepository.getWatchRecoveryTracks(root)
      const pathKey = (path: string) => win32.normalize(path).toLowerCase()
      const knownByPath = new Map(known.map((track) => [pathKey(track.filePath), track]))
      const paths = new Map(files.map((path) => [pathKey(path), path]))
      for (const track of known) paths.set(pathKey(track.filePath), normalize(track.filePath))
      const candidates = [...paths.values()]
      for (let offset = 0; offset < candidates.length; offset += RECOVERY_BATCH_SIZE) {
        if (!canContinue()) return
        const batch = candidates.slice(offset, offset + RECOVERY_BATCH_SIZE)
        const lyricsChanged = await Promise.all(
          batch.map(async (path) => {
            const track = knownByPath.get(pathKey(path))
            if (!track) return false
            try {
              return (await getLyricsSidecarFingerprint(path)) !== track.lyricsSidecarFingerprint
            } catch (error) {
              needsRetry = true
              logger.warn(
                { error, filePath: path },
                'Unable to check lyrics during metadata watch recovery',
              )
              return false
            }
          }),
        )
        if (!canContinue()) return
        for (const [index, path] of batch.entries()) {
          this.state.pendingFilePaths.set(path, Date.now())
          if (lyricsChanged[index]) this.state.pendingLyricsIntentPaths.add(path)
        }
        await this.context.flushPending(batch)
      }
    } catch (error) {
      needsRetry = true
      throw error
    } finally {
      // A full scan/root transition owns the write barrier. Resume a current
      // recovery afterwards; a removed or superseded watcher cannot restart it.
      if (!this.state.stopped && recovery.isCurrent() && (this.state.flushPaused || needsRetry)) {
        this.pendingRecoveries.set(root, recovery)
        if (!this.state.flushPaused) {
          const delay = Math.min(1000 * 2 ** Math.min(recovery.retryAttempt, 5), 30000)
          recovery.retryAttempt += 1
          recovery.retryTimer = setTimeout(() => {
            recovery.retryTimer = null
            if (this.pendingRecoveries.get(root) === recovery) this.resume()
          }, delay)
          recovery.retryTimer.unref()
        }
      }
    }
  }
}
