import { spawn, type ChildProcess } from 'node:child_process'
import type {
  AmdlDownloadMode,
  AmdlLogEvent,
  AmdlSelectableTrack,
  AmdlSelectionRequest,
  AmdlStage,
  AmdlTaskProgress,
  AmdlTaskState,
} from '@shared/types/amdl'
import { parseAmdlOutputLine, type AmdlCompletionSummary } from './amdlOutputParser'
import { AmdlSelectionParser } from './amdlSelectionParser'
import { LineBuffer } from './lineBuffer'

export interface AmdlCommandConfig {
  distro?: string
  user?: string
  workingDirectory?: string
  command?: string
}

export const DEFAULT_AMDL_CONFIG: Required<AmdlCommandConfig> = {
  distro: 'u22-amdl',
  user: 'root',
  workingDirectory: '/mnt/e/AMDL-WSL2 (ALL IN ONE)/AMDL-WSL/apple-music-downloader',
  command: 'wsl.exe',
}

export type SpawnFactory = (command: string, args: readonly string[]) => ChildProcess

export function buildWslAmdlArgs(
  url: string,
  config: Required<AmdlCommandConfig> = DEFAULT_AMDL_CONFIG,
  mode: AmdlDownloadMode = 'direct',
): string[] {
  const flags = mode === 'select' ? '--aac --select' : '--aac'
  const bashScript = 'cd "' + config.workingDirectory + '" && go run main.go ' + flags + ' "$1"'
  return [
    '-d',
    config.distro,
    '-u',
    config.user,
    '-e',
    'bash',
    '-lic',
    bashScript,
    'auralis-amdl',
    url,
  ]
}

export interface AmdlRunnerOptions {
  taskId: string
  url: string
  mode?: AmdlDownloadMode
  config?: AmdlCommandConfig
  spawnProcess?: SpawnFactory
  onProgress: (progress: AmdlTaskProgress) => void
  onLog?: (event: AmdlLogEvent) => void
  onSelectionRequest?: (request: AmdlSelectionRequest) => void
}

export class AmdlCommandRunner {
  private readonly taskId: string
  private readonly url: string
  private readonly mode: AmdlDownloadMode
  private readonly config: Required<AmdlCommandConfig>
  private readonly spawnProcess: SpawnFactory
  private readonly onProgress: (progress: AmdlTaskProgress) => void
  private readonly onLog?: (event: AmdlLogEvent) => void
  private readonly onSelectionRequest?: (request: AmdlSelectionRequest) => void

  private childProcess: ChildProcess | null = null
  private cancelRequested = false
  private terminalSettled = false
  private alreadyExistsObserved = false
  private completionSummary: AmdlCompletionSummary | null = null
  private currentState: AmdlTaskState = 'starting'
  private currentStage: AmdlStage = 'launching'
  private lastMessage: string | null = null
  private lastError: string | null = null
  private startedAtIso: string
  private finishedAtIso: string | null = null

  private selectionPending = false
  private selectionPromptEmitted = false
  private selectableTracks: readonly AmdlSelectableTrack[] = []
  private selectionParser = new AmdlSelectionParser()

  private stdoutBuffer = new LineBuffer()
  private stderrBuffer = new LineBuffer()

  constructor(options: AmdlRunnerOptions) {
    this.taskId = options.taskId
    this.url = options.url
    this.mode = options.mode ?? 'direct'
    this.config = { ...DEFAULT_AMDL_CONFIG, ...options.config }
    this.spawnProcess = options.spawnProcess ?? ((cmd, args) => spawn(cmd, args))
    this.onProgress = options.onProgress
    this.onLog = options.onLog
    this.onSelectionRequest = options.onSelectionRequest
    this.startedAtIso = new Date().toISOString()
  }

  getProgress(): AmdlTaskProgress {
    return {
      taskId: this.taskId,
      url: this.url,
      state: this.currentState,
      stage: this.currentStage,
      alreadyExists: this.alreadyExistsObserved,
      message: this.lastMessage,
      error: this.lastError,
      startedAt: this.startedAtIso,
      finishedAt: this.finishedAtIso,
    }
  }

  start(): void {
    if (this.childProcess !== null || this.terminalSettled) {
      return
    }

    const args = buildWslAmdlArgs(this.url, this.config, this.mode)
    let child: ChildProcess
    try {
      child = this.spawnProcess(this.config.command, args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.settleTerminal('failed', null, msg)
      return
    }

    this.childProcess = child
    this.currentState = 'running'
    this.currentStage = 'launching'
    this.emitProgress()

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer | string) => {
        const lines = this.stdoutBuffer.push(chunk)
        for (const line of lines) {
          this.handleStdoutLine(line)
        }
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer | string) => {
        const lines = this.stderrBuffer.push(chunk)
        for (const line of lines) {
          this.handleStderrLine(line)
        }
      })
    }

    child.on('error', (err: Error) => {
      if (this.terminalSettled) return
      if (this.cancelRequested) {
        this.settleTerminal('cancelled', null, err.message)
      } else {
        this.settleTerminal('failed', null, err.message)
      }
    })

    child.on('close', (code: number | null) => {
      // Flush residual lines
      const flushedStdout = this.stdoutBuffer.flush()
      for (const line of flushedStdout) {
        this.handleStdoutLine(line)
      }
      const flushedStderr = this.stderrBuffer.flush()
      for (const line of flushedStderr) {
        this.handleStderrLine(line)
      }

      if (this.terminalSettled) {
        return
      }

      // 1. cancelRequested -> cancelled
      if (this.cancelRequested) {
        this.settleTerminal('cancelled', null, this.lastError)
        return
      }

      // 2. exitCode !== 0 -> failed
      if (code !== 0) {
        const exitMsg = 'Process exited with code ' + (code ?? 'unknown')
        this.settleTerminal('failed', null, this.lastError ?? exitMsg)
        return
      }

      // 3. Missing completionSummary -> failed
      if (!this.completionSummary) {
        this.settleTerminal(
          'failed',
          null,
          this.lastError ?? 'AMDL exited without a completion summary.',
        )
        return
      }

      // 4. completionSummary.errors > 0 -> failed
      if (this.completionSummary.errors > 0) {
        this.settleTerminal(
          'failed',
          null,
          this.lastError ?? 'AMDL reported errors in its completion summary.',
        )
        return
      }

      // 5. total <= 0 or completed <= 0 -> failed
      if (this.completionSummary.total <= 0 || this.completionSummary.completed <= 0) {
        this.settleTerminal(
          'failed',
          null,
          this.lastError ?? 'AMDL completed without a successful download.',
        )
        return
      }

      // 6. completed !== total -> failed
      if (this.completionSummary.completed !== this.completionSummary.total) {
        this.settleTerminal('failed', null, this.lastError ?? 'AMDL did not complete all tracks.')
        return
      }

      // 7. Otherwise -> already-exists or completed
      if (this.alreadyExistsObserved) {
        this.settleTerminal('already-exists', null, null)
      } else {
        this.settleTerminal('completed', null, null)
      }
    })
  }

  cancel(): boolean {
    if (this.terminalSettled || this.cancelRequested) {
      return false
    }

    this.cancelRequested = true
    this.selectionPending = false
    this.lastMessage = 'Cancellation requested'
    this.emitProgress()

    if (this.childProcess) {
      try {
        this.childProcess.kill()
      } catch {
        // Kill failed or already dead
      }
    }

    return true
  }

  submitSelection(trackIndexes: number[]): { ok: boolean; error?: string } {
    if (this.terminalSettled) {
      return { ok: false, error: 'Task has already settled.' }
    }
    if (this.currentState !== 'running') {
      return { ok: false, error: 'Task is not running.' }
    }
    if (this.currentStage !== 'selecting' || !this.selectionPending) {
      return { ok: false, error: 'Task is not waiting for track selection.' }
    }
    if (!Array.isArray(trackIndexes) || trackIndexes.length === 0) {
      return { ok: false, error: 'Track selection cannot be empty.' }
    }

    const availableIndexes = new Set(this.selectableTracks.map((t) => t.index))
    const uniqueNormalized: number[] = []
    const seen = new Set<number>()

    for (const idx of trackIndexes) {
      if (!Number.isInteger(idx) || idx <= 0) {
        return { ok: false, error: 'Invalid track index: ' + idx }
      }
      if (!availableIndexes.has(idx)) {
        return { ok: false, error: 'Track index not found in selectable tracks: ' + idx }
      }
      if (!seen.has(idx)) {
        seen.add(idx)
        uniqueNormalized.push(idx)
      }
    }

    if (!this.childProcess || !this.childProcess.stdin || !this.childProcess.stdin.writable) {
      return { ok: false, error: 'Child process stdin is not writable.' }
    }

    const inputPayload = uniqueNormalized.join(',') + '\n'
    try {
      this.childProcess.stdin.write(inputPayload)
      this.selectionPending = false
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: 'Failed to write selection to stdin: ' + msg }
    }
  }

  private handleStdoutLine(line: string): void {
    if (this.terminalSettled) return

    const trimmed = line.trim()
    if (trimmed) {
      this.onLog?.({
        taskId: this.taskId,
        stream: 'stdout',
        line: trimmed,
      })
    }

    // Feed to selection parser
    const selectionRes = this.selectionParser.feedLine(line)
    if (
      selectionRes.selectionRequested &&
      !this.selectionPromptEmitted &&
      selectionRes.tracks.length > 0
    ) {
      this.selectionPromptEmitted = true
      this.selectionPending = true
      this.selectableTracks = [...selectionRes.tracks]
      this.currentStage = 'selecting'
      this.emitProgress()
      this.onSelectionRequest?.({
        taskId: this.taskId,
        tracks: [...selectionRes.tracks],
      })
      return
    }

    const parsed = parseAmdlOutputLine(line)

    let changed = false
    if (parsed.completionSummary) {
      this.completionSummary = parsed.completionSummary
    }
    if (parsed.alreadyExists) {
      this.alreadyExistsObserved = true
      changed = true
    }
    if (parsed.stage) {
      this.currentStage = parsed.stage
      changed = true
    }
    if (parsed.message) {
      this.lastMessage = parsed.message
      changed = true
    }

    if (changed) {
      this.emitProgress()
    }
  }

  private handleStderrLine(line: string): void {
    if (this.terminalSettled) return
    const trimmed = line.trim()
    if (!trimmed) return

    this.onLog?.({
      taskId: this.taskId,
      stream: 'stderr',
      line: trimmed,
    })

    // Record as lastError if significant, but don't fail immediately until exit
    this.lastError = trimmed
  }

  private settleTerminal(
    state: 'completed' | 'already-exists' | 'failed' | 'cancelled',
    stage: AmdlStage,
    error: string | null,
  ): void {
    if (this.terminalSettled) {
      return
    }

    this.terminalSettled = true
    this.selectionPending = false
    this.currentState = state
    this.currentStage = stage
    if (error !== null) {
      this.lastError = error
    }
    this.finishedAtIso = new Date().toISOString()
    this.emitProgress()
  }

  private emitProgress(): void {
    this.onProgress(this.getProgress())
  }
}
