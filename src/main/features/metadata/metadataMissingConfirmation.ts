import type { TrackRepository } from '@main/repositories/trackRepository'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import { logger } from '@main/logging/logger'
import { isTransientStatError } from './metadataWatchStatErrors'
import { WATCH_STAT_BATCH_SIZE, type MetadataWatchStatBudget } from './metadataWatchStatBudget'
import { statSync } from 'node:fs'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'

const MISSING_CONFIRM_DELAY_MS = 5000
const MAX_STAT_RETRIES = 10

interface ConfirmationLifecycle {
  isStopped: () => boolean
  isPaused: () => boolean
  isPathActive: (filePath: string) => boolean
  runOperation: (operation: () => Promise<void>) => void
  rootsVersion: () => number
}

export class MetadataMissingConfirmation {
  private readonly pendingMissingFilePaths = new Map<string, symbol>()
  private confirming = false
  private missingConfirmationTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly trackRepository: TrackRepository,
    private readonly statRetries: Map<string, number>,
    private readonly libraryChanged: (event: LibraryChangedEvent) => void,
    private readonly lifecycle: ConfirmationLifecycle,
    private readonly statBudget: MetadataWatchStatBudget,
    private readonly writeAdmission?: DatabaseWriteAdmission,
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

  pruneInactivePaths(): void {
    for (const filePath of this.pendingMissingFilePaths.keys()) {
      if (!this.lifecycle.isPathActive(filePath)) this.pendingMissingFilePaths.delete(filePath)
    }
    if (this.pendingMissingFilePaths.size === 0) this.pause()
  }

  resume(): void {
    if (this.pendingMissingFilePaths.size > 0) this.schedule()
  }

  enqueue(filePath: string): void {
    if (!this.lifecycle.isPathActive(filePath)) return
    this.pendingMissingFilePaths.set(filePath, Symbol())
    this.schedule()
  }

  /** Restore paths whose latest stat has confirmed a regular audio file. */
  restorePaths(filePaths: string[]): void {
    filePaths = filePaths.filter((filePath) => this.lifecycle.isPathActive(filePath))
    if (filePaths.length === 0) return
    for (const filePath of filePaths) {
      this.pendingMissingFilePaths.delete(filePath)
      this.statRetries.delete(filePath)
    }
    const restoredIds = this.trackRepository.markAvailableByFilePaths(filePaths)
    if (restoredIds.length > 0) {
      this.sendChanged('track-restored', restoredIds, filePaths)
    }
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
    if (this.confirming) return
    this.confirming = true
    try {
      const entries = [...this.pendingMissingFilePaths.entries()]
      for (let offset = 0; offset < entries.length; offset += WATCH_STAT_BATCH_SIZE) {
        if (this.lifecycle.isStopped() || this.lifecycle.isPaused()) return
        const batch = entries.slice(offset, offset + WATCH_STAT_BATCH_SIZE)
        const rootsVersion = this.lifecycle.rootsVersion()
        const canRun = () =>
          !this.lifecycle.isStopped() &&
          !this.lifecycle.isPaused() &&
          this.lifecycle.rootsVersion() === rootsVersion
        const results = await this.statBudget.settle(
          batch.map(([path]) => path),
          canRun,
        )
        if (this.lifecycle.isStopped() || this.lifecycle.rootsVersion() !== rootsVersion) return
        const commit = () => {
          if (this.lifecycle.isStopped() || this.lifecycle.rootsVersion() !== rootsVersion) return
          const confirmedMissing: string[] = []
          const restoredPaths: string[] = []
          const transientErrorPaths: string[] = []
          for (let index = 0; index < batch.length; index++) {
            const [filePath, token] = batch[index]
            let result = results[index]
            if (!result || this.pendingMissingFilePaths.get(filePath) !== token) continue
            if (this.writeAdmission) {
              try {
                result = { status: 'fulfilled', value: statSync(filePath) }
              } catch (reason) {
                result = { status: 'rejected', reason }
              }
            }
            this.pendingMissingFilePaths.delete(filePath)
            if (!this.lifecycle.isPathActive(filePath)) continue
            if (result.status === 'fulfilled' && result.value.isFile()) {
              restoredPaths.push(filePath)
              this.statRetries.delete(filePath)
            } else if (result.status === 'rejected' && isTransientStatError(result.reason)) {
              transientErrorPaths.push(filePath)
            } else {
              confirmedMissing.push(filePath)
            }
          }
          for (const filePath of transientErrorPaths) {
            const retries = (this.statRetries.get(filePath) ?? 0) + 1
            if (retries >= MAX_STAT_RETRIES) {
              this.statRetries.delete(filePath)
              logger.warn(
                { filePath, retries },
                'Dropping file after max stat retries (confirm phase)',
              )
            } else {
              this.statRetries.set(filePath, retries)
              this.enqueue(filePath)
            }
          }
          if (restoredPaths.length) this.restorePaths(restoredPaths)
          if (confirmedMissing.length) {
            const missingIds = this.trackRepository.markMissingByFilePaths(confirmedMissing)
            if (missingIds.length) this.sendChanged('track-missing', missingIds, confirmedMissing)
          }
        }
        if (this.writeAdmission) await this.writeAdmission.runWrite(commit)
        else commit()
      }
    } finally {
      this.confirming = false
      if (this.pendingMissingFilePaths.size && !this.missingConfirmationTimer) this.schedule()
    }
  }

  private sendChanged(
    reason: 'track-missing' | 'track-restored' | 'track-relocated',
    trackIds: number[],
    filePaths: string[],
  ): void {
    this.libraryChanged({
      reason,
      trackIds,
      filePaths,
    })
  }
}
