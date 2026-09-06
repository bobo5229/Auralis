import { randomUUID } from 'node:crypto'
import type { AmdlTaskProgress } from '@shared/types/amdl'
import { AmdlCommandRunner, type AmdlCommandConfig, type SpawnFactory } from './amdlCommandRunner'
import { validateAppleMusicUrl } from './amdlUrlValidator'

export interface AmdlDownloadServiceOptions {
  config?: AmdlCommandConfig
  spawnProcess?: SpawnFactory
  onProgress?: (progress: AmdlTaskProgress) => void
}

export class AmdlDownloadService {
  private activeRunner: AmdlCommandRunner | null = null
  private activeTaskId: string | null = null
  private readonly config?: AmdlCommandConfig
  private readonly spawnProcess?: SpawnFactory
  private readonly onProgressCallback?: (progress: AmdlTaskProgress) => void

  constructor(options: AmdlDownloadServiceOptions = {}) {
    this.config = options.config
    this.spawnProcess = options.spawnProcess
    this.onProgressCallback = options.onProgress
  }

  isDownloadActive(): boolean {
    if (!this.activeRunner) return false
    const state = this.activeRunner.getProgress().state
    return state === 'starting' || state === 'running'
  }

  getActiveProgress(): AmdlTaskProgress | null {
    return this.activeRunner ? this.activeRunner.getProgress() : null
  }

  startDownload(rawUrl: string): { ok: boolean; taskId?: string; error?: string } {
    if (this.isDownloadActive()) {
      return {
        ok: false,
        error: 'Another download task is currently active',
      }
    }

    const validation = validateAppleMusicUrl(rawUrl)
    if (!validation.valid || !validation.normalizedUrl) {
      return {
        ok: false,
        error: validation.error ?? 'Invalid Apple Music URL',
      }
    }

    const taskId = randomUUID()
    const runner = new AmdlCommandRunner({
      taskId,
      url: validation.normalizedUrl,
      config: this.config,
      spawnProcess: this.spawnProcess,
      onProgress: (progress) => {
        this.onProgressCallback?.(progress)
      },
    })

    this.activeTaskId = taskId
    this.activeRunner = runner
    runner.start()

    return { ok: true, taskId }
  }

  cancelDownload(taskId: string): { ok: boolean; error?: string } {
    if (!this.activeRunner || this.activeTaskId !== taskId) {
      return { ok: false, error: 'Task not found or not active' }
    }

    const cancelled = this.activeRunner.cancel()
    return { ok: cancelled }
  }
}
