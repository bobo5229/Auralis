import { stat } from 'node:fs/promises'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import { logger } from '@main/logging/logger'
import { isTransientStatError } from './metadataWatchStatErrors'

const MISSING_CONFIRM_DELAY_MS = 5000
const MAX_STAT_RETRIES = 10

interface ConfirmationLifecycle {
  isStopped: () => boolean
  isPaused: () => boolean
  runOperation: (operation: () => Promise<void>) => void
}

export class MetadataMissingConfirmation {
  private readonly pendingMissingFilePaths = new Map<string, number>()
  private missingConfirmationTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly trackRepository: TrackRepository,
    private readonly statRetries: Map<string, number>,
    private readonly sendToRenderer: RendererEventSender,
    private readonly lifecycle: ConfirmationLifecycle,
  ) {}

  pause(): void {
    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer)
      this.missingConfirmationTimer = null
    }
  }

  clear(): void {
    this.pendingMissingFilePaths.clear()
  }

  resume(): void {
    if (this.pendingMissingFilePaths.size > 0) this.schedule()
  }

  enqueue(filePath: string): void {
    this.pendingMissingFilePaths.set(filePath, Date.now())
    this.schedule()
  }

  schedule(): void {
    if (this.lifecycle.isStopped() || this.lifecycle.isPaused()) {
      return
    }

    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer)
    }
    this.missingConfirmationTimer = setTimeout(() => {
      this.missingConfirmationTimer = null
      this.lifecycle.runOperation(() => this.confirmMissing())
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
    if (this.lifecycle.isStopped()) return
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
          this.enqueue(filePath)
        }
      }
    }

    // Handle restored files
    if (restoredPaths.length > 0) {
      const restoredIds = this.trackRepository.markAvailableByFilePaths(restoredPaths)

      if (restoredIds.length > 0) {
        this.sendChanged('track-restored', restoredIds, restoredPaths)
      }
    }

    // Handle confirmed missing files
    if (confirmedMissing.length > 0) {
      const missingIds = this.trackRepository.markMissingByFilePaths(confirmedMissing)

      if (missingIds.length > 0) {
        this.sendChanged('track-missing', missingIds, confirmedMissing)
      }
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
